use anyhow::{anyhow, Result};
use turbo_tasks::ValueToString;
use turbo_tasks_fs::{File, FileContent, FileContentVc, FileSystemPathVc};
use turbopack::ecmascript::chunk_group_files_asset::ChunkGroupFilesAsset;
use turbopack_core::{
    asset::AssetVc,
    chunk::{ChunkableAssetVc, ChunkingContextVc},
    environment::EnvironmentVc,
    transition::{Transition, TransitionVc},
    wrapper_asset::WrapperAssetVc,
};

#[turbo_tasks::function]
fn get_next_hydrater() -> FileContentVc {
    FileContent::Content(File::from_source(
        include_str!("next_hydrater.js").to_string(),
    ))
    .cell()
}

/// Makes a transition into a next.js client context.
///
/// It wraps the target asset with client bootstrapping hydration. It changes
/// the environment to be inside of the browser. It offers a module to the
/// importer that exports an array of chunk urls.
#[turbo_tasks::value(shared)]
pub struct NextClientTransition {
    pub client_environment: EnvironmentVc,
    pub client_chunking_context: ChunkingContextVc,
    pub server_root: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl Transition for NextClientTransition {
    #[turbo_tasks::function]
    fn process_source(&self, asset: AssetVc) -> AssetVc {
        WrapperAssetVc::new(asset, "next-hydrate.js", get_next_hydrater()).into()
    }

    #[turbo_tasks::function]
    fn process_environment(&self, _environment: EnvironmentVc) -> EnvironmentVc {
        self.client_environment
    }

    #[turbo_tasks::function]
    async fn process_module(&self, asset: AssetVc) -> Result<AssetVc> {
        if let Some(chunkable_asset) = ChunkableAssetVc::resolve_from(asset).await? {
            Ok(ChunkGroupFilesAsset {
                asset: chunkable_asset,
                chunking_context: self.client_chunking_context,
                base_path: self.server_root,
            }
            .cell()
            .into())
        } else {
            Err(anyhow!(
                "asset {} is not chunkable",
                asset.path().to_string().await?
            ))
        }
    }
}
