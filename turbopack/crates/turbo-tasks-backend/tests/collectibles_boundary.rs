#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! A `collectibles_boundary` root keeps the collectibles of its subgraph: they can be read from it,
//! but don't reach the tasks that call it.

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{CollectiblesSource, ReadRef, ResolvedVc, State, ValueToString, Vc, emit};
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

/// Computes the leaf before the boundary connects to it, so the boundary gets a child that already
/// holds a collectible.
#[turbo_tasks::function(operation, root)]
async fn precompute_leaf() -> Result<Vc<u32>> {
    Ok(Vc::cell(*emitting_leaf(3).await?))
}

#[turbo_tasks::function(operation, root, collectibles_boundary)]
async fn boundary_of_precomputed_leaf() -> Result<Vc<u32>> {
    Ok(Vc::cell(*emitting_leaf(3).await?))
}

#[turbo_tasks::function(operation, root)]
async fn caller_of_precomputed() -> Result<Vc<u32>> {
    Ok(Vc::cell(
        *boundary_of_precomputed_leaf()
            .read_strongly_consistent()
            .await?,
    ))
}

#[turbo_tasks::function(operation, root)]
async fn check_precomputed() -> Result<Vc<()>> {
    precompute_leaf().read_strongly_consistent().await?;
    let caller = caller_of_precomputed();
    assert_eq!(*caller.read_strongly_consistent().await?, 3);
    assert!(
        caller
            .peek_collectibles::<Box<dyn ValueToString>>()
            .is_empty(),
        "the collectible of a child that emitted before the boundary connected to it reached the \
         caller"
    );
    Ok(Vc::cell(()))
}

#[turbo_tasks::value]
struct Switch {
    uses_leaf: State<bool>,
}

/// Reads the leaf only while the switch is on, so turning it off removes the leaf from the
/// boundary's subgraph.
#[turbo_tasks::function(operation, root, collectibles_boundary)]
async fn switching_boundary(switch: ResolvedVc<Switch>) -> Result<Vc<u32>> {
    Ok(Vc::cell(if *switch.await?.uses_leaf.get() {
        *emitting_leaf(4).await?
    } else {
        0
    }))
}

/// Reads the same leaf without a boundary.
#[turbo_tasks::function(operation, root)]
async fn direct_leaf() -> Result<Vc<u32>> {
    Ok(Vc::cell(*emitting_leaf(4).await?))
}

#[turbo_tasks::function(operation, root)]
async fn switching_caller(switch: ResolvedVc<Switch>) -> Result<Vc<u32>> {
    let boundary = *switching_boundary(switch)
        .read_strongly_consistent()
        .await?;
    let direct = *direct_leaf().read_strongly_consistent().await?;
    Ok(Vc::cell(boundary + direct))
}

#[turbo_tasks::function(operation, root)]
async fn switching_caller_collectibles(switch: ResolvedVc<Switch>) -> Result<Vc<Vec<RcStr>>> {
    let caller = switching_caller(switch);
    caller.read_strongly_consistent().await?;
    let mut reached = Vec::new();
    for collectible in caller.peek_collectibles::<Box<dyn ValueToString>>() {
        reached.push(collectible.to_string().owned().await?);
    }
    Ok(Vc::cell(reached))
}

/// When the boundary loses a child, removing the child's collectibles must stop at the boundary
/// too: they never reached the caller through it, so the caller's count from its own path to the
/// child must not be decremented.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn boundary_losing_a_child_keeps_the_callers_collectibles() {
    run_once(&REGISTRATION, async || {
        let switch = ReadRef::new_owned(Switch {
            uses_leaf: State::new(true),
        });
        let switch_vc = ReadRef::resolved_cell(switch.clone());
        let collectibles = switching_caller_collectibles(switch_vc);
        assert_eq!(
            *collectibles.read_strongly_consistent().await?,
            vec![RcStr::from("4")]
        );
        switch.uses_leaf.set(false);
        assert_eq!(
            *collectibles.read_strongly_consistent().await?,
            vec![RcStr::from("4")],
            "the caller still reads the leaf directly"
        );
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn boundary_keeps_the_collectibles_of_existing_children() {
    run_once(&REGISTRATION, async || {
        check_precomputed().read_strongly_consistent().await?;
        anyhow::Ok(())
    })
    .await
    .unwrap()
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
