use turbo_tasks::Vc;
use turbo_tasks_fs::{embed_directory, FileContent, FileSystem, FileSystemPath};

#[turbo_tasks::function]
fn embed_fs() -> Vc<Box<dyn FileSystem>> {
    embed_directory!("turbopack-cli", "$CARGO_MANIFEST_DIR/js/src")
}

#[turbo_tasks::function]
pub(crate) fn embed_file(path: String) -> Vc<FileContent> {
    embed_fs().root().join(path).read()
}

#[turbo_tasks::function]
pub(crate) fn embed_file_path(path: String) -> Vc<FileSystemPath> {
    embed_fs().root().join(path)
}
