#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Stress test for the aggregation graph: many tasks concurrently add and remove edges to shared
//! children on every change of a state, so removals of edges race with their additions.
//!
//! Run it with `--features verify_aggregation_graph` to verify the aggregation graph when the
//! backend stops: aggregated dirty containers and collectibles, and that the aggregation edges are
//! consistent (e.g. no follower debt is left over).

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, State, TryJoinIterExt, ValueToString, Vc, emit};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

/// Number of root operations.
const ROOTS: u32 = 4;
/// Number of parents shared by the roots.
const PARENTS: u32 = 16;
/// Number of children shared by the parents.
const CHILDREN: u32 = 24;
/// Length of the chain below each child. Chains increase the aggregation numbers of the tasks.
const CHAIN: u32 = 4;

fn rounds() -> u32 {
    std::env::var("TURBOPACK_TEST_AGGREGATION_CHURN_ROUNDS")
        .map(|rounds| rounds.parse().unwrap())
        .unwrap_or(20)
}

/// Deterministically decides if `from` connects to `to` in `generation`.
fn connected(generation: u32, salt: u32, from: u32, to: u32) -> bool {
    let mut x = generation
        .wrapping_mul(0x9e37_79b9)
        .wrapping_add(salt.wrapping_mul(0x85eb_ca6b))
        .wrapping_add(from.wrapping_mul(0xc2b2_ae35))
        .wrapping_add(to.wrapping_mul(0x27d4_eb2f));
    x ^= x >> 15;
    x = x.wrapping_mul(0x2c1b_3c6d);
    x ^= x >> 12;
    x.is_multiple_of(3)
}

/// The number of children all parents of `root` connect in `generation`.
fn expected_connected_children(generation: u32, root: u32) -> u32 {
    (0..PARENTS)
        .filter(|&parent| connected(generation, 0, root, parent))
        .map(|parent| {
            (0..CHILDREN)
                .filter(|&child| connected(generation, 1, parent, child))
                .count() as u32
        })
        .sum()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn aggregation_churn() {
    run_once(&REGISTRATION, async || {
        let generation_op = make_generation_operation();
        let generation_vc = generation_op.resolve().strongly_consistent().await?;
        let generation = generation_op.read_strongly_consistent().await?;
        for round in 0..rounds() {
            generation.state.set(round);
            (0..ROOTS)
                .map(|root| async move {
                    let connected_children = *root_operation(generation_vc, root)
                        .read_strongly_consistent()
                        .await?;
                    assert_eq!(
                        connected_children,
                        expected_connected_children(round, root),
                        "connected children of root {root} in round {round}"
                    );
                    anyhow::Ok(())
                })
                .try_join()
                .await?;
        }
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value]
struct Generation {
    state: State<u32>,
}

#[turbo_tasks::function(operation, root)]
fn make_generation_operation() -> Vc<Generation> {
    Generation {
        state: State::new(0),
    }
    .cell()
}

#[turbo_tasks::value(transparent)]
struct Count(u32);

/// Returns the number of children connected by the parents of `root`.
#[turbo_tasks::function(operation, root)]
async fn root_operation(generation: ResolvedVc<Generation>, root: u32) -> Result<Vc<Count>> {
    let current = *generation.await?.state.get();
    let counts = (0..PARENTS)
        .filter(|&parent_index| connected(current, 0, root, parent_index))
        .map(|parent_index| parent(*generation, parent_index))
        .map(|parent| async move { parent.await })
        .try_join()
        .await?;
    Ok(Vc::cell(counts.iter().map(|count| **count).sum()))
}

/// Connects a subset of the children, depending on the generation. Returns their number.
#[turbo_tasks::function]
async fn parent(generation: Vc<Generation>, index: u32) -> Result<Vc<Count>> {
    let current = *generation.await?.state.get();
    let children = (0..CHILDREN)
        .filter(|&child_index| connected(current, 1, index, child_index))
        .map(|child_index| child(child_index, CHAIN))
        .map(|child| async move { child.await })
        .try_join()
        .await?;
    Ok(Vc::cell(children.len() as u32))
}

#[turbo_tasks::function]
async fn child(index: u32, depth: u32) -> Result<Vc<()>> {
    if depth > 0 {
        child(index, depth - 1).await?;
    } else {
        emit(ResolvedVc::upcast::<Box<dyn ValueToString>>(Thing::new(
            index,
        )));
    }
    Ok(Vc::cell(()))
}

#[turbo_tasks::value(shared)]
struct Thing(u32);

impl Thing {
    fn new(v: u32) -> ResolvedVc<Self> {
        Self::resolved_cell(Thing(v))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for Thing {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.0.to_string().into())
    }
}
