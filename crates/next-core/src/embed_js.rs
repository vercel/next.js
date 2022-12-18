use anyhow::Result;
use turbo_tasks_fs::{
    attach::AttachedFileSystemVc, embed_directory, FileContentVc, FileSystemPathVc, FileSystemVc,
};
use turbopack_core::{asset::AssetVc, virtual_asset::VirtualAssetVc};

pub const VIRTUAL_PACKAGE_NAME: &str = "@vercel/turbopack-next";

#[turbo_tasks::function]
pub(crate) fn next_js_fs() -> FileSystemVc {
    embed_directory!("next", "$CARGO_MANIFEST_DIR/js/src")
}

#[turbo_tasks::function]
pub(crate) fn next_js_file(path: &str) -> FileContentVc {
    next_js_fs().root().join(path).read()
}

#[turbo_tasks::function]
pub(crate) fn next_js_file_path(path: &str) -> FileSystemPathVc {
    next_js_fs().root().join(path)
}

#[turbo_tasks::function]
pub(crate) async fn attached_next_js_package_path(
    project_path: FileSystemPathVc,
) -> FileSystemPathVc {
    project_path.join(&format!("[embedded_modules]/{}", VIRTUAL_PACKAGE_NAME))
}

#[turbo_tasks::function]
pub(crate) async fn wrap_with_next_js_fs(
    project_path: FileSystemPathVc,
) -> Result<FileSystemPathVc> {
    let attached_path = attached_next_js_package_path(project_path);
    let fs = AttachedFileSystemVc::new(attached_path, next_js_fs());
    Ok(fs.convert_path(project_path))
}

#[turbo_tasks::function]
pub(crate) fn next_asset(asset_path: FileSystemPathVc, path: &str) -> AssetVc {
    VirtualAssetVc::new(asset_path, next_js_file(path).into()).into()
}
