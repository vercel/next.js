use anyhow::Result;
use either::Either;
use indoc::formatdoc;
use itertools::Itertools;
use rustc_hash::FxHashMap;
use serde::Serialize;
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, FxIndexSet, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, ValueToString, Vc,
};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        ChunkGroupResult, ChunkingContext, ModuleChunkItemIdExt, ModuleId as TurbopackModuleId,
    },
    module_graph::async_module_info::AsyncModulesInfo,
    output::{OutputAsset, OutputAssets, OutputAssetsWithReferenced},
};
use turbopack_ecmascript::utils::StringifyJs;

use crate::{
    mode::NextMode,
    next_app::ClientReferencesChunks,
    next_client_reference::{ClientReferenceGraphResult, ClientReferenceType},
    next_config::{CrossOriginConfig, NextConfig},
    next_manifests::{ModuleId, encode_uri_component::encode_uri_component},
    util::NextRuntime,
};

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SerializedClientReferenceManifest {
    pub module_loading: ModuleLoading,
    /// Mapping of module path and export name to client module ID and required
    /// client chunks.
    pub client_modules: ManifestNode,
    /// Mapping of client module ID to corresponding SSR module ID and required
    /// SSR chunks.
    pub ssr_module_mapping: FxIndexMap<ModuleId, ManifestNode>,
    /// Same as `ssr_module_mapping`, but for Edge SSR.
    #[serde(rename = "edgeSSRModuleMapping")]
    pub edge_ssr_module_mapping: FxIndexMap<ModuleId, ManifestNode>,
    /// Mapping of client module ID to corresponding RSC module ID and required
    /// RSC chunks.
    pub rsc_module_mapping: FxIndexMap<ModuleId, ManifestNode>,
    /// Same as `rsc_module_mapping`, but for Edge RSC.
    #[serde(rename = "edgeRscModuleMapping")]
    pub edge_rsc_module_mapping: FxIndexMap<ModuleId, ManifestNode>,
    /// Mapping of server component path to required CSS client chunks.
    #[serde(rename = "entryCSSFiles")]
    pub entry_css_files: FxIndexMap<RcStr, FxIndexSet<CssResource>>,
    /// Mapping of server component path to required JS client chunks.
    #[serde(rename = "entryJSFiles")]
    pub entry_js_files: FxIndexMap<RcStr, FxIndexSet<RcStr>>,
}

#[derive(Serialize, Debug, Clone, Eq, Hash, PartialEq)]
pub struct CssResource {
    pub path: RcStr,
    pub inlined: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<RcStr>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModuleLoading {
    pub prefix: RcStr,
    pub cross_origin: Option<CrossOriginConfig>,
}

#[derive(Serialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ManifestNode {
    /// Mapping of export name to manifest node entry.
    #[serde(flatten)]
    pub module_exports: FxIndexMap<RcStr, ManifestNodeEntry>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ManifestNodeEntry {
    /// Turbopack module ID.
    pub id: ModuleId,
    /// Export name.
    pub name: RcStr,
    /// Chunks for the module. JS and CSS.
    pub chunks: Vec<RcStr>,
    // TODO(WEB-434)
    pub r#async: bool,
}

#[turbo_tasks::value(shared)]
pub struct ClientReferenceManifest {
    pub node_root: FileSystemPath,
    pub client_relative_path: FileSystemPath,
    pub entry_name: RcStr,
    pub client_references: ResolvedVc<ClientReferenceGraphResult>,
    pub client_references_chunks: ResolvedVc<ClientReferencesChunks>,
    pub client_chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub ssr_chunking_context: Option<ResolvedVc<Box<dyn ChunkingContext>>>,
    pub async_module_info: ResolvedVc<AsyncModulesInfo>,
    pub next_config: ResolvedVc<NextConfig>,
    pub runtime: NextRuntime,
    pub mode: NextMode,
}

#[turbo_tasks::value_impl]
impl OutputAsset for ClientReferenceManifest {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<Vc<FileSystemPath>> {
        let normalized_manifest_entry = self.entry_name.replace("%5F", "_");
        Ok(self
            .node_root
            .join(&format!(
                "server/app{normalized_manifest_entry}_client-reference-manifest.js",
            ))?
            .cell())
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        Ok(*build_manifest(self).await?.references)
    }
}

#[turbo_tasks::value_impl]
impl Asset for ClientReferenceManifest {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        Ok(*build_manifest(self).await?.content)
    }
}

