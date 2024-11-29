use turbo_tasks::{ResolvedVc, Vc};

use crate::source::Source;

#[turbo_tasks::value_trait]
pub trait SourceTransform {
    fn transform(self: Vc<Self>, source: Vc<Box<dyn Source>>) -> Vc<Box<dyn Source>>;
}

#[turbo_tasks::value(transparent)]
pub struct SourceTransforms(Vec<ResolvedVc<Box<dyn SourceTransform>>>);

#[turbo_tasks::value_impl]
impl SourceTransforms {
    #[turbo_tasks::function]
    pub fn transform(&self, source: Vc<Box<dyn Source>>) -> Vc<Box<dyn Source>> {
        self.0
            .iter()
            .fold(source, |source, transform| transform.transform(source))
    }
}
