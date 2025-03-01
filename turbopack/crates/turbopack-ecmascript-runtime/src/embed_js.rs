use turbo_rcstr::RcStr;
use turbo_tasks::Vc;
use turbo_tasks_fs::{embed_directory, FileContent, FileSystem, FileSystemPath};
use turbopack_core::{code_builder::Code, context::AssetContext};
use turbopack_ecmascript::StaticEcmascriptCode;

#[turbo_tasks::function]
pub fn embed_fs() -> Vc<Box<dyn FileSystem>> {
    embed_directory!("turbopack", "$CARGO_MANIFEST_DIR/js/src")
}

#[turbo_tasks::function]
pub fn embed_file(path: RcStr) -> Vc<FileContent> {
    embed_fs().root().join(path).read()
}

#[turbo_tasks::function]
pub fn embed_file_path(path: RcStr) -> Vc<FileSystemPath> {
    embed_fs().root().join(path)
}

#[turbo_tasks::function]
pub fn embed_static_code(
    asset_context: Vc<Box<dyn AssetContext>>,
    path: RcStr,
    generate_source_map: Vc<bool>,
) -> Vc<Code> {
    StaticEcmascriptCode::new(asset_context, embed_file_path(path), generate_source_map).code()
}
