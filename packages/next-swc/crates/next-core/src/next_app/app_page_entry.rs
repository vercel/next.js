use std::io::Write;

use anyhow::{bail, Result};
use indexmap::indexmap;
use turbo_tasks::{TryJoinIterExt, Value, ValueToString, Vc};
use turbopack_binding::{
    turbo::tasks_fs::{rope::RopeBuilder, File, FileSystemPath},
    turbopack::{
        core::{
            asset::{Asset, AssetContent},
            context::AssetContext,
            module::Module,
            reference_type::ReferenceType,
            source::Source,
            virtual_source::VirtualSource,
        },
        ecmascript::{chunk::EcmascriptChunkPlaceable, utils::StringifyJs},
        turbopack::ModuleAssetContext,
    },
};

use super::app_entry::AppEntry;
use crate::{
    app_structure::LoaderTree,
    loader_tree::LoaderTreeModule,
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
    loader_tree: Vc<LoaderTree>,
    page: AppPage,
    project_root: Vc<FileSystemPath>,
    next_config: Vc<NextConfig>,
) -> Result<Vc<AppEntry>> {
    let config = parse_segment_config_from_loader_tree(loader_tree);
    let is_edge = matches!(config.await?.runtime, Some(NextRuntime::Edge));
    let context = if is_edge {
        edge_context
    } else {
        nodejs_context
    };

    let server_component_transition = Vc::upcast(NextServerComponentTransition::new());

    let loader_tree =
        LoaderTreeModule::build(loader_tree, context, server_component_transition).await?;

    let LoaderTreeModule {
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

    let original_name = page.to_string();
    let pathname = AppPath::from(page.clone()).to_string();

    // Load the file from the next.js codebase.
    let source = load_next_js_template(
        "app-page.js",
        project_root,
        indexmap! {
            "VAR_DEFINITION_PAGE" => page.to_string(),
            "VAR_DEFINITION_PATHNAME" => pathname.clone(),
            "VAR_ORIGINAL_PATHNAME" => original_name.clone(),
            // TODO(alexkirsz) Support custom global error.
            "VAR_MODULE_GLOBAL_ERROR" => "next/dist/client/components/error-boundary".to_string(),
        },
        indexmap! {
            "tree" => loader_tree_code,
            "pages" => StringifyJs(&pages).to_string(),
            "__next_app_require__" => "__turbopack_require__".to_string(),
            "__next_app_load_chunk__" => " __turbopack_load__".to_string(),
        },
        indexmap! {},
    )
    .await?;

    let source_content = &*file_content_rope(source.content().file_content()).await?;

    result.concat(source_content);

    let query = qstring::QString::new(vec![("page", page.to_string())]);

    let file = File::from(result.build());
    let source = VirtualSource::new_with_ident(
        source.ident().with_query(Vc::cell(query.to_string())),
        AssetContent::file(file.into()),
    );

    let mut rsc_entry = context
        .process(
            Vc::upcast(source),
            Value::new(ReferenceType::Internal(Vc::cell(inner_assets))),
        )
        .module();

    if is_edge {
        rsc_entry = wrap_edge_page(
            Vc::upcast(context),
            project_root,
            rsc_entry,
            page,
            next_config,
        );
    };

    let Some(rsc_entry) =
        Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkPlaceable>>(rsc_entry).await?
    else {
        bail!("expected an ECMAScript chunk placeable module");
    };

    Ok(AppEntry {
        pathname,
        original_name,
        rsc_entry,
        config,
    }
    .cell())
}

#[turbo_tasks::function]
async fn wrap_edge_page(
    context: Vc<Box<dyn AssetContext>>,
    project_root: Vc<FileSystemPath>,
    entry: Vc<Box<dyn Module>>,
    page: AppPage,
    next_config: Vc<NextConfig>,
) -> Result<Vc<Box<dyn Module>>> {
    const INNER: &str = "INNER_PAGE_ENTRY";

    let next_config = &*next_config.await?;

    // TODO(WEB-1824): add build support
    let build_id = "development";
    let dev = true;

    // TODO(timneutkens): remove this
    let is_server_component = true;

    let server_actions = next_config.experimental.server_actions.as_ref();

    let sri_enabled = !dev
        && next_config
            .experimental
            .sri
            .as_ref()
            .map(|sri| sri.algorithm.as_ref())
            .is_some();

    let source = load_next_js_template(
        "edge-ssr-app.js",
        project_root,
        indexmap! {
            "VAR_USERLAND" => INNER.to_string(),
            "VAR_PAGE" => page.to_string(),
            "VAR_BUILD_ID" => build_id.to_string(),
        },
        indexmap! {
            "sriEnabled" => serde_json::Value::Bool(sri_enabled).to_string(),
            "nextConfig" => serde_json::to_string(next_config)?,
            "isServerComponent" => serde_json::Value::Bool(is_server_component).to_string(),
            "dev" => serde_json::Value::Bool(dev).to_string(),
            "serverActions" => serde_json::to_string(&server_actions)?
        },
        indexmap! {
            "incrementalCacheHandler" => None,
        },
    )
    .await?;

    let inner_assets = indexmap! {
        INNER.to_string() => entry
    };

    let wrapped = context
        .process(
            Vc::upcast(source),
            Value::new(ReferenceType::Internal(Vc::cell(inner_assets))),
        )
        .module();

    Ok(wrap_edge_entry(
        context,
        project_root,
        wrapped,
        AppPath::from(page).to_string(),
    ))
}
