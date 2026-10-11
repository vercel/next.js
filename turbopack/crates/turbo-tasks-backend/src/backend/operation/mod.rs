mod aggregation_update;
mod cleanup_old_edges;
mod connect_child;
mod connect_children;
mod invalidate;
mod leaf_distance_update;
mod prepare_new_children;
mod update_cell;
mod update_collectible;
use std::{
    fmt::{Debug, Display, Formatter},
    ops::DerefMut,
    sync::Arc,
};

use anyhow::{Context, Result};
use parking_lot::RwLockReadGuard;
use tracing::info_span;
#[cfg(feature = "trace_prepare_tasks")]
use tracing::trace_span;
use turbo_tasks::{
    CellId, DynTaskInputs, FxIndexMap, RawVc, SharedReference, TaskExecutionReason, TaskId,
    TaskPriority, TurboTasks, TurboTasksCallApi, ValueTypePersistence, backend::CachedTaskTypeArc,
    macro_helpers::NativeFunction,
};

pub use self::aggregation_update::{AggregationUpdateQueue, ComputeDirtyAndCleanUpdate};
use crate::{
    backend::{
        EventDescription, TaskDataCategory, TurboTasksBackend,
        cell_data::CellData,
        snapshot_coordinator::{OperationGuard, SnapshotPhase},
        storage::{SpecificTaskDataCategory, StorageWriteGuard, TaskEntryGuard, TrackOutcome},
        storage_schema::{TaskStorage, TaskStorageAccessors},
    },
    data::{ActivenessState, CollectibleRef, Dirtyness, InProgressState, TransientTask},
};

/// Whether an [`ExecuteContext`] task open may create the task, requires it to already exist, or
/// tolerates its absence. A private impl detail behind the three public methods
/// ([`ExecuteContext::task`] = `MustExist`, [`ExecuteContext::task_or_create`] =
/// `MaybeCreate`, [`ExecuteContext::try_task`] = `AllowMissing`).
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum TaskAccess {
    /// Open the task, creating it if it does not exist: `access_mut` inserts a blank entry, then
    /// the requested category is restored from disk (staying empty if there is nothing on disk).
    MaybeCreate,
    /// Open a task the caller expects to **already exist** (resident, or restorable from disk).
    /// A missing requested category's disk key is a stale reference, even if the other category
    /// exists, and this refuses to fabricate a blank for it.
    ///
    /// This is very much expressing a 'foreign key constraint' on the database.
    MustExist,
    /// Open a task that may legitimately be gone, soft-deleted, or missing a requested category.
    AllowMissing,
}

/// Counter that tracks how many task guards are alive, detecting concurrent access.
///
/// In release builds all methods are no-ops and the struct is zero-sized, so there is no runtime
/// cost.

#[derive(Clone)]
struct TaskLockCounter(#[cfg(debug_assertions)] std::sync::Arc<std::sync::atomic::AtomicU8>);

impl TaskLockCounter {
    fn new() -> Self {
        Self(
            #[cfg(debug_assertions)]
            std::sync::Arc::new(std::sync::atomic::AtomicU8::new(0)),
        )
    }

    /// Increment the count by 1 and panic if concurrent access is detected.
    fn acquire(&self) {
        #[cfg(debug_assertions)]
        if self.0.fetch_add(1, std::sync::atomic::Ordering::AcqRel) != 0 {
            panic!(
                "Concurrent task lock acquisition detected. This is not allowed and indicates a \
                 bug. It can lead to deadlocks."
            );
        }
    }

    /// Increment the count by `n` and panic if concurrent access is detected.
    fn acquire_multiple(&self, n: u8) {
        let _ = n; // silence warning
        #[cfg(debug_assertions)]
        if self.0.fetch_add(n, std::sync::atomic::Ordering::AcqRel) != 0 {
            panic!(
                "Concurrent task lock acquisition detected. This is not allowed and indicates a \
                 bug. It can lead to deadlocks."
            );
        }
    }

    /// Decrement the count by 1.
    fn release(&self) {
        #[cfg(debug_assertions)]
        self.0.fetch_sub(1, std::sync::atomic::Ordering::AcqRel);
    }
}

pub struct ExecuteContext<'e> {
    backend: &'e TurboTasksBackend,
    turbo_tasks: &'e TurboTasks<TurboTasksBackend>,
    gc_collectible: Option<&'e dyn Fn(TaskId)>,
    /// Held until all graph changes made by this context have completed.
    _operation_guard: Option<OperationGuard<'e>>,
    /// Held by contexts built through `TurboTasksBackend::try_execute_context`, so that storage
    /// teardown in `stop()` waits for this context to be dropped.
    _shutdown_guard: Option<RwLockReadGuard<'e, bool>>,
    task_lock_counter: TaskLockCounter,
}

impl<'e> ExecuteContext<'e> {
    pub(super) fn new(
        backend: &'e TurboTasksBackend,
        turbo_tasks: &'e TurboTasks<TurboTasksBackend>,
    ) -> Self {
        Self {
            backend,
            turbo_tasks,
            gc_collectible: None,
            _operation_guard: backend.start_operation(),
            _shutdown_guard: None,
            task_lock_counter: TaskLockCounter::new(),
        }
    }

    /// Like [`ExecuteContext::new`], but owns the shutdown read guard that
    /// [`TurboTasksBackend::try_execute_context`] acquired, keeping `stop()` out until this
    /// context is dropped.
    pub(super) fn new_with_shutdown_guard(
        backend: &'e TurboTasksBackend,
        turbo_tasks: &'e TurboTasks<TurboTasksBackend>,
        shutdown_guard: RwLockReadGuard<'e, bool>,
    ) -> Self {
        Self {
            backend,
            turbo_tasks,
            gc_collectible: None,
            _operation_guard: backend.start_operation(),
            _shutdown_guard: Some(shutdown_guard),
            task_lock_counter: TaskLockCounter::new(),
        }
    }

    /// Constructs a context that does NOT take an operation guard, for use by the garbage
    /// collector while it holds the coordinator's exclusion phase.
    ///
    /// The exclusion excludes all concurrent operations and task execution, so taking an operation
    /// guard here would deadlock. Requiring `&SnapshotPhase` makes that a type-level obligation:
    /// the caller cannot construct this context without actually holding the exclusion.
    pub(super) fn new_for_gc(
        backend: &'e TurboTasksBackend,
        turbo_tasks: &'e TurboTasks<TurboTasksBackend>,
        _phase: &'e SnapshotPhase<'_>,
        gc_collectible: &'e dyn Fn(TaskId),
    ) -> Self {
        Self {
            backend,
            turbo_tasks,
            gc_collectible: Some(gc_collectible),
            _operation_guard: None,
            _shutdown_guard: None,
            task_lock_counter: TaskLockCounter::new(),
        }
    }

    fn open_task(
        &mut self,
        task_id: TaskId,
        category: TaskDataCategory,
        access: TaskAccess,
    ) -> Option<TaskGuard<'e>> {
        self.task_lock_counter.acquire();

        let mut task = self.backend.storage.access_entry_mut(task_id);
        // Treat deleted tasks under AllowMissing as missing
        if access == TaskAccess::AllowMissing && task.flags.deleted() {
            self.task_lock_counter.release();
            return None;
        }
        if task.flags.is_restored(category) {
            return Some(TaskGuard::new(
                task.into_write_guard(),
                task_id,
                category,
                self.task_lock_counter.clone(),
            ));
        }

        if !self.can_restore(task_id) {
            // Such a task is fully restored from creation and never evicted, so one that is not
            // restored was never created or has been collected.
            if access == TaskAccess::MaybeCreate {
                task.flags.set_restored(TaskDataCategory::All);
                return Some(TaskGuard::new(
                    task.into_write_guard(),
                    task_id,
                    category,
                    self.task_lock_counter.clone(),
                ));
            }
            handle_missing_task(task, task_id, access, "task");
            self.task_lock_counter.release();
            return None;
        }

