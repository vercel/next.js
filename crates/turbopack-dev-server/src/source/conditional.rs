use anyhow::Result;
use turbo_tasks::{primitives::StringVc, State};
use turbopack_core::introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc};

use super::{
    ContentSource, ContentSourceContent, ContentSourceData, ContentSourceResultVc, ContentSourceVc,
};
use crate::source::ContentSourcesVc;

/// Combines two [ContentSource]s like the [CombinedContentSource], but only
/// allows to serve from the second source when the first source has
/// successfully served something once.
/// This is a laziness optimization when the content of the second source can
/// only be reached via references from the first source.
///
/// For example, we use that in the content source that handles SSR rendering of
/// pages. Here HTML and "other assets" are in different content sources. So we
/// use this source to only serve (and process) "other assets" when the HTML was
/// served once.
#[turbo_tasks::value(serialization = "none", eq = "manual", cell = "new")]
pub struct ConditionalContentSource {
    activator: ContentSourceVc,
    action: ContentSourceVc,
    activated: State<bool>,
}

#[turbo_tasks::value_impl]
impl ConditionalContentSourceVc {
    #[turbo_tasks::function]
    pub fn new(activator: ContentSourceVc, action: ContentSourceVc) -> Self {
        ConditionalContentSource {
            activator,
            action,
            activated: State::new(false),
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for ConditionalContentSource {
    #[turbo_tasks::function]
    async fn get(
        &self,
        path: &str,
        data: turbo_tasks::Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let first = self.activator.get(path, data.clone());
        if let ContentSourceContent::NotFound = &*first.await?.content.await? {
            if !*self.activated.get() {
                return Ok(first);
            }
        }
        self.activated.set(true);
        let second = self.action.get(path, data);
        let first_specificity = first.await?.specificity.await?;
        let second_specificity = second.await?.specificity.await?;
        if first_specificity >= second_specificity {
            Ok(first)
        } else {
            Ok(second)
        }
    }

    #[turbo_tasks::function]
    fn get_children(&self) -> ContentSourcesVc {
        ContentSourcesVc::cell(vec![self.activator, self.action])
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> StringVc {
    StringVc::cell("conditional content source".to_string())
}

#[turbo_tasks::function]
fn activator_key() -> StringVc {
    StringVc::cell("activator".to_string())
}

#[turbo_tasks::function]
fn action_key() -> StringVc {
    StringVc::cell("action".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for ConditionalContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        introspectable_type()
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<StringVc> {
        if let Some(activator) = IntrospectableVc::resolve_from(self.activator).await? {
            Ok(activator.title())
        } else {
            Ok(StringVc::empty())
        }
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<IntrospectableChildrenVc> {
        Ok(IntrospectableChildrenVc::cell(
            [
                IntrospectableVc::resolve_from(self.activator)
                    .await?
                    .map(|i| (activator_key(), i)),
                IntrospectableVc::resolve_from(self.action)
                    .await?
                    .map(|i| (action_key(), i)),
            ]
            .into_iter()
            .flatten()
            .collect(),
        ))
    }
}
