use anyhow::Result;
use rustc_hash::FxHashSet;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::output::{OutputAsset, OutputAssets};

use crate::{
    next_app::ClientReferencesChunks,
    next_client_reference::{ClientReferenceGraphResult, ClientReferenceType},
};

/// The client JS chunks an App Router page loads on first load, for the route bundle stats
/// (`diagnostics/route-bundle-stats.json`) of production builds, with their paths relative to
/// `client_relative_path`.
///
/// These are the page's entry JS files (the client reference manifest's `entryJSFiles`, across all
/// layout segments, in the same order) followed by the client chunks shared by all pages (the
/// build manifest's `rootMainFiles`). Only `.js` files are included, each once.
///
/// This is not a turbo-tasks function: it only reads values that were already computed for the
/// page's output. It is called from the per-route task of `next_api::route_bundle_stats`.
pub async fn app_page_first_load_js_chunks(
    client_references: ResolvedVc<ClientReferenceGraphResult>,
    client_references_chunks: ResolvedVc<ClientReferencesChunks>,
    client_shared_chunks: ResolvedVc<OutputAssets>,
    client_relative_path: &FileSystemPath,
    generate_component_chunks: bool,
) -> Result<Vec<(RcStr, ResolvedVc<Box<dyn OutputAsset>>)>> {
    let ClientReferencesChunks {
        client_component_client_chunks,
        layout_segment_client_chunks,
        ..
    } = &*client_references_chunks.await?;

    // In production builds, component chunks are exposed via the client reference manifest's
    // `clientModules[].chunks` instead of `entryJSFiles` when component chunks are enabled. This
    // must match `ClientReferenceManifest`'s behavior for production builds.
    let mut component_chunk_paths: FxHashSet<RcStr> = FxHashSet::default();
    if generate_component_chunks {
        for client_reference in client_references.await?.client_references.iter() {
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
                    component_chunk_paths.insert(path.into());
                }
            }
        }
    }

    let mut chunks: FxIndexMap<RcStr, ResolvedVc<Box<dyn OutputAsset>>> = FxIndexMap::default();
    for client_assets in layout_segment_client_chunks.values() {
        for &chunk in client_assets.primary_assets().await?.iter() {
            if let Some(path) = client_relative_path.get_path_to(&*chunk.path().await?)
                && path.ends_with(".js")
                && !component_chunk_paths.contains(path)
            {
                chunks.entry(path.into()).or_insert(chunk);
            }
        }
    }
    for &chunk in client_shared_chunks.await?.iter() {
        if let Some(path) = client_relative_path.get_path_to(&*chunk.path().await?)
            && path.ends_with(".js")
        {
            chunks.entry(path.into()).or_insert(chunk);
        }
    }

    Ok(chunks.into_iter().collect())
}
