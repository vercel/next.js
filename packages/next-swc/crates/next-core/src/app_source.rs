use std::{collections::HashMap, io::Write as _, iter::once};

use anyhow::{bail, Result};
use indexmap::indexmap;
use indoc::indoc;
use serde_json::Value as JsonValue;
use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::{
        tasks::Value,
        tasks_env::{CustomProcessEnv, EnvMap, ProcessEnv},
        tasks_fs::{rope::RopeBuilder, File, FileSystemPath},
    },
    turbopack::{
        core::{
            asset::AssetContent,
            chunk::{ChunkingContext, EvaluatableAsset, EvaluatableAssetExt},
            compile_time_info::CompileTimeInfo,
            context::AssetContext,
            environment::ServerAddr,
            file_source::FileSource,
            issue::IssueExt,
            reference_type::{
                EcmaScriptModulesReferenceSubType, EntryReferenceSubType, ReferenceType,
            },
            source::Sources,
            virtual_source::VirtualSource,
        },
        dev::DevChunkingContext,
        dev_server::{
            html::DevHtmlAsset,
            source::{
                asset_graph::AssetGraphContentSource,
                combined::CombinedContentSource,
                route_tree::{BaseSegment, RouteType},
                ContentSource, ContentSourceData, ContentSourceExt, NoContentSource,
            },
        },
        ecmascript::chunk::EcmascriptChunkingContext,
        env::ProcessEnvAsset,
        node::{
            debug::should_debug,
            execution_context::ExecutionContext,
            render::{
                node_api_source::create_node_api_source,
                rendered_source::create_node_rendered_source,
            },
            NodeEntry, NodeRenderingEntry,
        },
        r#static::fixed::FixedStaticAsset,
        turbopack::{transition::Transition, ModuleAssetContext},
    },
};

use crate::{
    app_render::next_server_component_transition::NextServerComponentTransition,
    app_segment_config::{parse_segment_config_from_loader_tree, parse_segment_config_from_source},
    app_structure::{
        get_entrypoints, get_global_metadata, Entrypoint, GlobalMetadata, LoaderTree, MetadataItem,
        OptionAppDir,
    },
    bootstrap::{route_bootstrap, BootstrapConfig},
    embed_js::{next_asset, next_js_file_path},
    env::env_for_js,
    fallback::get_fallback_page,
    loader_tree::{LoaderTreeModule, ServerComponentTransition},
    mode::NextMode,
    next_app::UnsupportedDynamicMetadataIssue,
    next_client::{
        context::{
            get_client_assets_path, get_client_module_options_context,
            get_client_resolve_options_context, get_client_runtime_entries, ClientContextType,
        },
        transition::NextClientTransition,
    },
    next_client_chunks::client_chunks_transition::NextClientChunksTransition,
    next_client_component::{
        server_to_client_transition::NextServerToClientTransition,
        ssr_client_module_transition::NextSSRClientModuleTransition,
    },
    next_config::NextConfig,
    next_edge::{
        context::{get_edge_compile_time_info, get_edge_resolve_options_context},
        page_transition::NextEdgePageTransition,
        route_transition::NextEdgeRouteTransition,
    },
    next_route_matcher::{NextFallbackMatcher, NextParamsMatcher},
    next_server::{
        context::{
            get_server_compile_time_info, get_server_module_options_context,
            get_server_resolve_options_context, ServerContextType,
        },
        route_transition::NextRouteTransition,
    },
    util::{render_data, NextRuntime},
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
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    app_dir: Vc<FileSystemPath>,
    env: Vc<Box<dyn ProcessEnv>>,
    client_chunking_context: Vc<Box<dyn ChunkingContext>>,
    client_compile_time_info: Vc<CompileTimeInfo>,
    next_config: Vc<NextConfig>,
) -> Result<Vc<Box<dyn Transition>>> {
    let ty: Value<ClientContextType> = Value::new(ClientContextType::App { app_dir });
    let mode = NextMode::DevServer;
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

    Ok(Vc::upcast(
        NextClientTransition {
            is_app: true,
            client_chunking_context,
            client_module_options_context,
            client_resolve_options_context,
            client_compile_time_info,
            runtime_entries: client_runtime_entries,
        }
        .cell(),
    ))
}

#[turbo_tasks::function]
fn next_ssr_client_module_transition(
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    app_dir: Vc<FileSystemPath>,
    process_env: Vc<Box<dyn ProcessEnv>>,
    next_config: Vc<NextConfig>,
    server_addr: Vc<ServerAddr>,
) -> Vc<Box<dyn Transition>> {
    let ty = Value::new(ServerContextType::AppSSR { app_dir });
    let mode = NextMode::DevServer;
    Vc::upcast(
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
        .cell(),
    )
}

