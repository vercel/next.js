#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Reads of tasks that are known to be immutable (see `KnownImmutable` in the backend): an
//! immutable task becomes known to be immutable once it completes, reads of it stay correct and
//! register no dependency edges, mutable tasks are still read with dependency tracking, and a task
//! that is collected by GC and called again gets a new id instead of reusing the known-immutable
//! one.

mod gc_fixture;
mod util;

use std::sync::atomic::{AtomicU32, Ordering};

use anyhow::Result;
use rustc_hash::FxHashMap;
use turbo_tasks::{
    CellId, ReadCellOptions, ReadOutputOptions, ResolvedVc, TaskId, TurboTasks, Vc, VcValueType,
    backend::Backend,
};
use turbo_tasks_backend::TurboTasksBackend;

use crate::{
    gc_fixture::{Constant, Selector, create_constant, create_selector},
    util::create_tt,
};

fn task_id_of<T>(vc: Vc<T>) -> TaskId {
    Vc::into_raw(vc)
        .try_get_task_id()
        .expect("a task call should be backed by a task")
}

/// With `verify_immutable`, no task is known to be immutable (immutable tasks are tracked like
/// mutable ones to verify they don't change), so the optimization-specific checks are skipped.
const OPTIMIZED: bool = !cfg!(feature = "verify_immutable");

fn is_known_immutable(tt: &TurboTasks<TurboTasksBackend>, task: TaskId) -> bool {
    tt.backend().known_immutable_for_testing(task)
}

/// Immutable: no invalidator, no dependencies, not session dependent.
#[turbo_tasks::function]
fn imm_leaf(n: u32) -> Vc<u32> {
    Vc::cell(n * 3)
}

/// Reads a cell of `imm_leaf(n)`. `tag` only makes the readers distinct tasks.
#[turbo_tasks::function]
async fn cell_reader(n: u32, tag: u32) -> Result<Vc<u32>> {
    let _ = tag;
    Ok(Vc::cell(*imm_leaf(n).await?))
}

/// Reads only the output of `owner`, i.e. which task's cell it returns, not a cell.
#[turbo_tasks::function]
async fn output_reader(owner: ResolvedVc<OwnerSelector>, tag: u32) -> Result<Vc<u32>> {
    let _ = tag;
    let owner = match *owner.await? {
        OwnerSelector::Immutable(n) => imm_leaf(n),
        OwnerSelector::Mutable(constant) => mutable_output(*constant),
    };
    Ok(Vc::cell(*task_id_of(owner.resolve().await?)))
}

#[turbo_tasks::value]
enum OwnerSelector {
    Immutable(u32),
    Mutable(ResolvedVc<Constant>),
}

#[turbo_tasks::function(operation, root)]
fn owner_selector_immutable(n: u32) -> Vc<OwnerSelector> {
    OwnerSelector::Immutable(n).cell()
}

#[turbo_tasks::function(operation, root)]
fn owner_selector_mutable(constant: ResolvedVc<Constant>) -> Vc<OwnerSelector> {
    OwnerSelector::Mutable(constant).cell()
}

/// Mutable: its cell depends on `constant`.
#[turbo_tasks::function]
async fn mutable_value(constant: ResolvedVc<Constant>) -> Result<Vc<u32>> {
    Ok(Vc::cell(*constant.await?.get() + 100))
}

/// Mutable: which task's cell it returns depends on `constant`.
#[turbo_tasks::function]
async fn mutable_output(constant: ResolvedVc<Constant>) -> Result<Vc<u32>> {
    Ok(imm_leaf(*constant.await?.get()))
}

#[turbo_tasks::function]
async fn mutable_cell_reader(constant: ResolvedVc<Constant>) -> Result<Vc<u32>> {
    Ok(Vc::cell(*mutable_value(*constant).await?))
}

#[turbo_tasks::value]
struct Probe {
    value: u32,
    output: u32,
    owner: u32,
}

#[turbo_tasks::function(operation, root)]
async fn immutable_probe(n: u32, tag: u32) -> Result<Vc<Probe>> {
    let selector = owner_selector_immutable(n).resolve().await?;
    Ok(Probe {
        value: *cell_reader(n, tag).await?,
        output: *output_reader(*selector, tag).await?,
        owner: *task_id_of(imm_leaf(n)),
    }
    .cell())
}

/// Reads a cell of a mutable task, through a reader task.
#[turbo_tasks::function(operation, root)]
async fn mutable_cell_probe(constant: ResolvedVc<Constant>) -> Result<Vc<Probe>> {
    Ok(Probe {
        value: *mutable_cell_reader(*constant).await?,
        output: 0,
        owner: *task_id_of(mutable_value(*constant)),
    }
    .cell())
}

