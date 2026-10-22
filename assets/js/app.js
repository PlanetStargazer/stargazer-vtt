/**
 * Virtual Tabletop (VTT) Main Frontend Controller
 */
(function () {
    'use strict';

    const state = {
        user: null,
        games: [],
        allUsers: [],
        currentGame: null,
        isGameGm: false,
        forcePlayerView: false,
        mapTabs: [],
        activeMapId: 0,
        playerActiveMapId: 0,
        baseCellPx: 50,
        boardImages: [],
        libraryImages: [],
        boardTokens: [],
        libraryTokens: [],
        tokenCategoryFolded: { custom: false, builtin: false },
        notes: [],
        activeNoteId: 0,
        playlists: [],
        selectedPlaylistId: 0,
        musicState: null,
        pdfs: [],
        pdfLibrarySearch: '',
        activeViewerPdf: null,
        lastSeenSharedPdfTime: 0,
        localMusicVolume: Number(localStorage.getItem('stargazer_vtt_music_volume') ?? 70),
        localMusicMuted: localStorage.getItem('stargazer_vtt_music_muted') === '1',
        playerMusicDisabled: localStorage.getItem('stargazer_vtt_player_music_disabled') === '1',
        audioElement: null,
        ytPlayer: null,
        ytReady: false,
        ytPendingVideoId: null,
        ytPendingStartSeconds: 0,
        autoplayBlocked: false,
        userHasInteracted: false,
        ytInitAttempted: false,
        lastSyncedTrackId: null,
        gridBgRemoveFlag: false,
        participants: [],
        lastMessageId: 0,
        seenRollIds: new Set(),
        initialHistoryLoaded: false,
        pollTimer: null,
        draggingImageId: null,
        draggingTokenId: null,
        activeTool: 'pointer',
        imageLibrarySearch: '',
        tokenLibrarySearch: '',
        previewGridTab: null,
        zoomLevel: 1,
        diceEngine: null
    };

    // DOM helper
    const $ = (id) => document.getElementById(id);
    const hide = (el) => el && el.classList.add('hidden');
    const show = (el) => el && el.classList.remove('hidden');

    // Styled Window Dialogs (Replaces native browser confirm & alert)
    function showConfirmModal({
        title = 'Confirmation Required',
        message = 'Are you sure you want to proceed?',
        detail = '',
        okText = 'Confirm',
        cancelText = 'Cancel',
        isDanger = true,
        icon = '⚠️'
    } = {}) {
        return new Promise((resolve) => {
            const modal = $('modal-confirm');
            const titleEl = $('confirm-modal-title');
            const iconEl = $('confirm-modal-icon');
            const msgEl = $('confirm-modal-message');
            const detailEl = $('confirm-modal-detail');
            const okBtn = $('btn-confirm-ok');
            const cancelBtn = $('btn-confirm-cancel');
            const closeBtn = $('btn-confirm-close');

            if (!modal) {
                resolve(window.confirm(message + (detail ? '\n\n' + detail : '')));
                return;
            }

            titleEl.textContent = title;
            iconEl.textContent = icon;
            msgEl.textContent = message;

            if (detail) {
                detailEl.textContent = detail;
                detailEl.classList.remove('hidden');
            } else {
                detailEl.textContent = '';
                detailEl.classList.add('hidden');
            }

            okBtn.textContent = okText;
            okBtn.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';

            if (cancelText) {
                cancelBtn.textContent = cancelText;
                cancelBtn.classList.remove('hidden');
            } else {
                cancelBtn.classList.add('hidden');
            }

            modal.classList.remove('hidden');
            okBtn.focus();

            const cleanup = () => {
                modal.classList.add('hidden');
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                closeBtn.removeEventListener('click', onCancel);
                modal.removeEventListener('mousedown', onBackdrop);
                window.removeEventListener('keydown', onKeyDown);
            };

            const onOk = () => {
                cleanup();
                resolve(true);
            };

            const onCancel = () => {
                cleanup();
                resolve(false);
            };

            const onBackdrop = (e) => {
                if (e.target === modal) {
                    onCancel();
                }
            };

            const onKeyDown = (e) => {
                if (e.key === 'Escape') {
                    onCancel();
                } else if (e.key === 'Enter' && e.target !== cancelBtn) {
                    onOk();
                }
            };

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            closeBtn.addEventListener('click', onCancel);
            modal.addEventListener('mousedown', onBackdrop);
            window.addEventListener('keydown', onKeyDown);
        });
    }

    function showAlertModal(message, title = 'Notice', icon = 'ℹ️', detail = '') {
        return showConfirmModal({
            title,
            message,
            detail,
            okText: 'OK',
            cancelText: null,
            isDanger: false,
            icon
        });
    }

    // Override native browser alert with styled dialog modal
    const alert = (msg, title = 'Notice', icon = 'ℹ️', detail = '') => showAlertModal(String(msg), title, icon, detail);

    async function apiCall(action, data = null, isFormData = false) {
        const opts = { method: data ? 'POST' : 'GET', credentials: 'same-origin' };
        let url = `api.php?action=${encodeURIComponent(action)}`;

        if (data) {
            if (isFormData) {
                opts.body = data;
            } else {
                opts.headers = { 'Content-Type': 'application/json' };
                opts.body = JSON.stringify({ action, ...data });
            }
        }
        const res = await fetch(url, opts);
        const json = await res.json();
        if (!res.ok || !json.ok) {
            throw new Error(json.error || 'Request failed');
        }
        return json;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    }

    function showView(viewId) {
        ['view-setup-admin', 'view-auth', 'view-lobby', 'view-vtt'].forEach(id => {
            const el = $(id);
            if (el) el.classList.toggle('hidden', id !== viewId);
        });
    }

    function showError(containerId, msg) {
        const el = $(containerId);
        if (!el) return;
        if (!msg) {
            el.classList.add('hidden');
            el.textContent = '';
        } else {
            el.textContent = msg;
            el.classList.remove('hidden');
        }
    }

    function showSuccess(containerId, msg) {
        const el = $(containerId);
        if (!el) return;
        if (!msg) {
            el.classList.add('hidden');
            el.textContent = '';
        } else {
            el.textContent = msg;
            el.classList.remove('hidden');
        }
    }

    // =========================================================
    // INITIALIZATION & AUTHENTICATION
    // =========================================================
    async function initApp() {
        bindAuthEvents();
        bindLobbyEvents();
        bindVttEvents();

        const params = new URLSearchParams(window.location.search);
        const resetToken = params.get('reset_token');
        if (resetToken) {
            showView('view-auth');
            await handleResetPasswordToken(resetToken);
            return;
        }

        try {
            const status = await apiCall('status');
            if (status.needs_admin_setup) {
                showView('view-setup-admin');
            } else if (status.user) {
                state.user = status.user;
                const urlGameId = Number(params.get('game_id') || 0);
                const urlView = (params.get('view') || '').toLowerCase();
                if (urlGameId > 0) {
                    await openGame(urlGameId, urlView === 'player');
                } else {
                    await enterLobby();
                }
            } else {
                showView('view-auth');
            }
        } catch (err) {
            showView('view-auth');
            showError('auth-error', err.message);
        }
    }

    async function handleResetPasswordToken(token) {
        const tabsBar = $('auth-tabs-bar');
        if (tabsBar) tabsBar.classList.add('hidden');
        $('form-login').classList.add('hidden');
        $('form-signup').classList.add('hidden');
        $('form-forgot-password').classList.add('hidden');
        showError('auth-error', null);
        showSuccess('auth-success', null);

        try {
            const res = await apiCall('verify_reset_token', { token });
            $('form-reset-password').classList.remove('hidden');
            $('reset-token-input').value = token;
            const greet = $('reset-greeting-text');
            if (greet) {
                greet.textContent = `Welcome back, ${res.username || 'Adventurer'}! Please enter a new password for your account.`;
            }
            $('reset-new-password').focus();
        } catch (err) {
            showError('auth-error', 'This password reset link is invalid or has expired. Please request a new one.');
            $('form-forgot-password').classList.remove('hidden');
            if (tabsBar) tabsBar.classList.remove('hidden');
        }
    }

    function bindAuthEvents() {
        function switchToLoginView() {
            const tabsBar = $('auth-tabs-bar');
            if (tabsBar) tabsBar.classList.remove('hidden');
            $('tab-login').classList.add('active');
            $('tab-signup').classList.remove('active');
            $('form-login').classList.remove('hidden');
            $('form-signup').classList.add('hidden');
            $('form-forgot-password').classList.add('hidden');
            $('form-reset-password').classList.add('hidden');
            showError('auth-error', null);
            showSuccess('auth-success', null);
        }

        // First-launch Admin Setup form
        const setupForm = $('form-setup-admin');
        if (setupForm) {
            setupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                showError('setup-error', null);
                const username = $('setup-username').value.trim();
                const email = $('setup-email').value.trim();
                const password = $('setup-password').value;

                try {
                    const res = await apiCall('setup_admin', { username, email, password });
                    state.user = res.user;
                    await enterLobby();
                } catch (err) {
                    showError('setup-error', err.message);
                }
            });
        }

        // Auth tabs (Login vs Sign Up)
        const tabLogin = $('tab-login');
        const tabSignup = $('tab-signup');
        if (tabLogin && tabSignup) {
            tabLogin.addEventListener('click', () => {
                switchToLoginView();
            });
            tabSignup.addEventListener('click', () => {
                const tabsBar = $('auth-tabs-bar');
                if (tabsBar) tabsBar.classList.remove('hidden');
                tabSignup.classList.add('active');
                tabLogin.classList.remove('active');
                $('form-signup').classList.remove('hidden');
                $('form-login').classList.add('hidden');
                $('form-forgot-password').classList.add('hidden');
                $('form-reset-password').classList.add('hidden');
                showError('auth-error', null);
                showSuccess('auth-success', null);
            });
        }

        // Switch to Forgot Password
        const btnShowForgot = $('btn-show-forgot');
        if (btnShowForgot) {
            btnShowForgot.addEventListener('click', () => {
                const tabsBar = $('auth-tabs-bar');
                if (tabsBar) tabsBar.classList.add('hidden');
                $('form-login').classList.add('hidden');
                $('form-signup').classList.add('hidden');
                $('form-reset-password').classList.add('hidden');
                $('form-forgot-password').classList.remove('hidden');
                showError('auth-error', null);
                showSuccess('auth-success', null);
                const currentIdentifier = $('login-username').value.trim();
                if (currentIdentifier) {
                    $('forgot-identifier').value = currentIdentifier;
                }
                $('forgot-identifier').focus();
            });
        }

        // Return to Login from Forgot Password
        const btnBackToLogin = $('btn-back-to-login');
        if (btnBackToLogin) {
            btnBackToLogin.addEventListener('click', () => {
                switchToLoginView();
            });
        }

        // Cancel / Return to Login from Reset Password Form
        const btnCancelReset = $('btn-cancel-reset');
        if (btnCancelReset) {
            btnCancelReset.addEventListener('click', () => {
                history.replaceState({}, document.title, window.location.pathname);
                switchToLoginView();
            });
        }

        // Forgot password form submission
        const forgotForm = $('form-forgot-password');
        if (forgotForm) {
            forgotForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                showError('auth-error', null);
                showSuccess('auth-success', null);
                const identifier = $('forgot-identifier').value.trim();
                const submitBtn = $('btn-submit-forgot');
                const origText = submitBtn.textContent;
                submitBtn.disabled = true;
                submitBtn.textContent = 'Sending...';

                try {
                    const res = await apiCall('forgot_password', { email: identifier });
                    showSuccess('auth-success', res.message || 'If an account matches that email, a reset link has been sent.');
                    if (res.dev_reset_url) {
                        const devNote = document.createElement('div');
                        devNote.style.marginTop = '10px';
                        devNote.style.paddingTop = '8px';
                        devNote.style.borderTop = '1px solid rgba(255,255,255,0.15)';
                        devNote.style.fontSize = '0.82rem';
                        devNote.innerHTML = `<strong>Local Dev Quick Link:</strong> <a href="${escapeHtml(res.dev_reset_url)}" style="color:#93c5fd; text-decoration:underline;">Click here to simulate opening email link</a>`;
                        $('auth-success').appendChild(devNote);
                    }
                    $('forgot-identifier').value = '';
                } catch (err) {
                    showError('auth-error', err.message);
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.textContent = origText;
                }
            });
        }

        // Reset password form submission
        const resetForm = $('form-reset-password');
        if (resetForm) {
            resetForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                showError('auth-error', null);
                showSuccess('auth-success', null);
                const token = $('reset-token-input').value;
                const newPass = $('reset-new-password').value;
                const confirmPass = $('reset-confirm-password').value;

                if (newPass.length < 6) {
                    showError('auth-error', 'Password must be at least 6 characters long.');
                    return;
                }
                if (newPass !== confirmPass) {
                    showError('auth-error', 'Passwords do not match. Please verify and try again.');
                    return;
                }

                const submitBtn = $('btn-submit-reset');
                const origText = submitBtn.textContent;
                submitBtn.disabled = true;
                submitBtn.textContent = 'Updating...';

                try {
                    const res = await apiCall('reset_password', { token, password: newPass });
                    history.replaceState({}, document.title, window.location.pathname);
                    switchToLoginView();
                    showSuccess('auth-success', res.message || 'Your password has been successfully reset! You can now log in.');
                    $('reset-new-password').value = '';
                    $('reset-confirm-password').value = '';
                } catch (err) {
                    showError('auth-error', err.message);
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.textContent = origText;
                }
            });
        }

        // Login form
        const loginForm = $('form-login');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                showError('auth-error', null);
                showSuccess('auth-success', null);
                const username = $('login-username').value.trim();
                const password = $('login-password').value;

                try {
                    const res = await apiCall('login', { username, password });
                    state.user = res.user;
                    await enterLobby();
                } catch (err) {
                    showError('auth-error', err.message);
                }
            });
        }

        // Signup form
        const signupForm = $('form-signup');
        if (signupForm) {
            signupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                showError('auth-error', null);
                showSuccess('auth-success', null);
                const username = $('signup-username').value.trim();
                const email = $('signup-email').value.trim();
                const password = $('signup-password').value;

                try {
                    const res = await apiCall('signup', { username, email, password });
                    state.user = res.user;
                    await enterLobby();
                } catch (err) {
                    showError('auth-error', err.message);
                }
            });
        }
    }

    // =========================================================
    // LOBBY, ADMIN USER RIGHTS & GM GAME MANAGEMENT
    // =========================================================
    async function enterLobby() {
        stopGamePolling();
        showView('view-lobby');
        await refreshLobbyData();
    }

    async function refreshLobbyData() {
        try {
            const data = await apiCall('lobby_data');
            state.user = data.user;
            state.games = data.games || [];
            state.allUsers = data.users || [];
            renderLobby();
        } catch (err) {
            alert('Failed to load lobby: ' + err.message);
        }
    }

    function renderLobby() {
        const u = state.user;
        $('lobby-username').textContent = u.username;

        // Role badges
        const badgesContainer = $('lobby-user-badges');
        badgesContainer.innerHTML = '';
        if (u.is_admin) {
            badgesContainer.innerHTML += '<span class="badge badge-admin">Admin</span> ';
        }

        // Render games list
        const gamesListEl = $('lobby-games-list');
        if (state.games.length === 0) {
            gamesListEl.innerHTML = `<div class="alert alert-info" style="grid-column: 1 / -1;">
                No campaigns yet! Use the <strong>✨ Create New Campaign</strong> panel below to set up your first campaign (you will be its Owner &amp; GM), or ask another user to invite you to theirs.
            </div>`;
        } else {
            gamesListEl.innerHTML = state.games.map(g => {
                const isOwner = Number(g.gm_id) === Number(u.id);
                const canManage = isOwner || !!u.is_admin;
                const playerCount = (g.allowed_players || []).length;
                const previewHtml = g.preview_image
                    ? `<div class="game-preview-thumb"><img src="${escapeHtml(g.preview_image)}" alt="${escapeHtml(g.name)}"></div>`
                    : `<div class="game-preview-thumb is-placeholder"><span>✨</span></div>`;
                const roleBadge = isOwner
                    ? `<span class="badge badge-gm">👑 Owner &amp; GM</span>`
                    : `<span class="badge badge-player">🛡️ Player</span>`;

                return `
                    <div class="game-item ${isOwner ? 'is-owned-game' : ''}">
                        ${previewHtml}
                        <div class="game-item-body">
                            <div class="game-item-header">
                                <h3>${escapeHtml(g.name)}</h3>
                                ${roleBadge}
                            </div>
                            <div class="game-meta">Owner / GM: <strong>${escapeHtml(g.gm_name)}</strong> &bull; ${playerCount} Player(s) with access</div>
                            <div class="game-desc">${escapeHtml(g.description || 'No description provided.')}</div>
                            <div class="game-actions">
                                <button class="btn btn-primary btn-sm" data-join-game="${g.id}">
                                    ${isOwner ? '👑 Launch as GM' : '🎲 Join as Player'}
                                </button>
                                ${canManage ? `
                                    <button class="btn btn-secondary btn-sm" data-edit-game="${g.id}">✏️ Edit / Ownership</button>
                                    <button class="btn btn-danger btn-sm" data-delete-game="${g.id}" title="Permanently delete this campaign">🗑️ Delete</button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Everyone can create campaigns
        const createPanel = $('panel-gm-create');
        if (createPanel) {
            createPanel.classList.remove('hidden');
            renderPlayerChecklist('create-game-players', [], u.id);
        }

        // Show/Hide Admin User Rights Panel
        const adminPanel = $('panel-admin-users');
        if (u.is_admin) {
            adminPanel.classList.remove('hidden');
            renderAdminUsersTable();
        } else {
            adminPanel.classList.add('hidden');
        }
    }

    function renderPlayerChecklist(containerId, selectedIds, excludeOwnerId = null) {
        const container = $(containerId);
        if (!container) return;
        const ownerToExclude = excludeOwnerId !== null ? Number(excludeOwnerId) : Number(state.user.id);
        const selectedSet = new Set((selectedIds || []).map(Number));
        const candidates = state.allUsers.filter(user => Number(user.id) !== ownerToExclude);

        if (candidates.length === 0) {
            container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 6px;">No other registered users yet. Players can sign up and you can grant them access anytime.</div>';
            return;
        }

        container.innerHTML = candidates.map(user => `
            <label class="player-check-item">
                <input type="checkbox" value="${user.id}" ${selectedSet.has(Number(user.id)) ? 'checked' : ''}>
                <span><strong>${escapeHtml(user.username)}</strong></span>
            </label>
        `).join('');
    }

    function renderAdminUsersTable() {
        const tbody = $('admin-users-tbody');
        if (!tbody) return;

        tbody.innerHTML = state.allUsers.map(u => {
            const isSelf = u.id === state.user.id;
            return `
                <tr>
                    <td><strong>${escapeHtml(u.username)}</strong></td>
                    <td style="color: var(--text-muted);">${escapeHtml(u.email)}</td>
                    <td>
                        <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
                            <input type="checkbox" data-admin-super="${u.id}" ${u.is_admin ? 'checked' : ''} ${isSelf ? 'disabled' : ''}>
                            <span>Admin</span>
                        </label>
                    </td>
                    <td>
                        <button class="btn btn-secondary btn-sm" data-save-user="${u.id}">Save</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function bindLobbyEvents() {
        // Logout
        $('btn-logout').addEventListener('click', async () => {
            await apiCall('logout');
            state.user = null;
            showView('view-auth');
        });

        // Create Game Form (supports optional preview image upload)
        $('form-create-game').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = $('create-game-name').value.trim();
            const description = $('create-game-desc').value.trim();
            const previewInput = $('create-game-preview');
            const checked = Array.from(document.querySelectorAll('#create-game-players input[type="checkbox"]:checked'))
                .map(cb => Number(cb.value));

            const formData = new FormData();
            formData.append('name', name);
            formData.append('description', description);
            formData.append('allowed_players', JSON.stringify(checked));
            if (previewInput && previewInput.files && previewInput.files[0]) {
                formData.append('preview_image', previewInput.files[0]);
            }

            const submitBtn = $('btn-submit-create-game');
            const origText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) {
                submitBtn.textContent = 'Creating...';
                submitBtn.disabled = true;
            }

            try {
                await apiCall('create_game', formData, true);
                $('create-game-name').value = '';
                $('create-game-desc').value = '';
                if (previewInput) previewInput.value = '';
                await refreshLobbyData();
            } catch (err) {
                alert(err.message);
            } finally {
                if (submitBtn) {
                    submitBtn.textContent = origText;
                    submitBtn.disabled = false;
                }
            }
        });

        async function deleteCampaignPrompt(gameId) {
            const game = (state.games || []).find(g => Number(g.id) === Number(gameId));
            const gameName = game ? game.name : 'this campaign';
            const confirmed = await showConfirmModal({
                title: 'Delete Campaign',
                message: `Permanently delete the campaign "${gameName}"?`,
                detail: 'This will permanently delete all chat logs, dice rolls, uploaded maps, handouts, and custom tokens.\n\nThis action cannot be undone.',
                okText: 'Delete Campaign',
                isDanger: true,
                icon: '🗑️'
            });
            if (!confirmed) return;

            try {
                await apiCall('delete_game', { game_id: gameId });
                hide($('modal-edit-game'));
                if (state.currentGame && Number(state.currentGame.id) === Number(gameId)) {
                    state.currentGame = null;
                    enterLobby();
                } else {
                    await refreshLobbyData();
                }
            } catch (err) {
                alert('Failed to delete campaign: ' + err.message);
            }
        }

        // Delegate clicks on games list (Launch Tabletop or Edit / Ownership or Delete)
        $('lobby-games-list').addEventListener('click', (e) => {
            const joinBtn = e.target.closest('[data-join-game]');
            if (joinBtn) {
                const gameId = Number(joinBtn.getAttribute('data-join-game'));
                openGame(gameId);
                return;
            }
            const editBtn = e.target.closest('[data-edit-game]');
            if (editBtn) {
                const gameId = Number(editBtn.getAttribute('data-edit-game'));
                openEditGameModal(gameId);
                return;
            }
            const delBtn = e.target.closest('[data-delete-game]');
            if (delBtn) {
                const gameId = Number(delBtn.getAttribute('data-delete-game'));
                deleteCampaignPrompt(gameId);
            }
        });

        // Delegate clicks on Admin Users Table
        $('admin-users-tbody').addEventListener('click', async (e) => {
            const saveBtn = e.target.closest('[data-save-user]');
            if (!saveBtn) return;
            const userId = Number(saveBtn.getAttribute('data-save-user'));
            const adminCb = document.querySelector(`input[data-admin-super="${userId}"]`);
            const isAdmin = adminCb ? adminCb.checked : false;

            try {
                saveBtn.textContent = 'Saving...';
                await apiCall('admin_update_user', { user_id: userId, is_admin: isAdmin });
                await refreshLobbyData();
            } catch (err) {
                alert(err.message);
                saveBtn.textContent = 'Save';
            }
        });

        // Edit Game Details, Preview & Ownership Modal
        $('btn-close-edit-modal').addEventListener('click', () => {
            $('modal-edit-game').classList.add('hidden');
        });

        $('btn-delete-campaign-modal').addEventListener('click', () => {
            const gameId = Number($('edit-game-id').value);
            if (gameId) {
                deleteCampaignPrompt(gameId);
            }
        });

        $('edit-game-owner').addEventListener('change', () => {
            const gameId = Number($('edit-game-id').value);
            const game = state.games.find(g => g.id === gameId);
            if (!game) return;
            const newOwnerId = Number($('edit-game-owner').value);
            const currentlyChecked = Array.from(document.querySelectorAll('#edit-game-players input[type="checkbox"]:checked'))
                .map(cb => Number(cb.value));
            if (newOwnerId !== Number(game.gm_id) && !currentlyChecked.includes(Number(game.gm_id))) {
                currentlyChecked.push(Number(game.gm_id));
            }
            renderPlayerChecklist('edit-game-players', currentlyChecked, newOwnerId);
        });

        $('form-edit-game').addEventListener('submit', async (e) => {
            e.preventDefault();
            const gameId = Number($('edit-game-id').value);
            const name = $('edit-game-name').value.trim();
            const description = $('edit-game-desc').value.trim();
            const ownerId = Number($('edit-game-owner').value || 0);
            const previewInput = $('edit-game-preview');
            const checked = Array.from(document.querySelectorAll('#edit-game-players input[type="checkbox"]:checked'))
                .map(cb => Number(cb.value));

            const formData = new FormData();
            formData.append('game_id', String(gameId));
            formData.append('name', name);
            formData.append('description', description);
            formData.append('owner_id', String(ownerId));
            formData.append('allowed_players', JSON.stringify(checked));
            if (previewInput && previewInput.files && previewInput.files[0]) {
                formData.append('preview_image', previewInput.files[0]);
            }

            const submitBtn = $('btn-submit-edit-game');
            const origText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) {
                submitBtn.textContent = 'Saving...';
                submitBtn.disabled = true;
            }

            try {
                await apiCall('update_game', formData, true);
                $('modal-edit-game').classList.add('hidden');
                await refreshLobbyData();
            } catch (err) {
                alert(err.message);
            } finally {
                if (submitBtn) {
                    submitBtn.textContent = origText;
                    submitBtn.disabled = false;
                }
            }
        });
    }

    function openEditGameModal(gameId) {
        const game = state.games.find(g => g.id === gameId);
        if (!game) return;
        $('edit-game-id').value = game.id;
        $('edit-game-name').value = game.name;
        $('edit-game-desc').value = game.description || '';
        const previewInput = $('edit-game-preview');
        if (previewInput) previewInput.value = '';

        const currentPreviewEl = $('edit-game-preview-current');
        if (currentPreviewEl) {
            if (game.preview_image) {
                currentPreviewEl.classList.remove('hidden');
                currentPreviewEl.innerHTML = `
                    <img src="${escapeHtml(game.preview_image)}" alt="Current cover image">
                    <span>Current cover image (upload a new file below to replace)</span>
                `;
            } else {
                currentPreviewEl.classList.add('hidden');
                currentPreviewEl.innerHTML = '';
            }
        }

        const ownerSelect = $('edit-game-owner');
        if (ownerSelect) {
            ownerSelect.innerHTML = state.allUsers.map(u => `
                <option value="${u.id}" ${Number(u.id) === Number(game.gm_id) ? 'selected' : ''}>
                    👑 ${escapeHtml(u.username)}${Number(u.id) === Number(game.gm_id) ? ' (Current Owner / GM)' : ''}
                </option>
            `).join('');
        }

        renderPlayerChecklist('edit-game-players', game.allowed_players || [], game.gm_id);
        $('modal-edit-game').classList.remove('hidden');
    }

    // =========================================================
    // VTT TABLETOP, IMAGE HANDOUTS/MAPS, CHAT & 3D DICE
    // =========================================================
    async function openGame(gameId, forcePlayerView = false) {
        showView('view-vtt');
        state.currentGame = null;
        state.forcePlayerView = !!forcePlayerView;
        state.mapTabs = [];
        state.activeMapId = 0;
        state.playerActiveMapId = 0;
        state.boardImages = [];
        state.libraryImages = [];
        state.boardTokens = [];
        state.libraryTokens = [];
        state.participants = [];
        state.lastMessageId = 0;
        state.seenRollIds.clear();
        state.initialHistoryLoaded = false;
        $('chat-messages').innerHTML = '';
        Array.from($('tabletop-plane').querySelectorAll('.board-image-item, .board-token-item')).forEach(el => el.remove());
        $('modal-image-library').classList.add('hidden');
        $('modal-token-library').classList.add('hidden');
        $('modal-map-tab').classList.add('hidden');
        $('view-vtt').classList.remove('ui-hidden-mode');
        $('btn-show-ui').classList.add('hidden');
        setTabletopZoom(100);
        state.imageLibrarySearch = '';
        state.tokenLibrarySearch = '';
        const initImgSearch = $('image-library-search');
        if (initImgSearch) initImgSearch.value = '';
        const initTokSearch = $('token-library-search');
        if (initTokSearch) initTokSearch.value = '';
        setActiveTool('pointer');
        clearRulerOverlay();

        if (!state.diceEngine) {
            state.diceEngine = new window.DiceTabletopEngine($('dice3d-canvas'));
        } else {
            state.diceEngine.clear();
            state.diceEngine.resize();
        }

        state.playlists = [];
        state.selectedPlaylistId = 0;
        state.musicState = null;
        state.lastSyncedTrackId = null;
        state.pdfs = [];
        state.pdfLibrarySearch = '';
        state.activeViewerPdf = null;
        state.lastSeenSharedPdfTime = Date.now() / 1000;
        $('modal-music-library').classList.add('hidden');
        $('modal-pdf-library').classList.add('hidden');
        $('modal-pdf-viewer').classList.add('hidden');
        if (state.forcePlayerView) {
            state.localMusicVolume = Number(localStorage.getItem('stargazer_vtt_player_preview_volume') ?? 70);
            state.localMusicMuted = localStorage.getItem('stargazer_vtt_player_preview_muted') === '1';
            state.playerMusicDisabled = localStorage.getItem('stargazer_vtt_player_preview_music_disabled') === '1';
        } else {
            state.localMusicVolume = Number(localStorage.getItem('stargazer_vtt_music_volume') ?? 70);
            state.localMusicMuted = localStorage.getItem('stargazer_vtt_music_muted') === '1';
            state.playerMusicDisabled = localStorage.getItem('stargazer_vtt_player_music_disabled') === '1';
        }
        initAudioElement();
        initYouTubePlayer();
        applyLocalVolume();
        updateMusicBarControlsUI();

        await fetchGameState(gameId);
        state.initialHistoryLoaded = true;

        stopGamePolling();
        state.pollTimer = setInterval(() => {
            if (state.currentGame) {
                fetchGameState(state.currentGame.id);
            }
        }, 1200);
    }

    function stopGamePolling() {
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
        stopAllPlayback();
        state.musicState = null;
        state.lastSyncedTrackId = null;
    }

    async function fetchGameState(gameId) {
        try {
            const viewParam = state.forcePlayerView ? '&view_mode=player' : '';
            const mapParam = (state.isGameGm && state.activeMapId > 0) ? `&map_id=${state.activeMapId}` : '';
            const res = await fetch(`api.php?action=game_state&game_id=${gameId}&after_msg_id=${state.lastMessageId}${mapParam}${viewParam}`, {
                credentials: 'same-origin'
            });
            const data = await res.json();
            if (!data.ok) return;

            state.currentGame = data.game;
            state.isGameGm = !!data.is_game_gm;
            state.mapTabs = data.map_tabs || [];
            state.activeMapId = Number(data.active_map_id || 0);
            state.playerActiveMapId = Number(data.player_active_map_id || data.active_map_id || 0);
            state.libraryImages = data.library_images || [];
            state.libraryTokens = data.library_tokens || [];
            state.participants = data.participants || [];
            state.playlists = data.playlists || [];
            state.musicState = data.music_state || null;
            state.pdfs = data.pdfs || [];

            syncMusicPlayback();
            updateVttHeaderAndHud();
            renderMapTabsAndGrid();

            if (!state.draggingImageId) {
                syncBoardImages(data.images || []);
            }

            if (!state.draggingTokenId) {
                syncBoardTokens(data.tokens || []);
            }

            if (!$('modal-image-library').classList.contains('hidden')) {
                renderLibraryModal();
            }

            if (!$('modal-token-library').classList.contains('hidden')) {
                renderTokenLibraryModal();
            }

            if (!$('modal-music-library').classList.contains('hidden')) {
                renderPlaylistsSidebar();
                renderPlaylistDetail();
            }

            if (!$('modal-pdf-library').classList.contains('hidden')) {
                renderPdfLibraryModal();
            }

            if (Array.isArray(data.messages) && data.messages.length > 0) {
                appendChatMessages(data.messages);
            }

            renderParticipantsBar(state.participants);
        } catch (err) {
            // Silent retry on next poll
        }
    }

    function updateVttHeaderAndHud() {
        const g = state.currentGame;
        if (!g) return;
        $('vtt-game-title').textContent = g.name;
        $('vtt-role-badge').textContent = state.isGameGm ? 'GM View' : (state.forcePlayerView ? 'Player View (Preview Tab)' : 'Player View');
        $('vtt-role-badge').className = 'badge ' + (state.isGameGm ? 'badge-gm' : 'badge-player');

        const pdfNavBadge = $('pdf-nav-count-badge');
        if (pdfNavBadge) {
            pdfNavBadge.textContent = String(state.pdfs ? state.pdfs.length : 0);
        }

        const gmToolbar = $('vtt-gm-hud');
        const hideUiBtn = $('btn-hide-ui');
        const addMapTabBtn = $('btn-add-map-tab');
        const mapTabsBar = $('vtt-map-tabs-bar');
        if (state.isGameGm) {
            gmToolbar.classList.remove('hidden');
            if (hideUiBtn) hideUiBtn.classList.add('hidden');
            if (addMapTabBtn) addMapTabBtn.classList.remove('hidden');
            if (mapTabsBar) mapTabsBar.classList.remove('hidden');
            const countBadge = $('library-count-badge');
            if (countBadge) {
                countBadge.textContent = String(state.libraryImages.length);
            }
            const tokenCountBadge = $('token-library-count-badge');
            if (tokenCountBadge) {
                tokenCountBadge.textContent = String(state.libraryTokens.length);
            }
            const playlistCountBadge = $('playlist-count-badge');
            if (playlistCountBadge) {
                playlistCountBadge.textContent = String(state.playlists.length);
            }
            const pdfCountBadge = $('pdf-count-badge');
            if (pdfCountBadge) {
                pdfCountBadge.textContent = String(state.pdfs ? state.pdfs.length : 0);
            }
            const openRollsBtn = $('btn-toggle-openrolls');
            if (openRollsBtn) {
                if (g.open_rolls) {
                    openRollsBtn.innerHTML = '<span class="hud-icon">🎲</span>';
                    openRollsBtn.className = 'btn btn-secondary hud-icon-btn is-active';
                    openRollsBtn.title = 'GM Rolls: OPEN (Click to toggle)';
                } else {
                    openRollsBtn.innerHTML = '<span class="hud-icon">🔒</span>';
                    openRollsBtn.className = 'btn btn-secondary hud-icon-btn';
                    openRollsBtn.title = 'GM Rolls: HIDDEN (Click to toggle)';
                }
            }
        } else {
            gmToolbar.classList.add('hidden');
            if (hideUiBtn) hideUiBtn.classList.remove('hidden');
            if (addMapTabBtn) addMapTabBtn.classList.add('hidden');
            if (mapTabsBar) mapTabsBar.classList.add('hidden');
        }
    }

    function formatUnitShort(unit) {
        if (unit === 'yards') return 'yd';
        if (unit === 'meters') return 'm';
        return 'ft';
    }

    function renderTabletopGridSvg(tab) {
        const svg = $('tabletop-grid-svg');
        if (!svg) return;

        if (!tab) {
            svg.innerHTML = '';
            return;
        }

        const gridType = ['square', 'hex_v', 'hex_h'].includes(tab.grid_type) ? tab.grid_type : 'square';
        const cellPx = Math.max(15, Math.min(400, Number(tab.grid_cell_px) || 50));
        const gridColor = tab.grid_color || 'rgba(255, 255, 255, 0.25)';
        const offsetX = Number(tab.grid_offset_x) || 0;
        const offsetY = Number(tab.grid_offset_y) || 0;

        let patternDef = '';
        const patId = `vtt-grid-pat-${tab.id || 0}`;

        if (gridType === 'square') {
            patternDef = `
                <pattern id="${patId}" width="${cellPx}" height="${cellPx}" patternUnits="userSpaceOnUse" x="${offsetX}" y="${offsetY}">
                    <path d="M ${cellPx} 0 L 0 0 0 ${cellPx}" fill="none" stroke="${escapeHtml(gridColor)}" stroke-width="1" />
                </pattern>
            `;
        } else if (gridType === 'hex_v') {
            // Pointy-topped hexagons: width = cellPx, R = cellPx / sqrt(3), height = 3 * R = sqrt(3) * cellPx
            const W = cellPx;
            const R = cellPx / Math.sqrt(3);
            const H = 3 * R;
            const r05 = (0.5 * R).toFixed(3);
            const r15 = (1.5 * R).toFixed(3);
            const r20 = (2.0 * R).toFixed(3);
            const w05 = (0.5 * W).toFixed(3);
            const hFixed = H.toFixed(3);
            const wFixed = W.toFixed(3);

            patternDef = `
                <pattern id="${patId}" width="${wFixed}" height="${hFixed}" patternUnits="userSpaceOnUse" x="${offsetX}" y="${offsetY}">
                    <path d="M ${w05} 0 L ${wFixed} ${r05} L ${wFixed} ${r15} L ${w05} ${r20} L 0 ${r15} L 0 ${r05} Z M ${w05} ${r20} L ${w05} ${hFixed}"
                          fill="none" stroke="${escapeHtml(gridColor)}" stroke-width="1" />
                </pattern>
            `;
        } else if (gridType === 'hex_h') {
            // Flat-topped hexagons: height = cellPx, R = cellPx / sqrt(3), width = 3 * R = sqrt(3) * cellPx
            const H = cellPx;
            const R = cellPx / Math.sqrt(3);
            const W = 3 * R;
            const r05 = (0.5 * R).toFixed(3);
            const r15 = (1.5 * R).toFixed(3);
            const r20 = (2.0 * R).toFixed(3);
            const h05 = (0.5 * H).toFixed(3);
            const wFixed = W.toFixed(3);
            const hFixed = H.toFixed(3);

            patternDef = `
                <pattern id="${patId}" width="${wFixed}" height="${hFixed}" patternUnits="userSpaceOnUse" x="${offsetX}" y="${offsetY}">
                    <path d="M 0 ${h05} L ${r05} ${hFixed} L ${r15} ${hFixed} L ${r20} ${h05} L ${r15} 0 L ${r05} 0 Z M ${r20} ${h05} L ${wFixed} ${h05}"
                          fill="none" stroke="${escapeHtml(gridColor)}" stroke-width="1" />
                </pattern>
            `;
        }

        svg.innerHTML = `
            <defs>
                ${patternDef}
            </defs>
            <rect width="100%" height="100%" fill="url(#${patId})" />
        `;
    }

    function renderMapTabsAndGrid() {
        state.previewGridTab = null;
        const listEl = $('map-tabs-list');
        if (!listEl) return;

        const canDelete = state.isGameGm && state.mapTabs.length > 1;
        listEl.innerHTML = state.mapTabs.map(tab => {
            const isViewing = tab.id === state.activeMapId;
            const isPlayerActive = tab.id === state.playerActiveMapId;
            const unitShort = formatUnitShort(tab.grid_unit);
            const gmControls = state.isGameGm && isViewing
                ? `<button type="button" class="map-tab-icon-btn" data-edit-map-tab="${tab.id}" title="Map Tab, Grid &amp; Background Settings">⚙️</button>` +
                  (canDelete ? `<button type="button" class="map-tab-icon-btn" data-delete-map-tab="${tab.id}" title="Delete map tab">✕</button>` : '')
                : '';

            const gridTypeShort = tab.grid_type === 'hex_v' ? 'Hex V' : (tab.grid_type === 'hex_h' ? 'Hex H' : 'Square');

            return `
                <div class="map-tab-item ${isViewing ? 'active' : ''}" data-select-map-tab="${tab.id}" title="Click tab to view/edit in secrecy">
                    <button
                        type="button"
                        class="map-tab-status-dot ${isPlayerActive ? 'is-active' : ''}"
                        data-set-player-active="${tab.id}"
                        title="${isPlayerActive ? 'Active map for players' : 'Click circle to set this map active for players'}"
                    ></button>
                    <span>🗺️ ${escapeHtml(tab.name)}</span>
                    <span class="map-tab-grid-meta">(${tab.grid_cell_px || 50}px ${gridTypeShort})</span>
                    ${gmControls}
                </div>
            `;
        }).join('');

        const activeTab = state.mapTabs.find(t => t.id === state.activeMapId) || state.mapTabs[0];
        if (activeTab) {
            const baseCellPx = Math.max(15, Math.min(400, Number(activeTab.grid_cell_px) || 50));
            state.baseCellPx = baseCellPx;

            // Render exact SVG grid lines (no rectangular aliasing)
            renderTabletopGridSvg(activeTab);

            // Render locked map background at 1:1 natural scale
            const bgContainer = $('tabletop-map-background');
            const plane = $('tabletop-plane');
            if (bgContainer && plane) {
                if (activeTab.background_image) {
                    bgContainer.classList.remove('hidden');
                    bgContainer.innerHTML = `<img src="${escapeHtml(activeTab.background_image)}" alt="Map Background" class="tabletop-map-bg-img">`;
                    const bgW = Math.max(2400, Number(activeTab.background_width) || 2400);
                    const bgH = Math.max(1600, Number(activeTab.background_height) || 1600);
                    plane.style.minWidth = `${bgW}px`;
                    plane.style.minHeight = `${bgH}px`;

                    const bgImg = bgContainer.querySelector('img');
                    if (bgImg) {
                        bgImg.onload = () => {
                            if (bgImg.naturalWidth && bgImg.naturalHeight) {
                                plane.style.minWidth = `${Math.max(2400, bgImg.naturalWidth)}px`;
                                plane.style.minHeight = `${Math.max(1600, bgImg.naturalHeight)}px`;
                            }
                        };
                    }
                } else {
                    bgContainer.classList.add('hidden');
                    bgContainer.innerHTML = '';
                    plane.style.minWidth = '2400px';
                    plane.style.minHeight = '1600px';
                }
            }

            if (!state.draggingTokenId && state.boardTokens.length > 0) {
                syncBoardTokens(state.boardTokens);
            }
            const indicator = $('grid-scale-indicator');
            if (indicator) {
                const gridName = activeTab.grid_type === 'hex_v' ? 'Hex (Vertical)' : (activeTab.grid_type === 'hex_h' ? 'Hex (Horizontal)' : 'Square');
                indicator.textContent = `${activeTab.name} — ${gridName} (${baseCellPx}px / cell)`;
            }
        }
    }

    function renderLibraryModal() {
        const grid = $('library-images-grid');
        if (!grid) return;

        const query = (state.imageLibrarySearch || '').trim().toLowerCase();
        let images = state.libraryImages;
        if (query) {
            images = images.filter(img => (img.title || '').toLowerCase().includes(query));
        }

        if (state.libraryImages.length === 0) {
            grid.innerHTML = `<div class="alert alert-info" style="grid-column: 1 / -1; width: 100%;">
                This game's image library is empty. Click <strong>+ Upload Image(s)</strong> above to upload maps or handouts!
            </div>`;
            return;
        }

        if (images.length === 0) {
            grid.innerHTML = `<div class="alert alert-secondary" style="grid-column: 1 / -1; width: 100%; padding: 14px 16px;">
                🔍 No images found matching "<strong>${escapeHtml(state.imageLibrarySearch)}</strong>".
            </div>`;
            return;
        }

        grid.innerHTML = images.map(img => {
            const onCurrentMap = !!img.on_board && Number(img.map_id) === Number(state.activeMapId);
            const onOtherMap = !!img.on_board && Number(img.map_id) !== Number(state.activeMapId);
            const otherMapTab = onOtherMap ? state.mapTabs.find(t => t.id === Number(img.map_id)) : null;

            let statusText = 'In Library';
            if (onCurrentMap) {
                statusText = img.visible ? 'On This Map (Visible)' : 'On This Map (Hidden)';
            } else if (onOtherMap) {
                statusText = `On "${otherMapTab ? otherMapTab.name : 'Other Map'}"`;
            }

            return `
                <div class="library-item ${onCurrentMap ? 'on-tabletop' : ''}" data-drag-image-id="${img.id}" title="Drag onto map to place &quot;${escapeHtml(img.title)}&quot;">
                    <div class="library-thumb-wrap">
                        <img src="${escapeHtml(img.filename)}" alt="${escapeHtml(img.title)}" draggable="false">
                        <span class="library-status-tag ${onCurrentMap ? 'active' : ''}">${escapeHtml(statusText)}</span>
                    </div>
                    <div class="library-item-body">
                        <div class="library-item-title" title="${escapeHtml(img.title)}">${escapeHtml(img.title)}</div>
                        <div class="library-item-actions">
                            ${onCurrentMap
                                ? `<button type="button" class="btn btn-secondary btn-sm" style="flex:1;" data-unplace-image="${img.id}">Remove from Map</button>`
                                : `<button type="button" class="btn btn-primary btn-sm" style="flex:1;" data-place-image="${img.id}">Open on This Map</button>`
                            }
                            <button type="button" class="btn btn-danger btn-sm" data-delete-image="${img.id}" title="Delete permanently from library">🗑️</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderTokenLibraryModal() {
        const grid = $('library-tokens-grid');
        if (!grid) return;

        const query = (state.tokenLibrarySearch || '').trim().toLowerCase();
        let tokens = state.libraryTokens;
        if (query) {
            tokens = tokens.filter(tok => (tok.title || '').toLowerCase().includes(query));
        }

        if (state.libraryTokens.length === 0) {
            grid.innerHTML = `<div class="alert alert-info" style="grid-column: 1 / -1; width: 100%;">
                This game's token library is empty. Click <strong>+ Upload Square Token(s)</strong> above to upload a square (1:1) token image!
            </div>`;
            return;
        }

        if (tokens.length === 0) {
            grid.innerHTML = `<div class="alert alert-secondary" style="grid-column: 1 / -1; width: 100%; padding: 14px 16px;">
                🔍 No tokens found matching "<strong>${escapeHtml(state.tokenLibrarySearch)}</strong>".
            </div>`;
            return;
        }

        const customTokens = [];
        const builtinTokens = [];

        tokens.forEach(tok => {
            if (tok.filename && tok.filename.startsWith('assets/tokens/')) {
                builtinTokens.push(tok);
            } else {
                customTokens.push(tok);
            }
        });

        const folded = state.tokenCategoryFolded || { custom: false, builtin: false };

        const renderCategorySection = (catKey, catTitle, icon, catTokens) => {
            const isFolded = query ? (catTokens.length === 0) : !!folded[catKey];
            const arrow = isFolded ? '▶' : '▼';
            const tilesHtml = catTokens.length > 0
                ? catTokens.map(tok => {
                    const onCurrentMap = !!tok.on_board && Number(tok.map_id) === Number(state.activeMapId);
                    return `
                        <div class="token-library-tile ${onCurrentMap ? 'on-tabletop' : ''}"
                             data-drag-token-id="${tok.id}"
                             title="${escapeHtml(tok.title)}">
                            <img src="${escapeHtml(tok.filename)}" alt="${escapeHtml(tok.title)}" draggable="false">
                            <span class="token-hover-label">${escapeHtml(tok.title)}</span>
                        </div>
                    `;
                }).join('')
                : `<div class="token-category-empty">${
                    catKey === 'custom'
                        ? (query ? 'No custom tokens match this search.' : 'No custom tokens uploaded yet. Click "+ Upload Square Token(s)" above to upload custom tokens.')
                        : (query ? 'No built-in tokens match this search.' : 'No built-in tokens available.')
                  }</div>`;

            return `
                <div class="token-category-section" data-category="${catKey}">
                    <div class="token-category-header" data-toggle-category="${catKey}" title="Click to ${isFolded ? 'expand' : 'collapse'}">
                        <span class="token-category-toggle">${arrow}</span>
                        <span>${icon} ${escapeHtml(catTitle)}</span>
                        <span class="token-category-count">${catTokens.length}</span>
                    </div>
                    <div class="token-category-grid ${isFolded ? 'is-folded' : ''}">
                        ${tilesHtml}
                    </div>
                </div>
            `;
        };

        grid.innerHTML = `
            ${renderCategorySection('custom', 'Custom Tokens', '🎨', customTokens)}
            ${renderCategorySection('builtin', 'Built-in Tokens', '🛡️', builtinTokens)}
        `;
    }

    function renderParticipantsBar(participants) {
        const bar = $('chat-participants');
        if (!bar) return;
        bar.innerHTML = participants.map(p => `
            <span class="participant-pill ${p.role === 'gm' ? 'is-gm' : ''}" data-whisper-user="${escapeHtml(p.username)}" title="Click to whisper to ${escapeHtml(p.username)}">
                ${p.role === 'gm' ? '👑 ' : ''}${escapeHtml(p.username)}
            </span>
        `).join('');
    }

    // =========================================================
    // BOARD IMAGES (UPLOAD, FREE MOVE, RESIZE & VISIBILITY TOGGLE)
    // =========================================================
    function syncBoardImages(images) {
        state.boardImages = images;
        const plane = $('tabletop-plane');
        const existingMap = new Map();
        Array.from(plane.querySelectorAll('.board-image-item')).forEach(el => {
            existingMap.set(Number(el.dataset.imageId), el);
        });

        const incomingIds = new Set();

        images.forEach(img => {
            incomingIds.add(img.id);
            let el = existingMap.get(img.id);
            if (!el) {
                el = createBoardImageElement(img);
                plane.appendChild(el);
            }
            updateBoardImageElement(el, img);
        });

        existingMap.forEach((el, id) => {
            if (!incomingIds.has(id)) {
                el.remove();
            }
        });
    }

    function createBoardImageElement(img) {
        const el = document.createElement('div');
        el.className = 'board-image-item';
        el.dataset.imageId = img.id;

        const imgTag = document.createElement('img');
        imgTag.src = img.filename;
        imgTag.alt = state.isGameGm ? img.title : 'Map / Handout';
        el.appendChild(imgTag);

        if (state.isGameGm) {
            // Filename / title tag is shown ONLY to the GM, never to players
            const titleTag = document.createElement('div');
            titleTag.className = 'image-title-tag';
            el.appendChild(titleTag);

            el.classList.add('gm-draggable');

            // Upper-right corner controls for GM (Visibility toggle button + delete)
            const ctrlBar = document.createElement('div');
            ctrlBar.className = 'image-gm-controls';

            const visBtn = document.createElement('button');
            visBtn.type = 'button';
            visBtn.className = 'img-ctrl-btn js-toggle-vis';
            visBtn.title = 'Toggle visibility to players';
            visBtn.addEventListener('mousedown', e => e.stopPropagation());
            visBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const currentImg = state.boardImages.find(i => i.id === img.id);
                if (!currentImg) return;
                const newVis = !currentImg.visible;
                currentImg.visible = newVis;
                updateBoardImageElement(el, currentImg);
                try {
                    await apiCall('update_image', { image_id: img.id, visible: newVis });
                } catch (err) {
                    alert(err.message);
                }
            });

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'img-ctrl-btn delete-btn';
            delBtn.title = 'Remove image from tabletop (keeps in library)';
            delBtn.textContent = '✕';
            delBtn.addEventListener('mousedown', e => e.stopPropagation());
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await apiCall('update_image', { image_id: img.id, on_board: false, visible: false });
                    el.remove();
                    if (state.currentGame) {
                        await fetchGameState(state.currentGame.id);
                    }
                } catch (err) {
                    alert(err.message);
                }
            });

            ctrlBar.appendChild(visBtn);
            ctrlBar.appendChild(delBtn);
            el.appendChild(ctrlBar);

            // Resize handle in bottom-right corner
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'image-resize-handle';
            resizeHandle.title = 'Drag to resize image (Hold Shift for original aspect ratio)';
            el.appendChild(resizeHandle);

            attachGmDragAndResize(el, resizeHandle, img.id);
        }

        return el;
    }

    function setTabletopZoom(percent) {
        const clamped = Math.max(25, Math.min(200, Math.round(percent / 5) * 5));
        state.zoomLevel = clamped / 100;
        const plane = $('tabletop-plane');
        if (plane) {
            plane.style.transform = `scale(${state.zoomLevel})`;
        }
        const slider = $('tabletop-zoom-slider');
        if (slider) {
            slider.value = String(clamped);
        }
        const resetBtn = $('btn-zoom-reset');
        if (resetBtn) {
            resetBtn.textContent = `${clamped}%`;
        }
        renderMapTabsAndGrid();
    }

    function computeTabletopCoords(clientX, clientY) {
        const plane = $('tabletop-plane');
        if (!plane) return { planeX: 100, planeY: 100 };
        const rect = plane.getBoundingClientRect();
        const zoom = state.zoomLevel || 1;
        return {
            planeX: (clientX - rect.left) / zoom,
            planeY: (clientY - rect.top) / zoom
        };
    }

    function getActiveTabForGrid() {
        if (state.previewGridTab) return state.previewGridTab;
        return state.mapTabs.find(t => t.id === Number(state.activeMapId)) || state.mapTabs[0] || null;
    }

    function getGridCellCenter(col, row, tab, tileSize = 1) {
        const c = Number(col) || 0;
        const r = Number(row) || 0;
        const currentTab = tab || getActiveTabForGrid() || {};
        const gridType = ['square', 'hex_v', 'hex_h'].includes(currentTab.grid_type) ? currentTab.grid_type : 'square';
        const cellPx = Math.max(15, Math.min(400, Number(currentTab.grid_cell_px) || state.baseCellPx || 50));
        const offsetX = Number(currentTab.grid_offset_x) || 0;
        const offsetY = Number(currentTab.grid_offset_y) || 0;

        if (gridType === 'hex_v') {
            // Pointy-topped hexagons: W = cellPx, R = cellPx / sqrt(3), H = 3 * R
            const W = cellPx;
            const R = cellPx / Math.sqrt(3);
            const cx = offsetX + (c + 1) * (W / 2);
            const cy = offsetY + R + r * (3 * R) + ((c % 2 !== 0) ? (1.5 * R) : 0);
            return { cx, cy, size: cellPx };
        } else if (gridType === 'hex_h') {
            // Flat-topped hexagons: H = cellPx, R = cellPx / sqrt(3), W = 3 * R
            const H = cellPx;
            const R = cellPx / Math.sqrt(3);
            const cy = offsetY + (r + 1) * (H / 2);
            const cx = offsetX + R + c * (3 * R) + ((r % 2 !== 0) ? (1.5 * R) : 0);
            return { cx, cy, size: cellPx };
        } else {
            // Default square grid:
            // Even sizes (2x, 4x) center on the grid line intersection (center of four tiles).
            // Odd sizes (1x, 3x, 5x) center on the single middle tile center.
            const isEven = (Number(tileSize) % 2 === 0);
            const cx = isEven ? (offsetX + c * cellPx) : (offsetX + (c + 0.5) * cellPx);
            const cy = isEven ? (offsetY + r * cellPx) : (offsetY + (r + 0.5) * cellPx);
            return { cx, cy, size: cellPx };
        }
    }

    function snapPointToGrid(px, py, tab, tileSize = 1) {
        const currentTab = tab || getActiveTabForGrid() || {};
        const gridType = ['square', 'hex_v', 'hex_h'].includes(currentTab.grid_type) ? currentTab.grid_type : 'square';
        const cellPx = Math.max(15, Math.min(400, Number(currentTab.grid_cell_px) || state.baseCellPx || 50));
        const offsetX = Number(currentTab.grid_offset_x) || 0;
        const offsetY = Number(currentTab.grid_offset_y) || 0;

        const x = px - offsetX;
        const y = py - offsetY;

        if (gridType === 'hex_v') {
            const W = cellPx;
            const R = cellPx / Math.sqrt(3);
            const H = 3 * R;
            const approxCol = Math.max(0, Math.round(x / (W / 2) - 1));
            const approxRow = Math.max(0, Math.round((y - R) / H));

            let bestCol = approxCol;
            let bestRow = approxRow;
            let minDistSq = Infinity;

            for (let dc = -2; dc <= 2; dc++) {
                const c = approxCol + dc;
                if (c < 0) continue;
                for (let dr = -2; dr <= 2; dr++) {
                    const r = approxRow + dr;
                    if (r < 0) continue;
                    const { cx, cy } = getGridCellCenter(c, r, currentTab, tileSize);
                    const dsq = (px - cx) ** 2 + (py - cy) ** 2;
                    if (dsq < minDistSq) {
                        minDistSq = dsq;
                        bestCol = c;
                        bestRow = r;
                    }
                }
            }
            return { gridX: bestCol, gridY: bestRow };
        } else if (gridType === 'hex_h') {
            const H = cellPx;
            const R = cellPx / Math.sqrt(3);
            const W = 3 * R;
            const approxRow = Math.max(0, Math.round(y / (H / 2) - 1));
            const approxCol = Math.max(0, Math.round((x - R) / W));

            let bestCol = approxCol;
            let bestRow = approxRow;
            let minDistSq = Infinity;

            for (let dr = -2; dr <= 2; dr++) {
                const r = approxRow + dr;
                if (r < 0) continue;
                for (let dc = -2; dc <= 2; dc++) {
                    const c = approxCol + dc;
                    if (c < 0) continue;
                    const { cx, cy } = getGridCellCenter(c, r, currentTab, tileSize);
                    const dsq = (px - cx) ** 2 + (py - cy) ** 2;
                    if (dsq < minDistSq) {
                        minDistSq = dsq;
                        bestCol = c;
                        bestRow = r;
                    }
                }
            }
            return { gridX: bestCol, gridY: bestRow };
        } else {
            // Square grid:
            // Even sizes (2x, 4x) snap center to the nearest grid line intersection (center of four tiles).
            // Odd sizes (1x, 3x, 5x) snap center to the tile center.
            const isEven = (Number(tileSize) % 2 === 0);
            if (isEven) {
                const gridX = Math.max(1, Math.round(x / cellPx));
                const gridY = Math.max(1, Math.round(y / cellPx));
                return { gridX, gridY };
            } else {
                const gridX = Math.max(0, Math.floor(x / cellPx));
                const gridY = Math.max(0, Math.floor(y / cellPx));
                return { gridX, gridY };
            }
        }
    }

    function formatDistanceUnit(unit) {
        if (!unit) return 'ft';
        const u = unit.toLowerCase().trim();
        if (u === 'feet' || u === 'foot' || u === 'ft') return 'ft';
        if (u === 'yards' || u === 'yard' || u === 'yd') return 'yd';
        if (u === 'meters' || u === 'meter' || u === 'm') return 'm';
        return unit;
    }

    function clearRulerOverlay() {
        const rulerSvg = $('tabletop-ruler-svg');
        if (rulerSvg) rulerSvg.innerHTML = '';
    }

    function renderRuler(x1, y1, x2, y2) {
        const rulerSvg = $('tabletop-ruler-svg');
        if (!rulerSvg) return;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const distPx = Math.hypot(dx, dy);

        const activeTab = getActiveTabForGrid() || {};
        const cellPx = Number(activeTab.grid_cell_px) || state.baseCellPx || 50;
        const gridSize = (activeTab.grid_size !== undefined && activeTab.grid_size !== null && Number(activeTab.grid_size) > 0) ? Number(activeTab.grid_size) : 5;
        const rawUnit = activeTab.grid_unit || 'feet';
        const unit = formatDistanceUnit(rawUnit);

        const cells = distPx / cellPx;
        const distanceVal = cells * gridSize;

        let distText;
        if (distanceVal < 0.05 && distPx < 5) {
            distText = `0 ${unit}`;
        } else if (distanceVal >= 10) {
            distText = `${(Math.round(distanceVal * 10) / 10).toFixed(1).replace(/\.0$/, '')} ${unit}`;
        } else {
            distText = `${(Math.round(distanceVal * 100) / 100).toFixed(2).replace(/0$/, '').replace(/\.0$/, '')} ${unit}`;
        }

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        let badgeX = midX;
        let badgeY = midY;
        if (distPx > 20) {
            const nx = -dy / distPx;
            const ny = dx / distPx;
            badgeX = midX + nx * 22;
            badgeY = midY + ny * 22;
        }

        const badgeWidth = Math.max(76, distText.length * 9 + 24);

        rulerSvg.innerHTML = `
            <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(0,0,0,0.85)" stroke-width="7" stroke-linecap="round" />
            <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#f59e0b" stroke-width="3" stroke-dasharray="8 5" stroke-linecap="round" />
            <circle cx="${x1}" cy="${y1}" r="6" fill="#f59e0b" stroke="#ffffff" stroke-width="2" />
            <circle cx="${x2}" cy="${y2}" r="7" fill="#ef4444" stroke="#ffffff" stroke-width="2" />
            <g transform="translate(${badgeX}, ${badgeY})">
                <rect x="${-badgeWidth / 2}" y="-14" width="${badgeWidth}" height="28" rx="6" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5" />
                <text x="0" y="4.5" text-anchor="middle" fill="#f8fafc" font-size="12" font-weight="700" font-family="system-ui, -apple-system, sans-serif">${escapeHtml(distText)}</text>
            </g>
        `;
    }

    function setActiveTool(tool) {
        if (!['pointer', 'pan', 'ruler'].includes(tool)) tool = 'pointer';
        state.activeTool = tool;

        const btnPointer = $('btn-tool-pointer');
        const btnPan = $('btn-tool-pan');
        const btnRuler = $('btn-tool-ruler');
        const area = $('tabletop-scroll-area');

        if (btnPointer) btnPointer.classList.toggle('active', tool === 'pointer');
        if (btnPan) btnPan.classList.toggle('active', tool === 'pan');
        if (btnRuler) btnRuler.classList.toggle('active', tool === 'ruler');

        if (area) {
            area.classList.remove('tool-pan', 'tool-ruler', 'is-panning');
            if (tool === 'pan') area.classList.add('tool-pan');
            if (tool === 'ruler') area.classList.add('tool-ruler');
        }

        if (tool !== 'ruler') {
            clearRulerOverlay();
        }
    }

    function updateBoardImageElement(el, img) {
        el.style.left = `${img.x}px`;
        el.style.top = `${img.y}px`;
        el.style.width = `${img.width}px`;
        el.style.height = `${img.height}px`;
        // Keep map/handout images below the grid (5000) and tokens (6000+)
        el.style.zIndex = String(Math.min(4999, Math.max(1, Number(img.z_index) || 1)));

        // Greyed out when hidden from players; shown normally when visible
        el.classList.toggle('is-hidden-from-players', !img.visible);

        const titleTag = el.querySelector('.image-title-tag');
        if (titleTag) {
            if (state.isGameGm) {
                titleTag.textContent = img.visible
                    ? img.title
                    : `${img.title} (Hidden from Players)`;
            } else {
                titleTag.remove();
            }
        }

        const visBtn = el.querySelector('.js-toggle-vis');
        if (visBtn) {
            if (img.visible) {
                visBtn.className = 'img-ctrl-btn js-toggle-vis vis-on';
                visBtn.innerHTML = '👁️ Visible to Players';
            } else {
                visBtn.className = 'img-ctrl-btn js-toggle-vis vis-off';
                visBtn.innerHTML = '🙈 Hidden (Click to Show)';
            }
        }
    }

    function attachGmDragAndResize(el, resizeHandle, imageId) {
        // Moving image freely on the page
        el.addEventListener('mousedown', (e) => {
            if (state.activeTool && state.activeTool !== 'pointer') return;
            if (e.button !== 0 || e.target === resizeHandle) return;
            e.preventDefault();
            state.draggingImageId = imageId;

            const startMouseX = e.clientX;
            const startMouseY = e.clientY;
            const origX = parseFloat(el.style.left) || 0;
            const origY = parseFloat(el.style.top) || 0;
            const zoom = state.zoomLevel || 1;

            const onMove = (moveEvent) => {
                const dx = (moveEvent.clientX - startMouseX) / zoom;
                const dy = (moveEvent.clientY - startMouseY) / zoom;
                const nx = Math.max(0, Math.round(origX + dx));
                const ny = Math.max(0, Math.round(origY + dy));
                el.style.left = `${nx}px`;
                el.style.top = `${ny}px`;
            };

            const onUp = async () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                const finalX = parseFloat(el.style.left) || 0;
                const finalY = parseFloat(el.style.top) || 0;
                state.draggingImageId = null;

                try {
                    await apiCall('update_image', {
                        image_id: imageId,
                        x: finalX,
                        y: finalY,
                        bring_to_front: true
                    });
                } catch (err) {
                    // ignore
                }
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });

        // Resizing image (Hold Shift to force original aspect ratio)
        resizeHandle.addEventListener('mousedown', (e) => {
            if (state.activeTool && state.activeTool !== 'pointer') return;
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            state.draggingImageId = imageId;

            const startMouseX = e.clientX;
            const startMouseY = e.clientY;
            const origW = parseFloat(el.style.width) || 300;
            const origH = parseFloat(el.style.height) || 200;
            const zoom = state.zoomLevel || 1;

            const imgTag = el.querySelector('img');
            const naturalRatio = (imgTag && imgTag.naturalWidth > 0 && imgTag.naturalHeight > 0)
                ? (imgTag.naturalWidth / imgTag.naturalHeight)
                : (origW / origH);

            let lastDx = 0;
            let lastDy = 0;

            const applySize = (shiftPressed) => {
                let newW = Math.max(80, origW + lastDx);
                let newH = Math.max(80, origH + lastDy);
                if (shiftPressed) {
                    // Force original natural aspect ratio based on dominant drag dimension
                    if (Math.abs(lastDx) >= Math.abs(lastDy)) {
                        newH = Math.max(60, Math.round(newW / naturalRatio));
                        newW = Math.round(newH * naturalRatio);
                    } else {
                        newW = Math.max(60, Math.round(newH * naturalRatio));
                        newH = Math.round(newW / naturalRatio);
                    }
                } else {
                    newW = Math.round(newW);
                    newH = Math.round(newH);
                }
                el.style.width = `${newW}px`;
                el.style.height = `${newH}px`;
            };

            const onMove = (moveEvent) => {
                lastDx = (moveEvent.clientX - startMouseX) / zoom;
                lastDy = (moveEvent.clientY - startMouseY) / zoom;
                applySize(moveEvent.shiftKey);
            };

            const onKey = (keyEvent) => {
                if (keyEvent.key === 'Shift') {
                    applySize(keyEvent.type === 'keydown');
                }
            };

            const onUp = async () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                window.removeEventListener('keydown', onKey);
                window.removeEventListener('keyup', onKey);
                const finalW = parseFloat(el.style.width) || 300;
                const finalH = parseFloat(el.style.height) || 200;
                state.draggingImageId = null;

                try {
                    await apiCall('update_image', {
                        image_id: imageId,
                        width: finalW,
                        height: finalH
                    });
                } catch (err) {
                    // ignore
                }
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
            window.addEventListener('keydown', onKey);
            window.addEventListener('keyup', onKey);
        });
    }

    // =========================================================
    // BOARD TOKENS (GRID-SNAPPING, 1x/2x/3x SIZING & PLAYER MOVE)
    // =========================================================
    function canUserMoveToken(tok) {
        if (!tok) return false;
        if (state.isGameGm) return true;
        const movableBy = String(tok.movable_by || 'gm');
        if (movableBy === 'all') return true;
        if (state.user && movableBy === String(state.user.id)) return true;
        return false;
    }

    function formatMovableShort(movableBy) {
        const val = String(movableBy || 'gm');
        if (val === 'gm') return '🔒 GM';
        if (val === 'all') return '👥 All';
        const p = (state.participants || []).find(u => String(u.id) === val);
        return p ? `👤 ${p.username}` : '👤 1P';
    }

    function syncBoardTokens(tokens) {
        state.boardTokens = tokens;
        const plane = $('tabletop-plane');
        const existingMap = new Map();
        Array.from(plane.querySelectorAll('.board-token-item')).forEach(el => {
            existingMap.set(Number(el.dataset.tokenId), el);
        });

        const incomingIds = new Set();

        tokens.forEach(tok => {
            incomingIds.add(tok.id);
            let el = existingMap.get(tok.id);
            if (!el) {
                el = createBoardTokenElement(tok);
                plane.appendChild(el);
            }
            updateBoardTokenElement(el, tok);
        });

        existingMap.forEach((el, id) => {
            if (!incomingIds.has(id)) {
                el.remove();
            }
        });
    }

    function createBoardTokenElement(tok) {
        const el = document.createElement('div');
        el.className = 'board-token-item';
        el.dataset.tokenId = tok.id;
        if (state.isGameGm) {
            el.title = tok.title;
        }

        const imgTag = document.createElement('img');
        imgTag.src = tok.filename;
        imgTag.alt = state.isGameGm ? tok.title : 'Token';
        el.appendChild(imgTag);

        if (state.isGameGm) {
            // Right-click on token as GM opens context menu to configure size, movement permission, or remove/delete
            el.addEventListener('contextmenu', (e) => {
                if (!state.isGameGm) return;
                e.preventDefault();
                e.stopPropagation();
                const currentTok = state.boardTokens.find(t => t.id === tok.id) || tok;
                openTokenContextMenu(currentTok, e.clientX, e.clientY);
            });
        }

        attachTokenDragAndResize(el, null, tok.id);
        return el;
    }

    function closeTokenContextMenu() {
        const menu = $('token-context-menu');
        if (menu) {
            menu.classList.add('hidden');
            menu.innerHTML = '';
        }
    }

    function openTokenContextMenu(tok, clientX, clientY) {
        const menu = $('token-context-menu');
        if (!menu || !state.isGameGm) return;

        const players = (state.participants || []).filter(p => p.role !== 'gm');
        const currentMovable = String(tok.movable_by || 'gm');
        const currentSize = Math.max(1, Math.min(12, Number(tok.tile_size) || 1));

        const moveOptions = [
            { value: 'gm', label: '🔒 GM Only' },
            { value: 'all', label: '👥 All Players' },
            ...players.map(p => ({ value: String(p.id), label: `👤 ${p.username}` }))
        ];

        const sizes = [1, 2, 3, 4, 5];

        menu.innerHTML = `
            <div class="token-ctx-header" title="${escapeHtml(tok.title)}">♟️ ${escapeHtml(tok.title)}</div>
            <div class="token-ctx-section-label">Grid Size</div>
            <div class="token-ctx-sizes">
                ${sizes.map(s => `
                    <button type="button" class="token-ctx-size-btn ${currentSize === s ? 'is-active' : ''}" data-ctx-size="${s}" data-ctx-token-id="${tok.id}">
                        ${s}x
                    </button>
                `).join('')}
            </div>
            <div class="token-ctx-divider"></div>
            <div class="token-ctx-section-label">Who Can Move Token</div>
            ${moveOptions.map(opt => {
                const active = currentMovable === String(opt.value);
                return `
                    <button type="button" class="token-ctx-item ${active ? 'is-active' : ''}" data-ctx-token-id="${tok.id}" data-ctx-movable="${escapeHtml(opt.value)}">
                        <span>${escapeHtml(opt.label)}</span>
                        <span>${active ? '✓' : ''}</span>
                    </button>
                `;
            }).join('')}
            <div class="token-ctx-divider"></div>
            <button type="button" class="token-ctx-item" data-ctx-remove-token="${tok.id}">
                <span>↩️ Remove from Map</span>
            </button>
        `;

        menu.classList.remove('hidden');

        // Keep context menu inside viewport bounds
        const rect = menu.getBoundingClientRect();
        const maxX = Math.max(8, window.innerWidth - rect.width - 8);
        const maxY = Math.max(8, window.innerHeight - rect.height - 8);
        menu.style.left = `${Math.min(clientX, maxX)}px`;
        menu.style.top = `${Math.min(clientY, maxY)}px`;
    }

    function openLibraryTokenContextMenu(tok, clientX, clientY) {
        const menu = $('token-context-menu');
        if (!menu || !state.isGameGm) return;

        const onCurrentMap = !!tok.on_board && Number(tok.map_id) === Number(state.activeMapId);
        const isBuiltin = tok.filename && tok.filename.startsWith('assets/tokens/');

        menu.innerHTML = `
            <div class="token-ctx-header" title="${escapeHtml(tok.title)}">♟️ ${escapeHtml(tok.title)}</div>
            <button type="button" class="token-ctx-item" data-ctx-place-token="${tok.id}">
                <span>${onCurrentMap ? '🎯 Focus on Map' : '➕ Place on Active Map'}</span>
            </button>
            ${onCurrentMap ? `
                <button type="button" class="token-ctx-item" data-ctx-remove-token="${tok.id}">
                    <span>↩️ Remove from Map</span>
                </button>
            ` : ''}
            ${!isBuiltin ? `
                <div class="token-ctx-divider"></div>
                <button type="button" class="token-ctx-item is-danger" data-ctx-delete-library-token="${tok.id}">
                    <span>🗑️ Delete from Library</span>
                </button>
            ` : ''}
        `;

        menu.classList.remove('hidden');

        // Keep context menu inside viewport bounds
        const rect = menu.getBoundingClientRect();
        const maxX = Math.max(8, window.innerWidth - rect.width - 8);
        const maxY = Math.max(8, window.innerHeight - rect.height - 8);
        menu.style.left = `${Math.min(clientX, maxX)}px`;
        menu.style.top = `${Math.min(clientY, maxY)}px`;
    }

    function updateBoardTokenElement(el, tok) {
        const activeTab = getActiveTabForGrid();
        const tileSize = Math.max(1, Math.min(12, Number(tok.tile_size) || 1));
        const cellPos = getGridCellCenter(tok.grid_x, tok.grid_y, activeTab, tileSize);
        const tokenDiameter = tileSize * cellPos.size;

        el.style.left = `${cellPos.cx - tokenDiameter / 2}px`;
        el.style.top = `${cellPos.cy - tokenDiameter / 2}px`;
        el.style.width = `${tokenDiameter}px`;
        el.style.height = `${tokenDiameter}px`;
        // Always above all map/handout images (1..4999) and grid (5000), while 3D dice overlay sits above tabletop-plane
        el.style.zIndex = String(6000 + Math.max(1, Number(tok.z_index) || 1));

        const movable = canUserMoveToken(tok);
        el.classList.toggle('token-draggable', movable);
        if (state.isGameGm) {
            el.title = tok.title;
        }

        const titleTag = el.querySelector('.token-title-tag');
        if (titleTag) {
            titleTag.remove();
        }
    }

    function attachTokenDragAndResize(el, resizeHandle, tokenId) {
        // Grid-snapping movement for GM or allowed player(s)
        el.addEventListener('mousedown', (e) => {
            if (state.activeTool && state.activeTool !== 'pointer') return;
            if (e.button !== 0) return;
            if (resizeHandle && e.target === resizeHandle) return;
            if (e.target.closest('.token-gm-controls')) return;

            const currentTok = state.boardTokens.find(t => t.id === tokenId);
            if (!currentTok || !canUserMoveToken(currentTok)) return;

            e.preventDefault();
            e.stopPropagation();
            state.draggingTokenId = tokenId;

            const activeTab = getActiveTabForGrid();
            const origGridX = Number(currentTok.grid_x) || 0;
            const origGridY = Number(currentTok.grid_y) || 0;
            const tileSize = Math.max(1, Math.min(12, Number(currentTok.tile_size) || 1));
            const zoom = state.zoomLevel || 1;

            const startPos = getGridCellCenter(origGridX, origGridY, activeTab, tileSize);
            const tokenDiameter = tileSize * startPos.size;
            const origCenterX = startPos.cx;
            const origCenterY = startPos.cy;

            let snappedGridX = origGridX;
            let snappedGridY = origGridY;

            const updateTokenMovementRuler = (targetGridX, targetGridY) => {
                const targetPos = getGridCellCenter(targetGridX, targetGridY, activeTab, tileSize);
                renderRuler(origCenterX, origCenterY, targetPos.cx, targetPos.cy);
            };

            // Show ruler measuring from start tile center as long as mouse is pressed
            updateTokenMovementRuler(origGridX, origGridY);

            const startMouseX = e.clientX;
            const startMouseY = e.clientY;

            const onMove = (moveEvent) => {
                const dx = (moveEvent.clientX - startMouseX) / zoom;
                const dy = (moveEvent.clientY - startMouseY) / zoom;
                const curCenterX = origCenterX + dx;
                const curCenterY = origCenterY + dy;

                const snapped = snapPointToGrid(curCenterX, curCenterY, activeTab, tileSize);
                snappedGridX = snapped.gridX;
                snappedGridY = snapped.gridY;

                const newPos = getGridCellCenter(snappedGridX, snappedGridY, activeTab, tileSize);
                el.style.left = `${newPos.cx - tokenDiameter / 2}px`;
                el.style.top = `${newPos.cy - tokenDiameter / 2}px`;
                updateTokenMovementRuler(snappedGridX, snappedGridY);
            };

            const onUp = async () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                clearRulerOverlay();

                currentTok.grid_x = snappedGridX;
                currentTok.grid_y = snappedGridY;

                try {
                    const res = await apiCall('update_token', {
                        token_id: tokenId,
                        grid_x: snappedGridX,
                        grid_y: snappedGridY,
                        bring_to_front: true,
                        view_mode: state.forcePlayerView ? 'player' : ''
                    });
                    if (res && res.token) {
                        Object.assign(currentTok, res.token);
                    }
                } catch (err) {
                    if (state.currentGame) {
                        await fetchGameState(state.currentGame.id);
                    }
                } finally {
                    state.draggingTokenId = null;
                    clearRulerOverlay();
                }
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });

        // Whole-tile resizing (1x, 2x, 3x, etc.) for GM
        if (resizeHandle) {
            resizeHandle.addEventListener('mousedown', (e) => {
                if (state.activeTool && state.activeTool !== 'pointer') return;
                if (e.button !== 0 || !state.isGameGm) return;
                e.preventDefault();
                e.stopPropagation();
                state.draggingTokenId = tokenId;

                const currentTok = state.boardTokens.find(t => t.id === tokenId);
                const cellPx = state.baseCellPx || 50;
                const origTileSize = currentTok ? (Number(currentTok.tile_size) || 1) : 1;
                const startMouseX = e.clientX;
                const startMouseY = e.clientY;
                const zoom = state.zoomLevel || 1;

                let snappedTileSize = origTileSize;

                const onMove = (moveEvent) => {
                    const dx = (moveEvent.clientX - startMouseX) / zoom;
                    const dy = (moveEvent.clientY - startMouseY) / zoom;
                    const deltaPx = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
                    snappedTileSize = Math.max(1, Math.min(12, Math.round((origTileSize * cellPx + deltaPx) / cellPx)));
                    const cellPos = getGridCellCenter(currentTok.grid_x, currentTok.grid_y, activeTab, snappedTileSize);
                    const diameter = snappedTileSize * cellPos.size;
                    el.style.width = `${diameter}px`;
                    el.style.height = `${diameter}px`;
                    el.style.left = `${cellPos.cx - diameter / 2}px`;
                    el.style.top = `${cellPos.cy - diameter / 2}px`;
                    const sizeBtn = el.querySelector('.js-token-size-btn');
                    if (sizeBtn) {
                        sizeBtn.textContent = `${snappedTileSize}x`;
                    }
                };

                const onUp = async () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    state.draggingTokenId = null;

                    if (currentTok) {
                        currentTok.tile_size = snappedTileSize;
                        updateBoardTokenElement(el, currentTok);
                    }

                    try {
                        await apiCall('update_token', {
                            token_id: tokenId,
                            tile_size: snappedTileSize
                        });
                    } catch (err) {
                        // ignore
                    }
                };

                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });
        }
    }

    // =========================================================
    // CHAT & COMMANDS (/r, /roll, /w, /openrolls)
    // =========================================================
    function appendChatMessages(messages) {
        const container = $('chat-messages');
        let newestRoll = null;

        for (const msg of messages) {
            if (msg.id > state.lastMessageId) {
                state.lastMessageId = msg.id;
            }
            if (document.querySelector(`[data-msg-id="${msg.id}"]`)) {
                continue;
            }

            const msgEl = document.createElement('div');
            msgEl.dataset.msgId = msg.id;
            const timeStr = new Date(msg.created_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            if (msg.type === 'system') {
                msgEl.className = 'chat-msg msg-system';
                msgEl.innerHTML = `<div>${escapeHtml(msg.content)}</div>`;
            } else if (msg.type === 'whisper') {
                msgEl.className = 'chat-msg msg-whisper';
                const direction = msg.sender_id === state.user.id
                    ? `To ${escapeHtml(msg.recipient_name)}`
                    : `From ${escapeHtml(msg.sender_name)}`;
                msgEl.innerHTML = `
                    <div class="chat-msg-header">
                        <span class="whisper-tag">🔒 Whisper (${direction})</span>
                        <span class="msg-time">${timeStr}</span>
                    </div>
                    <div>${escapeHtml(msg.content)}</div>
                `;
            } else if (msg.type === 'roll' && msg.roll_data) {
                const r = msg.roll_data;
                msgEl.className = 'chat-msg msg-roll' + (msg.is_hidden_roll ? ' is-hidden-gm-roll' : '');

                const dicePills = (r.dice || []).map(d => {
                    const succStyle = d.success === true
                        ? 'border-color:#10b981; background:rgba(16,185,129,0.2); color:#6ee7b7;'
                        : (d.success === false ? 'opacity:0.55;' : '');
                    return `
                        <span class="die-pill ${d.dropped ? 'dropped' : ''}" style="${succStyle}" title="${escapeHtml(d.type)}">
                            ${escapeHtml(d.type)}: ${escapeHtml(String(d.display))}${d.success === true ? ' ✓' : ''}
                        </span>
                    `;
                }).join('');

                msgEl.innerHTML = `
                    <div class="chat-msg-header">
                        <span class="msg-sender ${msg.sender_role === 'gm' ? 'gm-sender' : ''}">
                            🎲 ${escapeHtml(msg.sender_name)} ${msg.is_hidden_roll ? '<span class="badge badge-gm" style="margin-left:4px;">Hidden GM Roll</span>' : ''}
                        </span>
                        <span class="msg-time">${timeStr}</span>
                    </div>
                    <div class="roll-formula-line">Rolled ${escapeHtml(r.formula)}${r.label ? ' (' + escapeHtml(r.label) + ')' : ''}: ${escapeHtml(r.breakdown)}</div>
                    <div class="roll-dice-pills">${dicePills}</div>
                    <div class="roll-total-box">
                        <span class="roll-total-label">${r.is_success_pool ? 'Successes' : 'Roll Result'}</span>
                        <span class="roll-total-value">${escapeHtml(String(r.total))}</span>
                    </div>
                `;

                if (state.initialHistoryLoaded && !state.seenRollIds.has(msg.id)) {
                    newestRoll = msg;
                }
                state.seenRollIds.add(msg.id);
            } else {
                msgEl.className = 'chat-msg';
                msgEl.innerHTML = `
                    <div class="chat-msg-header">
                        <span class="msg-sender ${msg.sender_role === 'gm' ? 'gm-sender' : ''}">
                            ${msg.sender_role === 'gm' ? '👑 ' : ''}${escapeHtml(msg.sender_name)}
                        </span>
                        <span class="msg-time">${timeStr}</span>
                    </div>
                    <div>${escapeHtml(msg.content)}</div>
                `;
            }

            container.appendChild(msgEl);
        }

        container.scrollTop = container.scrollHeight;

        // Trigger 3D dice animation on the open tabletop for new rolls
        if (newestRoll && state.diceEngine) {
            state.diceEngine.rollDice(newestRoll);
        }
    }

    function bindVttEvents() {
        // Back to Lobby
        $('btn-back-lobby').addEventListener('click', () => {
            if (state.diceEngine) state.diceEngine.clear();
            // Clear URL query params if returning to lobby
            if (window.location.search) {
                window.history.replaceState({}, '', window.location.pathname);
            }
            state.forcePlayerView = false;
            enterLobby();
        });

        // Clear 3D dice overlay manually if desired
        $('btn-clear-dice').addEventListener('click', () => {
            if (state.diceEngine) state.diceEngine.clear();
        });

        // Hide UI / Show UI (Maximized Map View for Player View)
        const vttView = $('view-vtt');
        const showUiBtn = $('btn-show-ui');
        let cornerHideTimer = null;

        function setUiHidden(hidden) {
            if (!vttView) return;
            vttView.classList.toggle('ui-hidden-mode', hidden);
            if (showUiBtn) {
                showUiBtn.classList.add('hidden');
            }
            if (cornerHideTimer) {
                clearTimeout(cornerHideTimer);
                cornerHideTimer = null;
            }
            requestAnimationFrame(() => {
                if (state.diceEngine) state.diceEngine.resize();
            });
        }

        $('btn-hide-ui').addEventListener('click', () => {
            setUiHidden(true);
        });

        showUiBtn.addEventListener('click', () => {
            setUiHidden(false);
        });

        function checkCornerPointer(clientX, clientY, isTouch = false) {
            if (!vttView || !vttView.classList.contains('ui-hidden-mode')) return;
            const edgeX = 140;
            const edgeY = 110;
            const w = window.innerWidth;
            const h = window.innerHeight;

            let cornerClass = null;
            if (clientX <= edgeX && clientY <= edgeY) {
                cornerClass = 'corner-tl';
            } else if (clientX >= w - edgeX && clientY <= edgeY) {
                cornerClass = 'corner-tr';
            } else if (clientX <= edgeX && clientY >= h - edgeY) {
                cornerClass = 'corner-bl';
            } else if (clientX >= w - edgeX && clientY >= h - edgeY) {
                cornerClass = 'corner-br';
            }

            if (cornerClass) {
                if (cornerHideTimer) {
                    clearTimeout(cornerHideTimer);
                    cornerHideTimer = null;
                }
                showUiBtn.className = `btn btn-primary btn-sm show-ui-corner-btn ${cornerClass}`;
                if (isTouch) {
                    cornerHideTimer = setTimeout(() => {
                        showUiBtn.classList.add('hidden');
                    }, 3500);
                }
            } else if (!isTouch && !showUiBtn.matches(':hover')) {
                showUiBtn.classList.add('hidden');
            }
        }

        window.addEventListener('mousemove', (e) => {
            checkCornerPointer(e.clientX, e.clientY, false);
        });

        window.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length > 0) {
                checkCornerPointer(e.touches[0].clientX, e.touches[0].clientY, true);
            }
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (e.touches && e.touches.length > 0) {
                checkCornerPointer(e.touches[0].clientX, e.touches[0].clientY, true);
            }
        }, { passive: true });

        // Tabletop Zoom Slider & Controls
        const zoomSlider = $('tabletop-zoom-slider');
        if (zoomSlider) {
            zoomSlider.addEventListener('input', () => {
                setTabletopZoom(Number(zoomSlider.value));
            });
        }
        $('btn-zoom-in').addEventListener('click', () => {
            setTabletopZoom(Math.round(state.zoomLevel * 100) + 15);
        });
        $('btn-zoom-out').addEventListener('click', () => {
            setTabletopZoom(Math.round(state.zoomLevel * 100) - 15);
        });
        $('btn-zoom-reset').addEventListener('click', () => {
            setTabletopZoom(100);
        });

        // =========================================================
        // Tabletop Map Area Tools: Pointer, Hand (Pan), Ruler
        // =========================================================
        function setupTabletopTools() {
            const btnPointer = $('btn-tool-pointer');
            const btnPan = $('btn-tool-pan');
            const btnRuler = $('btn-tool-ruler');
            const area = $('tabletop-scroll-area');

            if (btnPointer) btnPointer.addEventListener('click', () => setActiveTool('pointer'));
            if (btnPan) btnPan.addEventListener('click', () => setActiveTool('pan'));
            if (btnRuler) btnRuler.addEventListener('click', () => setActiveTool('ruler'));

            // Keyboard shortcuts (V for Pointer, H for Hand, R for Ruler, Space to hold Pan, Esc to cancel/clear ruler)
            let spacePressed = false;
            let toolBeforeSpace = null;

            window.addEventListener('keydown', (e) => {
                const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
                if (tag === 'input' || tag === 'textarea' || tag === 'select' || (document.activeElement && document.activeElement.isContentEditable)) {
                    return;
                }
                if (e.code === 'Space' && !spacePressed) {
                    spacePressed = true;
                    toolBeforeSpace = state.activeTool || 'pointer';
                    setActiveTool('pan');
                    e.preventDefault();
                } else if (e.key === 'v' || e.key === 'V') {
                    setActiveTool('pointer');
                } else if (e.key === 'h' || e.key === 'H') {
                    setActiveTool('pan');
                } else if (e.key === 'r' || e.key === 'R') {
                    setActiveTool('ruler');
                } else if (e.key === 'Escape') {
                    if (state.activeTool === 'ruler') {
                        clearRulerOverlay();
                    }
                }
            });

            window.addEventListener('keyup', (e) => {
                if (e.code === 'Space' && spacePressed) {
                    spacePressed = false;
                    if (toolBeforeSpace) {
                        setActiveTool(toolBeforeSpace);
                        toolBeforeSpace = null;
                    }
                }
            });

            if (!area) return;

            let isPanning = false;
            let panStartX = 0;
            let panStartY = 0;
            let panStartScrollLeft = 0;
            let panStartScrollTop = 0;

            let isMeasuring = false;
            let rulerStartX = 0;
            let rulerStartY = 0;

            area.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;

                if (state.activeTool === 'pan') {
                    isPanning = true;
                    panStartX = e.clientX;
                    panStartY = e.clientY;
                    panStartScrollLeft = area.scrollLeft;
                    panStartScrollTop = area.scrollTop;
                    area.classList.add('is-panning');
                    e.preventDefault();
                } else if (state.activeTool === 'ruler') {
                    isMeasuring = true;
                    const coords = computeTabletopCoords(e.clientX, e.clientY);
                    rulerStartX = coords.planeX;
                    rulerStartY = coords.planeY;
                    renderRuler(rulerStartX, rulerStartY, rulerStartX, rulerStartY);
                    e.preventDefault();
                }
            });

            window.addEventListener('mousemove', (e) => {
                if (isPanning && state.activeTool === 'pan') {
                    const dx = e.clientX - panStartX;
                    const dy = e.clientY - panStartY;
                    area.scrollLeft = panStartScrollLeft - dx;
                    area.scrollTop = panStartScrollTop - dy;
                } else if (isMeasuring && state.activeTool === 'ruler') {
                    const coords = computeTabletopCoords(e.clientX, e.clientY);
                    renderRuler(rulerStartX, rulerStartY, coords.planeX, coords.planeY);
                }
            });

            window.addEventListener('mouseup', () => {
                if (isPanning) {
                    isPanning = false;
                    area.classList.remove('is-panning');
                }
                if (isMeasuring) {
                    isMeasuring = false;
                }
            });
        }

        setupTabletopTools();

        // GM Quick Toggle /openrolls button
        $('btn-toggle-openrolls').addEventListener('click', async () => {
            if (!state.currentGame) return;
            await sendChatCommand('/openrolls');
        });

        // GM Open Player View in a second browser tab
        $('btn-open-player-tab').addEventListener('click', () => {
            if (!state.currentGame) return;
            const url = `${window.location.pathname}?game_id=${encodeURIComponent(state.currentGame.id)}&view=player`;
            window.open(url, '_blank');
        });

        // GM Open & Close Image Library Modal
        const imgSearchInput = $('image-library-search');
        if (imgSearchInput) {
            imgSearchInput.addEventListener('input', (e) => {
                state.imageLibrarySearch = e.target.value;
                renderLibraryModal();
            });
        }

        $('btn-open-library').addEventListener('click', () => {
            if (imgSearchInput) imgSearchInput.value = state.imageLibrarySearch || '';
            renderLibraryModal();
            $('modal-image-library').classList.remove('hidden');
            if (imgSearchInput) imgSearchInput.focus();
        });

        $('btn-close-library').addEventListener('click', () => {
            $('modal-image-library').classList.add('hidden');
        });

        // GM Open & Close Token Library Modal
        const tokSearchInput = $('token-library-search');
        if (tokSearchInput) {
            tokSearchInput.addEventListener('input', (e) => {
                state.tokenLibrarySearch = e.target.value;
                renderTokenLibraryModal();
            });
        }

        $('btn-open-token-library').addEventListener('click', () => {
            if (tokSearchInput) tokSearchInput.value = state.tokenLibrarySearch || '';
            renderTokenLibraryModal();
            $('modal-token-library').classList.remove('hidden');
            if (tokSearchInput) tokSearchInput.focus();
        });

        $('btn-close-token-library').addEventListener('click', () => {
            $('modal-token-library').classList.add('hidden');
        });

        // GM Map Tabs: Unified Tab, Grid & Background Settings Modal
        $('btn-add-map-tab').addEventListener('click', () => {
            openMapTabModal(0);
        });

        $('btn-open-grid-settings').addEventListener('click', () => {
            openMapTabModal(state.activeMapId);
        });

        $('btn-close-map-tab-modal').addEventListener('click', () => {
            $('modal-map-tab').classList.add('hidden');
            renderMapTabsAndGrid(); // Revert any live preview adjustments
        });

        const cancelTabBtn = $('btn-cancel-map-tab');
        if (cancelTabBtn) {
            cancelTabBtn.addEventListener('click', () => {
                $('modal-map-tab').classList.add('hidden');
                renderMapTabsAndGrid(); // Revert any live preview adjustments
            });
        }

        $('map-tabs-list').addEventListener('click', async (e) => {
            const activeDotBtn = e.target.closest('[data-set-player-active]');
            if (activeDotBtn) {
                e.stopPropagation();
                const mapId = Number(activeDotBtn.getAttribute('data-set-player-active'));
                state.playerActiveMapId = mapId;
                renderMapTabsAndGrid();
                try {
                    await apiCall('select_map_tab', { map_id: mapId });
                } catch (err) {
                    alert(err.message);
                }
                return;
            }

            const editBtn = e.target.closest('[data-edit-map-tab]') || e.target.closest('[data-grid-settings-map-tab]');
            if (editBtn) {
                e.stopPropagation();
                const mapId = Number(editBtn.getAttribute('data-edit-map-tab') || editBtn.getAttribute('data-grid-settings-map-tab'));
                openMapTabModal(mapId);
                return;
            }

            const delBtn = e.target.closest('[data-delete-map-tab]');
            if (delBtn) {
                e.stopPropagation();
                const mapId = Number(delBtn.getAttribute('data-delete-map-tab'));
                const tab = state.mapTabs.find(t => t.id === mapId);
                const tabName = tab ? tab.name : 'this map tab';
                const confirmed = await showConfirmModal({
                    title: 'Delete Map Tab',
                    message: `Delete map tab "${tabName}"?`,
                    detail: 'Placed images and tokens on this tab will be returned to the library.',
                    okText: 'Delete Tab',
                    isDanger: true,
                    icon: '🗺️'
                });
                if (!confirmed) return;
                try {
                    const res = await apiCall('delete_map_tab', { map_id: mapId });
                    state.mapTabs = res.map_tabs || [];
                    state.activeMapId = Number(res.active_map_id || 0);
                    if (state.currentGame) {
                        await fetchGameState(state.currentGame.id);
                    }
                } catch (err) {
                    alert(err.message);
                }
                return;
            }

            // Clicking the tab itself only switches the GM's secret view, NOT the players' active map!
            const selectItem = e.target.closest('[data-select-map-tab]');
            if (selectItem) {
                const mapId = Number(selectItem.getAttribute('data-select-map-tab'));
                if (mapId === state.activeMapId) return;
                state.activeMapId = mapId;
                if (state.currentGame) {
                    await fetchGameState(state.currentGame.id);
                }
            }
        });

        async function handleImageUploadFiles(fileList) {
            if (!fileList || fileList.length === 0 || !state.currentGame) return;
            const files = Array.from(fileList);

            const formData = new FormData();
            formData.append('game_id', String(state.currentGame.id));
            files.forEach(file => {
                formData.append('images[]', file);
            });

            const btn = $('btn-upload-image');
            const origText = btn ? btn.textContent : '';
            if (btn) {
                btn.textContent = files.length > 1 ? `Uploading ${files.length}...` : 'Uploading...';
                btn.disabled = true;
            }

            try {
                const res = await apiCall('upload_image', formData, true);
                const added = Array.isArray(res.images) ? res.images : (res.image ? [res.image] : []);
                if (added.length > 0) {
                    state.libraryImages.unshift(...added);
                    updateVttHeaderAndHud();
                    renderLibraryModal();
                }
                if (Array.isArray(res.skipped) && res.skipped.length > 0) {
                    showAlertModal('Some files were skipped:\n- ' + res.skipped.join('\n- '), 'Upload Skipped Files', '⚠️');
                }
            } catch (err) {
                showAlertModal('Upload error: ' + err.message, 'Image Upload Failed', '⚠️');
            } finally {
                if (btn) {
                    btn.textContent = origText;
                    btn.disabled = false;
                }
            }
        }

        // GM Upload Image to Library button & file input
        const fileInput = $('gm-image-file-input');
        $('btn-upload-image').addEventListener('click', () => {
            fileInput.value = '';
            fileInput.click();
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files.length > 0) {
                handleImageUploadFiles(fileInput.files);
            }
        });

        // Drag and Drop files onto Image Library Modal
        const imgModal = $('modal-image-library');
        const imgModalCard = imgModal ? imgModal.querySelector('.modal-card') : null;
        if (imgModal) {
            ['dragenter', 'dragover'].forEach(eventName => {
                imgModal.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (imgModalCard) imgModalCard.classList.add('is-dragover');
                });
            });
            ['dragleave', 'drop'].forEach(eventName => {
                imgModal.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (imgModalCard) imgModalCard.classList.remove('is-dragover');
                });
            });
            imgModal.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (imgModalCard) imgModalCard.classList.remove('is-dragover');
                const dt = e.dataTransfer;
                if (dt && dt.files && dt.files.length > 0) {
                    handleImageUploadFiles(dt.files);
                }
            });
        }

        // Delegate actions inside the GM Image Library grid (Open on Tabletop, Remove from Board, Delete)
        $('library-images-grid').addEventListener('click', async (e) => {
            const placeBtn = e.target.closest('[data-place-image]');
            if (placeBtn) {
                const imageId = Number(placeBtn.getAttribute('data-place-image'));
                const area = $('tabletop-scroll-area');
                const spawnX = Math.round((area ? area.scrollLeft : 0) + 120 + Math.random() * 60);
                const spawnY = Math.round((area ? area.scrollTop : 0) + 90 + Math.random() * 60);
                try {
                    // When first added to the tabletop from the library, it starts hidden from players (greyed out to GM)
                    await apiCall('update_image', {
                        image_id: imageId,
                        map_id: state.activeMapId,
                        on_board: true,
                        visible: false,
                        x: spawnX,
                        y: spawnY,
                        bring_to_front: true
                    });
                    if (state.currentGame) {
                        await fetchGameState(state.currentGame.id);
                    }
                } catch (err) {
                    alert(err.message);
                }
                return;
            }

            const unplaceBtn = e.target.closest('[data-unplace-image]');
            if (unplaceBtn) {
                const imageId = Number(unplaceBtn.getAttribute('data-unplace-image'));
                try {
                    await apiCall('update_image', {
                        image_id: imageId,
                        on_board: false,
                        visible: false
                    });
                    if (state.currentGame) {
                        await fetchGameState(state.currentGame.id);
                    }
                } catch (err) {
                    alert(err.message);
                }
                return;
            }

            const deleteBtn = e.target.closest('[data-delete-image]');
            if (deleteBtn) {
                const imageId = Number(deleteBtn.getAttribute('data-delete-image'));
                const img = state.libraryImages.find(i => i.id === imageId);
                const imgTitle = img ? img.title : 'this image';
                const confirmed = await showConfirmModal({
                    title: 'Delete Image from Library',
                    message: `Permanently delete "${imgTitle}" from the library?`,
                    detail: 'This image will also be removed from any maps where it is placed.',
                    okText: 'Delete Image',
                    isDanger: true,
                    icon: '🖼️'
                });
                if (!confirmed) return;
                try {
                    await apiCall('delete_image', { image_id: imageId });
                    if (state.currentGame) {
                        await fetchGameState(state.currentGame.id);
                    }
                } catch (err) {
                    alert(err.message);
                }
            }
        });

        async function handleTokenUploadFiles(fileList) {
            if (!fileList || fileList.length === 0 || !state.currentGame) return;
            const selectedFiles = Array.from(fileList);

            // Client-side square (1:1) image verification before uploading
            const checkDimensions = (file) => new Promise((resolve) => {
                const objUrl = URL.createObjectURL(file);
                const probe = new Image();
                probe.onload = () => {
                    const w = probe.naturalWidth;
                    const h = probe.naturalHeight;
                    URL.revokeObjectURL(objUrl);
                    resolve({ ok: w > 0 && h > 0 && w === h, w, h });
                };
                probe.onerror = () => {
                    URL.revokeObjectURL(objUrl);
                    resolve({ ok: false, w: 0, h: 0 });
                };
                probe.src = objUrl;
            });

            const btn = $('btn-upload-token');
            const origText = btn ? btn.textContent : '';
            if (btn) {
                btn.textContent = 'Checking...';
                btn.disabled = true;
            }

            try {
                const validFiles = [];
                const clientSkipped = [];
                let lastDim = { w: 0, h: 0 };

                for (const file of selectedFiles) {
                    const { ok, w, h } = await checkDimensions(file);
                    if (ok) {
                        validFiles.push(file);
                        lastDim = { w, h };
                    } else {
                        clientSkipped.push(
                            w > 0 && h > 0
                                ? `${file.name} (${w}×${h} px — not square)`
                                : `${file.name} (invalid image)`
                        );
                    }
                }

                if (validFiles.length === 0) {
                    showAlertModal(
                        `Only square images (1:1 aspect ratio) are accepted as tokens.\n\nSkipped:\n- ` +
                        clientSkipped.join('\n- '),
                        'Square Images Required',
                        '♟️'
                    );
                    return;
                }

                if (btn) btn.textContent = validFiles.length > 1 ? `Uploading ${validFiles.length}...` : 'Uploading...';
                const formData = new FormData();
                formData.append('game_id', String(state.currentGame.id));
                validFiles.forEach(file => {
                    formData.append('tokens[]', file);
                });
                formData.append('client_width', String(lastDim.w));
                formData.append('client_height', String(lastDim.h));

                const res = await apiCall('upload_token', formData, true);
                const added = Array.isArray(res.tokens) ? res.tokens : (res.token ? [res.token] : []);
                if (added.length > 0) {
                    state.libraryTokens.unshift(...added);
                    updateVttHeaderAndHud();
                    renderTokenLibraryModal();
                }

                const allSkipped = [
                    ...clientSkipped,
                    ...(Array.isArray(res.skipped) ? res.skipped : [])
                ];
                if (allSkipped.length > 0) {
                    showAlertModal('Some non-square or invalid token files were skipped:\n- ' + allSkipped.join('\n- '), 'Some Tokens Skipped', '⚠️');
                }
            } catch (err) {
                showAlertModal('Token upload error: ' + err.message, 'Upload Failed', '⚠️');
            } finally {
                if (btn) {
                    btn.textContent = origText;
                    btn.disabled = false;
                }
            }
        }

        // GM Upload Square Token to Token Library
        const tokenFileInput = $('gm-token-file-input');
        $('btn-upload-token').addEventListener('click', () => {
            tokenFileInput.value = '';
            tokenFileInput.click();
        });

        tokenFileInput.addEventListener('change', () => {
            if (tokenFileInput.files && tokenFileInput.files.length > 0) {
                handleTokenUploadFiles(tokenFileInput.files);
            }
        });

        // Drag and Drop files onto Token Library Modal
        const tokModal = $('modal-token-library');
        const tokModalCard = tokModal ? tokModal.querySelector('.modal-card') : null;
        if (tokModal) {
            ['dragenter', 'dragover'].forEach(eventName => {
                tokModal.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (tokModalCard) tokModalCard.classList.add('is-dragover');
                });
            });
            ['dragleave', 'drop'].forEach(eventName => {
                tokModal.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (tokModalCard) tokModalCard.classList.remove('is-dragover');
                });
            });
            tokModal.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (tokModalCard) tokModalCard.classList.remove('is-dragover');
                const dt = e.dataTransfer;
                if (dt && dt.files && dt.files.length > 0) {
                    handleTokenUploadFiles(dt.files);
                }
            });
        }

        const getTargetMapId = () => {
            if (state.activeMapId > 0) return state.activeMapId;
            if (state.mapTabs && state.mapTabs.length > 0) return Number(state.mapTabs[0].id);
            if (state.currentGame && state.currentGame.active_map_id) return Number(state.currentGame.active_map_id);
            return 1;
        };

        // GM Right-Click Token Context Menu actions & dismissal
        const tokenCtxMenu = $('token-context-menu');
        if (tokenCtxMenu) {
            tokenCtxMenu.addEventListener('mousedown', (e) => e.stopPropagation());
            tokenCtxMenu.addEventListener('click', async (e) => {
                e.stopPropagation();

                const sizeBtn = e.target.closest('[data-ctx-size]');
                if (sizeBtn) {
                    const tokenId = Number(sizeBtn.getAttribute('data-ctx-token-id'));
                    const size = Math.max(1, Math.min(12, Number(sizeBtn.getAttribute('data-ctx-size')) || 1));
                    closeTokenContextMenu();
                    const currentTok = state.boardTokens.find(t => t.id === tokenId);
                    if (currentTok) {
                        currentTok.tile_size = size;
                        const el = document.querySelector(`.board-token-item[data-token-id="${tokenId}"]`);
                        if (el) updateBoardTokenElement(el, currentTok);
                    }
                    try {
                        await apiCall('update_token', { token_id: tokenId, tile_size: size });
                        if (state.currentGame) {
                            await fetchGameState(state.currentGame.id);
                        }
                    } catch (err) {
                        alert(err.message);
                    }
                    return;
                }

                const moveBtn = e.target.closest('[data-ctx-movable]');
                if (moveBtn) {
                    const tokenId = Number(moveBtn.getAttribute('data-ctx-token-id'));
                    const movableBy = moveBtn.getAttribute('data-ctx-movable') || 'gm';
                    closeTokenContextMenu();
                    try {
                        await apiCall('update_token', { token_id: tokenId, movable_by: movableBy });
                        if (state.currentGame) {
                            await fetchGameState(state.currentGame.id);
                        }
                    } catch (err) {
                        alert(err.message);
                    }
                    return;
                }

                const removeBtn = e.target.closest('[data-ctx-remove-token]');
                if (removeBtn) {
                    const tokenId = Number(removeBtn.getAttribute('data-ctx-remove-token'));
                    closeTokenContextMenu();
                    const el = document.querySelector(`.board-token-item[data-token-id="${tokenId}"]`);
                    if (el) el.remove();
                    try {
                        await apiCall('update_token', { token_id: tokenId, on_board: false });
                        if (state.currentGame) {
                            await fetchGameState(state.currentGame.id);
                        }
                    } catch (err) {
                        alert(err.message);
                    }
                    return;
                }

                const placeBtn = e.target.closest('[data-ctx-place-token]');
                if (placeBtn) {
                    const tokenId = Number(placeBtn.getAttribute('data-ctx-place-token'));
                    closeTokenContextMenu();
                    hide($('modal-token-library'));
                    const mapId = getTargetMapId();
                    const activeTab = getActiveTabForGrid();
                    const area = $('tabletop-scroll-area');
                    const rawX = (area ? area.scrollLeft : 0) + 120 + Math.random() * 80;
                    const rawY = (area ? area.scrollTop : 0) + 90 + Math.random() * 80;
                    const tok = (state.libraryTokens || []).find(t => t.id === tokenId) || (state.boardTokens || []).find(t => t.id === tokenId);
                    const tileSize = tok ? (Number(tok.tile_size) || 1) : 1;
                    const snapped = snapPointToGrid(rawX, rawY, activeTab, tileSize);
                    const spawnGridX = snapped.gridX;
                    const spawnGridY = snapped.gridY;
                    try {
                        const res = await apiCall('update_token', {
                            token_id: tokenId,
                            map_id: mapId,
                            on_board: true,
                            grid_x: spawnGridX,
                            grid_y: spawnGridY,
                            bring_to_front: true
                        });
                        if (res && res.token) {
                            const idx = state.boardTokens.findIndex(t => t.id === res.token.id);
                            if (idx >= 0) state.boardTokens[idx] = res.token;
                            else state.boardTokens.push(res.token);
                            syncBoardTokens(state.boardTokens);
                        }
                        if (state.currentGame) {
                            await fetchGameState(state.currentGame.id);
                        }
                    } catch (err) {
                        alert(err.message);
                    }
                    return;
                }

                const delLibBtn = e.target.closest('[data-ctx-delete-library-token]');
                if (delLibBtn) {
                    const tokenId = Number(delLibBtn.getAttribute('data-ctx-delete-library-token'));
                    const tok = (state.libraryTokens || []).find(t => t.id === tokenId) || (state.boardTokens || []).find(t => t.id === tokenId);
                    const tokenTitle = tok ? tok.title : 'this token';
                    closeTokenContextMenu();
                    if (tok && tok.filename && tok.filename.startsWith('assets/tokens/')) {
                        await showAlertModal('Built-in tokens cannot be deleted.', 'Action Not Allowed', '🛡️');
                        return;
                    }
                    const confirmed = await showConfirmModal({
                        title: 'Delete Token from Library',
                        message: `Permanently delete "${tokenTitle}" from the library?`,
                        detail: 'This token will also be removed from any maps where it is placed.',
                        okText: 'Delete Token',
                        isDanger: true,
                        icon: '♟️'
                    });
                    if (!confirmed) return;
                    try {
                        await apiCall('delete_token', { token_id: tokenId });
                        state.libraryTokens = (state.libraryTokens || []).filter(t => t.id !== tokenId);
                        state.boardTokens = (state.boardTokens || []).filter(t => t.id !== tokenId);
                        const el = document.querySelector(`.board-token-item[data-token-id="${tokenId}"]`);
                        if (el) el.remove();
                        renderTokenLibraryModal();
                        updateVttHeaderAndHud();
                        if (state.currentGame) {
                            await fetchGameState(state.currentGame.id);
                        }
                    } catch (err) {
                        alert(err.message);
                    }
                    return;
                }
            });

            window.addEventListener('mousedown', () => closeTokenContextMenu());
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeTokenContextMenu();
            });
        }

        // Pointer-based Dragging (and Clicking) Images & Tokens from Library onto the Tabletop Map
        let dropPreviewEl = null;
        let dragGhostEl = null;

        const clearLibraryDragState = () => {
            document.body.classList.remove('is-library-dragging');
            if (dropPreviewEl) {
                dropPreviewEl.remove();
                dropPreviewEl = null;
            }
            if (dragGhostEl) {
                dragGhostEl.remove();
                dragGhostEl = null;
            }
        };

        const ensureDropPreview = (type) => {
            const plane = $('tabletop-plane');
            if (!plane) return null;
            if (!dropPreviewEl) {
                dropPreviewEl = document.createElement('div');
                plane.appendChild(dropPreviewEl);
            }
            dropPreviewEl.className = `library-drop-preview ${type === 'token' ? 'is-token' : 'is-image'}`;
            return dropPreviewEl;
        };

        const ensureDragGhost = (type, imgSrc) => {
            if (!dragGhostEl) {
                dragGhostEl = document.createElement('div');
                const img = document.createElement('img');
                img.src = imgSrc;
                dragGhostEl.appendChild(img);
                document.body.appendChild(dragGhostEl);
            }
            dragGhostEl.className = `library-drag-ghost ${type === 'token' ? 'is-token' : 'is-image'}`;
            return dragGhostEl;
        };

        const startLibraryPointerDrag = (type, assetId, imgSrc, startEvent) => {
            if (startEvent.button !== 0 || !state.currentGame) return;
            startEvent.preventDefault();

            const startX = startEvent.clientX;
            const startY = startEvent.clientY;
            let hasDragged = false;

            const onMove = (moveEvent) => {
                const dist = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
                if (!hasDragged && dist > 4) {
                    hasDragged = true;
                    document.body.classList.add('is-library-dragging');
                }
                if (!hasDragged) return;

                const ghost = ensureDragGhost(type, imgSrc);
                ghost.style.left = `${moveEvent.clientX}px`;
                ghost.style.top = `${moveEvent.clientY}px`;

                const { planeX, planeY } = computeTabletopCoords(moveEvent.clientX, moveEvent.clientY);
                const preview = ensureDropPreview(type);
                if (!preview) return;

                if (type === 'token') {
                    const activeTab = getActiveTabForGrid();
                    const tok = state.libraryTokens.find(t => t.id === assetId);
                    const cellPx = state.baseCellPx || 50;
                    const tileSize = tok ? Math.max(1, Number(tok.tile_size) || 1) : 1;
                    const snapped = snapPointToGrid(planeX, planeY, activeTab, tileSize);
                    const cellPos = getGridCellCenter(snapped.gridX, snapped.gridY, activeTab, tileSize);
                    const tokenDiameter = tileSize * cellPx;
                    preview.style.left = `${cellPos.cx - tokenDiameter / 2}px`;
                    preview.style.top = `${cellPos.cy - tokenDiameter / 2}px`;
                    preview.style.width = `${tokenDiameter}px`;
                    preview.style.height = `${tokenDiameter}px`;
                } else if (type === 'image') {
                    const img = state.libraryImages.find(i => i.id === assetId);
                    const w = img ? (Number(img.width) || 480) : 480;
                    const h = img ? (Number(img.height) || 360) : 360;
                    const dropX = Math.max(0, Math.round(planeX - w / 2));
                    const dropY = Math.max(0, Math.round(planeY - h / 2));
                    preview.style.left = `${dropX}px`;
                    preview.style.top = `${dropY}px`;
                    preview.style.width = `${w}px`;
                    preview.style.height = `${h}px`;
                }
            };

            const onUp = async (upEvent) => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                clearLibraryDragState();

                if (!state.currentGame) return;
                const mapId = getTargetMapId();

                if (hasDragged) {
                    const { planeX, planeY } = computeTabletopCoords(upEvent.clientX, upEvent.clientY);
                    if (type === 'token') {
                        hide($('modal-token-library'));
                        const activeTab = getActiveTabForGrid();
                        const tok = state.libraryTokens.find(t => t.id === assetId);
                        const tileSize = tok ? Math.max(1, Number(tok.tile_size) || 1) : 1;
                        const snapped = snapPointToGrid(planeX, planeY, activeTab, tileSize);
                        const gridX = snapped.gridX;
                        const gridY = snapped.gridY;
                        try {
                            const res = await apiCall('update_token', {
                                token_id: assetId,
                                map_id: mapId,
                                on_board: true,
                                grid_x: gridX,
                                grid_y: gridY,
                                bring_to_front: true
                            });
                            if (res && res.token) {
                                const idx = state.boardTokens.findIndex(t => t.id === res.token.id);
                                if (idx >= 0) state.boardTokens[idx] = res.token;
                                else state.boardTokens.push(res.token);
                                syncBoardTokens(state.boardTokens);
                            }
                            await fetchGameState(state.currentGame.id);
                        } catch (err) {
                            alert(err.message);
                        }
                    } else if (type === 'image') {
                        hide($('modal-image-library'));
                        const img = state.libraryImages.find(i => i.id === assetId);
                        const w = img ? (Number(img.width) || 480) : 480;
                        const h = img ? (Number(img.height) || 360) : 360;
                        const dropX = Math.max(0, Math.round(planeX - w / 2));
                        const dropY = Math.max(0, Math.round(planeY - h / 2));
                        try {
                            const res = await apiCall('update_image', {
                                image_id: assetId,
                                map_id: mapId,
                                on_board: true,
                                visible: (img && img.on_board) ? !!img.visible : false,
                                x: dropX,
                                y: dropY,
                                bring_to_front: true
                            });
                            if (res && res.image) {
                                const idx = state.boardImages.findIndex(i => i.id === res.image.id);
                                if (idx >= 0) state.boardImages[idx] = res.image;
                                else state.boardImages.push(res.image);
                                syncBoardImages(state.boardImages);
                            }
                            await fetchGameState(state.currentGame.id);
                        } catch (err) {
                            alert(err.message);
                        }
                    }
                } else if (type === 'token') {
                    // Clicking a token in the Token Library also places it onto the active map
                    hide($('modal-token-library'));
                    const activeTab = getActiveTabForGrid();
                    const area = $('tabletop-scroll-area');
                    const rawX = (area ? area.scrollLeft : 0) + 120 + Math.random() * 80;
                    const rawY = (area ? area.scrollTop : 0) + 90 + Math.random() * 80;
                    const tok = (state.libraryTokens || []).find(t => t.id === tokenId) || (state.boardTokens || []).find(t => t.id === tokenId);
                    const tileSize = tok ? (Number(tok.tile_size) || 1) : 1;
                    const snapped = snapPointToGrid(rawX, rawY, activeTab, tileSize);
                    const spawnGridX = snapped.gridX;
                    const spawnGridY = snapped.gridY;
                    try {
                        const res = await apiCall('update_token', {
                            token_id: assetId,
                            map_id: mapId,
                            on_board: true,
                            grid_x: spawnGridX,
                            grid_y: spawnGridY,
                            bring_to_front: true
                        });
                        if (res && res.token) {
                            const idx = state.boardTokens.findIndex(t => t.id === res.token.id);
                            if (idx >= 0) state.boardTokens[idx] = res.token;
                            else state.boardTokens.push(res.token);
                            syncBoardTokens(state.boardTokens);
                        }
                        await fetchGameState(state.currentGame.id);
                    } catch (err) {
                        alert(err.message);
                    }
                }
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        };

        $('library-tokens-grid').addEventListener('click', (e) => {
            const header = e.target.closest('[data-toggle-category]');
            if (header) {
                e.stopPropagation();
                const cat = header.getAttribute('data-toggle-category');
                if (!state.tokenCategoryFolded) state.tokenCategoryFolded = {};
                state.tokenCategoryFolded[cat] = !state.tokenCategoryFolded[cat];
                renderTokenLibraryModal();
                return;
            }
        });

        $('library-tokens-grid').addEventListener('contextmenu', (e) => {
            const tile = e.target.closest('[data-drag-token-id]');
            if (!tile || !state.isGameGm) return;
            e.preventDefault();
            e.stopPropagation();
            const tokenId = Number(tile.getAttribute('data-drag-token-id'));
            const tok = state.libraryTokens.find(t => t.id === tokenId);
            if (!tok) return;
            openLibraryTokenContextMenu(tok, e.clientX, e.clientY);
        });

        $('library-tokens-grid').addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('[data-toggle-category]')) return;
            const tile = e.target.closest('[data-drag-token-id]');
            if (!tile) return;
            const tokenId = Number(tile.getAttribute('data-drag-token-id'));
            if (!tokenId) return;
            const tok = state.libraryTokens.find(t => t.id === tokenId);
            startLibraryPointerDrag('token', tokenId, tok ? tok.filename : '', e);
        });

        $('library-images-grid').addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            const item = e.target.closest('[data-drag-image-id]');
            if (!item) return;
            const imageId = Number(item.getAttribute('data-drag-image-id'));
            if (!imageId) return;
            const img = state.libraryImages.find(i => i.id === imageId);
            startLibraryPointerDrag('image', imageId, img ? img.filename : '', e);
        });

        // Click participant pill to prefill whisper (/w username )
        $('chat-participants').addEventListener('click', (e) => {
            const pill = e.target.closest('[data-whisper-user]');
            if (!pill) return;
            const username = pill.getAttribute('data-whisper-user');
            const input = $('chat-input');
            input.value = `/w ${username} `;
            input.focus();
        });

        // Quick Dice Roller Bar buttons
        document.querySelectorAll('[data-quick-roll]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const code = btn.getAttribute('data-quick-roll');
                await sendChatCommand(`/r ${code}`);
            });
        });

        // Chat Form submission
        $('form-chat').addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = $('chat-input');
            const text = input.value.trim();
            if (!text || !state.currentGame) return;
            input.value = '';
            await sendChatCommand(text);
        });

        // User Manual Window (Accessible to both GMs and Players from Top Bar)
        document.querySelectorAll('[data-open-manual]').forEach(btn => {
            btn.addEventListener('click', () => {
                $('modal-manual').classList.remove('hidden');
            });
        });

        $('btn-close-manual').addEventListener('click', () => {
            $('modal-manual').classList.add('hidden');
        });

        $('modal-manual').addEventListener('click', (e) => {
            if (e.target === $('modal-manual')) {
                $('modal-manual').classList.add('hidden');
            }
        });

        // Drag and drop image files directly onto Tabletop canvas
        const tabletopArea = $('tabletop-scroll-area');
        if (tabletopArea) {
            ['dragenter', 'dragover'].forEach(eventName => {
                tabletopArea.addEventListener(eventName, (e) => {
                    if (!state.isGameGm) return;
                    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
                        e.preventDefault();
                        e.stopPropagation();
                        tabletopArea.classList.add('is-dragover');
                    }
                });
            });
            ['dragleave', 'drop'].forEach(eventName => {
                tabletopArea.addEventListener(eventName, () => {
                    tabletopArea.classList.remove('is-dragover');
                });
            });
            tabletopArea.addEventListener('drop', (e) => {
                if (!state.isGameGm) return;
                const dt = e.dataTransfer;
                if (dt && dt.files && dt.files.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    tabletopArea.classList.remove('is-dragover');
                    handleImageUploadFiles(dt.files);
                }
            });
        }

        // =========================================================
        // UNIFIED MAP TAB, GRID & MAP BACKGROUND SETTINGS
        // =========================================================
        function rgbaToHexAndOpacity(rgbaStr) {
            let hex = '#ffffff';
            let opacity = 25;
            if (!rgbaStr) return { hex, opacity };
            const m = rgbaStr.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
            if (m) {
                const r = Number(m[1]).toString(16).padStart(2, '0');
                const g = Number(m[2]).toString(16).padStart(2, '0');
                const b = Number(m[3]).toString(16).padStart(2, '0');
                hex = `#${r}${g}${b}`;
                if (m[4] !== undefined) {
                    opacity = Math.round(parseFloat(m[4]) * 100);
                }
            } else if (rgbaStr.startsWith('#')) {
                hex = rgbaStr.slice(0, 7);
            }
            return { hex, opacity: Math.max(5, Math.min(100, opacity)) };
        }

        function hexAndOpacityToRgba(hex, opacity) {
            const cleanHex = hex.replace('#', '');
            const r = parseInt(cleanHex.substring(0, 2), 16) || 255;
            const g = parseInt(cleanHex.substring(2, 4), 16) || 255;
            const b = parseInt(cleanHex.substring(4, 6), 16) || 255;
            const a = (opacity / 100).toFixed(2);
            return `rgba(${r}, ${g}, ${b}, ${a})`;
        }

        function getMapTabFormValues() {
            const radio = document.querySelector('input[name="grid_type_radio"]:checked');
            const gridType = radio ? radio.value : 'square';
            const cellPx = Math.max(15, Math.min(300, Number($('grid-cell-px-input').value) || 50));
            const hex = $('grid-color-picker').value || '#ffffff';
            const opacity = Number($('grid-opacity-slider').value) || 25;
            const gridColor = hexAndOpacityToRgba(hex, opacity);
            const offsetX = Number($('grid-offset-x-input').value) || 0;
            const offsetY = Number($('grid-offset-y-input').value) || 0;
            return {
                grid_type: gridType,
                grid_cell_px: cellPx,
                grid_color: gridColor,
                grid_offset_x: offsetX,
                grid_offset_y: offsetY
            };
        }

        function renderLiveGridPreview() {
            const mapId = Number($('map-tab-id').value) || state.activeMapId;
            const tab = state.mapTabs.find(t => t.id === mapId);
            if (!tab) return;
            const vals = getMapTabFormValues();
            const previewTab = Object.assign({}, tab, vals);
            state.previewGridTab = previewTab;
            renderTabletopGridSvg(previewTab);
            state.baseCellPx = vals.grid_cell_px;
            syncBoardTokens(state.boardTokens);
        }

        function openMapTabModal(mapId = 0) {
            state.gridBgRemoveFlag = false;

            if (mapId === 0) {
                // New Tab Mode
                $('modal-map-tab-title').textContent = '🗺️ Add New Map Tab';
                $('map-tab-id').value = '';
                $('map-tab-name').value = `Map ${state.mapTabs.length + 1}`;
                $('map-tab-grid-size').value = '5';
                $('map-tab-grid-unit').value = 'feet';

                const radios = document.querySelectorAll('input[name="grid_type_radio"]');
                radios.forEach(r => { r.checked = (r.value === 'square'); });

                $('grid-cell-px-input').value = '50';
                $('grid-cell-px-slider').value = '50';
                $('grid-color-picker').value = '#ffffff';
                $('grid-opacity-slider').value = '25';
                $('grid-opacity-label').textContent = '25%';
                $('grid-offset-x-input').value = '0';
                $('grid-offset-y-input').value = '0';

                $('grid-bg-current-container').classList.add('hidden');
            } else {
                // Edit Tab Mode
                const tab = state.mapTabs.find(t => t.id === mapId) || state.mapTabs.find(t => t.id === state.activeMapId);
                if (!tab) return;

                $('modal-map-tab-title').textContent = `🗺️ Edit "${tab.name}" & Grid Settings`;
                $('map-tab-id').value = String(tab.id);
                $('map-tab-name').value = tab.name;
                $('map-tab-grid-size').value = String(tab.grid_size || 5);
                $('map-tab-grid-unit').value = tab.grid_unit || 'feet';

                const currentType = tab.grid_type || 'square';
                const radios = document.querySelectorAll('input[name="grid_type_radio"]');
                radios.forEach(r => { r.checked = (r.value === currentType); });

                const cellPx = tab.grid_cell_px || 50;
                $('grid-cell-px-input').value = String(cellPx);
                $('grid-cell-px-slider').value = String(cellPx);

                const { hex, opacity } = rgbaToHexAndOpacity(tab.grid_color);
                $('grid-color-picker').value = hex;
                $('grid-opacity-slider').value = String(opacity);
                $('grid-opacity-label').textContent = `${opacity}%`;

                $('grid-offset-x-input').value = String(tab.grid_offset_x || 0);
                $('grid-offset-y-input').value = String(tab.grid_offset_y || 0);

                const bgContainer = $('grid-bg-current-container');
                if (tab.background_image) {
                    bgContainer.classList.remove('hidden');
                    $('grid-bg-thumb').src = tab.background_image;
                    $('grid-bg-name').textContent = tab.background_image.split('/').pop() || 'background';
                    $('grid-bg-dim').textContent = `${tab.background_width || 0} × ${tab.background_height || 0} px (Natural Scale)`;
                } else {
                    bgContainer.classList.add('hidden');
                }
            }

            // Reset file picker & library selection
            state.gridBgRemoveFlag = false;
            const bgInput = $('grid-bg-file-input');
            if (bgInput) bgInput.value = '';
            const libSelected = $('grid-bg-library-selected');
            if (libSelected) libSelected.value = '';
            const libPicker = $('grid-bg-library-picker');
            if (libPicker) libPicker.classList.add('hidden');
            $('grid-bg-chosen-name').textContent = 'No new file chosen';

            $('modal-map-tab').classList.remove('hidden');
            if (mapId === 0) $('map-tab-name').focus();
        }

        // Live preview listeners inside unified Map Tab modal
        document.querySelectorAll('input[name="grid_type_radio"]').forEach(r => {
            r.addEventListener('change', renderLiveGridPreview);
        });
        $('grid-cell-px-input').addEventListener('input', (e) => {
            $('grid-cell-px-slider').value = e.target.value;
            renderLiveGridPreview();
        });
        $('grid-cell-px-slider').addEventListener('input', (e) => {
            $('grid-cell-px-input').value = e.target.value;
            renderLiveGridPreview();
        });
        $('grid-color-picker').addEventListener('input', renderLiveGridPreview);
        $('grid-opacity-slider').addEventListener('input', (e) => {
            $('grid-opacity-label').textContent = `${e.target.value}%`;
            renderLiveGridPreview();
        });
        $('grid-offset-x-input').addEventListener('input', renderLiveGridPreview);
        $('grid-offset-y-input').addEventListener('input', renderLiveGridPreview);

        // Map Background file picker
        $('btn-choose-grid-bg').addEventListener('click', () => {
            const bgInput = $('grid-bg-file-input');
            if (bgInput) {
                bgInput.value = '';
                bgInput.click();
            }
        });

        // Image Library Picker for battlemap background
        function renderMapBgLibraryPicker() {
            const container = $('grid-bg-library-items');
            if (!container) return;
            container.innerHTML = '';

            const images = state.libraryImages || [];
            if (images.length === 0) {
                container.innerHTML = `<div style="grid-column: 1 / -1; padding: 12px; font-size: 0.8rem; color: var(--text-muted); text-align: center;">
                    Your Image Library is empty. Upload images via the 🗂️ Image Library button on the tabletop toolbar first!
                </div>`;
                return;
            }

            images.forEach(img => {
                const card = document.createElement('div');
                card.className = 'grid-bg-library-card';
                card.title = `${img.title || 'Untitled'} (${img.width || 0}×${img.height || 0}px)`;
                card.innerHTML = `
                    <img src="${escapeHtml(img.filename)}" alt="${escapeHtml(img.title || '')}" loading="lazy">
                    <div class="grid-bg-library-card-title">${escapeHtml(img.title || 'Untitled')}</div>
                    <div class="grid-bg-library-card-dim">${img.width || 0}×${img.height || 0}</div>
                `;
                card.addEventListener('click', () => {
                    state.gridBgRemoveFlag = false;
                    const bgInput = $('grid-bg-file-input');
                    if (bgInput) bgInput.value = '';
                    if ($('grid-bg-library-selected')) {
                        $('grid-bg-library-selected').value = img.filename;
                    }
                    $('grid-bg-current-container').classList.remove('hidden');
                    $('grid-bg-thumb').src = img.filename;
                    const displayName = img.title || img.filename.split('/').pop();
                    $('grid-bg-name').textContent = displayName;
                    $('grid-bg-dim').textContent = `${img.width || 0} × ${img.height || 0} px (From Image Library)`;
                    $('grid-bg-chosen-name').textContent = `Selected from Library: ${displayName}`;
                    $('grid-bg-library-picker').classList.add('hidden');
                });
                container.appendChild(card);
            });
        }

        const pickLibBtn = $('btn-pick-library-bg');
        if (pickLibBtn) {
            pickLibBtn.addEventListener('click', () => {
                const picker = $('grid-bg-library-picker');
                if (picker) {
                    if (picker.classList.contains('hidden')) {
                        renderMapBgLibraryPicker();
                        picker.classList.remove('hidden');
                    } else {
                        picker.classList.add('hidden');
                    }
                }
            });
        }

        const closeLibPickerBtn = $('btn-close-bg-library-picker');
        if (closeLibPickerBtn) {
            closeLibPickerBtn.addEventListener('click', () => {
                $('grid-bg-library-picker').classList.add('hidden');
            });
        }

        // Drag and drop battlemap background file
        const dropzone = $('grid-bg-dropzone');
        if (dropzone) {
            ['dragenter', 'dragover'].forEach(name => {
                dropzone.addEventListener(name, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.add('is-dragover');
                });
            });
            ['dragleave', 'drop'].forEach(name => {
                dropzone.addEventListener(name, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.remove('is-dragover');
                });
            });
            dropzone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                if (!dt || !dt.files || dt.files.length === 0) return;
                const file = dt.files[0];
                if (!file.type.startsWith('image/')) {
                    showAlertModal('Please drop a valid image file (PNG, JPG, GIF, WebP, SVG).', 'Invalid File', '⚠️');
                    return;
                }
                const bgInput = $('grid-bg-file-input');
                if (bgInput) {
                    bgInput.files = dt.files;
                }
                state.gridBgRemoveFlag = false;
                if ($('grid-bg-library-selected')) $('grid-bg-library-selected').value = '';
                $('grid-bg-chosen-name').textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;

                const reader = new FileReader();
                reader.onload = (re) => {
                    $('grid-bg-current-container').classList.remove('hidden');
                    $('grid-bg-thumb').src = re.target.result;
                    $('grid-bg-name').textContent = file.name;
                    $('grid-bg-dim').textContent = 'New image (to be uploaded on save)';
                };
                reader.readAsDataURL(file);
            });
        }

        $('grid-bg-file-input').addEventListener('change', () => {
            const bgInput = $('grid-bg-file-input');
            if (bgInput && bgInput.files && bgInput.files[0]) {
                const file = bgInput.files[0];
                state.gridBgRemoveFlag = false;
                if ($('grid-bg-library-selected')) $('grid-bg-library-selected').value = '';
                $('grid-bg-chosen-name').textContent = file.name;

                const reader = new FileReader();
                reader.onload = (re) => {
                    $('grid-bg-current-container').classList.remove('hidden');
                    $('grid-bg-thumb').src = re.target.result;
                    $('grid-bg-name').textContent = file.name;
                    $('grid-bg-dim').textContent = 'New image (to be uploaded on save)';
                };
                reader.readAsDataURL(file);
            } else {
                $('grid-bg-chosen-name').textContent = 'No new file chosen';
            }
        });

        $('btn-remove-grid-bg').addEventListener('click', () => {
            state.gridBgRemoveFlag = true;
            if ($('grid-bg-library-selected')) $('grid-bg-library-selected').value = '';
            const bgInput = $('grid-bg-file-input');
            if (bgInput) bgInput.value = '';
            $('grid-bg-current-container').classList.add('hidden');
            $('grid-bg-chosen-name').textContent = 'Background will be removed upon saving';
        });

        // Save Unified Map Tab Form
        $('form-map-tab').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!state.currentGame) return;

            const mapId = Number($('map-tab-id').value || 0);
            const name = $('map-tab-name').value.trim() || 'Map';
            const gridSize = parseFloat($('map-tab-grid-size').value) || 5;
            const gridUnit = $('map-tab-grid-unit').value || 'feet';
            const vals = getMapTabFormValues();

            const formData = new FormData();
            formData.append('game_id', String(state.currentGame.id));
            formData.append('map_id', String(mapId));
            formData.append('name', name);
            formData.append('grid_size', String(gridSize));
            formData.append('grid_unit', gridUnit);
            formData.append('grid_type', vals.grid_type);
            formData.append('grid_cell_px', String(vals.grid_cell_px));
            formData.append('grid_color', vals.grid_color);
            formData.append('grid_offset_x', String(vals.grid_offset_x));
            formData.append('grid_offset_y', String(vals.grid_offset_y));

            if (state.gridBgRemoveFlag) {
                formData.append('remove_background', '1');
            } else {
                const bgInput = $('grid-bg-file-input');
                const librarySelected = $('grid-bg-library-selected') ? $('grid-bg-library-selected').value : '';
                if (bgInput && bgInput.files && bgInput.files[0]) {
                    formData.append('background_file', bgInput.files[0]);
                } else if (librarySelected) {
                    formData.append('background_image', librarySelected);
                }
            }

            const saveBtn = $('btn-save-map-tab');
            const origText = saveBtn ? saveBtn.textContent : '';
            if (saveBtn) {
                saveBtn.textContent = 'Saving...';
                saveBtn.disabled = true;
            }

            try {
                const res = await apiCall('save_map_tab', formData, true);
                if (res && res.map_tabs) {
                    state.mapTabs = res.map_tabs;
                }
                if (res && res.active_map_id) {
                    state.activeMapId = res.active_map_id;
                }
                $('modal-map-tab').classList.add('hidden');
                renderMapTabsAndGrid();
                if (state.currentGame) {
                    await fetchGameState(state.currentGame.id);
                }
            } catch (err) {
                showAlertModal('Failed to save map tab: ' + err.message, 'Save Error', '⚠️');
            } finally {
                if (saveBtn) {
                    saveBtn.textContent = origText;
                    saveBtn.disabled = false;
                }
            }
        });

        // =========================================================
        // GM NOTES LIBRARY MODAL
        // =========================================================
        function renderNotesList(filterText = '') {
            const listEl = $('notes-list');
            if (!listEl) return;

            const query = filterText.trim().toLowerCase();
            const filtered = state.notes.filter(n => {
                if (!query) return true;
                return (n.title && n.title.toLowerCase().includes(query)) ||
                       (n.content && n.content.toLowerCase().includes(query));
            });

            if (filtered.length === 0) {
                listEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 18px 8px; font-size: 0.82rem;">
                    ${query ? 'No matching notes found.' : 'No notes yet. Click <strong>+ New Note</strong> above to create one!'}
                </div>`;
                return;
            }

            listEl.innerHTML = filtered.map(n => {
                const isActive = n.id === state.activeNoteId;
                const dateStr = new Date(n.updated_at * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const snippet = (n.content || '').replace(/\s+/g, ' ').slice(0, 60);
                return `
                    <div class="notes-list-item ${isActive ? 'active' : ''}" data-select-note="${n.id}">
                        <div class="notes-item-title">${escapeHtml(n.title || 'Untitled Note')}</div>
                        <div class="notes-item-date">${dateStr}</div>
                        ${snippet ? `<div class="notes-item-snippet">${escapeHtml(snippet)}</div>` : ''}
                    </div>
                `;
            }).join('');
        }

        function selectNote(noteId) {
            state.activeNoteId = noteId;
            const note = state.notes.find(n => n.id === noteId);
            if (!note) {
                $('notes-editor-empty').classList.remove('hidden');
                $('form-note-editor').classList.add('hidden');
                return;
            }

            $('note-id').value = String(note.id);
            $('note-title-input').value = note.title;
            $('note-content-input').value = note.content;
            $('note-status-info').textContent = `Last updated: ${new Date(note.updated_at * 1000).toLocaleString()}`;

            $('notes-editor-empty').classList.add('hidden');
            $('form-note-editor').classList.remove('hidden');
            renderNotesList($('notes-search-input').value);
        }

        function createNewNote() {
            state.activeNoteId = 0;
            $('note-id').value = '0';
            $('note-title-input').value = '';
            $('note-content-input').value = '';
            $('note-status-info').textContent = 'New unsaved note';

            $('notes-editor-empty').classList.add('hidden');
            $('form-note-editor').classList.remove('hidden');
            $('note-title-input').focus();
            renderNotesList($('notes-search-input').value);
        }

        async function openNotesLibraryModal() {
            if (!state.currentGame) return;
            try {
                const res = await apiCall('get_notes', { game_id: state.currentGame.id });
                state.notes = res.notes || [];
                renderNotesList();
                if (state.notes.length > 0) {
                    selectNote(state.notes[0].id);
                } else {
                    state.activeNoteId = 0;
                    $('notes-editor-empty').classList.remove('hidden');
                    $('form-note-editor').classList.add('hidden');
                }
                $('modal-notes-library').classList.remove('hidden');
            } catch (err) {
                showAlertModal('Failed to load notes: ' + err.message, 'Notes Error', '⚠️');
            }
        }

        $('btn-open-notes-library').addEventListener('click', openNotesLibraryModal);

        $('btn-close-notes-modal').addEventListener('click', () => {
            $('modal-notes-library').classList.add('hidden');
        });

        $('notes-search-input').addEventListener('input', (e) => {
            renderNotesList(e.target.value);
        });

        $('btn-new-note').addEventListener('click', createNewNote);

        $('notes-list').addEventListener('click', (e) => {
            const item = e.target.closest('[data-select-note]');
            if (item) {
                const noteId = Number(item.getAttribute('data-select-note'));
                selectNote(noteId);
            }
        });

        $('form-note-editor').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!state.currentGame) return;
            const noteId = Number($('note-id').value) || 0;
            const title = $('note-title-input').value.trim() || 'Untitled Note';
            const content = $('note-content-input').value;

            const saveBtn = $('btn-save-note');
            const origText = saveBtn.textContent;
            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;

            try {
                const res = await apiCall('save_note', {
                    game_id: state.currentGame.id,
                    id: noteId,
                    title,
                    content
                });
                state.notes = res.notes || [];
                if (res.note) {
                    state.activeNoteId = res.note.id;
                    selectNote(res.note.id);
                }
                $('note-status-info').textContent = 'Saved just now!';
            } catch (err) {
                showAlertModal('Failed to save note: ' + err.message, 'Save Error', '⚠️');
            } finally {
                saveBtn.textContent = origText;
                saveBtn.disabled = false;
            }
        });

        $('btn-delete-note').addEventListener('click', async () => {
            const noteId = Number($('note-id').value);
            if (!noteId || !state.currentGame) return;
            const note = state.notes.find(n => n.id === noteId);
            const noteTitle = note ? note.title : 'this note';

            const confirmed = await showConfirmModal({
                title: 'Delete Note',
                message: `Permanently delete "${noteTitle}"?`,
                detail: 'This action cannot be undone.',
                okText: 'Delete Note',
                isDanger: true,
                icon: '📝'
            });
            if (!confirmed) return;

            try {
                const res = await apiCall('delete_note', {
                    game_id: state.currentGame.id,
                    id: noteId
                });
                state.notes = res.notes || [];
                state.activeNoteId = 0;
                if (state.notes.length > 0) {
                    selectNote(state.notes[0].id);
                } else {
                    $('notes-editor-empty').classList.remove('hidden');
                    $('form-note-editor').classList.add('hidden');
                    renderNotesList();
                }
            } catch (err) {
                showAlertModal('Failed to delete note: ' + err.message, 'Delete Error', '⚠️');
            }
        });

        bindMusicEvents();
        bindPdfEvents();
    }

    // =========================================================
    // SYNCHRONIZED MUSIC & PLAYLISTS CONTROLLER
    // =========================================================

    function initAudioElement() {
        if (!state.audioElement) {
            state.audioElement = $('vtt-audio-player');
            if (state.audioElement) {
                state.audioElement.addEventListener('ended', () => {
                    if (state.isGameGm) {
                        handleTrackEnded();
                    }
                });
            }
        }
    }

    let ytApiReadyCallbacks = [];
    let ytApiInitialized = false;

    function ensureYouTubeApiReady(callback) {
        if (window.YT && window.YT.Player) {
            if (callback) callback();
            return;
        }

        if (callback) ytApiReadyCallbacks.push(callback);

        if (ytApiInitialized) return;
        ytApiInitialized = true;

        const prevHandler = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = function () {
            if (prevHandler) prevHandler();
            const cbs = ytApiReadyCallbacks.slice();
            ytApiReadyCallbacks = [];
            cbs.forEach(cb => { try { cb(); } catch (e) {} });
        };

        if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
        }

        let pollCount = 0;
        const poll = setInterval(() => {
            pollCount++;
            if (window.YT && window.YT.Player) {
                clearInterval(poll);
                const cbs = ytApiReadyCallbacks.slice();
                ytApiReadyCallbacks = [];
                cbs.forEach(cb => { try { cb(); } catch (e) {} });
            } else if (pollCount > 50) {
                clearInterval(poll);
            }
        }, 120);
    }

    function initYouTubePlayer() {
        if (state.ytPlayer || state.ytInitAttempted) return;
        state.ytInitAttempted = true;
        ensureYouTubeApiReady(() => {
            if (state.ytPlayer) return;
            const playerEl = $('vtt-youtube-player');
            if (!playerEl) return;
            try {
                state.ytPlayer = new window.YT.Player('vtt-youtube-player', {
                    events: {
                        onReady: (event) => {
                            state.ytReady = true;
                            try {
                                const iframe = event.target.getIframe();
                                if (iframe) {
                                    iframe.setAttribute('allow', 'autoplay; encrypted-media');
                                }
                            } catch (e) {}
                            applyLocalVolume();
                            if (state.ytPendingVideoId) {
                                playYouTubeVideo(state.ytPendingVideoId, state.ytPendingStartSeconds);
                                state.ytPendingVideoId = null;
                            }
                        },
                        onStateChange: (event) => {
                            if (event.data === 1) { // YT.PlayerState.PLAYING
                                if (state.userHasInteracted || state.isGameGm) {
                                    applyLocalVolume();
                                }
                            } else if (event.data === 0) { // YT.PlayerState.ENDED
                                if (state.isGameGm) {
                                    handleTrackEnded();
                                }
                            }
                        },
                        onError: (err) => {
                            console.warn('YouTube playback error:', err);
                        }
                    }
                });
            } catch (e) {
                console.warn('Could not initialize YouTube player:', e);
            }
        });
    }

    window.onYouTubeIframeAPIReady = function () {
        initYouTubePlayer();
    };

    function parseYoutubeId(url) {
        if (!url) return null;
        const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
        const match = String(url).match(regExp);
        return (match && match[1]) ? match[1] : null;
    }

    function applyLocalVolume() {
        const isMuted = state.localMusicMuted || (state.playerMusicDisabled && !state.isGameGm);
        const volumeVal = (typeof state.localMusicVolume === 'number' && !isNaN(state.localMusicVolume) && state.localMusicVolume >= 0)
            ? state.localMusicVolume
            : 70;
        const effectiveVol = isMuted ? 0 : (volumeVal / 100);

        if (state.audioElement) {
            state.audioElement.volume = Math.max(0, Math.min(1, effectiveVol));
            state.audioElement.muted = isMuted;
        }

        if (state.ytPlayer) {
            try {
                if (isMuted) {
                    if (typeof state.ytPlayer.mute === 'function') state.ytPlayer.mute();
                } else {
                    if (typeof state.ytPlayer.unMute === 'function') state.ytPlayer.unMute();
                    if (typeof state.ytPlayer.setVolume === 'function') {
                        state.ytPlayer.setVolume(Math.round(volumeVal));
                    }
                }
            } catch (e) {}
        }

        updateMusicBarControlsUI();
    }

    function setLocalVolume(vol) {
        const num = Number(vol);
        state.localMusicVolume = (!isNaN(num) && num >= 0 && num <= 100) ? num : 70;
        const volKey = state.forcePlayerView ? 'stargazer_vtt_player_preview_volume' : 'stargazer_vtt_music_volume';
        localStorage.setItem(volKey, String(state.localMusicVolume));
        if (state.localMusicMuted) {
            state.localMusicMuted = false;
            const muteKey = state.forcePlayerView ? 'stargazer_vtt_player_preview_muted' : 'stargazer_vtt_music_muted';
            localStorage.setItem(muteKey, '0');
        }
        applyLocalVolume();
    }

    function toggleLocalMute() {
        state.localMusicMuted = !state.localMusicMuted;
        const muteKey = state.forcePlayerView ? 'stargazer_vtt_player_preview_muted' : 'stargazer_vtt_music_muted';
        localStorage.setItem(muteKey, state.localMusicMuted ? '1' : '0');
        applyLocalVolume();
    }

    function togglePlayerDisableMusic() {
        state.playerMusicDisabled = !state.playerMusicDisabled;
        const disKey = state.forcePlayerView ? 'stargazer_vtt_player_preview_music_disabled' : 'stargazer_vtt_player_music_disabled';
        localStorage.setItem(disKey, state.playerMusicDisabled ? '1' : '0');
        applyLocalVolume();
        syncMusicPlayback();
    }

    function playYouTubeVideo(videoId, startSeconds = 0) {
        if (!state.ytPlayer || !state.ytReady) {
            state.ytPendingVideoId = videoId;
            state.ytPendingStartSeconds = startSeconds;
            initYouTubePlayer();
            return;
        }
        try {
            if (state.audioElement) {
                state.audioElement.pause();
                state.audioElement.removeAttribute('src');
            }
            if (typeof state.ytPlayer.loadVideoById === 'function') {
                state.ytPlayer.loadVideoById({
                    videoId: videoId,
                    startSeconds: Math.max(0, Math.floor(startSeconds))
                });
            }

            const isMuted = state.localMusicMuted || (state.playerMusicDisabled && !state.isGameGm);
            if (!state.userHasInteracted && !state.isGameGm) {
                try { if (typeof state.ytPlayer.mute === 'function') state.ytPlayer.mute(); } catch (e) {}
                state.autoplayBlocked = true;
            } else {
                applyLocalVolume();
                state.autoplayBlocked = false;
            }

            if (typeof state.ytPlayer.playVideo === 'function') {
                state.ytPlayer.playVideo();
            }
            updateMusicBarControlsUI();

            setTimeout(() => {
                if (state.userHasInteracted || state.isGameGm) {
                    applyLocalVolume();
                }
            }, 350);
        } catch (e) {
            console.warn('Failed to play YouTube video:', e);
        }
    }

    function playAudioUrl(url, startSeconds = 0) {
        initAudioElement();
        if (!state.audioElement) return;

        if (state.ytPlayer && state.ytReady) {
            try { state.ytPlayer.stopVideo(); } catch (e) {}
        }

        applyLocalVolume();
        if (state.audioElement.src !== url) {
            state.audioElement.src = url;
        }
        if (startSeconds > 0 && Math.abs((state.audioElement.currentTime || 0) - startSeconds) > 2) {
            try { state.audioElement.currentTime = startSeconds; } catch (e) {}
        }

        const p = state.audioElement.play();
        if (p !== undefined) {
            p.then(() => {
                state.autoplayBlocked = false;
                updateMusicBarControlsUI();
            }).catch(err => {
                if (err && err.name === 'NotAllowedError') {
                    state.autoplayBlocked = true;
                    try {
                        state.audioElement.muted = true;
                        state.audioElement.play().catch(() => {});
                    } catch (e) {}
                    updateMusicBarControlsUI();
                }
            });
        }
    }

    function stopAllPlayback() {
        if (state.audioElement) {
            state.audioElement.pause();
            state.audioElement.removeAttribute('src');
        }
        if (state.ytPlayer && state.ytReady) {
            try { state.ytPlayer.stopVideo(); } catch (e) {}
        }
        state.autoplayBlocked = false;
        updateMusicBarControlsUI();
    }

    function pauseAllPlayback() {
        if (state.audioElement) {
            state.audioElement.pause();
        }
        if (state.ytPlayer && state.ytReady) {
            try { state.ytPlayer.pauseVideo(); } catch (e) {}
        }
        updateMusicBarControlsUI();
    }

    function getCurrentPlaybackPosition() {
        const ms = state.musicState;
        if (!ms) return 0;
        if (ms.source_type === 'youtube' && state.ytPlayer && state.ytReady) {
            try {
                return state.ytPlayer.getCurrentTime() || 0;
            } catch (e) {
                return ms.position || 0;
            }
        } else if (state.audioElement && !isNaN(state.audioElement.currentTime)) {
            return state.audioElement.currentTime;
        }
        return ms.position || 0;
    }

    async function broadcastMusicState(patch) {
        if (!state.isGameGm || !state.currentGame) return;
        try {
            const payload = Object.assign({ game_id: state.currentGame.id }, patch);
            const res = await apiCall('update_music_state', payload);
            if (res.music_state) {
                state.musicState = res.music_state;
                syncMusicPlayback();
            }
        } catch (err) {
            console.error('Failed to update music state:', err);
        }
    }

    function syncMusicPlayback() {
        const ms = state.musicState;
        if (!ms || !ms.status || ms.status === 'stopped' || !ms.track_url) {
            stopAllPlayback();
            state.lastSyncedTrackId = null;
            updateMusicBarControlsUI();
            return;
        }

        // If player has explicitly disabled music:
        if (!state.isGameGm && state.playerMusicDisabled) {
            stopAllPlayback();
            updateMusicBarControlsUI();
            return;
        }

        // Compute expected target position
        let targetPos = Number(ms.position) || 0;
        if (ms.status === 'playing' && ms.updated_at) {
            const nowSec = Date.now() / 1000;
            const elapsed = Math.max(0, nowSec - Number(ms.updated_at));
            targetPos += elapsed;
        }

        const isNewTrack = (state.lastSyncedTrackId !== ms.track_id);

        if (ms.status === 'playing') {
            if (isNewTrack) {
                state.lastSyncedTrackId = ms.track_id;
                if (ms.source_type === 'youtube') {
                    const ytId = parseYoutubeId(ms.track_url);
                    if (ytId) {
                        playYouTubeVideo(ytId, targetPos);
                    }
                } else {
                    playAudioUrl(ms.track_url, targetPos);
                }
            } else {
                // Same track: verify play state and catch up drift
                if (ms.source_type === 'youtube') {
                    if (state.ytPlayer && state.ytReady) {
                        try {
                            const curState = state.ytPlayer.getPlayerState();
                            if (curState !== 1) { // 1 = playing
                                state.ytPlayer.playVideo();
                            }
                            const curTime = state.ytPlayer.getCurrentTime() || 0;
                            if (Math.abs(curTime - targetPos) > 4) {
                                state.ytPlayer.seekTo(targetPos, true);
                            }
                        } catch (e) {}
                    }
                } else if (state.audioElement) {
                    if (state.audioElement.paused) {
                        try { state.audioElement.currentTime = targetPos; } catch (e) {}
                        state.audioElement.play().catch(e => {
                            if (e && e.name === 'NotAllowedError') {
                                state.autoplayBlocked = true;
                                updateMusicBarControlsUI();
                            }
                        });
                    } else {
                        const cur = state.audioElement.currentTime || 0;
                        if (Math.abs(cur - targetPos) > 4) {
                            try { state.audioElement.currentTime = targetPos; } catch (e) {}
                        }
                    }
                }
            }
        } else if (ms.status === 'paused') {
            pauseAllPlayback();
            state.lastSyncedTrackId = ms.track_id;
            if (ms.source_type === 'youtube' && state.ytPlayer && state.ytReady) {
                try { state.ytPlayer.seekTo(Number(ms.position) || 0, true); } catch (e) {}
            } else if (state.audioElement) {
                try { state.audioElement.currentTime = Number(ms.position) || 0; } catch (e) {}
            }
        }

        updateMusicBarControlsUI();
    }

    function updateMusicBarControlsUI() {
        const ms = state.musicState;
        const titleEl = $('music-track-title');
        const playlistEl = $('music-track-playlist');
        const indicatorEl = $('music-indicator-icon');

        if (titleEl && playlistEl) {
            if (ms && ms.track_title && ms.status && ms.status !== 'stopped') {
                titleEl.textContent = (ms.status === 'playing' ? '▶ ' : '⏸️ ') + ms.track_title;
                const pl = (state.playlists || []).find(p => p.id === ms.playlist_id);
                playlistEl.textContent = pl ? `(${pl.name})` : '';
                if (indicatorEl) indicatorEl.classList.toggle('is-playing', ms.status === 'playing');
            } else {
                titleEl.textContent = 'No music playing';
                playlistEl.textContent = '';
                if (indicatorEl) indicatorEl.classList.remove('is-playing');
            }
        }

        const gmGroup = $('music-gm-controls');
        const playerGroup = $('music-player-controls');
        if (state.isGameGm) {
            if (gmGroup) gmGroup.classList.remove('hidden');
            if (playerGroup) playerGroup.classList.add('hidden');
            const playpauseBtn = $('btn-music-playpause');
            if (playpauseBtn) {
                const isPlaying = (ms && ms.status === 'playing');
                playpauseBtn.innerHTML = isPlaying
                    ? '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
                    : '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
                playpauseBtn.title = isPlaying ? 'Pause Music (GM)' : 'Play Music (GM)';
            }
            const repeatBtn = $('btn-music-repeat');
            if (repeatBtn) {
                const mode = (ms && ms.repeat_mode) || 'playlist';
                const svgs = {
                    playlist: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>',
                    track: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/><circle cx="12" cy="12" r="3" fill="var(--accent-gold)"/></svg>',
                    none: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" opacity="0.35"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>'
                };
                const titles = {
                    playlist: 'Repeat Mode: Playlist (Loops all tracks)',
                    track: 'Repeat Mode: Track (Loops active track)',
                    none: 'Repeat Mode: Off (Stops at end)'
                };
                repeatBtn.innerHTML = svgs[mode] || svgs.playlist;
                repeatBtn.title = titles[mode] || '';
            }
        } else {
            if (gmGroup) gmGroup.classList.add('hidden');
            if (playerGroup) playerGroup.classList.remove('hidden');
            const disBtn = $('btn-player-disable-music');
            if (disBtn) {
                if (state.playerMusicDisabled) {
                    disBtn.textContent = 'Music: OFF';
                    disBtn.className = 'btn btn-danger btn-xs';
                    disBtn.title = 'Music is currently disabled for you. Click to enable.';
                } else {
                    disBtn.textContent = 'Music: ON';
                    disBtn.className = 'btn btn-secondary btn-xs';
                    disBtn.title = 'Music is enabled. Click to disable playback completely.';
                }
            }
        }

        const volSlider = $('music-volume-slider');
        if (volSlider && document.activeElement !== volSlider) {
            volSlider.value = state.localMusicVolume;
            volSlider.title = `Volume: ${state.localMusicVolume}%`;
        }

        const muteBtn = $('btn-music-mute');
        if (muteBtn) {
            const isMuted = state.localMusicMuted || (state.playerMusicDisabled && !state.isGameGm);
            muteBtn.innerHTML = isMuted
                ? '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>'
                : '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
            muteBtn.title = isMuted ? 'Local Mute: ON (Click to unmute)' : 'Local Mute: OFF (Click to mute)';
        }

        const unlockBtn = $('btn-music-unlock');
        if (unlockBtn) {
            unlockBtn.classList.toggle('hidden', !state.autoplayBlocked);
            unlockBtn.classList.toggle('pulse', state.autoplayBlocked);
        }
    }

    function togglePlayPause() {
        if (!state.isGameGm) return;
        const ms = state.musicState;

        if (!ms || ms.status === 'stopped' || !ms.track_url) {
            let pl = (state.playlists || []).find(p => p.id === state.selectedPlaylistId);
            if (!pl || !pl.tracks || pl.tracks.length === 0) {
                pl = (state.playlists || []).find(p => p.tracks && p.tracks.length > 0);
            }
            if (!pl || !pl.tracks || pl.tracks.length === 0) {
                openMusicModal();
                return;
            }
            playTrackFromPlaylist(pl.id, pl.tracks[0].id);
            return;
        }

        if (ms.status === 'playing') {
            const pos = getCurrentPlaybackPosition();
            broadcastMusicState({ status: 'paused', position: pos });
        } else {
            broadcastMusicState({ status: 'playing', position: Number(ms.position) || 0 });
        }
    }

    function nextTrack() {
        if (!state.isGameGm) return;
        const ms = state.musicState;
        if (!ms) return;

        const playlist = (state.playlists || []).find(p => p.id === ms.playlist_id);
        if (!playlist || !playlist.tracks || playlist.tracks.length === 0) return;

        const currentIndex = playlist.tracks.findIndex(t => t.id === ms.track_id);
        const nextIndex = (currentIndex >= 0 && currentIndex + 1 < playlist.tracks.length)
            ? (currentIndex + 1)
            : 0;
        const next = playlist.tracks[nextIndex];
        broadcastMusicState({
            status: 'playing',
            playlist_id: playlist.id,
            track_id: next.id,
            track_title: next.title,
            track_url: next.url,
            source_type: next.source_type,
            position: 0
        });
    }

    function prevTrack() {
        if (!state.isGameGm) return;
        const ms = state.musicState;
        if (!ms) return;

        const curPos = getCurrentPlaybackPosition();
        if (curPos > 3) {
            broadcastMusicState({ status: 'playing', position: 0 });
            return;
        }

        const playlist = (state.playlists || []).find(p => p.id === ms.playlist_id);
        if (!playlist || !playlist.tracks || playlist.tracks.length === 0) return;

        const currentIndex = playlist.tracks.findIndex(t => t.id === ms.track_id);
        const prevIndex = (currentIndex > 0) ? (currentIndex - 1) : (playlist.tracks.length - 1);
        const prev = playlist.tracks[prevIndex];
        broadcastMusicState({
            status: 'playing',
            playlist_id: playlist.id,
            track_id: prev.id,
            track_title: prev.title,
            track_url: prev.url,
            source_type: prev.source_type,
            position: 0
        });
    }

    function toggleRepeatMode() {
        if (!state.isGameGm) return;
        const curMode = (state.musicState && state.musicState.repeat_mode) || 'playlist';
        const nextMode = curMode === 'playlist' ? 'track' : (curMode === 'track' ? 'none' : 'playlist');
        broadcastMusicState({ repeat_mode: nextMode });
    }

    function handleTrackEnded() {
        if (!state.isGameGm) return;
        const ms = state.musicState;
        if (!ms) return;
        const mode = ms.repeat_mode || 'playlist';

        if (mode === 'track') {
            broadcastMusicState({ status: 'playing', position: 0 });
            return;
        }

        const playlist = (state.playlists || []).find(p => p.id === ms.playlist_id);
        if (!playlist || !playlist.tracks || playlist.tracks.length === 0) {
            broadcastMusicState({ status: 'stopped', position: 0 });
            return;
        }

        const currentIndex = playlist.tracks.findIndex(t => t.id === ms.track_id);
        if (currentIndex === -1) {
            const first = playlist.tracks[0];
            broadcastMusicState({
                status: 'playing',
                playlist_id: playlist.id,
                track_id: first.id,
                track_title: first.title,
                track_url: first.url,
                source_type: first.source_type,
                position: 0
            });
            return;
        }

        const nextIndex = currentIndex + 1;
        if (nextIndex < playlist.tracks.length) {
            const next = playlist.tracks[nextIndex];
            broadcastMusicState({
                status: 'playing',
                playlist_id: playlist.id,
                track_id: next.id,
                track_title: next.title,
                track_url: next.url,
                source_type: next.source_type,
                position: 0
            });
        } else if (mode === 'playlist') {
            const first = playlist.tracks[0];
            broadcastMusicState({
                status: 'playing',
                playlist_id: playlist.id,
                track_id: first.id,
                track_title: first.title,
                track_url: first.url,
                source_type: first.source_type,
                position: 0
            });
        } else {
            broadcastMusicState({ status: 'stopped', position: 0 });
        }
    }

    function playTrackFromPlaylist(playlistId, trackId) {
        if (!state.isGameGm) return;
        const pl = (state.playlists || []).find(p => p.id === playlistId);
        if (!pl) return;
        const track = (pl.tracks || []).find(t => t.id === trackId);
        if (!track) return;

        broadcastMusicState({
            status: 'playing',
            playlist_id: pl.id,
            track_id: track.id,
            track_title: track.title,
            track_url: track.url,
            source_type: track.source_type,
            position: 0,
            repeat_mode: (state.musicState && state.musicState.repeat_mode) || 'playlist'
        });
    }

    async function openMusicModal() {
        if (!state.currentGame) return;
        try {
            const res = await apiCall('get_playlists', { game_id: state.currentGame.id });
            state.playlists = res.playlists || [];
            if (res.music_state) {
                state.musicState = res.music_state;
            }
            if (state.playlists.length > 0) {
                if (!state.selectedPlaylistId || !state.playlists.some(p => p.id === state.selectedPlaylistId)) {
                    state.selectedPlaylistId = state.playlists[0].id;
                }
            } else {
                state.selectedPlaylistId = 0;
            }
            renderPlaylistsSidebar();
            renderPlaylistDetail();
            $('modal-music-library').classList.remove('hidden');
        } catch (err) {
            showAlertModal('Failed to load playlists: ' + err.message, 'Music Library Error', '⚠️');
        }
    }

    function closeMusicModal() {
        $('modal-music-library').classList.add('hidden');
    }

    function renderPlaylistsSidebar(filterText = '') {
        const listEl = $('playlists-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        const search = (typeof filterText === 'string' ? filterText : ($('playlist-search-input')?.value || '')).trim().toLowerCase();
        const filtered = (state.playlists || []).filter(p => !search || p.name.toLowerCase().includes(search));

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.style.padding = '16px';
            empty.style.color = 'var(--text-muted)';
            empty.style.fontSize = '0.82rem';
            empty.style.textAlign = 'center';
            empty.textContent = search ? 'No playlists match your search.' : 'No playlists yet. Click "+ New Playlist" above.';
            listEl.appendChild(empty);
            return;
        }

        filtered.forEach(p => {
            const item = document.createElement('div');
            item.className = 'playlist-list-item' + (p.id === state.selectedPlaylistId ? ' active' : '');
            item.setAttribute('data-select-playlist', String(p.id));

            const isPlayingInThis = (state.musicState && state.musicState.playlist_id === p.id && state.musicState.status === 'playing');

            item.innerHTML = `
                <div class="playlist-item-meta">
                    <span class="playlist-item-title">${escapeHtml(p.name)}</span>
                    <span class="playlist-item-count">${(p.tracks || []).length} track${(p.tracks || []).length === 1 ? '' : 's'}${isPlayingInThis ? ' • <span style="color:var(--accent-gold);">▶ Playing</span>' : ''}</span>
                </div>
            `;
            listEl.appendChild(item);
        });
    }

    function renderPlaylistDetail() {
        const emptyEl = $('music-empty-state');
        const contentEl = $('music-playlist-content');
        if (!emptyEl || !contentEl) return;

        const playlist = (state.playlists || []).find(p => p.id === state.selectedPlaylistId);
        if (!playlist) {
            emptyEl.classList.remove('hidden');
            contentEl.classList.add('hidden');
            return;
        }

        emptyEl.classList.add('hidden');
        contentEl.classList.remove('hidden');

        const nameInput = $('playlist-name-input');
        if (nameInput) {
            if (document.activeElement !== nameInput || state._lastRenderedPlaylistId !== playlist.id) {
                nameInput.value = playlist.name;
            }
        }
        state._lastRenderedPlaylistId = playlist.id;

        $('current-playlist-track-count').textContent = String((playlist.tracks || []).length);

        const repeatBadge = $('btn-modal-repeat-toggle');
        if (repeatBadge) {
            const mode = (state.musicState && state.musicState.repeat_mode) || 'playlist';
            const labels = {
                playlist: '🔁 Repeat: Playlist',
                track: '🔂 Repeat: Track',
                none: '➡️ Repeat: Off'
            };
            repeatBadge.textContent = labels[mode] || '🔁 Repeat: Playlist';
        }

        const tracksContainer = $('playlist-tracks-list');
        tracksContainer.innerHTML = '';

        if (!playlist.tracks || playlist.tracks.length === 0) {
            const noTracks = document.createElement('div');
            noTracks.style.padding = '24px';
            noTracks.style.color = 'var(--text-muted)';
            noTracks.style.fontSize = '0.85rem';
            noTracks.style.textAlign = 'center';
            noTracks.textContent = 'This playlist is empty. Add a YouTube or Web Audio link above!';
            tracksContainer.appendChild(noTracks);
            return;
        }

        playlist.tracks.forEach((track) => {
            const isPlayingThisTrack = (
                state.musicState &&
                state.musicState.playlist_id === playlist.id &&
                state.musicState.track_id === track.id &&
                state.musicState.status === 'playing'
            );

            const isPausedThisTrack = (
                state.musicState &&
                state.musicState.playlist_id === playlist.id &&
                state.musicState.track_id === track.id &&
                state.musicState.status === 'paused'
            );

            const row = document.createElement('div');
            row.className = 'playlist-track-item' + (isPlayingThisTrack || isPausedThisTrack ? ' is-active-track' : '');
            row.setAttribute('data-track-id', track.id);

            const isYt = (track.source_type === 'youtube');
            const playSvg = isPlayingThisTrack
                ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
                : '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';

            row.innerHTML = `
                <button type="button" class="track-play-btn" data-action-play-track="${escapeHtml(track.id)}" title="${isPlayingThisTrack ? 'Pause Track' : 'Play Track for Session'}">
                    ${playSvg}
                </button>
                <span class="track-source-badge ${isYt ? 'badge-youtube' : 'badge-audio'}">
                    ${isYt ? 'YouTube' : 'Audio'}
                </span>
                <div class="track-info">
                    <span class="track-title">${escapeHtml(track.title || 'Untitled Track')}</span>
                    <span class="track-url">${escapeHtml(track.url)}</span>
                </div>
                <button type="button" class="track-del-btn" data-action-delete-track="${escapeHtml(track.id)}" title="Delete Track">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
            `;
            tracksContainer.appendChild(row);
        });
    }

    async function handleCreatePlaylist() {
        if (!state.currentGame) return;
        try {
            const res = await apiCall('save_playlist', {
                game_id: state.currentGame.id,
                name: 'New Playlist'
            });
            state.playlists = res.playlists || [];
            if (res.playlist) {
                state.selectedPlaylistId = res.playlist.id;
            }
            state._lastRenderedPlaylistId = null;
            renderPlaylistsSidebar();
            renderPlaylistDetail();
            const nameInput = $('playlist-name-input');
            if (nameInput) {
                nameInput.focus();
                nameInput.select();
            }
            updateVttHeaderAndHud();
        } catch (err) {
            showAlertModal('Failed to create playlist: ' + err.message, 'Create Error', '⚠️');
        }
    }

    async function handleRenamePlaylist() {
        if (!state.currentGame || !state.selectedPlaylistId) return;
        const nameInput = $('playlist-name-input');
        if (!nameInput) return;
        const name = nameInput.value.trim();
        if (!name) return;

        const playlist = (state.playlists || []).find(p => p.id === state.selectedPlaylistId);
        if (playlist && playlist.name === name) return;

        if (playlist) {
            playlist.name = name;
            renderPlaylistsSidebar();
        }

        try {
            const res = await apiCall('save_playlist', {
                game_id: state.currentGame.id,
                id: state.selectedPlaylistId,
                name: name
            });
            state.playlists = res.playlists || [];
            renderPlaylistsSidebar();
            updateVttHeaderAndHud();
        } catch (err) {
            showAlertModal('Failed to rename playlist: ' + err.message, 'Rename Error', '⚠️');
        }
    }

    function handlePlayEntirePlaylist() {
        if (!state.selectedPlaylistId) return;
        const pl = (state.playlists || []).find(p => p.id === state.selectedPlaylistId);
        if (!pl || !pl.tracks || pl.tracks.length === 0) {
            showAlertModal('Please add at least one track to this playlist before playing.', 'Empty Playlist', 'ℹ️');
            return;
        }
        playTrackFromPlaylist(pl.id, pl.tracks[0].id);
    }

    async function handleDeletePlaylist() {
        if (!state.currentGame || !state.selectedPlaylistId) return;
        const pl = (state.playlists || []).find(p => p.id === state.selectedPlaylistId);
        const name = pl ? pl.name : 'this playlist';

        const confirmed = await showConfirmModal({
            title: 'Delete Playlist',
            message: `Permanently delete playlist "${name}" and all its tracks?`,
            detail: 'This action cannot be undone.',
            okText: 'Delete Playlist',
            isDanger: true,
            icon: '🎵'
        });
        if (!confirmed) return;

        try {
            const res = await apiCall('delete_playlist', {
                game_id: state.currentGame.id,
                id: state.selectedPlaylistId
            });
            state.playlists = res.playlists || [];
            state.selectedPlaylistId = state.playlists.length > 0 ? state.playlists[0].id : 0;
            renderPlaylistsSidebar();
            renderPlaylistDetail();
            updateVttHeaderAndHud();
        } catch (err) {
            showAlertModal('Failed to delete playlist: ' + err.message, 'Delete Error', '⚠️');
        }
    }

    async function handleAddTrack(e) {
        e.preventDefault();
        if (!state.currentGame || !state.selectedPlaylistId) return;

        const titleInput = $('track-title-input');
        const urlInput = $('track-url-input');
        const title = titleInput.value.trim();
        const url = urlInput.value.trim();
        if (!url) return;

        const addBtn = $('btn-add-track');
        const origText = addBtn.textContent;
        addBtn.textContent = 'Adding...';
        addBtn.disabled = true;

        try {
            const res = await apiCall('add_playlist_track', {
                game_id: state.currentGame.id,
                playlist_id: state.selectedPlaylistId,
                title,
                url
            });
            state.playlists = res.playlists || [];
            titleInput.value = '';
            urlInput.value = '';
            renderPlaylistsSidebar();
            renderPlaylistDetail();
        } catch (err) {
            showAlertModal('Failed to add track: ' + err.message, 'Add Track Error', '⚠️');
        } finally {
            addBtn.textContent = origText;
            addBtn.disabled = false;
        }
    }

    async function handleDeleteTrack(playlistId, trackId) {
        if (!state.currentGame || !playlistId || !trackId) return;
        const pl = (state.playlists || []).find(p => p.id === playlistId);
        const track = pl ? (pl.tracks || []).find(t => t.id === trackId) : null;
        const title = track ? track.title : 'this track';

        const confirmed = await showConfirmModal({
            title: 'Delete Track',
            message: `Remove "${title}" from the playlist?`,
            okText: 'Remove Track',
            isDanger: true,
            icon: '🗑️'
        });
        if (!confirmed) return;

        try {
            const res = await apiCall('delete_playlist_track', {
                game_id: state.currentGame.id,
                playlist_id: playlistId,
                track_id: trackId
            });
            state.playlists = res.playlists || [];
            renderPlaylistsSidebar();
            renderPlaylistDetail();
        } catch (err) {
            showAlertModal('Failed to delete track: ' + err.message, 'Delete Error', '⚠️');
        }
    }

    function bindMusicEvents() {
        const openMusicBtn = $('btn-open-music-library');
        if (openMusicBtn) openMusicBtn.addEventListener('click', openMusicModal);

        const closeMusicBtn = $('btn-close-music-modal');
        if (closeMusicBtn) closeMusicBtn.addEventListener('click', closeMusicModal);

        const playpauseBtn = $('btn-music-playpause');
        if (playpauseBtn) playpauseBtn.addEventListener('click', togglePlayPause);

        const nextBtn = $('btn-music-next');
        if (nextBtn) nextBtn.addEventListener('click', nextTrack);

        const prevBtn = $('btn-music-prev');
        if (prevBtn) prevBtn.addEventListener('click', prevTrack);

        const repeatBtn = $('btn-music-repeat');
        if (repeatBtn) repeatBtn.addEventListener('click', toggleRepeatMode);

        const modalRepeatBtn = $('btn-modal-repeat-toggle');
        if (modalRepeatBtn) modalRepeatBtn.addEventListener('click', toggleRepeatMode);

        const muteBtn = $('btn-music-mute');
        if (muteBtn) muteBtn.addEventListener('click', toggleLocalMute);

        const volSlider = $('music-volume-slider');
        if (volSlider) {
            const handleVolChange = (e) => {
                const val = Number(e.target.value);
                volSlider.title = `Volume: ${val}%`;
                setLocalVolume(val);
            };
            volSlider.addEventListener('input', handleVolChange);
            volSlider.addEventListener('change', handleVolChange);
        }

        const playerDisBtn = $('btn-player-disable-music');
        if (playerDisBtn) playerDisBtn.addEventListener('click', togglePlayerDisableMusic);

        const unlockBtn = $('btn-music-unlock');
        if (unlockBtn) {
            unlockBtn.addEventListener('click', () => {
                state.userHasInteracted = true;
                state.autoplayBlocked = false;
                applyLocalVolume();
                updateMusicBarControlsUI();
                if (state.audioElement && state.musicState && state.musicState.status === 'playing') {
                    state.audioElement.muted = state.localMusicMuted;
                    state.audioElement.play().catch(() => {});
                }
                if (state.ytPlayer && state.musicState && state.musicState.status === 'playing') {
                    try {
                        const isMuted = state.localMusicMuted || (state.playerMusicDisabled && !state.isGameGm);
                        if (!isMuted && typeof state.ytPlayer.unMute === 'function') {
                            state.ytPlayer.unMute();
                            if (typeof state.ytPlayer.setVolume === 'function') {
                                state.ytPlayer.setVolume(Math.round(state.localMusicVolume || 70));
                            }
                        }
                        if (typeof state.ytPlayer.playVideo === 'function') {
                            state.ytPlayer.playVideo();
                        }
                    } catch (e) {}
                }
            });
        }

        const newPlBtn = $('btn-new-playlist');
        if (newPlBtn) newPlBtn.addEventListener('click', handleCreatePlaylist);

        const savePlBtn = $('btn-save-playlist-name');
        if (savePlBtn) savePlBtn.addEventListener('click', handleRenamePlaylist);

        const plNameInput = $('playlist-name-input');
        if (plNameInput) {
            plNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleRenamePlaylist();
                    plNameInput.blur();
                }
            });
            plNameInput.addEventListener('blur', () => {
                handleRenamePlaylist();
            });
        }

        const playAllBtn = $('btn-play-entire-playlist');
        if (playAllBtn) playAllBtn.addEventListener('click', handlePlayEntirePlaylist);

        const delPlBtn = $('btn-delete-playlist');
        if (delPlBtn) delPlBtn.addEventListener('click', handleDeletePlaylist);

        const addTrackForm = $('form-add-track');
        if (addTrackForm) addTrackForm.addEventListener('submit', handleAddTrack);

        const searchInput = $('playlist-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                renderPlaylistsSidebar(e.target.value);
            });
        }

        const plListEl = $('playlists-list');
        if (plListEl) {
            plListEl.addEventListener('click', (e) => {
                const item = e.target.closest('[data-select-playlist]');
                if (item) {
                    state.selectedPlaylistId = Number(item.getAttribute('data-select-playlist'));
                    renderPlaylistsSidebar();
                    renderPlaylistDetail();
                }
            });
        }

        const tracksListEl = $('playlist-tracks-list');
        if (tracksListEl) {
            tracksListEl.addEventListener('click', (e) => {
                const playBtn = e.target.closest('[data-action-play-track]');
                if (playBtn) {
                    const trackId = playBtn.getAttribute('data-action-play-track');
                    const ms = state.musicState;
                    if (ms && ms.playlist_id === state.selectedPlaylistId && ms.track_id === trackId && ms.status === 'playing') {
                        togglePlayPause();
                    } else {
                        playTrackFromPlaylist(state.selectedPlaylistId, trackId);
                    }
                    return;
                }

                const delBtn = e.target.closest('[data-action-delete-track]');
                if (delBtn) {
                    const trackId = delBtn.getAttribute('data-action-delete-track');
                    handleDeleteTrack(state.selectedPlaylistId, trackId);
                    return;
                }

                const row = e.target.closest('.playlist-track-item');
                if (row) {
                    const trackId = row.getAttribute('data-track-id');
                    if (trackId) {
                        playTrackFromPlaylist(state.selectedPlaylistId, trackId);
                    }
                }
            });
        }
    }

    // =========================================================
    // EMBEDDED PDF LIBRARY & VIEWER CONTROLLER
    // =========================================================

    function formatFileSize(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
    }

    function openEmbeddedPdfReader(pdf) {
        if (!pdf || !pdf.filename) return;
        state.activeViewerPdf = pdf;

        const titleEl = $('pdf-viewer-title');
        if (titleEl) {
            titleEl.textContent = pdf.title || 'PDF Document';
        }

        const frame = $('pdf-viewer-frame');
        if (frame) {
            frame.src = pdf.filename + '#view=FitH';
        }

        const newTabBtn = $('btn-pdf-new-tab');
        if (newTabBtn) {
            newTabBtn.href = pdf.filename;
        }

        const viewerModal = $('modal-pdf-viewer');
        if (viewerModal) {
            viewerModal.classList.remove('hidden');
        }
    }

    function closeEmbeddedPdfReader() {
        state.activeViewerPdf = null;
        const frame = $('pdf-viewer-frame');
        if (frame) {
            frame.src = '';
        }
        const viewerModal = $('modal-pdf-viewer');
        if (viewerModal) {
            viewerModal.classList.add('hidden');
        }
        const card = $('pdf-viewer-card');
        if (card) {
            card.classList.remove('is-maximized');
        }
        const maximizeBtn = $('btn-pdf-maximize');
        if (maximizeBtn) {
            maximizeBtn.textContent = '⛶';
        }
    }

    function openPdfLibraryModal() {
        const modal = $('modal-pdf-library');
        if (!modal) return;
        modal.classList.remove('hidden');

        const uploadBar = $('pdf-upload-bar');
        const dropzoneCue = $('pdf-dropzone-cue');
        const playerInfoBar = $('pdf-player-info-bar');

        if (state.isGameGm) {
            if (uploadBar) uploadBar.classList.remove('hidden');
            if (dropzoneCue) dropzoneCue.classList.remove('hidden');
            if (playerInfoBar) playerInfoBar.classList.add('hidden');
        } else {
            if (uploadBar) uploadBar.classList.add('hidden');
            if (dropzoneCue) dropzoneCue.classList.add('hidden');
            if (playerInfoBar) playerInfoBar.classList.remove('hidden');
        }

        renderPdfLibraryModal();
    }

    function closePdfLibraryModal() {
        const modal = $('modal-pdf-library');
        if (modal) modal.classList.add('hidden');
    }

    function renderPdfLibraryModal() {
        const container = $('pdf-library-grid');
        if (!container) return;

        const q = (state.pdfLibrarySearch || '').toLowerCase().trim();
        const list = (state.pdfs || []).filter(p => {
            if (!q) return true;
            return (p.title || '').toLowerCase().includes(q) || (p.filename || '').toLowerCase().includes(q);
        });

        if (list.length === 0) {
            if (state.isGameGm) {
                container.innerHTML = `
                    <div style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; color: var(--text-muted);">
                        <div style="font-size: 2.2rem; margin-bottom: 10px;">📖</div>
                        <div style="font-size: 1rem; font-weight: 600; margin-bottom: 6px; color: var(--text-primary);">No PDF Documents Yet</div>
                        <p style="font-size: 0.85rem; margin: 0 auto; max-width: 420px;">
                            Click <strong>+ Upload PDF(s)</strong> above or drag and drop PDF rulebooks, handouts, or character sheets anywhere here.
                        </p>
                    </div>`;
            } else {
                container.innerHTML = `
                    <div style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; color: var(--text-muted);">
                        <div style="font-size: 2.2rem; margin-bottom: 10px;">📖</div>
                        <div style="font-size: 1rem; font-weight: 600; margin-bottom: 6px; color: var(--text-primary);">No PDFs Shared Yet</div>
                        <p style="font-size: 0.85rem; margin: 0 auto; max-width: 420px;">
                            Your Game Master hasn't shared any PDF documents in this campaign yet. Check back during the session!
                        </p>
                    </div>`;
            }
            return;
        }

        container.innerHTML = list.map(pdf => {
            const isShared = Boolean(Number(pdf.is_shared));
            const sizeStr = formatFileSize(pdf.filesize);

            let statusHtml = '';
            if (state.isGameGm) {
                statusHtml = isShared
                    ? '<span class="pdf-shared-badge is-shared" title="Visible to all players in the campaign">👥 Shared</span>'
                    : '<span class="pdf-shared-badge is-private" title="Only visible to the GM">🔒 GM Only</span>';
            }

            let gmActions = '';
            if (state.isGameGm) {
                const shareBtnTitle = isShared
                    ? 'Shared with players (Click to unshare / make private)'
                    : 'Private to GM (Click to share with players)';
                const shareIcon = isShared ? '👥' : '🔒';
                const shareBtnClass = isShared ? 'btn-success' : 'btn-secondary';

                gmActions = `
                    <button type="button" class="btn ${shareBtnClass} btn-xs" data-action-toggle-share="${pdf.id}" title="${shareBtnTitle}">${shareIcon}</button>
                    <button type="button" class="btn btn-danger btn-xs" data-action-delete-pdf="${pdf.id}" title="Delete document">🗑️</button>
                `;
            }

            let coverHtml = '';
            if (pdf.cover_image) {
                coverHtml = `
                    <div class="pdf-card-cover-wrap" data-action-view-pdf="${pdf.id}" title="Click to read ${escapeHtml(pdf.title)}">
                        <img src="${escapeHtml(pdf.cover_image)}" alt="${escapeHtml(pdf.title)} cover" class="pdf-card-cover-img" loading="lazy">
                        <div class="pdf-cover-overlay">📖 Read</div>
                    </div>
                `;
            } else {
                coverHtml = `
                    <div class="pdf-card-cover-wrap pdf-cover-fallback" data-action-view-pdf="${pdf.id}" title="Click to read ${escapeHtml(pdf.title)}">
                        <div class="pdf-cover-fallback-icon">📖</div>
                        <div class="pdf-cover-fallback-text">${escapeHtml(pdf.title)}</div>
                        <div class="pdf-cover-overlay">📖 Read</div>
                    </div>
                `;
            }

            return `
                <div class="pdf-card" data-pdf-id="${pdf.id}">
                    ${coverHtml}
                    <div class="pdf-card-info">
                        <div class="pdf-card-title" title="${escapeHtml(pdf.title)}">${escapeHtml(pdf.title)}</div>
                        <div class="pdf-card-meta">
                            <span>${sizeStr}</span>
                            ${statusHtml}
                        </div>
                    </div>
                    <div class="pdf-card-actions">
                        <button type="button" class="btn btn-primary btn-xs" data-action-view-pdf="${pdf.id}" title="Read / Open document">📖</button>
                        ${gmActions}
                    </div>
                </div>
            `;
        }).join('');
    }

    async function handleUploadPdfs(fileList) {
        if (!state.currentGame || !state.isGameGm) return;
        const files = Array.from(fileList || []).filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf');
        if (files.length === 0) {
            showAlertModal('Please select valid PDF (.pdf) files.', 'Upload Error', '⚠️');
            return;
        }

        const totalBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);
        const totalSizeStr = formatFileSize(totalBytes);

        const formData = new FormData();
        formData.append('action', 'upload_pdf');
        formData.append('game_id', state.currentGame.id);
        formData.append('is_shared', '0'); // Private by default - never autoshare
        files.forEach(f => formData.append('pdfs[]', f));

        const cue = $('pdf-dropzone-cue');
        const uploadBtn = $('btn-upload-pdf');
        const origBtnText = uploadBtn ? uploadBtn.textContent : '+ Upload PDF(s)';

        if (cue) cue.textContent = `⏳ Uploading ${files.length} PDF file(s) (${totalSizeStr})... Please wait.`;
        if (uploadBtn) {
            uploadBtn.disabled = true;
            uploadBtn.textContent = '⏳ Uploading...';
        }

        try {
            const res = await apiCall('upload_pdf', formData, true);
            if (res.skipped && res.skipped.length > 0) {
                showAlertModal('Some files could not be uploaded:\n' + res.skipped.join('\n'), 'Upload Notice', 'ℹ️');
            }
            if (res.pdfs) {
                state.pdfs = res.pdfs;
                renderPdfLibraryModal();
                updateVttHeaderAndHud();
            }
        } catch (err) {
            showAlertModal('Failed to upload PDF(s): ' + err.message, 'Upload Error', '⚠️');
        } finally {
            if (cue) cue.textContent = '📥 Drop PDF files anywhere here to upload';
            if (uploadBtn) {
                uploadBtn.disabled = false;
                uploadBtn.textContent = origBtnText;
            }
        }
    }

    async function handleDeletePdf(pdfId) {
        if (!state.currentGame || !state.isGameGm) return;
        const pdf = state.pdfs.find(p => p.id === pdfId);
        const name = pdf ? pdf.title : 'this PDF';
        if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

        try {
            const res = await apiCall('delete_pdf', {
                game_id: state.currentGame.id,
                pdf_id: pdfId
            });
            if (res.pdfs) {
                state.pdfs = res.pdfs;
                if (state.activeViewerPdf && state.activeViewerPdf.id === pdfId) {
                    closeEmbeddedPdfReader();
                }
                renderPdfLibraryModal();
                updateVttHeaderAndHud();
            }
        } catch (err) {
            showAlertModal('Failed to delete PDF: ' + err.message, 'Delete Error', '⚠️');
        }
    }

    async function handleToggleSharePdf(pdfId, newShareState) {
        if (!state.currentGame || !state.isGameGm) return;
        try {
            const res = await apiCall('share_pdf', {
                game_id: state.currentGame.id,
                pdf_id: pdfId,
                is_shared: newShareState ? 1 : 0
            });
            if (res.pdfs) {
                state.pdfs = res.pdfs;
                renderPdfLibraryModal();
                updateVttHeaderAndHud();
            }
        } catch (err) {
            showAlertModal('Failed to update PDF share status: ' + err.message, 'Share Error', '⚠️');
        }
    }

    function bindPdfEvents() {
        const btnOpenHud = $('btn-open-pdf-library');
        if (btnOpenHud) btnOpenHud.addEventListener('click', openPdfLibraryModal);

        const btnOpenNav = $('btn-nav-pdf-library');
        if (btnOpenNav) btnOpenNav.addEventListener('click', openPdfLibraryModal);

        const btnCloseLib = $('btn-close-pdf-library');
        if (btnCloseLib) btnCloseLib.addEventListener('click', closePdfLibraryModal);

        const btnUpload = $('btn-upload-pdf');
        const fileInput = $('pdf-file-input');
        if (btnUpload && fileInput) {
            btnUpload.addEventListener('click', () => {
                fileInput.value = '';
                fileInput.click();
            });
            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    handleUploadPdfs(e.target.files);
                }
            });
        }

        const libModal = $('modal-pdf-library');
        if (libModal) {
            const cue = $('pdf-dropzone-cue');
            libModal.addEventListener('dragover', (e) => {
                if (!state.isGameGm) return;
                e.preventDefault();
                e.stopPropagation();
                if (cue) cue.classList.add('is-dragover');
            });
            libModal.addEventListener('dragleave', (e) => {
                if (!state.isGameGm) return;
                if (!libModal.contains(e.relatedTarget)) {
                    if (cue) cue.classList.remove('is-dragover');
                }
            });
            libModal.addEventListener('drop', (e) => {
                if (!state.isGameGm) return;
                e.preventDefault();
                e.stopPropagation();
                if (cue) cue.classList.remove('is-dragover');
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleUploadPdfs(e.dataTransfer.files);
                }
            });
        }

        const searchInput = $('pdf-library-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                state.pdfLibrarySearch = e.target.value;
                renderPdfLibraryModal();
            });
        }

        const grid = $('pdf-library-grid');
        if (grid) {
            grid.addEventListener('click', (e) => {
                const viewBtn = e.target.closest('[data-action-view-pdf]');
                if (viewBtn) {
                    const pdfId = Number(viewBtn.getAttribute('data-action-view-pdf'));
                    const pdf = state.pdfs.find(p => p.id === pdfId);
                    if (pdf) {
                        openEmbeddedPdfReader(pdf);
                    }
                    return;
                }

                const shareBtn = e.target.closest('[data-action-toggle-share]');
                if (shareBtn) {
                    const pdfId = Number(shareBtn.getAttribute('data-action-toggle-share'));
                    const pdf = state.pdfs.find(p => p.id === pdfId);
                    if (pdf) {
                        handleToggleSharePdf(pdfId, !pdf.is_shared);
                    }
                    return;
                }

                const delBtn = e.target.closest('[data-action-delete-pdf]');
                if (delBtn) {
                    const pdfId = Number(delBtn.getAttribute('data-action-delete-pdf'));
                    handleDeletePdf(pdfId);
                    return;
                }
            });
        }

        const btnCloseViewer = $('btn-close-pdf-viewer');
        if (btnCloseViewer) btnCloseViewer.addEventListener('click', closeEmbeddedPdfReader);

        const btnMaximize = $('btn-pdf-maximize');
        if (btnMaximize) {
            btnMaximize.addEventListener('click', () => {
                const card = $('pdf-viewer-card');
                if (card) {
                    const isMax = card.classList.toggle('is-maximized');
                    btnMaximize.textContent = isMax ? '❐' : '⛶';
                }
            });
        }
    }

    async function sendChatCommand(messageText) {
        if (!state.currentGame) return;
        try {
            const res = await apiCall('send_chat', {
                game_id: state.currentGame.id,
                message: messageText,
                view_mode: state.forcePlayerView ? 'player' : ''
            });
            if (typeof res.open_rolls === 'boolean') {
                state.currentGame.open_rolls = res.open_rolls ? 1 : 0;
                updateVttHeaderAndHud();
            }
            if (res.message) {
                appendChatMessages([res.message]);
            }
        } catch (err) {
            // Display command error inline in chat as system alert
            const container = $('chat-messages');
            const errDiv = document.createElement('div');
            errDiv.className = 'alert alert-error';
            errDiv.style.marginBottom = '4px';
            errDiv.textContent = err.message;
            container.appendChild(errDiv);
            container.scrollTop = container.scrollHeight;
        }
    }

    // Global user interaction listener to un-mute and unblock audio autoplay
    function handleGlobalInteractionForAudio() {
        state.userHasInteracted = true;
        if (state.autoplayBlocked) {
            state.autoplayBlocked = false;
            updateMusicBarControlsUI();
        }
        applyLocalVolume();

        if (state.ytPlayer && state.musicState && state.musicState.status === 'playing') {
            try {
                const isMuted = state.localMusicMuted || (state.playerMusicDisabled && !state.isGameGm);
                if (!isMuted && typeof state.ytPlayer.unMute === 'function') {
                    state.ytPlayer.unMute();
                    if (typeof state.ytPlayer.setVolume === 'function') {
                        state.ytPlayer.setVolume(Math.round(state.localMusicVolume || 70));
                    }
                }
                if (typeof state.ytPlayer.getPlayerState === 'function') {
                    const curState = state.ytPlayer.getPlayerState();
                    if (curState !== 1 && curState !== 3) {
                        state.ytPlayer.playVideo();
                    }
                }
            } catch (e) {}
        }
        if (state.audioElement && state.musicState && state.musicState.status === 'playing') {
            const isMuted = state.localMusicMuted || (state.playerMusicDisabled && !state.isGameGm);
            state.audioElement.muted = isMuted;
            if (state.audioElement.paused) {
                state.audioElement.play().catch(() => {});
            }
        }
    }
    window.addEventListener('pointerdown', handleGlobalInteractionForAudio, { capture: true, passive: true });
    window.addEventListener('click', handleGlobalInteractionForAudio, { capture: true, passive: true });
    window.addEventListener('keydown', handleGlobalInteractionForAudio, { capture: true, passive: true });

    window.addEventListener('DOMContentLoaded', initApp);
})();
