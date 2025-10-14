use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::FileSystemPath;
use turbopack::ModuleAssetContext;
use turbopack_core::{
    context::AssetContext,
    module::Module,
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
};

use crate::{
    next_app::{AppEntry, AppPage, AppPath},
    next_config::{NextConfig, OutputType},
    next_edge::entry::wrap_edge_entry,
    parse_segment_config_from_source,
    segment_config::{NextSegmentConfig, ParseSegmentMode},
    util::{NextRuntime, app_function_name, load_next_js_template},
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
    project_root: FileSystemPath,
    original_segment_config: Option<Vc<NextSegmentConfig>>,
    next_config: Vc<NextConfig>,
) -> Result<Vc<AppEntry>> {
    let segment_from_source = parse_segment_config_from_source(source, ParseSegmentMode::App);
    let config = if let Some(original_segment_config) = original_segment_config {
        let mut segment_config = segment_from_source.owned().await?;
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

    let path = source.ident().path().owned().await?;

    let inner = rcstr!("INNER_APP_ROUTE");

    let output_type: &str = next_config
        .output()
        .await?
        .as_ref()
        .map(|o| match o {
            OutputType::Standalone => "\"standalone\"",
            OutputType::Export => "\"export\"",
        })
        .unwrap_or("\"\"");

    // Load the file from the next.js codebase.
    let virtual_source = load_next_js_template(
        "app-route.js",
        project_root.clone(),
        &[
            ("VAR_DEFINITION_PAGE", &*page.to_string()),
            ("VAR_DEFINITION_PATHNAME", &pathname),
            ("VAR_DEFINITION_FILENAME", path.file_stem().unwrap()),
            // TODO(alexkirsz) Is this necessary?
            ("VAR_DEFINITION_BUNDLE_PATH", ""),
            ("VAR_RESOLVED_PAGE_PATH", &path.value_to_string().await?),
            ("VAR_USERLAND", &inner),
        ],
        &[("nextConfigOutput", output_type)],
        &[],
    )
    .await?;

    let userland_module = module_asset_context
        .process(
            source,
            ReferenceType::Entry(EntryReferenceSubType::AppRoute),
        )
        .module()
        .to_resolved()
        .await?;

    let inner_assets = fxindexmap! {
        inner => userland_module
    };

    let mut rsc_entry = module_asset_context
        .process(
            virtual_source,
            ReferenceType::Internal(ResolvedVc::cell(inner_assets)),
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
    project_root: FileSystemPath,
    entry: ResolvedVc<Box<dyn Module>>,
    page: AppPage,
    next_config: Vc<NextConfig>,
) -> Result<Vc<Box<dyn Module>>> {
    let inner = rcstr!("INNER_ROUTE_ENTRY");

    let next_config = &*next_config.await?;

    let source = load_next_js_template(
        "edge-app-route.js",
        project_root.clone(),
        &[("VAR_USERLAND", &*inner), ("VAR_PAGE", &page.to_string())],
        &[("nextConfig", &*serde_json::to_string(next_config)?)],
        &[],
    )
    .await?;

    let inner_assets = fxindexmap! {
        inner => entry
    };

    let wrapped = asset_context
        .process(
            source,
            ReferenceType::Internal(ResolvedVc::cell(inner_assets)),
        )
        .module();

    Ok(wrap_edge_entry(
        asset_context,
        project_root.clone(),
        wrapped,
        app_function_name(&page).into(),
    ))
}