#[turbo_tasks::function]
fn next_edge_ssr_client_module_transition(
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    app_dir: Vc<FileSystemPath>,
    next_config: Vc<NextConfig>,
    server_addr: Vc<ServerAddr>,
) -> Vc<Box<dyn Transition>> {
    let ty = Value::new(ServerContextType::AppSSR { app_dir });
    let mode = NextMode::DevServer;
    Vc::upcast(
        NextSSRClientModuleTransition {
            ssr_module_options_context: get_server_module_options_context(
                project_path,
                execution_context,
                ty,
                mode,
                next_config,
            ),
            ssr_resolve_options_context: get_edge_resolve_options_context(
                project_path,
                ty,
                mode,
                next_config,
                execution_context,
            ),
            ssr_environment: get_edge_compile_time_info(project_path, server_addr),
        }
        .cell(),
    )
}

#[turbo_tasks::function]
fn next_server_component_transition(
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    app_dir: Vc<FileSystemPath>,
    server_root: Vc<FileSystemPath>,
    process_env: Vc<Box<dyn ProcessEnv>>,
    next_config: Vc<NextConfig>,
    server_addr: Vc<ServerAddr>,
    ecmascript_client_reference_transition_name: Vc<String>,
) -> Vc<Box<dyn Transition>> {
    let mode = NextMode::DevServer;
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

    Vc::upcast(
        NextServerComponentTransition {
            rsc_compile_time_info,
            rsc_module_options_context,
            rsc_resolve_options_context,
            server_root,
        }
        .cell(),
    )
}

#[turbo_tasks::function]
fn next_route_transition(
    project_path: Vc<FileSystemPath>,
    app_dir: Vc<FileSystemPath>,
    process_env: Vc<Box<dyn ProcessEnv>>,
    next_config: Vc<NextConfig>,
    server_addr: Vc<ServerAddr>,
    execution_context: Vc<ExecutionContext>,
) -> Vc<Box<dyn Transition>> {
    let mode = NextMode::DevServer;
    let server_ty = Value::new(ServerContextType::AppRoute { app_dir });

    let server_compile_time_info = get_server_compile_time_info(mode, process_env, server_addr);

    let server_resolve_options_context = get_server_resolve_options_context(
        project_path,
        server_ty,
        mode,
        next_config,
        execution_context,
    );

    Vc::upcast(
        NextRouteTransition {
            server_compile_time_info,
            server_resolve_options_context,
        }
        .cell(),
    )
}

#[turbo_tasks::function]
fn next_edge_server_component_transition(
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    app_dir: Vc<FileSystemPath>,
    server_root: Vc<FileSystemPath>,
    mode: NextMode,
    next_config: Vc<NextConfig>,
    server_addr: Vc<ServerAddr>,
    ecmascript_client_reference_transition_name: Vc<String>,
) -> Vc<Box<dyn Transition>> {
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

    Vc::upcast(
        NextServerComponentTransition {
            rsc_compile_time_info,
            rsc_module_options_context,
            rsc_resolve_options_context,
            server_root,
        }
        .cell(),
    )
}

#[turbo_tasks::function]
fn next_edge_route_transition(
    project_path: Vc<FileSystemPath>,
    app_dir: Vc<FileSystemPath>,
    server_root: Vc<FileSystemPath>,
    next_config: Vc<NextConfig>,
    server_addr: Vc<ServerAddr>,
    output_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
) -> Vc<Box<dyn Transition>> {
    let mode = NextMode::DevServer;
    let server_ty = Value::new(ServerContextType::AppRoute { app_dir });

    let edge_compile_time_info = get_edge_compile_time_info(project_path, server_addr);

    let edge_chunking_context = Vc::upcast(
        DevChunkingContext::builder(
            project_path,
            output_path.join("edge".to_string()),
            output_path.join("edge/chunks".to_string()),
            get_client_assets_path(server_root),
            edge_compile_time_info.environment(),
        )
        .reference_chunk_source_maps(should_debug("app_source"))
        .build(),
    );
    let edge_resolve_options_context = get_edge_resolve_options_context(
        project_path,
        server_ty,
        mode,
        next_config,
        execution_context,
    );

    Vc::upcast(
        NextEdgeRouteTransition {
            edge_compile_time_info,
            edge_chunking_context,
            edge_module_options_context: None,
            edge_resolve_options_context,
            output_path,
            base_path: app_dir,
            bootstrap_asset: next_asset("entry/app/edge-route-bootstrap.ts".to_string()),
            entry_name: "edge".to_string(),
        }
        .cell(),
    )
}

