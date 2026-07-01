//! Public, versioned Turbopack manifests for the Remote Components integration.
//!
//!
//! - Manifest #1 (`turbopack.remote-modules`): maps each React Flight client reference to stable
//!   module ids, chunk urls, exports, and per-variant (browser/ssr/edge/rsc) metadata.
//! - Manifest #2 (`turbopack.module-ids`): a manifest-level mapping from remote module IDs to
//!   shared specifiers.

mod remote_module_manifest;
mod shared_modules_manifest;

pub use remote_module_manifest::RemoteModuleManifest;
use serde::Serialize;
pub use shared_modules_manifest::ModuleIdManifest;

#[derive(Serialize, Clone, Copy, Eq, PartialEq, Hash, Debug, Default)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeKind {
    #[default]
    Browser,
    NodeJs,
    Edge,
}
