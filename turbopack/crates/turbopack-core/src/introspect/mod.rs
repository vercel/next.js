pub mod module;
pub mod output_asset;
pub mod source;
pub mod utils;

use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexSet, ResolvedVc, Vc};

type VcDynIntrospectable = ResolvedVc<Box<dyn Introspectable>>;

#[turbo_tasks::value(transparent)]
pub struct IntrospectableChildren(FxIndexSet<(RcStr, VcDynIntrospectable)>);

#[turbo_tasks::value_trait]
pub trait Introspectable {
    #[turbo_tasks::function]
    fn ty(self: Vc<Self>) -> Vc<RcStr>;
    #[turbo_tasks::function]
    fn title(self: Vc<Self>) -> Vc<RcStr> {
        Vc::<RcStr>::default()
    }
    #[turbo_tasks::function]
    fn details(self: Vc<Self>) -> Vc<RcStr> {
        Vc::<RcStr>::default()
    }
    #[turbo_tasks::function]
    fn children(self: Vc<Self>) -> Vc<IntrospectableChildren> {
        Vc::cell(FxIndexSet::default())
    }
}
