use std::{collections::HashMap, io::Write as _, iter::once};

use anyhow::{bail, Result};
use indexmap::indexmap;
use indoc::indoc;
use turbo_tasks::primitives::{JsonValueVc, OptionStringVc};
use turbopack_binding::{
    turbo::{
        tasks::{primitives::StringVc, Value},
        tasks_env::{CustomProcessEnvVc, EnvMapVc, ProcessEnvVc},
        tasks_fs::{rope::RopeBuilder, File, FileSystemPathVc},
    },
    turbopack::{
        core::{
            chunk::{ChunkingContextVc, EvaluatableAssetVc, EvaluatableAssetsVc},
            compile_time_info::CompileTimeInfoVc,
            context::AssetContext,
            environment::ServerAddrVc,
            file_source::FileSourceVc,
            reference_type::{
                EcmaScriptModulesReferenceSubType, EntryReferenceSubType, InnerAssetsVc,
                ReferenceType,
            },
            source::SourcesVc,
            virtual_source::VirtualSourceVc,
        },
        dev::DevChunkingContextVc,
        dev_server::{
            html::DevHtmlAssetVc,
            source::{
                asset_graph::AssetGraphContentSourceVc,
                combined::CombinedContentSource,
                route_tree::{BaseSegment, RouteType},
                ContentSourceData, ContentSourceVc, NoContentSourceVc,
            },
        },
        ecmascript::chunk::EcmascriptChunkingContextVc,
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
        r#static::fixed::FixedStaticAssetVc,
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
        get_entrypoints, get_global_metadata, Entrypoint, GlobalMetadataVc, LoaderTreeVc,
        MetadataItem, OptionAppDirVc,
    },
    bootstrap::{route_bootstrap, BootstrapConfigVc},
    embed_js::{next_asset, next_js_file_path},
    env::env_for_js,
    fallback::get_fallback_page,
    loader_tree::{LoaderTreeModule, ServerComponentTransition},
    mode::NextMode,
    next_client::{
        context::{
            get_client_assets_path, get_client_module_options_context,
            get_client_resolve_options_context, get_client_runtime_entries, ClientContextType,
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
    next_route_matcher::{NextFallbackMatcherVc, NextParamsMatcherVc},
    next_server::context::{
        get_server_compile_time_info, get_server_module_options_context,
        get_server_resolve_options_context, ServerContextType,
    },
    util::{render_data, NextRuntime},
    UnsupportedDynamicMetadataIssue,
};

fn pathname_to_segments(pathname: &str) -> Result<(Vec<BaseSegment>, RouteType)> {
    let mut segments = Vec::new();
    let mut split = pathname.split('/');
    while let Some(segment) = split.next() {
        if segment.is_empty()
            || (segment.starts_with('(') && segment.ends_with(')') || segment.starts_with('@'))
        {
            // ignore
        } else if segment.starts_with("[[...") && segment.ends_with("]]")
            || segment.starts_with("[...") && segment.ends_with(']')
        {
            // (optional) catch all segment
            if split.remainder().is_some() {
                bail!(
                    "Invalid route {}, catch all segment must be the last segment",
                    pathname
                )
            }
            return Ok((segments, RouteType::CatchAll));
        } else if segment.starts_with('[') || segment.ends_with(']') {
            // dynamic segment
            segments.push(BaseSegment::Dynamic);
        } else {
            // normal segment
            segments.push(BaseSegment::Static(segment.to_string()));
        }
    }
    Ok((segments, RouteType::Exact))
}

#[turbo_tasks::function]
async fn next_client_transition(
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    app_dir: FileSystemPathVc,
    env: ProcessEnvVc,
    client_chunking_context: ChunkingContextVc,
    client_compile_time_info: CompileTimeInfoVc,
    next_config: NextConfigVc,
) -> Result<TransitionVc> {
    let ty: Value<ClientContextType> = Value::new(ClientContextType::App { app_dir });
    let mode = NextMode::Development;
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
        ssr_environment: get_server_compile_time_info(mode, process_env, server_addr),
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
    mode: NextMode,
    process_env: ProcessEnvVc,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
    ecmascript_client_reference_transition_name: StringVc,
) -> TransitionVc {
    let ty = Value::new(ServerContextType::AppRSC {
        app_dir,
        client_transition: None,
        ecmascript_client_reference_transition_name: Some(
            ecmascript_client_reference_transition_name,
        ),
    });
    let rsc_compile_time_info = get_server_compile_time_info(mode, process_env, server_addr);
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
    mode: NextMode,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
    ecmascript_client_reference_transition_name: StringVc,
) -> TransitionVc {
    let ty = Value::new(ServerContextType::AppRSC {
        app_dir,
        client_transition: None,
        ecmascript_client_reference_transition_name: Some(
            ecmascript_client_reference_transition_name,
        ),
    });
    let rsc_compile_time_info = get_edge_compile_time_info(project_path, server_addr);
    let rsc_resolve_options_context =
        get_edge_resolve_options_context(project_path, ty, mode, next_config, execution_context);
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
    let mode = NextMode::Development;
    let server_ty = Value::new(ServerContextType::AppRoute { app_dir });

    let edge_compile_time_info = get_edge_compile_time_info(project_path, server_addr);

    let edge_chunking_context = DevChunkingContextVc::builder(
        project_path,
        output_path.join("edge"),
        output_path.join("edge/chunks"),
        get_client_assets_path(server_root),
        edge_compile_time_info.environment(),
    )
    .reference_chunk_source_maps(should_debug("app_source"))
    .build()
    .into();
    let edge_resolve_options_context = get_edge_resolve_options_context(
        project_path,
        server_ty,
        mode,
        next_config,
        execution_context,
    );

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
    mode: NextMode,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
    output_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
) -> TransitionVc {
    let server_ty = Value::new(ServerContextType::AppRoute { app_dir });

    let edge_compile_time_info = get_edge_compile_time_info(project_path, server_addr);

    let edge_chunking_context = DevChunkingContextVc::builder(
        project_path,
        output_path.join("edge-pages"),
        output_path.join("edge-pages/chunks"),
        get_client_assets_path(server_root),
        edge_compile_time_info.environment(),
    )
    .layer("ssr")
    .reference_chunk_source_maps(should_debug("app_source"))
    .build()
    .into();
    let edge_resolve_options_context = get_edge_resolve_options_context(
        project_path,
        server_ty,
        mode,
        next_config,
        execution_context,
    );

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
    client_chunking_context: EcmascriptChunkingContextVc,
    client_compile_time_info: CompileTimeInfoVc,
    ssr: bool,
    mode: NextMode,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
    output_path: FileSystemPathVc,
) -> ModuleAssetContextVc {
    let next_server_to_client_transition = NextServerToClientTransition { ssr }.cell().into();

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
            mode,
            next_config,
            server_addr,
            output_path,
            execution_context,
        ),
    );
    let ecmacscript_client_reference_transition_name = "server-to-client".to_string();
    transitions.insert(
        "next-server-component".to_string(),
        next_server_component_transition(
            project_path,
            execution_context,
            app_dir,
            server_root,
            mode,
            env,
            next_config,
            server_addr,
            StringVc::cell(ecmacscript_client_reference_transition_name.clone()),
        ),
    );
    transitions.insert(
        "next-edge-server-component".to_string(),
        next_edge_server_component_transition(
            project_path,
            execution_context,
            app_dir,
            server_root,
            mode,
            next_config,
            server_addr,
            StringVc::cell(ecmacscript_client_reference_transition_name.clone()),
        ),
    );
    transitions.insert(
        ecmacscript_client_reference_transition_name,
        next_server_to_client_transition,
    );
    transitions.insert(
        "next-client".to_string(),
        next_client_transition(
            project_path,
            execution_context,
            app_dir,
            env,
            client_chunking_context.into(),
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
            client_chunking_context,
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
        get_server_compile_time_info(mode, env, server_addr),
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
    client_base_path: OptionStringVc,
    env: ProcessEnvVc,
    client_chunking_context: EcmascriptChunkingContextVc,
    client_compile_time_info: CompileTimeInfoVc,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
) -> Result<ContentSourceVc> {
    let Some(app_dir) = *app_dir.await? else {
        return Ok(NoContentSourceVc::new().into());
    };
    let entrypoints = get_entrypoints(app_dir, next_config.page_extensions());
    let metadata = get_global_metadata(app_dir, next_config.page_extensions());

    let context_ssr = app_context(
        project_path,
        execution_context,
        server_root,
        app_dir,
        env,
        client_chunking_context,
        client_compile_time_info,
        true,
        NextMode::Development,
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
        client_chunking_context,
        client_compile_time_info,
        false,
        NextMode::Development,
        next_config,
        server_addr,
        output_path,
    );

    let injected_env = env_for_js(EnvMapVc::empty().into(), false, next_config);
    let env = CustomProcessEnvVc::new(env, next_config.env()).as_process_env();

    let server_runtime_entries =
        SourcesVc::cell(vec![
            ProcessEnvAssetVc::new(project_path, injected_env).into()
        ]);

    let fallback_page = get_fallback_page(
        project_path,
        execution_context,
        server_root,
        client_base_path,
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
                client_base_path,
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
                client_base_path,
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
                    FileSourceVc::new(path).into(),
                );
                sources.push(
                    AssetGraphContentSourceVc::new_eager(
                        server_root,
                        Default::default(),
                        asset.into(),
                    )
                    .into(),
                )
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
    context_ssr: ModuleAssetContextVc,
    context: ModuleAssetContextVc,
    project_path: FileSystemPathVc,
    app_dir: FileSystemPathVc,
    env: ProcessEnvVc,
    server_root: FileSystemPathVc,
    client_base_path: OptionStringVc,
    runtime_entries: SourcesVc,
    fallback_page: DevHtmlAssetVc,
    intermediate_output_path_root: FileSystemPathVc,
    render_data: JsonValueVc,
) -> Result<ContentSourceVc> {
    let pathname_vc = StringVc::cell(pathname.to_string());

    let params_matcher = NextParamsMatcherVc::new(pathname_vc);

    let (base_segments, route_type) = pathname_to_segments(pathname)?;

    let source = create_node_rendered_source(
        project_path,
        env,
        base_segments,
        route_type,
        server_root,
        client_base_path,
        params_matcher.into(),
        pathname_vc,
        AppRenderer {
            runtime_entries,
            app_dir,
            context_ssr,
            context,
            server_root,
            client_base_path,
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
    context_ssr: ModuleAssetContextVc,
    context: ModuleAssetContextVc,
    project_path: FileSystemPathVc,
    app_dir: FileSystemPathVc,
    env: ProcessEnvVc,
    server_root: FileSystemPathVc,
    client_base_path: OptionStringVc,
    runtime_entries: SourcesVc,
    fallback_page: DevHtmlAssetVc,
    intermediate_output_path_root: FileSystemPathVc,
    render_data: JsonValueVc,
) -> Result<ContentSourceVc> {
    let pathname_vc = StringVc::cell("/404".to_string());

    let source = create_node_rendered_source(
        project_path,
        env,
        Vec::new(),
        RouteType::NotFound,
        server_root,
        client_base_path,
        NextFallbackMatcherVc::new().into(),
        pathname_vc,
        AppRenderer {
            runtime_entries,
            app_dir,
            context_ssr,
            context,
            server_root,
            client_base_path,
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
    context_ssr: ModuleAssetContextVc,
    project_path: FileSystemPathVc,
    app_dir: FileSystemPathVc,
    env: ProcessEnvVc,
    server_root: FileSystemPathVc,
    runtime_entries: SourcesVc,
    intermediate_output_path_root: FileSystemPathVc,
    render_data: JsonValueVc,
) -> Result<ContentSourceVc> {
    let pathname_vc = StringVc::cell(pathname.to_string());

    let params_matcher = NextParamsMatcherVc::new(pathname_vc);

    let (base_segments, route_type) = pathname_to_segments(pathname)?;

    let source = create_node_api_source(
        project_path,
        env,
        base_segments,
        route_type,
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
    runtime_entries: SourcesVc,
    app_dir: FileSystemPathVc,
    context_ssr: ModuleAssetContextVc,
    context: ModuleAssetContextVc,
    project_path: FileSystemPathVc,
    server_root: FileSystemPathVc,
    client_base_path: OptionStringVc,
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
            client_base_path,
            intermediate_output_path,
            loader_tree,
        } = *self.await?;

        let (context, intermediate_output_path) = if is_rsc {
            (context, intermediate_output_path.join("rsc"))
        } else {
            (context_ssr, intermediate_output_path)
        };

        let config = parse_segment_config_from_loader_tree(loader_tree, context.into());

        let runtime = config.await?.runtime;
        let rsc_transition = match runtime {
            Some(NextRuntime::NodeJs) | None => "next-server-component",
            Some(NextRuntime::Edge) => "next-edge-server-component",
        };

        let loader_tree_module = LoaderTreeModule::build(
            loader_tree,
            context,
            ServerComponentTransition::TransitionName(rsc_transition.to_string()),
            NextMode::Development,
        )
        .await?;

        if !loader_tree_module.unsupported_metadata.is_empty() {
            UnsupportedDynamicMetadataIssue {
                app_dir,
                files: loader_tree_module.unsupported_metadata,
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

        for import in loader_tree_module.imports {
            writeln!(result, "{import}")?;
        }

        writeln!(
            result,
            "const tree = {loader_tree_code};\n",
            loader_tree_code = loader_tree_module.loader_tree_code
        )?;
        writeln!(result, "const pathname = '';\n")?;
        writeln!(
            result,
            // Need this hack because "export *" from CommonJS will trigger a warning
            // otherwise
            "__turbopack_export_value__({{ tree, GlobalError, pathname, ...base }});\n"
        )?;

        let file = File::from(result.build());
        let asset = VirtualSourceVc::new(next_js_file_path("entry/app-entry.tsx"), file.into());

        let chunking_context = DevChunkingContextVc::builder(
            project_path,
            intermediate_output_path,
            intermediate_output_path.join("chunks"),
            get_client_assets_path(server_root),
            context.compile_time_info().environment(),
        )
        .layer("ssr")
        .reference_chunk_source_maps(should_debug("app_source"))
        .chunk_base_path(client_base_path)
        .build();

        let renderer_module = match runtime {
            Some(NextRuntime::NodeJs) | None => context.process(
                FileSourceVc::new(next_js_file_path("entry/app-renderer.tsx")).into(),
                Value::new(ReferenceType::Internal(InnerAssetsVc::cell(indexmap! {
                    "APP_ENTRY".to_string() => context.with_transition(rsc_transition).process(
                        asset.into(),
                        Value::new(ReferenceType::Internal(InnerAssetsVc::cell(loader_tree_module.inner_assets))),
                    ).into(),
                    "APP_BOOTSTRAP".to_string() => context.with_transition("next-client").process(
                        FileSourceVc::new(next_js_file_path("entry/app/hydrate.tsx")).into(),
                        Value::new(ReferenceType::EcmaScriptModules(
                            EcmaScriptModulesReferenceSubType::Undefined,
                        )),
                    ).into(),
                }))),
            ),
            Some(NextRuntime::Edge) =>
                context.process(
                    FileSourceVc::new(next_js_file_path("entry/app-edge-renderer.tsx")).into(),
                    Value::new(ReferenceType::Internal(InnerAssetsVc::cell(indexmap! {
                        "INNER_EDGE_CHUNK_GROUP".to_string() => context.with_transition("next-edge-page").process(
                            asset.into(),
                            Value::new(ReferenceType::Internal(InnerAssetsVc::cell(loader_tree_module.inner_assets))),
                        ).into(),
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
                    .map(|entry| EvaluatableAssetVc::from_source(*entry, context.into()))
                    .collect(),
            ),
            module,
            chunking_context: chunking_context.into(),
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
    runtime_entries: SourcesVc,
    context: ModuleAssetContextVc,
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
            get_client_assets_path(this.server_root),
            this.context.compile_time_info().environment(),
        )
        .layer("ssr")
        .reference_chunk_source_maps(should_debug("app_source"))
        .build()
        .into();

        let entry_file_source = FileSourceVc::new(this.entry_path);
        let entry_asset = this.context.process(
            entry_file_source.into(),
            Value::new(ReferenceType::Entry(EntryReferenceSubType::AppRoute)),
        );

        let config = parse_segment_config_from_source(entry_asset);
        let module = match config.await?.runtime {
            Some(NextRuntime::NodeJs) | None => {
                let bootstrap_asset = next_asset("entry/app/route.ts");

                route_bootstrap(
                    entry_asset.into(),
                    this.context.into(),
                    this.project_path,
                    bootstrap_asset,
                    BootstrapConfigVc::empty(),
                )
            }
            Some(NextRuntime::Edge) => {
                let internal_asset = next_asset("entry/app/edge-route.ts");

                let entry = this.context.with_transition("next-edge-route").process(
                    entry_file_source.into(),
                    Value::new(ReferenceType::Entry(EntryReferenceSubType::AppRoute)),
                );

                let module = this.context.process(
                    internal_asset,
                    Value::new(ReferenceType::Internal(InnerAssetsVc::cell(indexmap! {
                        "ROUTE_CHUNK_GROUP".to_string() => entry.into()
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
                    .map(|entry| EvaluatableAssetVc::from_source(*entry, this.context.into()))
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
