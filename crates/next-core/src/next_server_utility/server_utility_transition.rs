use anyhow::{Result, bail};
use turbo_tasks::Vc;
use turbopack::{ModuleAssetContext, transition::Transition};
use turbopack_core::module::Module;
use turbopack_ecmascript::chunk::EcmascriptChunkPlaceable;

use super::server_utility_module::NextServerUtilityModule;

/// This transition wraps a module into a marker
/// [`Vc<NextServerUtilityModule>`].
///
/// When walking the module graph to build the client reference manifest, this
/// is used to determine under which server component CSS client references are
/// required. Ultimately, this tells Next.js what CSS to inject into the page.
#[turbo_tasks::value(shared)]
pub struct NextServerUtilityTransition {}

#[turbo_tasks::value_impl]
impl NextServerUtilityTransition {
    /// Creates a new [`Vc<NextServerUtilityTransition>`].
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        NextServerUtilityTransition {}.cell()
    }
}

#[turbo_tasks::value_impl]
impl Transition for NextServerUtilityTransition {
    #[turbo_tasks::function]
    async fn process_module(
        self: Vc<Self>,
        module: Vc<Box<dyn Module>>,
        _context: Vc<ModuleAssetContext>,
    ) -> Result<Vc<Box<dyn Module>>> {
        let Some(module) =
            Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module).await?
        else {
            bail!("not an ecmascript module");
        };

        Ok(Vc::upcast(NextServerUtilityModule::new(module)))
    }
}
