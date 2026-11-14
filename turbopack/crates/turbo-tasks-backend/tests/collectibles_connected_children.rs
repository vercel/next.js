#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! After a strongly consistent read, the collectibles of an operation must reflect the current
//! graph, including the children that were connected or disconnected in the current change round.
//!
//! Several root operations share parents, and the parents share chains of children. Each change
//! re-selects which parents each root connects and which chains each parent connects. A root that
//! drops a parent can do so while the parent's own completion is still propagating its changed
//! children to the root. The root must not become clean before these changes have reached it.
//!
//! The race depends on timing and shows up reliably only when the machine is under CPU load.

use std::collections::BTreeSet;

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{CollectiblesSource, ResolvedVc, State, ValueToString, Vc, emit};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

const ROOTS: u32 = 4;
const PARENTS: u32 = 16;
const CHILDREN: u32 = 24;
const DEPTH: u32 = 4;
const ROUNDS: u32 = 10;

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn collectibles_include_children_connected_in_the_current_round() {
    run_once(&REGISTRATION, async || {
        let generation = Generation {
            state: State::new(0),
        }
        .resolved_cell();

        for round in 0..ROUNDS {
            generation.await?.state.set(round);
            for root in 0..ROOTS {
                let collected = collect_operation(generation, root)
                    .read_strongly_consistent()
                    .await?;
                assert_eq!(
                    *collected,
                    expected_collectibles(round, root),
                    "collectibles of root {root} in round {round}"
                );
            }
        }
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// Deterministically selects about one in `one_in` of the candidates.
fn selected(generation: u32, owner: u32, candidate: u32, one_in: u64) -> bool {
    let mut x = (u64::from(generation) << 42) ^ (u64::from(owner) << 21) ^ u64::from(candidate);
    // splitmix64 finalizer
    x = x.wrapping_add(0x9e37_79b9_7f4a_7c15);
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    x ^= x >> 31;
    x % one_in == 0
}

fn selected_parents(generation: u32, root: u32) -> impl Iterator<Item = u32> {
    (0..PARENTS).filter(move |&parent| selected(generation, root, parent, 2))
}

fn selected_children(generation: u32, parent: u32) -> impl Iterator<Item = u32> {
    // Offset the owner so parent selections don't mirror root selections.
    (0..CHILDREN).filter(move |&child| selected(generation, ROOTS + parent, child, 8))
}

fn expected_collectibles(generation: u32, root: u32) -> Vec<RcStr> {
    selected_parents(generation, root)
        .flat_map(|parent| selected_children(generation, parent))
        .map(thing_name)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn thing_name(index: u32) -> RcStr {
    format!("thing {index}").into()
}

#[turbo_tasks::value]
struct Generation {
    state: State<u32>,
}

#[turbo_tasks::value]
struct Thing(u32);

#[turbo_tasks::value_impl]
impl ValueToString for Thing {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(thing_name(self.0))
    }
}

/// A chain of `depth` tasks; the end of the chain emits `Thing(index)`.
#[turbo_tasks::function]
async fn child(index: u32, depth: u32) -> Result<Vc<()>> {
    if depth == 0 {
        emit(ResolvedVc::upcast::<Box<dyn ValueToString>>(
            Thing(index).resolved_cell(),
        ));
    } else {
        child(index, depth - 1).await?;
    }
    Ok(Vc::cell(()))
}

/// Connects the chains selected for this parent in the current generation.
#[turbo_tasks::function]
async fn parent(generation: ResolvedVc<Generation>, index: u32) -> Result<Vc<()>> {
    let generation = *generation.await?.state.get();
    for child_index in selected_children(generation, index) {
        child(child_index, DEPTH).await?;
    }
    Ok(Vc::cell(()))
}

/// Connects the parents selected for this root in the current generation.
#[turbo_tasks::function(operation, root)]
async fn root_operation(generation: ResolvedVc<Generation>, root: u32) -> Result<Vc<()>> {
    let generation_value = *generation.await?.state.get();
    for parent_index in selected_parents(generation_value, root) {
        parent(*generation, parent_index).await?;
    }
    Ok(Vc::cell(()))
}

#[turbo_tasks::value(transparent)]
struct Collected(Vec<RcStr>);

#[turbo_tasks::function(operation, root)]
async fn collect_operation(generation: ResolvedVc<Generation>, root: u32) -> Result<Vc<Collected>> {
    let root_op = root_operation(generation, root);
    root_op.connect().await?;
    let mut names = Vec::new();
    for collectible in root_op.peek_collectibles::<Box<dyn ValueToString>>() {
        names.push((*collectible.to_string().await?).clone());
    }
    names.sort();
    names.dedup();
    Ok(Vc::cell(names))
}
