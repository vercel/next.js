use anyhow::Result;
use either::Either;
use indoc::formatdoc;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, ReadRef, ResolvedVc, TaskInput, TryFlatJoinIterExt, TryJoinIterExt, ValueToString,
    Vc,
};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkingContext, ModuleChunkItemIdExt, ModuleId as TurbopackModuleId},
    module_graph::async_module_info::AsyncModulesInfo,
    output::{OutputAsset, OutputAssets},
    virtual_output::VirtualOutputAsset,
};
use turbopack_ecmascript::utils::StringifyJs;

use super::{ClientReferenceManifest, CssResource, ManifestNode, ManifestNodeEntry, ModuleId};
use crate::{
    mode::NextMode,
    next_app::ClientReferencesChunks,
    next_client_reference::{ClientReferenceGraphResult, ClientReferenceType},
    next_config::NextConfig,
    util::NextRuntime,
};

#[derive(TaskInput, Clone, Hash, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClientReferenceManifestOptions {
    pub node_root: Vc<FileSystemPath>,
    pub client_relative_path: Vc<FileSystemPath>,
    pub entry_name: RcStr,
    pub client_references: Vc<ClientReferenceGraphResult>,
    pub client_references_chunks: Vc<ClientReferencesChunks>,
    pub rsc_app_entry_chunks: Vc<OutputAssets>,
    pub client_chunking_context: Vc<Box<dyn ChunkingContext>>,
    pub ssr_chunking_context: Option<Vc<Box<dyn ChunkingContext>>>,
    pub async_module_info: Vc<AsyncModulesInfo>,
    pub next_config: Vc<NextConfig>,
    pub runtime: NextRuntime,
    pub mode: Vc<NextMode>,
}

