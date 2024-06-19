use anyhow::Result;
use indoc::formatdoc;
use turbo_tasks::{RcStr, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_binding::turbopack::{
    core::{
        asset::AssetContent,
        chunk::{
            availability_info::AvailabilityInfo, ChunkItem, ChunkItemExt, ChunkableModule,
            ChunkingContext, ModuleId as TurbopackModuleId,
        },
        output::OutputAsset,
        virtual_output::VirtualOutputAsset,
    },
    ecmascript::utils::StringifyJs,
};

use super::{ClientReferenceManifest, ManifestNode, ManifestNodeEntry, ModuleId};
use crate::{
    next_app::ClientReferencesChunks,
    next_client_reference::{ClientReferenceGraphResult, ClientReferenceType},
    next_config::NextConfig,
    util::NextRuntime,
};

#[turbo_tasks::value_impl]
impl ClientReferenceManifest {
    #[turbo_tasks::function]
    pub async fn build_output(
        node_root: Vc<FileSystemPath>,
        client_relative_path: Vc<FileSystemPath>,
        entry_name: RcStr,
        client_references: Vc<ClientReferenceGraphResult>,
        client_references_chunks: Vc<ClientReferencesChunks>,
        client_chunking_context: Vc<Box<dyn ChunkingContext>>,
        ssr_chunking_context: Option<Vc<Box<dyn ChunkingContext>>>,
        next_config: Vc<NextConfig>,
        runtime: NextRuntime,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let mut entry_manifest: ClientReferenceManifest = Default::default();
        entry_manifest.module_loading.prefix = next_config
            .computed_asset_prefix()
            .await?
            .as_ref()
            .map(|p| p.clone())
            .unwrap_or_default();

        entry_manifest.module_loading.cross_origin = next_config
            .await?
            .cross_origin
            .as_ref()
            .map(|p| p.to_owned());
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

                let client_chunk_item = ecmascript_client_reference
                    .client_module
                    .as_chunk_item(Vc::upcast(client_chunking_context));

                let client_module_id = client_chunk_item.id().await?;

                let (client_chunks_paths, client_is_async) =
                    if let Some((client_chunks, client_availability_info)) =
                        client_references_chunks
                            .client_component_client_chunks
                            .get(&app_client_reference_ty)
                    {
                        let client_chunks = client_chunks.await?;
                        let client_chunks_paths = client_chunks
                            .iter()
                            .map(|chunk| chunk.ident().path())
                            .try_join()
                            .await?;

                        let chunk_paths = client_chunks_paths
                            .iter()
                            .filter_map(|chunk_path| client_relative_path.get_path_to(chunk_path))
                            .map(ToString::to_string)
                            // It's possible that a chunk also emits CSS files, that will
                            // be handled separatedly.
                            .filter(|path| path.ends_with(".js"))
                            .map(RcStr::from)
                            .collect::<Vec<_>>();

                        let is_async =
                            is_item_async(client_availability_info, client_chunk_item).await?;

                        (chunk_paths, is_async)
                    } else {
                        (Vec::new(), false)
                    };

                entry_manifest.client_modules.module_exports.insert(
                    get_client_reference_module_key(&server_path, "*"),
                    ManifestNodeEntry {
                        name: "*".into(),
                        id: (&*client_module_id).into(),
                        chunks: client_chunks_paths,
                        r#async: client_is_async,
                    },
                );

                if let Some(ssr_chunking_context) = ssr_chunking_context {
                    let ssr_chunk_item = ecmascript_client_reference
                        .ssr_module
                        .as_chunk_item(Vc::upcast(ssr_chunking_context));

                    let ssr_module_id = ssr_chunk_item.id().await?;

                    let (ssr_chunks_paths, ssr_is_async) = if runtime == NextRuntime::Edge {
                        // the chunks get added to the middleware-manifest.json instead
                        // of this file because the
                        // edge runtime doesn't support dynamically
                        // loading chunks.
                        (Vec::new(), false)
                    } else if let Some((ssr_chunks, ssr_availability_info)) =
                        client_references_chunks
                            .client_component_ssr_chunks
                            .get(&app_client_reference_ty)
                    {
                        let ssr_chunks = ssr_chunks.await?;

                        let ssr_chunks_paths = ssr_chunks
                            .iter()
                            .map(|chunk| chunk.ident().path())
                            .try_join()
                            .await?;

                        let chunk_paths = ssr_chunks_paths
                            .iter()
                            .filter_map(|chunk_path| node_root_ref.get_path_to(chunk_path))
                            .map(ToString::to_string)
                            .map(RcStr::from)
                            .collect::<Vec<_>>();

                        let is_async = is_item_async(ssr_availability_info, ssr_chunk_item).await?;

                        (chunk_paths, is_async)
                    } else {
                        (Vec::new(), false)
                    };

                    let mut ssr_manifest_node = ManifestNode::default();
                    ssr_manifest_node.module_exports.insert(
                        "*".into(),
                        ManifestNodeEntry {
                            name: "*".into(),
                            id: (&*ssr_module_id).into(),
                            chunks: ssr_chunks_paths,
                            r#async: ssr_is_async,
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
                .with_extension("".into())
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
                    let path = path.into();
                    if chunk_path.extension_ref() == Some("css") {
                        entry_css_files.insert(path);
                    } else {
                        entry_js_files.insert(path);
                    }
                }
            }
        }

        let client_reference_manifest_json = serde_json::to_string(&entry_manifest).unwrap();

        // We put normalized path for the each entry key and the manifest output path,
        // to conform next.js's load client reference manifest behavior:
        // https://github.com/vercel/next.js/blob/2f9d718695e4c90be13c3bf0f3647643533071bf/packages/next/src/server/load-components.ts#L162-L164
        // note this only applies to the manifests, assets are placed to the original
        // path still (same as webpack does)
        let normalized_manifest_entry = entry_name.replace("%5F", "_");
        Ok(Vc::upcast(VirtualOutputAsset::new(
            node_root.join(
                format!("server/app{normalized_manifest_entry}_client-reference-manifest.js",)
                    .into(),
            ),
            AssetContent::file(
                File::from(formatdoc! {
                    r#"
                        globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {{}};
                        globalThis.__RSC_MANIFEST[{entry_name}] = {manifest}
                    "#,
                    entry_name = StringifyJs(&normalized_manifest_entry),
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
pub fn get_client_reference_module_key(server_path: &str, export_name: &str) -> RcStr {
    if export_name == "*" {
        server_path.into()
    } else {
        format!("{}#{}", server_path, export_name).into()
    }
}

async fn is_item_async(
    availability_info: &AvailabilityInfo,
    chunk_item: Vc<Box<dyn ChunkItem>>,
) -> Result<bool> {
    let Some(available_chunk_items) = availability_info.available_chunk_items() else {
        return Ok(false);
    };

    let Some(info) = &*available_chunk_items.get(chunk_item).await? else {
        return Ok(false);
    };

    Ok(info.is_async)
}