#[turbo_tasks::function]
fn next_edge_page_transition(
    project_path: Vc<FileSystemPath>,
    app_dir: Vc<FileSystemPath>,
    server_root: Vc<FileSystemPath>,
    mode: NextMode,
    next_config: Vc<NextConfig>,
    server_addr: Vc<ServerAddr>,
    output_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
) -> Vc<Box<dyn Transition>> {
    let server_ty = Value::new(ServerContextType::AppSSR { app_dir });

    let edge_compile_time_info = get_edge_compile_time_info(project_path, server_addr);

    let edge_chunking_context = Vc::upcast(
        DevChunkingContext::builder(
            project_path,
            output_path.join("edge-pages".to_string()),
            output_path.join("edge-pages/chunks".to_string()),
            get_client_assets_path(server_root),
            edge_compile_time_info.environment(),
        )
        .layer("ssr")
        .reference_chunk_source_maps(should_debug("app_source"))
        .build(),
    );
    let edge_resolve_options_context = get_edge_resolve_options_context(
        project_path,
        server_ty,
        mode,
        next_config,
        execution_context,
    );

    Vc::upcast(
        NextEdgePageTransition {
            edge_compile_time_info,
            edge_chunking_context,
            edge_module_options_context: None,
            edge_resolve_options_context,
            output_path,
            bootstrap_asset: next_asset("entry/app/edge-page-bootstrap.ts".to_string()),
        }
        .cell(),
    )
}

