//! Route activation for the single development module graph
//! (`experimental.turbopackSingleDevModuleGraph`).
//!
//! With the single development graph all endpoints share one whole-app module graph. To keep
//! development on-demand, an endpoint only contributes its entries to that graph once it has been
//! used (written or subscribed to), similar to how a lazily compiled dynamic import only adds its
//! target to the graph once it has been requested.
//!
//! The activation state is not persisted: every session starts with no activated routes.

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{OperationVc, ResolvedVc, State, Vc};

use crate::{operation::OptionEndpoint, project::Project, route::Endpoint};

/// We don't serialize this because we don't want activation state to be sticky across sessions
#[turbo_tasks::value(serialization = "skip", evict = "never")]
pub struct RouteActivationState {
    active: State<bool>,
}

impl RouteActivationState {
    pub fn is_active(&self) -> bool {
        *self.active.get()
    }

    pub fn activate(&self) {
        self.active.set(true);
    }
}

/// The activation state of the route identified by `key` (see
/// [`crate::route::Endpoint::activation_keys`]) in `project`.
///
/// Memoized per project and key, so every reader of a given route observes the same bit. The state
/// is not serialized. Invalidate cached readers in each new session so they subscribe to the
/// recreated state.
#[turbo_tasks::function(session_dependent)]
pub fn route_activation_state(
    project: ResolvedVc<Project>,
    key: RcStr,
) -> Vc<RouteActivationState> {
    let _ = (project, key);
    RouteActivationState {
        active: State::new(false),
    }
    .cell()
}

/// Activates the routes used by `endpoint` (see [`crate::route::Endpoint::activation_keys`]) when
/// the project uses the single development module graph. Must be called before the endpoint is
/// read, as a separate operation, since a state can't be set by a task that depends on it.
#[turbo_tasks::function(operation, root)]
pub async fn activate_endpoint_operation(endpoint: OperationVc<OptionEndpoint>) -> Result<Vc<()>> {
    let Some(endpoint) = *endpoint.connect().await? else {
        return Ok(Vc::cell(()));
    };
    let project = endpoint.project().to_resolved().await?;
    if !*project.single_dev_module_graph().await? {
        return Ok(Vc::cell(()));
    }
    for key in endpoint.activation_keys().await?.iter() {
        route_activation_state(*project, key.clone())
            .await?
            .activate();
    }
    Ok(Vc::cell(()))
}
