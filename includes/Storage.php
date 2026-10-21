<?php
declare(strict_types=1);

/**
 * Storage engine for the VTT.
 * Uses SQLite (PDO) when available, with an automatic atomic JSON fallback
 * so the application runs on any PHP installation without extra setup.
 */
class Storage {
    private const DEFAULT_TOKENS = [
        ['title' => 'Balloonist Goblin', 'filename' => 'assets/tokens/balloonist_goblin.png'],
        ['title' => 'Toad', 'filename' => 'assets/tokens/toad.png'],
        ['title' => 'Antenor "Chiado" Alves', 'filename' => 'assets/tokens/antenor_chiado_alves.png'],
        ['title' => 'Hellhound', 'filename' => 'assets/tokens/hellhound.png'],
        ['title' => 'Soldier Theron', 'filename' => 'assets/tokens/soldier_theron.png'],
        ['title' => 'The Old Blind Man', 'filename' => 'assets/tokens/the_old_blind_man.png'],
        ['title' => 'Zombie Pirate', 'filename' => 'assets/tokens/zombie_pirate.png'],
        ['title' => 'Fungril Servant', 'filename' => 'assets/tokens/fungril_servant.png'],
        ['title' => 'Darkness', 'filename' => 'assets/tokens/darkness.png'],
        ['title' => 'Fireworm', 'filename' => 'assets/tokens/fireworm.png'],
        ['title' => 'Ice Alien', 'filename' => 'assets/tokens/ice_alien.png'],
        ['title' => 'Coiled Fire Snake', 'filename' => 'assets/tokens/coiled_fire_snake.png'],
        ['title' => 'Imp Quasit', 'filename' => 'assets/tokens/imp_quasit.png'],
        ['title' => 'Brenn', 'filename' => 'assets/tokens/brenn.png'],
        ['title' => 'Goblin Warrior', 'filename' => 'assets/tokens/goblin_warrior.png'],
        ['title' => 'Luftschiff Captain', 'filename' => 'assets/tokens/luftschiff_captain.png'],
        ['title' => 'Sister Maera (Healer)', 'filename' => 'assets/tokens/sister_maera.png'],
        ['title' => 'Kaela Eisenfaust', 'filename' => 'assets/tokens/kaela_eisenfaust.png'],
        ['title' => 'Tovik', 'filename' => 'assets/tokens/tovik.png'],
        ['title' => 'Varik (der Schweigsame)', 'filename' => 'assets/tokens/varik_der_schweigsame.png'],
        ['title' => 'Catfolk Assassin', 'filename' => 'assets/tokens/catfolk_assassin.png'],
        ['title' => 'Tiefling Bard', 'filename' => 'assets/tokens/tiefling_bard.png'],
        ['title' => 'Dragonkin Soldier', 'filename' => 'assets/tokens/dragonkin_soldier.png'],
        ['title' => 'Human Knight', 'filename' => 'assets/tokens/human_knight.png'],
        ['title' => 'Grand Wizard', 'filename' => 'assets/tokens/grand_wizard.png'],
        ['title' => 'Goblin Warrior 2', 'filename' => 'assets/tokens/goblin_warrior_2.png'],
        ['title' => 'Whisper', 'filename' => 'assets/tokens/whisper.png'],
        ['title' => 'Borin Stonebeard', 'filename' => 'assets/tokens/borin_stonebeard.png'],
        ['title' => 'Thoren Forge', 'filename' => 'assets/tokens/thoren_forge.png'],
        ['title' => 'Seraphina', 'filename' => 'assets/tokens/seraphina.png'],
        ['title' => 'Elias Vance', 'filename' => 'assets/tokens/elias_vance.png'],
        ['title' => 'Milo Bramblebrook', 'filename' => 'assets/tokens/milo_bramblebrook.png'],
        ['title' => 'Sister Lyra', 'filename' => 'assets/tokens/sister_lyra.png'],
        ['title' => 'Lyra Whisperwind', 'filename' => 'assets/tokens/lyra_whisperwind.png'],
        ['title' => 'A Druid', 'filename' => 'assets/tokens/a_druid.png'],
        ['title' => 'Elven Archer', 'filename' => 'assets/tokens/elven_archer.png'],
        ['title' => 'Goblin Forge Warrior', 'filename' => 'assets/tokens/goblin_forge_warrior.png'],
        ['title' => 'Wolf', 'filename' => 'assets/tokens/wolf.png'],
        ['title' => 'Human Soldier', 'filename' => 'assets/tokens/human_soldier.png'],
        ['title' => 'A Green Dragon', 'filename' => 'assets/tokens/a_green_dragon.png'],
        ['title' => 'A Blue Dragon', 'filename' => 'assets/tokens/a_blue_dragon.png'],
    ];

    private string $dataDir;
    private ?PDO $pdo = null;
    private string $jsonFile;

    public function __construct(string $dataDir) {
        $this->dataDir = rtrim($dataDir, '/\\');
        if (!is_dir($this->dataDir)) {
            mkdir($this->dataDir, 0775, true);
        }
        // Protect data directory from direct web access
        $htaccess = $this->dataDir . '/.htaccess';
        if (!file_exists($htaccess)) {
            @file_put_contents($htaccess, "Deny from all\n");
        }

        $this->jsonFile = $this->dataDir . '/vtt_data.json';

        if (extension_loaded('pdo_sqlite')) {
            try {
                $dbPath = $this->dataDir . '/vtt.sqlite';
                $this->pdo = new PDO('sqlite:' . $dbPath);
                $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
                $this->pdo->exec('PRAGMA journal_mode = WAL;');
                $this->initSqliteSchema();
                $stmt = $this->pdo->query("SELECT COUNT(*) FROM users");
                if ((int)$stmt->fetchColumn() === 0 && file_exists($this->jsonFile)) {
                    $this->migrateFromJsonToSqlite();
                }
            } catch (Throwable $e) {
                $this->pdo = null;
            }
        }

        if ($this->pdo === null && !file_exists($this->jsonFile)) {
            $this->writeJsonData([
                'users' => [],
                'games' => [],
                'map_tabs' => [],
                'board_images' => [],
                'board_tokens' => [],
                'messages' => [],
            ]);
        }
    }

    private function initSqliteSchema(): void {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL COLLATE NOCASE,
                email TEXT UNIQUE NOT NULL COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
                is_gm INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                preview_image TEXT NOT NULL DEFAULT '',
                gm_id INTEGER NOT NULL,
                allowed_players TEXT NOT NULL DEFAULT '[]',
                open_rolls INTEGER NOT NULL DEFAULT 0,
                active_map_id INTEGER NOT NULL DEFAULT 0,
                default_tokens_seeded INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS map_tabs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                grid_size REAL NOT NULL DEFAULT 5,
                grid_unit TEXT NOT NULL DEFAULT 'feet',
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS board_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                map_id INTEGER NOT NULL DEFAULT 0,
                title TEXT NOT NULL,
                filename TEXT NOT NULL,
                x REAL NOT NULL DEFAULT 120,
                y REAL NOT NULL DEFAULT 100,
                width REAL NOT NULL DEFAULT 420,
                height REAL NOT NULL DEFAULT 320,
                z_index INTEGER NOT NULL DEFAULT 1,
                on_board INTEGER NOT NULL DEFAULT 0,
                visible INTEGER NOT NULL DEFAULT 0,
                uploaded_by INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS board_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                map_id INTEGER NOT NULL DEFAULT 0,
                title TEXT NOT NULL,
                filename TEXT NOT NULL,
                grid_x INTEGER NOT NULL DEFAULT 2,
                grid_y INTEGER NOT NULL DEFAULT 2,
                tile_size INTEGER NOT NULL DEFAULT 1,
                movable_by TEXT NOT NULL DEFAULT 'gm',
                z_index INTEGER NOT NULL DEFAULT 1,
                on_board INTEGER NOT NULL DEFAULT 0,
                uploaded_by INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                sender_id INTEGER NOT NULL,
                sender_name TEXT NOT NULL,
                sender_role TEXT NOT NULL DEFAULT 'player',
                type TEXT NOT NULL DEFAULT 'chat',
                recipient_id INTEGER NULL,
                recipient_name TEXT NULL,
                is_hidden_roll INTEGER NOT NULL DEFAULT 0,
                content TEXT NOT NULL,
                roll_data TEXT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS password_resets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT UNIQUE NOT NULL,
                expires_at INTEGER NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );
        ");

