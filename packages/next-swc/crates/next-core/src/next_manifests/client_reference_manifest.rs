use anyhow::{Context, Result};
use indoc::formatdoc;
use turbo_tasks::{TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_binding::turbopack::{
    core::{
        asset::AssetContent,
        chunk::{ChunkItemExt, ChunkableModule, ModuleId as TurbopackModuleId},
        output::OutputAsset,
        virtual_output::VirtualOutputAsset,
    },
    ecmascript::{chunk::EcmascriptChunkingContext, utils::StringifyJs},
};

use super::{ClientReferenceManifest, ManifestNode, ManifestNodeEntry, ModuleId};
use crate::{
    next_app::ClientReferencesChunks,
    next_client_reference::{ClientReferenceType, ClientReferences},
    util::NextRuntime,
};

#[turbo_tasks::value_impl]
impl ClientReferenceManifest {
    #[turbo_tasks::function]
    pub async fn build_output(
        node_root: Vc<FileSystemPath>,
        client_relative_path: Vc<FileSystemPath>,
        entry_name: String,
        client_references: Vc<ClientReferences>,
        client_references_chunks: Vc<ClientReferencesChunks>,
        client_chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
        ssr_chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
        asset_prefix: Vc<Option<String>>,
        runtime: NextRuntime,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let mut entry_manifest: ClientReferenceManifest = Default::default();
        entry_manifest.module_loading.prefix = asset_prefix
            .await?
            .as_ref()
            .map(|p| p.to_owned())
            .unwrap_or_default();
        entry_manifest.module_loading.cross_origin = None;
        let client_references_chunks = client_references_chunks.await?;
        let client_relative_path = client_relative_path.await?;
        let node_root_ref = node_root.await?;

        for app_client_reference in client_references.await?.iter() {
            let app_client_reference_ty = app_client_reference.ty();

            let app_client_reference_chunks = client_references_chunks
                .get(app_client_reference.ty())
                .context("client reference chunks not found")?;

            let client_reference_chunks = client_references_chunks
                .get(app_client_reference_ty)
                .context("client reference chunks not found")?;
            let client_chunks = &client_reference_chunks.client_chunks.await?;

            let client_chunks_paths = client_chunks
                .iter()
                .map(|chunk| chunk.ident().path())
                .try_join()
                .await?;

            if let Some(server_component) = app_client_reference.server_component() {
                let server_component_name = server_component
                    .server_path()
                    .with_extension("".to_string())
                    .to_string()
                    .await?;

                let entry_css_files = entry_manifest
                    .entry_css_files
                    .entry(server_component_name.clone_value())
                    .or_default();

                let entry_js_files = entry_manifest
                    .entry_js_files
                    .entry(server_component_name.clone_value())
                    .or_default();

                match app_client_reference_ty {
                    ClientReferenceType::CssClientReference(_) => {
                        entry_css_files.extend(
                            client_chunks_paths
                                .iter()
                                .filter_map(|chunk_path| {
                                    if chunk_path.extension_ref() == Some("css") {
                                        client_relative_path.get_path_to(chunk_path)
                                    } else {
                                        None
                                    }
                                })
                                .map(ToString::to_string),
                        );
                        entry_js_files.extend(
                            client_chunks_paths
                                .iter()
                                .filter_map(|chunk_path| {
                                    if chunk_path.extension_ref() != Some("css") {
                                        client_relative_path.get_path_to(chunk_path)
                                    } else {
                                        None
                                    }
                                })
                                .map(ToString::to_string),
                        );
                    }

                    ClientReferenceType::EcmascriptClientReference(_) => {
                        // TODO should this be removed? does it make sense?
                        entry_css_files.extend(
                            client_chunks_paths
                                .iter()
                                .filter_map(|chunk_path| {
                                    if chunk_path.extension_ref() == Some("css") {
                                        client_relative_path.get_path_to(chunk_path)
                                    } else {
                                        None
                                    }
                                })
                                .map(ToString::to_string),
                        );
                    }
                }
            }

            match app_client_reference_ty {
                ClientReferenceType::CssClientReference(_) => {}

                ClientReferenceType::EcmascriptClientReference(ecmascript_client_reference) => {
                    let client_chunks = &app_client_reference_chunks.client_chunks.await?;
                    let ssr_chunks = &app_client_reference_chunks.ssr_chunks.await?;

                    let ecmascript_client_reference = ecmascript_client_reference.await?;

                    let client_module_id = ecmascript_client_reference
                        .client_module
                        .as_chunk_item(Vc::upcast(client_chunking_context))
                        .id()
                        .await?;
                    let ssr_module_id = ecmascript_client_reference
                        .ssr_module
                        .as_chunk_item(Vc::upcast(ssr_chunking_context))
                        .id()
                        .await?;

                    let server_path = ecmascript_client_reference
                        .server_ident
                        .path()
                        .to_string()
                        .await?;

                    let client_chunks_paths = client_chunks
                        .iter()
                        .map(|chunk| chunk.ident().path())
                        .try_join()
                        .await?;
                    let client_chunks_paths: Vec<String> = client_chunks_paths
                        .iter()
                        .filter_map(|chunk_path| client_relative_path.get_path_to(chunk_path))
                        .map(ToString::to_string)
                        // It's possible that a chunk also emits CSS files, that will
                        // be handled separatedly.
                        .filter(|path| path.ends_with(".js"))
                        .collect::<Vec<_>>();

                    let ssr_chunks_paths = ssr_chunks
                        .iter()
                        .map(|chunk| chunk.ident().path())
                        .try_join()
                        .await?;
                    let ssr_chunks_paths = ssr_chunks_paths
                        .iter()
                        .filter_map(|chunk_path| node_root_ref.get_path_to(chunk_path))
                        .map(ToString::to_string)
                        .collect::<Vec<_>>();

                    let mut ssr_manifest_node = ManifestNode::default();

                    entry_manifest.client_modules.module_exports.insert(
                        get_client_reference_module_key(&server_path, "*"),
                        ManifestNodeEntry {
                            name: "*".to_string(),
                            id: (&*client_module_id).into(),
                            chunks: client_chunks_paths.clone(),
                            // TODO(WEB-434)
                            r#async: false,
                        },
                    );

                    ssr_manifest_node.module_exports.insert(
                        "*".to_string(),
                        ManifestNodeEntry {
                            name: "*".to_string(),
                            id: (&*ssr_module_id).into(),
                            chunks: if runtime == NextRuntime::Edge {
                                // the chunks get added to the middleware-manifest.json instead of
                                // this file because the edge runtime doesn't support dynamically
                                // loading chunks.
                                vec![]
                            } else {
                                ssr_chunks_paths.clone()
                            },
                            // TODO(WEB-434)
                            r#async: false,
                        },
                    );

                    match runtime {
                        NextRuntime::NodeJs => {
                            entry_manifest
                                .ssr_module_mapping
                                .insert((&*client_module_id).into(), ssr_manifest_node.clone());
                        }
                        NextRuntime::Edge => {
                            entry_manifest
                                .edge_ssr_module_mapping
                                .insert((&*client_module_id).into(), ssr_manifest_node);
                        }
                    }
                }
            }
        }

        let client_reference_manifest_json = serde_json::to_string(&entry_manifest).unwrap();

        Ok(Vc::upcast(VirtualOutputAsset::new(
            node_root.join(format!(
                "server/app/{entry_name}_client-reference-manifest.js",
            )),
            AssetContent::file(
                File::from(formatdoc! {
                    r#"
                        globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {{}};
                        globalThis.__RSC_MANIFEST[{entry_name}] = {manifest}
                    "#,
                    entry_name = StringifyJs(&entry_name),
                    manifest = &client_reference_manifest_json
                })
                .into(),
            ),
        )))
    }
}

impl From<&TurbopackModuleId> for ModuleId {
    fn from(module_id: &TurbopackModuleId) -> Self {
        match module_id {
            TurbopackModuleId::String(string) => ModuleId::String(string.clone()),
            TurbopackModuleId::Number(number) => ModuleId::Number(*number as _),
        }
    }
}

/// See next.js/packages/next/src/lib/client-reference.ts
pub fn get_client_reference_module_key(server_path: &str, export_name: &str) -> String {
    if export_name == "*" {
        server_path.to_string()
    } else {
        format!("{}#{}", server_path, export_name)
    }
}