        // A disk read returning no key is conclusive for MustExist/AllowMissing, even if another
        // category was resident. Newly initialized tasks are already fully restored.
        let (task, outcome) = self
            .restore_task(task_id, category, task, access)
            .unwrap_or_else(|e| panic!("Failed to restore {category:?} for task {task_id}: {e:?}"));
        if outcome.missing_on_disk {
            handle_missing_task(task, task_id, access, "task");
            self.task_lock_counter.release();
            return None;
        }
        Some(TaskGuard::new(
            task.into_write_guard(),
            task_id,
            category,
            self.task_lock_counter.clone(),
        ))
    }

    /// Whether a task that is not restored could be restored from disk. Transient tasks, and every
    /// task when there is no backing storage, are fully restored from creation and never evicted.
    fn can_restore(&self, task_id: TaskId) -> bool {
        !task_id.is_transient() && self.backend.should_restore()
    }

    /// Reads the requested category from persistent storage. Under the task existence contract,
    /// an absent category key means the task is missing, regardless of the other category.
    fn restore_task_data(
        &self,
        task_id: TaskId,
        category: SpecificTaskDataCategory,
    ) -> Result<Option<TaskStorage>> {
        debug_assert!(
            self.backend.should_restore(),
            "restore_task_data called when should_restore() is false"
        );
        self.backend
            .backing_storage
            .lookup_data(task_id, category)
            .with_context(|| format!("Failed to restore {category:?} for {task_id}"))
    }

    /// Batched [`Self::restore_task_data`]: one entry per id, `None` where the requested
    /// category has no disk key.
    fn restore_task_data_batch(
        &self,
        task_ids: &[TaskId],
        category: SpecificTaskDataCategory,
    ) -> Result<Vec<Option<TaskStorage>>> {
        debug_assert!(task_ids.len() > 1, "Use restore_task_data for single task");
        debug_assert!(
            self.backend.should_restore(),
            "restore_task_data_batch called when should_restore() is false"
        );
        self.backend
            .backing_storage
            .batch_lookup_data(task_ids, category)
            .with_context(|| {
                format!(
                    "Failed to restore {category:?} for batch of {} tasks",
                    task_ids.len()
                )
            })
    }

    /// Restores `category` of a restorable task: reads every missing category no other thread is
    /// restoring, and waits for the rest.
    ///
    /// A missing requested category is conclusive for `MustExist` and `AllowMissing`, even if a
    /// peer is restoring the other category. The restoring bits are cleared and the task guard is
    /// returned for the caller to handle missing under the lock. `MaybeCreate` restores only the
    /// requested categories, using empty storage for absent keys. This is distinct from normal
    /// task creation, which initializes both categories before publishing the task id.
    fn restore_task(
        &self,
        task_id: TaskId,
        category: TaskDataCategory,
        mut task: TaskEntryGuard<'e>,
        access: TaskAccess,
    ) -> Result<(TaskEntryGuard<'e>, RestoreOutcome)> {
        debug_assert!(self.can_restore(task_id));
        let mut outcome = RestoreOutcome {
            missing_on_disk: false,
        };
        loop {
            // A peer that finished restoring may have provided the requested category.
            // A missing read instead leaves its category unrestored until the caller handles it.
            if task.flags.is_restored(category) {
                break;
            }
            let needs_data = category.includes_data() && !task.flags.data_restored();
            let needs_meta = category.includes_meta() && !task.flags.meta_restored();
            let peer_restoring_data = needs_data && task.flags.data_restoring();
            let peer_restoring_meta = needs_meta && task.flags.meta_restoring();
            // Claim categories no one else is restoring.
            let do_data = needs_data && !peer_restoring_data;
            let do_meta = needs_meta && !peer_restoring_meta;

            if do_data || do_meta {
                if do_data {
                    task.flags.set_data_restoring(true);
                }
                if do_meta {
                    task.flags.set_meta_restoring(true);
                }
                // Drop lock while doing I/O.
                drop(task);
                let storage_data = do_data
                    .then(|| self.restore_task_data(task_id, SpecificTaskDataCategory::Data));
                let storage_meta = do_meta
                    .then(|| self.restore_task_data(task_id, SpecificTaskDataCategory::Meta));

                task = self.backend.storage.access_entry_mut(task_id);
                let missing = matches!(storage_data, Some(Ok(None)))
                    || matches!(storage_meta, Some(Ok(None)));
                let failed =
                    matches!(storage_data, Some(Err(_))) || matches!(storage_meta, Some(Err(_)));
                if missing && !failed && access != TaskAccess::MaybeCreate {
                    // No category can be published: an absent key makes the entire task missing.
                    // Stop immediately instead of re-reading an empty category while a peer owns
                    // the other one. Notify waiters after dropping all our restoring claims.
                    if do_data {
                        task.flags.set_data_restoring(false);
                    }
                    if do_meta {
                        task.flags.set_meta_restoring(false);
                    }
                    self.backend.storage.restored.notify(usize::MAX);
                    outcome.missing_on_disk = true;
                    return Ok((task, outcome));
                }
                let mut result = Ok(());
                for (storage, category) in [
                    (storage_data, SpecificTaskDataCategory::Data),
                    (storage_meta, SpecificTaskDataCategory::Meta),
                ] {
                    let Some(storage) = storage else { continue };
                    let applied = apply_restore_result(&mut task, storage, category);
                    result = result.and(applied);
                }
                // Keep the guard through return. Once the restoring bit is clear, eviction may
                // otherwise drop the category before this caller can use it.
                self.backend.storage.restored.notify(usize::MAX);
                if let Err(e) = result {
                    // An I/O error must not leave a category this call applied looking valid if the
                    // panic is caught. Categories that were already resident are left untouched.
                    if do_data {
                        task.flags.set_data_restored(false);
                    }
                    if do_meta {
                        task.flags.set_meta_restored(false);
                    }
                    return Err(e);
                }
                continue;
            }

            // Every missing category is being restored by another thread. If eviction or a
            // missing-task discard removes the category or the entry while we wait, the loop
            // restores again (and finds the task missing itself).
            // Register before dropping the lock: the restorer notifies only after re-acquiring it
            // to apply its result, so no wakeup can be lost.
            let listener = self.backend.storage.restored.listen();
            drop(task);
            {
                let _span = info_span!("blocking on another thread reading").entered();
                listener.wait();
            }
            task = self.backend.storage.access_entry_mut(task_id);
        }
        Ok((task, outcome))
    }

    /// [`Self::restore_task`] on a freshly acquired guard, as a `MustExist` open.
    fn restore_existing_task(
        &self,
        task_id: TaskId,
        category: TaskDataCategory,
    ) -> Result<(TaskEntryGuard<'e>, RestoreOutcome)> {
        let task = self.backend.storage.access_entry_mut(task_id);
        self.restore_task(task_id, category, task, TaskAccess::MustExist)
    }

    /// Restores a batch of tasks, then hands each to `prepared_task_callback`. Like
    /// [`ExecuteContext::task`], every task must have the requested category on disk if it is not
    /// resident; a missing key panics.
    ///
    /// `prepared_task_callback` must not panic. A missing key is reported only after every task in
    /// the batch has been handed off, so that panic leaves nothing behind. A panicking callback is
    /// a bug in the backend, which is expected to abort, and it gets no such care: one that runs in
    /// Phase 1a can leave restores this batch has already claimed with their restoring bits set,
    /// and any thread waiting on those tasks then waits forever.
    fn prepare_tasks_with_callback(
        &mut self,
        task_ids: impl IntoIterator<Item = (TaskId, TaskDataCategory)>,
        reason: &'static str,
        mut prepared_task_callback: impl FnMut(
            &mut Self,
            TaskId,
            TaskDataCategory,
            StorageWriteGuard<'e>,
        ),
    ) {
        #[cfg(feature = "trace_prepare_tasks")]
        let _span = trace_span!("prepare_tasks_with_callback", reason).entered();

        // Fast path: no backing storage to restore from, so every task that exists is already
        // restored.
        if !self.backend.should_restore() {
            for (task_id, category) in task_ids {
                self.task_lock_counter.acquire();
                let task = self.backend.storage.access_mut(task_id);
                if !task.flags.is_restored(category) {
                    panic_missing_task(task_id, reason);
                }
                self.task_lock_counter.release();
                prepared_task_callback(self, task_id, category, task);
            }
            return;
        }

        let mut data_count = 0;
        let mut meta_count = 0;
        let mut all_count = 0;
        let mut tasks = task_ids
            .into_iter()
            .filter(|&(task_id, category)| {
                self.task_lock_counter.acquire();
                let task = self.backend.storage.access_mut(task_id);
                // Transient tasks are restored from creation and never evicted.
                if task_id.is_transient() || task.flags.is_restored(category) {
                    if !task.flags.is_restored(category) {
                        panic_missing_task(task_id, reason);
                    }
                    self.task_lock_counter.release();
                    prepared_task_callback(self, task_id, category, task);
                    return false;
                }
                self.task_lock_counter.release();
                true
            })
            .inspect(|(_, category)| match category {
                TaskDataCategory::Data => data_count += 1,
                TaskDataCategory::Meta => meta_count += 1,
                TaskDataCategory::All => all_count += 1,
            })
            .map(|(id, category)| TaskRestoreEntry {
                task_id: id,
                category,
                data_restore_result: None,
                meta_restore_result: None,
                wait_data: false,
                wait_meta: false,
                task_type: None,
                self_restored: false,
                failed: false,
            })
            .collect::<Vec<_>>();
        data_count += all_count;
        meta_count += all_count;

        let mut tasks_to_restore_for_data = Vec::with_capacity(data_count);
        let mut tasks_to_restore_for_data_indices = Vec::with_capacity(data_count);
        let mut tasks_to_restore_for_meta = Vec::with_capacity(meta_count);
        let mut tasks_to_restore_for_meta_indices = Vec::with_capacity(meta_count);

        // --- Phase 1a: Classify tasks under lock ---
        // Only claim reads after the ready-task callbacks above have finished, so callbacks
        // cannot block on a restore this batch has claimed but not yet started.
        let mut any_waiting = false;
        for (i, entry) in tasks.iter_mut().enumerate() {
            let task_id = entry.task_id;
            let category = entry.category;
            self.task_lock_counter.acquire();
            let mut task = self.backend.storage.access_mut(task_id);
            let mut ready = true;

            if category.includes_data() && !task.flags.data_restored() {
                ready = false;
                if task.flags.data_restoring() {
                    entry.wait_data = true;
                    any_waiting = true;
                } else {
                    task.flags.set_data_restoring(true);
                    tasks_to_restore_for_data.push(task_id);
                    tasks_to_restore_for_data_indices.push(i);
                }
            }
            if category.includes_meta() && !task.flags.meta_restored() {
                ready = false;
                if task.flags.meta_restoring() {
                    entry.wait_meta = true;
                    any_waiting = true;
                } else {
                    task.flags.set_meta_restoring(true);
                    tasks_to_restore_for_meta.push(task_id);
                    tasks_to_restore_for_meta_indices.push(i);
                }
            }
            self.task_lock_counter.release();
            // A peer may have completed the restore since filtering.
            if ready {
                prepared_task_callback(self, task_id, category, task);
            }
        }

        if tasks_to_restore_for_data.is_empty()
            && tasks_to_restore_for_meta.is_empty()
            && !any_waiting
        {
            return;
        }

        // --- Phase 1b: Batch I/O for tasks we claimed ---

        // Data I/O
        match tasks_to_restore_for_data.len() {
            0 => {}
            1 => {
                let task_id = tasks_to_restore_for_data[0];
                let idx = tasks_to_restore_for_data_indices[0];
                tasks[idx].data_restore_result =
                    Some(self.restore_task_data(task_id, SpecificTaskDataCategory::Data));
            }
            _ => {
                match self.restore_task_data_batch(
                    &tasks_to_restore_for_data,
                    SpecificTaskDataCategory::Data,
                ) {
                    Ok(data) => {
                        for (item, &idx) in data.into_iter().zip(&tasks_to_restore_for_data_indices)
                        {
                            tasks[idx].data_restore_result = Some(Ok(item));
                        }
                    }
                    Err(e) => {
                        // Batch failure: distribute the error to each affected task
                        let msg = format!("{e:?}");
                        for &idx in &tasks_to_restore_for_data_indices {
                            tasks[idx].data_restore_result =
                                Some(Err(anyhow::anyhow!("Batch data restore failed: {msg}")));
                        }
                    }
                }
            }
        }

        // Meta I/O
        match tasks_to_restore_for_meta.len() {
            0 => {}
            1 => {
                let task_id = tasks_to_restore_for_meta[0];
                let idx = tasks_to_restore_for_meta_indices[0];
                tasks[idx].meta_restore_result =
                    Some(self.restore_task_data(task_id, SpecificTaskDataCategory::Meta));
            }
            _ => {
                match self.restore_task_data_batch(
                    &tasks_to_restore_for_meta,
                    SpecificTaskDataCategory::Meta,
                ) {
                    Ok(data) => {
                        for (item, &idx) in data.into_iter().zip(&tasks_to_restore_for_meta_indices)
                        {
                            tasks[idx].meta_restore_result = Some(Ok(item));
                        }
                    }
                    Err(e) => {
                        let msg = format!("{e:?}");
                        for &idx in &tasks_to_restore_for_meta_indices {
                            tasks[idx].meta_restore_result =
                                Some(Err(anyhow::anyhow!("Batch meta restore failed: {msg}")));
                        }
                    }
                }
            }
        }

        // --- Phase 1c: Apply I/O results for tasks we restored ---
        // (callbacks are deferred to Phase 2 so we finish restoring — and notify waiters —
        // as early as possible)
        // Errors are collected rather than panicking immediately so that all tasks' restoring
        // bits are cleared first. Otherwise other threads waiting on those bits would hang.
        let mut any_self_restored = false;
        let mut restore_errors: Vec<(TaskId, &str, anyhow::Error)> = Vec::new();
        // Tasks that exist nowhere, reported once waiters are unblocked.
        let mut missing_tasks: Vec<TaskId> = Vec::new();
        for entry in &mut tasks {
            if entry.data_restore_result.is_none() && entry.meta_restore_result.is_none() {
                continue;
            }
            entry.self_restored = true;
            any_self_restored = true;
            let task_id = entry.task_id;

            self.task_lock_counter.acquire();
            let mut task = self.backend.storage.access_entry_mut(task_id);

            let has_error = matches!(entry.data_restore_result, Some(Err(_)))
                || matches!(entry.meta_restore_result, Some(Err(_)));
            let missing = !has_error
                && (matches!(entry.data_restore_result, Some(Ok(None)))
                    || matches!(entry.meta_restore_result, Some(Ok(None))));
            if missing {
                // No missing category may be published as restored, even if another category
                // was present on disk or a peer is still restoring it. Clear every claim before
                // notifying waiters and reporting the failure after this batch is processed.
                if entry.data_restore_result.take().is_some() {
                    task.flags.set_data_restoring(false);
                }
                if entry.meta_restore_result.take().is_some() {
                    task.flags.set_meta_restoring(false);
                }
                entry.failed = true;
                missing_tasks.push(task_id);
                // Discards the entry, or clears its restored flags if another thread still holds
                // it.
                handle_missing_task(task, task_id, TaskAccess::AllowMissing, reason);
                self.task_lock_counter.release();
                continue;
            } else {
                let claimed_data = entry.data_restore_result.is_some();
                let claimed_meta = entry.meta_restore_result.is_some();
                if let Some(result) = entry.data_restore_result.take() {
                    match apply_restore_result(&mut task, result, SpecificTaskDataCategory::Data) {
                        Ok(()) => {
                            // Since we claimed this restore (data_restored() was false under the
                            // lock), the task type is always fresh here.
                            entry.task_type = task.get_persistent_task_type().cloned();
                        }
                        Err(e) => restore_errors.push((task_id, "data", e)),
                    }
                }
                if let Some(result) = entry.meta_restore_result.take()
                    && let Err(e) =
                        apply_restore_result(&mut task, result, SpecificTaskDataCategory::Meta)
                {
                    restore_errors.push((task_id, "meta", e));
                }
                if has_error {
                    // Only undo categories this batch applied; resident state is not ours.
                    if claimed_data {
                        task.flags.set_data_restored(false);
                    }
                    if claimed_meta {
                        task.flags.set_meta_restored(false);
                    }
                    entry.failed = true;
                }
            }

            // Drop the lock before notifying so woken threads don't
            // immediately contend on the same DashMap shard.
            drop(task);
            self.task_lock_counter.release();
        }

        // Notify all waiting threads once, after all tasks have been restored
        // (or had their restoring bits cleared on error).
        if any_self_restored {
            self.backend.storage.restored.notify(usize::MAX);
        }

        // --- Phase 2: Callbacks for tasks we restored ourselves ---
        // Separated from Phase 1c so that other threads are unblocked as early as possible.
        for entry in &tasks {
            if !entry.self_restored || entry.failed {
                continue;
            }
            if let Some(task_type) = entry.task_type.clone() {
                // Insert into the task cache to avoid future lookups
                self.backend
                    .storage
                    .task_cache
                    .entry(task_type)
                    .or_insert(entry.task_id);
            }
            // Only call the callback if no category is still being restored by another thread.
            // If so, Phase 3 calls the callback after all categories are fully restored.
            if !entry.wait_data && !entry.wait_meta {
                // Phase 1c already checked existence. This restores the category again if
                // eviction won the handoff.
                let task = match self.restore_existing_task(entry.task_id, entry.category) {
                    Ok((task, _)) => task,
                    Err(e) => {
                        restore_errors.push((entry.task_id, category_name(entry.category), e));
                        continue;
                    }
                };
                prepared_task_callback(
                    self,
                    entry.task_id,
                    entry.category,
                    task.into_write_guard(),
                );
            }
        }

        // --- Phase 3: Wait for tasks being restored by other threads, then call callbacks ---
        // Process each waiting task individually: block until it is restored, then
        // immediately call the callback with the already-acquired write guard.
        if any_waiting {
            for entry in &tasks {
                if (!entry.wait_data && !entry.wait_meta) || entry.failed {
                    continue;
                }
                self.task_lock_counter.acquire();
                let (task, outcome) =
                    match self.restore_existing_task(entry.task_id, entry.category) {
                        Ok(restored) => restored,
                        Err(e) => {
                            restore_errors.push((entry.task_id, category_name(entry.category), e));
                            self.task_lock_counter.release();
                            continue;
                        }
                    };
                if outcome.missing_on_disk {
                    // Keep handing off the remaining tasks; report the failure at the end.
                    missing_tasks.push(entry.task_id);
                    handle_missing_task(task, entry.task_id, TaskAccess::AllowMissing, reason);
                    self.task_lock_counter.release();
                    continue;
                }
                self.task_lock_counter.release();
                prepared_task_callback(
                    self,
                    entry.task_id,
                    entry.category,
                    task.into_write_guard(),
                );
            }
        }

        if let Some(&task_id) = missing_tasks.first() {
            panic_missing_task(task_id, reason);
        }
        if !restore_errors.is_empty() {
            let msgs: Vec<String> = restore_errors
                .iter()
                .map(|(id, cat, e)| format!("Failed to restore {cat} for task {id}: {e:?}"))
                .collect();
            panic!("Restore failures:\n{}", msgs.join("\n"));
        }
    }
}

