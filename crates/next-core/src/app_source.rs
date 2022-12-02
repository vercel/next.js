use std::{
    collections::{BTreeMap, HashMap},
    io::Write,
};

use anyhow::{anyhow, Result};
use turbo_tasks::{
    primitives::{StringVc, StringsVc},
    TryJoinIterExt, Value, ValueToString,
};
use turbo_tasks_env::ProcessEnvVc;
use turbo_tasks_fs::{
    rope::RopeBuilder, DirectoryContent, DirectoryEntry, File, FileContent, FileContentVc,
    FileSystemEntryType, FileSystemPathVc,
};
use turbopack::{
    ecmascript::EcmascriptInputTransform,
    transition::{TransitionVc, TransitionsByNameVc},
    ModuleAssetContextVc,
};
use turbopack_core::{
    chunk::dev::DevChunkingContextVc,
    context::AssetContextVc,
    issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc},
    virtual_asset::VirtualAssetVc,
};
use turbopack_dev_server::{
    html::DevHtmlAssetVc,
    source::{
        combined::{CombinedContentSource, CombinedContentSourceVc},
        specificity::SpecificityVc,
        ContentSourceData, ContentSourceVc, NoContentSourceVc,
    },
};
use turbopack_ecmascript::{
    chunk::EcmascriptChunkPlaceablesVc, magic_identifier, utils::stringify_str,
    EcmascriptInputTransformsVc, EcmascriptModuleAssetType, EcmascriptModuleAssetVc,
};
use turbopack_env::ProcessEnvAssetVc;
use turbopack_node::{
    create_node_rendered_source,
    node_entry::{NodeRenderingEntry, NodeRenderingEntryVc},
    NodeEntry, NodeEntryVc,
};

use crate::{
    app_render::{
        next_layout_entry_transition::NextLayoutEntryTransition, LayoutSegment, LayoutSegmentsVc,
    },
    embed_js::{next_js_file, wrap_with_next_js_fs},
    env::env_for_js,
    fallback::get_fallback_page,
    next_client::{
        context::{
            get_client_chunking_context, get_client_environment, get_client_module_options_context,
            get_client_resolve_options_context, get_client_runtime_entries, ContextType,
        },
        NextClientTransition,
    },
    next_client_component::{
        client_chunks_transition::NextClientChunksTransition,
        server_to_client_transition::NextServerToClientTransition,
        ssr_client_module_transition::NextSSRClientModuleTransition,
    },
    next_server::{
        get_server_environment, get_server_module_options_context,
        get_server_resolve_options_context, ServerContextType,
    },
    util::{pathname_for_path, regular_expression_for_path},
};

#[turbo_tasks::function]
fn next_client_chunks_transition(
    project_root: FileSystemPathVc,
    app_dir: FileSystemPathVc,
    server_root: FileSystemPathVc,
    browserslist_query: &str,
) -> TransitionVc {
    let ty = Value::new(ContextType::App { app_dir });
    let client_chunking_context = get_client_chunking_context(project_root, server_root, ty);
    let client_environment = get_client_environment(browserslist_query);

    let client_module_options_context =
        get_client_module_options_context(project_root, client_environment, ty);
    NextClientChunksTransition {
        client_chunking_context,
        client_module_options_context,
        client_resolve_options_context: get_client_resolve_options_context(project_root, ty),
        client_environment,
        server_root,
    }
    .cell()
    .into()
}

#[turbo_tasks::function]
async fn next_client_transition(
    project_root: FileSystemPathVc,
    server_root: FileSystemPathVc,
    app_dir: FileSystemPathVc,
    env: ProcessEnvVc,
    browserslist_query: &str,
) -> Result<TransitionVc> {
    let ty = Value::new(ContextType::App { app_dir });
    let client_chunking_context = get_client_chunking_context(project_root, server_root, ty);
    let client_environment = get_client_environment(browserslist_query);
    let client_module_options_context =
        get_client_module_options_context(project_root, client_environment, ty);
    let client_runtime_entries = get_client_runtime_entries(project_root, env, ty);
    let client_resolve_options_context = get_client_resolve_options_context(project_root, ty);

    Ok(NextClientTransition {
        is_app: true,
        server_root,
        client_chunking_context,
        client_module_options_context,
        client_resolve_options_context,
        client_environment,
        runtime_entries: client_runtime_entries,
    }
    .cell()
    .into())
}

