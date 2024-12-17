use anyhow::Result;
use indoc::formatdoc;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexSet, ResolvedVc, TryJoinIterExt, Value, ValueToString, Vc};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        availability_info::AvailabilityInfo, ChunkItem, ChunkItemExt, ChunkableModule,
        ChunkingContext, ModuleId as TurbopackModuleId,
    },
    output::{OutputAsset, OutputAssets},
    virtual_output::VirtualOutputAsset,
};
use turbopack_ecmascript::utils::StringifyJs;

use super::{ClientReferenceManifest, CssResource, ManifestNode, ManifestNodeEntry, ModuleId};
use crate::{
    mode::NextMode,
    next_app::ClientReferencesChunks,
    next_client_reference::{
        ecmascript_client_reference::ecmascript_client_reference_proxy_module::EcmascriptClientReferenceProxyModule,
        ClientReferenceGraphResult, ClientReferenceType,
    },
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
        rsc_app_entry_chunks: Vc<OutputAssets>,
        rsc_app_entry_chunks_availability: Value<AvailabilityInfo>,
        client_chunking_context: Vc<Box<dyn ChunkingContext>>,
        ssr_chunking_context: Option<Vc<Box<dyn ChunkingContext>>>,
        next_config: Vc<NextConfig>,
        runtime: NextRuntime,
        mode: Vc<NextMode>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let mut entry_manifest: ClientReferenceManifest = Default::default();
        let mut references = FxIndexSet::default();
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
        let rsc_app_entry_chunks = rsc_app_entry_chunks.await?;

        for app_client_reference in client_references.await?.client_references.iter() {
            let app_client_reference_ty = app_client_reference.ty();

            // An client component need to be emitted into the client reference manifest
            if let ClientReferenceType::EcmascriptClientReference {
                parent_module,
                module: ecmascript_client_reference,
            } = app_client_reference_ty
            {
                let ecmascript_client_reference = ecmascript_client_reference.await?;

                let server_path = ecmascript_client_reference.server_ident.to_string().await?;

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
                        references.extend(client_chunks.iter());
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

                if let Some(ssr_chunking_context) = ssr_chunking_context {
                    let ssr_chunk_item = ecmascript_client_reference
                        .ssr_module
                        .as_chunk_item(Vc::upcast(ssr_chunking_context));
                    let ssr_module_id = ssr_chunk_item.id().await?;

                    let rsc_chunk_item: Vc<Box<dyn ChunkItem>> =
                        ResolvedVc::try_downcast_type::<EcmascriptClientReferenceProxyModule>(
                            parent_module,
                        )
                        .await?
                        .unwrap()
                        .as_chunk_item(Vc::upcast(ssr_chunking_context));
                    let rsc_module_id = rsc_chunk_item.id().await?;

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
                        references.extend(ssr_chunks.iter());

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

                    let (rsc_chunks_paths, rsc_is_async) = if runtime == NextRuntime::Edge {
                        // the chunks get added to the middleware-manifest.json instead
                        // of this file because the
                        // edge runtime doesn't support dynamically
                        // loading chunks.
                        (Vec::new(), false)
                    } else {
                        let rsc_chunks_paths = rsc_app_entry_chunks
                            .iter()
                            .map(|chunk| chunk.ident().path())
                            .try_join()
                            .await?;

                        let chunk_paths = rsc_chunks_paths
                            .iter()
                            .filter_map(|chunk_path| node_root_ref.get_path_to(chunk_path))
                            .map(ToString::to_string)
                            .map(RcStr::from)
                            .collect::<Vec<_>>();

                        let is_async =
                            is_item_async(&rsc_app_entry_chunks_availability, rsc_chunk_item)
                                .await?;

                        (chunk_paths, is_async)
                    };

                    entry_manifest.client_modules.module_exports.insert(
                        get_client_reference_module_key(&server_path, "*"),
                        ManifestNodeEntry {
                            name: "*".into(),
                            id: (&*client_module_id).into(),
                            chunks: client_chunks_paths,
                            // This should of course be client_is_async, but SSR can become async
                            // due to ESM externals, and the ssr_manifest_node is currently ignored
                            // by React.
                            r#async: client_is_async || ssr_is_async,
                        },
                    );

                    let mut ssr_manifest_node = ManifestNode::default();
                    ssr_manifest_node.module_exports.insert(
                        "*".into(),
                        ManifestNodeEntry {
                            name: "*".into(),
                            id: (&*ssr_module_id).into(),
                            chunks: ssr_chunks_paths,
                            // See above
                            r#async: client_is_async || ssr_is_async,
                        },
                    );

                    let mut rsc_manifest_node = ManifestNode::default();
                    rsc_manifest_node.module_exports.insert(
                        "*".into(),
                        ManifestNodeEntry {
                            name: "*".into(),
                            id: (&*rsc_module_id).into(),
                            chunks: rsc_chunks_paths,
                            r#async: rsc_is_async,
                        },
                    );

                    match runtime {
                        NextRuntime::NodeJs => {
                            entry_manifest
                                .ssr_module_mapping
                                .insert((&*client_module_id).into(), ssr_manifest_node);
                            entry_manifest
                                .rsc_module_mapping
                                .insert((&*client_module_id).into(), rsc_manifest_node);
                        }
                        NextRuntime::Edge => {
                            entry_manifest
                                .edge_ssr_module_mapping
                                .insert((&*client_module_id).into(), ssr_manifest_node);
                            entry_manifest
                                .edge_rsc_module_mapping
                                .insert((&*client_module_id).into(), rsc_manifest_node);
                        }
                    }
                }
            }
        }

        // per layout segment chunks need to be emitted into the manifest too
        for (server_component, client_chunks) in
            client_references_chunks.layout_segment_client_chunks.iter()
        {
            let server_component_name = server_component
                .server_path()
                .with_extension("".into())
                .to_string()
                .await?;

            let mut entry_css_files_with_chunk = Vec::new();
            let entry_js_files = entry_manifest
                .entry_js_files
                .entry(server_component_name.clone_value())
                .or_default();

            let client_chunks = &client_chunks.await?;
            let client_chunks_with_path = client_chunks
                .iter()
                .map(|chunk| async move { Ok((chunk, chunk.ident().path().await?)) })
                .try_join()
                .await?;

            for (chunk, chunk_path) in client_chunks_with_path {
                if let Some(path) = client_relative_path.get_path_to(&chunk_path) {
                    let path = path.into();
                    if chunk_path.extension_ref() == Some("css") {
                        entry_css_files_with_chunk.push((path, chunk));
                    } else {
                        entry_js_files.insert(path);
                    }
                }
            }

            let inlined = next_config.await?.experimental.inline_css.unwrap_or(false)
                && mode.await?.is_production();
            let entry_css_files_vec = entry_css_files_with_chunk
                .into_iter()
                .map(|(path, chunk)| async {
                    let content = if inlined {
                        if let Some(content_file) =
                            chunk.content().file_content().await?.as_content()
                        {
                            Some(content_file.content().to_str()?.into())
                        } else {
                            Some("".into())
                        }
                    } else {
                        None
                    };
                    Ok(CssResource {
                        path,
                        inlined,
                        content,
                    })
                })
                .try_join()
                .await?;

            let entry_css_files = entry_manifest
                .entry_css_files
                .entry(server_component_name.clone_value())
                .or_default();
            entry_css_files.extend(entry_css_files_vec);
        }

        let client_reference_manifest_json = serde_json::to_string(&entry_manifest).unwrap();

        // We put normalized path for the each entry key and the manifest output path,
        // to conform next.js's load client reference manifest behavior:
        // https://github.com/vercel/next.js/blob/2f9d718695e4c90be13c3bf0f3647643533071bf/packages/next/src/server/load-components.ts#L162-L164
        // note this only applies to the manifests, assets are placed to the original
        // path still (same as webpack does)
        let normalized_manifest_entry = entry_name.replace("%5F", "_");
        Ok(Vc::upcast(VirtualOutputAsset::new_with_references(
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
            Vc::cell(references.into_iter().collect()),
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