#[turbo_tasks::value_impl]
impl ClientReferenceManifest {
    #[turbo_tasks::function]
    pub async fn build_output(
        options: ClientReferenceManifestOptions,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let ClientReferenceManifestOptions {
            node_root,
            client_relative_path,
            entry_name,
            client_references,
            client_references_chunks,
            rsc_app_entry_chunks,
            client_chunking_context,
            ssr_chunking_context,
            async_module_info,
            next_config,
            runtime,
            mode,
        } = options;
        let span = tracing::info_span!(
            "ClientReferenceManifest build output",
            entry_name = display(&entry_name)
        );
        async move {
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
            let ClientReferencesChunks {
                client_component_client_chunks,
                layout_segment_client_chunks,
                client_component_ssr_chunks,
            } = &*client_references_chunks.await?;
            let client_relative_path = &*client_relative_path.await?;
            let node_root_ref = &*node_root.await?;
            let rsc_app_entry_chunks = &*rsc_app_entry_chunks.await?;

            let client_references_ecmascript = client_references
                .await?
                .client_references
                .iter()
                .map(async |r| {
                    Ok(match r.ty() {
                        ClientReferenceType::EcmascriptClientReference(r) => Some((r, r.await?)),
                        ClientReferenceType::CssClientReference(_) => None,
                    })
                })
                .try_flat_join()
                .await?;

            let async_modules = async_module_info
                .is_async_multiple(Vc::cell(
                    client_references_ecmascript
                        .iter()
                        .flat_map(|(r, r_val)| {
                            [
                                ResolvedVc::upcast(*r),
                                ResolvedVc::upcast(r_val.client_module),
                                ResolvedVc::upcast(r_val.ssr_module),
                            ]
                        })
                        .collect(),
                ))
                .await?;

            async fn cached_chunk_paths(
                cache: &mut FxHashMap<ResolvedVc<Box<dyn OutputAsset>>, ReadRef<FileSystemPath>>,
                chunks: impl Iterator<Item = ResolvedVc<Box<dyn OutputAsset>>>,
            ) -> Result<
                impl Iterator<Item = (ResolvedVc<Box<dyn OutputAsset>>, ReadRef<FileSystemPath>)>,
            > {
                let results = chunks
                    .into_iter()
                    .map(|chunk| (chunk, cache.get(&chunk).cloned()))
                    .map(async |(chunk, path)| {
                        Ok(if let Some(path) = path {
                            (chunk, Either::Left(path))
                        } else {
                            (chunk, Either::Right(chunk.path().await?))
                        })
                    })
                    .try_join()
                    .await?;

                for (chunk, path) in &results {
                    if let Either::Right(path) = path {
                        cache.insert(*chunk, path.clone());
                    }
                }
                Ok(results.into_iter().map(|(chunk, path)| match path {
                    Either::Left(path) => (chunk, path),
                    Either::Right(path) => (chunk, path),
                }))
            }
            let mut client_chunk_path_cache: FxHashMap<
                ResolvedVc<Box<dyn OutputAsset>>,
                ReadRef<FileSystemPath>,
            > = FxHashMap::default();
            let mut ssr_chunk_path_cache: FxHashMap<
                ResolvedVc<Box<dyn OutputAsset>>,
                ReadRef<FileSystemPath>,
            > = FxHashMap::default();
            let mut rsc_chunk_path_cache: FxHashMap<
                ResolvedVc<Box<dyn OutputAsset>>,
                ReadRef<FileSystemPath>,
            > = FxHashMap::default();

            for (client_reference_module, client_reference_module_ref) in
                client_references_ecmascript
            {
                let app_client_reference_ty =
                    ClientReferenceType::EcmascriptClientReference(client_reference_module);

                let server_path = client_reference_module_ref.server_ident.to_string().await?;
                let client_module = client_reference_module_ref.client_module;
                let client_chunk_item_id = client_module
                    .chunk_item_id(Vc::upcast(client_chunking_context))
                    .await?;

                let (client_chunks_paths, client_is_async) =
                    if let Some((client_chunks, _client_availability_info)) =
                        client_component_client_chunks.get(&app_client_reference_ty)
                    {
                        let client_chunks = client_chunks.await?;
                        references.extend(client_chunks.iter());
                        let client_chunks_paths = cached_chunk_paths(
                            &mut client_chunk_path_cache,
                            client_chunks.iter().copied(),
                        )
                        .await?;

                        let chunk_paths = client_chunks_paths
                            .filter_map(|(_, chunk_path)| {
                                client_relative_path
                                    .get_path_to(&chunk_path)
                                    .map(ToString::to_string)
                            })
                            // It's possible that a chunk also emits CSS files, that will
                            // be handled separatedly.
                            .filter(|path| path.ends_with(".js"))
                            .map(RcStr::from)
                            .collect::<Vec<_>>();

                        let is_async = async_modules.contains(&ResolvedVc::upcast(client_module));

                        (chunk_paths, is_async)
                    } else {
                        (Vec::new(), false)
                    };

                if let Some(ssr_chunking_context) = ssr_chunking_context {
                    let ssr_module = client_reference_module_ref.ssr_module;
                    let ssr_chunk_item_id = ssr_module
                        .chunk_item_id(Vc::upcast(ssr_chunking_context))
                        .await?;

                    let rsc_chunk_item_id = client_reference_module
                        .chunk_item_id(Vc::upcast(ssr_chunking_context))
                        .await?;

                    let (ssr_chunks_paths, ssr_is_async) = if runtime == NextRuntime::Edge {
                        // the chunks get added to the middleware-manifest.json instead
                        // of this file because the
                        // edge runtime doesn't support dynamically
                        // loading chunks.
                        (Vec::new(), false)
                    } else if let Some((ssr_chunks, _ssr_availability_info)) =
                        client_component_ssr_chunks.get(&app_client_reference_ty)
                    {
                        let ssr_chunks = ssr_chunks.await?;
                        references.extend(ssr_chunks.iter());

                        let ssr_chunks_paths = cached_chunk_paths(
                            &mut ssr_chunk_path_cache,
                            ssr_chunks.iter().copied(),
                        )
                        .await?;
                        let chunk_paths = ssr_chunks_paths
                            .filter_map(|(_, chunk_path)| {
                                node_root_ref
                                    .get_path_to(&chunk_path)
                                    .map(ToString::to_string)
                            })
                            .map(RcStr::from)
                            .collect::<Vec<_>>();

                        let is_async = async_modules.contains(&ResolvedVc::upcast(ssr_module));

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
                        let rsc_chunks_paths = cached_chunk_paths(
                            &mut rsc_chunk_path_cache,
                            rsc_app_entry_chunks.iter().copied(),
                        )
                        .await?;

                        let chunk_paths = rsc_chunks_paths
                            .filter_map(|(_, chunk_path)| {
                                node_root_ref
                                    .get_path_to(&chunk_path)
                                    .map(ToString::to_string)
                            })
                            .map(RcStr::from)
                            .collect::<Vec<_>>();

                        let is_async =
                            async_modules.contains(&ResolvedVc::upcast(client_reference_module));

                        (chunk_paths, is_async)
                    };

                    entry_manifest.client_modules.module_exports.insert(
                        get_client_reference_module_key(&server_path, "*"),
                        ManifestNodeEntry {
                            name: "*".into(),
                            id: (&*client_chunk_item_id).into(),
                            chunks: client_chunks_paths,
                            // This should of course be client_is_async, but SSR can become
                            // async due to ESM externals, and
                            // the ssr_manifest_node is currently ignored
                            // by React.
                            r#async: client_is_async || ssr_is_async,
                        },
                    );

                    let mut ssr_manifest_node = ManifestNode::default();
                    ssr_manifest_node.module_exports.insert(
                        "*".into(),
                        ManifestNodeEntry {
                            name: "*".into(),
                            id: (&*ssr_chunk_item_id).into(),
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
                            id: (&*rsc_chunk_item_id).into(),
                            chunks: rsc_chunks_paths,
                            r#async: rsc_is_async,
                        },
                    );

                    match runtime {
                        NextRuntime::NodeJs => {
                            entry_manifest
                                .ssr_module_mapping
                                .insert((&*client_chunk_item_id).into(), ssr_manifest_node);
                            entry_manifest
                                .rsc_module_mapping
                                .insert((&*client_chunk_item_id).into(), rsc_manifest_node);
                        }
                        NextRuntime::Edge => {
                            entry_manifest
                                .edge_ssr_module_mapping
                                .insert((&*client_chunk_item_id).into(), ssr_manifest_node);
                            entry_manifest
                                .edge_rsc_module_mapping
                                .insert((&*client_chunk_item_id).into(), rsc_manifest_node);
                        }
                    }
                }
            }

            // per layout segment chunks need to be emitted into the manifest too
            for (server_component, client_chunks) in layout_segment_client_chunks.iter() {
                let server_component_name = server_component
                    .server_path()
                    .with_extension("".into())
                    .to_string()
                    .owned()
                    .await?;
                let mut entry_css_files_with_chunk = Vec::new();
                let entry_js_files = entry_manifest
                    .entry_js_files
                    .entry(server_component_name.clone())
                    .or_default();

                let client_chunks = &client_chunks.await?;
                let client_chunks_with_path =
                    cached_chunk_paths(&mut client_chunk_path_cache, client_chunks.iter().copied())
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
                    .map(async |(path, chunk)| {
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
                    .entry(server_component_name)
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
        .instrument(span)
        .await
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
