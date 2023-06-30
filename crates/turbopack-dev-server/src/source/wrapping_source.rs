use anyhow::Result;
use turbo_tasks::Value;

use super::{GetContentSourceContentsVc, RewriteType};
use crate::source::{
    ContentSourceContent, ContentSourceContentVc, ContentSourceData, ContentSourceDataVaryVc,
    GetContentSourceContent, GetContentSourceContentVc, Rewrite,
};

/// A ContentSourceProcessor handles the final processing of an eventual
/// [ContentSourceContent].
///
/// Used in conjunction with [WrappedGetContentSourceContent], this allows a
/// [ContentSource] implementation to easily register a final process step over
/// some inner ContentSource's fully resolved [ContentSourceResult] and
/// [ContentSourceContent].
#[turbo_tasks::value_trait]
pub trait ContentSourceProcessor {
    fn process(&self, content: ContentSourceContentVc) -> ContentSourceContentVc;
}

/// A WrappedGetContentSourceContent simply wraps the get_content of a
/// [ContentSourceResult], allowing us to process whatever
/// [ContentSourceContent] it would have returned.

#[turbo_tasks::value]
pub struct WrappedGetContentSourceContent {
    inner: GetContentSourceContentVc,
    processor: ContentSourceProcessorVc,
}

#[turbo_tasks::value_impl]
impl WrappedGetContentSourceContentVc {
    #[turbo_tasks::function]
    pub async fn new(
        inner: GetContentSourceContentVc,
        processor: ContentSourceProcessorVc,
    ) -> Self {
        WrappedGetContentSourceContent { inner, processor }.cell()
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for WrappedGetContentSourceContent {
    #[turbo_tasks::function]
    fn vary(&self) -> ContentSourceDataVaryVc {
        self.inner.vary()
    }

    #[turbo_tasks::function]
    async fn get(
        &self,
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceContentVc> {
        let res = self.inner.get(path, data);
        if let ContentSourceContent::Rewrite(rewrite) = &*res.await? {
            let rewrite = rewrite.await?;
            return Ok(ContentSourceContent::Rewrite(
                Rewrite {
                    ty: match &rewrite.ty {
                        RewriteType::Location { .. } | RewriteType::ContentSource { .. } => todo!(
                            "Rewrites for WrappedGetContentSourceContent are not implemented yet"
                        ),
                        RewriteType::Sources { sources } => RewriteType::Sources {
                            sources: GetContentSourceContentsVc::cell(
                                sources
                                    .await?
                                    .iter()
                                    .map(|s| {
                                        WrappedGetContentSourceContentVc::new(*s, self.processor)
                                            .into()
                                    })
                                    .collect(),
                            ),
                        },
                    },
                    response_headers: rewrite.response_headers,
                    request_headers: rewrite.request_headers,
                }
                .cell(),
            )
            .cell());
        }
        Ok(self.processor.process(res))
    }
}
