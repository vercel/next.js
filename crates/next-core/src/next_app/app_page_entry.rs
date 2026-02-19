use std::io::Write;

use anyhow::Result;
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::{self, File, FileContent, FileSystemPath, rope::RopeBuilder};
use turbopack::ModuleAssetContext;
use turbopack_core::{
    asset::{Asset, AssetContent},
    context::AssetContext,
    module::Module,
    reference_type::ReferenceType,
    source::Source,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::runtime_functions::{TURBOPACK_LOAD, TURBOPACK_REQUIRE};

use crate::{
    app_page_loader_tree::AppPageLoaderTreeModule,
    app_structure::AppPageLoaderTree,
    next_app::{AppPage, AppPath, app_entry::AppEntry},
    next_config::NextConfig,
    next_edge::entry::wrap_edge_entry,
    next_import_map::get_next_package,
    next_server_component::NextServerComponentTransition,
    parse_segment_config_from_loader_tree,
    util::{NextRuntime, app_function_name, file_content_rope, load_next_js_template},
};

/// Computes the entry for a Next.js app page.
#[turbo_tasks::function]
pub async fn get_app_page_entry(
    nodejs_context: ResolvedVc<ModuleAssetContext>,
    edge_context: ResolvedVc<ModuleAssetContext>,
    loader_tree: Vc<AppPageLoaderTree>,
    page: AppPage,
    project_root: FileSystemPath,
    next_config: Vc<NextConfig>,
) -> Result<Vc<AppEntry>> {
    let config = parse_segment_config_from_loader_tree(loader_tree);
    let is_edge = matches!(config.await?.runtime, Some(NextRuntime::Edge));
    let module_asset_context = if is_edge {
        edge_context
    } else {
        nodejs_context
    };

    let server_component_transition =
        ResolvedVc::upcast(NextServerComponentTransition::new().to_resolved().await?);

    let base_path = next_config.base_path().owned().await?;
    let loader_tree = AppPageLoaderTreeModule::build(
        loader_tree,
        module_asset_context,
        server_component_transition,
        base_path,
    )
    .await?;

    let AppPageLoaderTreeModule {
        inner_assets,
        imports,
        loader_tree_code,
    } = loader_tree;

    let mut result = RopeBuilder::default();

    let prepend_line_count = imports.len();
    for import in imports {
        writeln!(result, "{import}")?;
    }

    let original_name: RcStr = page.to_string().into();
    let pathname: RcStr = AppPath::from(page.clone()).to_string().into();

    // Load the file from the next.js codebase.
    let (source, injection_offsets) = load_next_js_template(
        "app-page.js",
        project_root.clone(),
        [
            ("VAR_DEFINITION_PAGE", &*page.to_string()),
            ("VAR_DEFINITION_PATHNAME", &pathname),
        ],
        [
            ("tree", &*loader_tree_code),
            ("__next_app_require__", &TURBOPACK_REQUIRE.bound()),
            ("__next_app_load_chunk__", &TURBOPACK_LOAD.bound()),
        ],
        [],
    )
    .await?;

    let source_content = &*file_content_rope(source.content().file_content()).await?;

    result.concat(source_content);

    let query = qstring::QString::new(vec![("page", page.to_string())]);

    // Adjust the source map to account for prepended imports and INJECT: expansions.
    // The compiled template ships with app-page.js.map but its line numbers are wrong
    // after we prepend imports and expand INJECT: comments into multi-line code.
    // We fix this by splitting the VLQ mappings by ';' (line delimiter), inserting
    // empty groups at the right positions, and embedding the result as an inline
    // source map.
    let final_content = result.build();
    let final_str = final_content.to_str()?.to_string();

    let final_str =
        match adjust_template_source_map(&final_str, project_root.clone(), prepend_line_count, &injection_offsets).await
        {
            Ok(adjusted) => adjusted,
            Err(_) => final_str,
        };

    let file = File::from(final_str);
    let source = VirtualSource::new_with_ident(
        source.ident().with_query(RcStr::from(format!("?{query}"))),
        AssetContent::file(FileContent::Content(file).cell()),
    );

    let mut rsc_entry = module_asset_context
        .process(
            Vc::upcast(source),
            ReferenceType::Internal(ResolvedVc::cell(inner_assets)),
        )
        .module();

    if is_edge {
        rsc_entry = wrap_edge_page(
            *ResolvedVc::upcast(module_asset_context),
            project_root.clone(),
            rsc_entry,
            page,
        );
    };

    Ok(AppEntry {
        pathname,
        original_name,
        rsc_entry: rsc_entry.to_resolved().await?,
        config: config.to_resolved().await?,
    }
    .cell())
}

#[turbo_tasks::function]
async fn wrap_edge_page(
    asset_context: Vc<Box<dyn AssetContext>>,
    project_root: FileSystemPath,
    entry: ResolvedVc<Box<dyn Module>>,
    page: AppPage,
) -> Result<Vc<Box<dyn Module>>> {
    const INNER: &str = "INNER_PAGE_ENTRY";

    let (source, _injection_offsets) = load_next_js_template(
        "edge-ssr-app.js",
        project_root.clone(),
        [("VAR_USERLAND", INNER), ("VAR_PAGE", &page.to_string())],
        [],
        [("incrementalCacheHandler", None)],
    )
    .await?;

    let inner_assets = fxindexmap! {
        INNER.into() => entry
    };

    let wrapped = asset_context
        .process(
            source,
            ReferenceType::Internal(ResolvedVc::cell(inner_assets)),
        )
        .module();

    Ok(wrap_edge_entry(
        asset_context,
        project_root,
        wrapped,
        app_function_name(&page).into(),
    ))
}

/// Reads the compiled template's `.map` file, adjusts the VLQ mappings to account for
/// prepended import lines and INJECT: expansions, and replaces the external
/// `//# sourceMappingURL=app-page.js.map` reference with an inline data URL.
///
/// The adjustment works by splitting the VLQ mappings string by `;` (each `;` is a line
/// boundary), inserting empty groups for the prepended imports and for extra lines from
/// INJECT: expansions. Empty groups don't affect VLQ relative state, so existing segments
/// remain correct.
async fn adjust_template_source_map(
    content: &str,
    project_root: FileSystemPath,
    prepend_line_count: usize,
    injection_offsets: &[next_taskless::InjectionOffset],
) -> Result<String> {
    const SOURCE_MAP_REF: &str = "//# sourceMappingURL=app-page.js.map";

    if !content.contains(SOURCE_MAP_REF) {
        anyhow::bail!("no sourceMappingURL reference found in template content");
    }

    // Read the .map file from the template directory.
    let next_package = get_next_package(project_root).await?;
    let map_path = next_package.join("dist/esm/build/templates/app-page.js.map")?;
    let map_content = map_path.read().await?;
    let FileContent::Content(map_file) = &*map_content else {
        anyhow::bail!("app-page.js.map not found");
    };
    let map_str = map_file.content().to_str()?;

    // Parse the source map JSON to extract and adjust the mappings field.
    let mut map: serde_json::Value = serde_json::from_str(&map_str)?;
    let mappings = map
        .get("mappings")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // Split mappings by ';' — each element is one generated line's VLQ segments.
    let original_groups: Vec<&str> = mappings.split(';').collect();

    let mut adjusted_groups: Vec<&str> = Vec::with_capacity(
        original_groups.len() + prepend_line_count + injection_offsets.iter().map(|o| o.delta).sum::<usize>(),
    );

    // 1. Prepend empty groups for the import lines added before the template.
    for _ in 0..prepend_line_count {
        adjusted_groups.push("");
    }

    // 2. Walk original groups, inserting extra empty groups at INJECT: points.
    for (i, group) in original_groups.iter().enumerate() {
        adjusted_groups.push(group);
        // Check if this line (0-indexed) had an INJECT: replacement with extra lines.
        for offset in injection_offsets {
            if offset.original_line == i {
                for _ in 0..offset.delta {
                    adjusted_groups.push("");
                }
            }
        }
    }

    let adjusted_mappings = adjusted_groups.join(";");
    map["mappings"] = serde_json::Value::String(adjusted_mappings);

    let map_json = serde_json::to_string(&map)?;
    let encoded = BASE64.encode(map_json.as_bytes());

    Ok(content.replace(
        SOURCE_MAP_REF,
        &format!("//# sourceMappingURL=data:application/json;base64,{encoded}"),
    ))
}
