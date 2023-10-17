use anyhow::Result;
use next_core::all_assets_from_entries;
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, TryFlatJoinIterExt, Vc};
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::core::{
        asset::{Asset, AssetContent},
        output::{OutputAsset, OutputAssets},
    },
};

/// A reference to a server file with content hash for change detection
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TraceRawVcs)]
pub struct ServerPath {
    /// Relative to the root_path
    pub path: String,
    pub content_hash: u64,
}

/// A list of server paths
#[turbo_tasks::value(transparent)]
pub struct ServerPaths(Vec<ServerPath>);

/// Return a list of all server paths with filename and hash for all output
/// assets references from the `assets` list. Server paths are identified by
/// being inside of `node_root`.
#[turbo_tasks::function]
pub async fn all_server_paths(
    assets: Vc<OutputAssets>,
    node_root: Vc<FileSystemPath>,
) -> Result<Vc<ServerPaths>> {
    let all_assets = all_assets_from_entries(assets).await?;
    let node_root = &node_root.await?;
    Ok(Vc::cell(
        all_assets
            .iter()
            .map(|&asset| async move {
                Ok(
                    if let Some(path) = node_root.get_path_to(&*asset.ident().path().await?) {
                        let content_hash = match *asset.content().await? {
                            AssetContent::File(file) => *file.hash().await?,
                            AssetContent::Redirect { .. } => 0,
                        };
                        Some(ServerPath {
                            path: path.to_string(),
                            content_hash,
                        })
                    } else {
                        None
                    },
                )
            })
            .try_flat_join()
            .await?,
    ))
}
