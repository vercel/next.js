use std::io::Write;

use anyhow::Result;
use indexmap::indexmap;
use turbo_tasks::{RcStr, Value, ValueToString, Vc};
use turbo_tasks_fs::{rope::RopeBuilder, File, FileSystemPath};
use turbopack::ModuleAssetContext;
use turbopack_core::{
    asset::{Asset, AssetContent},
    context::AssetContext,
    module::Module,
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
    virtual_source::VirtualSource,
};

use crate::{
    app_route_loader_tree::AppRouteLoaderTreeModule,
    app_segment_config::NextSegmentConfig,
    app_structure::FileSystemPathVec,
    next_app::{AppEntry, AppPage, AppPath},
    next_config::{NextConfig, OutputType},
    next_edge::entry::wrap_edge_entry,
    next_server_component::NextServerComponentTransition,
    parse_segment_config_from_source,
    util::{file_content_rope, load_next_js_template, NextRuntime},
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
    interceptors: Vc<FileSystemPathVec>,
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

    let server_component_transition = Vc::upcast(NextServerComponentTransition::new());

    let loader_tree = AppRouteLoaderTreeModule::build(
        interceptors,
        module_asset_context,
        server_component_transition,
        project_root,
    )
    .await?;

    let AppRouteLoaderTreeModule {
        inner_assets,
        imports,
        interceptors_code,
    } = loader_tree;

    let mut result = RopeBuilder::default();

    for import in imports {
        writeln!(result, "{import}")?;
    }

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
        indexmap! {
            "VAR_DEFINITION_PAGE" => page.to_string().into(),
            "VAR_DEFINITION_PATHNAME" => pathname.clone(),
            "VAR_DEFINITION_FILENAME" => path.file_stem().await?.as_ref().unwrap().as_str().into(),
            // TODO(alexkirsz) Is this necessary?
            "VAR_DEFINITION_BUNDLE_PATH" => "".to_string().into(),
            "VAR_RESOLVED_PAGE_PATH" => path.to_string().await?.clone_value(),
            "VAR_USERLAND" => INNER.into(),
        },
        indexmap! {
            "nextConfigOutput" => output_type,
            "interceptors" => interceptors_code.clone()
        },
        indexmap! {},
    )
    .await?;

    let source_content = &*file_content_rope(virtual_source.content().file_content()).await?;

    result.concat(source_content);

    let query = qstring::QString::new(vec![("page", page.to_string())]);

    let file = File::from(result.build());
    let virtual_source = VirtualSource::new_with_ident(
        virtual_source
            .ident()
            .with_query(Vc::cell(query.to_string().into())),
        AssetContent::file(file.into()),
    );

    let userland_module = module_asset_context
        .process(
            source,
            Value::new(ReferenceType::Entry(EntryReferenceSubType::AppRoute)),
        )
        .module();

    let mut merged_inner_assets = inner_assets.clone();

    merged_inner_assets.insert(INNER.into(), userland_module);

    let mut rsc_entry = module_asset_context
        .process(
            Vc::upcast(virtual_source),
            Value::new(ReferenceType::Internal(Vc::cell(merged_inner_assets))),
        )
        .module();

    if is_edge {
        rsc_entry = wrap_edge_route(
            Vc::upcast(module_asset_context),
            project_root,
            rsc_entry,
            pathname.clone(),
        );
    }

    Ok(AppEntry {
        pathname,
        original_name,
        rsc_entry,
        config,
    }
    .cell())
}

#[turbo_tasks::function]
async fn wrap_edge_route(
    asset_context: Vc<Box<dyn AssetContext>>,
    project_root: Vc<FileSystemPath>,
    entry: Vc<Box<dyn Module>>,
    pathname: RcStr,
) -> Result<Vc<Box<dyn Module>>> {
    const INNER: &str = "INNER_ROUTE_ENTRY";

    let source = load_next_js_template(
        "edge-app-route.js",
        project_root,
        indexmap! {
            "VAR_USERLAND" => INNER.into(),
        },
        indexmap! {},
        indexmap! {},
    )
    .await?;

    let inner_assets = indexmap! {
        INNER.into() => entry
    };

    let wrapped = asset_context
        .process(
            Vc::upcast(source),
            Value::new(ReferenceType::Internal(Vc::cell(inner_assets))),
        )
        .module();

    Ok(wrap_edge_entry(
        asset_context,
        project_root,
        wrapped,
        pathname,
    ))
}
