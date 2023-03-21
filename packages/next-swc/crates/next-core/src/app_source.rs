use std::{
    collections::{BTreeMap, HashMap},
    io::Write,
    iter::once,
};

use anyhow::{anyhow, Result};
use indexmap::indexmap;
use turbo_tasks::{primitives::OptionStringVc, TryJoinIterExt, Value, ValueToString};
use turbo_tasks_env::{CustomProcessEnvVc, EnvMapVc, ProcessEnvVc};
use turbo_tasks_fs::{rope::RopeBuilder, File, FileContent, FileSystemPathVc};
use turbopack::{
    ecmascript::EcmascriptInputTransform,
    transition::{TransitionVc, TransitionsByNameVc},
    ModuleAssetContextVc,
};
use turbopack_core::{
    compile_time_info::CompileTimeInfoVc,
    context::{AssetContext, AssetContextVc},
    environment::{EnvironmentIntention, ServerAddrVc},
    reference_type::{EntryReferenceSubType, ReferenceType},
    source_asset::SourceAssetVc,
    virtual_asset::VirtualAssetVc,
};
use turbopack_dev::DevChunkingContextVc;
use turbopack_dev_server::{
    html::DevHtmlAssetVc,
    source::{
        combined::CombinedContentSource, ContentSourceData, ContentSourceVc, NoContentSourceVc,
    },
};
use turbopack_ecmascript::{
    chunk::EcmascriptChunkPlaceablesVc, magic_identifier, utils::StringifyJs,
    EcmascriptInputTransformsVc, EcmascriptModuleAssetType, EcmascriptModuleAssetVc, InnerAssetsVc,
};
use turbopack_env::ProcessEnvAssetVc;
use turbopack_node::{
    execution_context::ExecutionContextVc,
    render::{
        node_api_source::create_node_api_source, rendered_source::create_node_rendered_source,
    },
    NodeEntry, NodeEntryVc, NodeRenderingEntry, NodeRenderingEntryVc,
};

use crate::{
    app_render::{
        next_layout_entry_transition::NextLayoutEntryTransition, LayoutSegment, LayoutSegmentsVc,
    },
    app_structure::{AppStructure, AppStructureItem, AppStructureVc, OptionAppStructureVc},
    embed_js::next_js_file,
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
    util::pathname_for_path,
};

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

    NextLayoutEntryTransition {
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

    let edge_compile_time_info =
        get_edge_compile_time_info(server_addr, Value::new(EnvironmentIntention::Api));

    let edge_chunking_context = DevChunkingContextVc::builder(
        project_path,
        output_path.join("edge"),
        output_path.join("edge/chunks"),
        get_client_assets_path(server_root, Value::new(ClientContextType::App { app_dir })),
        edge_compile_time_info.environment(),
    )
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
    app_structure: OptionAppStructureVc,
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    output_path: FileSystemPathVc,
    server_root: FileSystemPathVc,
    env: ProcessEnvVc,
    browserslist_query: &str,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
) -> Result<ContentSourceVc> {
    let Some(app_structure) = *app_structure.await? else {
        return Ok(NoContentSourceVc::new().into());
    };
    let app_dir = app_structure.directory();

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
        vec![ProcessEnvAssetVc::new(project_path, injected_env).as_ecmascript_chunk_placeable()];

    let fallback_page = get_fallback_page(
        project_path,
        execution_context,
        server_root,
        env,
        client_compile_time_info,
        next_config,
    );

    let source = create_app_source_for_directory(
        app_structure,
        context_ssr,
        context,
        project_path,
        env,
        server_root,
        EcmascriptChunkPlaceablesVc::cell(server_runtime_entries),
        fallback_page,
        output_path,
    );
    Ok(source)
}

