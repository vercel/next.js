use std::{collections::HashMap, fmt::Write};

use anyhow::{anyhow, Result};
use turbo_tasks::{TryJoinIterExt, Value, ValueToString};
use turbo_tasks_env::ProcessEnvVc;
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, File, FileContent, FileSystemEntryType, FileSystemPathVc,
};
use turbopack::{
    ecmascript::EcmascriptInputTransform,
    transition::{TransitionVc, TransitionsByNameVc},
    ModuleAssetContextVc,
};
use turbopack_core::{
    chunk::dev::DevChunkingContextVc, context::AssetContextVc, virtual_asset::VirtualAssetVc,
};
use turbopack_dev_server::{
    html::DevHtmlAssetVc,
    source::{
        combined::{CombinedContentSource, CombinedContentSourceVc},
        ContentSourceVc, NoContentSourceVc,
    },
};
use turbopack_ecmascript::{
    chunk::EcmascriptChunkPlaceablesVc, magic_identifier, utils::stringify_str,
    EcmascriptInputTransformsVc, EcmascriptModuleAssetType, EcmascriptModuleAssetVc,
};
use turbopack_env::ProcessEnvAssetVc;

use crate::{
    app_render::{
        next_layout_entry_transition::NextLayoutEntryTransition, LayoutSegment, LayoutSegmentsVc,
    },
    embed_js::{next_js_file, wrap_with_next_js_fs},
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
    nodejs::{create_node_rendered_source, NodeRenderer, NodeRendererVc},
    util::regular_expression_for_path,
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
    project_path: FileSystemPathVc,
    app_dir: FileSystemPathVc,
) -> TransitionVc {
    let ty = Value::new(ServerContextType::AppSSR { app_dir });
    NextSSRClientModuleTransition {
        ssr_module_options_context: get_server_module_options_context(ty),
        ssr_resolve_options_context: get_server_resolve_options_context(project_path, ty),
        ssr_environment: get_server_environment(ty),
    }
    .cell()
    .into()
}

