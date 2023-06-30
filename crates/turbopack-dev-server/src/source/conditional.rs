use anyhow::Result;
use turbo_tasks::{primitives::StringVc, CompletionVc, State, Value};
use turbopack_core::introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc};

use super::{
    route_tree::{MapGetContentSourceContent, RouteTreeVc, RouteTreesVc},
    ContentSource, ContentSourceData, ContentSourceDataVaryVc, ContentSourceSideEffect,
    ContentSourceVc, GetContentSourceContent, GetContentSourceContentVc,
};
use crate::source::{
    route_tree::MapGetContentSourceContentVc, ContentSourceContentVc, ContentSourceSideEffectVc,
    ContentSourcesVc,
};

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
    async fn get_routes(self_vc: ConditionalContentSourceVc) -> Result<RouteTreeVc> {
        let this = self_vc.await?;
        Ok(if !*this.activated.get() {
            this.activator.get_routes().map_routes(
                ConditionalContentSourceMapper { source: self_vc }
                    .cell()
                    .into(),
            )
        } else {
            RouteTreesVc::cell(vec![this.activator.get_routes(), this.action.get_routes()]).merge()
        })
    }

    #[turbo_tasks::function]
    fn get_children(&self) -> ContentSourcesVc {
        ContentSourcesVc::cell(vec![self.activator, self.action])
    }
}

#[turbo_tasks::value]
struct ConditionalContentSourceMapper {
    source: ConditionalContentSourceVc,
}

#[turbo_tasks::value_impl]
impl MapGetContentSourceContent for ConditionalContentSourceMapper {
    #[turbo_tasks::function]
    fn map_get_content(&self, get_content: GetContentSourceContentVc) -> GetContentSourceContentVc {
        ActivateOnGetContentSource {
            source: self.source,
            get_content,
        }
        .cell()
        .into()
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
    async fn details(&self) -> Result<StringVc> {
        Ok(StringVc::cell(
            if *self.activated.get() {
                "activated"
            } else {
                "not activated"
            }
            .to_string(),
        ))
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
    source: ConditionalContentSourceVc,
    get_content: GetContentSourceContentVc,
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for ActivateOnGetContentSource {
    #[turbo_tasks::function]
    fn vary(&self) -> ContentSourceDataVaryVc {
        self.get_content.vary()
    }

    #[turbo_tasks::function]
    async fn get(
        self_vc: ActivateOnGetContentSourceVc,
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceContentVc> {
        turbo_tasks::emit(self_vc.as_content_source_side_effect());
        Ok(self_vc.await?.get_content.get(path, data))
    }
}

#[turbo_tasks::value_impl]
impl ContentSourceSideEffect for ActivateOnGetContentSource {
    #[turbo_tasks::function]
    async fn apply(&self) -> Result<CompletionVc> {
        self.source.await?.activated.set(true);
        Ok(CompletionVc::new())
    }
}