/// Reads only the output of a mutable task, through a reader task.
#[turbo_tasks::function(operation, root)]
async fn mutable_output_probe(constant: ResolvedVc<Constant>) -> Result<Vc<Probe>> {
    let selector = owner_selector_mutable(constant).resolve().await?;
    Ok(Probe {
        value: 0,
        output: *output_reader(*selector, 0).await?,
        owner: *task_id_of(mutable_output(*constant)),
    }
    .cell())
}

#[turbo_tasks::function(operation, root)]
async fn imm_leaf_task_id(n: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(*task_id_of(imm_leaf(n).resolve().await?)))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn reads_of_an_immutable_task() {
    let (tt, _dir) = create_tt("known_immutable_reads_of_an_immutable_task");
    let tt2 = tt.clone();
    turbo_tasks::run_once(tt.clone(), async move {
        for tag in 0..3 {
            let probe = immutable_probe(5, tag).read_strongly_consistent().await?;
            let owner = TaskId::try_from(probe.owner)?;
            assert_eq!(probe.value, 15);
            // The output of `imm_leaf(5)` is a cell of itself.
            assert_eq!(probe.output, probe.owner);
            assert_eq!(
                is_known_immutable(&tt2, owner),
                OPTIMIZED,
                "a completed immutable task is known to be immutable"
            );
        }
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn cell_reads_of_a_mutable_task_are_invalidated() {
    let (tt, _dir) = create_tt("known_immutable_cell_reads_of_a_mutable_task");
    let tt2 = tt.clone();
    turbo_tasks::run_once(tt.clone(), async move {
        let constant_op = create_constant();
        let constant_vc = constant_op.resolve().strongly_consistent().await?;
        let constant = constant_op.read_strongly_consistent().await?;
        let probe_op = mutable_cell_probe(constant_vc);
        for value in [0, 1, 2] {
            constant.set(value);
            let probe = probe_op.read_strongly_consistent().await?;
            // The cell reader sees the new value.
            assert_eq!(probe.value, value + 100);
            assert!(
                !is_known_immutable(&tt2, TaskId::try_from(probe.owner)?),
                "a task that reads a State is not known to be immutable"
            );
        }
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn output_reads_of_a_mutable_task_are_invalidated() {
    let (tt, _dir) = create_tt("known_immutable_output_reads_of_a_mutable_task");
    let tt2 = tt.clone();
    turbo_tasks::run_once(tt.clone(), async move {
        let constant_op = create_constant();
        let constant_vc = constant_op.resolve().strongly_consistent().await?;
        let constant = constant_op.read_strongly_consistent().await?;
        let probe_op = mutable_output_probe(constant_vc);
        for value in [0, 1, 2] {
            constant.set(value);
            let probe = probe_op.read_strongly_consistent().await?;
            // The output-only reader sees the new output (a cell of a different task).
            let expected = *imm_leaf_task_id(value).read_strongly_consistent().await?;
            assert_eq!(probe.output, expected);
            assert!(
                !is_known_immutable(&tt2, TaskId::try_from(probe.owner)?),
                "a task that reads a State is not known to be immutable"
            );
        }
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[turbo_tasks::value(transparent, cell = "keyed")]
struct Map(FxHashMap<u32, u32>);

/// Immutable, with a keyed cell.
#[turbo_tasks::function]
fn imm_map(m: u32) -> Vc<Map> {
    Vc::cell((0..m).map(|key| (key, key * 2)).collect())
}

#[turbo_tasks::function]
async fn keyed_get_reader(m: u32) -> Result<Vc<u32>> {
    let map = imm_map(m);
    let mut sum = 0;
    for key in 0..m {
        sum += *map.get(&key).await?.unwrap();
    }
    Ok(Vc::cell(sum))
}

#[turbo_tasks::function]
async fn keyed_reader_reader(m: u32) -> Result<Vc<u32>> {
    let map = imm_map(m).keyed_reader().await?;
    Ok(Vc::cell((0..m).map(|key| *map.get(&key).unwrap()).sum()))
}

#[turbo_tasks::value]
struct KeyedProbe {
    get: u32,
    keyed_reader: u32,
    owner: u32,
}

#[turbo_tasks::function(operation, root)]
async fn keyed_probe(m: u32) -> Result<Vc<KeyedProbe>> {
    Ok(KeyedProbe {
        get: *keyed_get_reader(m).await?,
        keyed_reader: *keyed_reader_reader(m).await?,
        owner: *task_id_of(imm_map(m).resolve().await?),
    }
    .cell())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn keyed_reads_of_an_immutable_task_add_no_edges() {
    let (tt, _dir) = create_tt("known_immutable_keyed_reads_add_no_edges");
    let tt2 = tt.clone();
    turbo_tasks::run_once(tt.clone(), async move {
        let m = 16;
        let probe = keyed_probe(m).read_strongly_consistent().await?;
        let expected = (0..m).map(|key| key * 2).sum::<u32>();
        assert_eq!(probe.get, expected);
        assert_eq!(probe.keyed_reader, expected);
        let owner = TaskId::try_from(probe.owner)?;
        assert_eq!(is_known_immutable(&tt2, owner), OPTIMIZED);
        if OPTIMIZED {
            assert_eq!(
                tt2.backend()
                    .keyed_cell_dependents_count_for_testing(owner, &tt2),
                0,
                "keyed reads of an immutable task register no dependency edges"
            );
        }
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

static GC_LEAF_EXECUTIONS: AtomicU32 = AtomicU32::new(0);

/// Immutable.
#[turbo_tasks::function]
fn gc_leaf(n: u32) -> Vc<u32> {
    GC_LEAF_EXECUTIONS.fetch_add(1, Ordering::SeqCst);
    Vc::cell(n * 5)
}

#[turbo_tasks::function]
fn other_leaf() -> Vc<u32> {
    Vc::cell(1)
}

/// Reads `gc_leaf(7)` while the selector is false, so flipping it disconnects `gc_leaf(7)`.
#[turbo_tasks::function(operation, root)]
async fn select(selector: ResolvedVc<Selector>) -> Result<Vc<Probe>> {
    let leaf = if *selector.await?.get() {
        other_leaf()
    } else {
        gc_leaf(7)
    };
    Ok(Probe {
        value: *leaf.await?,
        output: 0,
        owner: *task_id_of(leaf.resolve().await?),
    }
    .cell())
}

/// A known-immutable task that is collected by GC isn't reused when it's called again: the call
/// re-executes as a new task with a new id, and the collected id can no longer be read, even though
/// its bit stays set.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn collected_immutable_task_is_reexecuted_with_a_new_id() {
    let (tt, _dir) = create_tt("known_immutable_collected_task_new_id");
    let tt2 = tt.clone();
    let old = turbo_tasks::run_once(tt.clone(), async move {
        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;
        let output = select(selector_vc);
        let probe = output.read_strongly_consistent().await?;
        assert_eq!(probe.value, 35);
        let old = TaskId::try_from(probe.owner)?;
        assert_eq!(is_known_immutable(&tt2, old), OPTIMIZED);
        // Disconnect `gc_leaf(7)`.
        selector.set(true);
        assert_eq!(output.read_strongly_consistent().await?.value, 1);
        anyhow::Ok(old)
    })
    .await
    .unwrap();
    assert_eq!(GC_LEAF_EXECUTIONS.load(Ordering::SeqCst), 1);

    assert!(
        tt.backend().gc_for_testing(&tt) >= 1,
        "the disconnected gc_leaf(7) should be collected"
    );

    let tt2 = tt.clone();
    let new = turbo_tasks::run_once(tt.clone(), async move {
        let selector_op = create_selector(true);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;
        let output = select(selector_vc);
        assert_eq!(output.read_strongly_consistent().await?.value, 1);
        // Reconnect `gc_leaf(7)`.
        selector.set(false);
        let probe = output.read_strongly_consistent().await?;
        assert_eq!(probe.value, 35);
        let new = TaskId::try_from(probe.owner)?;
        assert_eq!(is_known_immutable(&tt2, new), OPTIMIZED);
        anyhow::Ok(new)
    })
    .await
    .unwrap();
    assert_ne!(new, old, "a collected task is called again under a new id");
    assert_eq!(
        GC_LEAF_EXECUTIONS.load(Ordering::SeqCst),
        2,
        "the collected task re-executes"
    );

    // The bit of the collected id stays set, but reading it fails instead of finding a task.
    assert_eq!(is_known_immutable(&tt, old), OPTIMIZED);
    let output_read = tt
        .backend()
        .try_read_task_output(old, Some(new), ReadOutputOptions::default(), &tt)
        .map(|_| ());
    let cell_read = tt
        .backend()
        .try_read_task_cell(
            old,
            CellId::new(<u32 as VcValueType>::get_value_type_id(), 0),
            Some(new),
            ReadCellOptions::default(),
            &tt,
        )
        .map(|_| ());
    for read in [output_read, cell_read] {
        let Err(err) = read else {
            panic!("reading a collected task should fail");
        };
        assert!(
            err.to_string().contains("no longer exists"),
            "unexpected error: {err:?}"
        );
    }

    tt.stop_and_wait().await;
}
