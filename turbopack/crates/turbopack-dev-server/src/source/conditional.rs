use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{Completion, ResolvedVc, State, Vc};
use turbopack_core::introspect::{Introspectable, IntrospectableChildren};

use super::{
    ContentSource, ContentSourceData, ContentSourceDataVary, ContentSourceSideEffect,
    GetContentSourceContent,
    route_tree::{MapGetContentSourceContent, RouteTree, RouteTrees},
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

#[turbo_tasks::value_impl]
impl Introspectable for ConditionalContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("conditional content source"))
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<RcStr> {
        Vc::cell(if *self.activated.get() {
            rcstr!("activated")
        } else {
            rcstr!("not activated")
        })
    }

    #[turbo_tasks::function]
    fn title(&self) -> Result<Vc<RcStr>> {
        if let Some(activator) = ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(self.activator)
        {
            Ok(activator.title())
        } else {
            Ok(Vc::<RcStr>::default())
        }
    }

    #[turbo_tasks::function]
    fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        Ok(Vc::cell(
            [
                ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(self.activator)
                    .map(|i| (rcstr!("activator"), i)),
                ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(self.action)
                    .map(|i| (rcstr!("action"), i)),
            ]
            .into_iter()
            .flatten()
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
        self: ResolvedVc<Self>,
        path: RcStr,
        data: ContentSourceData,
    ) -> Result<Vc<ContentSourceContent>> {
        turbo_tasks::emit(ResolvedVc::upcast::<Box<dyn ContentSourceSideEffect>>(self));
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
