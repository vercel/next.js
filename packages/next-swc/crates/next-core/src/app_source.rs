use std::{collections::HashMap, io::Write as _, iter::once};

use anyhow::{bail, Result};
use async_recursion::async_recursion;
use indexmap::{indexmap, IndexMap};
use indoc::indoc;
use turbo_tasks::{primitives::JsonValueVc, TryJoinIterExt, ValueToString};
use turbopack_binding::{
    turbo::{
        tasks::{primitives::StringVc, Value},
        tasks_env::{CustomProcessEnvVc, EnvMapVc, ProcessEnvVc},
        tasks_fs::{rope::RopeBuilder, File, FileSystemPathVc},
    },
    turbopack::{
        core::{
            asset::{AssetVc, AssetsVc},
            chunk::{EvaluatableAssetVc, EvaluatableAssetsVc},
            compile_time_info::CompileTimeInfoVc,
            context::{AssetContext, AssetContextVc},
            environment::{EnvironmentIntention, ServerAddrVc},
            issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc},
            reference_type::{
                EcmaScriptModulesReferenceSubType, EntryReferenceSubType, InnerAssetsVc,
                ReferenceType,
            },
            source_asset::SourceAssetVc,
            virtual_asset::VirtualAssetVc,
        },
        dev::DevChunkingContextVc,
        dev_server::{
            html::DevHtmlAssetVc,
            source::{
                asset_graph::AssetGraphContentSourceVc,
                combined::CombinedContentSource,
                specificity::{Specificity, SpecificityElementType, SpecificityVc},
                ContentSourceData, ContentSourceVc, NoContentSourceVc,
            },
        },
        ecmascript::{
            magic_identifier,
            text::TextContentSourceAssetVc,
            utils::{FormatIter, StringifyJs},
        },
        env::ProcessEnvAssetVc,
        node::{
            debug::should_debug,
            execution_context::ExecutionContextVc,
            render::{
                node_api_source::create_node_api_source,
                rendered_source::create_node_rendered_source,
            },
            NodeEntry, NodeEntryVc, NodeRenderingEntry, NodeRenderingEntryVc,
        },
        r#static::{fixed::FixedStaticAssetVc, StaticModuleAssetVc},
        turbopack::{
            transition::{TransitionVc, TransitionsByNameVc},
            ModuleAssetContextVc,
        },
    },
};

use crate::{
    app_render::next_server_component_transition::NextServerComponentTransition,
    app_segment_config::{parse_segment_config_from_loader_tree, parse_segment_config_from_source},
    app_structure::{
        get_entrypoints, get_global_metadata, Components, Entrypoint, GlobalMetadataVc, LoaderTree,
        LoaderTreeVc, Metadata, MetadataItem, MetadataWithAltItem, OptionAppDirVc,
    },
    bootstrap::{route_bootstrap, BootstrapConfigVc},
    embed_js::{next_asset, next_js_file_path},
    env::env_for_js,
    fallback::get_fallback_page,
    mode::NextMode,
    next_client::{
        context::{
            get_client_assets_path, get_client_chunking_context, get_client_compile_time_info,
            get_client_module_options_context, get_client_resolve_options_context,
            get_client_runtime_entries, ClientContextType,
        },
        transition::NextClientTransition,
    },
    next_client_chunks::client_chunks_transition::NextClientChunksTransitionVc,
    next_client_component::{
        server_to_client_transition::NextServerToClientTransition,
        ssr_client_module_transition::NextSSRClientModuleTransition,
    },
    next_config::NextConfigVc,
    next_edge::{
        context::{get_edge_compile_time_info, get_edge_resolve_options_context},
        page_transition::NextEdgePageTransition,
        route_transition::NextEdgeRouteTransition,
    },
    next_image::module::{BlurPlaceholderMode, StructuredImageModuleType},
    next_route_matcher::{NextFallbackMatcherVc, NextParamsMatcherVc},
    next_server::context::{
        get_server_compile_time_info, get_server_module_options_context,
        get_server_resolve_options_context, ServerContextType,
    },
    util::{render_data, NextRuntime},
};

#[turbo_tasks::function]
fn pathname_to_specificity(pathname: &str) -> SpecificityVc {
    let mut current = Specificity::new();
    let mut position = 0;
    for segment in pathname.split('/') {
        if segment.starts_with('(') && segment.ends_with(')') || segment.starts_with('@') {
            // ignore
        } else if segment.starts_with("[[...") && segment.ends_with("]]")
            || segment.starts_with("[...") && segment.ends_with(']')
        {
            // optional catch all segment
            current.add(position - 1, SpecificityElementType::CatchAll);
            position += 1;
        } else if segment.starts_with("[[") || segment.ends_with("]]") {
            // optional segment
            position += 1;
        } else if segment.starts_with('[') || segment.ends_with(']') {
            current.add(position - 1, SpecificityElementType::DynamicSegment);
            position += 1;
        } else {
            // normal segment
            position += 1;
        }
    }
    SpecificityVc::cell(current)
}