#[turbo_tasks::function]
fn next_ssr_client_module_transition(
    project_root: FileSystemPathVc,
    app_dir: FileSystemPathVc,
    process_env: ProcessEnvVc,
    externals: StringsVc,
) -> TransitionVc {
    let ty = Value::new(ServerContextType::AppSSR { app_dir });
    NextSSRClientModuleTransition {
        ssr_module_options_context: get_server_module_options_context(ty),
        ssr_resolve_options_context: get_server_resolve_options_context(
            project_root,
            ty,
            externals,
        ),
        ssr_environment: get_server_environment(ty, process_env),
    }
    .cell()
    .into()
}

#[turbo_tasks::function]
fn next_layout_entry_transition(
    project_root: FileSystemPathVc,
    app_dir: FileSystemPathVc,
    server_root: FileSystemPathVc,
    process_env: ProcessEnvVc,
    externals: StringsVc,
) -> TransitionVc {
    let ty = Value::new(ServerContextType::AppRSC { app_dir });
    let rsc_environment = get_server_environment(ty, process_env);
    let rsc_resolve_options_context =
        get_server_resolve_options_context(project_root, ty, externals);
    let rsc_module_options_context = get_server_module_options_context(ty);

    NextLayoutEntryTransition {
        rsc_environment,
        rsc_module_options_context,
        rsc_resolve_options_context,
        server_root,
    }
    .cell()
    .into()
}

#[turbo_tasks::function]
fn app_context(
    project_root: FileSystemPathVc,
    server_root: FileSystemPathVc,
    app_dir: FileSystemPathVc,
    env: ProcessEnvVc,
    browserslist_query: &str,
    ssr: bool,
    externals: StringsVc,
) -> AssetContextVc {
    let next_server_to_client_transition = NextServerToClientTransition { ssr }.cell().into();

    let mut transitions = HashMap::new();
    transitions.insert(
        "next-layout-entry".to_string(),
        next_layout_entry_transition(project_root, app_dir, server_root, env, externals),
    );
    transitions.insert(
        "server-to-client".to_string(),
        next_server_to_client_transition,
    );
    transitions.insert(
        "next-client".to_string(),
        next_client_transition(project_root, server_root, app_dir, env, browserslist_query),
    );
    transitions.insert(
        "next-client-chunks".to_string(),
        next_client_chunks_transition(project_root, app_dir, server_root, browserslist_query),
    );
    transitions.insert(
        "next-ssr-client-module".to_string(),
        next_ssr_client_module_transition(project_root, app_dir, env, externals),
    );

    let ssr_ty = Value::new(ServerContextType::AppSSR { app_dir });
    ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(transitions),
        get_server_environment(ssr_ty, env),
        get_server_module_options_context(ssr_ty),
        get_server_resolve_options_context(project_root, ssr_ty, externals),
    )
    .into()
}

/// Create a content source serving the `app` or `src/app` directory as
/// Next.js app folder.
#[turbo_tasks::function]
pub async fn create_app_source(
    project_root: FileSystemPathVc,
    output_path: FileSystemPathVc,
    server_root: FileSystemPathVc,
    env: ProcessEnvVc,
    browserslist_query: &str,
    externals: StringsVc,
) -> Result<ContentSourceVc> {
    let project_root = wrap_with_next_js_fs(project_root);

    let app = project_root.join("app");
    let src_app = project_root.join("src/app");
    let app_dir = if *app.get_type().await? == FileSystemEntryType::Directory {
        app
    } else if *src_app.get_type().await? == FileSystemEntryType::Directory {
        src_app
    } else {
        return Ok(NoContentSourceVc::new().into());
    };

    let context_ssr = app_context(
        project_root,
        server_root,
        app_dir,
        env,
        browserslist_query,
        true,
        externals,
    );
    let context = app_context(
        project_root,
        server_root,
        app_dir,
        env,
        browserslist_query,
        false,
        externals,
    );

    let server_runtime_entries = vec![ProcessEnvAssetVc::new(project_root, env_for_js(env, false))
        .as_ecmascript_chunk_placeable()];

    let fallback_page = get_fallback_page(project_root, server_root, env, browserslist_query);

    Ok(create_app_source_for_directory(
        context_ssr,
        context,
        project_root,
        SpecificityVc::exact(),
        0,
        app_dir,
        server_root,
        EcmascriptChunkPlaceablesVc::cell(server_runtime_entries),
        fallback_page,
        server_root,
        LayoutSegmentsVc::cell(Vec::new()),
        output_path,
    )
    .into())
}

