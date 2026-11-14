#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! A `collectibles_boundary` root keeps the collectibles of its subgraph: they can be read from it,
//! but don't reach the tasks that call it.

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{CollectiblesSource, ResolvedVc, ValueToString, Vc, emit};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value(shared)]
struct Thing(u32);

#[turbo_tasks::value_impl]
impl ValueToString for Thing {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.0.to_string().into())
    }
}

#[turbo_tasks::function]
fn emitting_leaf(value: u32) -> Vc<u32> {
    emit(ResolvedVc::upcast::<Box<dyn ValueToString>>(
        Thing::resolved_cell(Thing(value)),
    ));
    Vc::cell(value)
}

/// Emits through a child, so the collectible reaches the boundary through aggregation.
#[turbo_tasks::function(operation, root, collectibles_boundary)]
async fn boundary_operation() -> Result<Vc<u32>> {
    Ok(Vc::cell(*emitting_leaf(1).await?))
}

/// The same, without the boundary.
#[turbo_tasks::function(operation, root)]
async fn plain_operation() -> Result<Vc<u32>> {
    Ok(Vc::cell(*emitting_leaf(2).await?))
}

/// Reads both operations strongly consistently, like `async_module_info` reads its operation.
#[turbo_tasks::function(operation, root)]
async fn caller() -> Result<Vc<u32>> {
    let boundary = boundary_operation();
    let plain = plain_operation();
    let value =
        *boundary.read_strongly_consistent().await? + *plain.read_strongly_consistent().await?;
    Ok(Vc::cell(value))
}

#[turbo_tasks::function(operation, root)]
async fn check() -> Result<Vc<()>> {
    let caller = caller();
    assert_eq!(*caller.read_strongly_consistent().await?, 3);

    // The plain operation's collectible reaches the caller, the boundary operation's doesn't.
    let mut reached = Vec::new();
    for collectible in caller.peek_collectibles::<Box<dyn ValueToString>>() {
        reached.push(collectible.to_string().owned().await?);
    }
    assert_eq!(reached, vec![RcStr::from("2")]);

    // The boundary operation still holds its own.
    let mut held = Vec::new();
    for collectible in boundary_operation().peek_collectibles::<Box<dyn ValueToString>>() {
        held.push(collectible.to_string().owned().await?);
    }
    assert_eq!(held, vec![RcStr::from("1")]);
    Ok(Vc::cell(()))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn boundary_keeps_its_collectibles() {
    run_once(&REGISTRATION, async || {
        check().read_strongly_consistent().await?;
        anyhow::Ok(())
    })
    .await
    .unwrap()
}
