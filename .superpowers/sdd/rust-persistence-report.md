# Rust persistence worker report

## Status

Implemented Tasks 1, 3, and 4: the Tauri crate/runtime, safe command-error contract, shared native state, configuration commands/events, schema-v1 canonical persistence, atomic manifest/journal updates, staged data-directory movement, legacy Electron discovery/migration, health checks, and journal recovery. The runtime also contains the agreed integration registrations for the native-media worker's command and media modules.

## RED evidence

- `cargo test --manifest-path src-tauri/Cargo.toml error::tests::serializes_safe_command_error` initially failed with `manifest path src-tauri/Cargo.toml does not exist`.
- After the tests and initial crate were added, the first build failed because Cargo enabled `protocol-asset` outside the Tauri config allowlist. Removing that unnecessary feature exposed the next real packaging failure: configured target-suffixed FFmpeg/FFprobe binaries did not yet exist.
- The next compile failed because Tauri had no application icon. A real icon was derived from the existing `public/android-chrome-512.png` asset.
- Persistence, migration, and health integration tests were authored before their production modules. The initial crate-level RED above prevented a separate missing-module compile run; no missing-module RED result is claimed.

## GREEN evidence

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass.
- `cargo test --manifest-path src-tauri/Cargo.toml error::tests::serializes_safe_command_error` — 1 passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --test persistence --test migration --test health` — 13 passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` — pass.
- `cargo test --manifest-path src-tauri/Cargo.toml` — 30 passed, 0 failed (includes native-media worker tests).

## Implementation notes

- Data paths reject absolute paths, lexical traversal, and symlink-parent escape. Existing parents are canonicalized before new targets are accepted.
- JSON and binary writes are journaled, synced, atomically replaced, checksummed with lowercase SHA-256, and recorded in the schema-v1 manifest. Windows replacement uses `MoveFileExW` with replace/write-through flags.
- Mutations share a lock by canonical active directory. Configuration uses an atomic JSON object and emits `config-changed` only after successful persistence; JSON null deletes a key.
- Directory changes copy into a unique sibling staging directory, verify all manifest checksums, update the manifest and pointer atomically, retain the original, and remove staging/final output on failure.
- Migration supports audited canonical `PawcastData`, Electron Store JSON, and the existing renderer-provided localStorage/IndexedDB payload. Stable IDs prevent duplicates and existing canonical values win. Source files are read-only.
- Health checks validate manifest readability, recorded checksums, recording/imported-media references, and pending journal state. Journal recovery replays matching temporary files and removes unsafe pending files; unsupported strategies return a typed non-retryable error.

## Remaining integration risk

- `bundle.externalBin` is intentionally not present in `tauri.conf.json` yet because real target-suffixed FFmpeg/FFprobe artifacts are not in the repository. Task 8 must restore the two entries only when the real binaries/packaging validation are available; the shell capability is already restricted to those two sidecar names.
- Native runtime smoke testing and cross-platform packaging remain root-integrator acceptance work.
