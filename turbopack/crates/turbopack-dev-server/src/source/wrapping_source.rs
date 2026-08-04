use anyhow::Result;
use turbo_rcstr::RcStr;
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{OperationVc, ResolvedVc, Vc};

use crate::source::{
    ContentSourceContent, ContentSourceData, ContentSourceDataVary, GetContentSourceContent,
    GetContentSourceContents, Rewrite, RewriteType,
};

/// Handles the final processing of an eventual [`ContentSourceContent`].
///
/// Used in conjunction with [`WrappedGetContentSourceContent`], this allows a [`ContentSource`]
/// implementation to easily register a final process step over some inner [`ContentSource`]'s fully
/// resolved [`ContentSourceContent`].
///
/// [`ContentSource`]: crate::source::ContentSource
#[turbo_tasks::value_trait]
pub trait ContentSourceProcessor {
    #[turbo_tasks::function]
    fn process(self: Vc<Self>, content: Vc<ContentSourceContent>) -> Vc<ContentSourceContent>;
}

/// Wraps the `get_content` of a [`GetContentSourceContent`], allowing us to
/// [post-process][ContentSourceProcessor] whatever [`ContentSourceContent`] it returns.
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

#[turbo_tasks::function(operation, root)]
async fn wrap_sources_operation(
    sources: OperationVc<GetContentSourceContents>,
    processor: ResolvedVc<Box<dyn ContentSourceProcessor>>,
) -> Result<Vc<GetContentSourceContents>> {
    let sources = turbo_tasks::read!(sources.connect())?;
    let wrapped = sources
        .iter()
        .map(|s| {
            Vc::upcast::<Box<dyn GetContentSourceContent>>(WrappedGetContentSourceContent::new(
                **s, *processor,
            ))
        })
        .collect::<Vec<_>>();
    // `.to_resolved()` futures cannot fan out through `parallel!` under sync; keep the
    // concurrent `try_join` in the async build and resolve sequentially under sync.
    #[cfg(not(feature = "sync"))]
    let resolved = wrapped
        .into_iter()
        .map(|v| v.to_resolved())
        .try_join()
        .await?;
    #[cfg(feature = "sync")]
    let resolved = {
        let mut resolved = Vec::with_capacity(wrapped.len());
        for v in wrapped {
            resolved.push(turbo_tasks::read!(v.to_resolved())?);
        }
        resolved
    };
    Ok(Vc::cell(resolved))
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for WrappedGetContentSourceContent {
    #[turbo_tasks::function]
    fn vary(&self) -> Vc<ContentSourceDataVary> {
        self.inner.vary()
    }

    #[turbo_tasks::function]
    async fn get(&self, path: RcStr, data: ContentSourceData) -> Result<Vc<ContentSourceContent>> {
        let res = self.inner.get(path, data);
        if let ContentSourceContent::Rewrite(rewrite) = &*turbo_tasks::read!(res)? {
            let rewrite = turbo_tasks::read!(rewrite)?;
            return Ok(ContentSourceContent::Rewrite(
                Rewrite {
                    ty: match &rewrite.ty {
                        RewriteType::Location { .. } | RewriteType::ContentSource { .. } => todo!(
                            "Rewrites for WrappedGetContentSourceContent are not implemented yet"
                        ),
                        RewriteType::Sources { sources } => RewriteType::Sources {
                            sources: wrap_sources_operation(*sources, self.processor),
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