#[turbo_tasks::function]
async fn next_client_transition(
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    server_root: FileSystemPathVc,
    app_dir: FileSystemPathVc,
    env: ProcessEnvVc,
    client_compile_time_info: CompileTimeInfoVc,
    next_config: NextConfigVc,
) -> Result<TransitionVc> {
    let ty = Value::new(ClientContextType::App { app_dir });
    let mode = NextMode::Development;
    let client_chunking_context = get_client_chunking_context(
        project_path,
        server_root,
        client_compile_time_info.environment(),
        ty,
    );
    let client_module_options_context = get_client_module_options_context(
        project_path,
        execution_context,
        client_compile_time_info.environment(),
        ty,
        mode,
        next_config,
    );
    let client_runtime_entries =
        get_client_runtime_entries(project_path, env, ty, mode, next_config, execution_context);
    let client_resolve_options_context =
        get_client_resolve_options_context(project_path, ty, mode, next_config, execution_context);

    Ok(NextClientTransition {
        is_app: true,
        client_chunking_context,
        client_module_options_context,
        client_resolve_options_context,
        client_compile_time_info,
        runtime_entries: client_runtime_entries,
    }
    .cell()
    .into())
}

#[turbo_tasks::function]
fn next_ssr_client_module_transition(
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    app_dir: FileSystemPathVc,
    process_env: ProcessEnvVc,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
) -> TransitionVc {
    let ty = Value::new(ServerContextType::AppSSR { app_dir });
    let mode = NextMode::Development;
    NextSSRClientModuleTransition {
        ssr_module_options_context: get_server_module_options_context(
            project_path,
            execution_context,
            ty,
            mode,
            next_config,
        ),
        ssr_resolve_options_context: get_server_resolve_options_context(
            project_path,
            ty,
            mode,
            next_config,
            execution_context,
        ),
        ssr_environment: get_server_compile_time_info(ty, mode, process_env, server_addr),
    }
    .cell()
    .into()
}

#[turbo_tasks::function]
fn next_server_component_transition(
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    app_dir: FileSystemPathVc,
    server_root: FileSystemPathVc,
    process_env: ProcessEnvVc,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
) -> TransitionVc {
    let ty = Value::new(ServerContextType::AppRSC { app_dir });
    let mode = NextMode::Development;
    let rsc_compile_time_info = get_server_compile_time_info(ty, mode, process_env, server_addr);
    let rsc_resolve_options_context =
        get_server_resolve_options_context(project_path, ty, mode, next_config, execution_context);
    let rsc_module_options_context =
        get_server_module_options_context(project_path, execution_context, ty, mode, next_config);

    NextServerComponentTransition {
        rsc_compile_time_info,
        rsc_module_options_context,
        rsc_resolve_options_context,
        server_root,
    }
    .cell()
    .into()
}

#[turbo_tasks::function]
fn next_edge_server_component_transition(
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    app_dir: FileSystemPathVc,
    server_root: FileSystemPathVc,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
) -> TransitionVc {
    let ty = Value::new(ServerContextType::AppRSC { app_dir });
    let mode = NextMode::Development;
    let rsc_compile_time_info = get_edge_compile_time_info(
        project_path,
        server_addr,
        Value::new(EnvironmentIntention::ServerRendering),
    );
    let rsc_resolve_options_context =
        get_edge_resolve_options_context(project_path, ty, next_config, execution_context);
    let rsc_module_options_context =
        get_server_module_options_context(project_path, execution_context, ty, mode, next_config);

    NextServerComponentTransition {
        rsc_compile_time_info,
        rsc_module_options_context,
        rsc_resolve_options_context,
        server_root,
    }
    .cell()
    .into()
}

#[turbo_tasks::function]
fn next_edge_route_transition(
    project_path: FileSystemPathVc,
    app_dir: FileSystemPathVc,
    server_root: FileSystemPathVc,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
    output_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
) -> TransitionVc {
    let server_ty = Value::new(ServerContextType::AppRoute { app_dir });

    let edge_compile_time_info = get_edge_compile_time_info(
        project_path,
        server_addr,
        Value::new(EnvironmentIntention::Api),
    );

    let edge_chunking_context = DevChunkingContextVc::builder(
        project_path,
        output_path.join("edge"),
        output_path.join("edge/chunks"),
        get_client_assets_path(server_root, Value::new(ClientContextType::App { app_dir })),
        edge_compile_time_info.environment(),
    )
    .reference_chunk_source_maps(should_debug("app_source"))
    .build();
    let edge_resolve_options_context =
        get_edge_resolve_options_context(project_path, server_ty, next_config, execution_context);

    NextEdgeRouteTransition {
        edge_compile_time_info,
        edge_chunking_context,
        edge_module_options_context: None,
        edge_resolve_options_context,
        output_path,
        base_path: app_dir,
        bootstrap_asset: next_asset("entry/app/edge-route-bootstrap.ts"),
        entry_name: "edge".to_string(),
    }
    .cell()
    .into()
}