/// A label for `category` in restore error messages.
fn category_name(category: TaskDataCategory) -> &'static str {
    match category {
        TaskDataCategory::Meta => "meta",
        TaskDataCategory::Data => "data",
        TaskDataCategory::All => "data and meta",
    }
}

/// Per-task state threaded through the phases of `prepare_tasks_with_callback`.
struct TaskRestoreEntry {
    task_id: TaskId,
    category: TaskDataCategory,
    /// Result of restoring the data category (set in Phase 1b, consumed in Phase 1c). The inner
    /// `Option` is `None` when the task was not present on disk.
    data_restore_result: Option<Result<Option<TaskStorage>>>,
    /// Result of restoring the meta category (set in Phase 1b, consumed in Phase 1c). The inner
    /// `Option` is `None` when the task was not present on disk.
    meta_restore_result: Option<Result<Option<TaskStorage>>>,
    /// Another thread claimed the data restore; we must wait in Phase 3.
    wait_data: bool,
    /// Another thread claimed the meta restore; we must wait in Phase 3.
    wait_meta: bool,
    /// Task type discovered during Phase 1c data restore (used to update task cache in Phase 2).
    task_type: Option<CachedTaskTypeArc>,
    /// This thread performed the restore for at least one category (set in Phase 1c).
    self_restored: bool,
    /// The task is missing or failed to restore (set in Phase 1c), so the later phases skip it.
    failed: bool,
}

/// Outcome of [`ExecuteContext::restore_task`].
struct RestoreOutcome {
    /// A requested category was absent on disk; the task is invalid under MustExist/AllowMissing.
    missing_on_disk: bool,
}

/// Panics if a required task is missing from memory and disk; otherwise reports it as missing.
///
/// Under `AllowMissing` and `MustExist` the invalid entry is removed. No transient reference can be
/// held on it: those are only taken on tasks that exist, and a task that exists is never missing.
/// A thread still using the id re-creates an entry, finds the task missing itself, and discards it
/// in turn. `MustExist` then panics instead of returning a fabricated task.
fn handle_missing_task(
    task: TaskEntryGuard<'_>,
    task_id: TaskId,
    access: TaskAccess,
    reason: &str,
) {
    match access {
        TaskAccess::AllowMissing | TaskAccess::MustExist => {
            // A missing requested category invalidates the whole task, including one that had
            // its other category resident in memory.
            debug_assert_eq!(
                task.gc_transient_ref_count(),
                0,
                "task {task_id} is missing on disk but holds a transient reference"
            );
            task.discard();
            if access == TaskAccess::MustExist {
                panic_missing_task(task_id, reason);
            }
        }
        TaskAccess::MaybeCreate => unreachable!("a MaybeCreate open never checks existence"),
    }
}

#[cold]
fn panic_missing_task(task_id: TaskId, reason: &str) -> ! {
    panic!(
        "task {task_id} ({reason}, MustExist): task is missing in memory or persistent storage — \
         a stale reference to an already-collected or never-created task"
    )
}

/// The priority a task is scheduled with: an already computed task is a re-computation of a
/// (possibly deep) dependency, everything else starts at the initial priority.
fn schedule_priority(task: &TaskGuard<'_>, parent_priority: TaskPriority) -> TaskPriority {
    let priority = if task.has_output() {
        TaskPriority::invalidation(
            task.get_leaf_distance()
                .copied()
                .unwrap_or_default()
                .distance,
        )
    } else {
        TaskPriority::initial()
    };
    priority.in_parent(parent_priority)
}

/// Applies a restore I/O result to a task's in-memory state.
///
/// Clears the `*_restoring` flag for `category` unconditionally (success or error).
/// On success, merges `storage` into the task if not already marked restored, then sets
/// the restored flag. On error, returns the error so the caller can drop the task lock,
/// notify waiters, and panic.
fn apply_restore_result(
    task: &mut (impl DerefMut<Target = TaskStorage> + ?Sized),
    result: Result<Option<TaskStorage>>,
    category: SpecificTaskDataCategory,
) -> Result<()> {
    let task_category = TaskDataCategory::from(category);
    match result {
        // A task absent from disk applies as empty storage only for `MaybeCreate`; MustExist and
        // AllowMissing detect a missing key before calling this helper.
        Ok(storage) => {
            let storage = storage.unwrap_or_default();
            if task.flags.is_restored(task_category) {
                // Already restored by another path (e.g., initialize_new_task racing
                // with our I/O). Just clear the restoring bit so waiting threads
                // unblock; our result is redundant.
                task.flags.set_restoring(task_category, false);
                return Ok(());
            }
            task.restore_from(storage, category);
            task.flags.set_restored(task_category);
            task.flags.set_restoring(task_category, false);
            Ok(())
        }
        Err(e) => {
            task.flags.set_restoring(task_category, false);
            Err(e)
        }
    }
}

impl<'e> ExecuteContext<'e> {
    pub fn child_context<'l>(&self) -> ChildExecuteContext<'l>
    where
        'e: 'l,
    {
        ChildExecuteContext {
            backend: self.backend,
            turbo_tasks: self.turbo_tasks,
        }
    }

