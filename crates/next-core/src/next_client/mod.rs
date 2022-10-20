pub(crate) mod context;
pub(crate) mod runtime_entry;

use anyhow::{bail, Result};
use turbo_tasks::ValueToString;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::{
    ecmascript::chunk_group_files_asset::ChunkGroupFilesAsset,
    module_options::ModuleOptionsContextVc,
    resolve_options_context::ResolveOptionsContextVc,
    transition::{Transition, TransitionVc},
    ModuleAssetContextVc,
};
use turbopack_core::{
    asset::AssetVc,
    chunk::{ChunkableAssetVc, ChunkingContextVc},
    environment::EnvironmentVc,
    virtual_asset::VirtualAssetVc,
};

use self::runtime_entry::RuntimeEntriesVc;
use crate::embed_js::next_js_file;

/// Makes a transition into a next.js client context.
///
/// It wraps the target asset with client bootstrapping hydration. It changes
/// the environment to be inside of the browser. It offers a module to the
/// importer that exports an array of chunk urls.
#[turbo_tasks::value(shared)]
pub struct NextClientTransition {
    pub is_app: bool,
    pub client_environment: EnvironmentVc,
    pub client_module_options_context: ModuleOptionsContextVc,
    pub client_resolve_options_context: ResolveOptionsContextVc,
    pub client_chunking_context: ChunkingContextVc,
    pub server_root: FileSystemPathVc,
    pub runtime_entries: RuntimeEntriesVc,
}

#[turbo_tasks::value_impl]
impl Transition for NextClientTransition {
    #[turbo_tasks::function]
    fn process_source(&self, asset: AssetVc) -> AssetVc {
        if self.is_app {
            VirtualAssetVc::new(
                asset.path().join("next-app-hydrate.tsx"),
                next_js_file("entry/app/hydrate.tsx").into(),
            )
            .into()
        } else {
            VirtualAssetVc::new(
                asset.path().join("next-hydrate.tsx"),
                next_js_file("entry/next-hydrate.tsx").into(),
            )
            .into()
        }
    }

    #[turbo_tasks::function]
    fn process_environment(&self, _environment: EnvironmentVc) -> EnvironmentVc {
        self.client_environment
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        _context: ModuleOptionsContextVc,
    ) -> ModuleOptionsContextVc {
        self.client_module_options_context
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: ResolveOptionsContextVc,
    ) -> ResolveOptionsContextVc {
        self.client_resolve_options_context
    }

    #[turbo_tasks::function]
    async fn process_module(
        &self,
        asset: AssetVc,
        context: ModuleAssetContextVc,
    ) -> Result<AssetVc> {
        let chunkable_asset = match ChunkableAssetVc::resolve_from(asset).await? {
            Some(chunkable_asset) => chunkable_asset,
            None => bail!("asset {} is not chunkable", asset.path().to_string().await?),
        };

        let runtime_entries = self.runtime_entries.resolve_entries(context.into());

        let asset = ChunkGroupFilesAsset {
            asset: chunkable_asset,
            chunking_context: self.client_chunking_context,
            base_path: self.server_root.join("_next"),
            runtime_entries: Some(runtime_entries),
        };

        Ok(asset.cell().into())
    }
}