#[turbo_tasks::function]
fn next_edge_page_transition(
    project_path: FileSystemPathVc,
    app_dir: FileSystemPathVc,
    server_root: FileSystemPathVc,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
    output_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
) -> TransitionVc {
    let server_ty = Value::new(ServerContextType::AppRoute { app_dir });

    let edge_compile_time_info = get_edge_compile_time_info(
        project_path,
        server_addr,
        Value::new(EnvironmentIntention::ServerRendering),
    );

    let edge_chunking_context = DevChunkingContextVc::builder(
        project_path,
        output_path.join("edge-pages"),
        output_path.join("edge-pages/chunks"),
        get_client_assets_path(server_root, Value::new(ClientContextType::App { app_dir })),
        edge_compile_time_info.environment(),
    )
    .layer("ssr")
    .reference_chunk_source_maps(should_debug("app_source"))
    .build();
    let edge_resolve_options_context =
        get_edge_resolve_options_context(project_path, server_ty, next_config, execution_context);

    NextEdgePageTransition {
        edge_compile_time_info,
        edge_chunking_context,
        edge_module_options_context: None,
        edge_resolve_options_context,
        output_path,
        bootstrap_asset: next_asset("entry/app/edge-page-bootstrap.ts"),
    }
    .cell()
    .into()
}

#[allow(clippy::too_many_arguments)]
#[turbo_tasks::function]
fn app_context(
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    server_root: FileSystemPathVc,
    app_dir: FileSystemPathVc,
    env: ProcessEnvVc,
    client_compile_time_info: CompileTimeInfoVc,
    ssr: bool,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
    output_path: FileSystemPathVc,
) -> AssetContextVc {
    let next_server_to_client_transition = NextServerToClientTransition { ssr }.cell().into();
    let mode = NextMode::Development;

    let mut transitions = HashMap::new();
    transitions.insert(
        "next-edge-route".to_string(),
        next_edge_route_transition(
            project_path,
            app_dir,
            server_root,
            next_config,
            server_addr,
            output_path,
            execution_context,
        ),
    );
    transitions.insert(
        "next-edge-page".to_string(),
        next_edge_page_transition(
            project_path,
            app_dir,
            server_root,
            next_config,
            server_addr,
            output_path,
            execution_context,
        ),
    );
    transitions.insert(
        "next-server-component".to_string(),
        next_server_component_transition(
            project_path,
            execution_context,
            app_dir,
            server_root,
            env,
            next_config,
            server_addr,
        ),
    );
    transitions.insert(
        "next-edge-server-component".to_string(),
        next_edge_server_component_transition(
            project_path,
            execution_context,
            app_dir,
            server_root,
            next_config,
            server_addr,
        ),
    );
    transitions.insert(
        "server-to-client".to_string(),
        next_server_to_client_transition,
    );
    transitions.insert(
        "next-client".to_string(),
        next_client_transition(
            project_path,
            execution_context,
            server_root,
            app_dir,
            env,
            client_compile_time_info,
            next_config,
        ),
    );
    let client_ty = Value::new(ClientContextType::App { app_dir });
    transitions.insert(
        "next-client-chunks".to_string(),
        NextClientChunksTransitionVc::new(
            project_path,
            execution_context,
            client_ty,
            mode,
            server_root,
            client_compile_time_info,
            next_config,
        )
        .into(),
    );
    transitions.insert(
        "next-ssr-client-module".to_string(),
        next_ssr_client_module_transition(
            project_path,
            execution_context,
            app_dir,
            env,
            next_config,
            server_addr,
        ),
    );

    let ssr_ty = Value::new(ServerContextType::AppSSR { app_dir });
    ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(transitions),
        get_server_compile_time_info(ssr_ty, mode, env, server_addr),
        get_server_module_options_context(
            project_path,
            execution_context,
            ssr_ty,
            mode,
            next_config,
        ),
        get_server_resolve_options_context(
            project_path,
            ssr_ty,
            mode,
            next_config,
            execution_context,
        ),
    )
    .into()
}

