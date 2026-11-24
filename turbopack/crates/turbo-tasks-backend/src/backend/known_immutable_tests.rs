//! Reads (`try_read_task_cell`, `try_read_task_output`) and keyed refinement
//! (`refine_provisional_cell_dependency`) of immutable and mutable tasks, with and without the
//! task being known to be immutable (see [`KnownImmutable`](super::KnownImmutable)).

use std::sync::Arc;

use smallvec::SmallVec;
use turbo_tasks::{
    self as turbo_tasks, CellId, CellKey, FxIndexMap, ReadCellOptions, ReadCellTracking,
    ReadConsistency, ReadOutcome, ReadOutputOptions, ReadTracking, SharedReference, TaskId,
    TurboTasks, ValueTypePersistence, VcValueType, event::Event,
};

use crate::{
    TurboTasksBackend,
    backend::{
        BackendOptions, StorageMode, TaskDataCategory, operation::ExecuteContext,
        storage_schema::TaskStorageAccessors,
    },
    data::{CellRef, InProgressState, InProgressStateInner, OutputValue, TransientTask},
    noop_backing_storage,
};

const OWNER: u32 = 1;
const READER: u32 = 2;
/// A task id that doesn't exist.
const MISSING: u32 = 99;

fn task(id: u32) -> TaskId {
    TaskId::new(id).unwrap()
}

/// The value type of the read cell. The cell data stored in the tests are `u32`s.
#[turbo_tasks::value(serialization = "skip")]
struct TestValue(#[allow(dead_code)] u32);

fn cell() -> CellId {
    CellId::new(TestValue::get_value_type_id(), 0)
}

fn target() -> CellRef {
    CellRef {
        task: task(OWNER),
        cell: cell(),
    }
}

fn reverse() -> CellRef {
    CellRef {
        task: task(READER),
        cell: cell(),
    }
}

/// A backend with a resident owner task (holding the cell and an output) and a reader task that
/// is in progress, so that it's never scheduled for real.
fn backend() -> Arc<TurboTasks<TurboTasksBackend>> {
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            storage_mode: Some(StorageMode::ReadOnly),
            num_workers: Some(1),
            small_preallocation: true,
            ..Default::default()
        },
        noop_backing_storage(),
    ));
    for id in [OWNER, READER] {
        tt.backend()
            .storage
            .access_mut(task(id))
            .flags
            .set_restored(TaskDataCategory::All);
    }
    let mut ctx = ExecuteContext::new(&tt);
    let mut owner = ctx.task(task(OWNER), TaskDataCategory::All);
    // Error messages describe the task, which needs a task type.
    owner.set_transient_task_type(Arc::new(TransientTask::Root(Box::new(|| {
        Box::pin(std::future::pending())
    }))));
    let _ = owner.insert_cell_data(
        cell(),
        SharedReference::new(triomphe::Arc::new(1u32)),
        &ValueTypePersistence::Skip,
    );
    let _ = owner.insert_cell_type_max_index(cell().type_id(), 1);
    let _ = owner.set_output(OutputValue::Cell(target()));
    drop(owner);
    let mut reader = ctx.task(task(READER), TaskDataCategory::All);
    reader.set_in_progress(InProgressState::InProgress(Box::new(
        InProgressStateInner {
            stale: false,
            once_task: false,
            done_event: Event::new(|| || "test done_event".to_string()),
            marked_as_completed: false,
            new_children: Default::default(),
        },
    )));
    drop(reader);
    drop(ctx);
    tt
}

fn make_owner_immutable(tt: &TurboTasks<TurboTasksBackend>) {
    let mut ctx = ExecuteContext::new(tt);
    ctx.task(task(OWNER), TaskDataCategory::All)
        .set_immutable(true);
}

fn read_cell(tt: &TurboTasks<TurboTasksBackend>, owner: u32, key: Option<CellKey>) -> u32 {
    let outcome = tt
        .backend()
        .try_read_task_cell(
            task(owner),
            Some(task(READER)),
            cell(),
            ReadCellOptions {
                tracking: ReadCellTracking::Tracked { key },
                final_read_hint: false,
            },
            tt,
        )
        .unwrap();
    match outcome {
        ReadOutcome::Value(content) => *content.1.0.unwrap().downcast_ref::<u32>().unwrap(),
        _ => panic!("expected a value"),
    }
}