#[allow(clippy::too_many_arguments)]
#[turbo_tasks::function]
async fn create_app_source_for_directory(
    app_structure: AppStructureVc,
    context_ssr: AssetContextVc,
    context: AssetContextVc,
    project_path: FileSystemPathVc,
    env: ProcessEnvVc,
    server_root: FileSystemPathVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    fallback_page: DevHtmlAssetVc,
    intermediate_output_path_root: FileSystemPathVc,
) -> Result<ContentSourceVc> {
    let AppStructure {
        item,
        ref children,
        directory,
    } = *app_structure.await?;
    let mut sources = Vec::new();

    if let Some(item) = item {
        match *item.await? {
            AppStructureItem::Page {
                segment,
                url,
                specificity,
                page,
                segments: layouts,
            } => {
                let LayoutSegment { target, .. } = *segment.await?;
                let pathname = pathname_for_path(server_root, url, false, false);
                let params_matcher = NextParamsMatcherVc::new(pathname);

                sources.push(create_node_rendered_source(
                    project_path,
                    env,
                    specificity,
                    server_root,
                    params_matcher.into(),
                    pathname,
                    AppRenderer {
                        context_ssr,
                        context,
                        server_root,
                        layout_path: layouts,
                        page_path: page,
                        target,
                        project_path,
                        intermediate_output_path: intermediate_output_path_root,
                    }
                    .cell()
                    .into(),
                    runtime_entries,
                    fallback_page,
                ));
            }
            AppStructureItem::Route {
                url,
                specificity,
                route,
                ..
            } => {
                let pathname = pathname_for_path(server_root, url, false, false);
                let params_matcher = NextParamsMatcherVc::new(pathname);

                sources.push(create_node_api_source(
                    project_path,
                    env,
                    specificity,
                    server_root,
                    params_matcher.into(),
                    pathname,
                    AppRoute {
                        context: context_ssr,
                        server_root,
                        entry_path: route,
                        project_path,
                        intermediate_output_path: intermediate_output_path_root,
                        output_root: intermediate_output_path_root,
                    }
                    .cell()
                    .into(),
                    runtime_entries,
                ));
            }
        }
    }

    if children.is_empty() {
        if let Some(source) = sources.into_iter().next() {
            return Ok(source);
        } else {
            return Ok(NoContentSourceVc::new().into());
        }
    }

    let source = CombinedContentSource { sources }
        .cell()
        .as_content_source()
        .issue_context(directory, "Next.js App Router");

    Ok(CombinedContentSource {
        sources: once(source)
            .chain(children.iter().map(|child| {
                create_app_source_for_directory(
                    *child,
                    context_ssr,
                    context,
                    project_path,
                    env,
                    server_root,
                    runtime_entries,
                    fallback_page,
                    intermediate_output_path_root,
                )
            }))
            .collect(),
    }
    .cell()
    .into())
}

