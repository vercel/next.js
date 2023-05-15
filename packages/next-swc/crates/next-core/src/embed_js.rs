use turbo_binding::{
    turbo::tasks_fs::{FileContentVc, FileSystem, FileSystemPathVc, FileSystemVc},
    turbopack::core::{asset::AssetVc, source_asset::SourceAssetVc},
};

pub const VIRTUAL_PACKAGE_NAME: &str = "@vercel/turbopack-next";

#[turbo_tasks::function]
pub(crate) fn next_js_fs() -> FileSystemVc {
    // [TODO]: macro need to be refactored to be used via turbo-binding
    turbo_tasks_fs::embed_directory!("next", "$CARGO_MANIFEST_DIR/js/src")
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
pub(crate) fn next_asset(path: &str) -> AssetVc {
    SourceAssetVc::new(next_js_file_path(path)).into()
}