#[turbo_tasks::value(shared)]
struct ClientReferenceManifestResult {
    content: ResolvedVc<AssetContent>,
    references: ResolvedVc<OutputAssets>,
}

#[turbo_tasks::function]
async fn build_manifest(
    manifest: Vc<ClientReferenceManifest>,
) -> Result<Vc<ClientReferenceManifestResult>> {
    let ClientReferenceManifest {
        node_root,
        client_relative_path,
        entry_name,
        client_references,
        client_references_chunks,
        client_chunking_context,
        ssr_chunking_context,
        async_module_info,
        next_config,
        runtime,
        mode,
    } = &*manifest.await?;
    let span = tracing::info_span!(
        "build client reference manifest",
        entry_name = display(&entry_name)
    );
    async move {
        let mut entry_manifest: SerializedClientReferenceManifest = Default::default();
        let mut references = FxIndexSet::default();
        let chunk_suffix_path = next_config.chunk_suffix_path().owned().await?;
        let prefix_path = next_config.computed_asset_prefix().owned().await?;
        let suffix_path = chunk_suffix_path.unwrap_or_default();

        // TODO: Add `suffix` to the manifest for React to use.
        // entry_manifest.module_loading.prefix = prefix_path;

        entry_manifest.module_loading.cross_origin = next_config.cross_origin().owned().await?;
        let ClientReferencesChunks {
            client_component_client_chunks,
            layout_segment_client_chunks,
            client_component_ssr_chunks,
        } = &*client_references_chunks.await?;
        let client_relative_path = client_relative_path.clone();
        let node_root_ref = node_root.clone();

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
            cache: &mut FxHashMap<ResolvedVc<Box<dyn OutputAsset>>, FileSystemPath>,
            chunks: impl Iterator<Item = ResolvedVc<Box<dyn OutputAsset>>>,
        ) -> Result<impl Iterator<Item = (ResolvedVc<Box<dyn OutputAsset>>, FileSystemPath)>>
        {
            let results = chunks
                .into_iter()
                .map(|chunk| (chunk, cache.get(&chunk).cloned()))
                .map(async |(chunk, path)| {
                    Ok(if let Some(path) = path {
                        (chunk, Either::Left(path))
                    } else {
                        (chunk, Either::Right(chunk.path().owned().await?))
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
            FileSystemPath,
        > = FxHashMap::default();
        let mut ssr_chunk_path_cache: FxHashMap<ResolvedVc<Box<dyn OutputAsset>>, FileSystemPath> =
            FxHashMap::default();

        for (client_reference_module, client_reference_module_ref) in client_references_ecmascript {
            let app_client_reference_ty =
                ClientReferenceType::EcmascriptClientReference(client_reference_module);

            let server_path = client_reference_module_ref.server_ident.to_string().await?;
            let client_module = client_reference_module_ref.client_module;
            let client_chunk_item_id = client_module
                .chunk_item_id(**client_chunking_context)
                .await?;

            let (client_chunks_paths, client_is_async) = if let Some(ChunkGroupResult {
                assets: client_chunks,
                referenced_assets: client_referenced_assets,
                availability_info: _,
            }) =
                client_component_client_chunks.get(&app_client_reference_ty)
            {
                let client_chunks = client_chunks.await?;
                let client_referenced_assets = client_referenced_assets.await?;
                references.extend(client_chunks.iter());
                references.extend(client_referenced_assets.iter());

                let client_chunks_paths =
                    cached_chunk_paths(&mut client_chunk_path_cache, client_chunks.iter().copied())
                        .await?;

                let chunk_paths = client_chunks_paths
                    .filter_map(|(_, chunk_path)| {
                        client_relative_path
                            .get_path_to(&chunk_path)
                            .map(ToString::to_string)
                    })
                    // It's possible that a chunk also emits CSS files, that will
                    // be handled separately.
                    .filter(|path| path.ends_with(".js"))
                    .map(|path| {
                        format!(
                            "{}{}{}",
                            prefix_path,
                            path.split('/').map(encode_uri_component).format("/"),
                            suffix_path
                        )
                    })
                    .map(RcStr::from)
                    .collect::<Vec<_>>();

                let is_async = async_modules.contains(&ResolvedVc::upcast(client_module));

                (chunk_paths, is_async)
            } else {
                (Vec::new(), false)
            };

            if let Some(ssr_chunking_context) = *ssr_chunking_context {
                let ssr_module = client_reference_module_ref.ssr_module;
                let ssr_chunk_item_id = ssr_module.chunk_item_id(*ssr_chunking_context).await?;

                let rsc_chunk_item_id = client_reference_module
                    .chunk_item_id(*ssr_chunking_context)
                    .await?;

                let (ssr_chunks_paths, ssr_is_async) = if *runtime == NextRuntime::Edge {
                    // the chunks get added to the middleware-manifest.json instead
                    // of this file because the
                    // edge runtime doesn't support dynamically
                    // loading chunks.
                    (Vec::new(), false)
                } else if let Some(ChunkGroupResult {
                    assets: ssr_chunks,
                    referenced_assets: ssr_referenced_assets,
                    availability_info: _,
                }) = client_component_ssr_chunks.get(&app_client_reference_ty)
                {
                    let ssr_chunks = ssr_chunks.await?;
                    let ssr_referenced_assets = ssr_referenced_assets.await?;
                    references.extend(ssr_chunks.iter());
                    references.extend(ssr_referenced_assets.iter());

                    let ssr_chunks_paths =
                        cached_chunk_paths(&mut ssr_chunk_path_cache, ssr_chunks.iter().copied())
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

                let rsc_is_async = if *runtime == NextRuntime::Edge {
                    false
                } else {
                    async_modules.contains(&ResolvedVc::upcast(client_reference_module))
                };

                entry_manifest.client_modules.module_exports.insert(
                    get_client_reference_module_key(&server_path, "*"),
                    ManifestNodeEntry {
                        name: rcstr!("*"),
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
                    rcstr!("*"),
                    ManifestNodeEntry {
                        name: rcstr!("*"),
                        id: (&*ssr_chunk_item_id).into(),
                        chunks: ssr_chunks_paths,
                        // See above
                        r#async: client_is_async || ssr_is_async,
                    },
                );

                let mut rsc_manifest_node = ManifestNode::default();
                rsc_manifest_node.module_exports.insert(
                    rcstr!("*"),
                    ManifestNodeEntry {
                        name: rcstr!("*"),
                        id: (&*rsc_chunk_item_id).into(),
                        chunks: vec![],
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
        for (
            server_component,
            OutputAssetsWithReferenced {
                assets: client_chunks,
                referenced_assets: _,
            },
        ) in layout_segment_client_chunks.iter()
        {
            let server_component_name = server_component
                .server_path()
                .await?
                .with_extension("")
                .value_to_string()
                .owned()
                .await?;
            let entry_js_files = entry_manifest
                .entry_js_files
                .entry(server_component_name.clone())
                .or_default();
            let entry_css_files = entry_manifest
                .entry_css_files
                .entry(server_component_name)
                .or_default();

            let client_chunks = &client_chunks.await?;
            let client_chunks_with_path =
                cached_chunk_paths(&mut client_chunk_path_cache, client_chunks.iter().copied())
                    .await?;
            // Inlining breaks HMR so it is always disabled in dev.
            let inlined_css = *next_config.inline_css().await? && mode.is_production();

            for (chunk, chunk_path) in client_chunks_with_path {
                if let Some(path) = client_relative_path.get_path_to(&chunk_path) {
                    // The entry CSS files and entry JS files don't have prefix and suffix
                    // applied because it is added by Next.js during rendering.
                    let path = path.into();
                    if chunk_path.has_extension(".css") {
                        let content = if inlined_css {
                            Some(
                                if let Some(content_file) =
                                    chunk.content().file_content().await?.as_content()
                                {
                                    content_file.content().to_str()?.into()
                                } else {
                                    RcStr::default()
                                },
                            )
                        } else {
                            None
                        };
                        entry_css_files.insert(CssResource {
                            path,
                            inlined: inlined_css,
                            content,
                        });
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
        Ok(ClientReferenceManifestResult {
            content: AssetContent::file(
                File::from(formatdoc! {
                    r#"
                        globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {{}};
                        globalThis.__RSC_MANIFEST[{entry_name}] = {manifest}
                    "#,
                    entry_name = StringifyJs(&normalized_manifest_entry),
                    manifest = &client_reference_manifest_json
                })
                .into(),
            )
            .to_resolved()
            .await?,
            references: ResolvedVc::cell(references.into_iter().collect()),
        }
        .cell())
    }
    .instrument(span)
    .await
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
        format!("{server_path}#{export_name}").into()
    }
}