/// Create a content source serving the `app` or `src/app` directory as
/// Next.js app folder.
#[turbo_tasks::function]
pub async fn create_app_source(
    app_dir: OptionAppDirVc,
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    output_path: FileSystemPathVc,
    server_root: FileSystemPathVc,
    env: ProcessEnvVc,
    browserslist_query: &str,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
) -> Result<ContentSourceVc> {
    let Some(app_dir) = *app_dir.await? else {
        return Ok(NoContentSourceVc::new().into());
    };
    let entrypoints = get_entrypoints(app_dir, next_config.page_extensions());
    let metadata = get_global_metadata(app_dir, next_config.page_extensions());

    let client_compile_time_info =
        get_client_compile_time_info(NextMode::Development, browserslist_query);

    let context_ssr = app_context(
        project_path,
        execution_context,
        server_root,
        app_dir,
        env,
        client_compile_time_info,
        true,
        next_config,
        server_addr,
        output_path,
    );
    let context = app_context(
        project_path,
        execution_context,
        server_root,
        app_dir,
        env,
        client_compile_time_info,
        false,
        next_config,
        server_addr,
        output_path,
    );

    let injected_env = env_for_js(EnvMapVc::empty().into(), false, next_config);
    let env = CustomProcessEnvVc::new(env, next_config.env()).as_process_env();

    let server_runtime_entries =
        AssetsVc::cell(vec![
            ProcessEnvAssetVc::new(project_path, injected_env).into()
        ]);

    let fallback_page = get_fallback_page(
        project_path,
        execution_context,
        server_root,
        env,
        client_compile_time_info,
        next_config,
    );
    let render_data = render_data(next_config, server_addr);

    let entrypoints = entrypoints.await?;
    let mut sources: Vec<_> = entrypoints
        .iter()
        .map(|(pathname, &loader_tree)| match loader_tree {
            Entrypoint::AppPage { loader_tree } => create_app_page_source_for_route(
                pathname,
                loader_tree,
                context_ssr,
                context,
                project_path,
                app_dir,
                env,
                server_root,
                server_runtime_entries,
                fallback_page,
                output_path,
                render_data,
            ),
            Entrypoint::AppRoute { path } => create_app_route_source_for_route(
                pathname,
                path,
                context_ssr,
                project_path,
                app_dir,
                env,
                server_root,
                server_runtime_entries,
                output_path,
                render_data,
            ),
        })
        .chain(once(create_global_metadata_source(
            app_dir,
            metadata,
            server_root,
        )))
        .collect();

    if let Some(&Entrypoint::AppPage { loader_tree }) = entrypoints.get("/") {
        if loader_tree.await?.components.await?.not_found.is_some() {
            // Only add a source for the app 404 page if a top-level not-found page is
            // defined. Otherwise, the 404 page is handled by the pages logic.
            let not_found_page_source = create_app_not_found_page_source(
                loader_tree,
                context_ssr,
                context,
                project_path,
                app_dir,
                env,
                server_root,
                server_runtime_entries,
                fallback_page,
                output_path,
                render_data,
            );
            sources.push(not_found_page_source);
        }
    }

    Ok(CombinedContentSource { sources }.cell().into())
}

#[turbo_tasks::function]
async fn create_global_metadata_source(
    app_dir: FileSystemPathVc,
    metadata: GlobalMetadataVc,
    server_root: FileSystemPathVc,
) -> Result<ContentSourceVc> {
    let metadata = metadata.await?;
    let mut unsupported_metadata = Vec::new();
    let mut sources = Vec::new();
    for (server_path, item) in [
        ("robots.txt", metadata.robots),
        ("favicon.ico", metadata.favicon),
        ("sitemap.xml", metadata.sitemap),
    ] {
        let Some(item) = item else {
            continue;
        };
        match item {
            MetadataItem::Static { path } => {
                let asset = FixedStaticAssetVc::new(
                    server_root.join(server_path),
                    SourceAssetVc::new(path).into(),
                );
                sources.push(AssetGraphContentSourceVc::new_eager(server_root, asset.into()).into())
            }
            MetadataItem::Dynamic { path } => {
                unsupported_metadata.push(path);
            }
        }
    }
    if !unsupported_metadata.is_empty() {
        UnsupportedDynamicMetadataIssue {
            app_dir,
            files: unsupported_metadata,
        }
        .cell()
        .as_issue()
        .emit();
    }
    Ok(CombinedContentSource { sources }.cell().into())
}

#[allow(clippy::too_many_arguments)]
#[turbo_tasks::function]
async fn create_app_page_source_for_route(
    pathname: &str,
    loader_tree: LoaderTreeVc,
    context_ssr: AssetContextVc,
    context: AssetContextVc,
    project_path: FileSystemPathVc,
    app_dir: FileSystemPathVc,
    env: ProcessEnvVc,
    server_root: FileSystemPathVc,
    runtime_entries: AssetsVc,
    fallback_page: DevHtmlAssetVc,
    intermediate_output_path_root: FileSystemPathVc,
    render_data: JsonValueVc,
) -> Result<ContentSourceVc> {
    let pathname_vc = StringVc::cell(pathname.to_string());

    let params_matcher = NextParamsMatcherVc::new(pathname_vc);

    let source = create_node_rendered_source(
        project_path,
        env,
        pathname_to_specificity(pathname),
        server_root,
        params_matcher.into(),
        pathname_vc,
        AppRenderer {
            runtime_entries,
            app_dir,
            context_ssr,
            context,
            server_root,
            project_path,
            intermediate_output_path: intermediate_output_path_root,
            loader_tree,
        }
        .cell()
        .into(),
        fallback_page,
        render_data,
        should_debug("app_source"),
    );

    Ok(source.issue_context(app_dir, &format!("Next.js App Page Route {pathname}")))
}