    /// Opens a task that must **already exist**, restoring the requested `category` if needed. A
    /// missing requested category in memory and on disk is a stale reference, so this panics
    /// rather than fabricate a blank. This is the common case; use
    /// [`Self::task_or_create`] only where the task may be getting materialized for
    /// the first time.
    ///
    /// A transient task (or any task, without backing storage) is restored from creation and never
    /// evicted, so one that is not restored exists nowhere. See `ExecuteContext::open_task`.
    pub fn task(&mut self, task_id: TaskId, category: TaskDataCategory) -> TaskGuard<'e> {
        self.open_task(task_id, category, TaskAccess::MustExist)
            .expect("a MustExist open either yields a task or panics")
    }

    /// Opens a task that may legitimately be gone, returning `None` if it is.
    ///
    /// Gone covers a missing requested category as well as a soft-deleted task: the caller cannot
    /// tell those apart, since only the timing of the next eviction separates them.
    pub fn try_task(
        &mut self,
        task_id: TaskId,
        category: TaskDataCategory,
    ) -> Option<TaskGuard<'e>> {
        self.open_task(task_id, category, TaskAccess::AllowMissing)
    }

    /// Opens a task, materializing an in-memory storage entry for it if one is not resident yet
    /// (inserting a blank, then restoring `category` from disk if present). Use only where the
    /// task's storage may not be resident: the first connect of a freshly-minted child (threads can
    /// race to first-touch it).
    ///
    /// This creates *storage for* an already-minted `TaskId`; it does not mint one. Compare
    /// `TurboTasksBackend::get_or_create_task`, which takes a function and arguments and returns a
    /// `TaskId` (reusing one if the task is already cached).
    pub fn task_or_create(&mut self, task_id: TaskId, category: TaskDataCategory) -> TaskGuard<'e> {
        self.open_task(task_id, category, TaskAccess::MaybeCreate)
            .expect("a MaybeCreate open always yields a task")
    }

    /// Prepares (as in fetches from persistent storage) a list of tasks.
    /// The iterator should not have duplicates, as this would cause over-fetching.
    ///
    /// Like [`Self::task`], a missing requested category makes the task invalid and panics.
    pub fn prepare_tasks(
        &mut self,
        task_ids: impl IntoIterator<Item = (TaskId, TaskDataCategory)>,
        reason: &'static str,
    ) {
        self.prepare_tasks_with_callback(task_ids, reason, |_, _, _, _| {});
    }

    /// Opens each task like [`Self::task`] (so every task must already exist), batching the reads
    /// from persistent storage.
    pub fn for_each_task(
        &mut self,
        task_ids: impl IntoIterator<Item = (TaskId, TaskDataCategory)>,
        reason: &'static str,
        mut func: impl FnMut(TaskGuard<'e>, &mut Self),
    ) {
        let task_lock_counter = self.task_lock_counter.clone();
        self.prepare_tasks_with_callback(task_ids, reason, |this, task_id, _category, task| {
            // prepare_tasks_with_callback releases the counter before calling this callback,
            // so the counter is 0 here. Acquire for the TaskGuard that will release on
            // Drop.
            task_lock_counter.acquire();

            let guard = TaskGuard::new(task, task_id, _category, task_lock_counter.clone());
            func(guard, this);
        });
    }

    pub fn for_each_task_meta(
        &mut self,
        task_ids: impl IntoIterator<Item = TaskId>,
        reason: &'static str,
        func: impl FnMut(TaskGuard<'e>, &mut Self),
    ) {
        self.for_each_task(
            task_ids.into_iter().map(|id| (id, TaskDataCategory::Meta)),
            reason,
            func,
        )
    }

    pub fn for_each_task_all(
        &mut self,
        task_ids: impl IntoIterator<Item = TaskId>,
        reason: &'static str,
        func: impl FnMut(TaskGuard<'e>, &mut Self),
    ) {
        self.for_each_task(
            task_ids.into_iter().map(|id| (id, TaskDataCategory::All)),
            reason,
            func,
        )
    }

    /// Opens two tasks that must **already exist** under a single lock acquisition (to atomically
    /// read/mutate an edge between them). Both ids are opened `MustExist` — an edge only exists
    /// between already-materialized tasks.
    pub fn task_pair(
        &mut self,
        task_id1: TaskId,
        task_id2: TaskId,
        category: TaskDataCategory,
    ) -> (TaskGuard<'e>, TaskGuard<'e>) {
        self.task_lock_counter.acquire_multiple(2);

        // `task_pair` is always a `MustExist` open (both endpoints of an existing edge). Each task
        // is restored on its own with the pair lock dropped, then the pair is re-locked; if
        // eviction cleared a category in between, the loop restores it again.
        let ids = [task_id1, task_id2];
        let (task1, task2) = loop {
            let (task1, task2) = self.backend.storage.access_pair_mut(task_id1, task_id2);
            let restored = [
                task1.flags.is_restored(category),
                task2.flags.is_restored(category),
            ];
            if restored == [true, true] {
                break (task1, task2);
            }
            drop(task1);
            drop(task2);

            for (task_id, restored) in ids.into_iter().zip(restored) {
                if restored {
                    continue;
                }
                let task = self.backend.storage.access_entry_mut(task_id);
                if !self.can_restore(task_id) {
                    // Discard the entry the pair lookup created for it before panicking.
                    handle_missing_task(task, task_id, TaskAccess::MustExist, "task_pair");
                    unreachable!("MustExist must panic after discarding a missing task");
                }
                let (task, outcome) = self
                    .restore_task(task_id, category, task, TaskAccess::MustExist)
                    .unwrap_or_else(|e| {
                        panic!("Failed to restore {category:?} for task {task_id}: {e:?}")
                    });
                // Decide under the guard that may hold an empty read.
                if outcome.missing_on_disk {
                    handle_missing_task(task, task_id, TaskAccess::MustExist, "task_pair");
                    unreachable!("MustExist must panic after discarding a missing task");
                }
                drop(task);
            }
        };

        (
            TaskGuard::new(task1, task_id1, category, self.task_lock_counter.clone()),
            TaskGuard::new(task2, task_id2, category, self.task_lock_counter.clone()),
        )
    }

    pub fn schedule_task(&self, task: &TaskGuard<'e>, parent_priority: TaskPriority) {
        let priority = schedule_priority(task, parent_priority);
        self.turbo_tasks.schedule(task.id(), priority);
    }

    pub fn get_current_task_priority(&self) -> TaskPriority {
        self.turbo_tasks.get_current_task_priority()
    }

    /// Record `task` as a GC candidate **if it is in fact collectible**.
    ///
    /// Call this wherever an operation removes the last reference of some kind to a task. This may
    /// be a transition to collectibility.
    ///
    /// Only effective in a GC context.
    pub fn note_maybe_collectible(&mut self, task: &TaskGuard<'_>) {
        if let Some(collector) = self.gc_collectible
            && task.is_gc_collectible()
        {
            collector(task.id());
        }
    }
    pub fn should_track_dependencies(&self) -> bool {
        self.backend.should_track_dependencies()
    }

    pub fn should_track_activeness(&self) -> bool {
        self.backend.should_track_activeness()
    }

    pub fn turbo_tasks(&self) -> Arc<dyn TurboTasksCallApi> {
        self.turbo_tasks.pin()
    }

    /// Look up a TaskId from the backing storage for a given task type.
    ///
    /// Uses hash-based lookup which may return multiple candidates due to hash collisions,
    /// then verifies each candidate by comparing the stored `persistent_task_type`.
    /// Returns `Some((task_id, task_type))` if a matching task is found, where `task_type` is
    /// the existing `CachedTaskTypeArc` from storage (avoiding a duplicate
    /// allocation).
    ///
    /// Accepts exploded components so the caller does not need to box the argument before calling.
    pub fn task_by_type(
        &mut self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &dyn DynTaskInputs,
    ) -> Option<(TaskId, CachedTaskTypeArc)> {
        if !self.backend.should_restore() {
            return None;
        }

        // Get candidates from backing storage (hash-based lookup may return multiple)
        let candidates = self
            .backend
            .backing_storage
            .lookup_task_candidates(native_fn, this, arg)
            .expect("Failed to lookup task ids");

        // Verify each candidate by comparing the stored persistent_task_type.
        // Only rarely is there more than one candidate, so no need for parallelization.
        for candidate_id in candidates {
            let task = self.task(candidate_id, TaskDataCategory::Data);
            if let Some(stored_type) = task.get_persistent_task_type()
                && stored_type.eq_components(native_fn, this, arg)
            {
                return Some((candidate_id, stored_type.clone()));
            }
        }
        None
    }

    pub fn debug_get_task_description(&self, task_id: TaskId) -> String {
        self.backend.debug_get_task_description(task_id)
    }
}

pub struct ChildExecuteContext<'e> {
    backend: &'e TurboTasksBackend,
    turbo_tasks: &'e TurboTasks<TurboTasksBackend>,
}

impl<'e> ChildExecuteContext<'e> {
    pub fn create(self) -> ExecuteContext<'e> {
        ExecuteContext {
            backend: self.backend,
            turbo_tasks: self.turbo_tasks,
            gc_collectible: None,
            _operation_guard: None,
            // A child context runs inside its parent's execution, which the foreground drain
            // already waits for, so it needs no shutdown guard of its own.
            _shutdown_guard: None,
            task_lock_counter: TaskLockCounter::new(),
        }
    }
}

pub enum TaskTypeRef<'l> {
    Cached(&'l CachedTaskTypeArc),
    Transient(&'l Arc<TransientTask>),
}

impl TaskTypeRef<'_> {
    pub fn to_owned(&self) -> TaskType {
        match self {
            TaskTypeRef::Cached(ty) => TaskType::Cached((*ty).clone()),
            TaskTypeRef::Transient(ty) => TaskType::Transient(Arc::clone(ty)),
        }
    }
}

impl Display for TaskTypeRef<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskTypeRef::Cached(ty) => write!(f, "{}", ty),
            TaskTypeRef::Transient(ty) => write!(f, "{}", ty),
        }
    }
}

#[derive(Debug)]
pub enum TaskType {
    Cached(CachedTaskTypeArc),
    Transient(Arc<TransientTask>),
}

impl Display for TaskType {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskType::Cached(ty) => write!(f, "{}", ty),
            TaskType::Transient(ty) => write!(f, "{}", ty),
        }
    }
}

pub struct TaskGuard<'a> {
    task_id: TaskId,
    task: StorageWriteGuard<'a>,
    // None means no categories are accessible other than transient data.
    #[cfg(debug_assertions)]
    category: TaskDataCategory,
    task_lock_counter: TaskLockCounter,
}

impl Drop for TaskGuard<'_> {
    fn drop(&mut self) {
        self.task_lock_counter.release();
    }
}

impl Debug for TaskGuard<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let mut d = f.debug_struct("TaskGuard");
        d.field("task_id", &self.task_id);
        d.field("storage", &*self.task);
        d.finish()
    }
}

impl<'a> TaskGuard<'a> {
    fn new(
        task: StorageWriteGuard<'a>,
        task_id: TaskId,
        #[allow(unused_variables)] category: TaskDataCategory,
        task_lock_counter: TaskLockCounter,
    ) -> Self {
        Self {
            task,
            task_id,
            #[cfg(debug_assertions)]
            category,
            task_lock_counter,
        }
    }

    /// Asserts this task has not been GC-collected.
    #[track_caller]
    #[inline]
    pub fn assert_not_deleted(&self, operation: &str) {
        debug_assert!(
            // Small hack to work around check_access. Technically a 'deleted' flag is never
            // persisted so it cannot be recovered either.
            !self.task.flags.deleted(),
            "{operation} on GC-deleted task {} — a resurrection path was missed",
            self.id()
        );
    }

    // ============ Aggregated Container Count (scalar) APIs ============
    // These are for the scalar total count fields, not the CounterMap per-task fields.

    /// Update the aggregated dirty container count (the scalar total count field) by the given
    /// delta and return the new value.
    pub fn update_and_get_aggregated_dirty_container_count(&mut self, delta: i32) -> i32 {
        let current = self
            .get_aggregated_dirty_container_count()
            .copied()
            .unwrap_or(0);
        let new_value = current + delta;
        if new_value == 0 {
            self.take_aggregated_dirty_container_count();
        } else {
            self.set_aggregated_dirty_container_count(new_value);
        }
        new_value
    }

    /// Update the aggregated current session clean container count (the scalar total count field)
    /// by the given delta and return the new value.
    pub fn update_and_get_aggregated_current_session_clean_container_count(
        &mut self,
        delta: i32,
    ) -> i32 {
        let current = self
            .get_aggregated_current_session_clean_container_count()
            .copied()
            .unwrap_or(0);
        let new_value = current + delta;
        if new_value == 0 {
            self.take_aggregated_current_session_clean_container_count();
        } else {
            self.set_aggregated_current_session_clean_container_count(new_value);
        }
        new_value
    }

    /// Adjust the count of persistent parents referencing this task by `delta`
    ///
    /// Panics on underflow/overflow
    pub fn update_and_get_parent_count(&mut self, delta: i32) -> u32 {
        let current = self.get_parent_count().copied().unwrap_or(0);
        let new_value = current
            .checked_add_signed(delta)
            .expect("parent_count underflow: decremented below the number of persistent parents");
        self.set_parent_count(new_value);
        new_value
    }

    /// Like [`Self::update_and_get_parent_count`], but for the transient (session-only) parent
    /// reference count
    /// Panics on underflow/overflow.
    pub fn update_and_get_transient_ref_count(&mut self, delta: i32) -> u32 {
        let current = self.get_transient_ref_count().copied().unwrap_or(0);
        let new_value = current
            .checked_add_signed(delta)
            .expect("transient_ref_count underflow");
        self.set_transient_ref_count(new_value);
        new_value
    }

    /// Whether a GC pass may collect this task: nothing references it.
    pub fn is_gc_collectible(&self) -> bool {
        self.check_access(SpecificTaskDataCategory::Meta);
        self.typed().gc_collectible()
    }

