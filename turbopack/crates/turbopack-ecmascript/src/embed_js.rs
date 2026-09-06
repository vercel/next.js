use turbo_tasks::Vc;
use turbo_tasks_fs::{FileSystem, embed_directory};

#[turbo_tasks::function]
pub fn embed_fs() -> Vc<Box<dyn FileSystem>> {
    embed_directory!("turbopack-ecmascript", "$CARGO_MANIFEST_DIR/js/src")
}