/// The renderer for pages in app directory
#[turbo_tasks::value]
struct AppRenderer {
    context_ssr: AssetContextVc,
    context: AssetContextVc,
    server_root: FileSystemPathVc,
    layout_path: LayoutSegmentsVc,
    page_path: FileSystemPathVc,
    target: FileSystemPathVc,
    project_path: FileSystemPathVc,
    intermediate_output_path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl AppRendererVc {
    #[turbo_tasks::function]
    async fn entry(self, is_rsc: bool) -> Result<NodeRenderingEntryVc> {
        let this = self.await?;
        let layout_path = this.layout_path.await?;
        let page = this.page_path;
        let path = page.parent();
        let path_value = &*path.await?;

        let layout_and_page = layout_path
            .iter()
            .copied()
            .chain(std::iter::once(
                LayoutSegment {
                    files: HashMap::from([("page".to_string(), page)]),
                    target: this.target,
                }
                .cell(),
            ))
            .try_join()
            .await?;

        let segments: Vec<_> = layout_and_page
            .into_iter()
            .fold(
                (this.server_root, Vec::new()),
                |(last_path, mut futures), segment| {
                    (segment.target, {
                        futures.push(async move {
                            let target = &*segment.target.await?;
                            let segment_path =
                                last_path.await?.get_path_to(target).unwrap_or_default();
                            let mut imports = BTreeMap::new();
                            for (key, file) in segment.files.iter() {
                                let file_str = file.to_string().await?;
                                let identifier = magic_identifier::encode(&format!(
                                    "imported namespace {}",
                                    file_str
                                ));
                                let chunks_identifier = magic_identifier::encode(&format!(
                                    "client chunks for {}",
                                    file_str
                                ));
                                if let Some(p) = path_value.get_relative_path_to(&*file.await?) {
                                    imports.insert(
                                        key.to_string(),
                                        (p, identifier, chunks_identifier),
                                    );
                                } else {
                                    return Err(anyhow!(
                                        "Unable to generate import as there
                                is no relative path to the layout module {} from context
                                path {}",
                                        file_str,
                                        path.to_string().await?
                                    ));
                                }
                            }
                            Ok((StringifyJs(segment_path).to_string(), imports))
                        });
                        futures
                    })
                },
            )
            .1
            .into_iter()
            .try_join()
            .await?;

        // IPC need to be the first import to allow it to catch errors happening during
        // the other imports
        let mut result =
            RopeBuilder::from("import { IPC } from \"@vercel/turbopack-next/ipc/index\";\n");

        for (_, imports) in segments.iter() {
            for (p, identifier, chunks_identifier) in imports.values() {
                result += r#"("TURBOPACK { transition: next-layout-entry; chunking-type: isolatedParallel }");
"#;
                writeln!(
                    result,
                    "import {}, {{ chunks as {} }} from {};\n",
                    identifier,
                    chunks_identifier,
                    StringifyJs(p)
                )?
            }
        }
        if let Some(page) = path_value.get_relative_path_to(&*page.await?) {
            writeln!(
                result,
                r#"("TURBOPACK {{ transition: next-client }}");
import BOOTSTRAP from {};
"#,
                StringifyJs(&page)
            )?;
        }

        result += "const LAYOUT_INFO = [";
        for (segment_str_lit, imports) in segments.iter() {
            writeln!(result, "  {{\n    segment: {segment_str_lit},")?;
            for (key, (_, identifier, chunks_identifier)) in imports {
                writeln!(
                    result,
                    "    {key}: {{ module: {identifier}, chunks: {chunks_identifier} }},",
                    key = StringifyJs(key),
                )?;
            }
            result += "  },";
        }
        result += "];\n\n";

        let base_code = next_js_file("entry/app-renderer.tsx");
        if let FileContent::Content(base_file) = &*base_code.await? {
            result += base_file.content()
        }

        let file = File::from(result.build());
        let asset = VirtualAssetVc::new(path.join("entry"), file.into());
        let (context, intermediate_output_path) = if is_rsc {
            (this.context, this.intermediate_output_path.join("rsc"))
        } else {
            (this.context_ssr, this.intermediate_output_path)
        };

        let chunking_context = DevChunkingContextVc::builder(
            this.project_path,
            intermediate_output_path,
            intermediate_output_path.join("chunks"),
            this.server_root.join("_next/static/assets"),
            context.compile_time_info().environment(),
        )
        .layer("ssr")
        .css_chunk_root_path(this.server_root.join("_next/static/chunks"))
        .chunk_source_maps(false)
        .build();

        Ok(NodeRenderingEntry {
            module: EcmascriptModuleAssetVc::new(
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
                context.compile_time_info(),
            ),
            chunking_context,
            intermediate_output_path,
            output_root: intermediate_output_path.root(),
            project_dir: this.project_path,
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
        .chunk_source_maps(false)
        .build();

        let entry = this.context.with_transition("next-route").process(
            SourceAssetVc::new(this.entry_path).into(),
            Value::new(ReferenceType::Entry(EntryReferenceSubType::AppRoute)),
        );
        Ok(NodeRenderingEntry {
            module: EcmascriptModuleAssetVc::new_with_inner_assets(
                virtual_asset.into(),
                this.context,
                Value::new(EcmascriptModuleAssetType::Typescript),
                EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::TypeScript {
                    use_define_for_class_fields: false,
                }]),
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
