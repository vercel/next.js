pub mod module;
pub mod output_asset;
pub mod source;
pub mod utils;

use turbo_tasks::{FxIndexSet, RcStr, Vc};

type VcDynIntrospectable = Vc<Box<dyn Introspectable>>;

#[turbo_tasks::value(transparent)]
pub struct IntrospectableChildren(FxIndexSet<(Vc<RcStr>, VcDynIntrospectable)>);

#[turbo_tasks::value_trait]
pub trait Introspectable {
    fn ty(self: Vc<Self>) -> Vc<RcStr>;
    fn title(self: Vc<Self>) -> Vc<RcStr> {
        Vc::<RcStr>::default()
    }
    fn details(self: Vc<Self>) -> Vc<RcStr> {
        Vc::<RcStr>::default()
    }
    fn children(self: Vc<Self>) -> Vc<IntrospectableChildren> {
        Vc::cell(FxIndexSet::default())
    }
}
