use turbo_tasks::Vc;
use turbo_tasks_fs::{FileSystem, embed_directory};

#[turbo_tasks::function]
pub(crate) fn embed_fs() -> Vc<Box<dyn FileSystem>> {
    embed_directory!("turbopack-wasm", "$CARGO_MANIFEST_DIR/js/src")
}
