use std::io::Write;

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{fxindexmap, ResolvedVc, TryJoinIterExt, Value, ValueToString, Vc};
use turbo_tasks_fs::{self, rope::RopeBuilder, File, FileSystemPath};
use turbopack::ModuleAssetContext;
use turbopack_core::{
    asset::{Asset, AssetContent},
    context::AssetContext,
    module::Module,
    reference_type::ReferenceType,
    source::Source,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::{
    runtime_functions::{TURBOPACK_LOAD, TURBOPACK_REQUIRE},
    utils::StringifyJs,
};

use super::app_entry::AppEntry;
use crate::{
    app_page_loader_tree::{AppPageLoaderTreeModule, GLOBAL_ERROR},
    app_structure::AppPageLoaderTree,
    next_app::{AppPage, AppPath},
    next_config::NextConfig,
    next_edge::entry::wrap_edge_entry,
    next_server_component::NextServerComponentTransition,
    parse_segment_config_from_loader_tree,
    util::{file_content_rope, load_next_js_template, NextRuntime},
};

/// Computes the entry for a Next.js app page.
#[turbo_tasks::function]
pub async fn get_app_page_entry(
    nodejs_context: Vc<ModuleAssetContext>,
    edge_context: Vc<ModuleAssetContext>,
    loader_tree: Vc<AppPageLoaderTree>,
    page: AppPage,
    project_root: Vc<FileSystemPath>,
    next_config: Vc<NextConfig>,
) -> Result<Vc<AppEntry>> {
    let config = parse_segment_config_from_loader_tree(loader_tree);
    let is_edge = matches!(config.await?.runtime, Some(NextRuntime::Edge));
    let module_asset_context = if is_edge {
        edge_context
    } else {
        nodejs_context
    };

    let server_component_transition = Vc::upcast(NextServerComponentTransition::new());

    let base_path = next_config.await?.base_path.clone();
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
        pages,
    } = loader_tree;

    let mut result = RopeBuilder::default();

    for import in imports {
        writeln!(result, "{import}")?;
    }

    let pages = pages.iter().map(|page| page.to_string()).try_join().await?;

    let original_name: RcStr = page.to_string().into();
    let pathname: RcStr = AppPath::from(page.clone()).to_string().into();

    // Load the file from the next.js codebase.
    let source = load_next_js_template(
        "app-page.js",
        project_root,
        fxindexmap! {
            "VAR_DEFINITION_PAGE" => page.to_string().into(),
            "VAR_DEFINITION_PATHNAME" => pathname.clone(),
            "VAR_MODULE_GLOBAL_ERROR" => if inner_assets.contains_key(GLOBAL_ERROR) {
                GLOBAL_ERROR.into()
             } else {
                "next/dist/client/components/error-boundary".into()
            },
        },
        fxindexmap! {
            "tree" => loader_tree_code,
            "pages" => StringifyJs(&pages).to_string().into(),
            "__next_app_require__" => TURBOPACK_REQUIRE.full.into(),
            "__next_app_load_chunk__" => TURBOPACK_LOAD.full.into(),
        },
        fxindexmap! {},
    )
    .await?;

    let source_content = &*file_content_rope(source.content().file_content()).await?;

    result.concat(source_content);

    let query = qstring::QString::new(vec![("page", page.to_string())]);

    let file = File::from(result.build());
    let source = VirtualSource::new_with_ident(
        source
            .ident()
            .with_query(Vc::cell(format!("?{}", query).into())),
        AssetContent::file(file.into()),
    );

    let mut rsc_entry = module_asset_context
        .process(
            Vc::upcast(source),
            Value::new(ReferenceType::Internal(ResolvedVc::cell(inner_assets))),
        )
        .module();

    if is_edge {
        rsc_entry = wrap_edge_page(
            Vc::upcast(module_asset_context),
            project_root,
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
    project_root: Vc<FileSystemPath>,
    entry: ResolvedVc<Box<dyn Module>>,
    page: AppPage,
    next_config: Vc<NextConfig>,
) -> Result<Vc<Box<dyn Module>>> {
    const INNER: &str = "INNER_PAGE_ENTRY";

    let next_config_val = &*next_config.await?;

    // TODO(WEB-1824): add build support
    let dev = true;

    // TODO(timneutkens): remove this
    let is_server_component = true;

    let server_actions = next_config.experimental_server_actions().await?;

    let sri_enabled = !dev
        && next_config
            .experimental_sri()
            .await?
            .as_ref()
            .map(|sri| sri.algorithm.as_ref())
            .is_some();

    let source = load_next_js_template(
        "edge-ssr-app.js",
        project_root,
        fxindexmap! {
            "VAR_USERLAND" => INNER.into(),
            "VAR_PAGE" => page.to_string().into(),
        },
        fxindexmap! {
            "sriEnabled" => serde_json::Value::Bool(sri_enabled).to_string().into(),
            // TODO do we really need to pass the entire next config here?
            // This is bad for invalidation as any config change will invalidate this
            "nextConfig" => serde_json::to_string(next_config_val)?.into(),
            "isServerComponent" => serde_json::Value::Bool(is_server_component).to_string().into(),
            "dev" => serde_json::Value::Bool(dev).to_string().into(),
            "serverActions" => serde_json::to_string(&server_actions)?.into(),
        },
        fxindexmap! {
            "incrementalCacheHandler" => None,
        },
    )
    .await?;

    let inner_assets = fxindexmap! {
        INNER.into() => entry
    };

    let wrapped = asset_context
        .process(
            Vc::upcast(source),
            Value::new(ReferenceType::Internal(ResolvedVc::cell(inner_assets))),
        )
        .module();

    Ok(wrap_edge_entry(
        asset_context,
        project_root,
        wrapped,
        AppPath::from(page).to_string().into(),
    ))
}
