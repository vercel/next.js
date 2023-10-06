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
    mode::NextMode,
    next_app::{AppPage, AppPath},
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
) -> Result<Vc<AppEntry>> {
    let config = parse_segment_config_from_loader_tree(loader_tree, Vc::upcast(nodejs_context));
    let is_edge = matches!(config.await?.runtime, Some(NextRuntime::Edge));
    let context = if is_edge {
        edge_context
    } else {
        nodejs_context
    };

    let server_component_transition = Vc::upcast(NextServerComponentTransition::new());

    let loader_tree = LoaderTreeModule::build(
        loader_tree,
        context,
        server_component_transition,
        NextMode::Build,
    )
    .await?;

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
    )
    .await?;

    let source_content = &*file_content_rope(source.content().file_content()).await?;

    result.concat(source_content);

    let file = File::from(result.build());
    let source = VirtualSource::new(source.ident().path(), AssetContent::file(file.into()));

    let mut rsc_entry = context.process(
        Vc::upcast(source),
        Value::new(ReferenceType::Internal(Vc::cell(inner_assets))),
    );

    if is_edge {
        rsc_entry = wrap_edge_entry(context, project_root, rsc_entry).await?;
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

async fn wrap_edge_entry(
    context: Vc<ModuleAssetContext>,
    project_root: Vc<FileSystemPath>,
    entry: Vc<Box<dyn Module>>,
) -> Result<Vc<Box<dyn Module>>> {
    const INNER: &str = "INNER_RSC_ENTRY";

    let source = load_next_js_template(
        "edge-app-route.js",
        project_root,
        indexmap! {
            "VAR_USERLAND" => INNER.to_string(),
        },
        indexmap! {},
    )
    .await?;

    let inner_assets = indexmap! {
        INNER.to_string() => entry
    };

    Ok(context.process(
        Vc::upcast(source),
        Value::new(ReferenceType::Internal(Vc::cell(inner_assets))),
    ))
}
