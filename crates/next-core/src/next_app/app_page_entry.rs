use std::io::Write;

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::{self, File, FileContent, FileSystemPath, rope::RopeBuilder};
use turbopack::ModuleAssetContext;
use turbopack_core::{
    asset::{Asset, AssetContent},
    context::AssetContext,
    file_source::FileSource,
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

    for import in imports {
        writeln!(result, "{import}")?;
    }

    let original_name: RcStr = page.to_string().into();
    let pathname: RcStr = AppPath::from(page.clone()).to_string().into();

    // Load the file from the next.js codebase.
    let source = load_next_js_template(
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

    let file = File::from(result.build());
    let source = VirtualSource::new_with_ident(
        source
            .ident()
            .owned()
            .await?
            .with_query(RcStr::from(format!("?{query}")))
            .into_vc(),
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
            next_config,
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
    next_config: Vc<NextConfig>,
) -> Result<Vc<Box<dyn Module>>> {
    const INNER: &str = "INNER_PAGE_ENTRY";
    let mut cache_handler_imports = String::new();
    let mut cache_handler_registration = String::new();
    let mut incremental_cache_handler_import = None;
    let mut cache_handler_inner_assets = fxindexmap! {};

    let cache_handlers = next_config.cache_handlers_map().owned().await?;
    for (index, (kind, handler_path)) in cache_handlers.iter().enumerate() {
        let cache_handler_inner: RcStr = format!("INNER_CACHE_HANDLER_{index}").into();
        let cache_handler_var = format!("cacheHandler{index}");
        cache_handler_imports.push_str(&format!(
            "import {cache_handler_var} from {};\n",
            serde_json::to_string(&*cache_handler_inner)?
        ));
        cache_handler_registration.push_str(&format!(
            "  cacheHandlers.setCacheHandler({}, {cache_handler_var});\n",
            serde_json::to_string(kind.as_str())?
        ));

        let cache_handler_module = asset_context
            .process(
                Vc::upcast(FileSource::new(project_root.join(handler_path)?)),
                ReferenceType::Undefined,
            )
            .module()
            .to_resolved()
            .await?;
        cache_handler_inner_assets.insert(cache_handler_inner, cache_handler_module);
    }

    for cache_handler_path in next_config
        .cache_handler(project_root.clone())
        .await?
        .into_iter()
    {
        let cache_handler_inner: RcStr = "INNER_INCREMENTAL_CACHE_HANDLER".into();
        incremental_cache_handler_import = Some(cache_handler_inner.clone());
        let cache_handler_module = asset_context
            .process(
                Vc::upcast(FileSource::new(cache_handler_path.clone())),
                ReferenceType::Undefined,
            )
            .module()
            .to_resolved()
            .await?;
        cache_handler_inner_assets.insert(cache_handler_inner, cache_handler_module);
    }

    let source = load_next_js_template(
        "edge-ssr-app.js",
        project_root.clone(),
        [("VAR_USERLAND", INNER), ("VAR_PAGE", &page.to_string())],
        [
            ("cacheHandlerImports", cache_handler_imports.as_str()),
            (
                "cacheHandlerRegistration",
                cache_handler_registration.as_str(),
            ),
        ],
        [(
            "incrementalCacheHandler",
            incremental_cache_handler_import.as_deref(),
        )],
    )
    .await?;

    let mut inner_assets = fxindexmap! {
        INNER.into() => entry
    };
    inner_assets.extend(cache_handler_inner_assets);

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
