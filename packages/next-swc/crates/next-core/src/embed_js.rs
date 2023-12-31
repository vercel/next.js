use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::tasks_fs::{FileContent, FileSystem, FileSystemPath},
    turbopack::core::{file_source::FileSource, source::Source},
};

pub const VIRTUAL_PACKAGE_NAME: &str = "@vercel/turbopack-next";

#[turbo_tasks::function]
pub(crate) fn next_js_fs() -> Vc<Box<dyn FileSystem>> {
    // [TODO]: macro need to be refactored to be used via turbopack-binding
    turbo_tasks_fs::embed_directory!("next", "$CARGO_MANIFEST_DIR/js/src")
}

#[turbo_tasks::function]
pub(crate) fn next_js_file(path: String) -> Vc<FileContent> {
    next_js_fs().root().join(path).read()
}

#[turbo_tasks::function]
pub(crate) fn next_js_file_path(path: String) -> Vc<FileSystemPath> {
    next_js_fs().root().join(path)
}

#[turbo_tasks::function]
pub(crate) fn next_asset(path: String) -> Vc<Box<dyn Source>> {
    Vc::upcast(FileSource::new(next_js_file_path(path)))
}
