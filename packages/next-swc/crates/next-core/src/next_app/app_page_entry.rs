use std::io::Write;

use anyhow::{bail, Result};
use turbo_tasks::{TryJoinIterExt, Value, ValueToString, Vc};
use turbopack_binding::{
    turbo::tasks_fs::{rope::RopeBuilder, File, FileSystemPath},
    turbopack::{
        core::{
            asset::AssetContent, context::AssetContext, reference_type::ReferenceType,
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
    util::{load_next_js_template, virtual_next_js_template_path, NextRuntime},
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

    let template_file = "app-page.js";

    // Load the file from the next.js codebase.
    let file = load_next_js_template(project_root, template_file.to_string()).await?;

    let mut file = file
        .to_str()?
        .replace(
            "\"VAR_DEFINITION_PAGE\"",
            &StringifyJs(&page.to_string()).to_string(),
        )
        .replace(
            "\"VAR_DEFINITION_PATHNAME\"",
            &StringifyJs(&pathname).to_string(),
        )
        .replace(
            "\"VAR_ORIGINAL_PATHNAME\"",
            &StringifyJs(&original_name).to_string(),
        )
        // TODO(alexkirsz) Support custom global error.
        .replace(
            "\"VAR_MODULE_GLOBAL_ERROR\"",
            &StringifyJs("next/dist/client/components/error-boundary").to_string(),
        )
        .replace(
            "// INJECT:tree",
            format!("const tree = {};", loader_tree_code).as_str(),
        )
        .replace(
            "// INJECT:pages",
            format!("const pages = {};", StringifyJs(&pages)).as_str(),
        )
        .replace(
            "// INJECT:__next_app_require__",
            "const __next_app_require__ = __turbopack_require__",
        )
        .replace(
            "// INJECT:__next_app_load_chunk__",
            "const __next_app_load_chunk__ = __turbopack_load__",
        );

    // Ensure that the last line is a newline.
    if !file.ends_with('\n') {
        file.push('\n');
    }

    result.push_bytes(file.as_bytes());

    let file = File::from(result.build());

    let template_path = virtual_next_js_template_path(project_root, template_file.to_string());

    let source = VirtualSource::new(template_path, AssetContent::file(file.into()));

    let rsc_entry = context.process(
        Vc::upcast(source),
        Value::new(ReferenceType::Internal(Vc::cell(inner_assets))),
    );

    if is_edge {
        todo!("edge pages are not supported yet")
    }

    let Some(rsc_entry) =
        Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkPlaceable>>(rsc_entry).await?
    else {
        bail!("expected an ECMAScript chunk placeable module");
    };

    Ok(AppEntry {
        pathname: pathname.to_string(),
        original_name,
        rsc_entry,
        config,
    }
    .cell())
}