    pub fn is_dirty(&self) -> Option<TaskPriority> {
        self.get_dirty().and_then(|dirtyness| match dirtyness {
            Dirtyness::Dirty {
                parent_priority, ..
            } => Some(*parent_priority),
            Dirtyness::SessionDependent => {
                if !self.current_session_clean() {
                    Some(TaskPriority::leaf())
                } else {
                    None
                }
            }
        })
    }
    /// Returns (is_dirty, is_clean_in_current_session)
    pub fn dirty_state(&self) -> (bool, bool) {
        match self.get_dirty() {
            None => (false, false),
            Some(Dirtyness::Dirty { .. }) => (true, false),
            Some(Dirtyness::SessionDependent) => (true, self.current_session_clean()),
        }
    }
    /// Update the task's dirty state to `new_dirtyness`, applying the change to stored fields,
    /// computing the aggregated propagation update, and firing the `all_clean_event` if the task
    /// transitioned to clean.
    ///
    /// Returns an optional `AggregationUpdateJob` that the caller must run via
    /// `AggregationUpdateQueue::run` to propagate the change to aggregating ancestors.
    pub fn update_dirty_state(
        &mut self,
        new_dirtyness: Option<Dirtyness>,
    ) -> Option<AggregationUpdateJob> {
        let task_id = self.id();
        let old_dirtyness = self.get_dirty().cloned();
        let (old_self_dirty, old_current_session_self_clean) = self.dirty_state();
        let (new_self_dirty, new_current_session_self_clean) = match new_dirtyness {
            None => (false, false),
            Some(Dirtyness::Dirty { .. }) => (true, false),
            Some(Dirtyness::SessionDependent) => (true, true),
        };
        if old_dirtyness != new_dirtyness {
            if let Some(value) = new_dirtyness {
                self.set_dirty(value);
            } else {
                self.take_dirty();
            }
        }
        if old_current_session_self_clean != new_current_session_self_clean {
            self.set_current_session_clean(new_current_session_self_clean);
        }
        if old_self_dirty == new_self_dirty
            && old_current_session_self_clean == new_current_session_self_clean
        {
            return None;
        }
        let dirty_container_count = self
            .get_aggregated_dirty_container_count()
            .cloned()
            .unwrap_or_default();
        let current_session_clean_container_count = self
            .get_aggregated_current_session_clean_container_count()
            .copied()
            .unwrap_or_default();
        let result = ComputeDirtyAndCleanUpdate {
            old_dirty_container_count: dirty_container_count,
            new_dirty_container_count: dirty_container_count,
            old_current_session_clean_container_count: current_session_clean_container_count,
            new_current_session_clean_container_count: current_session_clean_container_count,
            old_self_dirty,
            new_self_dirty,
            old_current_session_self_clean,
            new_current_session_self_clean,
        }
        .compute();
        // Fire the all_clean_event if the task transitioned to clean
        if result.dirty_count_update - result.current_session_clean_update < 0
            && let Some(activeness_state) = self.get_activeness_mut()
        {
            activeness_state.all_clean_event.notify(usize::MAX);
            activeness_state.unset_active_until_clean();
            if activeness_state.is_empty() {
                self.take_activeness();
            }
        }
        result
            .aggregated_update(task_id)
            .and_then(|aggregated_update| {
                AggregationUpdateJob::data_update(self, aggregated_update)
            })
    }
    pub fn dirty_containers(&self) -> impl Iterator<Item = TaskId> {
        self.dirty_containers_with_count()
            .map(|(task_id, _)| task_id)
    }
    pub fn dirty_containers_with_count(&self) -> impl Iterator<Item = (TaskId, i32)> + '_ {
        let dirty_map = self.aggregated_dirty_containers();
        let clean_map = self.aggregated_current_session_clean_containers();
        dirty_map.into_iter().flat_map(move |map| {
            map.iter().filter_map(move |(&task_id, &count)| {
                if count > 0 {
                    let clean_count = clean_map
                        .and_then(|m| m.get(&task_id))
                        .copied()
                        .unwrap_or_default();
                    if count > clean_count {
                        return Some((task_id, count));
                    }
                }
                None
            })
        })
    }

    pub fn has_dirty_containers(&self) -> bool {
        let dirty_count = self
            .get_aggregated_dirty_container_count()
            .copied()
            .unwrap_or_default();
        if dirty_count <= 0 {
            return false;
        }
        let clean_count = self
            .get_aggregated_current_session_clean_container_count()
            .copied()
            .unwrap_or_default();
        dirty_count > clean_count
    }
    /// Insert cell data, returning the old value if present.
    pub fn insert_cell_data(
        &mut self,
        cell: CellId,
        value: SharedReference,
        persistence: &ValueTypePersistence,
    ) -> Option<SharedReference> {
        // We implement this here instead of in the generated code to optimize how mutations are
        // tracked
        self.check_access(SpecificTaskDataCategory::Data);
        if matches!(persistence, ValueTypePersistence::Persistable(..)) {
            // Unconditional track when persistable: an insert always changes the data snapshot
            // (a fresh cell, or a replaced value). No no-op to undo.
            let _ = self.track_modification(SpecificTaskDataCategory::Data, "cell_data");
        }
        self.typed_mut().cell_data_mut().insert(cell, value)
    }

    pub fn take_cell_data(&mut self) -> Option<CellData> {
        self.check_access(SpecificTaskDataCategory::Data);
        let undoable = self.track_modification(SpecificTaskDataCategory::Data, "cell_data");
        let prev = self.typed_mut().take_cell_data();
        if prev.is_none() {
            // very unlikely
            self.undo_track_modification(undoable);
        }
        prev
    }
    /// Remove cell data, returning the old value if present.
    pub fn remove_cell_data(
        &mut self,
        cell: &CellId,
        persistence: &ValueTypePersistence,
    ) -> Option<SharedReference> {
        self.check_access(SpecificTaskDataCategory::Data);
        // Track only when a persistable entry is actually removed (Skip/HashOnly cells contribute
        // nothing to the data snapshot). Track BEFORE mutating (snapshot mode clones pre-mutation
        // state), then undo if the entry turned out not to be present — avoiding a redundant
        // `cell_data_contains` probe.
        let outcome = if matches!(persistence, ValueTypePersistence::Persistable(..)) {
            self.track_modification(SpecificTaskDataCategory::Data, "cell_data")
        } else {
            TrackOutcome::NoChange
        };
        let old = self.typed_mut().cell_data_mut().remove(cell);
        if old.is_none() {
            self.undo_track_modification(outcome);
        }
        old
    }

    /// Add new cell data. Panics if the cell already had a value. See
    /// [`insert_cell_data`](Self::insert_cell_data) for the tracking rationale.
    pub fn add_cell_data(
        &mut self,
        cell: CellId,
        value: SharedReference,
        persistence: &ValueTypePersistence,
    ) {
        let old = self.insert_cell_data(cell, value, persistence);
        assert!(old.is_none(), "Cell data already exists for {cell:?}");
    }

    /// Add a scheduled task item. Returns true if the task was successfully added (wasn't already
    /// present).
    #[must_use]
    pub fn add_scheduled(
        &mut self,
        reason: TaskExecutionReason,
        description: EventDescription,
    ) -> bool {
        if self.has_in_progress() {
            false
        } else {
            self.set_in_progress(InProgressState::new_scheduled(reason, description));
            true
        }
    }

    /// Insert an outdated collectible with count. Returns true if it was newly inserted.
    #[must_use]
    pub fn insert_outdated_collectible(&mut self, collectible: CollectibleRef, value: i32) -> bool {
        // Check if already exists
        if self.get_outdated_collectibles(&collectible).is_some() {
            return false;
        }
        // Insert new entry
        self.add_outdated_collectibles(collectible, value);
        true
    }
    pub fn get_task_type(&self) -> TaskTypeRef<'_> {
        if let Some(task_type) = self.get_persistent_task_type() {
            TaskTypeRef::Cached(task_type)
        } else if let Some(task_type) = self.get_transient_task_type() {
            TaskTypeRef::Transient(task_type)
        } else {
            panic!("Every task must have a task type {self:#?}");
        }
    }

    /// A description of this task for diagnostics: `"<id> <task type>"`.
    ///
    /// Is intentionally tolerant of non-resident data.
    pub fn get_task_desc_fn(&self) -> impl Fn() -> String + Send + Sync + 'static {
        // Bypass `check_access`!!
        // Generally it is a bad idea since accessing a `Data` field like get_persistence_task_type
        // without opening the task that way is bug But this is for diagnostics and
        // debugging purposes only so we can cheat.
        let task_type = self
            .typed()
            .get_persistent_task_type()
            .map(|task_type| TaskTypeRef::Cached(task_type).to_owned())
            .or_else(|| {
                self.typed()
                    .get_transient_task_type()
                    .map(|task_type| TaskTypeRef::Transient(task_type).to_owned())
            });

        let task_id = self.id();
        move || match &task_type {
            Some(task_type) => format!("{task_id:?} {task_type}"),
            None => format!("{task_id:?} task-type-not-available"),
        }
    }
    // Requires the task to have been opened with Data access
    pub fn get_task_description(&self) -> String {
        let task_type = self.get_task_type().to_owned();
        let task_id = self.id();
        format!("{task_id:?} {task_type}")
    }

    #[cfg(feature = "trace_task_dirty")]
    pub fn get_task_name(&self) -> String {
        let task_type = self.get_task_type().to_owned();
        format!("{task_type}")
    }

    /// Verify that the task guard restored the correct category
    /// before accessing the data.
    #[inline]
    #[track_caller]
    fn check_access(&self, category: SpecificTaskDataCategory) {
        match category {
            SpecificTaskDataCategory::Data => {
                #[cfg(debug_assertions)]
                debug_assert!(
                    matches!(
                        self.category,
                        TaskDataCategory::Data | TaskDataCategory::All
                    ),
                    "To read data of {:?} the task need to be accessed with this category (It's \
                     accessed with {:?})",
                    category,
                    self.category
                );
            }
            SpecificTaskDataCategory::Meta => {
                #[cfg(debug_assertions)]
                debug_assert!(
                    matches!(
                        self.category,
                        TaskDataCategory::Meta | TaskDataCategory::All
                    ),
                    "To read data of {:?} the task need to be accessed with this category (It's \
                     accessed with {:?})",
                    category,
                    self.category
                );
            }
        }
    }

    pub fn id(&self) -> TaskId {
        self.task_id
    }

    #[cfg(debug_assertions)]
    pub fn access(&self) -> TaskDataCategory {
        self.category
    }
    #[cfg(debug_assertions)]
    pub fn downgrade_access(&mut self, access: TaskDataCategory) {
        assert!(
            self.category >= access,
            "Cannot downgrade {:?} to {access:?}",
            self.category
        );
        self.category = access;
    }

    pub fn invalidate_serialization(&mut self) {
        // TODO this causes race conditions, since we never know when a value is changed. We can't
        // "snapshot" the value correctly.
        // Serialization invalidation is about cell data (e.g. a `State` mutated in place), so only
        // the Data category is marked modified. Tracking Meta here would be wrong: callers only
        // restore Data, and persisting an unrestored Meta would overwrite the stored Meta with an
        // empty one. `track_modification` skips transient tasks and checks the access category.
        // Unconditional track (no mutation to detect a no-op against): always mark dirty.
        let _ = self.track_modification(SpecificTaskDataCategory::Data, "invalidate_serialization");
    }

    /// Determine which tasks to prefetch for a task.
    /// Only returns Some once per task.
    /// It returns a set of tasks and which info is needed.
    pub fn prefetch(&mut self) -> Option<FxIndexMap<TaskId, TaskDataCategory>> {
        if self.task.flags.prefetched() {
            return None;
        }
        self.task.flags.set_prefetched(true);
        let map = self
            .iter_output_dependencies()
            .map(|target| (target, TaskDataCategory::Meta))
            .chain(
                self.iter_cell_dependencies()
                    .map(|r| (r.task, TaskDataCategory::All)),
            )
            .chain(
                self.iter_cell_dependencies_hashed()
                    .map(|(r, _)| (r.task, TaskDataCategory::All)),
            )
            .chain(
                self.iter_collectibles_dependencies()
                    .map(|target| (target.task, TaskDataCategory::All)),
            )
            .chain(
                self.iter_children()
                    .map(|task| (task, TaskDataCategory::All)),
            )
            .collect::<FxIndexMap<_, _>>();
        (map.len() > 1).then_some(map)
    }

    /// Get mutable reference to the activeness state, inserting a new one if not present
    pub fn get_activeness_mut_or_insert_with<F>(&mut self, f: F) -> &mut ActivenessState
    where
        F: FnOnce() -> ActivenessState,
    {
        if !self.has_activeness() {
            self.set_activeness(f());
        }
        self.get_activeness_mut()
            .expect("activeness should exist after set")
    }
}

