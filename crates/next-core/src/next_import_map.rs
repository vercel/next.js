use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::AssetVc,
    resolve::{
        options::{ImportMap, ImportMapVc, ImportMapping, ImportMappingVc},
        AliasPattern, ResolveResult,
    },
    virtual_asset::VirtualAssetVc,
};

use crate::embed_next_file;

/// Aliases [next_pages_app] to either an existing `pages/_app` asset, or a
/// default asset.
#[turbo_tasks::function]
pub fn get_next_import_map(pages_dir: FileSystemPathVc) -> ImportMapVc {
    let mut import_map = ImportMap::empty();

    let pages_app_asset_import_mapping = asset_to_import_mapping(
        VirtualAssetVc::new(
            // TODO(alexkirsz) We should make sure these paths are unique,
            // otherwise we can run into conflicts with
            // user paths.
            pages_dir.root().join("next_js/pages/_app.js"),
            embed_next_file!("pages/_app.js").into(),
        )
        .into(),
    );
    let pages_document_asset_import_mapping = asset_to_import_mapping(
        VirtualAssetVc::new(
            pages_dir.root().join("next_js/pages/_document.js"),
            embed_next_file!("pages/_document.js").into(),
        )
        .into(),
    );
    let internal_html_context_import_mapping = asset_to_import_mapping(
        VirtualAssetVc::new(
            pages_dir.root().join("next_js/internal/html-context.js"),
            embed_next_file!("internal/html-context.js").into(),
        )
        .into(),
    );

    insert_alias_to_alternatives(
        &mut import_map,
        "@vercel/turbopack-next/pages/_app",
        request_to_import_mapping(pages_dir, "./_app"),
        pages_app_asset_import_mapping,
    );
    insert_alias_to_alternatives(
        &mut import_map,
        "@vercel/turbopack-next/pages/_document",
        request_to_import_mapping(pages_dir, "./_document"),
        pages_document_asset_import_mapping,
    );

    insert_alias(
        &mut import_map,
        "@vercel/turbopack-next/internal/html-context",
        internal_html_context_import_mapping,
    );
    insert_alias(
        &mut import_map,
        "next/document",
        pages_document_asset_import_mapping,
    );

    import_map.cell()
}

/// Inserts an alias to an alternative of import mappings into an import map.
pub fn insert_alias_to_alternatives(
    import_map: &mut ImportMap,
    alias: &str,
    alt1: ImportMappingVc,
    alt2: ImportMappingVc,
) {
    import_map.insert_alias(
        AliasPattern::Exact(alias.to_string()),
        ImportMapping::Alternatives(vec![alt1, alt2]).into(),
    );
}

/// Inserts an alias to an import mapping into an import map.
pub fn insert_alias(import_map: &mut ImportMap, alias: &str, mapping: ImportMappingVc) {
    import_map.insert_alias(AliasPattern::Exact(alias.to_string()), mapping);
}

/// Creates a direct import mapping to the result of resolving a request
/// in a context.
pub fn request_to_import_mapping(context_path: FileSystemPathVc, request: &str) -> ImportMappingVc {
    ImportMapping::PrimaryAlternative(request.to_string(), Some(context_path)).into()
}

/// Creates a direct import mapping to a single asset.
pub fn asset_to_import_mapping(asset: AssetVc) -> ImportMappingVc {
    ImportMapping::Direct(ResolveResult::Single(asset, vec![]).into()).into()
}