#[allow(clippy::too_many_arguments)]
#[turbo_tasks::function]
async fn create_app_not_found_page_source(
    loader_tree: LoaderTreeVc,
    context_ssr: AssetContextVc,
    context: AssetContextVc,
    project_path: FileSystemPathVc,
    app_dir: FileSystemPathVc,
    env: ProcessEnvVc,
    server_root: FileSystemPathVc,
    runtime_entries: AssetsVc,
    fallback_page: DevHtmlAssetVc,
    intermediate_output_path_root: FileSystemPathVc,
    render_data: JsonValueVc,
) -> Result<ContentSourceVc> {
    let pathname_vc = StringVc::cell("/404".to_string());

    let source = create_node_rendered_source(
        project_path,
        env,
        SpecificityVc::not_found(),
        server_root,
        NextFallbackMatcherVc::new().into(),
        pathname_vc,
        AppRenderer {
            runtime_entries,
            app_dir,
            context_ssr,
            context,
            server_root,
            project_path,
            intermediate_output_path: intermediate_output_path_root,
            loader_tree,
        }
        .cell()
        .into(),
        fallback_page,
        render_data,
        should_debug("app_source"),
    );

    Ok(source.issue_context(app_dir, "Next.js App Page Route /404"))
}

#[allow(clippy::too_many_arguments)]
#[turbo_tasks::function]
async fn create_app_route_source_for_route(
    pathname: &str,
    entry_path: FileSystemPathVc,
    context_ssr: AssetContextVc,
    project_path: FileSystemPathVc,
    app_dir: FileSystemPathVc,
    env: ProcessEnvVc,
    server_root: FileSystemPathVc,
    runtime_entries: AssetsVc,
    intermediate_output_path_root: FileSystemPathVc,
    render_data: JsonValueVc,
) -> Result<ContentSourceVc> {
    let pathname_vc = StringVc::cell(pathname.to_string());

    let params_matcher = NextParamsMatcherVc::new(pathname_vc);

    let source = create_node_api_source(
        project_path,
        env,
        pathname_to_specificity(pathname),
        server_root,
        params_matcher.into(),
        pathname_vc,
        AppRoute {
            context: context_ssr,
            runtime_entries,
            server_root,
            entry_path,
            project_path,
            intermediate_output_path: intermediate_output_path_root,
            output_root: intermediate_output_path_root,
            app_dir,
        }
        .cell()
        .into(),
        render_data,
        should_debug("app_source"),
    );

    Ok(source.issue_context(app_dir, &format!("Next.js App Route {pathname}")))
}

/// The renderer for pages in app directory
#[turbo_tasks::value]
struct AppRenderer {
    runtime_entries: AssetsVc,
    app_dir: FileSystemPathVc,
    context_ssr: AssetContextVc,
    context: AssetContextVc,
    project_path: FileSystemPathVc,
    server_root: FileSystemPathVc,
    intermediate_output_path: FileSystemPathVc,
    loader_tree: LoaderTreeVc,
}

