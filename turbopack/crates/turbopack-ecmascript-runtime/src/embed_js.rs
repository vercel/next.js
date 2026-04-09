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

/// Returns an [ImportMap] containing:
/// - The `@vercel/turbopack-ecmascript-runtime/*` wildcard alias pointing to the embedded runtime
///   filesystem.
/// - All built-in `@turbopack/*` module aliases (e.g. `@turbopack/base64`).
///
/// This import map is injected automatically by
/// [`ModuleAssetContext::resolve_options`] so that every Turbopack-processed
/// module can resolve these paths without per-consumer configuration.
///
/// As more parts of the turbopack runtime are extracted into importable
/// modules they should be added here.
#[turbo_tasks::function]
pub async fn turbopack_runtime_import_map() -> Result<Vc<ImportMap>> {
    let embed_root = embed_fs().root().owned().await?;

    let mut import_map = ImportMap::default();

    // Wildcard alias: @vercel/turbopack-ecmascript-runtime/* -> embedded fs
    import_map.insert_wildcard_alias(
        rcstr!("@vercel/turbopack-ecmascript-runtime/"),
        ImportMapping::PrimaryAlternative(rcstr!("./*"), Some(embed_root.clone())).resolved_cell(),
    );

    // Exact alias: @turbopack/base64
    import_map.insert_exact_alias(
        rcstr!("@turbopack/base64"),
        ImportMapping::PrimaryAlternative(rcstr!("./shared/base64.ts"), Some(embed_root))
            .resolved_cell(),
    );

    Ok(import_map.cell())
}
