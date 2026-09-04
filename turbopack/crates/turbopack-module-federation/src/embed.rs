//! Makes the browser runtime available as internal, importable modules.
//!
//! Generated sources can write imports such as:
//!
//! ```js
//! import { createContainer } from "@vercel/turbopack-module-federation/container"
//! ```
//!
//! These imports never go to `node_modules`. The import map below points them at the TypeScript
//! files embedded in the Turbopack binary.

use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::Vc;
use turbo_tasks_fs::{FileSystem, embed_directory};
use turbopack_core::resolve::options::{ImportMap, ImportMapping};

/// Returns the virtual filesystem containing the browser runtime sources from `js/src`.
#[turbo_tasks::function]
pub fn embed_fs() -> Vc<Box<dyn FileSystem>> {
    embed_directory!("turbopack-module-federation", "$CARGO_MANIFEST_DIR/js/src")
}

/// Maps the private runtime package name to files in [`embed_fs`].
///
/// The wildcard keeps generated imports readable: the request ending in `/container` resolves to
/// the embedded `container.ts`, `/remote-loader` resolves to `remote-loader.ts`, and so on.
#[turbo_tasks::function]
pub async fn module_federation_runtime_import_map() -> Result<Vc<ImportMap>> {
    let mut import_map = ImportMap::empty();
    import_map.insert_wildcard_alias(
        rcstr!("@vercel/turbopack-module-federation/"),
        ImportMapping::PrimaryAlternative(rcstr!("./*"), Some(embed_fs().root().owned().await?))
            .resolved_cell(),
    );
    Ok(import_map.cell())
}
