use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{Completion, ResolvedVc, State, TryJoinIterExt, Value, Vc};
use turbopack_core::introspect::{Introspectable, IntrospectableChildren};

use super::{
    route_tree::{MapGetContentSourceContent, RouteTree, RouteTrees},
    ContentSource, ContentSourceData, ContentSourceDataVary, ContentSourceSideEffect,
    GetContentSourceContent,
};
use crate::source::{ContentSourceContent, ContentSources};

/// Combines two [ContentSource]s like the [CombinedContentSource], but only
/// allows to serve from the second source when the first source has
/// successfully served something once.
///
/// This is a laziness optimization when the content of the second source can
/// only be reached via references from the first source.
///
/// For example, we use that in the content source that handles SSR rendering of
/// pages. Here HTML and "other assets" are in different content sources. So we
/// use this source to only serve (and process) "other assets" when the HTML was
/// served once.
#[turbo_tasks::value(serialization = "none", eq = "manual", cell = "new")]
pub struct ConditionalContentSource {
    activator: ResolvedVc<Box<dyn ContentSource>>,
    action: ResolvedVc<Box<dyn ContentSource>>,
    activated: State<bool>,
}

#[turbo_tasks::value_impl]
impl ConditionalContentSource {
    #[turbo_tasks::function]
    pub fn new(
        activator: ResolvedVc<Box<dyn ContentSource>>,
        action: ResolvedVc<Box<dyn ContentSource>>,
    ) -> Vc<Self> {
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
    async fn get_routes(self: ResolvedVc<Self>) -> Result<Vc<RouteTree>> {
        let this = self.await?;
        Ok(if !*this.activated.get() {
            this.activator.get_routes().map_routes(Vc::upcast(
                ConditionalContentSourceMapper { source: self }.cell(),
            ))
        } else {
            Vc::<RouteTrees>::cell(vec![
                this.activator.get_routes().to_resolved().await?,
                this.action.get_routes().to_resolved().await?,
            ])
            .merge()
        })
    }

    #[turbo_tasks::function]
    fn get_children(&self) -> Vc<ContentSources> {
        Vc::cell(vec![self.activator, self.action])
    }
}

#[turbo_tasks::value]
struct ConditionalContentSourceMapper {
    source: ResolvedVc<ConditionalContentSource>,
}

#[turbo_tasks::value_impl]
impl MapGetContentSourceContent for ConditionalContentSourceMapper {
    #[turbo_tasks::function]
    fn map_get_content(
        &self,
        get_content: ResolvedVc<Box<dyn GetContentSourceContent>>,
    ) -> Vc<Box<dyn GetContentSourceContent>> {
        Vc::upcast(
            ActivateOnGetContentSource {
                source: self.source,
                get_content,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> Vc<RcStr> {
    Vc::cell("conditional content source".into())
}

#[turbo_tasks::function]
fn activator_key() -> Vc<RcStr> {
    Vc::cell("activator".into())
}

#[turbo_tasks::function]
fn action_key() -> Vc<RcStr> {
    Vc::cell("action".into())
}

#[turbo_tasks::value_impl]
impl Introspectable for ConditionalContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<RcStr> {
        Vc::cell(
            if *self.activated.get() {
                "activated"
            } else {
                "not activated"
            }
            .into(),
        )
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<RcStr>> {
        if let Some(activator) =
            ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(self.activator).await?
        {
            Ok(activator.title())
        } else {
            Ok(Vc::<RcStr>::default())
        }
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        Ok(Vc::cell(
            [
                ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(self.activator)
                    .await?
                    .map(|i| (activator_key(), *i)),
                ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(self.action)
                    .await?
                    .map(|i| (action_key(), *i)),
            ]
            .into_iter()
            .flatten()
            .map(|(k, v)| async move { Ok((k.to_resolved().await?, v)) })
            .try_join()
            .await?
            .into_iter()
            .collect(),
        ))
    }
}

#[turbo_tasks::value(serialization = "none", eq = "manual", cell = "new")]
struct ActivateOnGetContentSource {
    source: ResolvedVc<ConditionalContentSource>,
    get_content: ResolvedVc<Box<dyn GetContentSourceContent>>,
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for ActivateOnGetContentSource {
    #[turbo_tasks::function]
    fn vary(&self) -> Vc<ContentSourceDataVary> {
        self.get_content.vary()
    }

    #[turbo_tasks::function]
    async fn get(
        self: Vc<Self>,
        path: RcStr,
        data: Value<ContentSourceData>,
    ) -> Result<Vc<ContentSourceContent>> {
        turbo_tasks::emit(Vc::upcast::<Box<dyn ContentSourceSideEffect>>(self));
        Ok(self.await?.get_content.get(path, data))
    }
}

#[turbo_tasks::value_impl]
impl ContentSourceSideEffect for ActivateOnGetContentSource {
    #[turbo_tasks::function]
    async fn apply(&self) -> Result<Vc<Completion>> {
        self.source.await?.activated.set(true);
        Ok(Completion::new())
    }
}
