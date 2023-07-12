use anyhow::{bail, Result};
use turbopack_binding::turbopack::{
    core::module::ModuleVc,
    ecmascript::chunk::EcmascriptChunkPlaceableVc,
    turbopack::{
        transition::{Transition, TransitionVc},
        ModuleAssetContextVc,
    },
};

use super::server_component_module::NextServerComponentModuleVc;

/// This transition wraps a module into a marker
/// [`NextServerComponentModuleVc`].
///
/// When walking the module graph to build the client reference manifest, this
/// is used to determine under which server component CSS client references are
/// required. Ultimately, this tells Next.js what CSS to inject into the page.
#[turbo_tasks::value(shared)]
pub struct NextServerComponentTransition {}

#[turbo_tasks::value_impl]
impl NextServerComponentTransitionVc {
    /// Creates a new [`NextServerComponentTransitionVc`].
    #[turbo_tasks::function]
    pub fn new() -> Self {
        NextServerComponentTransition {}.cell()
    }
}

#[turbo_tasks::value_impl]
impl Transition for NextServerComponentTransition {
    #[turbo_tasks::function]
    async fn process_module(
        _self_vc: NextServerComponentTransitionVc,
        module: ModuleVc,
        _context: ModuleAssetContextVc,
    ) -> Result<ModuleVc> {
        let Some(module) = EcmascriptChunkPlaceableVc::resolve_from(module).await? else {
            bail!("not an ecmascript module");
        };

        Ok(NextServerComponentModuleVc::new(module).into())
    }
}
