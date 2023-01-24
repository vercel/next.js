use anyhow::Result;
use turbo_tasks::{primitives::StringVc, State, Value};
use turbopack_core::introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc};

use super::{
    combined::CombinedContentSource, ContentSource, ContentSourceData, ContentSourceDataVaryVc,
    ContentSourceResult, ContentSourceResultVc, ContentSourceVc, GetContentSourceContent,
    GetContentSourceContentVc,
};
use crate::source::{ContentSourceContentVc, ContentSourcesVc};

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
        self_vc: ConditionalContentSourceVc,
        path: &str,
        data: turbo_tasks::Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let this = self_vc.await?;
        if !*this.activated.get() {
            let first = this.activator.get(path, data.clone());
            let first_value = first.await?;
            return Ok(match &*first_value {
                &ContentSourceResult::Result {
                    get_content,
                    specificity,
                } => ContentSourceResult::Result {
                    get_content: ActivateOnGetContentSource {
                        source: this,
                        get_content,
                    }
                    .cell()
                    .into(),
                    specificity,
                }
                .cell(),
                _ => first,
            });
        }
        Ok(CombinedContentSource {
            sources: vec![this.activator, this.action],
        }
        .cell()
        .get(path, data))
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

#[turbo_tasks::value(serialization = "none", eq = "manual", cell = "new")]
struct ActivateOnGetContentSource {
    source: ConditionalContentSourceReadRef,
    get_content: GetContentSourceContentVc,
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for ActivateOnGetContentSource {
    #[turbo_tasks::function]
    fn vary(&self) -> ContentSourceDataVaryVc {
        self.get_content.vary()
    }

    #[turbo_tasks::function]
    fn get(&self, data: Value<ContentSourceData>) -> ContentSourceContentVc {
        self.source.activated.set(true);
        self.get_content.get(data)
    }
}
