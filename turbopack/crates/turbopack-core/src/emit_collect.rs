use turbo_rcstr::RcStr;
use turbo_tasks::Vc;

use crate::module::Module;

/// A module that can collect other modules during the collect phase.
#[turbo_tasks::value_trait]
pub trait CollectingModule: Module {
    /// The namespace that this module is interesed in
    #[turbo_tasks::function]
    fn namespace(self: Vc<Self>) -> Vc<RcStr>;
}
