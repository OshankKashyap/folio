# Folio

A local-first database workspace built with Tauri 2, Svelte 5, SvelteKit, TypeScript, and SQLite. The interface follows the supplied Folio design handoff.

## Features

- First-launch setup for a workspace name and accent color (presets or a custom color)
- Empty workspace with first and additional database creation; no sample records
- Per-database default, emoji, or uploaded PNG/JPEG/WebP icons chosen at creation time
- Retractable sidebar with workspace identity
- Table, status board, and list layouts over the same records
- Per-database saved views with persistent layout, In progress filter, alphabetical sort, compact rows, and owner visibility
- Create, edit, and delete records with name, status, priority, due date, and owner
- Persistent manual row order using drag handles, move buttons, or Up/Down keys while a handle is focused; turn sorting off before reordering
- Responsive layout, keyboard focus states, and recoverable save errors

Settings → System offers “Minimize to tray when closed” (off by default); the tray restores Folio or quits it completely.
GNOME requires the AppIndicator extension to show tray icons; keep this setting off unless that extension is installed.

Settings → System also offers “Start minimized in tray on login” (off by default). When on, Folio registers
with the OS to launch hidden in the tray at login. This setting is disabled in development builds.

## Prerequisites

- Node.js 22.12+ (or a newer supported LTS) and npm
- Rust stable via rustup
- [Tauri platform prerequisites](https://tauri.app/start/prerequisites/)
- Linux icon uploads require XDG Desktop Portal and a FileChooser backend for your desktop (such as `xdg-desktop-portal-kde` on KDE).

On Debian/Ubuntu, the Linux prerequisites can be installed with:

```sh
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev
```

## Development

```sh
npm install
npm run tauri dev
```

The workspace requires the Tauri desktop runtime. `npm run dev` serves the frontend for development, but a regular browser does not have access to SQLite and displays a desktop-app notice. There is no browser-storage fallback or remote backend. Icons are bundled locally; no CDN or network connection is required by the workspace.

## Local storage

Rust owns the SQLite connection and exposes specific Tauri commands; the frontend cannot execute arbitrary SQL. Blocking database work runs off the UI thread. Foreign keys, validated properties, versioned migrations, WAL journaling, and transactional row reordering protect the workspace data.

Dev runs keep `folio.sqlite3` in Tauri’s application data directory; installed builds use `~/.folio/folio.sqlite3`. On Linux the dev default is:

```text
~/.local/share/com.oshank.notionalternative/folio.sqlite3
```

`XDG_DATA_HOME` overrides the Linux base directory for dev runs only. Each sidebar database is a logical collection in this single SQLite file. On first launch, choose a workspace name and accent color, then create your first empty database. Setup and accent choices persist in SQLite; later launches go straight to the workspace. Dates are stored as nullable ISO dates (`YYYY-MM-DD`); timestamps use UTC.

**Upgrade reset:** schema version 2 intentionally clears all existing databases, saved views, and records from the pre-onboarding app once. The next launch shows setup. This is not repeated after setup. Back up the old database before running this version if you want to retain a copy.

To back up the workspace, close Folio first, then copy the database file. Data is local but not encrypted; device access controls still apply.

Custom properties, database management beyond creation (including editing existing icons), saved-view creation/deletion, advanced filters, board drag-and-drop, sync, authentication, and import/export are not included in this first implementation.

## Checks and builds

```sh
npm run check
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri build
```

`npm run build` builds only the frontend; `npm run tauri build` builds the desktop app and platform bundles.

Frontend tests exercise database/view switching, view settings, ordering controls, record editing/deletion, and save errors with a mocked Tauri boundary. Rust tests exercise real SQLite, including migrations, CRUD validation, database isolation, ordering, foreign-key cascades, and persistence after reopening a file.

## Project structure

- `src/routes/`: SvelteKit pages and layouts
- `src/lib/components/`: workspace, record editor, and shared status badges
- `src/lib/api.ts`: typed Tauri command boundary
- `static/`: frontend static assets
- `src-tauri/src/`: Rust commands and application entry points
- `src-tauri/src/db.rs`: SQLite queries and validation
- `src-tauri/migrations/`: versioned SQLite schema and first-launch seed data
- `src-tauri/tauri.conf.json`: app identity, window, build, and bundle settings
- `src-tauri/capabilities/`: Tauri permission configuration
