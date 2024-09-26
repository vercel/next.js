use anyhow::Result;
use turbo_tasks::Vc;

use crate::source::Source;

#[turbo_tasks::value_trait]
pub trait SourceTransform {
    fn transform(self: Vc<Self>, source: Vc<Box<dyn Source>>) -> Vc<Box<dyn Source>>;
}

#[turbo_tasks::value(transparent)]
pub struct SourceTransforms(Vec<Vc<Box<dyn SourceTransform>>>);

#[turbo_tasks::value_impl]
impl SourceTransforms {
    #[turbo_tasks::function]
    pub fn transform(&self, source: Vc<Box<dyn Source>>) -> Result<Vc<Box<dyn Source>>> {
        Ok(self
            .0
            .iter()
            .fold(source, |source, transform| transform.transform(source)))
    }
}
