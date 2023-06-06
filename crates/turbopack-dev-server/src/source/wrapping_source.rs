use std::{borrow::Cow, iter::once};

use anyhow::Result;
use turbo_tasks::Value;

use super::{
    ContentSource, ContentSourceContentVc, ContentSourceData, ContentSourceDataVaryVc,
    ContentSourceResult, ContentSourceResultVc, ContentSourceVc, GetContentSourceContent,
    GetContentSourceContentVc, NeededData,
};
use crate::source::{ContentSourceContent, Rewrite};

/// A ContentSourceProcessor handles the final processing of an eventual
/// [ContentSourceContent].
///
/// Used in conjunction with [WrappedContentSource], this allows a
/// [ContentSource] implementation to easily register a final process step over
/// some inner ContentSource's fully resolved [ContentSourceResult] and
/// [ContentSourceContent].
#[turbo_tasks::value_trait]
pub trait ContentSourceProcessor {
    fn process(&self, content: ContentSourceContentVc) -> ContentSourceContentVc;
}

pub fn encode_pathname_to_url(pathname: &str) -> String {
    once(Cow::Borrowed("/"))
        .chain(
            pathname
                .split('/')
                .map(urlencoding::encode)
                .intersperse(Cow::Borrowed("/")),
        )
        .collect()
}

/// A ContentSourceProcessor allows a [ContentSource] implementation to easily
/// register a final process step over some inner ContentSource's fully resolved
/// [ContentSourceResult] and [ContentSourceContent] without having to manually
/// implement the NeedData resolution algorithm.
///
/// This is the first of 2 steps, implementing the wrapping of
/// ContentSourceResult so that we can wrap the fully resolved result with our
/// [WrappedGetContentSourceContent].
#[turbo_tasks::value]
pub struct WrappedContentSource {
    inner: ContentSourceVc,
    processor: ContentSourceProcessorVc,
}

#[turbo_tasks::value_impl]
impl WrappedContentSourceVc {
    #[turbo_tasks::function]
    pub async fn new(inner: ContentSourceVc, processor: ContentSourceProcessorVc) -> Self {
        WrappedContentSource { inner, processor }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for WrappedContentSource {
    #[turbo_tasks::function]
    async fn get(
        &self,
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let res = self.inner.get(path, data);

        Ok(match &*res.await? {
            ContentSourceResult::NotFound => res,
            ContentSourceResult::NeedData(needed) => {
                // If the inner source needs more data, then we need to wrap the resuming source
                // in a new wrapped processor. That way, whatever ContentSourceResult is
                // returned when we resume can itself be wrapped, or be wrapped with a
                // WrappedGetContentSourceContent.
                ContentSourceResultVc::need_data(Value::new(NeededData {
                    source: WrappedContentSourceVc::new(needed.source, self.processor).into(),
                    path: needed.path.clone(),
                    vary: needed.vary.clone(),
                }))
            }
            ContentSourceResult::Result {
                get_content,
                specificity,
            } => {
                // If we landed on a result, then the resolution algorithm is complete. All
                // that's left is to wrap the result's GetContentSourceContent
                // with our own, so that we can process whatever content it
                // returns.
                ContentSourceResult::Result {
                    specificity: *specificity,
                    get_content: WrappedGetContentSourceContentVc::new(
                        self.inner,
                        *get_content,
                        self.processor,
                    )
                    .into(),
                }
                .cell()
            }
        })
    }
}

/// A WrappedGetContentSourceContent simply wraps the get_content of a
/// [ContentSourceResult], allowing us to process whatever
/// [ContentSourceContent] it would have returned.
///
/// This is the second of 2 steps, implementing the processing of
/// ContentSourceContent. The first step in [WrappedContentSource] handles
/// ContentSourceResult.
#[turbo_tasks::value]
struct WrappedGetContentSourceContent {
    inner_source: ContentSourceVc,
    inner: GetContentSourceContentVc,
    processor: ContentSourceProcessorVc,
}

#[turbo_tasks::value_impl]
impl WrappedGetContentSourceContentVc {
    #[turbo_tasks::function]
    fn new(
        inner_source: ContentSourceVc,
        inner: GetContentSourceContentVc,
        processor: ContentSourceProcessorVc,
    ) -> Self {
        WrappedGetContentSourceContent {
            inner_source,
            inner,
            processor,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for WrappedGetContentSourceContent {
    #[turbo_tasks::function]
    fn vary(&self) -> ContentSourceDataVaryVc {
        self.inner.vary()
    }

    #[turbo_tasks::function]
    async fn get(&self, data: Value<ContentSourceData>) -> Result<ContentSourceContentVc> {
        let res = self.inner.get(data);
        if let ContentSourceContent::Rewrite(rewrite) = &*res.await? {
            let rewrite = rewrite.await?;
            return Ok(ContentSourceContent::Rewrite(
                Rewrite {
                    path_and_query: rewrite.path_and_query.clone(),
                    source: Some(
                        WrappedContentSourceVc::new(
                            rewrite.source.unwrap_or(self.inner_source),
                            self.processor,
                        )
                        .into(),
                    ),
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