fn read_output(tt: &TurboTasks<TurboTasksBackend>) {
    let outcome = tt
        .backend()
        .try_read_task_output(
            task(OWNER),
            Some(task(READER)),
            ReadOutputOptions {
                tracking: ReadTracking::Tracked,
                consistency: ReadConsistency::Eventual,
            },
            tt,
        )
        .unwrap();
    assert!(matches!(outcome, ReadOutcome::Value(_)));
}

/// (cell dependencies of the reader, cell dependents of the owner), keyed or not, including
/// provisional ones.
fn cell_edges(tt: &TurboTasks<TurboTasksBackend>) -> (usize, usize) {
    let mut ctx = ExecuteContext::new(tt);
    let reader = ctx.task(task(READER), TaskDataCategory::All);
    let forward =
        reader.iter_cell_dependencies().count() + reader.iter_cell_dependencies_keyed().count();
    drop(reader);
    let owner = ctx.task(task(OWNER), TaskDataCategory::All);
    let reverse = owner.iter_cell_dependents().count() + owner.iter_keyed_cell_dependents().count();
    (forward, reverse)
}

/// (output dependencies of the reader, output dependents of the owner).
fn output_edges(tt: &TurboTasks<TurboTasksBackend>) -> (usize, usize) {
    let mut ctx = ExecuteContext::new(tt);
    let reader = ctx.task(task(READER), TaskDataCategory::All);
    let forward = reader.iter_output_dependencies().count();
    drop(reader);
    let owner = ctx.task(task(OWNER), TaskDataCategory::All);
    (forward, owner.iter_output_dependent().count())
}

/// Like `update_cell` on the owner's cell, without changing it: invalidates its dependents.
fn invalidate_cell(tt: &TurboTasks<TurboTasksBackend>) {
    let mut ctx = ExecuteContext::new(tt);
    let owner = ctx.task(task(OWNER), TaskDataCategory::All);
    let mut dependents: FxIndexMap<TaskId, SmallVec<[Option<CellKey>; 2]>> = FxIndexMap::default();
    for dependent in owner.iter_cell_dependents() {
        dependents.entry(dependent.task).or_default().push(None);
    }
    drop(owner);
    super::operation::invalidate_cell_dependents(
        target(),
        dependents,
        #[cfg(feature = "task_dirty_cause")]
        true,
        None,
        &mut ctx,
    );
}

/// Like completing a new output of the owner: invalidates its output dependents.
fn invalidate_output(tt: &TurboTasks<TurboTasksBackend>) {
    let mut ctx = ExecuteContext::new(tt);
    let owner = ctx.task(task(OWNER), TaskDataCategory::All);
    let dependents: SmallVec<[TaskId; 4]> = owner.iter_output_dependent().collect();
    drop(owner);
    tt.backend()
        .task_execution_completed_invalidate_output_dependent(
            &mut ctx,
            task(OWNER),
            #[cfg(feature = "task_dirty_cause")]
            None,
            dependents,
        );
}

/// Whether the reader was invalidated (it's in progress, so it's marked as stale).
fn reader_invalidated(tt: &TurboTasks<TurboTasksBackend>) -> bool {
    let mut ctx = ExecuteContext::new(tt);
    let reader = ctx.task(task(READER), TaskDataCategory::All);
    reader.get_dirty().is_some()
        || matches!(
            reader.get_in_progress(),
            Some(InProgressState::InProgress(inner)) if inner.stale
        )
}

#[tokio::test(flavor = "multi_thread")]
async fn mutable_reads_register_edges_and_are_invalidated() {
    let tt = backend();
    assert_eq!(read_cell(&tt, OWNER, None), 1);
    assert_eq!(read_cell(&tt, OWNER, Some(CellKey::hash(7))), 1);
    read_output(&tt);
    assert_eq!(cell_edges(&tt), (2, 2));
    assert_eq!(output_edges(&tt), (1, 1));
    assert!(!tt.backend().known_immutable.contains(task(OWNER)));
    assert!(!reader_invalidated(&tt));
    invalidate_cell(&tt);
    assert!(reader_invalidated(&tt));
}

