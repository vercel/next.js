use std::{collections::HashSet, sync::Arc};

use anyhow::Result;
use parking_lot::Mutex;
use turbo_tasks::{get_invalidator, primitives::StringVc, Invalidator};
use turbopack_core::introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc};

use super::{
    ContentSource, ContentSourceData, ContentSourceResult, ContentSourceResultVc, ContentSourceVc,
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
    #[turbo_tasks(debug_ignore, trace_ignore)]
    state: Arc<Mutex<State>>,
}

#[turbo_tasks::value_impl]
impl ConditionalContentSourceVc {
    #[turbo_tasks::function]
    pub fn new(activator: ContentSourceVc, action: ContentSourceVc) -> Self {
        ConditionalContentSource {
            activator,
            action,
            state: Arc::new(Mutex::new(State::Idle)),
        }
        .cell()
    }
}

enum State {
    Idle,
    Activated,
    Waiting(HashSet<Invalidator>),
}

impl ConditionalContentSource {
    fn is_activated(&self) -> bool {
        let mut state = self.state.lock();
        match &mut *state {
            State::Idle => {
                *state = State::Waiting([get_invalidator()].into());
                false
            }
            State::Activated => true,
            State::Waiting(set) => {
                set.insert(get_invalidator());
                false
            }
        }
    }

    fn activate(&self) {
        let mut state = self.state.lock();
        match std::mem::replace(&mut *state, State::Activated) {
            State::Idle | State::Activated => {}
            State::Waiting(set) => {
                for invalidator in set {
                    invalidator.invalidate()
                }
            }
        }
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
        if let ContentSourceResult::NotFound = &*first.await? {
            if self.is_activated() {
                Ok(self.action.get(path, data))
            } else {
                Ok(first)
            }
        } else {
            self.activate();
            Ok(first)
        }
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