impl TaskStorageAccessors for TaskGuard<'_> {
    fn typed(&self) -> &TaskStorage {
        &self.task
    }

    fn typed_mut(&mut self) -> &mut TaskStorage {
        &mut self.task
    }

    #[inline(always)]
    fn track_modification(
        &mut self,
        category: SpecificTaskDataCategory,
        name: &str,
    ) -> TrackOutcome {
        if self.task_id.is_transient() {
            // Transient tasks are never persisted, so there is nothing to track or undo.
            TrackOutcome::NoChange
        } else {
            // Marking a category as modified persists it on the next snapshot, so the guard must
            // have been acquired with (i.e. restored) that category.
            self.check_access(category);
            self.task.track_modification(category, name)
        }
    }

    #[inline(always)]
    fn undo_track_modification(&mut self, outcome: TrackOutcome) {
        // Transient tasks return `NoChange` above, so undo is harmlessly a no-op for them.
        self.task.undo_track_modification(outcome);
    }

    #[track_caller]
    fn check_access(&self, category: SpecificTaskDataCategory) {
        self.check_access(category);
    }
}

pub use self::{
    aggregation_update::{
        AggregatedDataUpdate, AggregationUpdateJob, get_aggregation_number, get_uppers,
        is_aggregating_node, is_root_node,
    },
    cleanup_old_edges::{
        OutdatedEdge, capture_all_edges, cleanup_old_edges, cleanup_old_edges_deletions_only,
    },
    connect_child::connect_child,
    connect_children::connect_children,
    invalidate::{invalidate, make_task_dirty_internal},
    leaf_distance_update::LeafDistanceUpdateQueue,
    prepare_new_children::prepare_new_children,
    update_cell::update_cell,
    update_collectible::UpdateCollectibleOperation,
};

#[cfg(test)]
mod must_exist_tests {
    use turbo_tasks::{TRANSIENT_TASK_BIT, TaskId, TurboTasks};

    use super::*;
    use crate::{
        backend::{BackendOptions, StorageMode},
        noop_backing_storage,
    };

    fn persistent(id: u32) -> TaskId {
        TaskId::new(id).unwrap()
    }

