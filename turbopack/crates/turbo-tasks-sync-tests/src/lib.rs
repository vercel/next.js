//! End-to-end tests for the synchronous turbo-tasks execution engine.
//!
//! All test logic lives under `tests/`, gated on the `sync` feature. This crate is
//! intentionally empty otherwise so that a default `cargo build --workspace` does not
//! turn on `turbo-tasks/sync` (which would strip `async` from crates that have not
//! yet been codemodded to `read!`/`parallel!`).
