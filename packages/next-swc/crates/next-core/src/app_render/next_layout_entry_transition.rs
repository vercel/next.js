use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::{
    self,
    module_options::ModuleOptionsContextVc,
    resolve_options_context::ResolveOptionsContextVc,
    transition::{Transition, TransitionVc},
    ModuleAssetContextVc,
};
use turbopack_core::{asset::AssetVc, environment::EnvironmentVc, virtual_asset::VirtualAssetVc};
use turbopack_ecmascript::chunk::EcmascriptChunkPlaceableVc;

use crate::{
    embed_js::next_js_file, next_client_component::with_client_chunks::WithClientChunksAsset,
};

#[turbo_tasks::value(shared)]
pub struct NextLayoutEntryTransition {
    pub rsc_environment: EnvironmentVc,
    pub rsc_module_options_context: ModuleOptionsContextVc,
    pub rsc_resolve_options_context: ResolveOptionsContextVc,
    pub server_root: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl Transition for NextLayoutEntryTransition {
    #[turbo_tasks::function]
    fn process_source(&self, asset: AssetVc) -> AssetVc {
        VirtualAssetVc::new(
            asset.path().join("layout-entry.tsx"),
            next_js_file("entry/app/layout-entry.tsx").into(),
        )
        .into()
    }

    #[turbo_tasks::function]
    fn process_environment(&self, _environment: EnvironmentVc) -> EnvironmentVc {
        self.rsc_environment
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        _context: ModuleOptionsContextVc,
    ) -> ModuleOptionsContextVc {
        self.rsc_module_options_context
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: ResolveOptionsContextVc,
    ) -> ResolveOptionsContextVc {
        self.rsc_resolve_options_context
    }

    #[turbo_tasks::function]
    async fn process_module(
        &self,
        asset: AssetVc,
        _context: ModuleAssetContextVc,
    ) -> Result<AssetVc> {
        Ok(
            if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? {
                WithClientChunksAsset {
                    asset: placeable,
                    // next.js code already adds _next prefix
                    server_root: self.server_root.join("_next"),
                }
                .cell()
                .into()
            } else {
                asset
            },
        )
    }
}
