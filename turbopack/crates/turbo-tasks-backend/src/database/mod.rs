//! Database layer providing pluggable key-value storage backends.
//!
//! This module defines the [`KeyValueDatabase`](key_value_database::KeyValueDatabase) trait
//! and provides concrete implementations:
//! - [`turbo`] — High-performance backend using `turbo-persistence` (default)
//! - [`lmdb`] — LMDB backend for debugging/reproduction (feature-gated)
//! - [`noop_kv`] — No-op in-memory backend for tests
//!
//! Supporting modules handle database versioning, cache invalidation, startup caching,
//! and write batch abstractions.
pub mod db_invalidation;
pub mod db_versioning;
pub mod key_value_database;
pub mod noop_kv;
pub mod turbo;
pub mod write_batch;
