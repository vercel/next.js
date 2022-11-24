use std::fmt::Debug;

use serde::{Deserialize, Serialize};
use turbo_tasks::{
    backend::PersistentTaskType, without_task_id_mapping, RawVc, SharedReference, TaskId,
};

use crate::{
    sortable_index::SortableIndex,
    table::{database, table},
};

#[derive(Serialize, Deserialize)]
pub struct SessionKey {
    key: Vec<u8>,
}

impl SessionKey {
    pub fn new(key: Vec<u8>) -> Self {
        Self { key }
    }
}

impl Debug for SessionKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("SessionKey(")?;
        for byte in self.key.iter() {
            write!(f, "{byte:x}")?
        }
        f.write_str(")")
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum TaskOutput {
    Result(RawVc),
    Error(String),
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum TaskFreshness {
    Dirty,
    Clean,
    PreparedForClean,
}

impl Default for TaskFreshness {
    fn default() -> Self {
        TaskFreshness::Dirty
    }
}

impl TaskFreshness {
    fn merge(self, clean: bool) -> TaskFreshness {
        match (self, clean) {
            (TaskFreshness::Dirty, true) => TaskFreshness::Dirty,
            (TaskFreshness::Dirty, false) => TaskFreshness::Dirty,
            (TaskFreshness::Clean, true) => TaskFreshness::Clean,
            (TaskFreshness::Clean, false) => TaskFreshness::Dirty,
            (TaskFreshness::PreparedForClean, true) => TaskFreshness::Clean,
            (TaskFreshness::PreparedForClean, false) => TaskFreshness::Dirty,
        }
    }
}

// General:
// Data is split into global information and session specific information.
// For each different user intent type, a different session is used.
// e. g. `next dev` and `next build` would have different sessions, but
// multiple calls to `next dev` would use the same session.
// The activeness of tasks is stored session specific, so we don't need to
// switch active flags of many tasks when switching between sessions.
// We never want to update something in all session, since there could be
// a lot session.
// So a generation system is used to allow iterating over all tasks that have
// changed since the last usage of a sesssion. When opening a session we will
// bring the session up-to-date, when there were operations in other session
// in between.
// The global generation is increased when the first write operation happens
// after the database is opened.

// This stores the type and inputs of a task and maps it to a task id.
// Can't be changed.
table!(task_cache, (PersistentTaskType) <=> (TaskId), prefix(full));

table!(next_task_id, (usize), merge((usize): |a: usize, b| a + b, |a, b| a + b));

// This stores the data in the graph.
// It might be None when the cell content was not serializable.
// It might be unset when the cell is empty.
// In this case we need to re-execute the task before we can read the content
// When changed to dirty, `task_dependencies` need to be processed
table!(task_cell, (TaskId, usize) => (Option<SharedReference>), prefix(full));
// This stores the next free cell for a task
table!(task_next_cell, (TaskId) => (usize), prefix(full));

// This stores the return value of a task and it's dirty state.
// When changed to dirty, `task_dependencies` need to be processed
// When updated the generation of the task need to be updated
// When updating this to dirty, clear `task_dependencies` for that task and
// schedule the task when active in this session
table!(task_state, (TaskId) => (TaskFreshness, Option<TaskOutput>), merge(
    (bool):
    |v: (TaskFreshness, Option<TaskOutput>), m| (v.0.merge(m), v.1),
    |m1, m2| m1 && m2,
    without_task_id_mapping
), prefix(full));

// This stores the dependencies of a task.
// When processing this from a RawVc, flag all listed tasks as dirty.
table!(task_dependencies, [TaskId] <=> [RawVc], prefix(u8));

// This stores to list of child tasks for each task
// When updated the generation of the task need to be updated
table!(task_children, (TaskId) => [TaskId], prefix(u8));

// This stores tasks sorted by generation.
// This allows to iterate over all tasks that have been changed
// since a certain generation.
// See also global `generation`
// The only operation is to update a Task to the current generation
// this operation is idempotent, so we need no syncronization on
// this.
table!(task_generations, (SortableIndex) <=> [TaskId], prefix(u8));

// This stores the current generation of a session.
// Only written during startup, so we need no sync.
table!(session_generation, (SessionKey) => (u64), prefix(full));
// This stores the tasks that are current scheduled.
// When restoring a session they need to be rescheduled.
table!(session_scheduled_tasks, (SessionKey) => [TaskId], prefix(u32, read_u32, write_u32));
// This stores the tasks that were children of the root tasks.
// This is stored because it had affected `session_active_parents`
// and these counts need to be removed again when the root task
// has finished executing.
table!(session_transient_task_children, (SessionKey) => [TaskId], prefix(u32, read_u32, write_u32));
// This stores a snapshot of `task_children` at last point that was
// processed by this sesssion.
// When bringing the session up-to-date we can compare that with
// `task_children` to get the change and update `session_active_parents`.
// Access to this need to be synced with "session_task_active".
table!(session_task_children, (SessionKey, TaskId) => [TaskId], prefix(u32, read_u32, write_u32));
// This stores the number of active parents of a task in a session.
// When this reaches 0 or become non-zero we need to update
// `session_task_active` eventually. This is queued in
// `session_ongoing_active_update`. We only use merge operations to update this
// in an atomic way, so we don't need to sync access to it.
table!(session_active_parents, (SessionKey, TaskId) => (usize), merge(
    (i32):
    |v: usize, m: i32| if m < 0 { v.saturating_sub(-m as usize) } else { v + (m as usize) },
    |m1, m2| m1 + m2,
    without_task_id_mapping
), prefix(u32, read_u32, write_u32));
// This stores if a task is active or not.
// Changing this need to be propagated onto `session_active_parents` for all
// children (`task_children`).
// When this is set the task is scheduled and `session_scheduled_tasks`
// is also updated.
// Access to this need to be synced.
table!(session_task_active, (SessionKey) => [TaskId], prefix(u32, read_u32, write_u32));
// This stores for which tasks the active state need to be revalidated
// on restart. It's only read on startup, but kept up to date with the
// in memory queue of operations.
// It's not read during normal operation so this doesn't need to be synced.
table!(session_ongoing_active_update, (SessionKey) => [TaskId], prefix(u32, read_u32, write_u32));

// This stores the latest generation of the database.
// It's only written during startup.
table!(generation, (u64));

database!(
    task_cache,
    next_task_id,
    task_cell,
    task_state,
    task_next_cell,
    task_dependencies,
    task_children,
    task_generations,
    session_generation,
    session_scheduled_tasks,
    session_transient_task_children,
    session_task_children,
    session_active_parents,
    session_task_active,
    session_ongoing_active_update,
    generation
);
