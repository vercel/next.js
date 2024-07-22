use std::io::Write;

use anyhow::Result;
use indexmap::indexmap;
use turbo_tasks::{RcStr, TryJoinIterExt, Value, ValueToString, Vc};
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
        ecmascript::utils::StringifyJs,
        turbopack::ModuleAssetContext,
    },
};

use super::app_entry::AppEntry;
use crate::{
    app_structure::LoaderTree,
    loader_tree::{LoaderTreeModule, GLOBAL_ERROR},
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

    let base_path = next_config.await?.base_path.clone();
    let loader_tree =
        LoaderTreeModule::build(loader_tree, context, server_component_transition, base_path)
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

    let original_name: RcStr = page.to_string().into();
    let pathname: RcStr = AppPath::from(page.clone()).to_string().into();

    // Load the file from the next.js codebase.
    let source = load_next_js_template(
        "app-page.js",
        project_root,
        indexmap! {
            "VAR_DEFINITION_PAGE" => page.to_string().into(),
            "VAR_DEFINITION_PATHNAME" => pathname.clone(),
            "VAR_MODULE_GLOBAL_ERROR" => if inner_assets.contains_key(GLOBAL_ERROR) {
                GLOBAL_ERROR.into()
             } else {
                "next/dist/client/components/error-boundary".into()
            },
        },
        indexmap! {
            "tree" => loader_tree_code,
            "pages" => StringifyJs(&pages).to_string().into(),
            "__next_app_require__" => "__turbopack_require__".into(),
            "__next_app_load_chunk__" => " __turbopack_load__".into(),
        },
        indexmap! {},
    )
    .await?;

    let source_content = &*file_content_rope(source.content().file_content()).await?;

    result.concat(source_content);

    let query = qstring::QString::new(vec![("page", page.to_string())]);

    let file = File::from(result.build());
    let source = VirtualSource::new_with_ident(
        source
            .ident()
            .with_query(Vc::cell(query.to_string().into())),
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
            "VAR_USERLAND" => INNER.into(),
            "VAR_PAGE" => page.to_string().into(),
        },
        indexmap! {
            "sriEnabled" => serde_json::Value::Bool(sri_enabled).to_string().into(),
            "nextConfig" => serde_json::to_string(next_config)?.into(),
            "isServerComponent" => serde_json::Value::Bool(is_server_component).to_string().into(),
            "dev" => serde_json::Value::Bool(dev).to_string().into(),
            "serverActions" => serde_json::to_string(&server_actions)?.into(),
        },
        indexmap! {
            "incrementalCacheHandler" => None,
        },
    )
    .await?;

    let inner_assets = indexmap! {
        INNER.into() => entry
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
        AppPath::from(page).to_string().into(),
    ))
}
