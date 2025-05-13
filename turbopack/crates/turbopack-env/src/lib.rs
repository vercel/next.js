//! Environment Variable support for turbopack.
//!
//! Environment variables can come from multiple sources, including the rust
//! process's env (immutable and by passing `FOO=BAR` keys when executing the
//! turbopack binary) or loaded via dotenv files.
//!
//! Dotenv file loading is a chain. Dotenv files that come first in the chain
//! have higher priority to define a environment variable (later dotenv files
//! cannot override it). Later dotenv files can reference variables prior
//! defined variables.

#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

mod asset;
pub mod dotenv;
mod embeddable;
mod issue;
mod try_env;

pub use asset::ProcessEnvAsset;
pub use embeddable::EmbeddableProcessEnv;
pub use issue::ProcessEnvIssue;
pub use try_env::TryDotenvProcessEnv;

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbo_tasks_env::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
