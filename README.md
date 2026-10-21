# Stargazer's World VTT 🎲✨

**Stargazer's World VTT** is a modern, lightweight, self-hosted Virtual Tabletop (VTT) built for running tabletop roleplaying games (D&D, Pathfinder, Call of Cthulhu, OSR, and indie RPGs) smoothly in any modern web browser.

It requires no complex build tools or runtime environments—just standard PHP with SQLite.

---

## 🤖 Built with Antigravity

This project was engineered and coded by **Antigravity** (Google DeepMind's Advanced Agentic Coding assistant) in collaborative pair programming with **Michael Wolf** ([@PlanetStargazer](https://github.com/PlanetStargazer)).

---

## ✨ Features

### 🗺️ Multi-Tab Maps & Vector Grids
- **Multiple Map Tabs**: Switch seamlessly between tactical encounter maps, world maps, town handouts, and dungeons in the same campaign.
- **SVG Vector Grid System**: Clean, anti-aliased vector grid lines that scale smoothly at any zoom level without pixel distortion.
- **Multiple Grid Types**:
  - **Square Grid** (Standard D&D / d20 systems)
  - **Hexagonal Grid (Vertical / Pointy-topped)**
  - **Hexagonal Grid (Horizontal / Flat-topped)**
  - **Isometric Grid**
- **Per-Tab Grid Calibration**: Configure cell pixel size (e.g. 50px), grid line color, line opacity, in-game distance scale (e.g. 5 ft, 1.5 m, 2 yd), and horizontal/vertical pixel offsets for pre-gridded battlemaps.
- **Map Background Images**: Set high-resolution background maps per tab with automatic scaling and placement.

### ♟️ Circular Token System & Libraries
- **Token Library**: Organized token manager with collapsible categories:
  - **Built-in Tokens**: Curated library of 40+ fantasy character and creature tokens courtesy of [TT-RPG.APP](https://www.tt-rpg.app/en/tokens).
  - **Custom Tokens**: Upload custom square token images via file selector or drag-and-drop.
- **Image & Handout Library**: Manage battlemaps, scenery illustrations, and handouts with GM visibility toggling (hide/reveal to players).
- **Searchable Libraries**: Live search filtering in both token and image library modals.

### 🛠️ Interactive Tabletop Tools & Ruler
- **Toolbar**: Fixed bottom toolbar with quick keyboard shortcuts:
  - **Pointer Tool (`V`)**: Select, resize, and move tokens and images.
  - **Hand / Pan Tool (`H` or hold `Space`)**: Click and drag to smoothly pan the viewport across massive map planes.
  - **Ruler Tool (`R`)**: Click and drag between any two points to measure real-time distance in the map's configured scale (`feet`, `yards`, `meters`).
- **Token Movement Ruler**: When moving any token, a ruler automatically connects the center point of the starting grid tile to the destination tile as long as the mouse is pressed, displaying exact travel distance.

### 🎲 3D Physics Dice Rolling & Chat
- **3D Dice Overlay**: Fully animated 3D polyhedral dice (d4, d6, d8, d10, d12, d20, d100) rendered on a hardware-accelerated canvas.
- **Chat & Rolls**: Live session chat with dice roll parsing (`/roll 1d20+5`, `/gmroll`, `/whisper`), open rolls toggle, and participant list.

### 📝 GM Notes Library
- **Split-Pane Notes Manager**: Create, view, search, and edit secret GM campaign notes, session logs, and NPC stat blocks with persistent SQLite storage.

### 🖥️ Player View Mode
- **Dual Screen / TV Friendly**: Open a dedicated "Player View" in a second browser tab (or send to a tabletop TV / projector) with GM controls and secret handouts automatically hidden.

---

## 🚀 Getting Started

### Requirements
- **PHP 8.1+** with `pdo_sqlite` and `gd` extensions enabled.
- Any modern web browser (Chrome, Firefox, Safari, Edge).

### Installation & Launch

1. **Clone the repository:**
   ```bash
   git clone https://github.com/PlanetStargazer/stargazer-vtt.git
   cd stargazer-vtt
   ```

2. **Start the PHP built-in server:**
   ```bash
   php -S localhost:8000
   ```

3. **Open in your browser:**
   Navigate to:
   ```
   http://localhost:8000
   ```

4. **First-Launch Admin Setup**:
   On first launch, you will be prompted to create the Administrator account. Once created, you can create campaigns, invite players, upload maps, and start playing!

---

## 📁 Project Structure

```
├── assets/
│   ├── css/style.css       # Unified dark-theme styling & HUD components
│   ├── js/app.js           # Core VTT frontend application controller
│   ├── js/dice3d.js        # 3D canvas dice rolling physics engine
│   └── tokens/             # Built-in circular tokens (from TT-RPG.APP)
├── includes/
│   ├── DiceRoller.php      # Dice formula parser & evaluator
│   └── Storage.php         # SQLite database repository layer
├── index.php               # Single-page application entry point
├── api.php                 # RESTful backend API endpoints
├── data/                   # SQLite database (auto-generated, git-ignored)
└── uploads/                # User uploaded maps and tokens (git-ignored)
```

---

## 📜 Credits & Acknowledgments
- **Project Lead**: Michael Wolf ([@PlanetStargazer](https://github.com/PlanetStargazer))
- **Coding & Engineering**: Antigravity by Google DeepMind
- **Default Token Artwork**: Courtesy of [TT-RPG.APP](https://www.tt-rpg.app/en/tokens)

---

## ⚖️ License
This project is open-source and available under the [MIT License](LICENSE).
