use std::{collections::HashMap, io::Write};

use anyhow::Result;
use async_recursion::async_recursion;
use indexmap::{indexmap, IndexMap};
use turbo_binding::{
    turbo::{
        tasks::{
            primitives::{OptionStringVc, StringVc},
            Value,
        },
        tasks_env::{CustomProcessEnvVc, EnvMapVc, ProcessEnvVc},
        tasks_fs::{rope::RopeBuilder, File, FileContent, FileSystemPathVc},
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
                EcmaScriptModulesReferenceSubType, EntryReferenceSubType, ReferenceType,
            },
            source_asset::SourceAssetVc,
            virtual_asset::VirtualAssetVc,
        },
        dev::DevChunkingContextVc,
        dev_server::{
            html::DevHtmlAssetVc,
            source::{
                combined::CombinedContentSource,
                specificity::{Specificity, SpecificityElementType, SpecificityVc},
                ContentSourceData, ContentSourceVc, NoContentSourceVc,
            },
        },
        ecmascript::{
            magic_identifier,
            utils::{FormatIter, StringifyJs},
            EcmascriptInputTransformsVc, EcmascriptModuleAssetType, EcmascriptModuleAssetVc,
            InnerAssetsVc,
        },
        env::ProcessEnvAssetVc,
        node::{
            execution_context::ExecutionContextVc,
            render::{
                node_api_source::create_node_api_source,
                rendered_source::create_node_rendered_source,
            },
            NodeEntry, NodeEntryVc, NodeRenderingEntry, NodeRenderingEntryVc,
        },
        turbopack::{
            ecmascript::EcmascriptInputTransform,
            transition::{TransitionVc, TransitionsByNameVc},
            ModuleAssetContextVc,
        },
    },
};
use turbo_tasks::{TryJoinIterExt, ValueToString};

use crate::{
    app_render::next_layout_entry_transition::NextServerComponentTransition,
    app_structure::{
        get_entrypoints, Components, Entrypoint, LoaderTree, LoaderTreeVc, Metadata, OptionAppDirVc,
    },
    embed_js::{next_js_file, next_js_file_path},
    env::env_for_js,
    fallback::get_fallback_page,
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
        transition::NextEdgeTransition,
    },
    next_route_matcher::NextParamsMatcherVc,
    next_server::context::{
        get_server_compile_time_info, get_server_module_options_context,
        get_server_resolve_options_context, ServerContextType,
    },
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
        next_config,
    );
    let client_runtime_entries =
        get_client_runtime_entries(project_path, env, ty, next_config, execution_context);
    let client_resolve_options_context =
        get_client_resolve_options_context(project_path, ty, next_config, execution_context);

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
    NextSSRClientModuleTransition {
        ssr_module_options_context: get_server_module_options_context(
            project_path,
            execution_context,
            ty,
            next_config,
        ),
        ssr_resolve_options_context: get_server_resolve_options_context(
            project_path,
            ty,
            next_config,
            execution_context,
        ),
        ssr_environment: get_server_compile_time_info(ty, process_env, server_addr),
    }
    .cell()
    .into()
}

