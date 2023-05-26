use turbo_tasks_fs::{embed_directory, FileContentVc, FileSystem, FileSystemPathVc, FileSystemVc};

#[turbo_tasks::function]
pub fn embed_fs() -> FileSystemVc {
    embed_directory!("turbopack", "$CARGO_MANIFEST_DIR/js/src")
}

#[turbo_tasks::function]
pub fn embed_file(path: &str) -> FileContentVc {
    embed_fs().root().join(path).read()
}

#[turbo_tasks::function]
pub fn embed_file_path(path: &str) -> FileSystemPathVc {
    embed_fs().root().join(path)
}
