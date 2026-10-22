<?php
declare(strict_types=1);

session_start();
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/includes/Storage.php';
require_once __DIR__ . '/includes/DiceRoller.php';

$storage = new Storage(__DIR__ . '/data');
$uploadsDir = __DIR__ . '/uploads';
if (!is_dir($uploadsDir)) {
    mkdir($uploadsDir, 0775, true);
}

function respond(array $payload, int $status = 200): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function getJsonInput(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function getCurrentUser(Storage $storage): ?array {
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    $user = $storage->getUserById((int)$_SESSION['user_id']);
    if (!$user) {
        unset($_SESSION['user_id'], $_SESSION['active_role']);
        return null;
    }
    return $user;
}

/**
 * Normalizes single or multi-file $_FILES entries for any of the given field names
 * into a flat array of ['name' => ..., 'type' => ..., 'tmp_name' => ..., 'error' => ..., 'size' => ...].
 */
function extractUploadedFileList(array $keys): array {
    $files = [];
    foreach ($keys as $key) {
        if (empty($_FILES[$key])) {
            continue;
        }
        $entry = $_FILES[$key];
        if (is_array($entry['name'])) {
            $count = count($entry['name']);
            for ($i = 0; $i < $count; $i++) {
                if (($entry['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
                    continue;
                }
                $files[] = [
                    'name'     => $entry['name'][$i] ?? '',
                    'type'     => $entry['type'][$i] ?? '',
                    'tmp_name' => $entry['tmp_name'][$i] ?? '',
                    'error'    => $entry['error'][$i] ?? -1,
                    'size'     => $entry['size'][$i] ?? 0,
                ];
            }
        } else {
            if (($entry['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
                continue;
            }
            $files[] = $entry;
        }
    }
    return $files;
}

function getUploadErrorMessage(int $errorCode): string {
    switch ($errorCode) {
        case UPLOAD_ERR_INI_SIZE:
            return 'File exceeds the server upload limit (upload_max_filesize: ' . ini_get('upload_max_filesize') . ')';
        case UPLOAD_ERR_FORM_SIZE:
            return 'File exceeds the maximum form file size';
        case UPLOAD_ERR_PARTIAL:
            return 'File upload was aborted or only partially uploaded';
        case UPLOAD_ERR_NO_FILE:
            return 'No file was uploaded';
        case UPLOAD_ERR_NO_TMP_DIR:
            return 'Missing temporary directory on the server';
        case UPLOAD_ERR_CANT_WRITE:
            return 'Server failed to write file to disk';
        case UPLOAD_ERR_EXTENSION:
            return 'A PHP extension stopped the file upload';
        default:
            return 'Upload error code ' . $errorCode;
    }
}

function handlePreviewImageUpload(string $uploadsDir, string $fieldName = 'preview_image'): ?string {
    if (empty($_FILES[$fieldName]) || $_FILES[$fieldName]['error'] === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    $file = $_FILES[$fieldName];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        throw new InvalidArgumentException("Cover image upload failed (code {$file['error']}).");
    }
    if ($file['size'] > 10 * 1024 * 1024) {
        throw new InvalidArgumentException('Cover image file size must be under 10 MB.');
    }
    $allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
    $origName = basename((string)$file['name']);
    $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
    if (!in_array($ext, $allowedExts, true)) {
        throw new InvalidArgumentException('Allowed cover image formats: PNG, JPG, GIF, WEBP, SVG.');
    }
    $safeFilename = 'cover_' . bin2hex(random_bytes(8)) . '.' . $ext;
    $destPath = $uploadsDir . '/' . $safeFilename;
    if (!move_uploaded_file($file['tmp_name'], $destPath)) {
        throw new RuntimeException('Could not save cover image on server.');
    }
    return 'uploads/' . $safeFilename;
}

function generatePdfCover(string $pdfAbsPath, string $uploadsDir, string $coverBaseName): ?string {
    if (!file_exists($pdfAbsPath)) {
        return null;
    }
    $prefix = $uploadsDir . '/cover_' . $coverBaseName;

    $pdftoppm = '/usr/bin/pdftoppm';
    if (!file_exists($pdftoppm)) {
        $pdftoppm = trim((string)@shell_exec('which pdftoppm'));
    }

    if ($pdftoppm && is_executable($pdftoppm)) {
        $cmd = escapeshellcmd($pdftoppm) . ' -png -f 1 -l 1 -scale-to 400 ' . escapeshellarg($pdfAbsPath) . ' ' . escapeshellarg($prefix) . ' 2>&1';
        exec($cmd, $output, $ret);
        if ($ret === 0) {
            $matches = glob($prefix . '-*.png');
            if (!empty($matches)) {
                $targetFile = $prefix . '.png';
                if ($matches[0] !== $targetFile) {
                    @rename($matches[0], $targetFile);
                }
                for ($i = 1; $i < count($matches); $i++) {
                    @unlink($matches[$i]);
                }
                return 'uploads/' . basename($targetFile);
            }
        }
    }

    $convert = '/usr/bin/convert';
    if (file_exists($convert)) {
        $targetFile = $prefix . '.png';
        $cmd = escapeshellcmd($convert) . ' -density 150 ' . escapeshellarg($pdfAbsPath . '[0]') . ' -resize 400x ' . escapeshellarg($targetFile) . ' 2>&1';
        exec($cmd, $output, $ret);
        if ($ret === 0 && file_exists($targetFile)) {
            return 'uploads/' . basename($targetFile);
        }
    }

    return null;
}

function ensurePdfCovers(Storage $storage, array $pdfs, string $uploadsDir): array {
    $updated = [];
    foreach ($pdfs as $pdf) {
        if (empty($pdf['cover_image']) && !empty($pdf['filename'])) {
            $absPath = __DIR__ . '/' . ltrim($pdf['filename'], '/\\');
            if (file_exists($absPath)) {
                $base = pathinfo($pdf['filename'], PATHINFO_FILENAME);
                $cover = generatePdfCover($absPath, $uploadsDir, $base);
                if ($cover) {
                    $pdf = $storage->updatePdf($pdf['id'], ['cover_image' => $cover]) ?: $pdf;
                }
            }
        }
        $updated[] = $pdf;
    }
    return $updated;
}

// Detect when PHP completely dropped POST data due to post_max_size on file/form uploads
$contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
$isFormUpload = (str_contains($contentType, 'multipart/form-data') || str_contains($contentType, 'application/x-www-form-urlencoded'));
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $isFormUpload && empty($_POST) && empty($_FILES) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    $postMax = ini_get('post_max_size') ?: 'unknown';
    $contentLen = (int)$_SERVER['CONTENT_LENGTH'];
    $contentMb = round($contentLen / 1048576, 1);
    respond([
        'ok' => false,
        'error' => "The uploaded file or payload ({$contentMb} MB) exceeds the server limit (post_max_size is {$postMax})."
    ], 413);
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$input = getJsonInput();
if ($action === '' && isset($input['action'])) {
    $action = (string)$input['action'];
}

try {
    switch ($action) {
        case 'status': {
            $needsSetup = !$storage->hasAdmin();
            $user = $needsSetup ? null : getCurrentUser($storage);
            respond([
                'ok' => true,
                'needs_admin_setup' => $needsSetup,
                'user' => $user,
            ]);
        }

        case 'setup_admin': {
            if ($storage->hasAdmin()) {
                respond(['ok' => false, 'error' => 'Admin account has already been initialized.'], 400);
            }
            $username = trim((string)($input['username'] ?? ''));
            $email = trim((string)($input['email'] ?? ''));
            $password = (string)($input['password'] ?? '');

            if (strlen($username) < 2 || strlen($username) > 32 || !preg_match('/^[a-zA-Z0-9_\-]+$/', $username)) {
                respond(['ok' => false, 'error' => 'Username must be 2-32 characters (letters, numbers, _, -).'], 400);
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                respond(['ok' => false, 'error' => 'Please enter a valid email address.'], 400);
            }
            if (strlen($password) < 6) {
                respond(['ok' => false, 'error' => 'Password must be at least 6 characters long.'], 400);
            }

            $user = $storage->createUser($username, $email, $password, true, true);
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['active_role'] = 'gm';
            $user['active_role'] = 'gm';

            respond(['ok' => true, 'user' => $user]);
        }

        case 'signup': {
            if (!$storage->hasAdmin()) {
                respond(['ok' => false, 'error' => 'Initial admin setup must be completed first.'], 400);
            }
            $username = trim((string)($input['username'] ?? ''));
            $email = trim((string)($input['email'] ?? ''));
            $password = (string)($input['password'] ?? '');

            if (strlen($username) < 2 || strlen($username) > 32 || !preg_match('/^[a-zA-Z0-9_\-]+$/', $username)) {
                respond(['ok' => false, 'error' => 'Username must be 2-32 characters (letters, numbers, _, -).'], 400);
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                respond(['ok' => false, 'error' => 'Please enter a valid email address.'], 400);
            }
            if (strlen($password) < 6) {
                respond(['ok' => false, 'error' => 'Password must be at least 6 characters long.'], 400);
            }

            $user = $storage->createUser($username, $email, $password, false, false);
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['active_role'] = 'player';
            $user['active_role'] = 'player';

            respond(['ok' => true, 'user' => $user]);
        }

        case 'login': {
            $username = trim((string)($input['username'] ?? ''));
            $password = (string)($input['password'] ?? '');

            $user = $storage->authenticate($username, $password);
            if (!$user) {
                respond(['ok' => false, 'error' => 'Invalid username/email or password.'], 401);
            }

            $_SESSION['user_id'] = $user['id'];
            respond(['ok' => true, 'user' => $user]);
        }

        case 'logout': {
            session_destroy();
            respond(['ok' => true]);
        }

        case 'forgot_password': {
            $identifier = trim((string)($input['email'] ?? $input['username'] ?? ''));
            if ($identifier === '') {
                respond(['ok' => false, 'error' => 'Please enter your username or email address.'], 400);
            }

            $user = $storage->getUserByUsernameOrEmail($identifier);
            $debugUrl = null;

            if ($user && !empty($user['email'])) {
                $token = $storage->createPasswordResetToken((int)$user['id']);

                // Build absolute reset link based on current request
                $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
                    || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443)
                    || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
                $protocol = $isHttps ? 'https' : 'http';
                $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
                $reqUri = $_SERVER['REQUEST_URI'] ?? '/api.php';
                $path = parse_url($reqUri, PHP_URL_PATH) ?: '/';
                $dir = rtrim(str_replace('\\', '/', dirname($path)), '/');
                if ($dir === '/' || $dir === '.') $dir = '';
                $resetUrl = "{$protocol}://{$host}{$dir}/index.php?reset_token=" . urlencode($token);

                $subject = "Password Reset Request - Stargazer's World VTT";
                $body = "Greetings " . $user['username'] . ",\r\n\r\n"
                    . "A request was received to reset the password for your account on Stargazer's World VTT.\r\n\r\n"
                    . "To set a new password, please click the link below (or copy and paste it into your browser):\r\n\r\n"
                    . $resetUrl . "\r\n\r\n"
                    . "This link is valid for 1 hour.\r\n"
                    . "If you did not request this password reset, you can safely ignore this email.\r\n\r\n"
                    . "May the dice roll ever in your favor,\r\n"
                    . "— Stargazer's World VTT\r\n";

                $cleanHost = preg_replace('/:\d+$/', '', $host);
                if ($cleanHost === 'localhost' || filter_var($cleanHost, FILTER_VALIDATE_IP)) {
                    $cleanHost = 'stargazer-vtt.local';
                }
                $fromEmail = "noreply@" . $cleanHost;
                $headers = "From: Stargazer's World VTT <{$fromEmail}>\r\n"
                    . "Reply-To: {$fromEmail}\r\n"
                    . "X-Mailer: PHP/" . phpversion() . "\r\n"
                    . "Content-Type: text/plain; charset=UTF-8\r\n";

                $sent = @mail($user['email'], $subject, $body, $headers);

                // Debug log to data/mail_debug.log (helpful when testing locally or on servers without configured MTA)
                $logLine = "[" . date('Y-m-d H:i:s') . "] PASSWORD RESET for {$user['email']} ({$user['username']})\n"
                    . "Reset Link: {$resetUrl}\n"
                    . "PHP mail() status: " . ($sent ? "SENT" : "NOT_SENT (no local MTA)") . "\n\n";
                @file_put_contents(__DIR__ . '/data/mail_debug.log', $logLine, FILE_APPEND);

                // If running on local server / dev without mail working, surface debug link so testing works out of the box
                if (!$sent && ($host === 'localhost' || str_starts_with($host, 'localhost:') || str_starts_with($host, '127.0.0.1'))) {
                    $debugUrl = $resetUrl;
                }
            }

            // Always respond uniformly to avoid user enumeration
            $resp = [
                'ok' => true,
                'message' => 'If an account matches that email or username, a reset link has been sent. Please check your inbox (and spam folder).'
            ];
            if ($debugUrl) {
                $resp['dev_reset_url'] = $debugUrl;
            }
            respond($resp);
        }

        case 'verify_reset_token': {
            $token = trim((string)($input['token'] ?? $_GET['token'] ?? ''));
            if ($token === '') {
                respond(['ok' => false, 'error' => 'No reset token provided.'], 400);
            }
            $verified = $storage->verifyPasswordResetToken($token);
            if (!$verified) {
                respond(['ok' => false, 'error' => 'This password reset link is invalid or has expired.'], 400);
            }
            respond([
                'ok' => true,
                'username' => $verified['user']['username'] ?? 'Adventurer',
            ]);
        }

        case 'reset_password': {
            $token = trim((string)($input['token'] ?? ''));
            $newPassword = (string)($input['password'] ?? '');

            if ($token === '') {
                respond(['ok' => false, 'error' => 'Missing reset token.'], 400);
            }
            if (strlen($newPassword) < 6) {
                respond(['ok' => false, 'error' => 'New password must be at least 6 characters long.'], 400);
            }

            $success = $storage->resetPasswordWithToken($token, $newPassword);
            if (!$success) {
                respond(['ok' => false, 'error' => 'Password reset failed. The link may have expired or already been used.'], 400);
            }

            respond(['ok' => true, 'message' => 'Password has been successfully updated! You can now log in.']);
        }

        case 'lobby_data': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $games = $storage->getGamesForUser($user['id'], !empty($user['is_admin']));
            $allUsers = $storage->getAllUsers();

            respond([
                'ok' => true,
                'user' => $user,
                'games' => $games,
                'users' => $allUsers,
            ]);
        }

        case 'admin_update_user': {
            $user = getCurrentUser($storage);
            if (!$user || empty($user['is_admin'])) {
                respond(['ok' => false, 'error' => 'Admin privileges required.'], 403);
            }

            $targetId = (int)($input['user_id'] ?? 0);
            $isAdmin = !empty($input['is_admin']);

            if ($targetId === $user['id'] && !$isAdmin) {
                respond(['ok' => false, 'error' => 'You cannot revoke your own admin rights.'], 400);
            }

            $updated = $storage->updateUserRights($targetId, true, $isAdmin);
            if (!$updated) {
                respond(['ok' => false, 'error' => 'User not found.'], 404);
            }

            respond(['ok' => true, 'updated_user' => $updated]);
        }

        case 'create_game': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $name = trim((string)($_POST['name'] ?? $input['name'] ?? ''));
            $description = trim((string)($_POST['description'] ?? $input['description'] ?? ''));
            $rawPlayers = $_POST['allowed_players'] ?? $input['allowed_players'] ?? [];
            if (is_string($rawPlayers)) {
                $allowedPlayers = json_decode($rawPlayers, true) ?: [];
            } elseif (is_array($rawPlayers)) {
                $allowedPlayers = $rawPlayers;
            } else {
                $allowedPlayers = [];
            }

            if ($name === '' || strlen($name) > 80) {
                respond(['ok' => false, 'error' => 'Please provide a game name (up to 80 characters).'], 400);
            }

            $previewPath = handlePreviewImageUpload($uploadsDir, 'preview_image') ?? '';

            // The creator of a game is its initial owner (and therefore GM for this game)
            $game = $storage->createGame($name, $description, $user['id'], $allowedPlayers, $previewPath);
            $storage->addMessage(
                $game['id'],
                $user['id'],
                $user['username'],
                'gm',
                'system',
                "Campaign \"{$game['name']}\" created by {$user['username']} (Owner & GM)."
            );

            respond(['ok' => true, 'game' => $game]);
        }

        case 'update_game': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($_POST['game_id'] ?? $input['game_id'] ?? 0);
            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            if ($game['gm_id'] !== $user['id'] && empty($user['is_admin'])) {
                respond(['ok' => false, 'error' => 'Only the owner (GM) of this campaign can edit its settings or transfer ownership.'], 403);
            }

            $name = trim((string)($_POST['name'] ?? $input['name'] ?? $game['name']));
            $description = trim((string)($_POST['description'] ?? $input['description'] ?? $game['description']));
            $rawPlayers = $_POST['allowed_players'] ?? $input['allowed_players'] ?? null;
            if (is_string($rawPlayers)) {
                $allowedPlayers = json_decode($rawPlayers, true);
                if (!is_array($allowedPlayers)) $allowedPlayers = $game['allowed_players'];
            } elseif (is_array($rawPlayers)) {
                $allowedPlayers = $rawPlayers;
            } else {
                $allowedPlayers = $game['allowed_players'];
            }

            $newOwnerId = (int)($_POST['owner_id'] ?? $input['owner_id'] ?? $game['gm_id']);
            if ($newOwnerId > 0 && $newOwnerId !== $game['gm_id']) {
                $targetOwner = $storage->getUserById($newOwnerId);
                if (!$targetOwner) {
                    respond(['ok' => false, 'error' => 'Selected new owner user does not exist.'], 400);
                }
            } else {
                $newOwnerId = $game['gm_id'];
            }

            if ($name === '') {
                respond(['ok' => false, 'error' => 'Game name cannot be empty.'], 400);
            }

            $uploadedPreview = handlePreviewImageUpload($uploadsDir, 'preview_image');
            $removePreview = !empty($_POST['remove_preview']) || !empty($input['remove_preview']);
            $newPreview = null;
            if ($uploadedPreview !== null) {
                if (!empty($game['preview_image'])) {
                    $oldPath = __DIR__ . '/' . $game['preview_image'];
                    if (is_file($oldPath)) @unlink($oldPath);
                }
                $newPreview = $uploadedPreview;
            } elseif ($removePreview) {
                if (!empty($game['preview_image'])) {
                    $oldPath = __DIR__ . '/' . $game['preview_image'];
                    if (is_file($oldPath)) @unlink($oldPath);
                }
                $newPreview = '';
            }

            $oldOwnerId = $game['gm_id'];
            $updated = $storage->updateGameAccess($gameId, $name, $description, $allowedPlayers, $newOwnerId, $newPreview);

            if ($updated && $newOwnerId !== $oldOwnerId) {
                $storage->addMessage(
                    $gameId,
                    $user['id'],
                    $user['username'],
                    'gm',
                    'system',
                    "Campaign ownership (GM) transferred from {$user['username']} to {$updated['gm_name']}."
                );
            }

            respond(['ok' => true, 'game' => $updated]);
        }

        case 'delete_game': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($input['game_id'] ?? $_POST['game_id'] ?? 0);
            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Campaign not found.'], 404);

            $isOwner = ((int)$game['gm_id'] === (int)$user['id']);
            $isAdmin = !empty($user['is_admin']);
            if (!$isOwner && !$isAdmin) {
                respond(['ok' => false, 'error' => 'Only the Campaign Owner (GM) or an Admin can delete this campaign.'], 403);
            }

            $storage->deleteGame($gameId);
            respond(['ok' => true]);
        }

        case 'game_state': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($_GET['game_id'] ?? $input['game_id'] ?? 0);
            $afterMessageId = (int)($_GET['after_msg_id'] ?? $input['after_msg_id'] ?? 0);
            $requestedMapId = (int)($_GET['map_id'] ?? $input['map_id'] ?? 0);
            $viewMode = strtolower(trim((string)($_GET['view_mode'] ?? $input['view_mode'] ?? '')));

            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            // The owner of a game is always the GM for this particular game
            $isActualGameGm = ($game['gm_id'] === $user['id']);
            $isGameGm = $isActualGameGm && ($viewMode !== 'player');
            $hasPlayerAccess = in_array($user['id'], $game['allowed_players'], true) || $game['gm_id'] === $user['id'];

            if (!$isGameGm && !$hasPlayerAccess) {
                respond(['ok' => false, 'error' => 'You do not have access to this game.'], 403);
            }

            $mapTabs = $storage->getMapTabs($gameId);
            $validMapIds = array_column($mapTabs, 'id');

            $playerActiveMapId = in_array($game['active_map_id'], $validMapIds, true)
                ? $game['active_map_id']
                : $mapTabs[0]['id'];

            if ($isGameGm && in_array($requestedMapId, $validMapIds, true)) {
                $activeMapId = $requestedMapId;
            } else {
                $activeMapId = $playerActiveMapId;
            }

            // Players only receive the single map tab set as ACTIVE by the GM
            $visibleMapTabs = $isGameGm
                ? $mapTabs
                : array_values(array_filter($mapTabs, fn($t) => $t['id'] === $activeMapId));

            $images = $storage->getBoardImages($gameId, $isGameGm, $activeMapId);
            $libraryImages = $isGameGm ? $storage->getLibraryImages($gameId) : [];
            $tokens = $storage->getBoardTokens($gameId, $activeMapId);
            $libraryTokens = $isGameGm ? $storage->getLibraryTokens($gameId) : [];
            $messages = $storage->getMessages($gameId, $user['id'], $isGameGm, $afterMessageId);

            // Gather participant list (GM + allowed players) for whisper autocomplete & roster
            $allUsers = $storage->getAllUsers();
            $participants = [];
            foreach ($allUsers as $u) {
                if ($u['id'] === $game['gm_id'] || in_array($u['id'], $game['allowed_players'], true)) {
                    $participants[] = [
                        'id' => $u['id'],
                        'username' => $u['username'],
                        'role' => ($u['id'] === $game['gm_id']) ? 'gm' : 'player',
                    ];
                }
            }

            respond([
                'ok' => true,
                'game' => $game,
                'is_game_gm' => $isGameGm,
                'map_tabs' => $visibleMapTabs,
                'active_map_id' => $activeMapId,
                'player_active_map_id' => $playerActiveMapId,
                'images' => $images,
                'library_images' => $libraryImages,
                'tokens' => $tokens,
                'library_tokens' => $libraryTokens,
                'messages' => $messages,
                'participants' => $participants,
                'music_state' => $game['music_state'] ?? [],
                'playlists' => $storage->getPlaylists($gameId),
                'pdfs' => $storage->getPdfs($gameId, $isGameGm),
                'shared_pdf' => $game['shared_pdf'] ?? null,
            ]);
        }

        case 'create_map_tab': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($input['game_id'] ?? 0);
            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            if ($game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the GM can create map tabs.'], 403);
            }

            $name = trim((string)($input['name'] ?? 'New Map'));
            $gridSize = (float)($input['grid_size'] ?? 5);
            $gridUnit = strtolower(trim((string)($input['grid_unit'] ?? 'feet')));

            $tab = $storage->createMapTab($gameId, $name, $gridSize, $gridUnit);
            respond([
                'ok' => true,
                'map_tab' => $tab,
                'map_tabs' => $storage->getMapTabs($gameId),
            ]);
        }

        case 'update_map_tab': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $mapId = (int)($input['map_id'] ?? 0);
            $tab = $storage->getMapTabById($mapId);
            if (!$tab) respond(['ok' => false, 'error' => 'Map tab not found.'], 404);

            $game = $storage->getGameById($tab['game_id']);
            if (!$game || $game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the GM can edit map tabs.'], 403);
            }

            $name = trim((string)($input['name'] ?? $tab['name']));
            $gridSize = (float)($input['grid_size'] ?? $tab['grid_size']);
            $gridUnit = strtolower(trim((string)($input['grid_unit'] ?? $tab['grid_unit'])));

            $updated = $storage->updateMapTab($mapId, $name, $gridSize, $gridUnit);
            respond([
                'ok' => true,
                'map_tab' => $updated,
                'map_tabs' => $storage->getMapTabs($tab['game_id']),
            ]);
        }

        case 'delete_map_tab': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $mapId = (int)($input['map_id'] ?? 0);
            $tab = $storage->getMapTabById($mapId);
            if (!$tab) respond(['ok' => false, 'error' => 'Map tab not found.'], 404);

            $game = $storage->getGameById($tab['game_id']);
            if (!$game || $game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the GM can delete map tabs.'], 403);
            }

            $storage->deleteMapTab($mapId);
            $remaining = $storage->getMapTabs($tab['game_id']);
            respond([
                'ok' => true,
                'map_tabs' => $remaining,
                'active_map_id' => $remaining[0]['id'],
            ]);
        }

        case 'select_map_tab': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $mapId = (int)($input['map_id'] ?? 0);
            $tab = $storage->getMapTabById($mapId);
            if (!$tab) respond(['ok' => false, 'error' => 'Map tab not found.'], 404);

            $game = $storage->getGameById($tab['game_id']);
            if ($game && $game['gm_id'] === $user['id']) {
                $storage->setActiveMapTab($game['id'], $mapId);
            }
            respond(['ok' => true, 'active_map_id' => $mapId]);
        }

        case 'save_map_tab':
        case 'update_grid_settings': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $mapId = (int)($_POST['map_id'] ?? $input['map_id'] ?? 0);
            $gameId = (int)($_POST['game_id'] ?? $input['game_id'] ?? 0);
            $tab = null;

            if ($mapId > 0) {
                $tab = $storage->getMapTabById($mapId);
                if (!$tab) respond(['ok' => false, 'error' => 'Map tab not found.'], 404);
                $gameId = $tab['game_id'];
            }

            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            if ($game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the GM can edit map tabs.'], 403);
            }

            $name = trim((string)($_POST['name'] ?? $input['name'] ?? ($tab['name'] ?? 'Map')));
            if ($name === '') $name = 'Map';
            $gridSize = (float)($_POST['grid_size'] ?? $input['grid_size'] ?? ($tab['grid_size'] ?? 5));
            $gridUnit = strtolower(trim((string)($_POST['grid_unit'] ?? $input['grid_unit'] ?? ($tab['grid_unit'] ?? 'feet'))));

            if ($mapId === 0) {
                $created = $storage->createMapTab($gameId, $name, $gridSize, $gridUnit);
                $mapId = $created['id'];
                $tab = $created;
            } else {
                $storage->updateMapTab($mapId, $name, $gridSize, $gridUnit);
            }

            $gridType = (string)($_POST['grid_type'] ?? $input['grid_type'] ?? ($tab['grid_type'] ?? 'square'));
            $gridCellPx = (int)($_POST['grid_cell_px'] ?? $input['grid_cell_px'] ?? ($tab['grid_cell_px'] ?? 50));
            $gridColor = (string)($_POST['grid_color'] ?? $input['grid_color'] ?? ($tab['grid_color'] ?? 'rgba(255, 255, 255, 0.25)'));
            $gridOffsetX = (int)($_POST['grid_offset_x'] ?? $input['grid_offset_x'] ?? ($tab['grid_offset_x'] ?? 0));
            $gridOffsetY = (int)($_POST['grid_offset_y'] ?? $input['grid_offset_y'] ?? ($tab['grid_offset_y'] ?? 0));

            $removeBg = !empty($_POST['remove_background']) || !empty($input['remove_background']);
            $backgroundImage = null; // null means keep existing
            $bgWidth = 0.0;
            $bgHeight = 0.0;

            if ($removeBg) {
                $backgroundImage = '';
                $bgWidth = 0.0;
                $bgHeight = 0.0;
            } elseif (!empty($_FILES['background_file']['tmp_name']) && is_uploaded_file($_FILES['background_file']['tmp_name'])) {
                $file = $_FILES['background_file'];
                if ($file['error'] !== UPLOAD_ERR_OK) {
                    respond(['ok' => false, 'error' => 'File upload error code: ' . $file['error']], 400);
                }
                $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
                $allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
                if (!in_array($ext, $allowed, true)) {
                    respond(['ok' => false, 'error' => 'Unsupported background image type. Allowed: jpg, png, gif, webp, svg'], 400);
                }
                $safeName = 'map_bg_' . $mapId . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
                $targetPath = $uploadsDir . '/' . $safeName;
                if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
                    respond(['ok' => false, 'error' => 'Failed to save background image.'], 500);
                }
                $backgroundImage = 'uploads/' . $safeName;
                $dimensions = @getimagesize($targetPath);
                if ($dimensions) {
                    $bgWidth = (float)$dimensions[0];
                    $bgHeight = (float)$dimensions[1];
                }
            } elseif (isset($_POST['background_image']) || isset($input['background_image'])) {
                $explicitBg = trim((string)($_POST['background_image'] ?? $input['background_image']));
                $backgroundImage = $explicitBg;
                if ($explicitBg !== '') {
                    $localPath = __DIR__ . '/' . ltrim($explicitBg, '/\\');
                    if (is_file($localPath)) {
                        $dimensions = @getimagesize($localPath);
                        if ($dimensions) {
                            $bgWidth = (float)$dimensions[0];
                            $bgHeight = (float)$dimensions[1];
                        }
                    }
                }
            }

            $updated = $storage->updateMapTabGrid(
                $mapId,
                $gridType,
                $gridCellPx,
                $gridColor,
                $gridOffsetX,
                $gridOffsetY,
                $backgroundImage,
                $bgWidth,
                $bgHeight
            );

            respond([
                'ok' => true,
                'map_tab' => $updated,
                'map_tabs' => $storage->getMapTabs($gameId),
                'active_map_id' => $mapId
            ]);
        }

        case 'upload_image': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($_POST['game_id'] ?? 0);
            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            $isGameGm = ($game['gm_id'] === $user['id']);
            if (!$isGameGm) {
                respond(['ok' => false, 'error' => 'Only the Game Master can upload images to this game.'], 403);
            }

            $uploadedFiles = extractUploadedFileList(['images', 'image']);
            if (empty($uploadedFiles)) {
                respond(['ok' => false, 'error' => 'No image files were received.'], 400);
            }

            $allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
            $createdImages = [];
            $skipped = [];

            $baseX = isset($_POST['x']) ? (float)$_POST['x'] : 140.0;
            $baseY = isset($_POST['y']) ? (float)$_POST['y'] : 90.0;
            $singleTitle = trim((string)($_POST['title'] ?? ''));

            foreach ($uploadedFiles as $idx => $file) {
                $origName = basename((string)$file['name']);
                if ($file['error'] !== UPLOAD_ERR_OK) {
                    $errMsg = match ($file['error']) {
                        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'exceeds maximum allowed upload file size',
                        UPLOAD_ERR_PARTIAL => 'file was only partially uploaded',
                        UPLOAD_ERR_NO_FILE => 'no file was uploaded',
                        UPLOAD_ERR_NO_TMP_DIR => 'missing temporary folder on server',
                        UPLOAD_ERR_CANT_WRITE => 'failed to write file to disk',
                        UPLOAD_ERR_EXTENSION => 'file upload stopped by PHP extension',
                        default => "upload error (code {$file['error']})"
                    };
                    $skipped[] = "{$origName}: {$errMsg}";
                    continue;
                }
                if ($file['size'] > 64 * 1024 * 1024) {
                    $skipped[] = "{$origName}: exceeds 64 MB limit";
                    continue;
                }

                $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
                if (!in_array($ext, $allowedExts, true)) {
                    $skipped[] = "{$origName}: unsupported format";
                    continue;
                }

                // Determine natural dimensions if possible
                $width = 480.0;
                $height = 360.0;
                $imgSize = @getimagesize($file['tmp_name']);
                if (is_array($imgSize) && !empty($imgSize[0]) && !empty($imgSize[1])) {
                    $w = (float)$imgSize[0];
                    $h = (float)$imgSize[1];
                    $maxDim = 600.0;
                    if ($w > $maxDim || $h > $maxDim) {
                        $ratio = min($maxDim / $w, $maxDim / $h);
                        $width = round($w * $ratio);
                        $height = round($h * $ratio);
                    } else {
                        $width = max(120.0, $w);
                        $height = max(120.0, $h);
                    }
                }

                $safeFilename = 'game_' . $gameId . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
                $destPath = $uploadsDir . '/' . $safeFilename;

                if (!move_uploaded_file($file['tmp_name'], $destPath)) {
                    $skipped[] = "{$origName}: could not save file on server";
                    continue;
                }

                $title = (count($uploadedFiles) === 1 && $singleTitle !== '')
                    ? $singleTitle
                    : pathinfo($origName, PATHINFO_FILENAME);

                $offsetX = $baseX + ($idx * 20.0);
                $offsetY = $baseY + ($idx * 20.0);

                // Newly uploaded images start in the library (hidden from tabletop until placed)
                $createdImages[] = $storage->addBoardImage($gameId, $title, 'uploads/' . $safeFilename, $offsetX, $offsetY, $width, $height, $user['id']);
            }

            if (empty($createdImages)) {
                $errDetail = !empty($skipped) ? implode('; ', $skipped) : 'Image upload failed.';
                respond(['ok' => false, 'error' => $errDetail], 400);
            }

            respond([
                'ok'      => true,
                'image'   => $createdImages[0],
                'images'  => $createdImages,
                'skipped' => $skipped,
            ]);
        }

        case 'update_image': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $imageId = (int)($input['image_id'] ?? 0);
            $img = $storage->getBoardImageById($imageId);
            if (!$img) respond(['ok' => false, 'error' => 'Image not found.'], 404);

            $game = $storage->getGameById($img['game_id']);
            if (!$game || $game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the GM can move or toggle images.'], 403);
            }

            $updated = $storage->updateBoardImage($imageId, $input);
            respond(['ok' => true, 'image' => $updated]);
        }

        case 'delete_image': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $imageId = (int)($input['image_id'] ?? 0);
            $img = $storage->getBoardImageById($imageId);
            if (!$img) respond(['ok' => false, 'error' => 'Image not found.'], 404);

            $game = $storage->getGameById($img['game_id']);
            if (!$game || $game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the GM can remove images.'], 403);
            }

            $filePath = __DIR__ . '/' . $img['filename'];
            if (is_file($filePath)) {
                @unlink($filePath);
            }
            $storage->deleteBoardImage($imageId);
            respond(['ok' => true]);
        }

        case 'upload_token': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($_POST['game_id'] ?? 0);
            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            $isGameGm = ($game['gm_id'] === $user['id']);
            if (!$isGameGm) {
                respond(['ok' => false, 'error' => 'Only the Game Master can upload tokens to this game.'], 403);
            }

            $uploadedFiles = extractUploadedFileList(['tokens', 'token']);
            if (empty($uploadedFiles)) {
                respond(['ok' => false, 'error' => 'No token files were received.'], 400);
            }

            $allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
            $singleTitle = trim((string)($_POST['title'] ?? ''));
            $tileSize = max(1, min(12, (int)($_POST['tile_size'] ?? 1)));
            $movableBy = trim((string)($_POST['movable_by'] ?? 'gm')) ?: 'gm';

            $createdTokens = [];
            $skipped = [];

            foreach ($uploadedFiles as $file) {
                $origName = basename((string)$file['name']);
                if ($file['error'] !== UPLOAD_ERR_OK) {
                    $errMsg = match ($file['error']) {
                        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'exceeds maximum allowed upload file size',
                        UPLOAD_ERR_PARTIAL => 'file was only partially uploaded',
                        UPLOAD_ERR_NO_FILE => 'no file was uploaded',
                        UPLOAD_ERR_NO_TMP_DIR => 'missing temporary folder on server',
                        UPLOAD_ERR_CANT_WRITE => 'failed to write file to disk',
                        UPLOAD_ERR_EXTENSION => 'file upload stopped by PHP extension',
                        default => "upload error (code {$file['error']})"
                    };
                    $skipped[] = "{$origName}: {$errMsg}";
                    continue;
                }
                if ($file['size'] > 32 * 1024 * 1024) {
                    $skipped[] = "{$origName}: exceeds 32 MB limit";
                    continue;
                }

                $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
                if (!in_array($ext, $allowedExts, true)) {
                    $skipped[] = "{$origName}: unsupported format";
                    continue;
                }

                // Strictly require square images for tokens (width === height)
                $imgW = 0;
                $imgH = 0;
                if ($ext === 'svg') {
                    $svgRaw = @file_get_contents($file['tmp_name']) ?: '';
                    if (preg_match('/viewBox\s*=\s*["\']\s*[\d\.\-]+\s+[\d\.\-]+\s+([\d\.]+)\s+([\d\.]+)/i', $svgRaw, $vm)) {
                        $imgW = (int)round((float)$vm[1]);
                        $imgH = (int)round((float)$vm[2]);
                    } elseif (
                        preg_match('/\bwidth\s*=\s*["\']([\d\.]+)/i', $svgRaw, $wm) &&
                        preg_match('/\bheight\s*=\s*["\']([\d\.]+)/i', $svgRaw, $hm)
                    ) {
                        $imgW = (int)round((float)$wm[1]);
                        $imgH = (int)round((float)$hm[1]);
                    } else {
                        $imgW = (int)($_POST['client_width'] ?? 0);
                        $imgH = (int)($_POST['client_height'] ?? 0);
                    }
                } else {
                    $imgSize = @getimagesize($file['tmp_name']);
                    if (is_array($imgSize) && !empty($imgSize[0]) && !empty($imgSize[1])) {
                        $imgW = (int)$imgSize[0];
                        $imgH = (int)$imgSize[1];
                    }
                }

                if ($imgW <= 0 || $imgH <= 0) {
                    $skipped[] = "{$origName}: unable to read image dimensions";
                    continue;
                }
                if ($imgW !== $imgH) {
                    $skipped[] = "{$origName}: not square ({$imgW}×{$imgH} px)";
                    continue;
                }

                $safeFilename = 'token_' . $gameId . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
                $destPath = $uploadsDir . '/' . $safeFilename;

                if (!move_uploaded_file($file['tmp_name'], $destPath)) {
                    $skipped[] = "{$origName}: could not save file on server";
                    continue;
                }

                $title = (count($uploadedFiles) === 1 && $singleTitle !== '')
                    ? $singleTitle
                    : pathinfo($origName, PATHINFO_FILENAME);

                $createdTokens[] = $storage->addBoardToken(
                    $gameId,
                    $title,
                    'uploads/' . $safeFilename,
                    2,
                    2,
                    $tileSize,
                    $movableBy,
                    $user['id']
                );
            }

            if (empty($createdTokens)) {
                $errDetail = !empty($skipped)
                    ? 'Only square images are accepted as tokens (' . implode('; ', $skipped) . ').'
                    : 'Token upload failed.';
                respond(['ok' => false, 'error' => $errDetail], 400);
            }

            respond([
                'ok'      => true,
                'token'   => $createdTokens[0],
                'tokens'  => $createdTokens,
                'skipped' => $skipped,
            ]);
        }

        case 'duplicate_token': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $tokenId = (int)($input['token_id'] ?? 0);
            $tok = $storage->getBoardTokenById($tokenId);
            if (!$tok) respond(['ok' => false, 'error' => 'Token not found.'], 404);

            $game = $storage->getGameById($tok['game_id']);
            if (!$game || $game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the GM can duplicate tokens.'], 403);
            }

            $copy = $storage->addBoardToken(
                $tok['game_id'],
                $tok['title'],
                $tok['filename'],
                $tok['grid_x'] + 1,
                $tok['grid_y'],
                $tok['tile_size'],
                $tok['movable_by'],
                $user['id']
            );
            respond(['ok' => true, 'token' => $copy]);
        }

        case 'update_token': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $tokenId = (int)($input['token_id'] ?? 0);
            $tok = $storage->getBoardTokenById($tokenId);
            if (!$tok) respond(['ok' => false, 'error' => 'Token not found.'], 404);

            $game = $storage->getGameById($tok['game_id']);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            $viewMode = strtolower(trim((string)($input['view_mode'] ?? '')));
            $isActualGameGm = ($game['gm_id'] === $user['id']);
            $isGameGm = $isActualGameGm && ($viewMode !== 'player');
            $hasPlayerAccess = in_array($user['id'], $game['allowed_players'], true) || $game['gm_id'] === $user['id'];

            if ($isGameGm) {
                $updated = $storage->updateBoardToken($tokenId, $input);
                respond(['ok' => true, 'token' => $updated]);
            }

            // Player (or GM in Player View Preview tab): verify movement permission
            if (!$hasPlayerAccess || !$tok['on_board']) {
                respond(['ok' => false, 'error' => 'You are not allowed to move this token.'], 403);
            }

            $movableBy = (string)$tok['movable_by'];
            $canPlayerMove = ($movableBy === 'all') || ($movableBy === (string)$user['id']) || ($isActualGameGm && $movableBy !== 'gm');
            if (!$canPlayerMove) {
                respond(['ok' => false, 'error' => 'The GM has not granted you permission to move this token.'], 403);
            }

            // Players can only update grid_x, grid_y, and bring_to_front
            $playerFields = [];
            if (isset($input['grid_x'])) $playerFields['grid_x'] = (int)$input['grid_x'];
            if (isset($input['grid_y'])) $playerFields['grid_y'] = (int)$input['grid_y'];
            if (!empty($input['bring_to_front'])) $playerFields['bring_to_front'] = true;

            $updated = $storage->updateBoardToken($tokenId, $playerFields);
            respond(['ok' => true, 'token' => $updated]);
        }

        case 'set_all_tokens_movable': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($input['game_id'] ?? 0);
            $game = $storage->getGameById($gameId);
            if (!$game || $game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the GM can update token permissions.'], 403);
            }

            $movableBy = trim((string)($input['movable_by'] ?? 'gm')) ?: 'gm';
            $storage->setAllTokensMovableBy($gameId, $movableBy);
            respond([
                'ok' => true,
                'library_tokens' => $storage->getLibraryTokens($gameId),
            ]);
        }

        case 'delete_token': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $tokenId = (int)($input['token_id'] ?? 0);
            $tok = $storage->getBoardTokenById($tokenId);
            if (!$tok) respond(['ok' => false, 'error' => 'Token not found.'], 404);

            $game = $storage->getGameById($tok['game_id']);
            if (!$game || $game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the GM can delete tokens.'], 403);
            }

            if (str_starts_with((string)$tok['filename'], 'assets/tokens/')) {
                respond(['ok' => false, 'error' => 'Built-in tokens cannot be deleted.'], 400);
            }

            $refCount = $storage->countTokenFilenameReferences($tok['filename']);
            $storage->deleteBoardToken($tokenId);
            if ($refCount <= 1 && str_starts_with((string)$tok['filename'], 'uploads/')) {
                $filePath = __DIR__ . '/' . $tok['filename'];
                if (is_file($filePath)) {
                    @unlink($filePath);
                }
            }
            respond(['ok' => true]);
        }

        case 'send_chat': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($input['game_id'] ?? 0);
            $rawText = trim((string)($input['message'] ?? ''));

            if ($rawText === '') {
                respond(['ok' => false, 'error' => 'Message cannot be empty.'], 400);
            }

            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            $viewMode = strtolower(trim((string)($input['view_mode'] ?? '')));
            $isActualGameGm = ($game['gm_id'] === $user['id']);
            $isGameGm = $isActualGameGm && ($viewMode !== 'player');
            $hasPlayerAccess = in_array($user['id'], $game['allowed_players'], true) || $game['gm_id'] === $user['id'];
            if (!$isGameGm && !$hasPlayerAccess) {
                respond(['ok' => false, 'error' => 'Access denied.'], 403);
            }

            $senderRole = $isGameGm ? 'gm' : 'player';

            // 1. Check for /openrolls command
            if (preg_match('/^\/openrolls(?:\s+(on|off))?$/i', $rawText, $m)) {
                if (!$isGameGm) {
                    respond(['ok' => false, 'error' => 'Only the Game Master can toggle /openrolls.'], 403);
                }
                $force = null;
                if (!empty($m[1])) {
                    $force = strtolower($m[1]) === 'on';
                }
                $newOpenState = $storage->toggleGameOpenRolls($gameId, $force);
                $statusText = $newOpenState
                    ? 'GM rolls are now OPEN (visible to all players).'
                    : 'GM rolls are now HIDDEN (visible only to the GM).';

                $msg = $storage->addMessage(
                    $gameId,
                    $user['id'],
                    $user['username'],
                    'gm',
                    'system',
                    $statusText,
                    null,
                    null,
                    true // only need to notify GM in chat
                );

                respond([
                    'ok' => true,
                    'open_rolls' => $newOpenState,
                    'message' => $msg,
                ]);
            }

            // 2. Check for whisper command: /w {username} {message} or /w "{username}" {message}
            if (preg_match('/^\/w(?:hisper)?\s+(?:"([^"]+)"|(\S+))\s+(.+)$/is', $rawText, $m)) {
                $targetUsername = $m[1] !== '' ? $m[1] : $m[2];
                $whisperBody = trim($m[3]);

                $targetUser = $storage->getUserByUsername($targetUsername);
                if (!$targetUser) {
                    respond(['ok' => false, 'error' => "User \"{$targetUsername}\" not found."], 404);
                }

                $msg = $storage->addMessage(
                    $gameId,
                    $user['id'],
                    $user['username'],
                    $senderRole,
                    'whisper',
                    $whisperBody,
                    $targetUser['id'],
                    $targetUser['username'],
                    false,
                    null
                );

                respond(['ok' => true, 'message' => $msg]);
            }

            // 3. Check for dice roll command: /r {formula} or /roll {formula}
            if (preg_match('/^\/r(?:oll)?\s+(.+)$/is', $rawText, $m)) {
                $formulaExpr = trim($m[1]);
                try {
                    $rollResult = DiceRoller::roll($formulaExpr);
                } catch (InvalidArgumentException $e) {
                    respond(['ok' => false, 'error' => $e->getMessage()], 400);
                }

                // A GM's rolls are hidden by default, unless open_rolls is toggled on
                $isHiddenRoll = ($isGameGm && empty($game['open_rolls']));

                $summaryText = "{$user['username']} rolled {$rollResult['formula']} = {$rollResult['total']}";
                $msg = $storage->addMessage(
                    $gameId,
                    $user['id'],
                    $user['username'],
                    $senderRole,
                    'roll',
                    $summaryText,
                    null,
                    null,
                    $isHiddenRoll,
                    $rollResult
                );

                respond(['ok' => true, 'message' => $msg]);
            }

            // Catch unknown slash commands
            if (str_starts_with($rawText, '/')) {
                respond([
                    'ok' => false,
                    'error' => 'Unknown command. Available commands: /r [dice], /roll [dice], /w [username] [message], /openrolls (GM).'
                ], 400);
            }

            // 4. Standard open chat message
            $msg = $storage->addMessage(
                $gameId,
                $user['id'],
                $user['username'],
                $senderRole,
                'chat',
                $rawText
            );

            respond(['ok' => true, 'message' => $msg]);
        }

        case 'get_notes': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($input['game_id'] ?? $_GET['game_id'] ?? 0);
            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            if ($game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the GM can access notes.'], 403);
            }

            respond([
                'ok' => true,
                'notes' => $storage->getNotes($gameId)
            ]);
        }

        case 'save_note': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($input['game_id'] ?? 0);
            $noteId = (int)($input['id'] ?? 0);
            $title = trim((string)($input['title'] ?? ''));
            $content = (string)($input['content'] ?? '');

            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            if ($game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the GM can edit notes.'], 403);
            }

            $note = $storage->saveNote($gameId, $noteId, $title, $content);
            respond([
                'ok' => true,
                'note' => $note,
                'notes' => $storage->getNotes($gameId)
            ]);
        }

        case 'delete_note': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($input['game_id'] ?? 0);
            $noteId = (int)($input['id'] ?? 0);

            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            if ($game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the GM can delete notes.'], 403);
            }

            $storage->deleteNote($noteId);
            respond([
                'ok' => true,
                'notes' => $storage->getNotes($gameId)
            ]);
        }

        case 'get_playlists': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($_GET['game_id'] ?? $input['game_id'] ?? 0);
            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            $hasAccess = ($game['gm_id'] === $user['id']) || in_array($user['id'], $game['allowed_players'], true);
            if (!$hasAccess) respond(['ok' => false, 'error' => 'Access denied.'], 403);

            respond([
                'ok' => true,
                'playlists' => $storage->getPlaylists($gameId),
                'music_state' => $game['music_state'] ?? [],
            ]);
        }

        case 'save_playlist': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($input['game_id'] ?? 0);
            $playlistId = (int)($input['id'] ?? $input['playlist_id'] ?? 0);
            $name = trim((string)($input['name'] ?? ''));

            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);
            if ($game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the Game Master can manage playlists.'], 403);
            }

            if ($name === '') {
                $name = 'New Playlist';
            }

            $playlist = $storage->savePlaylist($gameId, $playlistId, $name);
            respond([
                'ok' => true,
                'playlist' => $playlist,
                'playlists' => $storage->getPlaylists($gameId)
            ]);
        }

        case 'delete_playlist': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($input['game_id'] ?? 0);
            $playlistId = (int)($input['id'] ?? $input['playlist_id'] ?? 0);

            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);
            if ($game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the Game Master can delete playlists.'], 403);
            }

            $musicState = $game['music_state'] ?? [];
            if ((int)($musicState['playlist_id'] ?? 0) === $playlistId) {
                $storage->updateMusicState($gameId, [
                    'status' => 'stopped',
                    'playlist_id' => 0,
                    'track_id' => '',
                    'track_title' => '',
                    'track_url' => '',
                    'position' => 0
                ]);
            }

            $storage->deletePlaylist($gameId, $playlistId);
            respond([
                'ok' => true,
                'playlists' => $storage->getPlaylists($gameId)
            ]);
        }

        case 'add_playlist_track': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($input['game_id'] ?? 0);
            $playlistId = (int)($input['playlist_id'] ?? 0);
            $title = trim((string)($input['title'] ?? ''));
            $url = trim((string)($input['url'] ?? ''));

            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);
            if ($game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the Game Master can add tracks.'], 403);
            }

            if ($url === '') {
                respond(['ok' => false, 'error' => 'Please provide a valid URL for the track.'], 400);
            }

            $playlist = $storage->addTrackToPlaylist($gameId, $playlistId, $title, $url);
            if (!$playlist) {
                respond(['ok' => false, 'error' => 'Playlist not found.'], 404);
            }

            respond([
                'ok' => true,
                'playlist' => $playlist,
                'playlists' => $storage->getPlaylists($gameId)
            ]);
        }

        case 'delete_playlist_track': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($input['game_id'] ?? 0);
            $playlistId = (int)($input['playlist_id'] ?? 0);
            $trackId = (string)($input['track_id'] ?? '');

            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);
            if ($game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the Game Master can delete tracks.'], 403);
            }

            $musicState = $game['music_state'] ?? [];
            if (($musicState['track_id'] ?? '') === $trackId) {
                $storage->updateMusicState($gameId, [
                    'status' => 'stopped',
                    'track_id' => '',
                    'track_title' => '',
                    'track_url' => '',
                    'position' => 0
                ]);
            }

            $playlist = $storage->deleteTrackFromPlaylist($gameId, $playlistId, $trackId);
            respond([
                'ok' => true,
                'playlist' => $playlist,
                'playlists' => $storage->getPlaylists($gameId)
            ]);
        }

        case 'update_music_state': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($input['game_id'] ?? 0);
            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            if ($game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the Game Master can control music playback.'], 403);
            }

            $fields = [];
            if (isset($input['status'])) {
                $status = (string)$input['status'];
                if (in_array($status, ['playing', 'paused', 'stopped'], true)) {
                    $fields['status'] = $status;
                }
            }
            if (isset($input['playlist_id'])) {
                $fields['playlist_id'] = (int)$input['playlist_id'];
            }
            if (isset($input['track_id'])) {
                $fields['track_id'] = (string)$input['track_id'];
            }
            if (isset($input['track_title'])) {
                $fields['track_title'] = (string)$input['track_title'];
            }
            if (isset($input['track_url'])) {
                $fields['track_url'] = (string)$input['track_url'];
            }
            if (isset($input['source_type'])) {
                $fields['source_type'] = in_array($input['source_type'], ['youtube', 'audio'], true) ? $input['source_type'] : 'audio';
            }
            if (isset($input['position'])) {
                $fields['position'] = max(0.0, (float)$input['position']);
            }
            if (isset($input['repeat_mode'])) {
                $repeatMode = (string)$input['repeat_mode'];
                if (in_array($repeatMode, ['playlist', 'track', 'none'], true)) {
                    $fields['repeat_mode'] = $repeatMode;
                }
            }

            $updated = $storage->updateMusicState($gameId, $fields);
            respond(['ok' => true, 'music_state' => $updated]);
        }

        case 'get_pdfs': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($_GET['game_id'] ?? $input['game_id'] ?? 0);
            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            $isGm = ($game['gm_id'] === $user['id']);
            $hasAccess = $isGm || in_array($user['id'], $game['allowed_players'], true);
            if (!$hasAccess) respond(['ok' => false, 'error' => 'Access denied.'], 403);

            $rawPdfs = $storage->getPdfs($gameId, $isGm);
            $pdfsWithCovers = ensurePdfCovers($storage, $rawPdfs, $uploadsDir);

            respond([
                'ok' => true,
                'pdfs' => $pdfsWithCovers,
                'shared_pdf' => $game['shared_pdf'] ?? null,
                'is_game_gm' => $isGm
            ]);
        }

        case 'upload_pdf': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($_POST['game_id'] ?? 0);
            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            if ($game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the Game Master can upload PDFs.'], 403);
            }

            $uploadedFiles = extractUploadedFileList(['pdfs', 'pdf', 'file']);
            if (empty($uploadedFiles)) {
                respond(['ok' => false, 'error' => 'No PDF files were uploaded.'], 400);
            }

            $created = [];
            $skipped = [];

            foreach ($uploadedFiles as $file) {
                if ($file['error'] !== UPLOAD_ERR_OK) {
                    $skipped[] = ($file['name'] ?? 'file') . ' (' . getUploadErrorMessage((int)$file['error']) . ')';
                    continue;
                }
                $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
                if ($ext !== 'pdf') {
                    $skipped[] = $file['name'] . ' (Only .pdf files are supported)';
                    continue;
                }

                $cleanBase = preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', pathinfo($file['name'], PATHINFO_FILENAME));
                $safeName = 'pdf_' . $gameId . '_' . bin2hex(random_bytes(6)) . '_' . substr($cleanBase, 0, 40) . '.pdf';
                $targetPath = $uploadsDir . '/' . $safeName;

                if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
                    $skipped[] = $file['name'] . ' (Could not save file to disk)';
                    continue;
                }

                $relPath = 'uploads/' . $safeName;
                $title = pathinfo($file['name'], PATHINFO_FILENAME);
                $filesize = filesize($targetPath) ?: 0;
                $isShared = isset($_POST['is_shared']) ? (int)$_POST['is_shared'] : 0;

                $coverRel = generatePdfCover($targetPath, $uploadsDir, pathinfo($safeName, PATHINFO_FILENAME));

                $newPdf = $storage->savePdf($gameId, $title, $relPath, $filesize, $isShared, $coverRel);
                $created[] = $newPdf;
            }

            respond([
                'ok' => true,
                'created' => $created,
                'skipped' => $skipped,
                'pdfs' => $storage->getPdfs($gameId, true)
            ]);
        }

        case 'delete_pdf': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($input['game_id'] ?? 0);
            $pdfId = (int)($input['pdf_id'] ?? 0);

            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            if ($game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the Game Master can delete PDFs.'], 403);
            }

            $storage->deletePdf($pdfId);

            respond([
                'ok' => true,
                'pdfs' => $storage->getPdfs($gameId, true)
            ]);
        }

        case 'share_pdf': {
            $user = getCurrentUser($storage);
            if (!$user) respond(['ok' => false, 'error' => 'Not logged in.'], 401);

            $gameId = (int)($input['game_id'] ?? 0);
            $pdfId = (int)($input['pdf_id'] ?? 0);

            $game = $storage->getGameById($gameId);
            if (!$game) respond(['ok' => false, 'error' => 'Game not found.'], 404);

            if ($game['gm_id'] !== $user['id']) {
                respond(['ok' => false, 'error' => 'Only the Game Master can share PDFs.'], 403);
            }

            $pdf = $storage->getPdfById($pdfId);
            if (!$pdf || $pdf['game_id'] !== $gameId) {
                respond(['ok' => false, 'error' => 'PDF not found.'], 404);
            }

            $isShared = isset($input['is_shared']) ? ((int)$input['is_shared'] ? 1 : 0) : $pdf['is_shared'];
            $updatedPdf = $storage->updatePdf($pdfId, ['is_shared' => $isShared]);

            respond([
                'ok' => true,
                'pdf' => $updatedPdf,
                'pdfs' => $storage->getPdfs($gameId, true)
            ]);
        }

        default:
            respond(['ok' => false, 'error' => 'Unknown API action.'], 400);
    }
} catch (InvalidArgumentException $e) {
    respond(['ok' => false, 'error' => $e->getMessage()], 400);
} catch (Throwable $e) {
    respond(['ok' => false, 'error' => 'Server error: ' . $e->getMessage()], 500);
}
