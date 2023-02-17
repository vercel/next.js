pub mod asset;

use indexmap::IndexSet;
use turbo_tasks::primitives::StringVc;

#[turbo_tasks::value(transparent)]
pub struct IntrospectableChildren(IndexSet<(StringVc, IntrospectableVc)>);

#[turbo_tasks::value_trait]
pub trait Introspectable {
    fn ty(&self) -> StringVc;
    fn title(&self) -> StringVc {
        StringVc::empty()
    }
    fn details(&self) -> StringVc {
        StringVc::empty()
    }
    fn children(&self) -> IntrospectableChildrenVc {
        IntrospectableChildrenVc::cell(IndexSet::new())
    }
}