#[turbo_tasks::function]
fn next_layout_entry_transition(
    project_root: FileSystemPathVc,
    app_dir: FileSystemPathVc,
    server_root: FileSystemPathVc,
) -> TransitionVc {
    let ty = Value::new(ServerContextType::AppRSC { app_dir });
    let rsc_environment = get_server_environment(ty);
    let rsc_resolve_options_context = get_server_resolve_options_context(project_root, ty);
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

/// Create a content source serving the `app` or `src/app` directory as
/// Next.js app folder.
#[turbo_tasks::function]
pub async fn create_app_source(
    project_path: FileSystemPathVc,
    output_path: FileSystemPathVc,
    server_root: FileSystemPathVc,
    env: ProcessEnvVc,
    browserslist_query: &str,
) -> Result<ContentSourceVc> {
    let project_root = wrap_with_next_js_fs(project_path);

    let app = project_root.join("app");
    let src_app = project_root.join("src/app");
    let app_dir = if *app.get_type().await? == FileSystemEntryType::Directory {
        app
    } else if *src_app.get_type().await? == FileSystemEntryType::Directory {
        src_app
    } else {
        return Ok(NoContentSourceVc::new().into());
    };

    let next_server_to_client_transition = NextServerToClientTransition {}.cell().into();

    let mut transitions = HashMap::new();
    transitions.insert(
        "next-layout-entry".to_string(),
        next_layout_entry_transition(project_root, app_dir, server_root),
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
        next_ssr_client_module_transition(project_root, app_dir),
    );

    let ssr_ty = Value::new(ServerContextType::AppSSR { app_dir });
    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(transitions),
        get_server_environment(ssr_ty),
        get_server_module_options_context(ssr_ty),
        get_server_resolve_options_context(project_root, ssr_ty),
    )
    .into();

    let server_runtime_entries =
        vec![ProcessEnvAssetVc::new(project_root, env).as_ecmascript_chunk_placeable()];

    let fallback_page = get_fallback_page(project_path, server_root, browserslist_query);

    Ok(create_app_source_for_directory(
        context,
        project_root,
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
    context: AssetContextVc,
    project_root: FileSystemPathVc,
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
    let mut layout = None;
    if let DirectoryContent::Entries(entries) = &*input_dir.read_dir().await? {
        for (name, entry) in entries.iter() {
            if let DirectoryEntry::File(file) = entry {
                if let Some((name, _)) = name.rsplit_once('.') {
                    match name {
                        "page" => {
                            page = Some(file);
                        }
                        "layout" => {
                            layout = Some(file);
                        }
                        "error" => { /* TODO */ }
                        "loading" => { /* TODO */ }
                        _ => {
                            // Any other file is ignored
                        }
                    }
                }
            }
        }
        if let Some(file) = layout.copied() {
            let mut list = layouts.await?.clone_value();
            list.push(LayoutSegment { file, target }.cell());
            layouts = LayoutSegmentsVc::cell(list);
        }
        if let Some(file) = page.copied() {
            let mut list = layouts.await?.clone_value();
            list.push(LayoutSegment { file, target }.cell());
            let layout_path = LayoutSegmentsVc::cell(list);

            let chunking_context = DevChunkingContextVc::new_with_layer(
                project_root,
                intermediate_output_path,
                intermediate_output_path.join("chunks"),
                server_root.join("_next/static/assets"),
                false,
                "ssr",
            )
            .into();

            sources.push(create_node_rendered_source(
                server_root,
                regular_expression_for_path(server_root, target, false),
                AppRenderer {
                    context,
                    server_root,
                    layout_path,
                }
                .cell()
                .into(),
                chunking_context,
                runtime_entries,
                fallback_page,
                intermediate_output_path,
            ));
        }
        for (name, entry) in entries.iter() {
            if let DirectoryEntry::Directory(dir) = entry {
                let intermediate_output_path = intermediate_output_path.join(name);
                let new_target = if name.starts_with('(') && name.ends_with(')') {
                    // This doesn't affect the url
                    target
                } else {
                    // This adds to the url
                    target.join(name)
                };
                sources.push(
                    create_app_source_for_directory(
                        context,
                        project_root,
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
    context: AssetContextVc,
    server_root: FileSystemPathVc,
    layout_path: LayoutSegmentsVc,
}

#[turbo_tasks::value_impl]
impl NodeRenderer for AppRenderer {
    #[turbo_tasks::function]
    async fn module(&self) -> Result<EcmascriptModuleAssetVc> {
        let layout_path = self.layout_path.await?;
        let page = layout_path
            .last()
            .ok_or_else(|| anyhow!("layout path must not be empty"))?;
        let path = page.await?.file.parent();
        let path_value = &*path.await?;
        let segments = layout_path
            .iter()
            .copied()
            .try_join()
            .await?
            .into_iter()
            .fold(
                (self.server_root, Vec::new()),
                |(last_path, mut futures), segment| {
                    (segment.target, {
                        futures.push(async move {
                            let file_str = segment.file.to_string().await?;
                            let target = &*segment.target.await?;
                            let segment_path =
                                last_path.await?.get_path_to(target).unwrap_or_default();
                            let identifier = magic_identifier::encode(&format!(
                                "imported namespace {}",
                                file_str
                            ));
                            let chunks_identifier = magic_identifier::encode(&format!(
                                "client chunks for {}",
                                file_str
                            ));
                            if let Some(p) = path_value.get_relative_path_to(&*segment.file.await?)
                            {
                                Ok((
                                    p,
                                    stringify_str(segment_path),
                                    identifier,
                                    chunks_identifier,
                                ))
                            } else {
                                Err(anyhow!(
                                    "Unable to generate import as there is no relative path to \
                                     the layout module {} from context path {}",
                                    file_str,
                                    path.to_string().await?
                                ))
                            }
                        });
                        futures
                    })
                },
            )
            .1
            .into_iter()
            .try_join()
            .await?;
        let mut result = String::new();
        for (p, _, identifier, chunks_identifier) in segments.iter() {
            writeln!(
                result,
                r#"("TURBOPACK {{ transition: next-layout-entry; chunking-type: parallel }}");
import {}, {{ chunks as {} }} from {};
"#,
                identifier,
                chunks_identifier,
                stringify_str(p)
            )?
        }
        if let Some(page) = path_value.get_relative_path_to(&*page.await?.file.await?) {
            writeln!(
                result,
                r#"("TURBOPACK {{ transition: next-client }}");
import BOOTSTRAP from {};
"#,
                stringify_str(&page)
            )?;
        }
        result.push_str("const LAYOUT_INFO = [");
        for (_, segment_str_lit, identifier, chunks_identifier) in segments.iter() {
            writeln!(
                result,
                "  {{ segment: {segment_str_lit}, module: {identifier}, chunks: \
                 {chunks_identifier} }},",
            )?
        }
        result.push_str("];\n\n");
        let base_code = next_js_file("entry/app-renderer.tsx");
        let mut file = File::from(result);
        if let FileContent::Content(base_file) = &*base_code.await? {
            file.push_content(base_file.content());
        }
        let asset = VirtualAssetVc::new(path.join("entry"), FileContent::Content(file).into());
        Ok(EcmascriptModuleAssetVc::new(
            asset.into(),
            self.context,
            Value::new(EcmascriptModuleAssetType::Typescript),
            EcmascriptInputTransformsVc::cell(vec![
                EcmascriptInputTransform::React { refresh: false },
                EcmascriptInputTransform::TypeScript,
            ]),
            self.context.environment(),
        ))
    }
}
