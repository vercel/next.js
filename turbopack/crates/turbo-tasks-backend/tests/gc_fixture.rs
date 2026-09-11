//! Shared graph shapes for the GC tests.
//!
//! This module is compiled into each test binary separately, so any helper a given binary doesn't
//! call reads as dead code there.
#![allow(dead_code)]

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

/// The generation counter. A `State` so a test can bump it without rebuilding the graph.
#[turbo_tasks::value(transparent)]
pub struct Generation(State<u32>);

#[turbo_tasks::function(operation, root)]
pub fn create_generation() -> Vc<Generation> {
    Generation(State::new(0)).cell()
}

/// Children per interior node in [`wide_root`]'s tree.
///
/// Chosen so the tree actually promotes nodes into *aggregating* nodes, which is what makes the
/// fixture exercise `followers` at all. Two effects compound in `prepare_new_children`:
///
/// - A node's own `distance` is `children_count.ilog2() * 2`, so 8 children gives distance 6.
/// - While a parent is still a leaf its children start at `parent_effective + 3`, so `base`
///   accumulates down each level.
///
/// Together they carry `effective` past `LEAF_NUMBER` (16) a few levels down, and *that* is the
/// transition where a node's children convert into `followers`. A flat one-level tree never gets
/// there no matter how wide it is, which is why the previous fixture produced zero follower edges
/// and left the whole rebalance path untested.
pub const BRANCHING: u32 = 4;

/// A leaf keyed by (generation, index).
#[turbo_tasks::function]
pub fn leaf(generation: u32, index: u32) -> Vc<u32> {
    Vc::cell(generation.wrapping_mul(1000).wrapping_add(index))
}

/// One interior node of the tree, covering `[index, index + span)`.
///
/// Recurses until the span fits in a single [`leaf`], so the garbage from one generation is a
/// genuine multi-level subtree rather than a two-layer fan-out.
#[turbo_tasks::function]
pub async fn subtree(generation: u32, index: u32, span: u32) -> Result<Vc<u32>> {
    if span <= 1 {
        return Ok(Vc::cell(1 + *leaf(generation, index).await?));
    }
    let child_span = span.div_ceil(BRANCHING);
    let mut sum = 0u32;
    let mut start = index;
    while start < index + span {
        let this_span = child_span.min(index + span - start);
        sum = sum.wrapping_add(*subtree(generation, start, this_span).await?);
        start += this_span;
    }
    Ok(Vc::cell(sum))
}

/// A **live** interior node: keyed only on `index`/`span`, not on the generation, so the same task
/// survives every generation bump and simply re-executes with new children.
///
/// This is what makes the fixture reproduce the shape a real build has, and the one the flat
/// fixture never did: a *retained* parent whose children are collected out from under it. Two
/// sibling children of the same live parent go garbage in the same pass and are discovered
/// independently by the shard scan, so they are collected concurrently and both mutate this
/// parent's aggregation state while it stays live.
#[turbo_tasks::function]
pub async fn live_parent(
    generation: ResolvedVc<Generation>,
    index: u32,
    span: u32,
) -> Result<Vc<u32>> {
    let generation_value = *generation.await?.get();
    Ok(Vc::cell(*subtree(generation_value, index, span).await?))
}

/// Reads a `width`-leaf tree of [`subtree`] nodes through a layer of retained [`live_parent`]
/// nodes. Bumping the generation re-executes the tree and connects a fresh generation's worth of
/// tasks, disconnecting the entire previous generation as garbage — while the `live_parent` layer
/// itself stays resident across passes.
///
/// The disconnected set is `interior + leaf` nodes; use [`generation_task_count`] to size
/// assertions rather than assuming a fixed multiple of `width`.
#[turbo_tasks::function(operation, root)]
pub async fn wide_root(generation: ResolvedVc<Generation>, width: u32) -> Result<Vc<u32>> {
    let child_span = width.div_ceil(BRANCHING);
    let mut sum = 0u32;
    let mut start = 0;
    while start < width {
        let this_span = child_span.min(width - start);
        sum = sum.wrapping_add(*live_parent(*generation, start, this_span).await?);
        start += this_span;
    }
    Ok(Vc::cell(sum))
}

/// Tasks that one generation makes **collectable**: every [`subtree`] node plus every [`leaf`]
/// under the retained [`live_parent`] layer. Mirrors the fixture's own recursion so the two
/// cannot drift.
///
/// The `live_parent`s themselves are *not* counted: they are keyed only on `index`/`span`, so the
/// same tasks are reused across generations and stay resident.
pub fn generation_task_count(width: u32) -> usize {
    fn count(span: u32) -> usize {
        if span <= 1 {
            // A `subtree` node plus the `leaf` it reads.
            return 2;
        }
        let child_span = span.div_ceil(BRANCHING);
        let mut total = 1; // this interior node
        let mut start = 0;
        while start < span {
            let this_span = child_span.min(span - start);
            total += count(this_span);
            start += this_span;
        }
        total
    }
    // `wide_root` fans out into `live_parent`s, each covering `child_span` leaves; only the
    // `subtree` beneath each one is collectable.
    let child_span = width.div_ceil(BRANCHING);
    let mut total = 0;
    let mut start = 0;
    while start < width {
        let this_span = child_span.min(width - start);
        total += count(this_span);
        start += this_span;
    }
    total
}

/// The value [`wide_root`] computes for `generation`, for correctness assertions.
pub fn expected_value(generation: u32, width: u32) -> u32 {
    (0..width).fold(0u32, |acc, index| {
        acc.wrapping_add(1u32.wrapping_add(generation.wrapping_mul(1000).wrapping_add(index)))
    })
}
