use anyhow::Result;
use rustc_hash::FxHashSet;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, ValueToStringRef, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::{OutputAsset, OutputAssetsReference},
};

use crate::{
    next_app::ClientReferencesChunks,
    next_client_reference::{ClientReferenceGraphResult, ClientReferenceType},
    next_config::NextConfig,
};

/// A small JSON file emitted next to an app page's client reference manifest in production builds.
///
/// It contains the same data as the manifest's `entryJSFiles` field: for each server component
/// (layout segment) of the page, the client JS chunks it needs, in the same order. Build-time
/// tooling (`packages/next/src/build/route-bundle-stats.ts`) reads this instead of evaluating the
/// whole client reference manifest, which is much larger because it also maps every client
/// module.
///
/// The file is not needed at runtime and is not part of the page's file trace.
#[turbo_tasks::value(shared)]
pub struct EntryJsFilesManifest {
    pub node_root: FileSystemPath,
    pub client_relative_path: FileSystemPath,
    pub entry_name: RcStr,
    pub client_references: ResolvedVc<ClientReferenceGraphResult>,
    pub client_references_chunks: ResolvedVc<ClientReferencesChunks>,
    pub next_config: ResolvedVc<NextConfig>,
}

// The referenced chunks are emitted through the client reference manifest.
#[turbo_tasks::value_impl]
impl OutputAssetsReference for EntryJsFilesManifest {}

#[turbo_tasks::value_impl]
impl OutputAsset for EntryJsFilesManifest {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<Vc<FileSystemPath>> {
        // Mirror the client reference manifest's path normalization.
        let normalized_manifest_entry = self.entry_name.replace("%5F", "_");
        Ok(self
            .node_root
            .join(&format!(
                "server/app{normalized_manifest_entry}_entry-js-files.json",
            ))?
            .cell())
    }
}

#[turbo_tasks::value_impl]
impl Asset for EntryJsFilesManifest {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let ClientReferencesChunks {
            client_component_client_chunks,
            layout_segment_client_chunks,
            ..
        } = &*self.client_references_chunks.await?;
        let client_relative_path = &self.client_relative_path;

        // Component chunks are exposed via the manifest's `clientModules[].chunks`, so when the
        // feature is on they are dropped from `entryJSFiles`. This must match
        // `ClientReferenceManifest`'s behavior for production builds.
        let generate_component_chunks = *self
            .next_config
            .turbopack_generate_component_chunks()
            .await?;
        let mut client_reference_chunk_paths: FxHashSet<RcStr> = FxHashSet::default();
        if generate_component_chunks {
            for client_reference in self.client_references.await?.client_references.iter() {
                let ty @ ClientReferenceType::EcmascriptClientReference(_) = &client_reference.ty
                else {
                    continue;
                };
                let Some(client_assets) = client_component_client_chunks.get(ty) else {
                    continue;
                };
                for chunk in client_assets.primary_assets().await?.iter() {
                    if let Some(path) = client_relative_path.get_path_to(&*chunk.path().await?)
                        && path.ends_with(".js")
                    {
                        client_reference_chunk_paths.insert(path.into());
                    }
                }
            }
        }

        let mut entry_js_files: FxIndexMap<RcStr, FxIndexSet<RcStr>> = FxIndexMap::default();
        for (server_component, client_assets) in layout_segment_client_chunks.iter() {
            // Same key as the client reference manifest's `entryJSFiles`.
            let server_component_name = server_component
                .source_path()
                .await?
                .with_extension("")
                .to_string_ref()
                .await?;
            let files = entry_js_files.entry(server_component_name).or_default();
            for chunk in client_assets.primary_assets().await?.iter() {
                let chunk_path = chunk.path().await?;
                if let Some(path) = client_relative_path.get_path_to(&chunk_path)
                    && !chunk_path.has_extension(".css")
                {
                    let path: RcStr = path.into();
                    if !client_reference_chunk_paths.contains(&path) {
                        files.insert(path);
                    }
                }
            }
        }

        Ok(AssetContent::file(
            FileContent::Content(File::from(serde_json::to_string(&entry_js_files)?)).cell(),
        ))
    }
}