#[turbo_tasks::value_impl]
impl AppRendererVc {
    #[turbo_tasks::function]
    async fn entry(self, is_rsc: bool) -> Result<NodeRenderingEntryVc> {
        let AppRenderer {
            runtime_entries,
            app_dir,
            context_ssr,
            context,
            project_path,
            server_root,
            intermediate_output_path,
            loader_tree,
        } = *self.await?;

        let (context, intermediate_output_path) = if is_rsc {
            (context, intermediate_output_path.join("rsc"))
        } else {
            (context_ssr, intermediate_output_path)
        };

        let config = parse_segment_config_from_loader_tree(loader_tree, context);

        let runtime = config.await?.runtime;
        let rsc_transition = match runtime {
            Some(NextRuntime::NodeJs) | None => "next-server-component",
            Some(NextRuntime::Edge) => "next-edge-server-component",
        };

        struct State {
            inner_assets: IndexMap<String, AssetVc>,
            counter: usize,
            imports: Vec<String>,
            loader_tree_code: String,
            context: AssetContextVc,
            unsupported_metadata: Vec<FileSystemPathVc>,
            rsc_transition: &'static str,
        }

        impl State {
            fn unique_number(&mut self) -> usize {
                let i = self.counter;
                self.counter += 1;
                i
            }
        }

        let mut state = State {
            inner_assets: IndexMap::new(),
            counter: 0,
            imports: Vec::new(),
            loader_tree_code: String::new(),
            context,
            unsupported_metadata: Vec::new(),
            rsc_transition,
        };

        fn write_component(
            state: &mut State,
            name: &str,
            component: Option<FileSystemPathVc>,
        ) -> Result<()> {
            use std::fmt::Write;

            if let Some(component) = component {
                let i = state.unique_number();
                let identifier = magic_identifier::mangle(&format!("{name} #{i}"));
                let chunks_identifier = magic_identifier::mangle(&format!("chunks of {name} #{i}"));
                writeln!(
                    state.loader_tree_code,
                    "  {name}: [() => {identifier}, JSON.stringify({chunks_identifier}) + '.js'],",
                    name = StringifyJs(name)
                )?;
                state.imports.push(format!(
                    r#"("TURBOPACK {{ chunking-type: isolatedParallel }}");
import {}, {{ chunks as {} }} from "COMPONENT_{}";
"#,
                    identifier, chunks_identifier, i
                ));

                state.inner_assets.insert(
                    format!("COMPONENT_{i}"),
                    state.context.with_transition(state.rsc_transition).process(
                        SourceAssetVc::new(component).into(),
                        Value::new(ReferenceType::EcmaScriptModules(
                            EcmaScriptModulesReferenceSubType::Undefined,
                        )),
                    ),
                );
            }
            Ok(())
        }

        fn write_metadata(state: &mut State, metadata: &Metadata) -> Result<()> {
            if metadata.is_empty() {
                return Ok(());
            }
            let Metadata {
                icon,
                apple,
                twitter,
                open_graph,
                favicon,
                manifest,
            } = metadata;
            state.loader_tree_code += "  metadata: {";
            write_metadata_items(state, "icon", favicon.iter().chain(icon.iter()))?;
            write_metadata_items(state, "apple", apple.iter())?;
            write_metadata_items(state, "twitter", twitter.iter())?;
            write_metadata_items(state, "openGraph", open_graph.iter())?;
            write_metadata_manifest(state, *manifest)?;
            state.loader_tree_code += "  },";
            Ok(())
        }

        fn write_metadata_manifest(
            state: &mut State,
            manifest: Option<MetadataItem>,
        ) -> Result<()> {
            let Some(manifest) = manifest else {
                return Ok(());
            };
            match manifest {
                MetadataItem::Static { path } => {
                    use std::fmt::Write;
                    let i = state.unique_number();
                    let identifier = magic_identifier::mangle(&format!("manifest #{i}"));
                    let inner_module_id = format!("METADATA_{i}");
                    state
                        .imports
                        .push(format!("import {identifier} from \"{inner_module_id}\";"));
                    state.inner_assets.insert(
                        inner_module_id,
                        StaticModuleAssetVc::new(SourceAssetVc::new(path).into(), state.context)
                            .into(),
                    );
                    writeln!(state.loader_tree_code, "    manifest: {identifier},")?;
                }
                MetadataItem::Dynamic { path } => {
                    state.unsupported_metadata.push(path);
                }
            }

            Ok(())
        }

        fn write_metadata_items<'a>(
            state: &mut State,
            name: &str,
            it: impl Iterator<Item = &'a MetadataWithAltItem>,
        ) -> Result<()> {
            use std::fmt::Write;
            let mut it = it.peekable();
            if it.peek().is_none() {
                return Ok(());
            }
            writeln!(state.loader_tree_code, "    {name}: [")?;
            for item in it {
                write_metadata_item(state, name, item)?;
            }
            writeln!(state.loader_tree_code, "    ],")?;
            Ok(())
        }

        fn write_metadata_item(
            state: &mut State,
            name: &str,
            item: &MetadataWithAltItem,
        ) -> Result<()> {
            use std::fmt::Write;
            let i = state.unique_number();
            let identifier = magic_identifier::mangle(&format!("{name} #{i}"));
            let inner_module_id = format!("METADATA_{i}");
            state
                .imports
                .push(format!("import {identifier} from \"{inner_module_id}\";"));
            let s = "      ";
            match item {
                MetadataWithAltItem::Static { path, alt_path } => {
                    state.inner_assets.insert(
                        inner_module_id,
                        StructuredImageModuleType::create_module(
                            SourceAssetVc::new(*path).into(),
                            BlurPlaceholderMode::None,
                            state.context,
                        ),
                    );
                    writeln!(state.loader_tree_code, "{s}(async (props) => [{{")?;
                    writeln!(state.loader_tree_code, "{s}  url: {identifier}.src,")?;
                    let numeric_sizes = name == "twitter" || name == "openGraph";
                    if numeric_sizes {
                        writeln!(state.loader_tree_code, "{s}  width: {identifier}.width,")?;
                        writeln!(state.loader_tree_code, "{s}  height: {identifier}.height,")?;
                    } else {
                        writeln!(
                            state.loader_tree_code,
                            "{s}  sizes: `${{{identifier}.width}}x${{{identifier}.height}}`,"
                        )?;
                    }
                    if let Some(alt_path) = alt_path {
                        let identifier = magic_identifier::mangle(&format!("{name} alt text #{i}"));
                        let inner_module_id = format!("METADATA_ALT_{i}");
                        state
                            .imports
                            .push(format!("import {identifier} from \"{inner_module_id}\";"));
                        state.inner_assets.insert(
                            inner_module_id,
                            state.context.process(
                                TextContentSourceAssetVc::new(SourceAssetVc::new(*alt_path).into())
                                    .into(),
                                Value::new(ReferenceType::Internal(InnerAssetsVc::empty())),
                            ),
                        );
                        writeln!(state.loader_tree_code, "{s}  alt: {identifier},")?;
                    }
                    writeln!(state.loader_tree_code, "{s}}}]),")?;
                }
                MetadataWithAltItem::Dynamic { path, .. } => {
                    state.unsupported_metadata.push(*path);
                }
            }
            Ok(())
        }

