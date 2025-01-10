use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Value, Vc};

use super::{
    ContentSourceContent, ContentSourceData, ContentSourceDataVary, GetContentSourceContent,
    Rewrite, RewriteType,
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
    fn process(self: Vc<Self>, content: Vc<ContentSourceContent>) -> Vc<ContentSourceContent>;
}

/// A WrappedGetContentSourceContent simply wraps the get_content of a
/// [ContentSourceResult], allowing us to process whatever
/// [ContentSourceContent] it would have returned.

#[turbo_tasks::value]
pub struct WrappedGetContentSourceContent {
    inner: ResolvedVc<Box<dyn GetContentSourceContent>>,
    processor: ResolvedVc<Box<dyn ContentSourceProcessor>>,
}

#[turbo_tasks::value_impl]
impl WrappedGetContentSourceContent {
    #[turbo_tasks::function]
    pub fn new(
        inner: ResolvedVc<Box<dyn GetContentSourceContent>>,
        processor: ResolvedVc<Box<dyn ContentSourceProcessor>>,
    ) -> Vc<Self> {
        WrappedGetContentSourceContent { inner, processor }.cell()
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for WrappedGetContentSourceContent {
    #[turbo_tasks::function]
    fn vary(&self) -> Vc<ContentSourceDataVary> {
        self.inner.vary()
    }

    #[turbo_tasks::function]
    async fn get(
        &self,
        path: RcStr,
        data: Value<ContentSourceData>,
    ) -> Result<Vc<ContentSourceContent>> {
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
                            sources: Vc::cell(
                                sources
                                    .await?
                                    .iter()
                                    .map(|s| {
                                        Vc::upcast::<Box<dyn GetContentSourceContent>>(
                                            WrappedGetContentSourceContent::new(
                                                **s,
                                                *self.processor,
                                            ),
                                        )
                                    })
                                    .map(|v| async move { v.to_resolved().await })
                                    .try_join()
                                    .await?,
                            ),
                        },
                    },
                    response_headers: rewrite.response_headers,
                    request_headers: rewrite.request_headers,
                }
                .resolved_cell(),
            )
            .cell());
        }
        Ok(self.processor.process(res))
    }
}
