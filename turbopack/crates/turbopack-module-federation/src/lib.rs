//! Framework-neutral Module Federation support for Turbopack.
//!
//! This crate owns the Webpack-compatible container and sharing protocol. Framework adapters are
//! responsible for converting their public configuration, selecting compilation contexts, and
//! serving the resulting output assets.
//!
//! The two main flows are:
//!
//! ```text
//! remote build: exposes -> container_entry_source() -> remoteEntry.js
//! host build:   import("catalog/Button") -> module_federation_import_map() -> remote proxy
//! ```
//!
//! At runtime, the proxy loads `remoteEntry.js`, calls `container.init(...)`, asks the container
//! for `"./Button"`, and evaluates the returned module factory. The browser implementation for
//! those steps is embedded from this crate's `js/src` directory.

#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub mod embed;
pub mod options;
pub mod source;

pub use embed::{embed_fs, module_federation_runtime_import_map};
pub use options::{
    Expose, ModuleFederationOptions, ModuleFederationResolveMode, Remote, RemoteExternal,
    SharedModule, SharedVersion,
};
pub use source::{
    OptionModuleFederationSource, container_entry_source, host_provider_source,
    module_federation_chunk_loading_global, remote_proxy_source, shared_consumer_source,
};