        #[async_recursion]
        async fn walk_tree(state: &mut State, loader_tree: LoaderTreeVc) -> Result<()> {
            use std::fmt::Write;

            let LoaderTree {
                segment,
                parallel_routes,
                components,
            } = &*loader_tree.await?;

            writeln!(
                state.loader_tree_code,
                "[{segment}, {{",
                segment = StringifyJs(segment)
            )?;
            // add parallel_routers
            for (key, &parallel_route) in parallel_routes.iter() {
                write!(state.loader_tree_code, "{key}: ", key = StringifyJs(key))?;
                walk_tree(state, parallel_route).await?;
                writeln!(state.loader_tree_code, ",")?;
            }
            writeln!(state.loader_tree_code, "}}, {{")?;
            // add components
            let Components {
                page,
                default,
                error,
                layout,
                loading,
                template,
                not_found,
                metadata,
                route: _,
            } = &*components.await?;
            write_component(state, "page", *page)?;
            write_component(state, "defaultPage", *default)?;
            write_component(state, "error", *error)?;
            write_component(state, "layout", *layout)?;
            write_component(state, "loading", *loading)?;
            write_component(state, "template", *template)?;
            write_component(state, "not-found", *not_found)?;
            write_metadata(state, metadata)?;
            write!(state.loader_tree_code, "}}]")?;
            Ok(())
        }

        walk_tree(&mut state, loader_tree).await?;

        let State {
            inner_assets,
            imports,
            loader_tree_code,
            unsupported_metadata,
            ..
        } = state;

        if !unsupported_metadata.is_empty() {
            UnsupportedDynamicMetadataIssue {
                app_dir,
                files: unsupported_metadata,
            }
            .cell()
            .as_issue()
            .emit();
        }

