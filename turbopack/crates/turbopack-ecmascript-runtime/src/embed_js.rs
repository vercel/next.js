use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;
use turbo_tasks_fs::{FileContent, FileSystem, FileSystemPath, embed_directory};
use turbopack_core::{code_builder::Code, context::AssetContext};
use turbopack_ecmascript::StaticEcmascriptCode;

#[turbo_tasks::function]
pub fn embed_fs() -> Vc<Box<dyn FileSystem>> {
    embed_directory!("turbopack", "$CARGO_MANIFEST_DIR/js/src")
}

#[turbo_tasks::function]
pub async fn embed_file(path: RcStr) -> Result<Vc<FileContent>> {
    Ok(embed_fs().root().await?.join(&path)?.read())
}

#[turbo_tasks::function]
pub async fn embed_file_path(path: RcStr) -> Result<Vc<FileSystemPath>> {
    Ok(embed_fs().root().await?.join(&path)?.cell())
}

#[turbo_tasks::function]
pub async fn embed_static_code(
    asset_context: Vc<Box<dyn AssetContext>>,
    path: RcStr,
    generate_source_map: bool,
) -> Result<Vc<Code>> {
    Ok(StaticEcmascriptCode::new(
        asset_context,
        embed_file_path(path).owned().await?,
        generate_source_map,
    )
    .code())
}
