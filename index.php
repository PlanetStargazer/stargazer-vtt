<?php
declare(strict_types=1);
session_start();
?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stargazer's World VTT</title>
    <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>

    <!-- =========================================================
         1. FIRST-LAUNCH ADMIN SETUP VIEW
         ========================================================= -->
    <section id="view-setup-admin" class="fullscreen-center hidden">
        <div class="auth-card">
            <div class="brand-header">
                <div class="brand-logo">
                    <img src="assets/sgg_logo.png" alt="Stargazer's World VTT Logo" class="brand-logo-img">
                </div>
                <h1>First-Launch Admin Setup</h1>
                <p>Welcome to Stargazer's World VTT! Please create the primary Administrator account to initialize the server.</p>
            </div>

            <div id="setup-error" class="alert alert-error hidden"></div>

            <form id="form-setup-admin">
                <div class="form-group">
                    <label for="setup-username">Admin Username</label>
                    <input type="text" id="setup-username" class="form-control" placeholder="e.g. Stargazer" required minlength="2" maxlength="32">
                </div>
                <div class="form-group">
                    <label for="setup-email">Email Address</label>
                    <input type="email" id="setup-email" class="form-control" placeholder="admin@example.com" required>
                </div>
                <div class="form-group">
                    <label for="setup-password">Password</label>
                    <input type="password" id="setup-password" class="form-control" placeholder="At least 6 characters" required minlength="6">
                </div>
                <button type="submit" class="btn btn-primary btn-block">Initialize Stargazer's World VTT &amp; Create Admin</button>
            </form>
        </div>
    </section>

    <!-- =========================================================
         2. LOGIN & SIGN UP VIEW
         ========================================================= -->
    <section id="view-auth" class="fullscreen-center hidden">
        <div class="auth-card">
            <div class="brand-header">
                <div class="brand-logo">
                    <img src="assets/sgg_logo.png" alt="Stargazer's World VTT Logo" class="brand-logo-img">
                </div>
                <h1>Stargazer's World VTT</h1>
                <p>Sign in to launch or join campaigns, or register a new account.</p>
            </div>

            <div class="auth-tabs" id="auth-tabs-bar">
                <button type="button" id="tab-login" class="auth-tab active">Log In</button>
                <button type="button" id="tab-signup" class="auth-tab">Sign Up</button>
            </div>

            <div id="auth-error" class="alert alert-error hidden"></div>
            <div id="auth-success" class="alert alert-success hidden"></div>

            <!-- Login Form -->
            <form id="form-login">
                <div class="form-group">
                    <label for="login-username">Username or Email</label>
                    <input type="text" id="login-username" class="form-control" placeholder="Enter your username or email" required>
                </div>
                <div class="form-group">
                    <div class="form-label-row">
                        <label for="login-password">Password</label>
                        <button type="button" id="btn-show-forgot" class="auth-link-btn" tabindex="-1">Forgot password?</button>
                    </div>
                    <input type="password" id="login-password" class="form-control" placeholder="Enter your password" required>
                </div>
                <button type="submit" class="btn btn-primary btn-block">Enter Stargazer's World VTT</button>
            </form>

            <!-- Sign Up Form -->
            <form id="form-signup" class="hidden">
                <div class="form-group">
                    <label for="signup-username">Username</label>
                    <input type="text" id="signup-username" class="form-control" placeholder="Choose a username" required minlength="2" maxlength="32">
                </div>
                <div class="form-group">
                    <label for="signup-email">Email Address</label>
                    <input type="email" id="signup-email" class="form-control" placeholder="you@example.com" required>
                </div>
                <div class="form-group">
                    <label for="signup-password">Password</label>
                    <input type="password" id="signup-password" class="form-control" placeholder="At least 6 characters" required minlength="6">
                </div>
                <button type="submit" class="btn btn-primary btn-block">Create Account</button>
            </form>

            <!-- Forgot Password Form -->
            <form id="form-forgot-password" class="hidden">
                <p class="auth-helper-text">Enter your username or registered email and we'll send you a secure link to reset your password.</p>
                <div class="form-group">
                    <label for="forgot-identifier">Username or Email Address</label>
                    <input type="text" id="forgot-identifier" class="form-control" placeholder="Enter your username or email" required>
                </div>
                <button type="submit" id="btn-submit-forgot" class="btn btn-primary btn-block">Send Reset Link</button>
                <div class="auth-footer-row">
                    <button type="button" id="btn-back-to-login" class="auth-link-btn">← Back to Log In</button>
                </div>
            </form>

            <!-- Set New Password Form (via email link) -->
            <form id="form-reset-password" class="hidden">
                <p class="auth-helper-text" id="reset-greeting-text">Please enter a new password for your account.</p>
                <input type="hidden" id="reset-token-input" value="">
                <div class="form-group">
                    <label for="reset-new-password">New Password</label>
                    <input type="password" id="reset-new-password" class="form-control" placeholder="At least 6 characters" required minlength="6">
                </div>
                <div class="form-group">
                    <label for="reset-confirm-password">Confirm New Password</label>
                    <input type="password" id="reset-confirm-password" class="form-control" placeholder="Repeat new password" required minlength="6">
                </div>
                <button type="submit" id="btn-submit-reset" class="btn btn-primary btn-block">Save New Password</button>
                <div class="auth-footer-row">
                    <button type="button" id="btn-cancel-reset" class="auth-link-btn">← Return to Log In</button>
                </div>
            </form>
        </div>
    </section>

    <!-- =========================================================
         3. LOBBY / CAMPAIGN & ADMIN MANAGEMENT VIEW
         ========================================================= -->
    <section id="view-lobby" class="lobby-wrapper hidden">
        <header class="top-navbar">
            <div class="nav-brand">
                <img src="assets/sgg_logo.png" alt="Stargazer's World VTT Logo" class="nav-brand-logo">
                <span>Stargazer's World VTT</span>
            </div>
            <div class="nav-user-controls">
                <span>Signed in as <strong id="lobby-username"></strong></span>
                <span id="lobby-user-badges"></span>
                <button type="button" class="btn btn-secondary btn-sm" data-open-manual="1">📖 Manual</button>
                <button type="button" id="btn-logout" class="btn btn-danger btn-sm">Log Out</button>
            </div>
        </header>

        <div class="lobby-content">
            <!-- Games List Panel -->
            <div class="panel-card">
                <div class="panel-header">
                    <h2 id="games-panel-title">Your Campaigns &amp; Invitations</h2>
                </div>
                <div id="lobby-games-list" class="games-list"></div>
            </div>

            <div class="lobby-grid-two">
                <!-- Create New Campaign Panel (Available to Everyone) -->
                <div id="panel-gm-create" class="panel-card">
                    <div class="panel-header">
                        <h2>✨ Create New Campaign</h2>
                    </div>
                    <form id="form-create-game">
                        <div class="form-group">
                            <label for="create-game-name">Campaign / Game Title</label>
                            <input type="text" id="create-game-name" class="form-control" placeholder="e.g. Beyond the Astral Rift" required maxlength="80">
                        </div>
                        <div class="form-group">
                            <label for="create-game-desc">Description (Optional)</label>
                            <input type="text" id="create-game-desc" class="form-control" placeholder="Session notes or setting summary">
                        </div>
                        <div class="form-group">
                            <label for="create-game-preview">Cover Image (Optional)</label>
                            <input type="file" id="create-game-preview" accept=".png,.jpg,.jpeg,.gif,.webp,.svg" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>Select Players Who Get Access</label>
                            <div id="create-game-players" class="player-checklist"></div>
                        </div>
                        <button type="submit" id="btn-submit-create-game" class="btn btn-primary">Create Campaign (You Are Owner &amp; GM)</button>
                    </form>
                </div>

                <!-- Admin Panel: Manage User Admin Rights -->
                <div id="panel-admin-users" class="panel-card hidden">
                    <div class="panel-header">
                        <h2>🛡️ User Accounts &amp; Admin Rights</h2>
                    </div>
                    <div style="overflow-x: auto;">
                        <table class="users-table">
                            <thead>
                                <tr>
                                    <th>Username</th>
                                    <th>Email</th>
                                    <th>Admin Rights</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="admin-users-tbody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Modal to edit campaign details, preview image, player access, and transfer ownership -->
        <div id="modal-edit-game" class="modal-backdrop hidden">
            <div class="modal-card">
                <div class="modal-header">
                    <h3>✏️ Edit Campaign Details &amp; Ownership</h3>
                    <button type="button" id="btn-close-edit-modal" class="btn btn-secondary btn-sm">✕</button>
                </div>
                <form id="form-edit-game">
                    <input type="hidden" id="edit-game-id">
                    <div class="form-group">
                        <label for="edit-game-name">Campaign Title</label>
                        <input type="text" id="edit-game-name" class="form-control" required maxlength="80">
                    </div>
                    <div class="form-group">
                        <label for="edit-game-desc">Description</label>
                        <input type="text" id="edit-game-desc" class="form-control" placeholder="Session notes or setting summary">
                    </div>
                    <div class="form-group">
                        <label for="edit-game-preview">Cover Image</label>
                        <div id="edit-game-preview-current" class="edit-preview-current hidden"></div>
                        <input type="file" id="edit-game-preview" accept=".png,.jpg,.jpeg,.gif,.webp,.svg" class="form-control">
                    </div>
                    <div class="form-group">
                        <label for="edit-game-owner">👑 Campaign Owner (GM) — Transfer Ownership</label>
                        <select id="edit-game-owner" class="form-control"></select>
                        <small style="color: var(--text-muted); font-size: 0.76rem; display: block; margin-top: 4px;">
                            The owner of a campaign is always its Game Master (GM). Transferring ownership makes the selected user the new GM and keeps you in the campaign as a player.
                        </small>
                    </div>
                    <div class="form-group">
                        <label>Players with Access</label>
                        <div id="edit-game-players" class="player-checklist"></div>
                    </div>
                    <button type="submit" id="btn-submit-edit-game" class="btn btn-primary btn-block">Save Campaign Changes</button>
                    <div class="danger-zone" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(239, 68, 68, 0.35);">
                        <div style="font-size: 0.82rem; font-weight: 700; color: #f87171; margin-bottom: 4px;">⚠️ Danger Zone</div>
                        <p style="font-size: 0.76rem; color: var(--text-muted); margin-bottom: 10px;">
                            Permanently delete this campaign and all associated data including chat logs, dice rolls, uploaded maps, handouts, and custom tokens.
                        </p>
                        <button type="button" id="btn-delete-campaign-modal" class="btn btn-danger btn-block">
                            🗑️ Delete Campaign Permanently
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </section>

    <!-- =========================================================
         4. VIRTUAL TABLETOP (BOARD + 3D DICE + CHAT SIDEBAR)
         ========================================================= -->
    <section id="view-vtt" class="vtt-layout hidden">
        <header class="top-navbar">
            <div class="nav-brand">
                <button type="button" id="btn-back-lobby" class="btn nav-header-btn" title="Return to Lobby">
                    <span class="nav-btn-icon">🚪</span>
                </button>
                <span id="vtt-game-title">Campaign</span>
                <span id="vtt-role-badge" class="badge badge-player">Player</span>
            </div>

            <!-- Top Navbar Music Player Bar -->
            <div id="vtt-music-bar" class="vtt-music-bar">
                <div class="music-bar-info" id="music-bar-info" title="Music Player">
                    <span id="music-indicator-icon" class="music-indicator-icon">🎵</span>
                    <div class="music-info-text">
                        <span id="music-track-title" class="music-track-title">No music playing</span>
                        <span id="music-track-playlist" class="music-track-playlist"></span>
                    </div>
                </div>

                <!-- GM-Only Playback Controls -->
                <div id="music-gm-controls" class="music-ctrl-group gm-only-control hidden">
                    <button type="button" id="btn-music-prev" class="music-icon-btn" title="Previous Track (GM)">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                    </button>
                    <button type="button" id="btn-music-playpause" class="music-icon-btn" title="Play / Pause (GM)">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                    <button type="button" id="btn-music-next" class="music-icon-btn" title="Next Track (GM)">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                    </button>
                    <button type="button" id="btn-music-repeat" class="music-icon-btn" title="Repeat Mode: Playlist (GM)">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
                    </button>
                </div>

                <!-- Local Audio & Volume Controls (Accessible to both GM and Players) -->
                <div class="music-volume-group">
                    <button type="button" id="btn-music-mute" class="music-icon-btn" title="Local Mute (Does not affect others)">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                    </button>
                    <input type="range" id="music-volume-slider" class="music-volume-slider" min="0" max="100" value="70" title="Local Volume">
                </div>

                <!-- Player-Only Disable Control -->
                <div id="music-player-controls" class="music-ctrl-group player-only-control hidden">
                    <button type="button" id="btn-player-disable-music" class="btn btn-secondary btn-xs" title="Disable or enable music playback completely">Music: ON</button>
                </div>

                <!-- Browser Autoplay Unlock Notice -->
                <button type="button" id="btn-music-unlock" class="btn btn-warning btn-xs hidden" title="Click to allow audio playback in your browser">🔊 Click to Unmute</button>
            </div>

            <div class="nav-user-controls">
                <button type="button" id="btn-nav-pdf-library" class="btn nav-header-btn" title="PDF Library (Rulebooks &amp; Handouts)">
                    <span class="nav-btn-icon">📖</span>
                    <span id="pdf-nav-count-badge" class="nav-badge">0</span>
                </button>
                <button type="button" id="btn-hide-ui" class="btn nav-header-btn hidden" title="Maximize Map View / Hide UI">
                    <span class="nav-btn-icon">⛶</span>
                </button>
                <button type="button" id="btn-clear-dice" class="btn nav-header-btn" title="Clear 3D Dice from Screen">
                    <span class="nav-btn-icon">🎲</span>
                </button>
                <button type="button" class="btn nav-header-btn" data-open-manual="1" title="User Manual &amp; Documentation">
                    <span class="nav-btn-icon">❓</span>
                </button>
            </div>
        </header>

        <div class="vtt-main">
            <!-- Show UI Button (Appears when mouse/touch enters any of the 4 corners while UI is hidden) -->
            <button type="button" id="btn-show-ui" class="btn nav-header-btn show-ui-corner-btn hidden" title="Show UI">
                <span class="nav-btn-icon">⛶</span>
            </button>

            <!-- Floating GM Controls on the Tabletop -->
            <div id="vtt-gm-hud" class="tabletop-hud hidden">
                <input type="file" id="gm-image-file-input" accept=".png,.jpg,.jpeg,.gif,.webp,.svg" multiple class="hidden">
                <input type="file" id="gm-token-file-input" accept=".png,.jpg,.jpeg,.gif,.webp,.svg" multiple class="hidden">
                <button type="button" id="btn-open-library" class="btn btn-secondary hud-icon-btn" title="Image Library">
                    <span class="hud-icon">🗂️</span>
                    <span id="library-count-badge" class="hud-badge">0</span>
                </button>
                <button type="button" id="btn-open-token-library" class="btn btn-secondary hud-icon-btn" title="Token Library">
                    <span class="hud-icon">♟️</span>
                    <span id="token-library-count-badge" class="hud-badge">0</span>
                </button>
                <button type="button" id="btn-open-notes-library" class="btn btn-secondary hud-icon-btn" title="GM Notes">
                    <span class="hud-icon">📝</span>
                </button>
                <button type="button" id="btn-open-music-library" class="btn btn-secondary hud-icon-btn" title="Music &amp; Playlists">
                    <span class="hud-icon">🎵</span>
                    <span id="playlist-count-badge" class="hud-badge">0</span>
                </button>
                <button type="button" id="btn-open-pdf-library" class="btn btn-secondary hud-icon-btn" title="PDF Library">
                    <span class="hud-icon">📖</span>
                    <span id="pdf-count-badge" class="hud-badge">0</span>
                </button>
                <button type="button" id="btn-open-grid-settings" class="btn btn-secondary hud-icon-btn" title="Map &amp; Grid Settings">
                    <span class="hud-icon">🗺️</span>
                </button>
                <button type="button" id="btn-toggle-openrolls" class="btn btn-secondary hud-icon-btn" title="GM Rolls: HIDDEN (Click to toggle)">
                    <span class="hud-icon">🔒</span>
                </button>
                <button type="button" id="btn-open-player-tab" class="btn btn-secondary hud-icon-btn" title="Open Player View (New Tab)">
                    <span class="hud-icon">🖥️</span>
                </button>
            </div>

            <!-- GM Game Image Library Modal -->
            <div id="modal-image-library" class="modal-backdrop hidden">
                <div class="modal-card library-modal-card">
                    <div class="modal-header">
                        <h3>🗂️ Game Image Library</h3>
                        <button type="button" id="btn-close-library" class="btn btn-secondary btn-sm">✕</button>
                    </div>
                    <div class="library-upload-bar">
                        <span style="font-size: 0.85rem; color: var(--text-muted);">Drag any image onto the map to place it, or drop image files from your computer to upload.</span>
                        <button type="button" id="btn-upload-image" class="btn btn-primary btn-sm" style="flex-shrink: 0;">
                            + Upload Image(s)
                        </button>
                    </div>
                    <div class="library-dropzone-cue">📥 Drop image files anywhere here to upload</div>
                    <div class="library-search-bar">
                        <input type="text" id="image-library-search" class="form-control form-control-sm" placeholder="🔍 Search images by title...">
                    </div>
                    <div id="library-images-grid" class="library-grid"></div>
                </div>
            </div>

            <!-- GM Game Token Library Modal -->
            <div id="modal-token-library" class="modal-backdrop hidden">
                <div class="modal-card library-modal-card">
                    <div class="modal-header">
                        <h3>♟️ Game Token Library</h3>
                        <button type="button" id="btn-close-token-library" class="btn btn-secondary btn-sm">✕</button>
                    </div>
                    <div class="library-upload-bar token-upload-bar">
                        <div>
                            <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-main);">Circular Grid Tokens (1:1 Square Image Required)</div>
                            <div style="font-size: 0.76rem; color: var(--text-muted);">Default tokens courtesy of <a href="https://www.tt-rpg.app/en/tokens" target="_blank" rel="noopener noreferrer" style="color: var(--accent-gold); text-decoration: underline;">TT-RPG.APP</a>. Hover a token to see its name. Drag onto map or right-click for options. Drop square images here to upload.</div>
                        </div>
                        <div class="token-bar-controls">
                            <button type="button" id="btn-upload-token" class="btn btn-primary btn-sm" style="flex-shrink: 0;">
                                + Upload Square Token(s)
                            </button>
                        </div>
                    </div>
                    <div class="library-dropzone-cue">📥 Drop square token images anywhere here to upload</div>
                    <div class="library-search-bar">
                        <input type="text" id="token-library-search" class="form-control form-control-sm" placeholder="🔍 Search tokens by title...">
                    </div>
                    <div id="library-tokens-grid" class="library-grid token-library-grid"></div>
                </div>
            </div>

            <!-- Combined GM Map Tab, Grid & Background Settings Modal -->
            <div id="modal-map-tab" class="modal-backdrop hidden">
                <div class="modal-card grid-settings-modal-card">
                    <div class="modal-header">
                        <h3 id="modal-map-tab-title">🗺️ Map Tab &amp; Grid Settings</h3>
                        <button type="button" id="btn-close-map-tab-modal" class="btn btn-secondary btn-sm">✕</button>
                    </div>
                    <form id="form-map-tab">
                        <input type="hidden" id="map-tab-id" value="">

                        <!-- Section 1: Tab Info & In-Game Distance Scale -->
                        <div class="grid-settings-section">
                            <label class="section-heading">Tab Details &amp; Game Scale</label>
                            <div class="form-row" style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; margin-bottom: 6px;">
                                <div class="form-group" style="margin-bottom: 0;">
                                    <label for="map-tab-name">Map Tab Name</label>
                                    <input type="text" id="map-tab-name" class="form-control" placeholder="e.g. Dungeon Level 1" required maxlength="60">
                                </div>
                                <div class="form-group" style="margin-bottom: 0;">
                                    <label for="map-tab-grid-size">Distance / Cell</label>
                                    <input type="number" id="map-tab-grid-size" class="form-control" min="0.5" max="1000" step="0.5" value="5" required>
                                </div>
                                <div class="form-group" style="margin-bottom: 0;">
                                    <label for="map-tab-grid-unit">Unit</label>
                                    <select id="map-tab-grid-unit" class="form-control">
                                        <option value="feet">Feet (ft)</option>
                                        <option value="yards">Yards (yd)</option>
                                        <option value="meters">Meters (m)</option>
                                    </select>
                                </div>
                            </div>
                            <small style="color: var(--text-muted); font-size: 0.75rem;">Defines the ruler distance represented by one grid square/hex.</small>
                        </div>

                        <!-- Section 2: Visual Grid Type & Rendering -->
                        <div class="grid-settings-section" style="margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-color);">
                            <label class="section-heading">Grid Type</label>
                            <div class="grid-type-selector">
                                <label class="grid-type-option">
                                    <input type="radio" name="grid_type_radio" value="square" checked>
                                    <span class="grid-type-card">
                                        <span class="grid-type-icon">⏹️</span>
                                        <span class="grid-type-title">Square</span>
                                        <span class="grid-type-desc">Standard square cells</span>
                                    </span>
                                </label>
                                <label class="grid-type-option">
                                    <input type="radio" name="grid_type_radio" value="hex_v">
                                    <span class="grid-type-card">
                                        <span class="grid-type-icon">⬢</span>
                                        <span class="grid-type-title">Hex (Vertical)</span>
                                        <span class="grid-type-desc">Pointy-topped columns</span>
                                    </span>
                                </label>
                                <label class="grid-type-option">
                                    <input type="radio" name="grid_type_radio" value="hex_h">
                                    <span class="grid-type-card">
                                        <span class="grid-type-icon">⬣</span>
                                        <span class="grid-type-title">Hex (Horizontal)</span>
                                        <span class="grid-type-desc">Flat-topped rows</span>
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 14px;">
                            <div class="form-group">
                                <label for="grid-cell-px-input">Grid Cell Size (Pixels)</label>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <input type="number" id="grid-cell-px-input" class="form-control" min="15" max="300" step="1" value="50" required style="width: 80px;">
                                    <input type="range" id="grid-cell-px-slider" min="15" max="300" step="1" value="50" style="flex: 1;">
                                </div>
                                <small style="color: var(--text-muted); font-size: 0.75rem;">Default: 50 pixels per grid cell</small>
                            </div>

                            <div class="form-group">
                                <label for="grid-color-picker">Grid Line Color &amp; Opacity</label>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <input type="color" id="grid-color-picker" value="#ffffff" style="width: 44px; height: 38px; padding: 2px; border-radius: var(--border-radius); border: 1px solid var(--border-color); cursor: pointer; background: transparent;">
                                    <input type="range" id="grid-opacity-slider" min="5" max="100" step="5" value="25" title="Grid Opacity" style="flex: 1;">
                                    <span id="grid-opacity-label" style="font-size: 0.8rem; width: 42px; text-align: right; color: var(--text-muted);">25%</span>
                                </div>
                                <small style="color: var(--text-muted); font-size: 0.75rem;">Line stroke color and transparency</small>
                            </div>
                        </div>

                        <div class="grid-settings-section" style="margin-top: 10px;">
                            <label class="section-heading">Grid Alignment Offsets (Pixels)</label>
                            <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                                <div class="form-group">
                                    <label for="grid-offset-x-input">Horizontal Offset (X)</label>
                                    <div style="display: flex; gap: 6px; align-items: center;">
                                        <input type="number" id="grid-offset-x-input" class="form-control" value="0" step="1">
                                        <span style="font-size: 0.8rem; color: var(--text-muted);">px</span>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label for="grid-offset-y-input">Vertical Offset (Y)</label>
                                    <div style="display: flex; gap: 6px; align-items: center;">
                                        <input type="number" id="grid-offset-y-input" class="form-control" value="0" step="1">
                                        <span style="font-size: 0.8rem; color: var(--text-muted);">px</span>
                                    </div>
                                </div>
                            </div>
                            <small style="color: var(--text-muted); font-size: 0.75rem;">Nudge the grid in pixels to match printed/drawn battlemaps.</small>
                        </div>

                        <!-- Section 3: Map Background Image -->
                        <div class="grid-settings-section map-bg-section" style="margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-color);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <label class="section-heading" style="margin-bottom: 0;">Map Background Image (Locked Layer)</label>
                                <span class="badge" style="background: rgba(46, 204, 113, 0.15); color: #2ecc71; border: 1px solid rgba(46, 204, 113, 0.3); font-size: 0.72rem;">1:1 Natural Scale (Unmovable)</span>
                            </div>
                            <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 10px;">
                                Set a battlemap image for this tab. Background maps sit permanently at the bottom layer, cannot be accidentally moved or resized, and display at their exact original 1:1 pixel size.
                            </p>
                            
                            <div id="grid-bg-current-container" class="grid-bg-current hidden" style="margin-bottom: 12px; display: flex; align-items: center; gap: 12px; background: rgba(0,0,0,0.25); padding: 8px 12px; border-radius: var(--border-radius); border: 1px solid var(--border-color);">
                                <img id="grid-bg-thumb" src="" alt="Background Thumbnail" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border-color);">
                                <div style="flex: 1; min-width: 0;">
                                    <div id="grid-bg-name" style="font-size: 0.85rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-main);">map.jpg</div>
                                    <div id="grid-bg-dim" style="font-size: 0.75rem; color: var(--text-muted);">1920 × 1080 px</div>
                                </div>
                                <button type="button" id="btn-remove-grid-bg" class="btn btn-danger btn-sm">Remove Background</button>
                            </div>

                            <!-- Drag & Drop Zone + Pick from Library / Upload from Disk -->
                            <div id="grid-bg-dropzone" class="map-bg-dropzone">
                                <div class="map-bg-dropzone-inner">
                                    <span style="font-size: 1.6rem; line-height: 1;">📥</span>
                                    <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-main);">Drag &amp; drop battlemap file here</span>
                                    <span style="font-size: 0.74rem; color: var(--text-muted); margin-bottom: 6px;">or select using the buttons below</span>
                                    <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
                                        <button type="button" id="btn-choose-grid-bg" class="btn btn-secondary btn-sm">
                                            📁 Choose From Disk...
                                        </button>
                                        <button type="button" id="btn-pick-library-bg" class="btn btn-primary btn-sm">
                                            🗂️ Pick from Image Library...
                                        </button>
                                    </div>
                                </div>
                                <input type="file" id="grid-bg-file-input" accept=".png,.jpg,.jpeg,.gif,.webp,.svg" class="hidden">
                                <input type="hidden" id="grid-bg-library-selected" value="">
                            </div>
                            <div id="grid-bg-chosen-name" style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; margin-top: 6px;">No new file chosen</div>

                            <!-- Library Picker Drawer -->
                            <div id="grid-bg-library-picker" class="grid-bg-library-picker hidden">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border-color);">
                                    <span style="font-size: 0.82rem; font-weight: 600; color: var(--accent-gold);">Click an image to set as background:</span>
                                    <button type="button" id="btn-close-bg-library-picker" class="btn btn-secondary btn-xs">✕ Close</button>
                                </div>
                                <div id="grid-bg-library-items" class="grid-bg-library-items"></div>
                            </div>
                        </div>

                        <div class="modal-footer" style="margin-top: 18px; display: flex; justify-content: flex-end; gap: 10px;">
                            <button type="button" id="btn-cancel-map-tab" class="btn btn-secondary">Cancel</button>
                            <button type="submit" id="btn-save-map-tab" class="btn btn-primary">Save Map Tab</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- GM Notes Library Modal -->
            <div id="modal-notes-library" class="modal-backdrop hidden">
                <div class="modal-card notes-modal-card">
                    <div class="modal-header">
                        <h3>📝 GM Notes Library</h3>
                        <button type="button" id="btn-close-notes-modal" class="btn btn-secondary btn-sm">✕</button>
                    </div>
                    <div class="notes-container">
                        <!-- Sidebar: Notes List & Search -->
                        <div class="notes-sidebar">
                            <div class="notes-sidebar-header">
                                <input type="text" id="notes-search-input" class="form-control form-control-sm" placeholder="🔍 Search notes...">
                                <button type="button" id="btn-new-note" class="btn btn-primary btn-sm">+ New Note</button>
                            </div>
                            <div id="notes-list" class="notes-list">
                                <!-- Populated dynamically by JS -->
                            </div>
                        </div>

                        <!-- Main Area: Note Editor -->
                        <div class="notes-editor-pane">
                            <div id="notes-editor-empty" class="notes-editor-empty">
                                <div style="font-size: 2.2rem; opacity: 0.4;">📝</div>
                                <p style="color: var(--text-muted); margin-top: 8px;">Select a note from the left or create a new note.</p>
                            </div>
                            <form id="form-note-editor" class="notes-editor-form hidden">
                                <input type="hidden" id="note-id" value="0">
                                <div class="notes-editor-topbar">
                                    <input type="text" id="note-title-input" class="form-control notes-title-input" placeholder="Note Title..." required maxlength="120">
                                    <div class="notes-editor-actions">
                                        <button type="button" id="btn-delete-note" class="btn btn-danger btn-sm" title="Delete Note">🗑️ Delete</button>
                                        <button type="submit" id="btn-save-note" class="btn btn-primary btn-sm">💾 Save Note</button>
                                    </div>
                                </div>
                                <div class="notes-editor-body">
                                    <textarea id="note-content-input" class="form-control notes-content-textarea" placeholder="Write your GM notes, encounter plans, NPC stats, lore secrets, quest steps here..."></textarea>
                                </div>
                                <div class="notes-editor-footer">
                                    <span id="note-status-info" style="font-size: 0.75rem; color: var(--text-muted);">Unsaved changes</span>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            <!-- GM Music & Playlists Library Modal -->
            <div id="modal-music-library" class="modal-backdrop hidden">
                <div class="modal-card music-modal-card">
                    <div class="modal-header">
                        <h3>🎵 Music &amp; Playlists Library</h3>
                        <button type="button" id="btn-close-music-modal" class="btn btn-secondary btn-sm">✕</button>
                    </div>
                    <div class="music-container">
                        <!-- Sidebar: Playlist List & Creation -->
                        <div class="music-sidebar">
                            <div class="music-sidebar-header">
                                <input type="text" id="playlist-search-input" class="form-control form-control-sm" placeholder="🔍 Search playlists...">
                                <button type="button" id="btn-new-playlist" class="btn btn-primary btn-sm">+ New Playlist</button>
                            </div>
                            <div id="playlists-list" class="playlists-list">
                                <!-- Populated dynamically by JS -->
                            </div>
                        </div>

                        <!-- Main Area: Playlist Detail & Track Management -->
                        <div class="music-detail-pane">
                            <div id="music-empty-state" class="music-empty-state">
                                <div style="font-size: 2.4rem; opacity: 0.4;">🎵</div>
                                <p style="color: var(--text-muted); margin-top: 8px;">Select a playlist from the left or create a new playlist.</p>
                            </div>
                            <div id="music-playlist-content" class="music-playlist-content hidden">
                                <!-- Playlist Top Bar: Name editing, Play Playlist button, Delete Playlist button -->
                                <div class="music-playlist-topbar">
                                    <div class="music-title-group">
                                        <input type="text" id="playlist-name-input" class="form-control music-name-input" placeholder="Playlist Name..." required maxlength="80">
                                        <button type="button" id="btn-save-playlist-name" class="btn btn-secondary btn-sm" title="Rename Playlist">Rename</button>
                                    </div>
                                    <div class="music-playlist-actions">
                                        <button type="button" id="btn-play-entire-playlist" class="btn btn-success btn-sm" title="Start playing this playlist from the first track">▶ Play Playlist</button>
                                        <button type="button" id="btn-delete-playlist" class="btn btn-danger btn-sm" title="Delete Playlist">🗑️ Delete</button>
                                    </div>
                                </div>

                                <!-- Add Track Section -->
                                <div class="music-add-track-section">
                                    <div style="font-size: 0.85rem; font-weight: 600; color: var(--accent-gold); margin-bottom: 6px;">Add Track to Playlist</div>
                                    <form id="form-add-track" class="music-add-track-form">
                                        <input type="text" id="track-title-input" class="form-control form-control-sm" placeholder="Track Title (optional, e.g. Tavern Ambience)...">
                                        <input type="url" id="track-url-input" class="form-control form-control-sm" placeholder="Music Link: YouTube (youtube.com / youtu.be) or Web Audio (.mp3, .ogg, .wav)..." required>
                                        <button type="submit" id="btn-add-track" class="btn btn-primary btn-sm" style="flex-shrink: 0;">+ Add Track</button>
                                    </form>
                                    <div class="music-url-hint">
                                        💡 Supports YouTube links (youtube.com, youtu.be) and direct links to web audio files (MP3, WAV, OGG, AAC).
                                    </div>
                                </div>

                                <!-- Track List Section -->
                                <div class="music-tracks-container">
                                    <div class="music-tracks-header">
                                        <span style="font-weight: 600; font-size: 0.85rem; color: var(--text-muted);">Tracks (<span id="current-playlist-track-count">0</span>)</span>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <span style="font-size: 0.75rem; color: var(--text-muted);">Click any track to play it for everyone</span>
                                            <button type="button" id="btn-modal-repeat-toggle" class="btn btn-secondary btn-xs" title="Toggle Repeat Mode">🔁 Repeat: Playlist</button>
                                        </div>
                                    </div>
                                    <div id="playlist-tracks-list" class="playlist-tracks-list">
                                        <!-- Populated dynamically with track items -->
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Game PDF Library Modal -->
            <div id="modal-pdf-library" class="modal-backdrop hidden">
                <div class="modal-card pdf-library-modal-card">
                    <div class="modal-header">
                        <h3>📖 Game PDF Library</h3>
                        <button type="button" id="btn-close-pdf-library" class="btn btn-secondary btn-sm">✕</button>
                    </div>

                    <!-- GM-Only Upload Bar -->
                    <div id="pdf-upload-bar" class="library-upload-bar gm-only-control hidden">
                        <span style="font-size: 0.85rem; color: var(--text-muted);">
                            Upload rulebooks, adventures, character sheets, and handouts in PDF format.
                        </span>
                        <input type="file" id="pdf-file-input" accept=".pdf" multiple class="hidden">
                        <button type="button" id="btn-upload-pdf" class="btn btn-primary btn-sm" style="flex-shrink: 0;">
                            + Upload PDF(s)
                        </button>
                    </div>
                    <div id="pdf-dropzone-cue" class="library-dropzone-cue gm-only-control hidden">📥 Drop PDF files anywhere here to upload</div>

                    <!-- Player Info Bar (shown to non-GM players) -->
                    <div id="pdf-player-info-bar" class="pdf-player-info-bar player-only-control hidden">
                        <span>📖 Campaign rulebooks, handouts, and character sheets shared by the Game Master.</span>
                    </div>

                    <div class="library-search-bar">
                        <input type="text" id="pdf-library-search" class="form-control form-control-sm" placeholder="🔍 Search PDFs by title...">
                    </div>

                    <!-- PDF Cards Grid/List -->
                    <div id="pdf-library-grid" class="pdf-library-grid">
                        <!-- Populated dynamically by JS -->
                    </div>
                </div>
            </div>

            <!-- Embedded PDF Reader Floating Window (Opens above the main map area) -->
            <div id="modal-pdf-viewer" class="modal-backdrop pdf-viewer-backdrop hidden">
                <div class="modal-card pdf-viewer-card" id="pdf-viewer-card">
                    <div class="modal-header pdf-viewer-header">
                        <div class="pdf-viewer-title-group">
                            <span class="pdf-viewer-icon">📖</span>
                            <h3 id="pdf-viewer-title" class="pdf-viewer-title">Document.pdf</h3>
                        </div>
                        <div class="pdf-viewer-actions">
                            <a id="btn-pdf-new-tab" href="#" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" title="Open in new browser tab / Pop out">
                                ↗
                            </a>
                            <button type="button" id="btn-pdf-maximize" class="btn btn-secondary btn-sm" title="Toggle Fullscreen">
                                ⛶
                            </button>
                            <button type="button" id="btn-close-pdf-viewer" class="btn btn-secondary btn-sm" title="Close Reader">
                                ✕
                            </button>
                        </div>
                    </div>
                    <div class="pdf-viewer-body">
                        <iframe id="pdf-viewer-frame" src="" class="pdf-viewer-frame" title="Embedded PDF Viewer"></iframe>
                    </div>
                </div>
            </div>

            <!-- Left/Center Map Column (Map Tabs Bar + Large Open Tabletop Area) -->
            <div class="tabletop-column">
                <div id="vtt-map-tabs-bar" class="map-tabs-bar">
                    <div id="map-tabs-list" class="map-tabs-list"></div>
                    <button type="button" id="btn-add-map-tab" class="btn btn-secondary btn-sm hidden" style="flex-shrink: 0;">
                        + Add Map Tab
                    </button>
                </div>

                <!-- Large Open Tabletop Area (Maps, Handouts & 3D Dice Rolling) -->
                <div id="tabletop-scroll-area" class="tabletop-area">
                    <div id="tabletop-plane" class="tabletop-canvas-plane">
                        <div id="tabletop-map-background" class="tabletop-map-background hidden"></div>
                        <svg id="tabletop-grid-svg" class="tabletop-grid-svg"></svg>
                        <svg id="tabletop-ruler-svg" class="tabletop-ruler-svg"></svg>
                        <div id="tabletop-grid-overlay" class="tabletop-grid-overlay" style="display:none;"></div>
                    </div>
                </div>

                <!-- Left Toolbar on the Map Area -->
                <div id="tabletop-toolbar" class="tabletop-toolbar">
                    <button type="button" id="btn-tool-pointer" class="tabletop-tool-btn active" title="Pointer Tool (V) — Select &amp; move tokens and maps">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                            <path d="M4 2l12 12h-6l4 8-3 1.5-4-8-3 3V2z"/>
                        </svg>
                        <span class="tool-label">Pointer</span>
                    </button>
                    <button type="button" id="btn-tool-pan" class="tabletop-tool-btn" title="Hand Tool (H / Space) — Pan &amp; move the viewport">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 11V6a2 2 0 0 0-4 0v4m-4-6a2 2 0 0 0-4 0v6m-4-2a2 2 0 0 0-4 0v6a8 8 0 0 0 16 0v-5a2 2 0 0 0-4 0"/>
                        </svg>
                        <span class="tool-label">Hand</span>
                    </button>
                    <button type="button" id="btn-tool-ruler" class="tabletop-tool-btn" title="Ruler Tool (R) — Measure distance in map scale">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21.3 8.7l-6-6a2 2 0 0 0-2.8 0L2.7 12.5a2 2 0 0 0 0 2.8l6 6a2 2 0 0 0 2.8 0L21.3 11.5a2 2 0 0 0 0-2.8z"/>
                            <path d="M14.5 5.5l-2 2"/>
                            <path d="M11.5 8.5l-3 3"/>
                            <path d="M8.5 11.5l-2 2"/>
                        </svg>
                        <span class="tool-label">Ruler</span>
                    </button>
                </div>
            </div>

            <!-- Grid Scale Badge (Bottom-Left of Map Area) -->
            <div id="grid-scale-indicator" class="grid-scale-badge">Grid: 5 feet</div>

            <!-- Zoom Slider on the Right Side of the Large Map Area -->
            <div class="tabletop-zoom-control" title="Zoom Tabletop View">
                <button type="button" id="btn-zoom-in" class="zoom-step-btn" title="Zoom In">+</button>
                <div class="zoom-slider-wrap">
                    <input type="range" id="tabletop-zoom-slider" min="25" max="200" step="5" value="100">
                </div>
                <button type="button" id="btn-zoom-out" class="zoom-step-btn" title="Zoom Out">&minus;</button>
                <button type="button" id="btn-zoom-reset" class="zoom-label-btn" title="Click to reset zoom to 100%">100%</button>
            </div>

            <!-- 3D Modelled Dice Overlay Canvas -->
            <div class="dice-overlay-container">
                <canvas id="dice3d-canvas"></canvas>
            </div>

            <!-- Right Chat Sidebar -->
            <aside class="chat-sidebar">
                <div class="chat-header">
                    <div class="chat-header-top">
                        <h3>Session Chat &amp; Rolls</h3>
                    </div>
                    <div id="chat-participants" class="participants-bar"></div>
                </div>

                <div id="chat-messages" class="chat-messages"></div>

                <!-- Quick 3D Dice Roll Bar (Organized 5x2 Grid, No Scrollbar) -->
                <div class="quick-dice-bar">
                    <button type="button" class="quick-die-btn" data-quick-roll="1d4">d4</button>
                    <button type="button" class="quick-die-btn" data-quick-roll="1d6">d6</button>
                    <button type="button" class="quick-die-btn" data-quick-roll="2d6">2d6</button>
                    <button type="button" class="quick-die-btn" data-quick-roll="1d8">d8</button>
                    <button type="button" class="quick-die-btn" data-quick-roll="1d10">d10</button>
                    <button type="button" class="quick-die-btn" data-quick-roll="1d12">d12</button>
                    <button type="button" class="quick-die-btn" data-quick-roll="1d20">d20</button>
                    <button type="button" class="quick-die-btn" data-quick-roll="2d20kh1" title="Roll 2d20 Keep Highest 1">2d20kh1</button>
                    <button type="button" class="quick-die-btn" data-quick-roll="1d100">d100</button>
                    <button type="button" class="quick-die-btn" data-quick-roll="4dF">4dF</button>
                </div>

                <div class="chat-input-area">
                    <form id="form-chat" class="chat-form">
                        <input
                            type="text"
                            id="chat-input"
                            class="form-control"
                            placeholder="Type a message or /r command..."
                            autocomplete="off"
                        >
                        <button type="submit" class="btn btn-primary">Send</button>
                    </form>
                </div>
            </aside>
        </div>
    </section>

    <!-- =========================================================
         5. USER MANUAL WINDOW (ACCESSIBLE TO BOTH GMS & PLAYERS)
         ========================================================= -->
    <div id="modal-manual" class="modal-backdrop hidden">
        <div class="modal-card manual-modal-card">
            <div class="modal-header">
                <h3>📖 Stargazer's World VTT — User Manual</h3>
                <button type="button" id="btn-close-manual" class="btn btn-secondary btn-sm">✕</button>
            </div>
            <div class="manual-body">
                <section class="manual-section">
                    <h4>🎲 3D Dice Rolling (<code>/r</code> or <code>/roll</code>)</h4>
                    <p>Type <code>/r</code> or <code>/roll</code> followed by a dice expression in chat, or use the quick-roll buttons above the chat box. 3D polyhedral dice roll across the tabletop while the detailed breakdown appears in chat.</p>
                    <ul class="manual-list">
                        <li><strong>Standard Dice &amp; Modifiers:</strong> <code>/r 2d6</code>, <code>/roll 3d10</code>, <code>/r d6+4</code>, <code>/r 1d20-2</code>, <code>/r 2d8+1d6+3</code>, <code>/r 1d100</code></li>
                        <li><strong>Fudge / Fate Dice:</strong> <code>/r 4dF</code>, <code>/r 4dF+2</code> (rolls <code>+</code>, <code>−</code>, and <code>0</code>)</li>
                        <li><strong>Keep Highest / Lowest:</strong> <code>/r 2d20kh1+5</code> (keep highest 1), <code>/r 2d20kl1</code> (keep lowest 1), <code>/r 4d6kh3</code></li>
                        <li><strong>Counting Successes (Dice Pools):</strong> Use <code>&gt;=</code>, <code>&gt;</code>, <code>&lt;=</code>, <code>&lt;</code>, or <code>=</code> after a dice pool to count how many dice meet the target number:
                            <code>/r 8d10&gt;=6</code>, <code>/r 6d6&gt;=5</code>, <code>/r 5d10&gt;7</code>, <code>/r 3d6&lt;=3</code>, <code>/r 4d6=6</code></li>
                        <li><strong>Roll Labels:</strong> Add an optional label after a space or <code>#</code>, e.g. <code>/r 1d20+6 Perception</code></li>
                    </ul>
                </section>

                <section class="manual-section">
                    <h4>💬 Chat &amp; Whispers (<code>/w</code>)</h4>
                    <ul class="manual-list">
                        <li><strong>Public Chat:</strong> Enter any regular text message to send it to everyone in the session.</li>
                        <li><strong>Private Whispers:</strong> Type <code>/w {username} {message}</code> (or <code>/w "{username}" {message}</code>) to whisper privately to a specific user. You can also click any user's name pill at the top of the chat sidebar to prefill a whisper to them.</li>
                    </ul>
                </section>

                <section class="manual-section">
                    <h4>🗺️ Tabletop Navigation &amp; Player View</h4>
                    <ul class="manual-list">
                        <li><strong>Zoom Slider:</strong> Use the vertical slider on the right side of the map area (or the <code>+</code> / <code>−</code> buttons) to zoom between <code>25%</code> and <code>200%</code>. The map grid scales automatically with the zoom level. Click the percentage badge to reset zoom to <code>100%</code>.</li>
                        <li><strong>Maximized Map (Hide UI / Show UI):</strong> In Player View, click <strong>⛶ Hide UI</strong> in the top bar to maximize the map and hide all panels except the zoom slider. Move your mouse or touch any of the <strong>four screen corners</strong> to reveal the <strong>⛶ Show UI</strong> button.</li>
                    </ul>
                </section>

                <section class="manual-section">
                    <h4>🎵 Music &amp; Playlists (Synchronized GM &amp; Player Audio)</h4>
                    <p>The Game Master can create thematic playlists containing links to music on the web (such as MP3, WAV, OGG) or YouTube links. Playback is synchronized in real time across all players in the session.</p>
                    <ul class="manual-list">
                        <li><strong>Creating Playlists:</strong> Click <strong>🎵 Music</strong> on the GM toolbar to open the Music &amp; Playlists Library. Click <strong>+ New Playlist</strong>, give it a name, and add music tracks using YouTube URLs or web audio links (.mp3, etc.).</li>
                        <li><strong>Synchronized Playback:</strong> When the GM plays any track (or clicks <strong>Play Playlist</strong>), the music starts playing simultaneously for all connected players.</li>
                        <li><strong>GM Playback Controls:</strong> The GM can play/pause (<code>▶</code> / <code>⏸️</code>), jump to the next track (<code>⏭️</code>), return to the previous track (<code>⏮️</code>), or jump directly to any track in the playlist library.</li>
                        <li><strong>Repeat Modes:</strong> Click the repeat button to toggle between <strong>🔁 Repeat Playlist</strong> (loops the entire playlist), <strong>🔂 Repeat Track</strong> (loops the active track), and <strong>➡️ No Repeat</strong> (stops at the end).</li>
                        <li><strong>Local GM Muting:</strong> If the GM mutes their music or adjusts their volume slider, it only affects their own speakers — the music continues playing for all players!</li>
                        <li><strong>Player Controls:</strong> Players have their own volume slider and a <strong>Disable Music</strong> toggle to adjust volume or turn off music entirely without affecting anyone else.</li>
                    </ul>
                </section>

                <section class="manual-section">
                    <h4>👑 Campaign Ownership, GM Guide &amp; Admin</h4>
                    <ul class="manual-list">
                        <li><strong>Campaign Creation &amp; Ownership (GM):</strong> Every registered user can create campaigns in the Lobby (including a title, description, cover image, and invited players). The creator of a campaign is its initial <strong>Owner</strong>, and the <strong>Owner of a campaign is always its Game Master (GM)</strong>. Ownership can be transferred to another player at any time from the Lobby via <strong>✏️ Edit / Ownership</strong>.</li>
                        <li><strong>Hidden vs. Open GM Rolls (<code>/openrolls</code>):</strong> GM dice rolls are hidden from players by default (visible only to the GM). Type <code>/openrolls</code> in chat (or click the <strong>GM Rolls</strong> button in the GM toolbar) to toggle public GM rolls on or off.</li>
                        <li><strong>Image Library &amp; Player Visibility:</strong> Click <strong>🗂️ Image Library</strong> to upload one or multiple maps and handouts at once to the campaign's library. Drag any image directly onto the map (or click <strong>Open on This Map</strong>) to place it onto the active map tab. Newly placed images start <strong>hidden from players</strong> (shown greyed out to the GM). Click the button in the <strong>upper-right corner</strong> of any image on the board to toggle visibility to players.</li>
                        <li><strong>Moving &amp; Resizing Images:</strong> Drag any image on the tabletop to reposition it. Drag the bottom-right corner handle to resize it; hold <strong><code>Shift</code></strong> while resizing to lock the image's original aspect ratio. Click <code>✕</code> on an image to remove it from the tabletop back to the library.</li>
                        <li><strong>Token Library, Circular Grid Tokens &amp; Player Movement:</strong> Click <strong>♟️ Token Library</strong> to browse built-in tokens or bulk-upload square (<code>1:1</code>) token images (hover over any token in the library to view its name). Drag any token from the library onto the map to place it. Tokens appear on the map as <strong>circular tokens</strong>, are <strong>always visible</strong>, render <strong>above all map/handout images</strong> (and below 3D dice), snap directly to the grid, and can be resized (<code>1x</code>, <code>2x</code>, <code>3x</code>, etc.) or assigned player movement permissions directly on the map.</li>
                        <li><strong>Map Tabs, Secret Editing &amp; Active Player Circle:</strong> Click <strong>+ Add Map Tab</strong> to create additional map tabs (each with its own name and configurable grid size in <strong>feet</strong>, <strong>yards</strong>, or <strong>meters</strong>). Clicking a tab switches your GM view so you can prepare and edit maps in secrecy without moving the players. Click the <strong>circle indicator</strong> on a tab (turning it into a <strong>green circle</strong>) to set that tab as <strong>ACTIVE</strong> for all players.</li>
                        <li><strong>Player View Preview Tab:</strong> Click <strong>🖥️ Open Player View (New Tab)</strong> to open a live Player View of the current game in a second browser tab without leaving GM mode in your main tab.</li>
                        <li><strong>Admin Account Rights:</strong> Administrators can grant <strong>Admin Rights</strong> to other accounts from the Lobby.</li>
                    </ul>
                </section>

                <section class="manual-section">
                    <h4>🙏 Credits &amp; Attributions</h4>
                    <ul class="manual-list">
                        <li><strong>Token Artwork:</strong> Built-in token collection courtesy of <a href="https://www.tt-rpg.app/en/tokens" target="_blank" rel="noopener noreferrer" style="color: var(--accent-gold); text-decoration: underline;">TT-RPG.APP</a> (<a href="https://www.tt-rpg.app/en/tokens" target="_blank" rel="noopener noreferrer" style="color: var(--accent-gold);">https://www.tt-rpg.app/en/tokens</a>).</li>
                        <li><strong>Logo &amp; Brand Artwork:</strong> Stargazer Games (<a href="https://stargazergames.eu" target="_blank" rel="noopener noreferrer" style="color: var(--accent-gold);">stargazergames.eu</a>).</li>
                    </ul>
                </section>
            </div>
        </div>
    </div>

    <!-- GM Right-Click Token Context Menu -->
    <div id="token-context-menu" class="token-context-menu hidden"></div>

    <!-- Custom Styled Permission / Confirmation Dialog Modal -->
    <div id="modal-confirm" class="modal-backdrop modal-dialog-backdrop hidden">
        <div class="modal-card confirm-modal-card">
            <div class="modal-header">
                <h3 id="confirm-modal-title">⚠️ Confirmation Required</h3>
                <button type="button" id="btn-confirm-close" class="btn btn-secondary btn-sm" aria-label="Close">✕</button>
            </div>
            <div class="confirm-modal-body">
                <div id="confirm-modal-icon" class="confirm-modal-icon">⚠️</div>
                <div class="confirm-modal-content">
                    <div id="confirm-modal-message" class="confirm-modal-message"></div>
                    <div id="confirm-modal-detail" class="confirm-modal-detail hidden"></div>
                </div>
            </div>
            <div class="confirm-modal-footer">
                <button type="button" id="btn-confirm-cancel" class="btn btn-secondary">Cancel</button>
                <button type="button" id="btn-confirm-ok" class="btn btn-danger">Confirm</button>
            </div>
        </div>
    </div>

    <!-- Hidden Background Audio Player & YouTube API Container -->
    <audio id="vtt-audio-player" preload="auto" class="hidden"></audio>
    <div id="vtt-youtube-wrapper" class="vtt-youtube-wrapper">
        <iframe id="vtt-youtube-player"
            src="https://www.youtube.com/embed/?enablejsapi=1&playsinline=1&controls=0&rel=0&modestbranding=1"
            allow="autoplay; encrypted-media"
            allowfullscreen
            frameborder="0"
            width="200"
            height="120">
        </iframe>
    </div>

    <script src="https://www.youtube.com/iframe_api"></script>
    <script src="assets/js/dice3d.js"></script>
    <script src="assets/js/app.js"></script>
</body>
</html>