#[tokio::test(flavor = "multi_thread")]
async fn mutable_output_read_is_invalidated() {
    let tt = backend();
    read_output(&tt);
    assert_eq!(cell_edges(&tt), (0, 0));
    assert_eq!(output_edges(&tt), (1, 1));
    assert!(!reader_invalidated(&tt));
    invalidate_output(&tt);
    assert!(reader_invalidated(&tt));
}

#[tokio::test(flavor = "multi_thread")]
// Under `verify_immutable`, immutable tasks get edges like mutable ones.
#[cfg_attr(feature = "verify_immutable", ignore)]
async fn reads_of_an_immutable_task_that_is_not_known_to_be_immutable() {
    let tt = backend();
    make_owner_immutable(&tt);
    assert!(!tt.backend().known_immutable.contains(task(OWNER)));
    assert_eq!(read_cell(&tt, OWNER, None), 1);
    // The read finds the task immutable under the lock: no edges, and it's known now.
    assert_eq!(cell_edges(&tt), (0, 0));
    assert!(tt.backend().known_immutable.contains(task(OWNER)));
    read_output(&tt);
    assert_eq!(output_edges(&tt), (0, 0));

    // Also for an output read.
    let tt = backend();
    make_owner_immutable(&tt);
    read_output(&tt);
    assert_eq!(output_edges(&tt), (0, 0));
    assert!(tt.backend().known_immutable.contains(task(OWNER)));
}

#[tokio::test(flavor = "multi_thread")]
#[cfg_attr(feature = "verify_immutable", ignore)]
async fn reads_of_a_known_immutable_task_add_no_edges() {
    let tt = backend();
    make_owner_immutable(&tt);
    tt.backend().known_immutable.insert(task(OWNER));
    assert_eq!(read_cell(&tt, OWNER, None), 1);
    assert_eq!(read_cell(&tt, OWNER, Some(CellKey::hash(7))), 1);
    read_output(&tt);
    assert_eq!(cell_edges(&tt), (0, 0));
    assert_eq!(output_edges(&tt), (0, 0));
}

#[tokio::test(flavor = "multi_thread")]
#[cfg_attr(feature = "verify_immutable", ignore)]
async fn reads_of_a_known_immutable_task_dont_open_the_reader() {
    let tt = backend();
    make_owner_immutable(&tt);
    tt.backend().known_immutable.insert(task(OWNER));
    // Opening this missing reader would panic.
    let missing_reader = task(MISSING);
    let outcome = tt
        .backend()
        .try_read_task_cell(
            task(OWNER),
            Some(missing_reader),
            cell(),
            ReadCellOptions::default(),
            &tt,
        )
        .unwrap();
    assert!(matches!(outcome, ReadOutcome::Value(_)));
    let outcome = tt
        .backend()
        .try_read_task_output(
            task(OWNER),
            Some(missing_reader),
            ReadOutputOptions::default(),
            &tt,
        )
        .unwrap();
    assert!(matches!(outcome, ReadOutcome::Value(_)));
    assert!(!tt.backend().is_resident_for_testing(missing_reader));
}

/// A read of the missing task through the backend, discarding the value.
type Read = fn(&TurboTasks<TurboTasksBackend>) -> anyhow::Result<()>;