#[turbo_tasks::function]
fn next_layout_entry_transition(
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    app_dir: FileSystemPathVc,
    server_root: FileSystemPathVc,
    process_env: ProcessEnvVc,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
) -> TransitionVc {
    let ty = Value::new(ServerContextType::AppRSC { app_dir });
    let rsc_compile_time_info = get_server_compile_time_info(ty, process_env, server_addr);
    let rsc_resolve_options_context =
        get_server_resolve_options_context(project_path, ty, next_config, execution_context);
    let rsc_module_options_context =
        get_server_module_options_context(project_path, execution_context, ty, next_config);

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
fn next_route_transition(
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
    .reference_chunk_source_maps(false)
    .build();
    let edge_resolve_options_context =
        get_edge_resolve_options_context(project_path, server_ty, next_config, execution_context);

    NextEdgeTransition {
        edge_compile_time_info,
        edge_chunking_context,
        edge_module_options_context: None,
        edge_resolve_options_context,
        output_path,
        base_path: app_dir,
        bootstrap_file: next_js_file("entry/app/route-bootstrap.ts"),
        entry_name: "edge".to_string(),
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

    let mut transitions = HashMap::new();
    transitions.insert(
        "next-route".to_string(),
        next_route_transition(
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
        "next-layout-entry".to_string(),
        next_layout_entry_transition(
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
        get_server_compile_time_info(ssr_ty, env, server_addr),
        get_server_module_options_context(project_path, execution_context, ssr_ty, next_config),
        get_server_resolve_options_context(project_path, ssr_ty, next_config, execution_context),
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

    let client_compile_time_info = get_client_compile_time_info(browserslist_query);

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

    let sources = entrypoints
        .await?
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
            ),
        })
        .collect();

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
    );

    Ok(source.issue_context(app_dir, &format!("Next.js App Page Route {pathname}")))
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
        }
        .cell()
        .into(),
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

        struct State {
            inner_assets: IndexMap<String, AssetVc>,
            counter: usize,
            imports: Vec<String>,
            loader_tree_code: String,
            context: AssetContextVc,
            unsupported_metadata: Vec<FileSystemPathVc>,
        }

        let mut state = State {
            inner_assets: IndexMap::new(),
            counter: 0,
            imports: Vec::new(),
            loader_tree_code: String::new(),
            context,
            unsupported_metadata: Vec::new(),
        };

        fn write_component(
            state: &mut State,
            name: &str,
            component: Option<FileSystemPathVc>,
        ) -> Result<()> {
            use std::fmt::Write;

            if let Some(component) = component {
                let i = state.counter;
                state.counter += 1;
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
                    state.context.with_transition("next-layout-entry").process(
                        SourceAssetVc::new(component).into(),
                        Value::new(ReferenceType::EcmaScriptModules(
                            EcmaScriptModulesReferenceSubType::Undefined,
                        )),
                    ),
                );
            }
            Ok(())
        }

        fn emit_metadata_warning(state: &mut State, files: &[FileSystemPathVc]) {
            for file in files {
                state.unsupported_metadata.push(*file);
            }
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
                metadata:
                    Metadata {
                        icon,
                        apple,
                        twitter,
                        open_graph,
                        favicon,
                    },
                route: _,
            } = &*components.await?;
            write_component(state, "page", *page)?;
            write_component(state, "default", *default)?;
            write_component(state, "error", *error)?;
            write_component(state, "layout", *layout)?;
            write_component(state, "loading", *loading)?;
            write_component(state, "template", *template)?;
            // TODO something useful for metadata
            emit_metadata_warning(state, icon);
            emit_metadata_warning(state, apple);
            emit_metadata_warning(state, twitter);
            emit_metadata_warning(state, open_graph);
            emit_metadata_warning(state, favicon);
            write!(state.loader_tree_code, "}}]")?;
            Ok(())
        }

        walk_tree(&mut state, loader_tree).await?;

        let State {
            mut inner_assets,
            imports,
            loader_tree_code,
            unsupported_metadata,
            ..
        } = state;

        if !unsupported_metadata.is_empty() {
            UnsupportedImplicitMetadataIssue {
                app_dir,
                files: unsupported_metadata,
            }
            .cell()
            .as_issue()
            .emit();
        }

        // IPC need to be the first import to allow it to catch errors happening during
        // the other imports
        let mut result =
            RopeBuilder::from("import { IPC } from \"@vercel/turbopack-node/ipc/index\";\n");

        for import in imports {
            writeln!(result, "{import}")?;
        }

        writeln!(result, "const LOADER_TREE = {loader_tree_code};\n")?;
        writeln!(result, "import BOOTSTRAP from \"BOOTSTRAP\";\n")?;

        inner_assets.insert(
            "BOOTSTRAP".to_string(),
            context.with_transition("next-client").process(
                SourceAssetVc::new(next_js_file_path("entry/app/hydrate.tsx")).into(),
                Value::new(ReferenceType::EcmaScriptModules(
                    EcmaScriptModulesReferenceSubType::Undefined,
                )),
            ),
        );

        let base_code = next_js_file("entry/app-renderer.tsx");
        if let FileContent::Content(base_file) = &*base_code.await? {
            result += base_file.content()
        }

        let file = File::from(result.build());
        let asset = VirtualAssetVc::new(next_js_file_path("entry/app-renderer.tsx"), file.into());

        let chunking_context = DevChunkingContextVc::builder(
            project_path,
            intermediate_output_path,
            intermediate_output_path.join("chunks"),
            server_root.join("_next/static/assets"),
            context.compile_time_info().environment(),
        )
        .layer("ssr")
        .css_chunk_root_path(server_root.join("_next/static/chunks"))
        .reference_chunk_source_maps(false)
        .build();

        Ok(NodeRenderingEntry {
            runtime_entries: EvaluatableAssetsVc::cell(
                runtime_entries
                    .await?
                    .iter()
                    .map(|entry| EvaluatableAssetVc::from_asset(*entry, context))
                    .collect(),
            ),
            module: EcmascriptModuleAssetVc::new_with_inner_assets(
                asset.into(),
                context,
                Value::new(EcmascriptModuleAssetType::Typescript),
                EcmascriptInputTransformsVc::cell(vec![
                    EcmascriptInputTransform::React {
                        refresh: false,
                        import_source: OptionStringVc::cell(None),
                        runtime: OptionStringVc::cell(None),
                    },
                    EcmascriptInputTransform::TypeScript {
                        use_define_for_class_fields: false,
                    },
                ]),
                Default::default(),
                context.compile_time_info(),
                InnerAssetsVc::cell(inner_assets),
            ),
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
}

#[turbo_tasks::value_impl]
impl AppRouteVc {
    #[turbo_tasks::function]
    async fn entry(self) -> Result<NodeRenderingEntryVc> {
        let this = self.await?;
        let virtual_asset = VirtualAssetVc::new(
            this.entry_path.join("route.ts"),
            next_js_file("entry/app/route.ts").into(),
        );

        let chunking_context = DevChunkingContextVc::builder(
            this.project_path,
            this.intermediate_output_path,
            this.intermediate_output_path.join("chunks"),
            this.server_root.join("_next/static/assets"),
            this.context.compile_time_info().environment(),
        )
        .layer("ssr")
        .css_chunk_root_path(this.server_root.join("_next/static/chunks"))
        .reference_chunk_source_maps(false)
        .build();

        let entry = this.context.with_transition("next-route").process(
            SourceAssetVc::new(this.entry_path).into(),
            Value::new(ReferenceType::Entry(EntryReferenceSubType::AppRoute)),
        );
        Ok(NodeRenderingEntry {
            runtime_entries: EvaluatableAssetsVc::cell(
                this.runtime_entries
                    .await?
                    .iter()
                    .map(|entry| EvaluatableAssetVc::from_asset(*entry, this.context))
                    .collect(),
            ),
            module: EcmascriptModuleAssetVc::new_with_inner_assets(
                virtual_asset.into(),
                this.context,
                Value::new(EcmascriptModuleAssetType::Typescript),
                EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::TypeScript {
                    use_define_for_class_fields: false,
                }]),
                Default::default(),
                this.context.compile_time_info(),
                InnerAssetsVc::cell(indexmap! {
                    "ROUTE_CHUNK_GROUP".to_string() => entry
                }),
            ),
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
struct UnsupportedImplicitMetadataIssue {
    app_dir: FileSystemPathVc,
    files: Vec<FileSystemPathVc>,
}

#[turbo_tasks::value_impl]
impl Issue for UnsupportedImplicitMetadataIssue {
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
            "Implicit metadata from filesystem is currently not supported in Turbopack".to_string(),
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