#[allow(clippy::too_many_arguments)]
#[turbo_tasks::function]
fn app_context(
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    server_root: Vc<FileSystemPath>,
    app_dir: Vc<FileSystemPath>,
    env: Vc<Box<dyn ProcessEnv>>,
    client_chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    client_compile_time_info: Vc<CompileTimeInfo>,
    ssr: bool,
    mode: NextMode,
    next_config: Vc<NextConfig>,
    server_addr: Vc<ServerAddr>,
    output_path: Vc<FileSystemPath>,
) -> Vc<ModuleAssetContext> {
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
        "next-route".to_string(),
        next_route_transition(
            project_path,
            app_dir,
            env,
            next_config,
            server_addr,
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
            env,
            next_config,
            server_addr,
            Vc::cell(ecmacscript_client_reference_transition_name.clone()),
        ),
    );
    transitions.insert(
        ecmacscript_client_reference_transition_name,
        Vc::upcast(NextServerToClientTransition { ssr, edge: false }.cell()),
    );
    let ecmacscript_edge_client_reference_transition_name = "edge-server-to-client".to_string();
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
            Vc::cell(ecmacscript_edge_client_reference_transition_name.clone()),
        ),
    );
    transitions.insert(
        ecmacscript_edge_client_reference_transition_name,
        Vc::upcast(NextServerToClientTransition { ssr, edge: true }.cell()),
    );
    transitions.insert(
        "next-client".to_string(),
        next_client_transition(
            project_path,
            execution_context,
            app_dir,
            env,
            Vc::upcast(client_chunking_context),
            client_compile_time_info,
            next_config,
        ),
    );
    let client_ty = Value::new(ClientContextType::App { app_dir });
    transitions.insert(
        "next-client-chunks".to_string(),
        Vc::upcast(NextClientChunksTransition::new(
            project_path,
            execution_context,
            client_ty,
            mode,
            client_chunking_context,
            client_compile_time_info,
            next_config,
        )),
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
    transitions.insert(
        "next-edge-ssr-client-module".to_string(),
        next_edge_ssr_client_module_transition(
            project_path,
            execution_context,
            app_dir,
            next_config,
            server_addr,
        ),
    );

    let ssr_ty = Value::new(ServerContextType::AppSSR { app_dir });
    ModuleAssetContext::new(
        Vc::cell(transitions),
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
    app_dir: Vc<OptionAppDir>,
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    output_path: Vc<FileSystemPath>,
    server_root: Vc<FileSystemPath>,
    env: Vc<Box<dyn ProcessEnv>>,
    client_chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    client_compile_time_info: Vc<CompileTimeInfo>,
    next_config: Vc<NextConfig>,
    server_addr: Vc<ServerAddr>,
) -> Result<Vc<Box<dyn ContentSource>>> {
    let Some(app_dir) = *app_dir.await? else {
        return Ok(Vc::upcast(NoContentSource::new()));
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
        NextMode::DevServer,
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
        NextMode::DevServer,
        next_config,
        server_addr,
        output_path,
    );

    let injected_env = env_for_js(Vc::upcast(EnvMap::empty()), false, next_config);
    let env = Vc::upcast(CustomProcessEnv::new(env, next_config.env()));

    let server_runtime_entries = Vc::cell(vec![Vc::upcast(ProcessEnvAsset::new(
        project_path,
        injected_env,
    ))]);

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
        .map(|(pathname, entrypoint)| match *entrypoint {
            Entrypoint::AppPage {
                original_name: _,
                loader_tree,
            } => create_app_page_source_for_route(
                pathname.clone(),
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
            Entrypoint::AppRoute {
                original_name: _,
                path,
            } => create_app_route_source_for_route(
                pathname.clone(),
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

    if let Some(&Entrypoint::AppPage {
        original_name: _,
        loader_tree,
    }) = entrypoints.get("/_not-found")
    {
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

    Ok(Vc::upcast(CombinedContentSource { sources }.cell()))
}

#[turbo_tasks::function]
async fn create_global_metadata_source(
    app_dir: Vc<FileSystemPath>,
    metadata: Vc<GlobalMetadata>,
    server_root: Vc<FileSystemPath>,
) -> Result<Vc<Box<dyn ContentSource>>> {
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
                let asset = FixedStaticAsset::new(
                    server_root.join(server_path.to_string()),
                    Vc::upcast(FileSource::new(path)),
                );
                sources.push(Vc::upcast(AssetGraphContentSource::new_eager(
                    server_root,
                    Vc::upcast(asset),
                )))
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
        .emit();
    }
    Ok(Vc::upcast(CombinedContentSource { sources }.cell()))
}

#[allow(clippy::too_many_arguments)]
#[turbo_tasks::function]
async fn create_app_page_source_for_route(
    pathname: String,
    loader_tree: Vc<LoaderTree>,
    context_ssr: Vc<ModuleAssetContext>,
    context: Vc<ModuleAssetContext>,
    project_path: Vc<FileSystemPath>,
    app_dir: Vc<FileSystemPath>,
    env: Vc<Box<dyn ProcessEnv>>,
    server_root: Vc<FileSystemPath>,
    runtime_entries: Vc<Sources>,
    fallback_page: Vc<DevHtmlAsset>,
    intermediate_output_path_root: Vc<FileSystemPath>,
    render_data: Vc<JsonValue>,
) -> Result<Vc<Box<dyn ContentSource>>> {
    let pathname_vc = Vc::cell(pathname.clone());

    let params_matcher = NextParamsMatcher::new(pathname_vc);

    let (base_segments, route_type) = pathname_to_segments(&pathname)?;

    let source = create_node_rendered_source(
        project_path,
        env,
        base_segments,
        route_type,
        server_root,
        Vc::upcast(params_matcher),
        pathname_vc,
        Vc::upcast(
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
            .cell(),
        ),
        fallback_page,
        render_data,
        should_debug("app_source"),
    );

    Ok(source.issue_file_path(app_dir, format!("Next.js App Page Route {pathname}")))
}

#[allow(clippy::too_many_arguments)]
#[turbo_tasks::function]
async fn create_app_not_found_page_source(
    loader_tree: Vc<LoaderTree>,
    context_ssr: Vc<ModuleAssetContext>,
    context: Vc<ModuleAssetContext>,
    project_path: Vc<FileSystemPath>,
    app_dir: Vc<FileSystemPath>,
    env: Vc<Box<dyn ProcessEnv>>,
    server_root: Vc<FileSystemPath>,
    runtime_entries: Vc<Sources>,
    fallback_page: Vc<DevHtmlAsset>,
    intermediate_output_path_root: Vc<FileSystemPath>,
    render_data: Vc<JsonValue>,
) -> Result<Vc<Box<dyn ContentSource>>> {
    let pathname_vc = Vc::cell("/404".to_string());

    let source = create_node_rendered_source(
        project_path,
        env,
        Vec::new(),
        RouteType::NotFound,
        server_root,
        Vc::upcast(NextFallbackMatcher::new()),
        pathname_vc,
        Vc::upcast(
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
            .cell(),
        ),
        fallback_page,
        render_data,
        should_debug("app_source"),
    );

    Ok(source.issue_file_path(app_dir, "Next.js App Page Route /404".to_string()))
}

#[allow(clippy::too_many_arguments)]
#[turbo_tasks::function]
async fn create_app_route_source_for_route(
    pathname: String,
    entry_path: Vc<FileSystemPath>,
    context_ssr: Vc<ModuleAssetContext>,
    project_path: Vc<FileSystemPath>,
    app_dir: Vc<FileSystemPath>,
    env: Vc<Box<dyn ProcessEnv>>,
    server_root: Vc<FileSystemPath>,
    runtime_entries: Vc<Sources>,
    intermediate_output_path_root: Vc<FileSystemPath>,
    render_data: Vc<JsonValue>,
) -> Result<Vc<Box<dyn ContentSource>>> {
    let pathname_vc = Vc::cell(pathname.to_string());

    let params_matcher = NextParamsMatcher::new(pathname_vc);

    let (base_segments, route_type) = pathname_to_segments(&pathname)?;

    let source = create_node_api_source(
        project_path,
        env,
        base_segments,
        route_type,
        server_root,
        Vc::upcast(params_matcher),
        pathname_vc,
        Vc::upcast(
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
            .cell(),
        ),
        render_data,
        should_debug("app_source"),
    );

    Ok(source.issue_file_path(app_dir, format!("Next.js App Route {pathname}")))
}

/// The renderer for pages in app directory
#[turbo_tasks::value]
struct AppRenderer {
    runtime_entries: Vc<Sources>,
    app_dir: Vc<FileSystemPath>,
    context_ssr: Vc<ModuleAssetContext>,
    context: Vc<ModuleAssetContext>,
    project_path: Vc<FileSystemPath>,
    server_root: Vc<FileSystemPath>,
    intermediate_output_path: Vc<FileSystemPath>,
    loader_tree: Vc<LoaderTree>,
}

#[turbo_tasks::value_impl]
impl AppRenderer {
    #[turbo_tasks::function]
    async fn entry(self: Vc<Self>, with_ssr: bool) -> Result<Vc<NodeRenderingEntry>> {
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

        let (context, intermediate_output_path) = if with_ssr {
            (context_ssr, intermediate_output_path)
        } else {
            (context, intermediate_output_path.join("rsc".to_string()))
        };

        let config = parse_segment_config_from_loader_tree(loader_tree, Vc::upcast(context));

        let runtime = config.await?.runtime;
        let rsc_transition = match runtime {
            Some(NextRuntime::NodeJs) | None => "next-server-component",
            Some(NextRuntime::Edge) => "next-edge-server-component",
        };

        let loader_tree_module = LoaderTreeModule::build(
            loader_tree,
            context,
            ServerComponentTransition::TransitionName(rsc_transition.to_string()),
            NextMode::DevServer,
        )
        .await?;

        if !loader_tree_module.unsupported_metadata.is_empty() {
            UnsupportedDynamicMetadataIssue {
                app_dir,
                files: loader_tree_module.unsupported_metadata,
            }
            .cell()
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
        let asset = VirtualSource::new(
            next_js_file_path("entry/app-entry.tsx".to_string()),
            AssetContent::file(file.into()),
        );

        let chunking_context = DevChunkingContext::builder(
            project_path,
            intermediate_output_path,
            intermediate_output_path.join("chunks".to_string()),
            get_client_assets_path(server_root),
            context.compile_time_info().environment(),
        )
        .layer("ssr")
        .reference_chunk_source_maps(should_debug("app_source"))
        .build();

        let renderer_module = match runtime {
            Some(NextRuntime::NodeJs) | None => context.process(
                Vc::upcast(FileSource::new(next_js_file_path("entry/app-renderer.tsx".to_string()))),
                Value::new(ReferenceType::Internal(Vc::cell(indexmap! {
                    "APP_ENTRY".to_string() => context.with_transition(rsc_transition.to_string()).process(
                        Vc::upcast(asset),
                        Value::new(ReferenceType::Internal(Vc::cell(loader_tree_module.inner_assets))),
                    ),
                    "APP_BOOTSTRAP".to_string() =>context.with_transition("next-client".to_string()).process(
                        Vc::upcast(FileSource::new(next_js_file_path("entry/app/hydrate.tsx".to_string()))),
                        Value::new(ReferenceType::EcmaScriptModules(
                            EcmaScriptModulesReferenceSubType::Undefined,
                        )),
                    ),
                }))),
            ),
            Some(NextRuntime::Edge) =>
                context.process(
                    Vc::upcast(FileSource::new(next_js_file_path("entry/app-edge-renderer.tsx".to_string()))),
                    Value::new(ReferenceType::Internal(Vc::cell(indexmap! {
                        "INNER_EDGE_CHUNK_GROUP".to_string() => context.with_transition("next-edge-page".to_string()).process(
                            Vc::upcast(asset),
                            Value::new(ReferenceType::Internal(Vc::cell(loader_tree_module.inner_assets))),
                        ),
                    }))),
                )
        };

        let Some(module) =
            Vc::try_resolve_sidecast::<Box<dyn EvaluatableAsset>>(renderer_module).await?
        else {
            bail!("internal module must be evaluatable");
        };

        Ok(NodeRenderingEntry {
            runtime_entries: Vc::cell(
                runtime_entries
                    .await?
                    .iter()
                    .map(|entry| entry.to_evaluatable(Vc::upcast(context)))
                    .collect(),
            ),
            module,
            chunking_context: Vc::upcast(chunking_context),
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
    fn entry(self: Vc<Self>, data: Value<ContentSourceData>) -> Vc<NodeRenderingEntry> {
        let data = data.into_value();
        let with_ssr = if let Some(headers) = data.headers {
            !headers.contains_key("rsc")
        } else {
            true
        };
        // Call with only with_ssr as key
        self.entry(with_ssr)
    }
}

/// The node.js renderer api routes in the app directory
#[turbo_tasks::value]
struct AppRoute {
    runtime_entries: Vc<Sources>,
    context: Vc<ModuleAssetContext>,
    entry_path: Vc<FileSystemPath>,
    intermediate_output_path: Vc<FileSystemPath>,
    project_path: Vc<FileSystemPath>,
    server_root: Vc<FileSystemPath>,
    output_root: Vc<FileSystemPath>,
    app_dir: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl AppRoute {
    #[turbo_tasks::function]
    async fn entry(self: Vc<Self>) -> Result<Vc<NodeRenderingEntry>> {
        let this = self.await?;

        let chunking_context = Vc::upcast(
            DevChunkingContext::builder(
                this.project_path,
                this.intermediate_output_path,
                this.intermediate_output_path.join("chunks".to_string()),
                get_client_assets_path(this.server_root),
                this.context.compile_time_info().environment(),
            )
            .layer("ssr")
            .reference_chunk_source_maps(should_debug("app_source"))
            .build(),
        );

        let entry_file_source = FileSource::new(this.entry_path);
        let entry_asset = this.context.process(
            Vc::upcast(entry_file_source),
            Value::new(ReferenceType::Entry(EntryReferenceSubType::AppRoute)),
        );

        let config = parse_segment_config_from_source(entry_asset, Vc::upcast(entry_file_source));
        let module = match config.await?.runtime {
            Some(NextRuntime::NodeJs) | None => {
                let bootstrap_asset = next_asset("entry/app/route.ts".to_string());

                let entry_asset = this
                    .context
                    .with_transition("next-route".to_string())
                    .process(
                        Vc::upcast(entry_file_source),
                        Value::new(ReferenceType::Entry(EntryReferenceSubType::AppRoute)),
                    );

                route_bootstrap(
                    entry_asset,
                    Vc::upcast(this.context),
                    this.project_path,
                    bootstrap_asset,
                    BootstrapConfig::empty(),
                )
            }
            Some(NextRuntime::Edge) => {
                let internal_asset = next_asset("entry/app/edge-route.ts".to_string());

                let entry = this
                    .context
                    .with_transition("next-edge-route".to_string())
                    .process(
                        Vc::upcast(entry_file_source),
                        Value::new(ReferenceType::Entry(EntryReferenceSubType::AppRoute)),
                    );

                let module = this.context.process(
                    internal_asset,
                    Value::new(ReferenceType::Internal(Vc::cell(indexmap! {
                        "ROUTE_CHUNK_GROUP".to_string() => entry
                    }))),
                );

                let Some(module) =
                    Vc::try_resolve_sidecast::<Box<dyn EvaluatableAsset>>(module).await?
                else {
                    bail!("internal module must be evaluatable");
                };

                module
            }
        };

        Ok(NodeRenderingEntry {
            runtime_entries: Vc::cell(
                this.runtime_entries
                    .await?
                    .iter()
                    .map(|entry| entry.to_evaluatable(Vc::upcast(this.context)))
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
    fn entry(self: Vc<Self>, _data: Value<ContentSourceData>) -> Vc<NodeRenderingEntry> {
        // Call without being keyed by data
        self.entry()
    }
}