#[tokio::test(flavor = "multi_thread")]
async fn reads_of_a_missing_task_fail() {
    let tt = backend();
    let reads: [Read; 2] = [
        |tt| {
            tt.backend()
                .try_read_task_cell(
                    task(MISSING),
                    Some(task(READER)),
                    cell(),
                    ReadCellOptions::default(),
                    tt,
                )
                .map(|_| ())
        },
        |tt| {
            tt.backend()
                .try_read_task_output(
                    task(MISSING),
                    Some(task(READER)),
                    ReadOutputOptions::default(),
                    tt,
                )
                .map(|_| ())
        },
    ];
    for read in reads {
        let error = read(&tt).unwrap_err();
        assert!(
            error.to_string().contains("no longer exists"),
            "unexpected error: {error}"
        );
        assert!(!tt.backend().is_resident_for_testing(task(MISSING)));
    }
    // A known-immutable task id that is gone still fails, and isn't recreated.
    tt.backend().known_immutable.insert(task(MISSING));
    for read in reads {
        assert!(read(&tt).is_err());
        assert!(!tt.backend().is_resident_for_testing(task(MISSING)));
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn reads_of_a_deleted_task_fail() {
    for known_immutable in [false, true] {
        let tt = backend();
        if known_immutable {
            make_owner_immutable(&tt);
            tt.backend().known_immutable.insert(task(OWNER));
        }
        tt.backend()
            .storage
            .access_mut(task(OWNER))
            .flags
            .set_deleted(true);
        let cell_error = match tt.backend().try_read_task_cell(
            task(OWNER),
            Some(task(READER)),
            cell(),
            ReadCellOptions::default(),
            &tt,
        ) {
            Ok(_) => panic!("a deleted task's cell read succeeded"),
            Err(error) => error,
        };
        let output_error = match tt.backend().try_read_task_output(
            task(OWNER),
            Some(task(READER)),
            ReadOutputOptions::default(),
            &tt,
        ) {
            Ok(_) => panic!("a deleted task's output read succeeded"),
            Err(error) => error,
        };
        for error in [cell_error, output_error] {
            assert!(
                error.to_string().contains("no longer exists"),
                "unexpected error: {error}"
            );
        }
        assert!(tt.backend().is_resident_for_testing(task(OWNER)));
        assert_eq!(cell_edges_without_owner(&tt), 0);
        assert_eq!(output_edges_without_owner(&tt), 0);
    }
}

fn cell_edges_without_owner(tt: &TurboTasks<TurboTasksBackend>) -> usize {
    let mut ctx = ExecuteContext::new(tt);
    let reader = ctx.task(task(READER), TaskDataCategory::All);
    reader.iter_cell_dependencies().count() + reader.iter_cell_dependencies_keyed().count()
}

fn output_edges_without_owner(tt: &TurboTasks<TurboTasksBackend>) -> usize {
    let mut ctx = ExecuteContext::new(tt);
    ctx.task(task(READER), TaskDataCategory::All)
        .iter_output_dependencies()
        .count()
}

/// Sets up a provisional dependency of the reader on the owner's cell, as a `keyed_reader()` read
/// does, and refines it with two keys.
fn refine_provisional(tt: &TurboTasks<TurboTasksBackend>) {
    let provisional = CellKey::provisional(0);
    {
        let mut ctx = ExecuteContext::new(tt);
        let (mut owner, mut reader) =
            ctx.task_pair(task(OWNER), task(READER), TaskDataCategory::All);
        owner.add_keyed_cell_dependent((reverse(), provisional));
        let _ = reader.add_cell_dependencies_keyed((target(), provisional));
    }
    assert_eq!(cell_edges(tt), (1, 1));
    tt.backend().refine_provisional_cell_dependency(
        task(OWNER),
        cell(),
        task(READER),
        0,
        [1u64, 2],
        tt,
    );
}

#[tokio::test(flavor = "multi_thread")]
#[cfg_attr(feature = "verify_immutable", ignore)]
async fn refinement_with_a_known_immutable_task_removes_the_provisional_edge() {
    let tt = backend();
    make_owner_immutable(&tt);
    tt.backend().known_immutable.insert(task(OWNER));
    refine_provisional(&tt);
    // No provisional edge left on either side, and no hash edges.
    assert_eq!(cell_edges(&tt), (0, 0));
}

#[tokio::test(flavor = "multi_thread")]
#[cfg_attr(feature = "verify_immutable", ignore)]
async fn refinement_with_an_immutable_task_makes_it_known_immutable() {
    let tt = backend();
    make_owner_immutable(&tt);
    refine_provisional(&tt);
    assert_eq!(cell_edges(&tt), (0, 0));
    assert!(tt.backend().known_immutable.contains(task(OWNER)));
}

#[tokio::test(flavor = "multi_thread")]
async fn refinement_with_a_mutable_task_adds_hash_edges() {
    let tt = backend();
    refine_provisional(&tt);
    // The provisional edge is replaced by the two hash edges on both sides.
    assert_eq!(cell_edges(&tt), (2, 2));
    assert!(!tt.backend().known_immutable.contains(task(OWNER)));
}
