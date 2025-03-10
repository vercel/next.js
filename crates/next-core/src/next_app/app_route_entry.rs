use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{fxindexmap, ResolvedVc, Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::ModuleAssetContext;
use turbopack_core::{
    context::AssetContext,
    module::Module,
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
};

use crate::{
    app_segment_config::NextSegmentConfig,
    next_app::{AppEntry, AppPage, AppPath},
    next_config::{NextConfig, OutputType},
    next_edge::entry::wrap_edge_entry,
    parse_segment_config_from_source,
    util::{load_next_js_template, NextRuntime},
};

/// Computes the entry for a Next.js app route.
/// # Arguments
///
/// * `original_segment_config` - A next segment config to be specified explicitly for the given
///   source.
/// For some cases `source` may not be the original but the handler (dynamic
/// metadata) which will lose segment config.
#[turbo_tasks::function]
pub async fn get_app_route_entry(
    nodejs_context: Vc<ModuleAssetContext>,
    edge_context: Vc<ModuleAssetContext>,
    source: Vc<Box<dyn Source>>,
    page: AppPage,
    project_root: Vc<FileSystemPath>,
    original_segment_config: Option<Vc<NextSegmentConfig>>,
    next_config: Vc<NextConfig>,
) -> Result<Vc<AppEntry>> {
    let segment_from_source = parse_segment_config_from_source(source);
    let config = if let Some(original_segment_config) = original_segment_config {
        let mut segment_config = (*segment_from_source.await?).clone();
        segment_config.apply_parent_config(&*original_segment_config.await?);
        segment_config.into()
    } else {
        segment_from_source
    };

    let is_edge = matches!(config.await?.runtime, Some(NextRuntime::Edge));
    let module_asset_context = if is_edge {
        edge_context
    } else {
        nodejs_context
    };

    let original_name: RcStr = page.to_string().into();
    let pathname: RcStr = AppPath::from(page.clone()).to_string().into();

    let path = source.ident().path();

    const INNER: &str = "INNER_APP_ROUTE";

    let output_type: RcStr = next_config
        .await?
        .output
        .as_ref()
        .map(|o| match o {
            OutputType::Standalone => "\"standalone\"".to_string(),
            OutputType::Export => "\"export\"".to_string(),
        })
        .map(RcStr::from)
        .unwrap_or_else(|| "\"\"".into());

    // Load the file from the next.js codebase.
    let virtual_source = load_next_js_template(
        "app-route.js",
        project_root,
        fxindexmap! {
            "VAR_DEFINITION_PAGE" => page.to_string().into(),
            "VAR_DEFINITION_PATHNAME" => pathname.clone(),
            "VAR_DEFINITION_FILENAME" => path.file_stem().await?.as_ref().unwrap().as_str().into(),
            // TODO(alexkirsz) Is this necessary?
            "VAR_DEFINITION_BUNDLE_PATH" => "".to_string().into(),
            "VAR_RESOLVED_PAGE_PATH" => path.to_string().owned().await?,
            "VAR_USERLAND" => INNER.into(),
        },
        fxindexmap! {
            "nextConfigOutput" => output_type
        },
        fxindexmap! {},
    )
    .await?;

    let userland_module = module_asset_context
        .process(
            source,
            Value::new(ReferenceType::Entry(EntryReferenceSubType::AppRoute)),
        )
        .module()
        .to_resolved()
        .await?;

    let inner_assets = fxindexmap! {
        INNER.into() => userland_module
    };

    let mut rsc_entry = module_asset_context
        .process(
            Vc::upcast(virtual_source),
            Value::new(ReferenceType::Internal(ResolvedVc::cell(inner_assets))),
        )
        .module();

    if is_edge {
        rsc_entry = wrap_edge_route(
            Vc::upcast(module_asset_context),
            project_root,
            rsc_entry,
            page,
            next_config,
        );
    }

    Ok(AppEntry {
        pathname,
        original_name,
        rsc_entry: rsc_entry.to_resolved().await?,
        config: config.to_resolved().await?,
    }
    .cell())
}

#[turbo_tasks::function]
async fn wrap_edge_route(
    asset_context: Vc<Box<dyn AssetContext>>,
    project_root: Vc<FileSystemPath>,
    entry: ResolvedVc<Box<dyn Module>>,
    page: AppPage,
    next_config: Vc<NextConfig>,
) -> Result<Vc<Box<dyn Module>>> {
    const INNER: &str = "INNER_ROUTE_ENTRY";

    let next_config = &*next_config.await?;

    let source = load_next_js_template(
        "edge-app-route.js",
        project_root,
        fxindexmap! {
            "VAR_USERLAND" => INNER.into(),
            "VAR_PAGE" => page.to_string().into(),
        },
        fxindexmap! {
            "nextConfig" => serde_json::to_string(next_config)?.into(),
        },
        fxindexmap! {},
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
