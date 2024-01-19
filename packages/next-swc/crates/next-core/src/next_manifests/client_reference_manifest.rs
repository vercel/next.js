use anyhow::Result;
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
    next_client_reference::{ClientReferenceGraphResult, ClientReferenceType},
    util::NextRuntime,
};

#[turbo_tasks::value_impl]
impl ClientReferenceManifest {
    #[turbo_tasks::function]
    pub async fn build_output(
        node_root: Vc<FileSystemPath>,
        client_relative_path: Vc<FileSystemPath>,
        entry_name: String,
        client_references: Vc<ClientReferenceGraphResult>,
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

        for app_client_reference in client_references.await?.client_references.iter() {
            let app_client_reference_ty = app_client_reference.ty();

            // An client component need to be emitted into the client reference manifest
            if let ClientReferenceType::EcmascriptClientReference(ecmascript_client_reference) =
                app_client_reference_ty
            {
                let ecmascript_client_reference = ecmascript_client_reference.await?;

                let server_path = ecmascript_client_reference
                    .server_ident
                    .path()
                    .to_string()
                    .await?;

                let client_module_id = ecmascript_client_reference
                    .client_module
                    .as_chunk_item(Vc::upcast(client_chunking_context))
                    .id()
                    .await?;

                let client_chunks_paths = if let Some(client_chunks) = client_references_chunks
                    .client_component_client_chunks
                    .get(&app_client_reference_ty)
                {
                    let client_chunks = client_chunks.await?;
                    let client_chunks_paths = client_chunks
                        .iter()
                        .map(|chunk| chunk.ident().path())
                        .try_join()
                        .await?;

                    client_chunks_paths
                        .iter()
                        .filter_map(|chunk_path| client_relative_path.get_path_to(chunk_path))
                        .map(ToString::to_string)
                        // It's possible that a chunk also emits CSS files, that will
                        // be handled separatedly.
                        .filter(|path| path.ends_with(".js"))
                        .collect::<Vec<_>>()
                } else {
                    Vec::new()
                };
                entry_manifest.client_modules.module_exports.insert(
                    get_client_reference_module_key(&server_path, "*"),
                    ManifestNodeEntry {
                        name: "*".to_string(),
                        id: (&*client_module_id).into(),
                        chunks: client_chunks_paths,
                        // TODO(WEB-434)
                        r#async: false,
                    },
                );

                let ssr_module_id = ecmascript_client_reference
                    .ssr_module
                    .as_chunk_item(Vc::upcast(ssr_chunking_context))
                    .id()
                    .await?;

                let ssr_chunks_paths = if runtime == NextRuntime::Edge {
                    // the chunks get added to the middleware-manifest.json instead
                    // of this file because the
                    // edge runtime doesn't support dynamically
                    // loading chunks.
                    Vec::new()
                } else if let Some(ssr_chunks) = client_references_chunks
                    .client_component_ssr_chunks
                    .get(&app_client_reference_ty)
                {
                    let ssr_chunks = ssr_chunks.await?;

                    let ssr_chunks_paths = ssr_chunks
                        .iter()
                        .map(|chunk| chunk.ident().path())
                        .try_join()
                        .await?;

                    ssr_chunks_paths
                        .iter()
                        .filter_map(|chunk_path| node_root_ref.get_path_to(chunk_path))
                        .map(ToString::to_string)
                        .collect::<Vec<_>>()
                } else {
                    Vec::new()
                };
                let mut ssr_manifest_node = ManifestNode::default();
                ssr_manifest_node.module_exports.insert(
                    "*".to_string(),
                    ManifestNodeEntry {
                        name: "*".to_string(),
                        id: (&*ssr_module_id).into(),
                        chunks: ssr_chunks_paths,
                        // TODO(WEB-434)
                        r#async: false,
                    },
                );

                match runtime {
                    NextRuntime::NodeJs => {
                        entry_manifest
                            .ssr_module_mapping
                            .insert((&*client_module_id).into(), ssr_manifest_node);
                    }
                    NextRuntime::Edge => {
                        entry_manifest
                            .edge_ssr_module_mapping
                            .insert((&*client_module_id).into(), ssr_manifest_node);
                    }
                }
            }
        }

        // per layout segment chunks need to be emitted into the manifest too
        for (server_component, client_chunks) in
            client_references_chunks.layout_segment_client_chunks.iter()
        {
            let client_chunks = &client_chunks.await?;

            let client_chunks_paths = client_chunks
                .iter()
                .map(|chunk| chunk.ident().path())
                .try_join()
                .await?;

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

            for chunk_path in client_chunks_paths {
                if let Some(path) = client_relative_path.get_path_to(&chunk_path) {
                    let path = path.to_string();
                    if chunk_path.extension_ref() == Some("css") {
                        entry_css_files.insert(path);
                    } else {
                        entry_js_files.insert(path);
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
