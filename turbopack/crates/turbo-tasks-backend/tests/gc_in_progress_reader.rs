#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! GC can collect a task while another task is in the middle of an execution that uses one of its
//! cells.
//!
//! GC only excludes backend operations, not task executions, and it never collects a task that is
//! in progress. But the collectibility check ignores cell dependents, so the task *owning* a cell
//! that an in-progress execution holds (through a `ResolvedVc` argument or a `KeyedReadRef`) is
//! collected as soon as its own parent drops it. The realistic case is a reader whose parent is
//! dropping both of them: the reader keeps running, and its remaining accesses to the collected
//! owner must fail the reader's execution instead of panicking in the backend.
//!
//! Each test holds the reader in its execution, disconnects the owner, collects it and evicts it
//! (a full snapshot drops the collected task from memory), and then releases the reader.

mod gc_fixture;
mod util;

use std::{sync::LazyLock, time::Duration};

use anyhow::Result;
use rustc_hash::FxHashMap;
use tokio::sync::Notify;
use turbo_tasks::{OperationVc, ResolvedVc, Vc, VcValueType};

use crate::{
    gc_fixture::{Constant, Selector, create_constant, create_selector},
    util::create_tt,
};

/// The message of the error a read of a collected task fails with (see
/// `collected_task_read_error` in the backend).
const COLLECTED_TASK_ERROR: &str = "no longer exists (it was garbage collected)";

#[turbo_tasks::value(transparent, cell = "keyed")]
struct Map(FxHashMap<u32, u32>);

/// The owner of the cell the reader uses. It reads `constant` so it is mutable: reads of an
/// immutable task record no dependency, and so would never be refined.
#[turbo_tasks::function]
async fn owner(constant: ResolvedVc<Constant>) -> Result<Vc<Map>> {
    let base = *constant.await?.get();
    Ok(Vc::cell(FxHashMap::from_iter([(1, base + 1)])))
}

/// The owner's only parent. Flipping the selector drops the owner without invalidating it.
#[turbo_tasks::function(operation, root)]
async fn select_owner(
    selector: ResolvedVc<Selector>,
    constant: ResolvedVc<Constant>,
) -> Result<Vc<Map>> {
    Ok(if *selector.await?.get() {
        Vc::cell(FxHashMap::default())
    } else {
        owner(*constant)
    })
}

/// Signals between a test and the reader task it holds in its execution.
struct Gate {
    /// The reader has reached the point where it waits.
    reached: Notify,
    /// The test lets the reader continue.
    release: Notify,
}

impl Gate {
    fn new() -> Self {
        Self {
            reached: Notify::new(),
            release: Notify::new(),
        }
    }

    /// Called by the reader: signals the test, then waits until it is released.
    async fn wait(&self) {
        self.reached.notify_one();
        self.release.notified().await;
    }
}

static KEYED_READER_GATE: LazyLock<Gate> = LazyLock::new(Gate::new);
static DROP_HINT_GATE: LazyLock<Gate> = LazyLock::new(Gate::new);

/// Holds a `KeyedReadRef` of the owner's cell across the gate. Dropping it afterwards refines the
/// provisional dependency the read created, which touches the (by then collected) owner.
#[turbo_tasks::function(operation, root)]
async fn keyed_reader_op(map: ResolvedVc<Map>) -> Result<Vc<u32>> {
    let reader = map.keyed_reader().await?;
    let value = reader.get(&1).copied().unwrap_or_default();
    KEYED_READER_GATE.wait().await;
    drop(reader);
    Ok(Vc::cell(value))
}

/// Holds a `ResolvedVc` to the owner's cell across the gate, then hints that its content can be
/// dropped.
#[turbo_tasks::function(operation, root)]
async fn drop_hint_op(map: ResolvedVc<Map>) -> Result<Vc<()>> {
    DROP_HINT_GATE.wait().await;
    map.drop_content_hint().await?;
    Ok(Vc::cell(()))
}

/// Runs `reader` (an operation that waits on `gate` while holding a reference to the owner's cell)
/// across the collection of the owner, and returns its result.
async fn run_reader_across_owner_collection<T: VcValueType>(
    name: &str,
    gate: &'static Gate,
    reader: fn(ResolvedVc<Map>) -> OperationVc<T>,
) -> Result<()> {
    let (tt, _persistence_dir) = create_tt(name);

    // Build the owner and resolve its cell.
    let (selector_op, selector_vc, constant_vc, map) = turbo_tasks::run_once(tt.clone(), async {
        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let constant_vc = create_constant().resolve().strongly_consistent().await?;
        let map = select_owner(selector_vc, constant_vc)
            .resolve()
            .strongly_consistent()
            .await?;
        anyhow::Ok((selector_op, selector_vc, constant_vc, map))
    })
    .await
    .unwrap();

    // Start the reader and wait until it holds the reference.
    let reader_result = tokio::spawn(turbo_tasks::run_once(tt.clone(), async move {
        reader(map).read_strongly_consistent().await?;
        Ok(())
    }));
    tokio::time::timeout(Duration::from_secs(10), gate.reached.notified())
        .await
        .expect("the reader should reach the gate");

    // Disconnect the owner, then collect it and drop it from memory.
    turbo_tasks::run_once(tt.clone(), async move {
        selector_op.read_strongly_consistent().await?.set(true);
        select_owner(selector_vc, constant_vc)
            .read_strongly_consistent()
            .await?;
        anyhow::Ok(())
    })
    .await
    .unwrap();
    let outcome = tt.backend().snapshot_and_evict_for_testing(&tt);
    let (gc_stats, _) = outcome.gc.expect("GC is enabled");
    assert!(
        gc_stats.collected >= 1,
        "the disconnected owner should be collected while the reader is in progress"
    );

    // Let the reader finish its execution against the collected owner.
    gate.release.notify_one();
    tokio::time::timeout(Duration::from_secs(10), reader_result)
        .await
        .expect("the reader should finish")
        .expect("the reader task should not panic")
}

fn assert_fails_with_collected_task_error(result: Result<()>) {
    let error = result.expect_err("the reader should fail");
    let message = format!("{error:?}");
    assert!(
        message.contains(COLLECTED_TASK_ERROR),
        "expected a collected task error, got: {message}"
    );
}

/// Dropping a `KeyedReadRef` whose cell's owner was collected fails the reader.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn refining_a_keyed_read_of_a_collected_task_fails_the_reader() {
    let result = run_reader_across_owner_collection(
        "refining_a_keyed_read_of_a_collected_task_fails_the_reader",
        &KEYED_READER_GATE,
        keyed_reader_op,
    )
    .await;
    assert_fails_with_collected_task_error(result);
}

/// A content drop hint for a cell whose owner was collected fails the task giving the hint.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn drop_content_hint_of_a_collected_task_fails_the_caller() {
    let result = run_reader_across_owner_collection(
        "drop_content_hint_of_a_collected_task_fails_the_caller",
        &DROP_HINT_GATE,
        drop_hint_op,
    )
    .await;
    assert_fails_with_collected_task_error(result);
}
