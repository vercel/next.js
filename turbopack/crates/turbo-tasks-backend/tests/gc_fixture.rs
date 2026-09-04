//! Shared graph shapes for the GC tests.

use anyhow::Result;
use turbo_tasks::{ResolvedVc, State, Vc};

/// A flag a test flips to disconnect a subtree.
#[turbo_tasks::value(transparent)]
pub struct Selector(State<bool>);

#[turbo_tasks::function(operation, root)]
pub fn create_selector(initial: bool) -> Vc<Selector> {
    Selector(State::new(initial)).cell()
}

/// A never-changing State read by leaf tasks purely to make them mutable, so a reader records a
/// real dependency edge (an immutable constant records none — see `add_cell_dependency`).
#[turbo_tasks::value(transparent)]
pub struct Constant(State<u32>);

#[turbo_tasks::function(operation, root)]
pub fn create_constant() -> Vc<Constant> {
    Constant(State::new(0)).cell()
}

// --- Diamond fixture ---
//
// Reader `A` forward-cell-depends on target `B` without `B` being its child; both are children of
// the root. So collecting the root drives `A` and `B` to `parent_count 0` at once and they cascade
// concurrently, while `A` still has a forward-dep on `B` to scrub.

/// The forward-dependency target `B`.
#[turbo_tasks::function]
pub async fn diamond_target(constant: ResolvedVc<Constant>, index: u32) -> Result<Vc<u32>> {
    let base = *constant.await?.get();
    Ok(Vc::cell(base.wrapping_add(index).wrapping_mul(7)))
}

/// The diamond reader `A`: `B` arrives already resolved, so reading it records a forward dependency
/// without making `B` a child (only calling a task creates a child edge).
#[turbo_tasks::function]
pub async fn diamond_reader(target: ResolvedVc<u32>) -> Result<Vc<u32>> {
    Ok(Vc::cell(1 + *target.await?))
}

/// Parents each `A`/`B` pair as siblings. `fanout` is part of the cache key, so each caller gets
/// distinct task instances.
#[turbo_tasks::function]
pub async fn diamond_root(constant: ResolvedVc<Constant>, fanout: u32) -> Result<Vc<u32>> {
    let mut sum = 0u32;
    for index in 0..fanout {
        let target = diamond_target(*constant, index).to_resolved().await?;
        sum = sum.wrapping_add(*target.await?);
        sum = sum.wrapping_add(*diamond_reader(*target).await?);
    }
    Ok(Vc::cell(sum))
}

/// [`diamond_root`] as an op, for tests that need a `task_id()` to pin as a durable root.
#[turbo_tasks::function(operation, root)]
pub async fn diamond_root_op(constant: ResolvedVc<Constant>, fanout: u32) -> Result<Vc<u32>> {
    Ok(diamond_root(*constant, fanout))
}

// --- Generation fixture ---
//
// A wide set of tasks keyed by a generation counter. Bumping the generation makes `wide_root` read
// an entirely fresh set, disconnecting the whole previous generation (`2 * width` tasks) as garbage
// in one shot. `width` is a task argument rather than a constant so callers can pick their own
// scale while sharing these definitions.

/// The generation counter. A `State` so a test can bump it without rebuilding the graph.
#[turbo_tasks::value(transparent)]
pub struct Generation(State<u32>);

#[turbo_tasks::function(operation, root)]
pub fn create_generation() -> Vc<Generation> {
    Generation(State::new(0)).cell()
}

/// A leaf keyed by (generation, index). Bumping the generation makes `wide_root` read an entirely
/// fresh set of these, disconnecting the whole previous generation.
#[turbo_tasks::function]
pub fn leaf(generation: u32, index: u32) -> Vc<u32> {
    Vc::cell(generation.wrapping_mul(1000).wrapping_add(index))
}

/// A shared-dependency layer, so the disconnected garbage is a subtree (intermediate + leaf) and
/// the tests exercise the cascade rather than single-node collection.
#[turbo_tasks::function]
pub async fn intermediate(generation: u32, index: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(1 + *leaf(generation, index).await?))
}

/// Reads `width` intermediates (each reading a leaf). Bumping the generation re-executes this and
/// connects a fresh generation's worth of tasks, disconnecting the entire previous generation
/// (`2 * width` tasks) as garbage.
#[turbo_tasks::function(operation, root)]
pub async fn wide_root(generation: ResolvedVc<Generation>, width: u32) -> Result<Vc<u32>> {
    let generation = *generation.await?.get();
    let mut sum = 0u32;
    for index in 0..width {
        sum = sum.wrapping_add(*intermediate(generation, index).await?);
    }
    Ok(Vc::cell(sum))
}