        // Ensure new columns exist if upgrading from an earlier schema
        try {
            $cols = $this->pdo->query("PRAGMA table_info(board_images)")->fetchAll();
            $colNames = array_column($cols, 'name');
            if (!in_array('on_board', $colNames, true)) {
                $this->pdo->exec("ALTER TABLE board_images ADD COLUMN on_board INTEGER NOT NULL DEFAULT 0");
            }
            if (!in_array('map_id', $colNames, true)) {
                $this->pdo->exec("ALTER TABLE board_images ADD COLUMN map_id INTEGER NOT NULL DEFAULT 0");
            }

            $gameCols = $this->pdo->query("PRAGMA table_info(games)")->fetchAll();
            $gameColNames = array_column($gameCols, 'name');
            if (!in_array('active_map_id', $gameColNames, true)) {
                $this->pdo->exec("ALTER TABLE games ADD COLUMN active_map_id INTEGER NOT NULL DEFAULT 0");
            }
            if (!in_array('preview_image', $gameColNames, true)) {
                $this->pdo->exec("ALTER TABLE games ADD COLUMN preview_image TEXT NOT NULL DEFAULT ''");
            }
            if (!in_array('default_tokens_seeded', $gameColNames, true)) {
                $this->pdo->exec("ALTER TABLE games ADD COLUMN default_tokens_seeded INTEGER NOT NULL DEFAULT 0");
            }

            $tabCols = $this->pdo->query("PRAGMA table_info(map_tabs)")->fetchAll();
            $tabColNames = array_column($tabCols, 'name');
            if (!in_array('grid_type', $tabColNames, true)) {
                $this->pdo->exec("ALTER TABLE map_tabs ADD COLUMN grid_type TEXT NOT NULL DEFAULT 'square'");
            }
            if (!in_array('grid_cell_px', $tabColNames, true)) {
                $this->pdo->exec("ALTER TABLE map_tabs ADD COLUMN grid_cell_px INTEGER NOT NULL DEFAULT 50");
            }
            if (!in_array('grid_color', $tabColNames, true)) {
                $this->pdo->exec("ALTER TABLE map_tabs ADD COLUMN grid_color TEXT NOT NULL DEFAULT 'rgba(255, 255, 255, 0.2)'");
            }
            if (!in_array('grid_offset_x', $tabColNames, true)) {
                $this->pdo->exec("ALTER TABLE map_tabs ADD COLUMN grid_offset_x INTEGER NOT NULL DEFAULT 0");
            }
            if (!in_array('grid_offset_y', $tabColNames, true)) {
                $this->pdo->exec("ALTER TABLE map_tabs ADD COLUMN grid_offset_y INTEGER NOT NULL DEFAULT 0");
            }
            if (!in_array('background_image', $tabColNames, true)) {
                $this->pdo->exec("ALTER TABLE map_tabs ADD COLUMN background_image TEXT NOT NULL DEFAULT ''");
            }
            if (!in_array('background_width', $tabColNames, true)) {
                $this->pdo->exec("ALTER TABLE map_tabs ADD COLUMN background_width REAL NOT NULL DEFAULT 0");
            }
            if (!in_array('background_height', $tabColNames, true)) {
                $this->pdo->exec("ALTER TABLE map_tabs ADD COLUMN background_height REAL NOT NULL DEFAULT 0");
            }
        } catch (Throwable $e) {
            // Ignore
        }
    }

    private function migrateFromJsonToSqlite(): void {
        $data = $this->readJsonData();
        if (empty($data['users']) && empty($data['games'])) {
            return;
        }

        $this->pdo->beginTransaction();
        try {
            foreach ($data['users'] as $u) {
                $stmt = $this->pdo->prepare("INSERT OR IGNORE INTO users (id, username, email, password_hash, is_admin, is_gm, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$u['id'], $u['username'], $u['email'], $u['password_hash'], !empty($u['is_admin']) ? 1 : 0, !empty($u['is_gm']) ? 1 : 0, $u['created_at']]);
            }
            foreach ($data['games'] as $g) {
                $allowed = is_array($g['allowed_players'] ?? null) ? json_encode($g['allowed_players']) : ($g['allowed_players'] ?? '[]');
                $stmt = $this->pdo->prepare("INSERT OR IGNORE INTO games (id, name, description, preview_image, gm_id, allowed_players, open_rolls, active_map_id, default_tokens_seeded, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$g['id'], $g['name'], $g['description'] ?? '', $g['preview_image'] ?? '', $g['gm_id'], $allowed, !empty($g['open_rolls']) ? 1 : 0, $g['active_map_id'] ?? 0, $g['default_tokens_seeded'] ?? 0, $g['created_at']]);
            }
            foreach ($data['map_tabs'] as $t) {
                $stmt = $this->pdo->prepare("INSERT OR IGNORE INTO map_tabs (id, game_id, name, grid_size, grid_unit, created_at) VALUES (?, ?, ?, ?, ?, ?)");
                $stmt->execute([$t['id'], $t['game_id'], $t['name'], $t['grid_size'] ?? 5, $t['grid_unit'] ?? 'feet', $t['created_at']]);
            }
            foreach ($data['board_images'] as $i) {
                $stmt = $this->pdo->prepare("INSERT OR IGNORE INTO board_images (id, game_id, map_id, title, filename, x, y, width, height, z_index, on_board, visible, uploaded_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$i['id'], $i['game_id'], $i['map_id'] ?? 0, $i['title'], $i['filename'], $i['x'] ?? 120, $i['y'] ?? 100, $i['width'] ?? 420, $i['height'] ?? 320, $i['z_index'] ?? 1, !empty($i['on_board']) ? 1 : 0, !empty($i['visible']) ? 1 : 0, $i['uploaded_by'] ?? 1, $i['updated_at'] ?? time()]);
            }
            foreach ($data['board_tokens'] as $tok) {
                $stmt = $this->pdo->prepare("INSERT OR IGNORE INTO board_tokens (id, game_id, map_id, title, filename, grid_x, grid_y, tile_size, movable_by, z_index, on_board, uploaded_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$tok['id'], $tok['game_id'], $tok['map_id'] ?? 0, $tok['title'], $tok['filename'], $tok['grid_x'] ?? 2, $tok['grid_y'] ?? 2, $tok['tile_size'] ?? 1, $tok['movable_by'] ?? 'gm', $tok['z_index'] ?? 1, !empty($tok['on_board']) ? 1 : 0, $tok['uploaded_by'] ?? 1, $tok['updated_at'] ?? time()]);
            }
            foreach ($data['messages'] as $m) {
                $stmt = $this->pdo->prepare("INSERT OR IGNORE INTO messages (id, game_id, sender_id, sender_name, sender_role, type, recipient_id, recipient_name, is_hidden_roll, content, roll_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$m['id'], $m['game_id'], $m['sender_id'], $m['sender_name'], $m['sender_role'] ?? 'player', $m['type'] ?? 'chat', $m['recipient_id'] ?? null, $m['recipient_name'] ?? null, !empty($m['is_hidden_roll']) ? 1 : 0, $m['content'], is_array($m['roll_data'] ?? null) ? json_encode($m['roll_data']) : ($m['roll_data'] ?? null), $m['created_at']]);
            }
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
        }
    }

    private function readJsonData(): array {
        if (!file_exists($this->jsonFile)) {
            return ['users' => [], 'games' => [], 'map_tabs' => [], 'board_images' => [], 'board_tokens' => [], 'messages' => [], 'notes' => []];
        }
        $fp = fopen($this->jsonFile, 'r');
        if (!$fp) {
            return ['users' => [], 'games' => [], 'map_tabs' => [], 'board_images' => [], 'board_tokens' => [], 'messages' => [], 'notes' => []];
        }
        flock($fp, LOCK_SH);
        $raw = stream_get_contents($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        $decoded = json_decode($raw ?: '', true);
        if (!is_array($decoded)) {
            return ['users' => [], 'games' => [], 'map_tabs' => [], 'board_images' => [], 'board_tokens' => [], 'messages' => [], 'notes' => []];
        }
        if (!isset($decoded['map_tabs'])) {
            $decoded['map_tabs'] = [];
        }
        if (!isset($decoded['board_tokens'])) {
            $decoded['board_tokens'] = [];
        }
        if (!isset($decoded['notes'])) {
            $decoded['notes'] = [];
        }
        return $decoded;
    }

    private function writeJsonData(array $data): void {
        $fp = fopen($this->jsonFile, 'c+');
        if (!$fp) {
            throw new RuntimeException('Unable to write data file.');
        }
        flock($fp, LOCK_EX);
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($data, JSON_PRETTY_PRINT));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
    }

    public function hasAdmin(): bool {
        if ($this->pdo) {
            $stmt = $this->pdo->query("SELECT COUNT(*) FROM users WHERE is_admin = 1");
            return ((int)$stmt->fetchColumn()) > 0;
        }
        $data = $this->readJsonData();
        foreach ($data['users'] as $u) {
            if (!empty($u['is_admin'])) {
                return true;
            }
        }
        return false;
    }

    public function createUser(string $username, string $email, string $password, bool $isAdmin = false, bool $isGm = false): array {
        $username = trim($username);
        $email = trim($email);
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $now = time();

        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)");
            $stmt->execute([$username, $email]);
            if ($stmt->fetch()) {
                throw new InvalidArgumentException('Username or email already exists.');
            }
            $stmt = $this->pdo->prepare("
                INSERT INTO users (username, email, password_hash, is_admin, is_gm, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$username, $email, $hash, $isAdmin ? 1 : 0, ($isAdmin || $isGm) ? 1 : 0, $now]);
            $id = (int)$this->pdo->lastInsertId();
            return $this->getUserById($id);
        }

        $data = $this->readJsonData();
        foreach ($data['users'] as $u) {
            if (strcasecmp($u['username'], $username) === 0 || strcasecmp($u['email'], $email) === 0) {
                throw new InvalidArgumentException('Username or email already exists.');
            }
        }
        $nextId = empty($data['users']) ? 1 : (max(array_column($data['users'], 'id')) + 1);
        $user = [
            'id' => $nextId,
            'username' => $username,
            'email' => $email,
            'password_hash' => $hash,
            'is_admin' => $isAdmin ? 1 : 0,
            'is_gm' => ($isAdmin || $isGm) ? 1 : 0,
            'created_at' => $now,
        ];
        $data['users'][] = $user;
        $this->writeJsonData($data);
        unset($user['password_hash']);
        return $user;
    }

    public function authenticate(string $usernameOrEmail, string $password): ?array {
        $usernameOrEmail = trim($usernameOrEmail);
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) LIMIT 1");
            $stmt->execute([$usernameOrEmail, $usernameOrEmail]);
            $user = $stmt->fetch();
            if ($user && password_verify($password, $user['password_hash'])) {
                unset($user['password_hash']);
                $user['id'] = (int)$user['id'];
                $user['is_admin'] = (int)$user['is_admin'];
                $user['is_gm'] = (int)$user['is_gm'];
                return $user;
            }
            return null;
        }

        $data = $this->readJsonData();
        foreach ($data['users'] as $u) {
            if (strcasecmp($u['username'], $usernameOrEmail) === 0 || strcasecmp($u['email'], $usernameOrEmail) === 0) {
                if (password_verify($password, $u['password_hash'])) {
                    unset($u['password_hash']);
                    return $u;
                }
            }
        }
        return null;
    }


    public function getUserById(int $id): ?array {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT id, username, email, is_admin, is_gm, created_at FROM users WHERE id = ?");
            $stmt->execute([$id]);
            $u = $stmt->fetch();
            if (!$u) return null;
            $u['id'] = (int)$u['id'];
            $u['is_admin'] = (int)$u['is_admin'];
            $u['is_gm'] = (int)$u['is_gm'];
            return $u;
        }
        $data = $this->readJsonData();
        foreach ($data['users'] as $u) {
            if ((int)$u['id'] === $id) {
                unset($u['password_hash']);
                return $u;
            }
        }
        return null;
    }


    public function getUserByUsername(string $username): ?array {
        $username = trim($username);
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT id, username, email, is_admin, is_gm, created_at FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1");
            $stmt->execute([$username]);
            $u = $stmt->fetch();
            if (!$u) return null;
            $u['id'] = (int)$u['id'];
            $u['is_admin'] = (int)$u['is_admin'];
            $u['is_gm'] = (int)$u['is_gm'];
            return $u;
        }
        $data = $this->readJsonData();
        foreach ($data['users'] as $u) {
            if (strcasecmp($u['username'], $username) === 0) {
                unset($u['password_hash']);
                return $u;
            }
        }
        return null;
    }


    public function getUserByEmail(string $email): ?array {
        $email = trim($email);
        if ($email === '') return null;
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT id, username, email, is_admin, is_gm, created_at FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1");
            $stmt->execute([$email]);
            $u = $stmt->fetch();
            if (!$u) return null;
            $u['id'] = (int)$u['id'];
            $u['is_admin'] = (int)$u['is_admin'];
            $u['is_gm'] = (int)$u['is_gm'];
            return $u;
        }
        $data = $this->readJsonData();
        foreach ($data['users'] as $u) {
            if (strcasecmp($u['email'], $email) === 0) {
                unset($u['password_hash']);
                return $u;
            }
        }
        return null;
    }


    public function getUserByUsernameOrEmail(string $identifier): ?array {
        $identifier = trim($identifier);
        if ($identifier === '') return null;
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT id, username, email, is_admin, is_gm, created_at FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) LIMIT 1");
            $stmt->execute([$identifier, $identifier]);
            $u = $stmt->fetch();
            if (!$u) return null;
            $u['id'] = (int)$u['id'];
            $u['is_admin'] = (int)$u['is_admin'];
            $u['is_gm'] = (int)$u['is_gm'];
            return $u;
        }
        $data = $this->readJsonData();
        foreach ($data['users'] as $u) {
            if (strcasecmp($u['username'], $identifier) === 0 || strcasecmp($u['email'], $identifier) === 0) {
                unset($u['password_hash']);
                return $u;
            }
        }
        return null;
    }


    public function createPasswordResetToken(int $userId): string {
        $token = bin2hex(random_bytes(32));
        $now = time();
        $expiresAt = $now + 3600; // 1 hour validity

        if ($this->pdo) {
            $del = $this->pdo->prepare("DELETE FROM password_resets WHERE user_id = ?");
            $del->execute([$userId]);

            $stmt = $this->pdo->prepare("INSERT INTO password_resets (user_id, token, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)");
            $stmt->execute([$userId, $token, $expiresAt, $now]);
            return $token;
        }

        $data = $this->readJsonData();
        if (!isset($data['password_resets'])) {
            $data['password_resets'] = [];
        }
        $data['password_resets'] = array_values(array_filter(
            $data['password_resets'],
            fn($r) => (int)$r['user_id'] !== $userId
        ));
        $nextId = empty($data['password_resets']) ? 1 : (max(array_column($data['password_resets'], 'id')) + 1);
        $data['password_resets'][] = [
            'id' => $nextId,
            'user_id' => $userId,
            'token' => $token,
            'expires_at' => $expiresAt,
            'used' => 0,
            'created_at' => $now,
        ];
        $this->writeJsonData($data);
        return $token;
    }


    public function verifyPasswordResetToken(string $token): ?array {
        $token = trim($token);
        if ($token === '') return null;
        $now = time();

        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > ? LIMIT 1");
            $stmt->execute([$token, $now]);
            $row = $stmt->fetch();
            if (!$row) return null;
            $user = $this->getUserById((int)$row['user_id']);
            if (!$user) return null;
            return [
                'reset_id' => (int)$row['id'],
                'user' => $user
            ];
        }

        $data = $this->readJsonData();
        if (empty($data['password_resets'])) return null;
        foreach ($data['password_resets'] as $r) {
            if ($r['token'] === $token && empty($r['used']) && (int)$r['expires_at'] > $now) {
                $user = $this->getUserById((int)$r['user_id']);
                if (!$user) return null;
                return [
                    'reset_id' => (int)$r['id'],
                    'user' => $user
                ];
            }
        }
        return null;
    }


    public function resetPasswordWithToken(string $token, string $newPassword): bool {
        $verified = $this->verifyPasswordResetToken($token);
        if (!$verified) return false;

        $userId = (int)$verified['user']['id'];
        $hash = password_hash($newPassword, PASSWORD_DEFAULT);

        if ($this->pdo) {
            $stmt = $this->pdo->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
            $stmt->execute([$hash, $userId]);
            $mark = $this->pdo->prepare("UPDATE password_resets SET used = 1 WHERE id = ?");
            $mark->execute([(int)$verified['reset_id']]);
            return true;
        }

        $data = $this->readJsonData();
        foreach ($data['users'] as &$u) {
            if ((int)$u['id'] === $userId) {
                $u['password_hash'] = $hash;
                break;
            }
        }
        foreach ($data['password_resets'] as &$r) {
            if ((int)$r['id'] === (int)$verified['reset_id']) {
                $r['used'] = 1;
                break;
            }
        }
        $this->writeJsonData($data);
        return true;
    }


    public function getAllUsers(): array {
        if ($this->pdo) {
            $stmt = $this->pdo->query("SELECT id, username, email, is_admin, is_gm, created_at FROM users ORDER BY username ASC");
            $rows = $stmt->fetchAll();
            foreach ($rows as &$r) {
                $r['id'] = (int)$r['id'];
                $r['is_admin'] = (int)$r['is_admin'];
                $r['is_gm'] = (int)$r['is_gm'];
            }
            return $rows;
        }
        $data = $this->readJsonData();
        $users = array_map(function ($u) {
            unset($u['password_hash']);
            return $u;
        }, $data['users']);
        usort($users, fn($a, $b) => strcasecmp($a['username'], $b['username']));
        return $users;
    }

    public function updateUserRights(int $userId, bool $isGm, bool $isAdmin): ?array {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("UPDATE users SET is_gm = ?, is_admin = ? WHERE id = ?");
            $stmt->execute([$isGm ? 1 : 0, $isAdmin ? 1 : 0, $userId]);
            return $this->getUserById($userId);
        }
        $data = $this->readJsonData();
        foreach ($data['users'] as &$u) {
            if ((int)$u['id'] === $userId) {
                $u['is_gm'] = $isGm ? 1 : 0;
                $u['is_admin'] = $isAdmin ? 1 : 0;
                $this->writeJsonData($data);
                $copy = $u;
                unset($copy['password_hash']);
                return $copy;
            }
        }
        return null;
    }


    public function createGame(string $name, string $description, int $gmId, array $allowedPlayerIds, string $previewImage = ''): array {
        $allowedPlayerIds = array_values(array_filter(
            array_unique(array_map('intval', $allowedPlayerIds)),
            fn($id) => $id > 0 && $id !== $gmId
        ));
        $now = time();

        if ($this->pdo) {
            $stmt = $this->pdo->prepare("
                INSERT INTO games (name, description, preview_image, gm_id, allowed_players, open_rolls, created_at)
                VALUES (?, ?, ?, ?, ?, 0, ?)
            ");
            $stmt->execute([$name, $description, $previewImage, $gmId, json_encode($allowedPlayerIds), $now]);
            $id = (int)$this->pdo->lastInsertId();
            return $this->getGameById($id);
        }

        $data = $this->readJsonData();
        $nextId = empty($data['games']) ? 1 : (max(array_column($data['games'], 'id')) + 1);
        $game = [
            'id' => $nextId,
            'name' => $name,
            'description' => $description,
            'preview_image' => $previewImage,
            'gm_id' => $gmId,
            'allowed_players' => $allowedPlayerIds,
            'open_rolls' => 0,
            'created_at' => $now,
        ];
        $data['games'][] = $game;
        $this->writeJsonData($data);
        return $this->enrichGame($game);
    }

    private function enrichGame(array $game): array {
        $game['id'] = (int)$game['id'];
        $game['gm_id'] = (int)$game['gm_id'];
        $game['preview_image'] = (string)($game['preview_image'] ?? '');
        $game['open_rolls'] = (int)($game['open_rolls'] ?? 0);
        $game['active_map_id'] = (int)($game['active_map_id'] ?? 0);
        if (is_string($game['allowed_players'])) {
            $game['allowed_players'] = json_decode($game['allowed_players'], true) ?: [];
        }
        $game['allowed_players'] = array_values(array_map('intval', $game['allowed_players']));
        $gm = $this->getUserById($game['gm_id']);
        $game['gm_name'] = $gm ? $gm['username'] : 'Unknown GM';
        return $game;
    }

    private function normalizeMapTab(array $tab): array {
        return [
            'id' => (int)$tab['id'],
            'game_id' => (int)$tab['game_id'],
            'name' => (string)$tab['name'],
            'grid_size' => (float)($tab['grid_size'] ?? 5),
            'grid_unit' => in_array($tab['grid_unit'] ?? '', ['feet', 'yards', 'meters'], true) ? $tab['grid_unit'] : 'feet',
            'grid_type' => in_array($tab['grid_type'] ?? '', ['square', 'hex_v', 'hex_h'], true) ? $tab['grid_type'] : 'square',
            'grid_cell_px' => max(15, min(400, (int)($tab['grid_cell_px'] ?? 50))),
            'grid_color' => (string)($tab['grid_color'] ?? 'rgba(255, 255, 255, 0.2)'),
            'grid_offset_x' => (int)($tab['grid_offset_x'] ?? 0),
            'grid_offset_y' => (int)($tab['grid_offset_y'] ?? 0),
            'background_image' => (string)($tab['background_image'] ?? ''),
            'background_width' => (float)($tab['background_width'] ?? 0),
            'background_height' => (float)($tab['background_height'] ?? 0),
            'created_at' => (int)($tab['created_at'] ?? time()),
        ];
    }

    public function getMapTabs(int $gameId): array {
        $tabs = [];
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT * FROM map_tabs WHERE game_id = ? ORDER BY id ASC");
            $stmt->execute([$gameId]);
            foreach ($stmt->fetchAll() as $row) {
                $tabs[] = $this->normalizeMapTab($row);
            }
        } else {
            $data = $this->readJsonData();
            foreach ($data['map_tabs'] as $t) {
                if ((int)$t['game_id'] === $gameId) {
                    $tabs[] = $this->normalizeMapTab($t);
                }
            }
            usort($tabs, fn($a, $b) => $a['id'] <=> $b['id']);
        }

        // Automatically create a default Map Tab if none exists for this game yet
        if (empty($tabs)) {
            if (!$this->getGameById($gameId)) {
                return [];
            }
            $defaultTab = $this->createMapTab($gameId, 'Main Map', 5.0, 'feet');
            $tabs = [$defaultTab];
        }

        // Ensure any legacy board images with map_id = 0 are assigned to the first map tab
        $firstMapId = $tabs[0]['id'];
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("UPDATE board_images SET map_id = ? WHERE game_id = ? AND map_id = 0");
            $stmt->execute([$firstMapId, $gameId]);
        } else {
            $data = $this->readJsonData();
            $changed = false;
            foreach ($data['board_images'] as &$img) {
                if ((int)$img['game_id'] === $gameId && empty($img['map_id'])) {
                    $img['map_id'] = $firstMapId;
                    $changed = true;
                }
            }
            unset($img);
            if ($changed) {
                $this->writeJsonData($data);
            }
        }

        return $tabs;
    }

    public function getMapTabById(int $mapId): ?array {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT * FROM map_tabs WHERE id = ?");
            $stmt->execute([$mapId]);
            $row = $stmt->fetch();
            return $row ? $this->normalizeMapTab($row) : null;
        }
        $data = $this->readJsonData();
        foreach ($data['map_tabs'] as $t) {
            if ((int)$t['id'] === $mapId) {
                return $this->normalizeMapTab($t);
            }
        }
        return null;
    }

    public function updateMapTabGrid(
        int $mapId,
        string $gridType,
        int $gridCellPx,
        string $gridColor,
        int $gridOffsetX,
        int $gridOffsetY,
        ?string $backgroundImage = null,
        float $backgroundWidth = 0,
        float $backgroundHeight = 0
    ): ?array {
        $gridType = in_array($gridType, ['square', 'hex_v', 'hex_h'], true) ? $gridType : 'square';
        $gridCellPx = max(15, min(400, $gridCellPx));
        $gridColor = trim($gridColor) !== '' ? trim($gridColor) : 'rgba(255, 255, 255, 0.2)';

        if ($this->pdo) {
            if ($backgroundImage !== null) {
                $stmt = $this->pdo->prepare("
                    UPDATE map_tabs 
                    SET grid_type = ?, grid_cell_px = ?, grid_color = ?, grid_offset_x = ?, grid_offset_y = ?,
                        background_image = ?, background_width = ?, background_height = ?
                    WHERE id = ?
                ");
                $stmt->execute([$gridType, $gridCellPx, $gridColor, $gridOffsetX, $gridOffsetY, $backgroundImage, $backgroundWidth, $backgroundHeight, $mapId]);
            } else {
                $stmt = $this->pdo->prepare("
                    UPDATE map_tabs 
                    SET grid_type = ?, grid_cell_px = ?, grid_color = ?, grid_offset_x = ?, grid_offset_y = ?
                    WHERE id = ?
                ");
                $stmt->execute([$gridType, $gridCellPx, $gridColor, $gridOffsetX, $gridOffsetY, $mapId]);
            }
            return $this->getMapTabById($mapId);
        }

        $data = $this->readJsonData();
        foreach ($data['map_tabs'] as &$t) {
            if ((int)$t['id'] === $mapId) {
                $t['grid_type'] = $gridType;
                $t['grid_cell_px'] = $gridCellPx;
                $t['grid_color'] = $gridColor;
                $t['grid_offset_x'] = $gridOffsetX;
                $t['grid_offset_y'] = $gridOffsetY;
                if ($backgroundImage !== null) {
                    $t['background_image'] = $backgroundImage;
                    $t['background_width'] = $backgroundWidth;
                    $t['background_height'] = $backgroundHeight;
                }
                $this->writeJsonData($data);
                return $this->normalizeMapTab($t);
            }
        }
        return null;
    }


    public function createMapTab(int $gameId, string $name, float $gridSize, string $gridUnit): array {
        $name = trim($name) !== '' ? trim($name) : 'New Map';
        $gridSize = max(0.5, min(1000.0, $gridSize));
        $gridUnit = in_array($gridUnit, ['feet', 'yards', 'meters'], true) ? $gridUnit : 'feet';
        $now = time();
        $game = $this->getGameById($gameId);

        if ($this->pdo) {
            $stmt = $this->pdo->prepare("
                INSERT INTO map_tabs (game_id, name, grid_size, grid_unit, created_at)
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([$gameId, $name, $gridSize, $gridUnit, $now]);
            $id = (int)$this->pdo->lastInsertId();
            if (!$game || empty($game['active_map_id'])) {
                $this->setActiveMapTab($gameId, $id);
            }
            return $this->getMapTabById($id);
        }

        $data = $this->readJsonData();
        $nextId = empty($data['map_tabs']) ? 1 : (max(array_column($data['map_tabs'], 'id')) + 1);
        $tab = [
            'id' => $nextId,
            'game_id' => $gameId,
            'name' => $name,
            'grid_size' => $gridSize,
            'grid_unit' => $gridUnit,
            'created_at' => $now,
        ];
        $data['map_tabs'][] = $tab;
        foreach ($data['games'] as &$g) {
            if ((int)$g['id'] === $gameId && empty($g['active_map_id'])) {
                $g['active_map_id'] = $nextId;
            }
        }
        unset($g);
        $this->writeJsonData($data);
        return $this->normalizeMapTab($tab);
    }

    public function updateMapTab(int $mapId, string $name, float $gridSize, string $gridUnit): ?array {
        $name = trim($name) !== '' ? trim($name) : 'Map';
        $gridSize = max(0.5, min(1000.0, $gridSize));
        $gridUnit = in_array($gridUnit, ['feet', 'yards', 'meters'], true) ? $gridUnit : 'feet';

        if ($this->pdo) {
            $stmt = $this->pdo->prepare("UPDATE map_tabs SET name = ?, grid_size = ?, grid_unit = ? WHERE id = ?");
            $stmt->execute([$name, $gridSize, $gridUnit, $mapId]);
            return $this->getMapTabById($mapId);
        }

        $data = $this->readJsonData();
        foreach ($data['map_tabs'] as &$t) {
            if ((int)$t['id'] === $mapId) {
                $t['name'] = $name;
                $t['grid_size'] = $gridSize;
                $t['grid_unit'] = $gridUnit;
                $this->writeJsonData($data);
                return $this->normalizeMapTab($t);
            }
        }
        return null;
    }


    public function deleteMapTab(int $mapId): bool {
        $tab = $this->getMapTabById($mapId);
        if (!$tab) return false;
        $gameId = $tab['game_id'];

        $allTabs = $this->getMapTabs($gameId);
        if (count($allTabs) <= 1) {
            throw new InvalidArgumentException('A game must have at least one map tab.');
        }

        $game = $this->getGameById($gameId);
        $wasActiveForPlayers = $game && (int)$game['active_map_id'] === $mapId;

        if ($this->pdo) {
            // Return images and tokens on this map tab back to the game library
            $stmt = $this->pdo->prepare("UPDATE board_images SET on_board = 0, visible = 0 WHERE map_id = ?");
            $stmt->execute([$mapId]);

            $stmt = $this->pdo->prepare("UPDATE board_tokens SET on_board = 0 WHERE map_id = ?");
            $stmt->execute([$mapId]);

            $stmt = $this->pdo->prepare("DELETE FROM map_tabs WHERE id = ?");
            $stmt->execute([$mapId]);

            if ($wasActiveForPlayers) {
                $remaining = $this->getMapTabs($gameId);
                $this->setActiveMapTab($gameId, $remaining[0]['id']);
            }
            return true;
        }

        $data = $this->readJsonData();
        foreach ($data['board_images'] as &$img) {
            if ((int)($img['map_id'] ?? 0) === $mapId) {
                $img['on_board'] = 0;
                $img['visible'] = 0;
            }
        }
        unset($img);
        foreach ($data['board_tokens'] as &$tok) {
            if ((int)($tok['map_id'] ?? 0) === $mapId) {
                $tok['on_board'] = 0;
            }
        }
        unset($tok);
        $data['map_tabs'] = array_values(array_filter($data['map_tabs'], fn($t) => (int)$t['id'] !== $mapId));
        $this->writeJsonData($data);

        if ($wasActiveForPlayers) {
            $remaining = $this->getMapTabs($gameId);
            $this->setActiveMapTab($gameId, $remaining[0]['id']);
        }
        return true;
    }

    public function setActiveMapTab(int $gameId, int $mapId): void {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("UPDATE games SET active_map_id = ? WHERE id = ?");
            $stmt->execute([$mapId, $gameId]);
            return;
        }
        $data = $this->readJsonData();
        foreach ($data['games'] as &$g) {
            if ((int)$g['id'] === $gameId) {
                $g['active_map_id'] = $mapId;
                $this->writeJsonData($data);
                return;
            }
        }
    }

    public function getGameById(int $gameId): ?array {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT * FROM games WHERE id = ?");
            $stmt->execute([$gameId]);
            $g = $stmt->fetch();
            return $g ? $this->enrichGame($g) : null;
        }
        $data = $this->readJsonData();
        foreach ($data['games'] as $g) {
            if ((int)$g['id'] === $gameId) {
                return $this->enrichGame($g);
            }
        }
        return null;
    }


    public function getGamesForUser(int $userId, bool $isAdmin = false): array {
        $allGames = [];
        if ($this->pdo) {
            $stmt = $this->pdo->query("SELECT * FROM games ORDER BY created_at DESC");
            $rows = $stmt->fetchAll();
            foreach ($rows as $r) {
                $allGames[] = $this->enrichGame($r);
            }
        } else {
            $data = $this->readJsonData();
            foreach (array_reverse($data['games']) as $g) {
                $allGames[] = $this->enrichGame($g);
            }
        }

        return array_values(array_filter($allGames, function ($g) use ($userId, $isAdmin) {
            return $g['gm_id'] === $userId || in_array($userId, $g['allowed_players'], true) || $isAdmin;
        }));
    }

    public function updateGameAccess(
        int $gameId,
        string $name,
        string $description,
        array $allowedPlayerIds,
        int $newOwnerId = 0,
        ?string $previewImage = null
    ): ?array {
        $current = $this->getGameById($gameId);
        if (!$current) return null;

        $ownerId = ($newOwnerId > 0) ? $newOwnerId : $current['gm_id'];
        if ($ownerId !== $current['gm_id']) {
            // Keep previous owner in allowed_players so they still have player access after transferring ownership
            $allowedPlayerIds[] = $current['gm_id'];
        }
        $allowedPlayerIds = array_values(array_filter(
            array_unique(array_map('intval', $allowedPlayerIds)),
            fn($id) => $id > 0 && $id !== $ownerId
        ));
        $finalPreview = $previewImage !== null ? $previewImage : $current['preview_image'];

        if ($this->pdo) {
            $stmt = $this->pdo->prepare("
                UPDATE games
                SET name = ?, description = ?, preview_image = ?, gm_id = ?, allowed_players = ?
                WHERE id = ?
            ");
            $stmt->execute([$name, $description, $finalPreview, $ownerId, json_encode($allowedPlayerIds), $gameId]);
            return $this->getGameById($gameId);
        }
        $data = $this->readJsonData();
        foreach ($data['games'] as &$g) {
            if ((int)$g['id'] === $gameId) {
                $g['name'] = $name;
                $g['description'] = $description;
                $g['preview_image'] = $finalPreview;
                $g['gm_id'] = $ownerId;
                $g['allowed_players'] = $allowedPlayerIds;
                $this->writeJsonData($data);
                return $this->enrichGame($g);
            }
        }
        return null;
    }


    public function countFileReferences(string $filename, int $excludeGameId = 0): int {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("
                SELECT 
                    (SELECT COUNT(*) FROM board_tokens WHERE filename = ? AND game_id != ?) +
                    (SELECT COUNT(*) FROM board_images WHERE filename = ? AND game_id != ?) +
                    (SELECT COUNT(*) FROM map_tabs WHERE background_image = ? AND game_id != ?) +
                    (SELECT COUNT(*) FROM games WHERE preview_image = ? AND id != ?)
            ");
            $stmt->execute([$filename, $excludeGameId, $filename, $excludeGameId, $filename, $excludeGameId, $filename, $excludeGameId]);
            return (int)$stmt->fetchColumn();
        }

        $data = $this->readJsonData();
        $count = 0;
        foreach ($data['board_tokens'] as $tok) {
            if ($tok['filename'] === $filename && (int)($tok['game_id'] ?? 0) !== $excludeGameId) $count++;
        }
        foreach ($data['board_images'] as $img) {
            if ($img['filename'] === $filename && (int)($img['game_id'] ?? 0) !== $excludeGameId) $count++;
        }
        foreach ($data['map_tabs'] as $mt) {
            if (($mt['background_image'] ?? '') === $filename && (int)($mt['game_id'] ?? 0) !== $excludeGameId) $count++;
        }
        foreach ($data['games'] as $g) {
            if (($g['preview_image'] ?? '') === $filename && (int)($g['id'] ?? 0) !== $excludeGameId) $count++;
        }
        return $count;
    }

    public function deleteGame(int $gameId): bool {
        $game = $this->getGameById($gameId);
        if (!$game) {
            return false;
        }

        // Collect all uploaded file paths to clean up
        $filesToDelete = [];

        if (!empty($game['preview_image']) && str_starts_with($game['preview_image'], 'uploads/')) {
            $filesToDelete[] = $game['preview_image'];
        }

        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT filename FROM board_images WHERE game_id = ?");
            $stmt->execute([$gameId]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $fn) {
                if ($fn && str_starts_with($fn, 'uploads/')) {
                    $filesToDelete[] = $fn;
                }
            }

            $stmt = $this->pdo->prepare("SELECT filename FROM board_tokens WHERE game_id = ?");
            $stmt->execute([$gameId]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $fn) {
                // Strictly delete uploads/ tokens; NEVER touch assets/tokens/
                if ($fn && str_starts_with($fn, 'uploads/')) {
                    $filesToDelete[] = $fn;
                }
            }

            $stmt = $this->pdo->prepare("SELECT background_image FROM map_tabs WHERE game_id = ?");
            $stmt->execute([$gameId]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $fn) {
                if ($fn && str_starts_with($fn, 'uploads/')) {
                    $filesToDelete[] = $fn;
                }
            }

            $this->pdo->beginTransaction();
            try {
                $stmt = $this->pdo->prepare("DELETE FROM messages WHERE game_id = ?");
                $stmt->execute([$gameId]);

                $stmt = $this->pdo->prepare("DELETE FROM board_tokens WHERE game_id = ?");
                $stmt->execute([$gameId]);

                $stmt = $this->pdo->prepare("DELETE FROM board_images WHERE game_id = ?");
                $stmt->execute([$gameId]);

                $stmt = $this->pdo->prepare("DELETE FROM notes WHERE game_id = ?");
                $stmt->execute([$gameId]);

                $stmt = $this->pdo->prepare("DELETE FROM map_tabs WHERE game_id = ?");
                $stmt->execute([$gameId]);

                $stmt = $this->pdo->prepare("DELETE FROM games WHERE id = ?");
                $stmt->execute([$gameId]);

                $this->pdo->commit();
            } catch (Throwable $e) {
                if ($this->pdo->inTransaction()) {
                    $this->pdo->rollBack();
                }
                throw $e;
            }
        } else {
            $data = $this->readJsonData();

            foreach ($data['board_images'] as $img) {
                if ((int)$img['game_id'] === $gameId && !empty($img['filename']) && str_starts_with($img['filename'], 'uploads/')) {
                    $filesToDelete[] = $img['filename'];
                }
            }

            foreach ($data['board_tokens'] as $tok) {
                if ((int)$tok['game_id'] === $gameId && !empty($tok['filename']) && str_starts_with($tok['filename'], 'uploads/')) {
                    $filesToDelete[] = $tok['filename'];
                }
            }

            foreach ($data['map_tabs'] as $mt) {
                if ((int)$mt['game_id'] === $gameId && !empty($mt['background_image']) && str_starts_with($mt['background_image'], 'uploads/')) {
                    $filesToDelete[] = $mt['background_image'];
                }
            }

            $data['messages'] = array_values(array_filter($data['messages'], fn($m) => (int)$m['game_id'] !== $gameId));
            $data['board_tokens'] = array_values(array_filter($data['board_tokens'], fn($t) => (int)$t['game_id'] !== $gameId));
            $data['board_images'] = array_values(array_filter($data['board_images'], fn($i) => (int)$i['game_id'] !== $gameId));
            if (isset($data['notes'])) {
                $data['notes'] = array_values(array_filter($data['notes'], fn($n) => (int)$n['game_id'] !== $gameId));
            }
            $data['map_tabs'] = array_values(array_filter($data['map_tabs'], fn($tab) => (int)$tab['game_id'] !== $gameId));
            $data['games'] = array_values(array_filter($data['games'], fn($g) => (int)$g['id'] !== $gameId));

            $this->writeJsonData($data);
        }

        // Unlink files from disk if no other campaign uses them
        $filesToDelete = array_unique($filesToDelete);
        $projectRoot = dirname($this->dataDir);
        foreach ($filesToDelete as $file) {
            $normalized = str_replace('\\', '/', $file);
            if (!str_starts_with($normalized, 'uploads/')) {
                continue;
            }
            if ($this->countFileReferences($file, 0) === 0) {
                $absPath = $projectRoot . '/' . $normalized;
                if (is_file($absPath)) {
                    @unlink($absPath);
                }
            }
        }

        return true;
    }

    public function toggleGameOpenRolls(int $gameId, ?bool $forceState = null): bool {
        $game = $this->getGameById($gameId);
        if (!$game) {
            throw new InvalidArgumentException('Game not found.');
        }
        $newState = $forceState !== null ? $forceState : !$game['open_rolls'];
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("UPDATE games SET open_rolls = ? WHERE id = ?");
            $stmt->execute([$newState ? 1 : 0, $gameId]);
            return $newState;
        }
        $data = $this->readJsonData();
        foreach ($data['games'] as &$g) {
            if ((int)$g['id'] === $gameId) {
                $g['open_rolls'] = $newState ? 1 : 0;
                $this->writeJsonData($data);
                return $newState;
            }
        }
        return $newState;
    }

    public function addBoardImage(int $gameId, string $title, string $filename, float $x, float $y, float $width, float $height, int $uploadedBy): array {
        $now = time();
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT COALESCE(MAX(z_index), 0) + 1 FROM board_images WHERE game_id = ?");
            $stmt->execute([$gameId]);
            $zIndex = (int)$stmt->fetchColumn();

            $stmt = $this->pdo->prepare("
                INSERT INTO board_images (game_id, title, filename, x, y, width, height, z_index, on_board, visible, uploaded_by, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
            ");
            $stmt->execute([$gameId, $title, $filename, $x, $y, $width, $height, $zIndex, $uploadedBy, $now]);
            $id = (int)$this->pdo->lastInsertId();
            return $this->getBoardImageById($id);
        }

        $data = $this->readJsonData();
        $maxZ = 0;
        foreach ($data['board_images'] as $img) {
            if ((int)$img['game_id'] === $gameId && (int)$img['z_index'] > $maxZ) {
                $maxZ = (int)$img['z_index'];
            }
        }
        $nextId = empty($data['board_images']) ? 1 : (max(array_column($data['board_images'], 'id')) + 1);
        $img = [
            'id' => $nextId,
            'game_id' => $gameId,
            'title' => $title,
            'filename' => $filename,
            'x' => $x,
            'y' => $y,
            'width' => $width,
            'height' => $height,
            'z_index' => $maxZ + 1,
            'on_board' => 0,
            'visible' => 0,
            'uploaded_by' => $uploadedBy,
            'updated_at' => $now,
        ];
        $data['board_images'][] = $img;
        $this->writeJsonData($data);
        return $this->normalizeImage($img);
    }

    private function normalizeImage(array $img): array {
        return [
            'id' => (int)$img['id'],
            'game_id' => (int)$img['game_id'],
            'map_id' => (int)($img['map_id'] ?? 0),
            'title' => (string)$img['title'],
            'filename' => (string)$img['filename'],
            'x' => (float)$img['x'],
            'y' => (float)$img['y'],
            'width' => (float)$img['width'],
            'height' => (float)$img['height'],
            'z_index' => (int)$img['z_index'],
            'on_board' => (int)($img['on_board'] ?? 0) === 1,
            'visible' => (int)$img['visible'] === 1,
            'uploaded_by' => (int)$img['uploaded_by'],
            'updated_at' => (int)$img['updated_at'],
        ];
    }

    public function getBoardImageById(int $imageId): ?array {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT * FROM board_images WHERE id = ?");
            $stmt->execute([$imageId]);
            $row = $stmt->fetch();
            return $row ? $this->normalizeImage($row) : null;
        }
        $data = $this->readJsonData();
        foreach ($data['board_images'] as $img) {
            if ((int)$img['id'] === $imageId) {
                return $this->normalizeImage($img);
            }
        }
        return null;
    }


    public function getBoardImages(int $gameId, bool $isGmView, ?int $mapId = null): array {
        $images = [];
        if ($this->pdo) {
            if ($mapId !== null && $mapId > 0) {
                if ($isGmView) {
                    $stmt = $this->pdo->prepare("SELECT * FROM board_images WHERE game_id = ? AND map_id = ? AND on_board = 1 ORDER BY z_index ASC, id ASC");
                    $stmt->execute([$gameId, $mapId]);
                } else {
                    $stmt = $this->pdo->prepare("SELECT * FROM board_images WHERE game_id = ? AND map_id = ? AND on_board = 1 AND visible = 1 ORDER BY z_index ASC, id ASC");
                    $stmt->execute([$gameId, $mapId]);
                }
            } else {
                if ($isGmView) {
                    $stmt = $this->pdo->prepare("SELECT * FROM board_images WHERE game_id = ? AND on_board = 1 ORDER BY z_index ASC, id ASC");
                    $stmt->execute([$gameId]);
                } else {
                    $stmt = $this->pdo->prepare("SELECT * FROM board_images WHERE game_id = ? AND on_board = 1 AND visible = 1 ORDER BY z_index ASC, id ASC");
                    $stmt->execute([$gameId]);
                }
            }
            foreach ($stmt->fetchAll() as $row) {
                $images[] = $this->normalizeImage($row);
            }
            return $images;
        }

        $data = $this->readJsonData();
        foreach ($data['board_images'] as $img) {
            if ((int)$img['game_id'] !== $gameId) continue;
            $norm = $this->normalizeImage($img);
            if (!$norm['on_board']) continue;
            if ($mapId !== null && $mapId > 0 && $norm['map_id'] !== $mapId) continue;
            if (!$isGmView && !$norm['visible']) continue;
            $images[] = $norm;
        }
        usort($images, fn($a, $b) => ($a['z_index'] <=> $b['z_index']) ?: ($a['id'] <=> $b['id']));
        return $images;
    }

    public function getLibraryImages(int $gameId): array {
        $images = [];
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT * FROM board_images WHERE game_id = ? ORDER BY id DESC");
            $stmt->execute([$gameId]);
            foreach ($stmt->fetchAll() as $row) {
                $images[] = $this->normalizeImage($row);
            }
            return $images;
        }

        $data = $this->readJsonData();
        foreach ($data['board_images'] as $img) {
            if ((int)$img['game_id'] !== $gameId) continue;
            $images[] = $this->normalizeImage($img);
        }
        usort($images, fn($a, $b) => $b['id'] <=> $a['id']);
        return $images;
    }

    public function updateBoardImage(int $imageId, array $fields): ?array {
        $now = time();
        if ($this->pdo) {
            $current = $this->getBoardImageById($imageId);
            if (!$current) return null;

            $x = isset($fields['x']) ? (float)$fields['x'] : $current['x'];
            $y = isset($fields['y']) ? (float)$fields['y'] : $current['y'];
            $width = isset($fields['width']) ? max(60.0, (float)$fields['width']) : $current['width'];
            $height = isset($fields['height']) ? max(60.0, (float)$fields['height']) : $current['height'];
            $mapId = isset($fields['map_id']) ? (int)$fields['map_id'] : $current['map_id'];
            $onBoard = isset($fields['on_board']) ? ($fields['on_board'] ? 1 : 0) : ($current['on_board'] ? 1 : 0);
            $visible = isset($fields['visible']) ? ($fields['visible'] ? 1 : 0) : ($current['visible'] ? 1 : 0);
            $zIndex = isset($fields['z_index']) ? (int)$fields['z_index'] : $current['z_index'];

            if (!empty($fields['bring_to_front'])) {
                $stmt = $this->pdo->prepare("SELECT COALESCE(MAX(z_index), 0) + 1 FROM board_images WHERE game_id = ?");
                $stmt->execute([$current['game_id']]);
                $zIndex = (int)$stmt->fetchColumn();
            }

            $stmt = $this->pdo->prepare("
                UPDATE board_images
                SET map_id = ?, x = ?, y = ?, width = ?, height = ?, on_board = ?, visible = ?, z_index = ?, updated_at = ?
                WHERE id = ?
            ");
            $stmt->execute([$mapId, $x, $y, $width, $height, $onBoard, $visible, $zIndex, $now, $imageId]);
            return $this->getBoardImageById($imageId);
        }

        $data = $this->readJsonData();
        $gameId = null;
        foreach ($data['board_images'] as $img) {
            if ((int)$img['id'] === $imageId) {
                $gameId = (int)$img['game_id'];
                break;
            }
        }
        if ($gameId === null) return null;

        $maxZ = 0;
        if (!empty($fields['bring_to_front'])) {
            foreach ($data['board_images'] as $img) {
                if ((int)$img['game_id'] === $gameId && (int)$img['z_index'] > $maxZ) {
                    $maxZ = (int)$img['z_index'];
                }
            }
        }

        foreach ($data['board_images'] as &$img) {
            if ((int)$img['id'] === $imageId) {
                if (isset($fields['map_id'])) $img['map_id'] = (int)$fields['map_id'];
                if (isset($fields['x'])) $img['x'] = (float)$fields['x'];
                if (isset($fields['y'])) $img['y'] = (float)$fields['y'];
                if (isset($fields['width'])) $img['width'] = max(60.0, (float)$fields['width']);
                if (isset($fields['height'])) $img['height'] = max(60.0, (float)$fields['height']);
                if (isset($fields['on_board'])) $img['on_board'] = $fields['on_board'] ? 1 : 0;
                if (isset($fields['visible'])) $img['visible'] = $fields['visible'] ? 1 : 0;
                if (!empty($fields['bring_to_front'])) $img['z_index'] = $maxZ + 1;
                $img['updated_at'] = $now;
                $this->writeJsonData($data);
                return $this->normalizeImage($img);
            }
        }
        return null;
    }


    public function deleteBoardImage(int $imageId): bool {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("DELETE FROM board_images WHERE id = ?");
            $stmt->execute([$imageId]);
            return $stmt->rowCount() > 0;
        }
        $data = $this->readJsonData();
        $before = count($data['board_images']);
        $data['board_images'] = array_values(array_filter(
            $data['board_images'],
            fn($img) => (int)$img['id'] !== $imageId
        ));
        if (count($data['board_images']) !== $before) {
            $this->writeJsonData($data);
            return true;
        }
        return false;
    }

    private function normalizeToken(array $tok): array {
        return [
            'id' => (int)$tok['id'],
            'game_id' => (int)$tok['game_id'],
            'map_id' => (int)($tok['map_id'] ?? 0),
            'title' => (string)$tok['title'],
            'filename' => (string)$tok['filename'],
            'grid_x' => max(0, (int)($tok['grid_x'] ?? 2)),
            'grid_y' => max(0, (int)($tok['grid_y'] ?? 2)),
            'tile_size' => max(1, min(12, (int)($tok['tile_size'] ?? 1))),
            'movable_by' => (string)($tok['movable_by'] ?? 'gm'),
            'z_index' => (int)($tok['z_index'] ?? 1),
            'on_board' => (int)($tok['on_board'] ?? 0) === 1,
            'uploaded_by' => (int)$tok['uploaded_by'],
            'updated_at' => (int)$tok['updated_at'],
        ];
    }

    public function addBoardToken(
        int $gameId,
        string $title,
        string $filename,
        int $gridX,
        int $gridY,
        int $tileSize,
        string $movableBy,
        int $uploadedBy
    ): array {
        $now = time();
        $gridX = max(0, $gridX);
        $gridY = max(0, $gridY);
        $tileSize = max(1, min(12, $tileSize));

        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT COALESCE(MAX(z_index), 0) + 1 FROM board_tokens WHERE game_id = ?");
            $stmt->execute([$gameId]);
            $zIndex = (int)$stmt->fetchColumn();

            $stmt = $this->pdo->prepare("
                INSERT INTO board_tokens (game_id, map_id, title, filename, grid_x, grid_y, tile_size, movable_by, z_index, on_board, uploaded_by, updated_at)
                VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            ");
            $stmt->execute([$gameId, $title, $filename, $gridX, $gridY, $tileSize, $movableBy, $zIndex, $uploadedBy, $now]);
            $id = (int)$this->pdo->lastInsertId();
            return $this->getBoardTokenById($id);
        }

        $data = $this->readJsonData();
        $maxZ = 0;
        foreach ($data['board_tokens'] as $tok) {
            if ((int)$tok['game_id'] === $gameId && (int)$tok['z_index'] > $maxZ) {
                $maxZ = (int)$tok['z_index'];
            }
        }
        $nextId = empty($data['board_tokens']) ? 1 : (max(array_column($data['board_tokens'], 'id')) + 1);
        $tok = [
            'id' => $nextId,
            'game_id' => $gameId,
            'map_id' => 0,
            'title' => $title,
            'filename' => $filename,
            'grid_x' => $gridX,
            'grid_y' => $gridY,
            'tile_size' => $tileSize,
            'movable_by' => $movableBy,
            'z_index' => $maxZ + 1,
            'on_board' => 0,
            'uploaded_by' => $uploadedBy,
            'updated_at' => $now,
        ];
        $data['board_tokens'][] = $tok;
        $this->writeJsonData($data);
        return $this->normalizeToken($tok);
    }

    public function getBoardTokenById(int $tokenId): ?array {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT * FROM board_tokens WHERE id = ?");
            $stmt->execute([$tokenId]);
            $row = $stmt->fetch();
            return $row ? $this->normalizeToken($row) : null;
        }
        $data = $this->readJsonData();
        foreach ($data['board_tokens'] as $tok) {
            if ((int)$tok['id'] === $tokenId) {
                return $this->normalizeToken($tok);
            }
        }
        return null;
    }


    public function getBoardTokens(int $gameId, ?int $mapId = null): array {
        $tokens = [];
        if ($this->pdo) {
            if ($mapId !== null && $mapId > 0) {
                $stmt = $this->pdo->prepare("SELECT * FROM board_tokens WHERE game_id = ? AND map_id = ? AND on_board = 1 ORDER BY z_index ASC, id ASC");
                $stmt->execute([$gameId, $mapId]);
            } else {
                $stmt = $this->pdo->prepare("SELECT * FROM board_tokens WHERE game_id = ? AND on_board = 1 ORDER BY z_index ASC, id ASC");
                $stmt->execute([$gameId]);
            }
            foreach ($stmt->fetchAll() as $row) {
                $tokens[] = $this->normalizeToken($row);
            }
            return $tokens;
        }

        $data = $this->readJsonData();
        foreach ($data['board_tokens'] as $tok) {
            if ((int)$tok['game_id'] !== $gameId) continue;
            $norm = $this->normalizeToken($tok);
            if (!$norm['on_board']) continue;
            if ($mapId !== null && $mapId > 0 && $norm['map_id'] !== $mapId) continue;
            $tokens[] = $norm;
        }
        usort($tokens, fn($a, $b) => ($a['z_index'] <=> $b['z_index']) ?: ($a['id'] <=> $b['id']));
        return $tokens;
    }

    public function ensureDefaultTokens(int $gameId): void {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT gm_id, default_tokens_seeded FROM games WHERE id = ?");
            $stmt->execute([$gameId]);
            $row = $stmt->fetch();
            if (!$row) {
                return;
            }
            if ((int)($row['default_tokens_seeded'] ?? 0) >= 2) {
                return;
            }
            $gmId = (int)$row['gm_id'];

            $stmt = $this->pdo->prepare("SELECT filename FROM board_tokens WHERE game_id = ?");
            $stmt->execute([$gameId]);
            $existingFiles = array_column($stmt->fetchAll(), 'filename');

            foreach (array_reverse(self::DEFAULT_TOKENS) as $def) {
                if (!in_array($def['filename'], $existingFiles, true)) {
                    $this->addBoardToken($gameId, $def['title'], $def['filename'], 2, 2, 1, 'gm', $gmId);
                }
            }

            $stmt = $this->pdo->prepare("UPDATE games SET default_tokens_seeded = 2 WHERE id = ?");
            $stmt->execute([$gameId]);
            return;
        }

        $data = $this->readJsonData();
        $gmId = 0;
        $seeded = 0;
        foreach ($data['games'] as $g) {
            if ((int)$g['id'] === $gameId) {
                $gmId = (int)$g['gm_id'];
                $seeded = (int)($g['default_tokens_seeded'] ?? 0);
                break;
            }
        }
        if ($gmId <= 0 || $seeded >= 2) {
            return;
        }

        $existingFiles = [];
        foreach ($data['board_tokens'] as $tok) {
            if ((int)$tok['game_id'] === $gameId) {
                $existingFiles[] = $tok['filename'];
            }
        }

        foreach (array_reverse(self::DEFAULT_TOKENS) as $def) {
            if (!in_array($def['filename'], $existingFiles, true)) {
                $this->addBoardToken($gameId, $def['title'], $def['filename'], 2, 2, 1, 'gm', $gmId);
            }
        }

        $data = $this->readJsonData();
        foreach ($data['games'] as &$g) {
            if ((int)$g['id'] === $gameId) {
                $g['default_tokens_seeded'] = 2;
                break;
            }
        }
        unset($g);
        $this->writeJsonData($data);
    }

    public function getLibraryTokens(int $gameId): array {
        $this->ensureDefaultTokens($gameId);
        $tokens = [];
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT * FROM board_tokens WHERE game_id = ? ORDER BY id DESC");
            $stmt->execute([$gameId]);
            foreach ($stmt->fetchAll() as $row) {
                $tokens[] = $this->normalizeToken($row);
            }
            return $tokens;
        }

        $data = $this->readJsonData();
        foreach ($data['board_tokens'] as $tok) {
            if ((int)$tok['game_id'] !== $gameId) continue;
            $tokens[] = $this->normalizeToken($tok);
        }
        usort($tokens, fn($a, $b) => $b['id'] <=> $a['id']);
        return $tokens;
    }

    public function updateBoardToken(int $tokenId, array $fields): ?array {
        $now = time();
        if ($this->pdo) {
            $current = $this->getBoardTokenById($tokenId);
            if (!$current) return null;

            $gridX = isset($fields['grid_x']) ? max(0, (int)$fields['grid_x']) : $current['grid_x'];
            $gridY = isset($fields['grid_y']) ? max(0, (int)$fields['grid_y']) : $current['grid_y'];
            $tileSize = isset($fields['tile_size']) ? max(1, min(12, (int)$fields['tile_size'])) : $current['tile_size'];
            $movableBy = isset($fields['movable_by']) ? (string)$fields['movable_by'] : $current['movable_by'];
            $mapId = isset($fields['map_id']) ? (int)$fields['map_id'] : $current['map_id'];
            $onBoard = isset($fields['on_board']) ? ($fields['on_board'] ? 1 : 0) : ($current['on_board'] ? 1 : 0);
            $zIndex = isset($fields['z_index']) ? (int)$fields['z_index'] : $current['z_index'];

            if (!empty($fields['bring_to_front'])) {
                $stmt = $this->pdo->prepare("SELECT COALESCE(MAX(z_index), 0) + 1 FROM board_tokens WHERE game_id = ?");
                $stmt->execute([$current['game_id']]);
                $zIndex = (int)$stmt->fetchColumn();
            }

            $stmt = $this->pdo->prepare("
                UPDATE board_tokens
                SET map_id = ?, grid_x = ?, grid_y = ?, tile_size = ?, movable_by = ?, on_board = ?, z_index = ?, updated_at = ?
                WHERE id = ?
            ");
            $stmt->execute([$mapId, $gridX, $gridY, $tileSize, $movableBy, $onBoard, $zIndex, $now, $tokenId]);
            return $this->getBoardTokenById($tokenId);
        }

        $data = $this->readJsonData();
        $gameId = null;
        foreach ($data['board_tokens'] as $tok) {
            if ((int)$tok['id'] === $tokenId) {
                $gameId = (int)$tok['game_id'];
                break;
            }
        }
        if ($gameId === null) return null;

        $maxZ = 0;
        if (!empty($fields['bring_to_front'])) {
            foreach ($data['board_tokens'] as $tok) {
                if ((int)$tok['game_id'] === $gameId && (int)$tok['z_index'] > $maxZ) {
                    $maxZ = (int)$tok['z_index'];
                }
            }
        }

        foreach ($data['board_tokens'] as &$tok) {
            if ((int)$tok['id'] === $tokenId) {
                if (isset($fields['map_id'])) $tok['map_id'] = (int)$fields['map_id'];
                if (isset($fields['grid_x'])) $tok['grid_x'] = max(0, (int)$fields['grid_x']);
                if (isset($fields['grid_y'])) $tok['grid_y'] = max(0, (int)$fields['grid_y']);
                if (isset($fields['tile_size'])) $tok['tile_size'] = max(1, min(12, (int)$fields['tile_size']));
                if (isset($fields['movable_by'])) $tok['movable_by'] = (string)$fields['movable_by'];
                if (isset($fields['on_board'])) $tok['on_board'] = $fields['on_board'] ? 1 : 0;
                if (!empty($fields['bring_to_front'])) $tok['z_index'] = $maxZ + 1;
                $tok['updated_at'] = $now;
                $this->writeJsonData($data);
                return $this->normalizeToken($tok);
            }
        }
        return null;
    }


    public function setAllTokensMovableBy(int $gameId, string $movableBy): void {
        $now = time();
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("UPDATE board_tokens SET movable_by = ?, updated_at = ? WHERE game_id = ?");
            $stmt->execute([$movableBy, $now, $gameId]);
            return;
        }
        $data = $this->readJsonData();
        foreach ($data['board_tokens'] as &$tok) {
            if ((int)$tok['game_id'] === $gameId) {
                $tok['movable_by'] = $movableBy;
                $tok['updated_at'] = $now;
            }
        }
        unset($tok);
        $this->writeJsonData($data);
    }

    public function countTokenFilenameReferences(string $filename): int {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM board_tokens WHERE filename = ?");
            $stmt->execute([$filename]);
            return (int)$stmt->fetchColumn();
        }
        $data = $this->readJsonData();
        $count = 0;
        foreach ($data['board_tokens'] as $tok) {
            if ($tok['filename'] === $filename) {
                $count++;
            }
        }
        return $count;
    }

    public function deleteBoardToken(int $tokenId): bool {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("DELETE FROM board_tokens WHERE id = ?");
            $stmt->execute([$tokenId]);
            return $stmt->rowCount() > 0;
        }
        $data = $this->readJsonData();
        $before = count($data['board_tokens']);
        $data['board_tokens'] = array_values(array_filter(
            $data['board_tokens'],
            fn($tok) => (int)$tok['id'] !== $tokenId
        ));
        if (count($data['board_tokens']) !== $before) {
            $this->writeJsonData($data);
            return true;
        }
        return false;
    }

    public function addMessage(
        int $gameId,
        int $senderId,
        string $senderName,
        string $senderRole,
        string $type,
        string $content,
        ?int $recipientId = null,
        ?string $recipientName = null,
        bool $isHiddenRoll = false,
        ?array $rollData = null
    ): array {
        $now = time();
        $rollJson = $rollData ? json_encode($rollData) : null;

        if ($this->pdo) {
            $stmt = $this->pdo->prepare("
                INSERT INTO messages (game_id, sender_id, sender_name, sender_role, type, recipient_id, recipient_name, is_hidden_roll, content, roll_data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $gameId,
                $senderId,
                $senderName,
                $senderRole,
                $type,
                $recipientId,
                $recipientName,
                $isHiddenRoll ? 1 : 0,
                $content,
                $rollJson,
                $now
            ]);
            $id = (int)$this->pdo->lastInsertId();
            $stmt = $this->pdo->prepare("SELECT * FROM messages WHERE id = ?");
            $stmt->execute([$id]);
            return $this->normalizeMessage($stmt->fetch());
        }

        $data = $this->readJsonData();
        $nextId = empty($data['messages']) ? 1 : (max(array_column($data['messages'], 'id')) + 1);
        $msg = [
            'id' => $nextId,
            'game_id' => $gameId,
            'sender_id' => $senderId,
            'sender_name' => $senderName,
            'sender_role' => $senderRole,
            'type' => $type,
            'recipient_id' => $recipientId,
            'recipient_name' => $recipientName,
            'is_hidden_roll' => $isHiddenRoll ? 1 : 0,
            'content' => $content,
            'roll_data' => $rollJson,
            'created_at' => $now,
        ];
        $data['messages'][] = $msg;
        $this->writeJsonData($data);
        return $this->normalizeMessage($msg);
    }

    private function normalizeMessage(array $m): array {
        return [
            'id' => (int)$m['id'],
            'game_id' => (int)$m['game_id'],
            'sender_id' => (int)$m['sender_id'],
            'sender_name' => (string)$m['sender_name'],
            'sender_role' => (string)$m['sender_role'],
            'type' => (string)$m['type'],
            'recipient_id' => $m['recipient_id'] !== null ? (int)$m['recipient_id'] : null,
            'recipient_name' => $m['recipient_name'] !== null ? (string)$m['recipient_name'] : null,
            'is_hidden_roll' => (int)$m['is_hidden_roll'] === 1,
            'content' => (string)$m['content'],
            'roll_data' => !empty($m['roll_data']) ? (is_string($m['roll_data']) ? json_decode($m['roll_data'], true) : $m['roll_data']) : null,
            'created_at' => (int)$m['created_at'],
        ];
    }

    public function getMessages(int $gameId, int $userId, bool $isGameGm, int $afterId = 0): array {
        $raw = [];
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT * FROM messages WHERE game_id = ? AND id > ? ORDER BY id ASC LIMIT 200");
            $stmt->execute([$gameId, $afterId]);
            $raw = $stmt->fetchAll();
        } else {
            $data = $this->readJsonData();
            foreach ($data['messages'] as $m) {
                if ((int)$m['game_id'] === $gameId && (int)$m['id'] > $afterId) {
                    $raw[] = $m;
                }
            }
        }

        $filtered = [];
        foreach ($raw as $m) {
            $norm = $this->normalizeMessage($m);
            // Filter whispers: only sender and recipient can see whispers
            if ($norm['type'] === 'whisper') {
                if ($norm['sender_id'] !== $userId && $norm['recipient_id'] !== $userId) {
                    continue;
                }
            }
            // Filter hidden GM rolls or system notifications only for GM
            if ($norm['is_hidden_roll']) {
                if (!$isGameGm && $norm['sender_id'] !== $userId) {
                    continue;
                }
            }
            $filtered[] = $norm;
        }
        return $filtered;
    }

    // -------------------------------------------------------------
    // Notes Management
    // -------------------------------------------------------------

    private function normalizeNote(array $n): array {
        return [
            'id' => (int)$n['id'],
            'game_id' => (int)$n['game_id'],
            'title' => (string)$n['title'],
            'content' => (string)($n['content'] ?? ''),
            'created_at' => (int)($n['created_at'] ?? time()),
            'updated_at' => (int)($n['updated_at'] ?? time()),
        ];
    }

    public function getNotes(int $gameId): array {
        $notes = [];
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT * FROM notes WHERE game_id = ? ORDER BY updated_at DESC, id DESC");
            $stmt->execute([$gameId]);
            foreach ($stmt->fetchAll() as $row) {
                $notes[] = $this->normalizeNote($row);
            }
        } else {
            $data = $this->readJsonData();
            if (isset($data['notes'])) {
                foreach ($data['notes'] as $n) {
                    if ((int)$n['game_id'] === $gameId) {
                        $notes[] = $this->normalizeNote($n);
                    }
                }
            }
            usort($notes, fn($a, $b) => $b['updated_at'] <=> $a['updated_at']);
        }
        return $notes;
    }

    public function getNoteById(int $noteId): ?array {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("SELECT * FROM notes WHERE id = ?");
            $stmt->execute([$noteId]);
            $row = $stmt->fetch();
            return $row ? $this->normalizeNote($row) : null;
        }
        $data = $this->readJsonData();
        if (isset($data['notes'])) {
            foreach ($data['notes'] as $n) {
                if ((int)$n['id'] === $noteId) {
                    return $this->normalizeNote($n);
                }
            }
        }
        return null;
    }

    public function saveNote(int $gameId, int $noteId, string $title, string $content): array {
        $title = trim($title) !== '' ? trim($title) : 'Untitled Note';
        $now = time();

        if ($this->pdo) {
            if ($noteId > 0) {
                $stmt = $this->pdo->prepare("UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ? AND game_id = ?");
                $stmt->execute([$title, $content, $now, $noteId, $gameId]);
                return $this->getNoteById($noteId) ?? [
                    'id' => $noteId, 'game_id' => $gameId, 'title' => $title, 'content' => $content, 'created_at' => $now, 'updated_at' => $now
                ];
            } else {
                $stmt = $this->pdo->prepare("INSERT INTO notes (game_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)");
                $stmt->execute([$gameId, $title, $content, $now, $now]);
                $newId = (int)$this->pdo->lastInsertId();
                return $this->getNoteById($newId);
            }
        }

        $data = $this->readJsonData();
        if (!isset($data['notes'])) {
            $data['notes'] = [];
        }

        if ($noteId > 0) {
            foreach ($data['notes'] as &$n) {
                if ((int)$n['id'] === $noteId && (int)$n['game_id'] === $gameId) {
                    $n['title'] = $title;
                    $n['content'] = $content;
                    $n['updated_at'] = $now;
                    $this->writeJsonData($data);
                    return $this->normalizeNote($n);
                }
            }
        }

        $nextId = empty($data['notes']) ? 1 : (max(array_column($data['notes'], 'id')) + 1);
        $note = [
            'id' => $nextId,
            'game_id' => $gameId,
            'title' => $title,
            'content' => $content,
            'created_at' => $now,
            'updated_at' => $now,
        ];
        $data['notes'][] = $note;
        $this->writeJsonData($data);
        return $this->normalizeNote($note);
    }

    public function deleteNote(int $noteId): bool {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("DELETE FROM notes WHERE id = ?");
            $stmt->execute([$noteId]);
            return $stmt->rowCount() > 0;
        }
        $data = $this->readJsonData();
        if (!isset($data['notes'])) return false;
        $before = count($data['notes']);
        $data['notes'] = array_values(array_filter($data['notes'], fn($n) => (int)$n['id'] !== $noteId));
        if (count($data['notes']) !== $before) {
            $this->writeJsonData($data);
            return true;
        }
        return false;
    }
}
