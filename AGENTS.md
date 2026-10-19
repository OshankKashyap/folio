# AGENTS.md — Folio

Instructions for coding agents working in this repository. Read this file fully
before making any change.

## What this project is

Folio is a local-first database workspace: a Tauri 2 desktop app built with
Svelte 5, SvelteKit, TypeScript, and SQLite. Rust owns the SQLite connection
and exposes specific Tauri commands; the frontend never executes arbitrary SQL
and has no browser-storage fallback or remote backend. Read `README.md` for the
full feature list, project structure, and check commands.

## Prime directive: do no harm

The app currently works. Your job is to make the requested change with the
smallest possible, safest possible diff. **Redundancy over cleverness.**

- Make only the changes that were explicitly requested. If you notice an
  unrelated problem, report it in your summary — do not fix it silently.
- Do not refactor, restructure, rename, reformat, or "modernize" code that is
  not part of the requested change. Working code is not up for improvement.
- Do not rewrite files wholesale. Edit surgically. A request that touches one
  function should not produce a diff anywhere else.
- Do not change formatting, quotes, import order, or indentation in lines you
  are not already modifying.
- Do not upgrade, downgrade, add, or remove dependencies unless the task
  explicitly requires it. If a task seems to require it, say so first.
- Do not delete code "because it looks unused" — verify usage first, and if it
  is genuinely dead, mention it instead of removing it.
- Preserve existing behavior exactly, including edge cases, error states, and
  wording of user-facing strings. UI copy changes only when the task says so.
- When in doubt between two implementations, choose the one that changes less.

## Architecture rules (do not break these)

- The Tauri command boundary is the only path to SQLite. Do not add direct
  database access, new IPC channels, or a web fallback without being asked.
- `src/lib/api.ts` is the typed boundary. Keep its types in sync with the Rust
  command signatures whenever you touch either side.
- Rust owns migrations (`src-tauri/migrations/`). Never modify existing
  migrations — they are versioned and some intentionally reset data. Add a new
  versioned migration only if the task requires a schema change, and call it
  out explicitly.
- Keep blocking database work off the UI thread, and keep the existing
  guarantees intact: foreign keys, validated properties, WAL journaling, and
  transactional row reordering.
- Keep the app fully local. No network calls, no CDN assets, no telemetry, no
  analytics, no remote sync.
- Do not change `src-tauri/tauri.conf.json`, `src-tauri/capabilities/`, or any
  build/packaging config unless the task explicitly targets those files.

## Svelte 5 notes

- This project uses Svelte 5 runes (`$state`, `$derived`, `$props`, etc.).
  Match the style of neighboring code; do not mix legacy `let`/`export let`
  reactivity with runes in the same component.
- Do not introduce state management libraries, global stores, or new patterns
  when existing local component state or props already cover the task.

## Verification before you finish

Run the relevant checks and make them pass with no new warnings or errors:

```sh
npm run check
npm test
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

- Frontend changes: at minimum `npm run check` and `npm test`.
- Rust changes: at minimum both `cargo test` and `cargo clippy` above.
- If you added a feature or changed behavior, add or extend tests in the same
  style as existing ones (vitest with a mocked Tauri boundary for the frontend,
  real SQLite for Rust).
- Do not mark work complete while any check fails or is skipped.

## Deliverables and process

- Show a summary of what changed and why, keyed to the original request.
- Present the diff (or list of touched files) before committing. Do not commit
  or push unless Oshank asks.
- If the request is ambiguous, ask instead of guessing. A wrong assumption
  here costs more than a question.
- If a request would require breaking the rules above (e.g. it needs a schema
  migration, new dependency, or config change), stop and state what would need
  to change and why, then wait for confirmation.
