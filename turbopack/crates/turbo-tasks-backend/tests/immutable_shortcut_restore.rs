#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! A task restored from persistence with its `immutable` flag is known to be immutable again (as
//! soon as it's restored), so cell reads of it skip the reader task and register no dependency
//! edges.

mod util;

use std::sync::atomic::{AtomicU32, Ordering};

use anyhow::Result;
use turbo_tasks::{TaskId, Vc};

use crate::util::{create_persistence_dir, create_tt_at, reopen_tt_with_gc};

static LEAF_EXECUTIONS: AtomicU32 = AtomicU32::new(0);

/// Immutable: no invalidator, no dependencies, not session dependent.
#[turbo_tasks::function]
fn imm_leaf(n: u32) -> Vc<u32> {
    LEAF_EXECUTIONS.fetch_add(1, Ordering::Relaxed);
    Vc::cell(n * 3)
}

/// Reads a cell of `imm_leaf(n)`. `tag` only makes the readers distinct tasks.
#[turbo_tasks::function]
async fn reader(n: u32, tag: u32) -> Result<Vc<u32>> {
    let _ = tag;
    Ok(Vc::cell(*imm_leaf(n).await?))
}

#[turbo_tasks::value]
struct Probe {
    value: u32,
    reader: u32,
    leaf: u32,
}

#[turbo_tasks::function(operation, root)]
async fn probe(n: u32, tag: u32) -> Result<Vc<Probe>> {
    let value = *reader(n, tag).await?;
    Ok(Probe {
        value,
        reader: *task_id_of(reader(n, tag)),
        leaf: *task_id_of(imm_leaf(n)),
    }
    .cell())
}

fn task_id_of<T>(vc: Vc<T>) -> TaskId {
    Vc::into_raw(vc)
        .try_get_task_id()
        .expect("a task call should be backed by a task")
}

async fn run_probe(
    tt: &std::sync::Arc<turbo_tasks::TurboTasks<turbo_tasks_backend::TurboTasksBackend>>,
    tag: u32,
) -> (u32, TaskId, TaskId) {
    turbo_tasks::run_once(tt.clone(), async move {
        let probe = probe(7, tag).read_strongly_consistent().await?;
        anyhow::Ok((
            probe.value,
            TaskId::new(probe.reader).unwrap(),
            TaskId::new(probe.leaf).unwrap(),
        ))
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
// The shortcut is disabled under `verify_immutable`, so that immutability is verified.
#[cfg_attr(feature = "verify_immutable", ignore)]
async fn restored_immutable_task_is_known_immutable() {
    let dir = create_persistence_dir("restored_immutable_task_is_known_immutable");

    // Session 1: the leaf executes and becomes immutable.
    let tt = create_tt_at(&dir);
    let (value, reader, leaf) = run_probe(&tt, 0).await;
    assert_eq!(value, 21);
    assert!(tt.backend().known_immutable_for_testing(leaf));
    assert_eq!(
        tt.backend().cell_dependency_count_for_testing(reader, &tt),
        Some(0)
    );
    assert_eq!(LEAF_EXECUTIONS.load(Ordering::Relaxed), 1);

    // Evicting the leaf keeps it known immutable. A new reader restores it from disk without
    // re-executing it, and registers no dependency edge.
    let outcome = tt.backend().snapshot_and_evict_for_testing(&tt);
    assert!(outcome.had_new_data);
    assert!(
        !tt.backend().is_resident_for_testing(leaf),
        "the leaf should have been evicted"
    );
    assert!(tt.backend().known_immutable_for_testing(leaf));
    let (value, reader_after_eviction, _) = run_probe(&tt, 3).await;
    assert_eq!(value, 21);
    assert!(tt.backend().is_resident_for_testing(leaf));
    assert_eq!(LEAF_EXECUTIONS.load(Ordering::Relaxed), 1);
    assert_eq!(
        tt.backend()
            .cell_dependency_count_for_testing(reader_after_eviction, &tt),
        Some(0)
    );
    tt.stop_and_wait().await;
    let executions = LEAF_EXECUTIONS.load(Ordering::Relaxed);
    assert_eq!(executions, 1);

    // Session 2: the leaf is only on disk, so nothing is known to be immutable yet.
    let tt = reopen_tt_with_gc(&dir);
    assert!(!tt.backend().is_resident_for_testing(leaf));
    assert!(!tt.backend().known_immutable_for_testing(leaf));

    // Restoring the leaf (without reading any of its cells) marks it as known immutable.
    assert_eq!(
        tt.backend().cell_dependency_count_for_testing(leaf, &tt),
        Some(0)
    );
    assert!(tt.backend().known_immutable_for_testing(leaf));

    // A new reader takes the shortcut, and the leaf isn't re-executed.
    let (value, reader1, leaf1) = run_probe(&tt, 1).await;
    assert_eq!((value, leaf1), (21, leaf));
    assert_eq!(LEAF_EXECUTIONS.load(Ordering::Relaxed), executions);
    assert!(tt.backend().known_immutable_for_testing(leaf));
    assert_eq!(
        tt.backend().cell_dependency_count_for_testing(reader1, &tt),
        Some(0)
    );

    // Another new reader takes the shortcut: no dependency edges either.
    let (value, reader2, _) = run_probe(&tt, 2).await;
    assert_eq!(value, 21);
    assert_ne!(reader2, reader1);
    assert_eq!(
        tt.backend().cell_dependency_count_for_testing(reader2, &tt),
        Some(0)
    );
    tt.stop_and_wait().await;
}
