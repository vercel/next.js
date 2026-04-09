use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::Vc;
use turbo_tasks_fs::{FileContent, FileSystem, FileSystemPath, embed_directory};
use turbopack_core::{
    code_builder::Code,
    context::AssetContext,
    resolve::options::{ImportMap, ImportMapping},
};
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

/// Returns an [ImportMap] containing aliases for all built-in `@turbopack/*`
/// modules backed by the embedded turbopack-ecmascript-runtime filesystem.
///
/// Callers should merge this into their [ResolveOptionsContext] so that
/// generated virtual modules (e.g. from [BytesSourceTransform]) can resolve
/// their imports.  As more parts of the turbopack runtime are extracted into
/// importable modules they should be added here.
#[turbo_tasks::function]
pub async fn turbopack_internal_import_map() -> Result<Vc<ImportMap>> {
    let embed_root = embed_fs().root().owned().await?;

    let mut import_map = ImportMap::default();
    import_map.insert_exact_alias(
        rcstr!("@turbopack/base64"),
        ImportMapping::PrimaryAlternative(rcstr!("./shared/base64.ts"), Some(embed_root))
            .resolved_cell(),
    );
    Ok(import_map.cell())
}
