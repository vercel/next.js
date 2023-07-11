use anyhow::Result;

use crate::source::SourceVc;

#[turbo_tasks::value_trait]
pub trait SourceTransform {
    fn transform(&self, source: SourceVc) -> SourceVc;
}

#[turbo_tasks::value(transparent)]
pub struct SourceTransforms(Vec<SourceTransformVc>);

#[turbo_tasks::value_impl]
impl SourceTransformsVc {
    #[turbo_tasks::function]
    pub async fn transform(self, source: SourceVc) -> Result<SourceVc> {
        Ok(self
            .await?
            .iter()
            .fold(source, |source, transform| transform.transform(source)))
    }
}
