//! Deterministic interleavings of cell reads (`try_read_task_cell`) and keyed refinement
//! (`refine_provisional_cell_dependency`) with invalidations and other reads.
//!
//! A read registers its dependency in two lock sections, the reader's first (see
//! `try_read_task_cell`). [`set_between_read_steps_hook`] runs code between the two sections of
//! the next read on the current thread, e.g. an invalidation or another read.

use std::{cell::RefCell, sync::Arc};

use smallvec::SmallVec;
use turbo_tasks::{
    self as turbo_tasks, CellId, CellKey, FxIndexMap, ReadCellOptions, ReadCellTracking,
    ReadOutcome, SharedReference, TaskId, TurboTasks, ValueTypePersistence, VcValueType,
    event::Event,
};

use crate::{
    TurboTasksBackend,
    backend::{
        BackendOptions, StorageMode, TaskDataCategory,
        operation::{ExecuteContext, invalidate_cell_dependents},
        storage_schema::TaskStorageAccessors,
    },
    data::{CellRef, InProgressState, InProgressStateInner, TransientTask},
    noop_backing_storage,
};

type Hook = Box<dyn FnOnce(&mut ExecuteContext<'_>)>;

thread_local! {
    static BETWEEN_READ_STEPS: RefCell<Option<Hook>> = const { RefCell::new(None) };
}

/// Runs `hook` between the reader section and the task section of the next tracked cell read on
/// this thread.
fn set_between_read_steps_hook(hook: impl FnOnce(&mut ExecuteContext<'_>) + 'static) {
    BETWEEN_READ_STEPS.with(|h| *h.borrow_mut() = Some(Box::new(hook)));
}

pub(super) fn run_between_read_steps_hook(ctx: &mut ExecuteContext<'_>) {
    if let Some(hook) = BETWEEN_READ_STEPS.with(|h| h.borrow_mut().take()) {
        hook(ctx);
    }
}

const OWNER: u32 = 1;
const READER: u32 = 2;
/// A task id that doesn't exist: locking it panics.
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

fn value(v: u32) -> SharedReference {
    SharedReference::new(triomphe::Arc::new(v))
}

fn value_of(reference: &SharedReference) -> u32 {
    *reference.downcast_ref::<u32>().unwrap()
}

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
    {
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        // Error messages describe the task, which needs a task type.
        ctx.task(task(OWNER), TaskDataCategory::All)
            .set_transient_task_type(Arc::new(TransientTask::Root(Box::new(|| {
                // A scheduled recomputation never finishes.
                Box::pin(std::future::pending())
            }))));
        let mut reader = ctx.task(task(READER), TaskDataCategory::All);
        // In progress, so that it's never scheduled for real.
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
        set_content(&mut ctx, 1);
    }
    tt
}

fn set_content(ctx: &mut ExecuteContext<'_>, v: u32) {
    let mut owner = ctx.task(task(OWNER), TaskDataCategory::All);
    let _ = owner.insert_cell_data(cell(), value(v), &ValueTypePersistence::Skip);
    let _ = owner.insert_cell_type_max_index(cell().type_id(), 1);
}

/// Like `update_cell`: changes the content, then invalidates the dependents captured in the same
/// section.
fn write(ctx: &mut ExecuteContext<'_>, v: u32) {
    let mut owner = ctx.task(task(OWNER), TaskDataCategory::All);
    let _ = owner.insert_cell_data(cell(), value(v), &ValueTypePersistence::Skip);
    let mut dependents: FxIndexMap<TaskId, SmallVec<[Option<CellKey>; 2]>> = FxIndexMap::default();
    for dependent in owner.iter_cell_dependents() {
        if dependent.cell == cell() {
            dependents.entry(dependent.task).or_default().push(None);
        }
    }
    for (dependent, key) in owner.iter_keyed_cell_dependents() {
        if dependent.cell == cell() {
            dependents
                .entry(dependent.task)
                .or_default()
                .push(Some(key));
        }
    }
    drop(owner);
    invalidate_cell_dependents(
        target(),
        dependents,
        #[cfg(feature = "task_dirty_cause")]
        true,
        None,
        ctx,
    );
}

fn read(
    tt: &TurboTasks<TurboTasksBackend>,
    reader: u32,
    tracking: ReadCellTracking,
) -> anyhow::Result<ReadOutcome<turbo_tasks::backend::TypedCellContent>> {
    read_with_hint(tt, reader, tracking, false)
}

fn read_with_hint(
    tt: &TurboTasks<TurboTasksBackend>,
    reader: u32,
    tracking: ReadCellTracking,
    final_read_hint: bool,
) -> anyhow::Result<ReadOutcome<turbo_tasks::backend::TypedCellContent>> {
    tt.backend().try_read_task_cell(
        task(OWNER),
        Some(task(reader)),
        cell(),
        ReadCellOptions {
            tracking,
            final_read_hint,
        },
        tt,
    )
}

fn read_value(tt: &TurboTasks<TurboTasksBackend>, tracking: ReadCellTracking) -> u32 {
    match read(tt, READER, tracking).unwrap() {
        ReadOutcome::Value(content) => value_of(content.1.0.as_ref().unwrap()),
        _ => panic!("expected a value"),
    }
}

fn tracked() -> ReadCellTracking {
    ReadCellTracking::Tracked { key: None }
}

fn hashed(k: u64) -> ReadCellTracking {
    ReadCellTracking::Tracked {
        key: Some(CellKey::hash(k)),
    }
}

/// (reader has the current edge, reader has the outdated edge, number of reverse edges)
fn edges(tt: &TurboTasks<TurboTasksBackend>, key: Option<CellKey>) -> (bool, bool, usize) {
    let mut ctx = ExecuteContext::new(tt.backend(), tt);
    let reader = ctx.task(task(READER), TaskDataCategory::All);
    let (current, outdated) = match key {
        None => (
            reader.cell_dependencies_contains(&target()),
            reader.outdated_cell_dependencies_contains(&target()),
        ),
        Some(key) => (
            reader.cell_dependencies_keyed_contains(&(target(), key)),
            reader.outdated_cell_dependencies_keyed_contains(&(target(), key)),
        ),
    };
    drop(reader);
    let owner = ctx.task(task(OWNER), TaskDataCategory::All);
    let reverse_edges = match key {
        None => owner
            .iter_cell_dependents()
            .filter(|r| *r == reverse())
            .count(),
        Some(key) => owner
            .iter_keyed_cell_dependents()
            .filter(|e| *e == (reverse(), key))
            .count(),
    };
    (current, outdated, reverse_edges)
}

/// (dirty, stale) of the reader.
fn invalidated(tt: &TurboTasks<TurboTasksBackend>) -> (bool, bool) {
    let mut ctx = ExecuteContext::new(tt.backend(), tt);
    let reader = ctx.task(task(READER), TaskDataCategory::All);
    let stale = matches!(
        reader.get_in_progress(),
        Some(InProgressState::InProgress(inner)) if inner.stale
    );
    (reader.get_dirty().is_some(), stale)
}

/// Sets up an edge from the reader's previous execution.
fn add_outdated_edge(tt: &TurboTasks<TurboTasksBackend>, key: Option<CellKey>) {
    let mut ctx = ExecuteContext::new(tt.backend(), tt);
    let mut reader = ctx.task(task(READER), TaskDataCategory::All);
    match key {
        None => {
            let _ = reader.add_cell_dependencies(target());
            let _ = reader.add_outdated_cell_dependencies(target());
        }
        Some(key) => {
            let _ = reader.add_cell_dependencies_keyed((target(), key));
            let _ = reader.add_outdated_cell_dependencies_keyed((target(), key));
        }
    }
    drop(reader);
    let mut owner = ctx.task(task(OWNER), TaskDataCategory::All);
    owner.ensure_cell_dependent(reverse(), key);
}

fn make_owner_immutable(tt: &TurboTasks<TurboTasksBackend>) {
    let mut ctx = ExecuteContext::new(tt.backend(), tt);
    let mut owner = ctx.task(task(OWNER), TaskDataCategory::All);
    owner.set_immutable(true);
}

#[tokio::test(flavor = "multi_thread")]
async fn read_registers_both_edges() {
    let tt = backend();
    assert_eq!(read_value(&tt, tracked()), 1);
    assert_eq!(edges(&tt, None), (true, false, 1));
    assert_eq!(read_value(&tt, hashed(7)), 1);
    assert_eq!(edges(&tt, Some(CellKey::hash(7))), (true, false, 1));
}

#[tokio::test(flavor = "multi_thread")]
async fn write_between_the_steps_is_seen_by_the_read() {
    let tt = backend();
    set_between_read_steps_hook(|ctx| write(ctx, 2));
    // The write didn't find a reverse edge yet, but the read sees its content.
    assert_eq!(read_value(&tt, tracked()), 2);
    assert_eq!(edges(&tt, None), (true, false, 1));
    assert_eq!(invalidated(&tt), (false, false));
    // A later write invalidates the reader.
    let mut ctx = ExecuteContext::new(tt.backend(), &tt);
    write(&mut ctx, 3);
    assert_eq!(invalidated(&tt), (true, true));
}

#[tokio::test(flavor = "multi_thread")]
async fn write_after_the_read_invalidates_the_reader() {
    let tt = backend();
    assert_eq!(read_value(&tt, hashed(1)), 1);
    let mut ctx = ExecuteContext::new(tt.backend(), &tt);
    write(&mut ctx, 2);
    assert_eq!(invalidated(&tt), (true, true));
}

#[tokio::test(flavor = "multi_thread")]
async fn reexecution_with_an_outdated_edge() {
    for key in [None, Some(CellKey::hash(3))] {
        let tt = backend();
        add_outdated_edge(&tt, key);
        // The reader step makes the edge current, so a write between the steps makes the
        // execution stale (not just the task dirty), and the read sees the new content.
        set_between_read_steps_hook(|ctx| write(ctx, 2));
        let tracking = ReadCellTracking::Tracked { key };
        assert_eq!(read_value(&tt, tracking), 2);
        assert_eq!(edges(&tt, key), (true, false, 1));
        assert_eq!(invalidated(&tt), (true, true));
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn concurrent_read_of_the_same_cell_ensures_the_reverse_edge() {
    for key in [None, Some(CellKey::hash(4))] {
        let tt = backend();
        let tt2 = tt.clone();
        // The second read runs completely between the steps of the first: its reader step sees
        // the edge as already current, but it must not read without the reverse edge.
        set_between_read_steps_hook(move |_| {
            assert_eq!(read_value(&tt2, ReadCellTracking::Tracked { key }), 1);
            assert_eq!(edges(&tt2, key), (true, false, 1));
            // A write now must invalidate the reader, as the second read saw the old content.
            let mut ctx = ExecuteContext::new(tt2.backend(), &tt2);
            write(&mut ctx, 2);
            assert_eq!(invalidated(&tt2), (true, true));
        });
        assert_eq!(read_value(&tt, ReadCellTracking::Tracked { key }), 2);
        // The first read's task step doesn't add the reverse edge again.
        assert_eq!(edges(&tt, key), (true, false, 1));
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn repeated_reads_keep_one_edge() {
    let tt = backend();
    for _ in 0..3 {
        assert_eq!(read_value(&tt, tracked()), 1);
    }
    assert_eq!(edges(&tt, None), (true, false, 1));
}

#[tokio::test(flavor = "multi_thread")]
async fn track_only_error() {
    let tt = backend();
    // A successful read registers nothing.
    assert_eq!(read_value(&tt, ReadCellTracking::TrackOnlyError), 1);
    assert_eq!(edges(&tt, None), (false, false, 0));
    // A failed read registers the dependency, on both sides.
    {
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        let mut owner = ctx.task(task(OWNER), TaskDataCategory::All);
        let _ = owner.remove_cell_data(&cell(), &ValueTypePersistence::Skip);
        let _ = owner.remove_cell_type_max_index(&cell().type_id());
    }
    assert!(read(&tt, READER, ReadCellTracking::TrackOnlyError).is_err());
    assert_eq!(edges(&tt, None), (true, false, 1));
    // Once the cell exists again, the read succeeds, and the dependency stays.
    {
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        set_content(&mut ctx, 5);
    }
    assert_eq!(read_value(&tt, ReadCellTracking::TrackOnlyError), 5);
    assert_eq!(edges(&tt, None), (true, false, 1));
}

#[tokio::test(flavor = "multi_thread")]
async fn missing_cell_registers_the_dependency() {
    let tt = backend();
    {
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        let mut owner = ctx.task(task(OWNER), TaskDataCategory::All);
        let _ = owner.remove_cell_type_max_index(&cell().type_id());
    }
    // Content present is a value even without a max index, so remove it too.
    {
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        let mut owner = ctx.task(task(OWNER), TaskDataCategory::All);
        let _ = owner.remove_cell_data(&cell(), &ValueTypePersistence::Skip);
    }
    assert!(read(&tt, READER, tracked()).is_err());
    assert_eq!(edges(&tt, None), (true, false, 1));
}

#[tokio::test(flavor = "multi_thread")]
async fn in_progress_task_registers_the_dependency() {
    let tt = backend();
    {
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        let mut owner = ctx.task(task(OWNER), TaskDataCategory::All);
        let _ = owner.remove_cell_data(&cell(), &ValueTypePersistence::Skip);
        owner.set_in_progress(InProgressState::InProgress(Box::new(
            InProgressStateInner {
                stale: false,
                once_task: false,
                done_event: Event::new(|| || "test done_event".to_string()),
                marked_as_completed: false,
                new_children: Default::default(),
            },
        )));
    }
    assert!(matches!(
        read(&tt, READER, tracked()).unwrap(),
        ReadOutcome::InProgress(_)
    ));
    // The edge stays registered (a conservative superset), and a write invalidates the reader.
    assert_eq!(edges(&tt, None), (true, false, 1));
    let mut ctx = ExecuteContext::new(tt.backend(), &tt);
    write(&mut ctx, 2);
    assert_eq!(invalidated(&tt), (true, true));
}

#[tokio::test(flavor = "multi_thread")]
#[cfg_attr(feature = "verify_immutable", ignore)]
async fn known_immutable_owner_skips_the_reader() {
    let tt = backend();
    make_owner_immutable(&tt);
    tt.backend().known_immutable.insert(task(OWNER));
    // The reader doesn't exist: locking it would panic.
    match read(&tt, MISSING, tracked()).unwrap() {
        ReadOutcome::Value(content) => assert_eq!(value_of(content.1.0.as_ref().unwrap()), 1),
        _ => panic!("expected a value"),
    }
    let mut ctx = ExecuteContext::new(tt.backend(), &tt);
    let owner = ctx.task(task(OWNER), TaskDataCategory::All);
    assert_eq!(owner.iter_cell_dependents().count(), 0);
}

#[tokio::test(flavor = "multi_thread")]
#[cfg_attr(feature = "verify_immutable", ignore)]
async fn immutable_owner_not_yet_known_undoes_the_mark() {
    for outdated in [false, true] {
        let tt = backend();
        if outdated {
            add_outdated_edge(&tt, None);
        }
        make_owner_immutable(&tt);
        assert!(!tt.backend().known_immutable.contains(task(OWNER)));
        assert_eq!(read_value(&tt, tracked()), 1);
        // The reader's edge is back to its previous state, and the task is known immutable now.
        let expected = if outdated {
            (true, true, 1)
        } else {
            (false, false, 0)
        };
        assert_eq!(edges(&tt, None), expected);
        assert!(tt.backend().known_immutable.contains(task(OWNER)));
    }
}

#[tokio::test(flavor = "multi_thread")]
#[cfg_attr(feature = "verify_immutable", ignore)]
async fn owner_becoming_immutable_between_the_steps_undoes_the_mark() {
    let tt = backend();
    let tt2 = tt.clone();
    set_between_read_steps_hook(move |_| make_owner_immutable(&tt2));
    assert_eq!(read_value(&tt, tracked()), 1);
    assert_eq!(edges(&tt, None), (false, false, 0));
}

fn add_provisional(tt: &TurboTasks<TurboTasksBackend>, id: u32) {
    // Like a `keyed_reader()` read.
    let tracking = ReadCellTracking::Tracked {
        key: Some(CellKey::provisional(id)),
    };
    assert_eq!(read_value(tt, tracking), 1);
    assert_eq!(edges(tt, Some(CellKey::provisional(id))), (true, false, 1));
}

fn refine(tt: &TurboTasks<TurboTasksBackend>, id: u32, keys: &[u64]) {
    tt.backend().refine_provisional_cell_dependency(
        task(OWNER),
        cell(),
        task(READER),
        id,
        keys.iter().copied(),
        tt,
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn refine_replaces_the_provisional_dependency() {
    let tt = backend();
    add_provisional(&tt, 0);
    refine(&tt, 0, &[1, 2, 3]);
    assert_eq!(edges(&tt, Some(CellKey::provisional(0))), (false, false, 0));
    for k in [1, 2, 3] {
        assert_eq!(edges(&tt, Some(CellKey::hash(k))), (true, false, 1));
    }
    // A write of a refined key invalidates the reader.
    let mut ctx = ExecuteContext::new(tt.backend(), &tt);
    write(&mut ctx, 2);
    assert_eq!(invalidated(&tt), (true, true));
}

#[tokio::test(flavor = "multi_thread")]
async fn refine_without_keys_removes_the_provisional_dependency() {
    let tt = backend();
    add_provisional(&tt, 0);
    refine(&tt, 0, &[]);
    assert_eq!(edges(&tt, Some(CellKey::provisional(0))), (false, false, 0));
    let mut ctx = ExecuteContext::new(tt.backend(), &tt);
    write(&mut ctx, 2);
    assert_eq!(invalidated(&tt), (false, false));
}

#[tokio::test(flavor = "multi_thread")]
async fn refine_with_an_outdated_key_keeps_one_reverse_edge() {
    let tt = backend();
    add_outdated_edge(&tt, Some(CellKey::hash(1)));
    add_provisional(&tt, 0);
    refine(&tt, 0, &[1]);
    assert_eq!(edges(&tt, Some(CellKey::hash(1))), (true, false, 1));
}

#[tokio::test(flavor = "multi_thread")]
#[cfg_attr(feature = "verify_immutable", ignore)]
async fn refine_after_the_owner_became_immutable_removes_all_edges() {
    let tt = backend();
    add_provisional(&tt, 0);
    make_owner_immutable(&tt);
    refine(&tt, 0, &[1, 2]);
    assert_eq!(edges(&tt, Some(CellKey::provisional(0))), (false, false, 0));
    for k in [1, 2] {
        assert_eq!(edges(&tt, Some(CellKey::hash(k))), (false, false, 0));
    }
    assert!(tt.backend().known_immutable.contains(task(OWNER)));
}

#[tokio::test(flavor = "multi_thread")]
#[cfg_attr(feature = "verify_immutable", ignore)]
async fn refine_when_the_owner_is_already_known_immutable_removes_the_provisional_edge() {
    let tt = backend();
    add_provisional(&tt, 0);
    make_owner_immutable(&tt);
    tt.backend().known_immutable.insert(task(OWNER));
    refine(&tt, 0, &[1]);
    assert_eq!(edges(&tt, Some(CellKey::provisional(0))), (false, false, 0));
    assert_eq!(edges(&tt, Some(CellKey::hash(1))), (false, false, 0));
}

#[tokio::test(flavor = "multi_thread")]
async fn refine_without_keys_while_the_content_is_missing_keeps_the_provisional_dependency() {
    let tt = backend();
    add_provisional(&tt, 0);
    {
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        let mut owner = ctx.task(task(OWNER), TaskDataCategory::All);
        let _ = owner.remove_cell_data(&cell(), &ValueTypePersistence::Skip);
    }
    refine(&tt, 0, &[]);
    assert_eq!(edges(&tt, Some(CellKey::provisional(0))), (true, false, 1));
}

#[tokio::test(flavor = "multi_thread")]
async fn track_only_error_that_succeeds_on_the_retry_keeps_the_dependency() {
    let tt = backend();
    {
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        let mut owner = ctx.task(task(OWNER), TaskDataCategory::All);
        let _ = owner.remove_cell_data(&cell(), &ValueTypePersistence::Skip);
        let _ = owner.remove_cell_type_max_index(&cell().type_id());
    }
    // The first attempt fails without a dependency. The retry marks the reader, and the cell is
    // back before the retry reads it.
    set_between_read_steps_hook(|ctx| set_content(ctx, 5));
    assert_eq!(read_value(&tt, ReadCellTracking::TrackOnlyError), 5);
    assert_eq!(edges(&tt, None), (true, false, 1));
}

#[tokio::test(flavor = "multi_thread")]
async fn untracked_and_own_reads_register_nothing() {
    let tt = backend();
    // The reader doesn't exist: locking it would panic.
    assert!(matches!(
        read(&tt, MISSING, ReadCellTracking::Untracked).unwrap(),
        ReadOutcome::Value(_)
    ));
    assert!(matches!(
        read(&tt, OWNER, tracked()).unwrap(),
        ReadOutcome::Value(_)
    ));
    let mut ctx = ExecuteContext::new(tt.backend(), &tt);
    let owner = ctx.task(task(OWNER), TaskDataCategory::All);
    assert_eq!(owner.iter_cell_dependents().count(), 0);
    assert_eq!(owner.iter_cell_dependencies().count(), 0);
}

#[tokio::test(flavor = "multi_thread")]
async fn final_read_hint_removes_the_content_and_registers_the_dependency() {
    let tt = backend();
    match read_with_hint(&tt, READER, tracked(), true).unwrap() {
        ReadOutcome::Value(content) => assert_eq!(value_of(content.1.0.as_ref().unwrap()), 1),
        _ => panic!("expected a value"),
    }
    assert_eq!(edges(&tt, None), (true, false, 1));
    let mut ctx = ExecuteContext::new(tt.backend(), &tt);
    let owner = ctx.task(task(OWNER), TaskDataCategory::All);
    assert!(!owner.cell_data_contains(&cell()));
}

#[tokio::test(flavor = "multi_thread")]
async fn missing_content_schedules_a_recomputation_and_registers_the_dependency() {
    let tt = backend();
    {
        // The cell exists (its max index does), but its content was dropped.
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        let mut owner = ctx.task(task(OWNER), TaskDataCategory::All);
        let _ = owner.remove_cell_data(&cell(), &ValueTypePersistence::Skip);
    }
    assert!(matches!(
        read(&tt, READER, tracked()).unwrap(),
        ReadOutcome::Scheduled(_)
    ));
    assert_eq!(edges(&tt, None), (true, false, 1));
    // A second read while the recomputation is pending waits for it, and keeps one edge.
    assert!(matches!(
        read(&tt, READER, tracked()).unwrap(),
        ReadOutcome::InProgress(_) | ReadOutcome::Scheduled(_)
    ));
    assert_eq!(edges(&tt, None), (true, false, 1));
    let mut ctx = ExecuteContext::new(tt.backend(), &tt);
    let owner = ctx.task(task(OWNER), TaskDataCategory::All);
    assert!(owner.get_in_progress().is_some());
}
