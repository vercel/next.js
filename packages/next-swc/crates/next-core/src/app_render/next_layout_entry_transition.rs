use anyhow::{bail, Result};
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPathVc,
    turbopack::{
        core::{asset::AssetVc, compile_time_info::CompileTimeInfoVc},
        ecmascript::chunk::EcmascriptChunkPlaceableVc,
        turbopack::{
            module_options::ModuleOptionsContextVc,
            resolve_options_context::ResolveOptionsContextVc,
            transition::{Transition, TransitionVc},
            ModuleAssetContextVc,
        },
    },
};

use crate::next_client_component::with_client_chunks::WithClientChunksAsset;

#[turbo_tasks::value(shared)]
pub struct NextServerComponentTransition {
    pub rsc_compile_time_info: CompileTimeInfoVc,
    pub rsc_module_options_context: ModuleOptionsContextVc,
    pub rsc_resolve_options_context: ResolveOptionsContextVc,
    pub server_root: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl Transition for NextServerComponentTransition {
    #[turbo_tasks::function]
    fn process_compile_time_info(
        &self,
        _compile_time_info: CompileTimeInfoVc,
    ) -> CompileTimeInfoVc {
        self.rsc_compile_time_info
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
        let Some(asset) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? else {
            bail!("Not an ecmascript module");
        };

        Ok(WithClientChunksAsset {
            asset,
            // next.js code already adds _next prefix
            server_root: self.server_root.join("_next"),
        }
        .cell()
        .into())
    }
}