    fn backend() -> Arc<TurboTasks<TurboTasksBackend>> {
        TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: Some(StorageMode::ReadOnly),
                num_workers: Some(1),
                small_preallocation: true,
                ..Default::default()
            },
            noop_backing_storage(),
        ))
    }

    fn resident(tt: &TurboTasks<TurboTasksBackend>, id: TaskId, category: TaskDataCategory) {
        tt.backend()
            .storage
            .access_mut(id)
            .flags
            .set_restored(category);
    }

    #[tokio::test(flavor = "multi_thread")]
    #[should_panic(expected = "task_pair, MustExist")]
    async fn task_pair_rejects_missing_transient_endpoint() {
        let tt = backend();
        let present = persistent(1);
        resident(&tt, present, TaskDataCategory::All);
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        let _ = ctx.task_pair(
            TaskId::new(TRANSIENT_TASK_BIT | 2).unwrap(),
            present,
            TaskDataCategory::All,
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    #[should_panic(expected = "prepare transient, MustExist")]
    async fn prepare_tasks_rejects_missing_transient() {
        let tt = backend();
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        ctx.prepare_tasks(
            [(
                TaskId::new(TRANSIENT_TASK_BIT | 1).unwrap(),
                TaskDataCategory::Meta,
            )],
            "prepare transient",
        );
    }

    /// Runs `f`, which must panic on a missing task, and returns the panic message. Task panics
    /// are usually caught, so the tests below check what the panic leaves behind. Tests using this
    /// are ignored on wasm, whose std is built `panic=abort`.
    fn catch_missing_task_panic(f: impl FnOnce()) -> String {
        let err = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f))
            .expect_err("opening a missing task must panic");
        err.downcast_ref::<String>()
            .cloned()
            .or_else(|| err.downcast_ref::<&str>().map(|s| s.to_string()))
            .unwrap_or_default()
    }

    /// No pin on the present task, and no entry left for the missing one.
    fn assert_no_leftovers(tt: &TurboTasks<TurboTasksBackend>, present: TaskId, missing: TaskId) {
        let storage = &tt.backend().storage;
        assert_eq!(
            storage.with_task(present, |t| t.gc_transient_ref_count()),
            Some(0),
            "the present task must not stay pinned"
        );
        assert!(
            storage.with_task(missing, |_| ()).is_none(),
            "the missing task must not leave an entry behind"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    #[cfg_attr(target_family = "wasm", ignore = "no unwinding on wasm")]
    async fn task_pair_missing_endpoint_leaves_no_pins() {
        let tt = backend();
        let present = persistent(1);
        let missing = persistent(2);
        resident(&tt, present, TaskDataCategory::All);
        let msg = catch_missing_task_panic(|| {
            let mut ctx = ExecuteContext::new(tt.backend(), &tt);
            let _ = ctx.task_pair(present, missing, TaskDataCategory::Meta);
        });
        assert!(msg.contains("task_pair, MustExist"), "{msg}");
        assert_no_leftovers(&tt, present, missing);
    }

    #[tokio::test(flavor = "multi_thread")]
    #[cfg_attr(target_family = "wasm", ignore = "no unwinding on wasm")]
    async fn task_pair_missing_transient_endpoint_leaves_no_entry() {
        let tt = backend();
        let present = persistent(1);
        let missing = TaskId::new(TRANSIENT_TASK_BIT | 2).unwrap();
        resident(&tt, present, TaskDataCategory::All);
        let msg = catch_missing_task_panic(|| {
            let mut ctx = ExecuteContext::new(tt.backend(), &tt);
            let _ = ctx.task_pair(missing, present, TaskDataCategory::All);
        });
        assert!(msg.contains("task_pair, MustExist"), "{msg}");
        assert_no_leftovers(&tt, present, missing);
    }

    #[tokio::test(flavor = "multi_thread")]
    #[cfg_attr(target_family = "wasm", ignore = "no unwinding on wasm")]
    async fn prepare_tasks_missing_task_hands_off_the_rest_and_leaves_no_pins() {
        let present = persistent(1);
        let missing = persistent(2);
        let (tt, _dir) = persisted_tasks(&[present]);
        let mut seen = Vec::new();
        let msg = catch_missing_task_panic(|| {
            let mut ctx = ExecuteContext::new(tt.backend(), &tt);
            ctx.for_each_task(
                [missing, present].map(|id| (id, TaskDataCategory::All)),
                "prepare missing",
                |guard, _| seen.push(guard.id()),
            );
        });
        assert!(msg.contains("prepare missing, MustExist"), "{msg}");
        assert_eq!(seen, [present], "the present task is still handed off");
        assert_no_leftovers(&tt, present, missing);
    }

    fn persisted_tasks(ids: &[TaskId]) -> (Arc<TurboTasks<TurboTasksBackend>>, tempfile::TempDir) {
        use turbo_bincode::{TurboBincodeBuffer, new_turbo_bincode_encoder};

        use crate::{BackingStorageOptions, GitVersionInfo, backing_storage::SnapshotItem};

        let dir = crate::utils::test_temp_dir::test_temp_dir().unwrap();
        let backing = crate::turbo_backing_storage(
            dir.path(),
            &GitVersionInfo {
                describe: "test-unversioned",
                dirty: false,
            },
            BackingStorageOptions {
                is_short_session: true,
                skip_compaction: true,
                ..Default::default()
            },
        )
        .unwrap()
        .0;
        let mut encoded_data = TurboBincodeBuffer::new();
        let mut encoded_meta = TurboBincodeBuffer::new();
        TaskStorage::default()
            .encode(
                SpecificTaskDataCategory::Data,
                &mut new_turbo_bincode_encoder(&mut encoded_data),
            )
            .unwrap();
        TaskStorage::default()
            .encode(
                SpecificTaskDataCategory::Meta,
                &mut new_turbo_bincode_encoder(&mut encoded_meta),
            )
            .unwrap();
        let items = ids
            .iter()
            .map(|&task_id| SnapshotItem::Put {
                task_id,
                data: Some(encoded_data.clone()),
                meta: Some(encoded_meta.clone()),
                task_type_hash: None,
                #[cfg(feature = "print_cache_item_size")]
                stats: Default::default(),
            })
            .collect::<Vec<_>>();
        backing.save_snapshot(None, vec![items]).unwrap();
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: Some(StorageMode::ReadOnly),
                num_workers: Some(1),
                small_preallocation: true,
                ..Default::default()
            },
            backing,
        ));
        (tt, dir)
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn prepare_tasks_with_callback_handles_mixed_ready_and_disk_tasks_once() {
        let ready = persistent(1);
        let disk = [persistent(2), persistent(3)];
        let transient = TaskId::new(TRANSIENT_TASK_BIT | 4).unwrap();
        let (tt, _dir) = persisted_tasks(&[ready, disk[0], disk[1]]);
        resident(&tt, ready, TaskDataCategory::All);
        resident(&tt, transient, TaskDataCategory::All);
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        let mut seen = Vec::new();
        ctx.for_each_task(
            [disk[0], ready, disk[1], transient].map(|id| (id, TaskDataCategory::All)),
            "mixed ready and disk",
            |guard, _| seen.push(guard.id()),
        );
        // Ready tasks bypass batch entries; disk tasks still use the correct compressed indices.
        assert_eq!(seen, [ready, transient, disk[0], disk[1]]);
        for id in [ready, transient, disk[0], disk[1]] {
            let task = tt.backend().storage.access_mut(id);
            assert!(task.flags.is_restored(TaskDataCategory::All));
            assert_eq!(task.gc_transient_ref_count(), 0);
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    #[cfg_attr(target_family = "wasm", ignore = "no unwinding on wasm")]
    async fn missing_category_does_not_wait_for_unrelated_peer_restore() {
        use std::{
            panic::{AssertUnwindSafe, catch_unwind},
            sync::mpsc,
            time::Duration,
        };

        let tt = backend();
        let id = persistent(4);
        tt.backend()
            .storage
            .access_mut(id)
            .flags
            .set_meta_restoring(true);
        let (sender, receiver) = mpsc::sync_channel(1);
        let worker_tt = tt.clone();
        let worker = std::thread::spawn(move || {
            let mut ctx = ExecuteContext::new(worker_tt.backend(), &worker_tt);
            let panicked = catch_unwind(AssertUnwindSafe(|| {
                let _ = ctx.task(id, TaskDataCategory::All);
            }))
            .is_err();
            sender.send(panicked).unwrap();
        });

        // Whether it timed out or not, release the synthetic peer before joining the worker.
        let completed_without_peer = receiver.recv_timeout(Duration::from_secs(2));
        tt.backend()
            .storage
            .access_mut(id)
            .flags
            .set_meta_restoring(false);
        tt.backend().storage.restored.notify(usize::MAX);
        worker.join().unwrap();
        assert!(
            completed_without_peer.unwrap(),
            "missing key must fail without waiting for Meta"
        );
        let task = tt.backend().storage.access_mut(id);
        assert!(!task.flags.data_restoring() && !task.flags.meta_restoring());
    }

    #[tokio::test(flavor = "multi_thread")]
    #[cfg_attr(target_family = "wasm", ignore = "no unwinding on wasm")]
    async fn prepare_tasks_does_not_publish_empty_category_while_peer_restores() {
        use std::{
            panic::{AssertUnwindSafe, catch_unwind},
            time::Duration,
        };

        let tt = backend();
        let id = persistent(3);
        tt.backend()
            .storage
            .access_mut(id)
            .flags
            .set_meta_restoring(true);
        let listener = tt.backend().storage.restored.listen();
        let worker_tt = tt.clone();
        let worker = std::thread::spawn(move || {
            let mut ctx = ExecuteContext::new(worker_tt.backend(), &worker_tt);
            catch_unwind(AssertUnwindSafe(|| {
                ctx.prepare_tasks([(id, TaskDataCategory::All)], "wait for peer");
            }))
            .is_err()
        });

        // Phase 1c has completed its empty Data read but is still waiting for the peer's Meta.
        let notified = tokio::time::timeout(Duration::from_secs(5), listener).await;
        let data_was_published = tt.backend().storage.access_mut(id).flags.data_restored();
        tt.backend()
            .storage
            .access_mut(id)
            .flags
            .set_meta_restoring(false);
        tt.backend().storage.restored.notify(usize::MAX);
        assert!(notified.is_ok(), "batch restore never reached Phase 1c");
        assert!(
            !data_was_published,
            "an empty Data read must not be visible as restored"
        );
        assert!(
            worker.join().unwrap(),
            "a missing task must still fail after the wait"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    #[cfg_attr(target_family = "wasm", ignore = "no unwinding on wasm")]
    async fn missing_task_is_not_marked_present_after_must_exist_panics() {
        use std::panic::{AssertUnwindSafe, catch_unwind};

        let tt = backend();
        let present = persistent(1);
        let missing = persistent(2);
        resident(&tt, present, TaskDataCategory::All);
        for _ in 0..2 {
            let mut ctx = ExecuteContext::new(tt.backend(), &tt);
            assert!(
                catch_unwind(AssertUnwindSafe(|| {
                    let _ = ctx.task_pair(present, missing, TaskDataCategory::Meta);
                }))
                .is_err()
            );
        }
        // The missing id must not become a restored task after either panic.
        assert!(
            !tt.backend()
                .storage
                .access_mut(missing)
                .flags
                .meta_restored()
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    #[cfg_attr(target_family = "wasm", ignore = "no unwinding on wasm")]
    async fn missing_batch_is_not_marked_present_after_must_exist_panics() {
        use std::panic::{AssertUnwindSafe, catch_unwind};

        let tt = backend();
        let missing = [persistent(1), persistent(2), persistent(3)];
        for _ in 0..2 {
            let mut ctx = ExecuteContext::new(tt.backend(), &tt);
            assert!(
                catch_unwind(AssertUnwindSafe(|| {
                    ctx.prepare_tasks(
                        missing.map(|id| (id, TaskDataCategory::Meta)),
                        "retry missing",
                    );
                }))
                .is_err()
            );
        }
        for id in missing {
            assert!(!tt.backend().storage.access_mut(id).flags.meta_restored());
        }
    }
}

#[cfg(test)]
mod filter_transient_tracking_tests {
    //! Test that changes to transient data inside of `filter_transient` fields does not call
    //! `track_modification`.
    //!
    //! These live here (rather than next to the schema in
    //! `storage_schema.rs`) because the tracking accessors are only implemented by
    //! [`TaskGuard`], whose fields are private to this module.
    use turbo_tasks::{CellId, TRANSIENT_TASK_BIT, TaskId, ValueTypeId};

    use super::*;
    use crate::{
        backend::{
            TaskDataCategory,
            storage::{Storage, StorageOptions},
        },
        data::{CellRef, OutputValue},
    };

    fn persistent_task(id: u32) -> TaskId {
        assert!(id & TRANSIENT_TASK_BIT == 0);
        TaskId::new(id).unwrap()
    }

    fn transient_task(id: u32) -> TaskId {
        TaskId::new(id | TRANSIENT_TASK_BIT).unwrap()
    }

    fn cell_ref(task: TaskId) -> CellRef {
        CellRef {
            task,
            cell: CellId::new(unsafe { ValueTypeId::new_unchecked(1) }, 0),
        }
    }

    /// Build a `TaskGuard` for a persistent task, fully restored and with
    /// `All` category so `check_access` passes for both data and meta fields.
    /// The guard must be dropped before `storage` (enforced by the borrow).
    fn guard_for(storage: &Storage, task_id: TaskId) -> TaskGuard<'_> {
        let mut write = storage.access_mut(task_id);
        write.flags.set_restored(TaskDataCategory::All);
        TaskGuard::new(
            write,
            task_id,
            TaskDataCategory::All,
            TaskLockCounter::new(),
        )
    }

    #[test]
    fn autoset_add_remove_only_tracks_persistent_keys() {
        let storage = Storage::new(StorageOptions::for_tests());
        let task_id = persistent_task(1);

        // `children` is an AutoSet<TaskId> meta field with filter_transient.
        {
            let mut g = guard_for(&storage, task_id);
            assert!(g.add_children(transient_task(2)));
            assert!(
                !g.meta_modified(),
                "adding a transient child must not dirty meta"
            );
            // The entry is still stored in memory.
            assert!(g.children_contains(&transient_task(2)));

            assert!(g.add_children(persistent_task(3)));
            assert!(
                g.meta_modified(),
                "adding a persistent child must dirty meta"
            );
        }

        // Fresh task: removing a transient entry must not dirty; removing a
        // persistent entry must.
        let task_id = persistent_task(10);
        {
            let mut g = guard_for(&storage, task_id);
            // Seed via the tracked accessors, then clear the flag so the removal
            // assertions below start from a clean state. (`children_mut` is not
            // accessible cross-module, so we can't seed untracked here.)
            assert!(g.add_children(transient_task(11)));
            assert!(g.add_children(persistent_task(12)));
            g.task.flags.set_meta_modified(false);
            assert!(!g.meta_modified());

            assert!(g.remove_children(&transient_task(11)));
            assert!(
                !g.meta_modified(),
                "removing a transient child must not dirty meta"
            );

            assert!(g.remove_children(&persistent_task(12)));
            assert!(
                g.meta_modified(),
                "removing a persistent child must dirty meta"
            );
        }
    }

    #[test]
    fn autoset_extend_tracks_iff_any_persistent() {
        let storage = Storage::new(StorageOptions::for_tests());

        // Extend with only transient children: no meta modification.
        let task_id = persistent_task(1);
        {
            let mut g = guard_for(&storage, task_id);
            g.extend_children([transient_task(2), transient_task(3)]);
            assert!(g.children_contains(&transient_task(2)));
            assert!(
                !g.meta_modified(),
                "extending with only transient children must not dirty meta"
            );
        }

        // Extend with a mix: meta modification.
        let task_id = persistent_task(10);
        {
            let mut g = guard_for(&storage, task_id);
            g.extend_children([transient_task(11), persistent_task(12)]);
            assert!(
                g.meta_modified(),
                "extending with at least one persistent child must dirty meta"
            );
        }
    }

    #[test]
    fn countermap_update_count_only_tracks_persistent_keys() {
        let storage = Storage::new(StorageOptions::for_tests());
        let task_id = persistent_task(1);

        // `upper` is a CounterMap<TaskId> meta field with filter_transient.
        {
            let mut g = guard_for(&storage, task_id);
            let _ = g.update_upper_count(transient_task(2), 1);
            assert!(
                !g.meta_modified(),
                "bumping a transient upper must not dirty meta"
            );
            assert_eq!(g.get_upper(&transient_task(2)), Some(&1));

            let _ = g.update_upper_count(persistent_task(3), 1);
            assert!(
                g.meta_modified(),
                "bumping a persistent upper must dirty meta"
            );
        }
    }

    #[test]
    fn countermap_update_counts_batch_tracks_iff_any_persistent() {
        let storage = Storage::new(StorageOptions::for_tests());

        // followers: CounterMap<TaskId>, filter_transient, has update_counts.
        let task_id = persistent_task(1);
        {
            let mut g = guard_for(&storage, task_id);
            g.update_followers_counts([transient_task(2), transient_task(3)].into_iter(), 1);
            assert!(
                !g.meta_modified(),
                "batch of only transient followers must not dirty meta"
            );
        }

        let task_id = persistent_task(10);
        {
            let mut g = guard_for(&storage, task_id);
            g.update_followers_counts([transient_task(11), persistent_task(12)].into_iter(), 1);
            assert!(
                g.meta_modified(),
                "batch with a persistent follower must dirty meta"
            );
        }
    }

    #[test]
    fn direct_option_set_take_tracks_by_value_transience() {
        let storage = Storage::new(StorageOptions::for_tests());

        // `output` is a direct Option<OutputValue> meta field with filter_transient.
        // Setting a transient output: no meta modification.
        let task_id = persistent_task(1);
        {
            let mut g = guard_for(&storage, task_id);
            g.set_output(OutputValue::Output(transient_task(2)));
            assert!(
                !g.meta_modified(),
                "setting a transient output must not dirty meta"
            );
            assert!(g.get_output().is_some());
            // Taking a transient output: still no meta modification.
            assert!(g.take_output().is_some());
            assert!(
                !g.meta_modified(),
                "taking a transient output must not dirty meta"
            );
        }

        // Setting a persistent output: meta modification.
        let task_id = persistent_task(10);
        {
            let mut g = guard_for(&storage, task_id);
            g.set_output(OutputValue::Output(persistent_task(11)));
            assert!(
                g.meta_modified(),
                "setting a persistent output must dirty meta"
            );
        }

        // Taking a persistent output dirties meta (seed untracked first).
        let task_id = persistent_task(20);
        {
            let mut g = guard_for(&storage, task_id);
            g.typed_mut()
                .set_output(OutputValue::Cell(cell_ref(persistent_task(21))));
            assert!(!g.meta_modified());
            assert!(g.take_output().is_some());
            assert!(
                g.meta_modified(),
                "taking a persistent output must dirty meta"
            );
        }

        // REPLACE persistent -> transient must dirty meta: the old persistent
        // value was in the snapshot and is being removed, so the persisted form
        // changes even though the new value is transient. (Seed the persistent
        // value untracked, clear the flag, then replace.)
        let task_id = persistent_task(30);
        {
            let mut g = guard_for(&storage, task_id);
            g.typed_mut()
                .set_output(OutputValue::Output(persistent_task(31)));
            g.task.flags.set_meta_modified(false);
            assert!(!g.meta_modified());

            g.set_output(OutputValue::Output(transient_task(32)));
            assert!(
                g.meta_modified(),
                "replacing a persistent output with a transient one must dirty meta"
            );
        }

        // REPLACE transient -> transient must NOT dirty meta (neither value
        // persists).
        let task_id = persistent_task(40);
        {
            let mut g = guard_for(&storage, task_id);
            g.set_output(OutputValue::Output(transient_task(41)));
            assert!(!g.meta_modified());
            g.set_output(OutputValue::Output(transient_task(42)));
            assert!(
                !g.meta_modified(),
                "replacing one transient output with another must not dirty meta"
            );
        }
    }
}

#[cfg(test)]
mod cell_data_tracking_tests {
    //! `cell_data` writes track a Data modification only when the cell's value
    //! type persists something.
    use turbo_bincode::TurboBincodeBuffer;
    use turbo_tasks::{
        self as turbo_tasks, CellId, TRANSIENT_TASK_BIT, TaskId, ValueTypePersistence, VcValueType,
        registry,
    };

    use super::*;
    use crate::{
        backend::{
            TaskDataCategory,
            snapshot_coordinator::SnapshotCoordinator,
            storage::{Storage, StorageOptions, encode_snapshot_item, encode_task_contents},
            storage_schema::TaskStorageAccessors,
        },
        backing_storage::SnapshotItem,
    };

    #[turbo_tasks::value]
    struct PersistableV(#[allow(dead_code)] u32);

    #[turbo_tasks::value(eq = "manual")]
    struct InteriorMutableV {
        #[bincode(with = "turbo_tasks::parking_lot_mutex_bincode")]
        #[turbo_tasks(debug_ignore)]
        value: parking_lot::Mutex<u32>,
    }

    impl PartialEq for InteriorMutableV {
        fn eq(&self, _other: &Self) -> bool {
            false
        }
    }

    impl Eq for InteriorMutableV {}

    #[turbo_tasks::value(serialization = "skip")]
    struct SkipCheapV(#[allow(dead_code)] u32);

    #[turbo_tasks::value(serialization = "skip", evict = "never", cell = "new", eq = "manual")]
    struct SkipNeverV;

    #[turbo_tasks::value(serialization = "hash")]
    struct HashOnlyV(#[allow(dead_code)] u32);

    fn persistent_task(id: u32) -> TaskId {
        assert!(id & TRANSIENT_TASK_BIT == 0);
        TaskId::new(id).unwrap()
    }

    fn cell_of<V: VcValueType>(index: u32) -> CellId {
        CellId::new(V::get_value_type_id(), index)
    }

    fn persistence_of(cell: &CellId) -> &'static ValueTypePersistence {
        &registry::get_value_type(cell.type_id()).persistence
    }

    fn dummy_ref() -> SharedReference {
        SharedReference::new(triomphe::Arc::new(0u32))
    }

    fn guard_for(storage: &Storage, task_id: TaskId) -> TaskGuard<'_> {
        let mut write = storage.access_mut(task_id);
        write.flags.set_restored(TaskDataCategory::All);
        TaskGuard::new(
            write,
            task_id,
            TaskDataCategory::All,
            TaskLockCounter::new(),
        )
    }

    #[test]
    fn insert_tracks_only_for_persistable() {
        // Only `Persistable` cells reach the data snapshot, so only they dirty
        // the task. `Skip` and `HashOnly` values are dropped by `CellData::encode`
        // (HashOnly persists via the separate `cell_data_hash` field) — but both
        // are still stored in memory. Tracking is monotonic: a later persistable
        // write flips the flag even after skipped writes left it clean.
        let storage = Storage::new(StorageOptions::for_tests());
        let mut g = guard_for(&storage, persistent_task(1));

        let skip = cell_of::<SkipCheapV>(0);
        g.insert_cell_data(skip, dummy_ref(), persistence_of(&skip));
        assert!(!g.data_modified(), "Skip write must not dirty data");
        assert!(g.cell_data_contains(&skip), "Skip value still in memory");

        let hash_only = cell_of::<HashOnlyV>(0);
        g.insert_cell_data(hash_only, dummy_ref(), persistence_of(&hash_only));
        assert!(!g.data_modified(), "HashOnly write must not dirty data");
        assert!(g.cell_data_contains(&hash_only));

        let persistable = cell_of::<PersistableV>(0);
        g.insert_cell_data(persistable, dummy_ref(), persistence_of(&persistable));
        assert!(
            g.data_modified(),
            "Persistable write dirties data (monotonic: flips even after skipped writes)"
        );
    }

    #[test]
    fn remove_tracks_only_for_persistable() {
        let storage = Storage::new(StorageOptions::for_tests());
        let skip = cell_of::<SkipCheapV>(0);
        let persistable = cell_of::<PersistableV>(0);

        // Removing a Skip cell: no tracking.
        let mut g = guard_for(&storage, persistent_task(1));
        g.insert_cell_data(skip, dummy_ref(), persistence_of(&skip));
        assert!(!g.data_modified());
        assert!(g.remove_cell_data(&skip, persistence_of(&skip)).is_some());
        assert!(
            !g.data_modified(),
            "removing a Skip cell must not dirty data"
        );

        // Removing a Persistable cell: tracks. Seed via the tracking-free
        // TaskStorage accessor so the removal is the only tracked mutation.
        let mut g = guard_for(&storage, persistent_task(2));
        g.typed_mut()
            .cell_data_mut()
            .insert(persistable, dummy_ref());
        assert!(!g.data_modified());
        assert!(
            g.remove_cell_data(&persistable, persistence_of(&persistable))
                .is_some()
        );
        assert!(
            g.data_modified(),
            "removing a Persistable cell must dirty data"
        );
    }

    // `evict_after_snapshot` uses `parallel::for_each`/`map_collect`, which call
    // `block_in_place` internally and require a multi-threaded Tokio runtime.
    #[tokio::test(flavor = "multi_thread")]
    async fn skip_never_cell_survives_eviction_without_modified_flag() {
        // A Skip + evict="never" cell must be retained in memory by
        // `drop_partial` (which keys on Evictability, not the modified flag), so
        // a task that only wrote such a cell is both evictable-clean AND keeps the
        // value. This is the core safety property of not tracking Skip writes.
        let storage = Storage::new(StorageOptions::for_tests());
        let task_id = persistent_task(1);
        let cell = cell_of::<SkipNeverV>(0);

        {
            let mut g = guard_for(&storage, task_id);
            g.insert_cell_data(cell, dummy_ref(), persistence_of(&cell));
            assert!(
                !g.data_modified(),
                "a Skip cell write must leave the task clean for the snapshot"
            );
        }

        // Run the post-snapshot eviction sweep: the task is clean (not modified),
        // so data is eligible to drop, but the Skip+never value is retained as
        // residue. The entry stays in the map with the value still present.
        storage.evict_after_snapshot(None);

        let g = guard_for(&storage, task_id);
        assert!(
            g.cell_data_contains(&cell),
            "Skip + evict=never cell must survive eviction even though the task was never modified"
        );
    }

    /// Regression test for copy-on-write snapshots with interior-mutable cell contents.
    ///
    /// Cloning `TaskStorage` only clones the cell's `SharedReference` pointer, so a mutation
    /// through the shared value would also change the supposedly frozen snapshot copy. The
    /// pre-mutation state must instead be encoded when the task is modified during a snapshot.
    #[tokio::test(flavor = "multi_thread")]
    async fn modify_during_snapshot_encodes_interior_mutable_cell_contents() {
        let storage = Storage::new(StorageOptions::for_tests());
        let task_id = persistent_task(1);
        let cell = cell_of::<InteriorMutableV>(0);
        let value = SharedReference::new(triomphe::Arc::new(InteriorMutableV {
            value: parking_lot::Mutex::new(1),
        }));

        {
            let mut g = guard_for(&storage, task_id);
            g.insert_cell_data(cell, value.clone(), persistence_of(&cell));
            assert!(g.data_modified());
        }

        let expected = {
            let task = storage.access_mut(task_id);
            encode_task_contents(
                task_id,
                &task,
                SpecificTaskDataCategory::Data,
                &mut TurboBincodeBuffer::new(),
            )
            .unwrap()
        };

        let snapshot_guard = storage.start_snapshot();
        let process =
            |_: TaskId,
             _: &TaskStorage,
             _: TaskDataCategory,
             _: &mut TurboBincodeBuffer|
             -> SnapshotItem { panic!("the pre-encoded snapshot item must be used") };
        let coordinator = SnapshotCoordinator::new();
        let phase = coordinator.try_begin_snapshot().unwrap();
        let shards = storage.take_snapshot(&phase, snapshot_guard, &process, &|_| {}, false);
        drop(phase);

        {
            let mut g = guard_for(&storage, task_id);
            let _ = g.track_modification(SpecificTaskDataCategory::Data, "test");
            *value
                .downcast_ref::<InteriorMutableV>()
                .unwrap()
                .value
                .lock() = 2;
        }

        let items: Vec<_> = shards.into_iter().flatten().collect();
        assert_eq!(items.len(), 1);
        let SnapshotItem::Put { data, .. } = &items[0] else {
            panic!("expected a Put item");
        };
        assert_eq!(data.as_deref(), Some(&expected[..]));

        let live = {
            let task = storage.access_mut(task_id);
            encode_task_contents(
                task_id,
                &task,
                SpecificTaskDataCategory::Data,
                &mut TurboBincodeBuffer::new(),
            )
            .unwrap()
        };
        assert_ne!(live, expected, "the shared cell value really changed");
    }

    /// Regression test: a task that is part of the snapshot through one category must be copied
    /// on its first modification during the snapshot, even when that modification touches a
    /// category that isn't part of the snapshot.
    ///
    /// Meta is modified before the snapshot, data is clean. During the snapshot, data is modified
    /// first and then meta. The data modification must copy the captured meta, even though data
    /// itself wasn't captured; otherwise the snapshot would persist the already mutated meta.
    #[tokio::test(flavor = "multi_thread")]
    async fn modify_other_category_first_during_snapshot_preserves_snapshot_meta() {
        let storage = Storage::new(StorageOptions::for_tests());
        let task_id = persistent_task(1);
        {
            let mut g = guard_for(&storage, task_id);
            let _ = g.track_modification(SpecificTaskDataCategory::Meta, "test");
            assert!(!g.data_modified());
        }
        let expected_meta = {
            let task = storage.access_mut(task_id);
            encode_task_contents(
                task_id,
                &task,
                SpecificTaskDataCategory::Meta,
                &mut TurboBincodeBuffer::new(),
            )
            .unwrap()
        };

        let snapshot_guard = storage.start_snapshot();
        // Encodes the live state, like the backend does for tasks that weren't copied.
        let process = |task_id: TaskId,
                       task: &TaskStorage,
                       category: TaskDataCategory,
                       buffer: &mut TurboBincodeBuffer| {
            encode_snapshot_item(task_id, task, category, buffer).unwrap()
        };
        let coordinator = SnapshotCoordinator::new();
        let phase = coordinator.try_begin_snapshot().unwrap();
        let shards = storage.take_snapshot(&phase, snapshot_guard, &process, &|_| {}, false);
        drop(phase);

        {
            let mut g = guard_for(&storage, task_id);
            let cell = cell_of::<PersistableV>(0);
            g.insert_cell_data(cell, dummy_ref(), persistence_of(&cell));
            assert!(g.add_children(persistent_task(2)));
        }

        let items: Vec<_> = shards.into_iter().flatten().collect();
        assert_eq!(items.len(), 1);
        let SnapshotItem::Put { meta, data, .. } = &items[0] else {
            panic!("expected a Put item");
        };
        assert_eq!(
            meta.as_deref(),
            Some(&expected_meta[..]),
            "the snapshot must persist the meta from before the snapshot"
        );
        assert!(data.is_none(), "data wasn't modified before the snapshot");

        // Both modifications made during the snapshot are left for the next snapshot.
        let task = storage.access_mut(task_id);
        assert!(task.flags.meta_modified());
        assert!(task.flags.data_modified());
        assert!(!task.flags.any_snapshot_pending());
    }

    /// A pre-encoded (copy-on-write) item carries the cache size stats of the state it encoded,
    /// not the live state after the mutation that triggered the copy.
    #[cfg(feature = "print_cache_item_size")]
    #[tokio::test(flavor = "multi_thread")]
    async fn pre_encoded_item_carries_stats_captured_at_copy_time() {
        let storage = Storage::new(StorageOptions::for_tests());
        let task_id = persistent_task(1);
        {
            let mut g = guard_for(&storage, task_id);
            let _ = g.track_modification(SpecificTaskDataCategory::Meta, "test");
        }

        let (snapshot_guard, _) = storage.start_snapshot();
        let process =
            |_: TaskId,
             _: &TaskStorage,
             _: TaskDataCategory,
             _: &mut TurboBincodeBuffer|
             -> SnapshotItem { panic!("the pre-encoded snapshot item must be used") };
        let coordinator = SnapshotCoordinator::new();
        let phase = coordinator.try_begin_snapshot().unwrap();
        let shards = storage.take_snapshot(&phase, snapshot_guard, &process, &|_| {}, false);
        drop(phase);

        // The tracked add copies the task (no children yet) before inserting the child.
        {
            let mut g = guard_for(&storage, task_id);
            assert!(g.add_children(persistent_task(2)));
        }

        let items: Vec<_> = shards.into_iter().flatten().collect();
        assert_eq!(items.len(), 1);
        let SnapshotItem::Put { stats, .. } = &items[0] else {
            panic!("expected a Put item");
        };
        assert_eq!(stats.counts.children, 0);
        assert_eq!(storage.access_mut(task_id).meta_counts().children, 1);
    }
}