        let mut result = RopeBuilder::from(indoc! {"
                \"TURBOPACK { chunking-type: isolatedParallel; transition: next-edge-server-component }\";
                import GlobalErrorMod from \"next/dist/client/components/error-boundary\"
                const { GlobalError } = GlobalErrorMod;
                \"TURBOPACK { chunking-type: isolatedParallel; transition: next-edge-server-component }\";
                import base from \"next/dist/server/app-render/entry-base\"\n
            "});

        for import in imports {
            writeln!(result, "{import}")?;
        }

        writeln!(result, "const tree = {loader_tree_code};\n")?;
        writeln!(result, "const pathname = '';\n")?;
        writeln!(
            result,
            // Need this hack because "export *" from CommonJS will trigger a warning
            // otherwise
            "__turbopack_export_value__({{ tree, GlobalError, pathname, ...base }});\n"
        )?;

        let file = File::from(result.build());
        let asset = VirtualAssetVc::new(next_js_file_path("entry/app-entry.tsx"), file.into());

        let chunking_context = DevChunkingContextVc::builder(
            project_path,
            intermediate_output_path,
            intermediate_output_path.join("chunks"),
            get_client_assets_path(server_root, Value::new(ClientContextType::App { app_dir })),
            context.compile_time_info().environment(),
        )
        .layer("ssr")
        .reference_chunk_source_maps(should_debug("app_source"))
        .build();

        let renderer_module = match runtime {
            Some(NextRuntime::NodeJs) | None => context.process(
                SourceAssetVc::new(next_js_file_path("entry/app-renderer.tsx")).into(),
                Value::new(ReferenceType::Internal(InnerAssetsVc::cell(indexmap! {
                    "APP_ENTRY".to_string() => context.with_transition(rsc_transition).process(
                        asset.into(),
                        Value::new(ReferenceType::Internal(InnerAssetsVc::cell(inner_assets))),
                    ),
                    "APP_BOOTSTRAP".to_string() => context.with_transition("next-client").process(
                        SourceAssetVc::new(next_js_file_path("entry/app/hydrate.tsx")).into(),
                        Value::new(ReferenceType::EcmaScriptModules(
                            EcmaScriptModulesReferenceSubType::Undefined,
                        )),
                    ),
                }))),
            ),
            Some(NextRuntime::Edge) =>
                context.process(
                    SourceAssetVc::new(next_js_file_path("entry/app-edge-renderer.tsx")).into(),
                    Value::new(ReferenceType::Internal(InnerAssetsVc::cell(indexmap! {
                        "INNER_EDGE_CHUNK_GROUP".to_string() => context.with_transition("next-edge-page").process(
                            asset.into(),
                            Value::new(ReferenceType::Internal(InnerAssetsVc::cell(inner_assets))),
                        ),
                    }))),
                )
        };

        let Some(module) = EvaluatableAssetVc::resolve_from(renderer_module).await? else {
            bail!("internal module must be evaluatable");
        };

        Ok(NodeRenderingEntry {
            runtime_entries: EvaluatableAssetsVc::cell(
                runtime_entries
                    .await?
                    .iter()
                    .map(|entry| EvaluatableAssetVc::from_asset(*entry, context))
                    .collect(),
            ),
            module,
            chunking_context,
            intermediate_output_path,
            output_root: intermediate_output_path.root(),
            project_dir: project_path,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl NodeEntry for AppRenderer {
    #[turbo_tasks::function]
    fn entry(self_vc: AppRendererVc, data: Value<ContentSourceData>) -> NodeRenderingEntryVc {
        let data = data.into_value();
        let is_rsc = if let Some(headers) = data.headers {
            headers.contains_key("rsc")
        } else {
            false
        };
        // Call with only is_rsc as key
        self_vc.entry(is_rsc)
    }
}

/// The node.js renderer api routes in the app directory
#[turbo_tasks::value]
struct AppRoute {
    runtime_entries: AssetsVc,
    context: AssetContextVc,
    entry_path: FileSystemPathVc,
    intermediate_output_path: FileSystemPathVc,
    project_path: FileSystemPathVc,
    server_root: FileSystemPathVc,
    output_root: FileSystemPathVc,
    app_dir: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl AppRouteVc {
    #[turbo_tasks::function]
    async fn entry(self) -> Result<NodeRenderingEntryVc> {
        let this = self.await?;

        let chunking_context = DevChunkingContextVc::builder(
            this.project_path,
            this.intermediate_output_path,
            this.intermediate_output_path.join("chunks"),
            get_client_assets_path(
                this.server_root,
                Value::new(ClientContextType::App {
                    app_dir: this.app_dir,
                }),
            ),
            this.context.compile_time_info().environment(),
        )
        .layer("ssr")
        .reference_chunk_source_maps(should_debug("app_source"))
        .build();

        let entry_source_asset = SourceAssetVc::new(this.entry_path);
        let entry_asset = this.context.process(
            entry_source_asset.into(),
            Value::new(ReferenceType::Entry(EntryReferenceSubType::AppRoute)),
        );

        let config = parse_segment_config_from_source(entry_asset);
        let module = match config.await?.runtime {
            Some(NextRuntime::NodeJs) | None => {
                let bootstrap_asset = next_asset("entry/app/route.ts");

                route_bootstrap(
                    entry_asset,
                    this.context,
                    this.project_path,
                    bootstrap_asset,
                    BootstrapConfigVc::empty(),
                )
            }
            Some(NextRuntime::Edge) => {
                let internal_asset = next_asset("entry/app/edge-route.ts");

                let entry = this.context.with_transition("next-edge-route").process(
                    entry_source_asset.into(),
                    Value::new(ReferenceType::Entry(EntryReferenceSubType::AppRoute)),
                );

                let module = this.context.process(
                    internal_asset,
                    Value::new(ReferenceType::Internal(InnerAssetsVc::cell(indexmap! {
                        "ROUTE_CHUNK_GROUP".to_string() => entry
                    }))),
                );

                let Some(module) = EvaluatableAssetVc::resolve_from(module).await? else {
                    bail!("internal module must be evaluatable");
                };

                module
            }
        };

        Ok(NodeRenderingEntry {
            runtime_entries: EvaluatableAssetsVc::cell(
                this.runtime_entries
                    .await?
                    .iter()
                    .map(|entry| EvaluatableAssetVc::from_asset(*entry, this.context))
                    .collect(),
            ),
            module,
            chunking_context,
            intermediate_output_path: this.intermediate_output_path,
            output_root: this.output_root,
            project_dir: this.project_path,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl NodeEntry for AppRoute {
    #[turbo_tasks::function]
    fn entry(self_vc: AppRouteVc, _data: Value<ContentSourceData>) -> NodeRenderingEntryVc {
        // Call without being keyed by data
        self_vc.entry()
    }
}

#[turbo_tasks::value]
struct UnsupportedDynamicMetadataIssue {
    app_dir: FileSystemPathVc,
    files: Vec<FileSystemPathVc>,
}

#[turbo_tasks::value_impl]
impl Issue for UnsupportedDynamicMetadataIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("unsupported".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.app_dir
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell(
            "Dynamic metadata from filesystem is currently not supported in Turbopack".to_string(),
        )
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        let mut files = self
            .files
            .iter()
            .map(|file| file.to_string())
            .try_join()
            .await?;
        files.sort();
        Ok(StringVc::cell(format!(
            "The following files were found in the app directory, but are not supported by \
             Turbopack. They are ignored:\n{}",
            FormatIter(|| files.iter().flat_map(|file| vec!["\n- ", file]))
        )))
    }
}