#[turbo_tasks::function]
async fn create_app_source_for_directory(
    context_ssr: AssetContextVc,
    context: AssetContextVc,
    project_root: FileSystemPathVc,
    specificity: SpecificityVc,
    position: u32,
    input_dir: FileSystemPathVc,
    server_root: FileSystemPathVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    fallback_page: DevHtmlAssetVc,
    target: FileSystemPathVc,
    layouts: LayoutSegmentsVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<CombinedContentSourceVc> {
    let mut layouts = layouts;
    let mut sources = Vec::new();
    let mut page = None;
    let mut files = HashMap::new();
    if let DirectoryContent::Entries(entries) = &*input_dir.read_dir().await? {
        for (name, entry) in entries.iter() {
            if let &DirectoryEntry::File(file) = entry {
                if let Some((name, _)) = name.rsplit_once('.') {
                    match name {
                        "page" => {
                            page = Some(file);
                        }
                        "layout" | "error" | "loading" | "template" | "not-found" | "head" => {
                            files.insert(name.to_string(), file);
                        }
                        _ => {
                            // Any other file is ignored
                        }
                    }
                }
            }
        }

        let layout = files.get("layout");

        // If a page exists but no layout exists, create a basic root layout
        // in `app/layout.js` or `app/layout.tsx`.
        //
        // TODO: Use let Some(page_file) = page in expression below when
        // https://rust-lang.github.io/rfcs/2497-if-let-chains.html lands
        if let (Some(page_file), None, true) = (page, layout, target == server_root) {
            // Use the extension to determine if the page file is TypeScript.
            // TODO: Use the presence of a tsconfig.json instead, like Next.js
            // stable does.
            let is_tsx = *page_file.extension().await? == "tsx";

            let layout = if is_tsx {
                input_dir.join("layout.tsx")
            } else {
                input_dir.join("layout.js")
            };
            files.insert("layout".to_string(), layout);
            let content = if is_tsx {
                include_str!("assets/layout.tsx")
            } else {
                include_str!("assets/layout.js")
            };

            layout.write(FileContentVc::from(File::from(content)));

            AppSourceIssue {
                severity: IssueSeverity::Warning.into(),
                path: page_file,
                message: StringVc::cell(format!(
                    "Your page {} did not have a root layout, we created {} for you.",
                    page_file.await?.path,
                    layout.await?.path,
                )),
            }
            .cell()
            .as_issue()
            .emit();
        }

        let mut list = layouts.await?.clone_value();
        list.push(LayoutSegment { files, target }.cell());
        layouts = LayoutSegmentsVc::cell(list);
        if let Some(page_path) = page {
            let pathname = pathname_for_path(server_root, target, false);
            let path_regex = regular_expression_for_path(server_root, target, false);

            sources.push(create_node_rendered_source(
                specificity,
                server_root,
                pathname,
                path_regex,
                AppRenderer {
                    context_ssr,
                    context,
                    server_root,
                    layout_path: layouts,
                    page_path,
                    target,
                    project_root,
                    intermediate_output_path,
                }
                .cell()
                .into(),
                runtime_entries,
                fallback_page,
            ));
        }
        for (name, entry) in entries.iter() {
            if let DirectoryEntry::Directory(dir) = entry {
                let intermediate_output_path = intermediate_output_path.join(name);
                let specificity = if name.starts_with("[[") || name.starts_with("[...") {
                    specificity.with_catch_all(position)
                } else if name.starts_with('[') {
                    specificity.with_dynamic_segment(position)
                } else {
                    specificity
                };
                let (new_target, position) = if name.starts_with('(') && name.ends_with(')') {
                    // This doesn't affect the url
                    (target, position)
                } else {
                    // This adds to the url
                    (target.join(name), position + 1)
                };
                sources.push(
                    create_app_source_for_directory(
                        context_ssr,
                        context,
                        project_root,
                        specificity,
                        position,
                        *dir,
                        server_root,
                        runtime_entries,
                        fallback_page,
                        new_target,
                        layouts,
                        intermediate_output_path,
                    )
                    .into(),
                );
            }
        }
    }
    Ok(CombinedContentSource { sources }.cell())
}

#[turbo_tasks::value]
struct AppRenderer {
    context_ssr: AssetContextVc,
    context: AssetContextVc,
    server_root: FileSystemPathVc,
    layout_path: LayoutSegmentsVc,
    page_path: FileSystemPathVc,
    target: FileSystemPathVc,
    project_root: FileSystemPathVc,
    intermediate_output_path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl NodeEntry for AppRenderer {
    #[turbo_tasks::function]
    async fn entry(&self, data: Value<ContentSourceData>) -> Result<NodeRenderingEntryVc> {
        let is_rsc = if let Some(headers) = data.into_value().headers {
            headers.contains_key("rsc")
        } else {
            false
        };
        let layout_path = self.layout_path.await?;
        let page = self.page_path;
        let path = page.parent();
        let path_value = &*path.await?;
        let layout_and_page = layout_path
            .iter()
            .copied()
            .chain(std::iter::once(
                LayoutSegment {
                    files: HashMap::from([("page".to_string(), page)]),
                    target: self.target,
                }
                .cell(),
            ))
            .try_join()
            .await?;
        let segments: Vec<_> = layout_and_page
            .into_iter()
            .fold(
                (self.server_root, Vec::new()),
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
                            Ok((stringify_str(segment_path), imports))
                        });
                        futures
                    })
                },
            )
            .1
            .into_iter()
            .try_join()
            .await?;
        let mut result = RopeBuilder::from(
            "import IPC, { Ipc } from \"@vercel/turbopack-next/internal/ipc\";\n",
        );

        for (_, imports) in segments.iter() {
            for (p, identifier, chunks_identifier) in imports.values() {
                result += r#"("TURBOPACK { transition: next-layout-entry; chunking-type: parallel }");
"#;
                writeln!(
                    result,
                    "import {}, {{ chunks as {} }} from {};\n",
                    identifier,
                    chunks_identifier,
                    stringify_str(p)
                )?
            }
        }
        if let Some(page) = path_value.get_relative_path_to(&*page.await?) {
            writeln!(
                result,
                r#"("TURBOPACK {{ transition: next-client }}");
import BOOTSTRAP from {};
"#,
                stringify_str(&page)
            )?;
        }

        result += "const LAYOUT_INFO = [";
        for (segment_str_lit, imports) in segments.iter() {
            writeln!(result, "  {{\n    segment: {segment_str_lit},")?;
            for (key, (_, identifier, chunks_identifier)) in imports {
                writeln!(
                    result,
                    "    {key}: {{ module: {identifier}, chunks: {chunks_identifier} }},",
                    key = stringify_str(key),
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
            (self.context, self.intermediate_output_path.join("rsc"))
        } else {
            (self.context_ssr, self.intermediate_output_path)
        };

        let chunking_context = DevChunkingContextVc::builder(
            self.project_root,
            intermediate_output_path,
            intermediate_output_path.join("chunks"),
            self.server_root.join("_next/static/assets"),
        )
        .layer("ssr")
        .css_chunk_root_path(self.server_root.join("_next/static/chunks"))
        .build();

        Ok(NodeRenderingEntry {
            module: EcmascriptModuleAssetVc::new(
                asset.into(),
                context,
                Value::new(EcmascriptModuleAssetType::Typescript),
                EcmascriptInputTransformsVc::cell(vec![
                    EcmascriptInputTransform::React { refresh: false },
                    EcmascriptInputTransform::TypeScript,
                ]),
                context.environment(),
            ),
            chunking_context,
            intermediate_output_path,
        }
        .cell())
    }
}

#[turbo_tasks::value(shared)]
struct AppSourceIssue {
    pub severity: IssueSeverityVc,
    pub path: FileSystemPathVc,
    pub message: StringVc,
}

#[turbo_tasks::value_impl]
impl Issue for AppSourceIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        self.severity
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<StringVc> {
        Ok(StringVc::cell(
            "An issue occurred while preparing your Next.js app".to_string(),
        ))
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("next app".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.message
    }
}
