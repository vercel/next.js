use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;
use turbo_tasks_fs::{FileContent, FileSystem, FileSystemPath};
use turbopack_core::{file_source::FileSource, source::Source};

pub const VIRTUAL_PACKAGE_NAME: &str = "@vercel/turbopack-next";

#[turbo_tasks::function]
pub(crate) fn next_js_fs() -> Vc<Box<dyn FileSystem>> {
    // [TODO]: macro need to be refactored to be used via turbopack-binding
    turbo_tasks_fs::embed_directory!("next", "$CARGO_MANIFEST_DIR/js/src")
}

#[turbo_tasks::function]
pub(crate) async fn next_js_file(path: RcStr) -> Result<Vc<FileContent>> {
    Ok(next_js_fs().root().await?.join(&path)?.read())
}

#[turbo_tasks::function]
pub(crate) async fn next_js_file_path(path: RcStr) -> Result<Vc<FileSystemPath>> {
    Ok(next_js_fs().root().await?.join(&path)?.cell())
}

#[turbo_tasks::function]
pub(crate) async fn next_asset(path: RcStr) -> Result<Vc<Box<dyn Source>>> {
    Ok(Vc::upcast(FileSource::new(
        next_js_file_path(path).owned().await?,
    )))
}
