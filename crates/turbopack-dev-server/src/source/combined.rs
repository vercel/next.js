use std::mem;

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value};
use turbopack_core::introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc};

use super::{
    specificity::SpecificityReadRef, ContentSource, ContentSourceContent, ContentSourceData,
    ContentSourceResultVc, ContentSourceVc, NeededData,
};
use crate::source::ContentSourcesVc;

/// Combines multiple [ContentSource]s by trying all content sources in order.
/// The content source which responds with the most specific response (that is
/// not a [ContentSourceContent::NotFound]) will be returned.
#[turbo_tasks::value(shared)]
pub struct CombinedContentSource {
    pub sources: Vec<ContentSourceVc>,
}

/// A helper source which allows the [CombinedContentSource] to be paused while
/// we ask for vary data.
#[turbo_tasks::value(shared)]
pub struct PausableCombinedContentSource {
    /// The index of the item which requested vary data. When running [get], we
    /// will skip to exactly this item to resume iteration.
    index: usize,

    /// The paused state (partially processed path, content source, vary data)
    /// of the internal content source which asked for vary data.
    pending: Option<PendingState>,

    /// A [CombinedContentSource] which we are querying for content.
    inner: CombinedContentSourceVc,

    /// The current most-specific content result.
    max: Option<(SpecificityReadRef, ContentSourceResultVc)>,
}

/// Stores partially computed data that an inner [ContentSource] returned when
/// it requested more data.
#[derive(Clone)]
#[turbo_tasks::value(shared)]
struct PendingState {
    /// A partially computed path. Note that this may be any value and not
    /// necessarily equal to the path we receive from the dev server.
    path: String,

    /// A partially computed content source to receive the requested data. Note
    /// that this is not necessarily the same content source value that
    /// exists inside the [CombinedContentSource]'s sources vector.
    source: ContentSourceVc,
}

impl CombinedContentSourceVc {
    pub fn new(sources: Vec<ContentSourceVc>) -> Self {
        CombinedContentSource { sources }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for CombinedContentSource {
    #[turbo_tasks::function]
    async fn get(
        self_vc: CombinedContentSourceVc,
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let pauseable = PausableCombinedContentSource::new(self_vc);
        pauseable.pauseable_get(path, data).await
    }

    #[turbo_tasks::function]
    fn get_children(&self) -> ContentSourcesVc {
        ContentSourcesVc::cell(self.sources.clone())
    }
}

impl PausableCombinedContentSource {
    fn new(inner: CombinedContentSourceVc) -> Self {
        PausableCombinedContentSource {
            inner,
            index: 0,
            pending: None,
            max: None,
        }
    }

    /// Queries each content source in turn, returning a new pauseable instance
    /// if any source requests additional vary data.
    async fn pauseable_get(
        &self,
        path: &str,
        mut data: Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let inner = self.inner;
        let mut max = self.max.clone();
        let mut pending = self.pending.clone();

        for (index, source) in inner.await?.sources.iter().enumerate().skip(self.index) {
            // If there is pending state, then this is the first iteration of the resume and
            // we've skipped to exactly the source which requested data. Requery the source
            // with it's partially computed path and needed data.
            let result = match pending.take() {
                Some(pending) => pending.source.get(&pending.path, mem::take(&mut data)),
                None => source.get(path, Default::default()),
            };

            let res = result.await?;
            if let ContentSourceContent::NeedData(data) = &*res.content.await? {
                // We create a partially computed content source which will be able to resume
                // iteration at this exact content source after getting data.
                let paused = PausableCombinedContentSource {
                    inner,
                    index,
                    pending: Some(PendingState::from(data)),
                    max,
                };

                return Ok(ContentSourceResultVc::exact(
                    ContentSourceContent::NeedData(NeededData {
                        // We do not return data.path because that would affect later content source
                        // requests. However, when we resume, we'll use the path stored in pending
                        // to correctly requery this source.
                        path: path.to_string(),
                        source: paused.cell().into(),
                        vary: data.vary.clone(),
                    })
                    .cell(),
                ));
            }

            let specificity = res.specificity.await?;
            if specificity.is_exact() {
                return Ok(result);
            }
            if let Some((max, _)) = max.as_ref() {
                if *max >= specificity {
                    // we can keep the current max
                    continue;
                }
            }
            max = Some((specificity, result));
        }

        if let Some((_, result)) = max {
            Ok(result)
        } else {
            Ok(ContentSourceResultVc::not_found())
        }
    }
}

impl From<&NeededData> for PendingState {
    fn from(value: &NeededData) -> Self {
        PendingState {
            path: value.path.clone(),
            source: value.source,
        }
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for PausableCombinedContentSource {
    #[turbo_tasks::function]
    async fn get(
        &self,
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        self.pauseable_get(path, data).await
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for CombinedContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        StringVc::cell("combined content source".to_string())
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<StringVc> {
        let titles = self
            .sources
            .iter()
            .map(|&source| async move {
                Ok(
                    if let Some(source) = IntrospectableVc::resolve_from(source).await? {
                        Some(source.title().await?)
                    } else {
                        None
                    },
                )
            })
            .try_join()
            .await?;
        let mut titles = titles.into_iter().flatten().collect::<Vec<_>>();
        titles.sort();
        const NUMBER_OF_TITLES_TO_DISPLAY: usize = 5;
        let mut titles = titles
            .iter()
            .map(|t| t.as_str())
            .filter(|t| !t.is_empty())
            .take(NUMBER_OF_TITLES_TO_DISPLAY + 1)
            .collect::<Vec<_>>();
        if titles.len() > NUMBER_OF_TITLES_TO_DISPLAY {
            titles[NUMBER_OF_TITLES_TO_DISPLAY] = "...";
        }
        Ok(StringVc::cell(titles.join(", ")))
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<IntrospectableChildrenVc> {
        let source = StringVc::cell("source".to_string());
        Ok(IntrospectableChildrenVc::cell(
            self.sources
                .iter()
                .copied()
                .map(|s| async move { Ok(IntrospectableVc::resolve_from(s).await?) })
                .try_join()
                .await?
                .into_iter()
                .flatten()
                .map(|i| (source, i))
                .collect(),
        ))
    }
}
