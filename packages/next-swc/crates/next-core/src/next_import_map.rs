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

/// Computes the Next-specific client import map.
#[turbo_tasks::function]
pub fn get_next_client_import_map(pages_dir: FileSystemPathVc) -> ImportMapVc {
    let mut import_map = ImportMap::empty();

    insert_next_shared_aliases(&mut import_map, pages_dir);

    insert_alias_to_alternatives(
        &mut import_map,
        "@vercel/turbopack-next/pages/_app",
        request_to_import_mapping(pages_dir, "./_app"),
        request_to_import_mapping(pages_dir, "next/app"),
    );
    insert_alias_to_alternatives(
        &mut import_map,
        "@vercel/turbopack-next/pages/_document",
        request_to_import_mapping(pages_dir, "./_document"),
        request_to_import_mapping(pages_dir, "next/document"),
    );

    import_map.cell()
}

/// Computes the Next-specific server-side import map.
#[turbo_tasks::function]
pub fn get_next_server_import_map(pages_dir: FileSystemPathVc) -> ImportMapVc {
    let mut import_map = ImportMap::empty();

    insert_next_shared_aliases(&mut import_map, pages_dir);

    insert_alias_to_alternatives(
        &mut import_map,
        "@vercel/turbopack-next/pages/_app",
        request_to_import_mapping(pages_dir, "./_app"),
        external_request_to_import_mapping("next/app"),
    );
    insert_alias_to_alternatives(
        &mut import_map,
        "@vercel/turbopack-next/pages/_document",
        request_to_import_mapping(pages_dir, "./_document"),
        external_request_to_import_mapping("next/document"),
    );

    import_map.insert_alias(
        AliasPattern::exact("next"),
        ImportMapping::External(None).into(),
    );
    import_map.insert_alias(
        AliasPattern::wildcard("next/", ""),
        ImportMapping::External(None).into(),
    );
    import_map.insert_alias(
        AliasPattern::exact("react"),
        ImportMapping::External(None).into(),
    );
    import_map.insert_alias(
        AliasPattern::wildcard("react/", ""),
        ImportMapping::External(None).into(),
    );

    import_map.cell()
}

fn insert_next_shared_aliases(import_map: &mut ImportMap, pages_dir: FileSystemPathVc) {
    import_map.insert_alias(
        AliasPattern::exact("@vercel/turbopack-next/internal/shims"),
        asset_to_import_mapping(get_internal_shims_asset(pages_dir)),
    );
}

#[turbo_tasks::function]
fn get_internal_shims_asset(pages_dir: FileSystemPathVc) -> AssetVc {
    VirtualAssetVc::new(
        pages_dir.root().join("next_js/internal/shims.js"),
        embed_next_file!("internal/shims.js").into(),
    )
    .into()
}

/// Inserts an alias to an alternative of import mappings into an import map.
fn insert_alias_to_alternatives(
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

/// Creates a direct import mapping to the result of resolving a request
/// in a context.
fn request_to_import_mapping(context_path: FileSystemPathVc, request: &str) -> ImportMappingVc {
    ImportMapping::PrimaryAlternative(request.to_string(), Some(context_path)).into()
}

/// Creates a direct import mapping to the result of resolving an external
/// request.
fn external_request_to_import_mapping(request: &str) -> ImportMappingVc {
    ImportMapping::External(Some(request.to_string())).into()
}

/// Creates a direct import mapping to a single asset.
fn asset_to_import_mapping(asset: AssetVc) -> ImportMappingVc {
    ImportMapping::Direct(ResolveResult::Single(asset, vec![]).into()).into()
}
