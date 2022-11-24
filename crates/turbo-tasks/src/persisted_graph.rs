use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::{
    backend::{CellContent, PersistentTaskType},
    CellId, RawVc, TaskId,
};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum TaskCell {
    Content(CellContent),
    NeedComputation,
}

impl Default for TaskCell {
    fn default() -> Self {
        TaskCell::Content(CellContent(None))
    }
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TaskData {
    pub children: Vec<TaskId>,
    pub dependencies: Vec<RawVc>,
    pub cells: Vec<(CellId, TaskCell)>,
    pub output: RawVc,
}
pub struct ReadTaskState {
    pub clean: bool,
    pub keeps_external_active: bool,
}

pub struct PersistTaskState {
    pub externally_active: bool,
}

/*

There are 4 kinds of task:

(A) A task that exists only in memory.
(B) A task that exists in persistent graph and in memory (either "store" or "read" has been called)
(C) A task that exists only in persistent graph.

Parent-child relationships:

(A) as child: active_parents is tracked only in memory.
(B) as child: active_parents is tracked in memory and either as internal_active_parents or external_active_parents in the persisted graph.
(C) as child: either as internal_active_parents or external_active_parents in the persisted graph.

(A) as parent: It will use external_active_parents for (B) or (C) as child.
               update_active_parents() is used to modify the external_active_parents count.
(B) as parent: It will use internal_active_parents for (B) or (C) as child.
               compute_active() returns the changes needed for (A) or (C) as child
(C) as parent: It will use internal_active_parents for (B) or (C) as child.
               compute_active() returns the changes needed for (A) or (C) as child

(A) as child of (B) or (C): active count tracked as external_active_children, have task ids assigned in persistent graph

*/

#[derive(Debug)]
pub struct ActivateResult {
    /// Keeps the external version of the task active
    pub keeps_external_active: bool,

    /// Task doesn't live in the persisted graph but
    /// should be track externally
    pub external: bool,

    /// Task is dirty and need to be scheduled for execution
    pub dirty: bool,

    /// Further tasks that need to be activated that
    /// didn't fit into that batch
    pub more_tasks_to_activate: Vec<TaskId>,
}

#[derive(Debug)]
pub struct PersistResult {
    /// Tasks that need to be activated
    pub tasks_to_activate: Vec<TaskId>,

    /// Tasks that need to be deactivated
    pub tasks_to_deactivate: Vec<TaskId>,
}

#[derive(Debug)]
pub struct DeactivateResult {
    /// Further tasks that need to be deactivated that
    /// didn't fit into that batch
    pub more_tasks_to_deactivate: Vec<TaskId>,
}

pub trait PersistedGraph: Sync + Send {
    /// read task data and state for a specific task.
    fn read(
        &self,
        task: TaskId,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<(TaskData, ReadTaskState)>>;

    /// lookup all cache entries for a partial task type
    /// returns true if all cache entries has been initialized
    /// returns false if that were too many
    fn lookup(
        &self,
        partial_task_type: &PersistentTaskType,
        api: &dyn PersistedGraphApi,
    ) -> Result<bool>;

    /// lookup one cache entry
    fn lookup_one(
        &self,
        task_type: &PersistentTaskType,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<TaskId>>;

    /// checks if a task is persisted
    fn is_persisted(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<bool>;

    /// store a completed task into the persisted graph
    /// together with dependencies, children and cells.
    /// Returns false, if the task failed to persist.
    fn persist(
        &self,
        task: TaskId,
        data: TaskData,
        state: PersistTaskState,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<PersistResult>>;

    /// Activate a task in the persisted graph when active_parents > 0 or it's
    /// externally kept alive.
    fn activate_when_needed(
        &self,
        task: TaskId,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<ActivateResult>>;

    /// Deactivate a task in the persisted graph when active_parents == 0 and
    /// it's not externally kept alive.
    fn deactivate_when_needed(
        &self,
        task: TaskId,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<DeactivateResult>>;

    /// Marks a task as kept alive by the consumer graph
    /// (usually from memory to persisted graph)
    /// Returns true when activate_when_needed should be called soonish
    fn set_externally_active(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<bool>;

    /// No longer marks a task as kept alive by the consumer graph
    /// (usually from memory to persisted graph)
    /// Returns true when deactivate_when_needed should be called soonish
    fn unset_externally_active(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<bool>;

    /// Removes all external keep alives that were not renewed this round.
    /// This is usually called after the initial build has finished and all
    /// external keep alives has been renewed.
    fn remove_outdated_externally_active(&self, api: &dyn PersistedGraphApi)
        -> Result<Vec<TaskId>>;

    /// update the dirty flag for a stored task
    /// Returns true, when the task is active and should be scheduled
    fn make_dirty(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<bool>;

    /// update the dirty flag for a stored task
    fn make_clean(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<()>;

    /// make all tasks that depend on that vc dirty and
    /// return a list of active tasks that should be scheduled
    fn make_dependent_dirty(&self, vc: RawVc, api: &dyn PersistedGraphApi) -> Result<Vec<TaskId>>;

    /// Get all tasks that are active, but not persisted.
    /// This is usually called at beginning to create and schedule
    /// tasks that are missing in the persisted graph
    fn get_active_external_tasks(&self, api: &dyn PersistedGraphApi) -> Result<Vec<TaskId>>;

    /// Get all tasks that are dirty and active.
    /// This is usually called at the beginning to schedule these tasks.
    fn get_dirty_active_tasks(&self, api: &dyn PersistedGraphApi) -> Result<Vec<TaskId>>;

    /// Get tasks that have active update pending that need to be continued
    /// returns (tasks_to_activate, tasks_to_deactivate)
    fn get_pending_active_update(
        &self,
        api: &dyn PersistedGraphApi,
    ) -> Result<(Vec<TaskId>, Vec<TaskId>)>;

    /// Stop operations
    #[allow(unused_variables)]
    fn stop(&self, api: &dyn PersistedGraphApi) -> Result<()> {
        Ok(())
    }
}

pub trait PersistedGraphApi {
    fn get_or_create_task_type(&self, ty: PersistentTaskType) -> TaskId;

    fn lookup_task_type(&self, id: TaskId) -> &PersistentTaskType;
}

/*

read:

  data: (TaskId) => (TaskData)
  cache: (PersistentTaskType) => (TaskId)
  type: (TaskId) => (PersistentTaskType)

read_dependents:

  dependents: (RawVc) => [TaskId]

store:

  external_active_parents: (TaskId) -> (usize)
  internal_active_parents: (TaskId) -> (usize)
  inactive_tasks: [TaskId]

B+C?




*/

impl PersistedGraph for () {
    fn read(
        &self,
        _task: TaskId,
        _api: &dyn PersistedGraphApi,
    ) -> Result<Option<(TaskData, ReadTaskState)>> {
        Ok(None)
    }

    fn lookup(
        &self,
        _partial_task_type: &PersistentTaskType,
        _api: &dyn PersistedGraphApi,
    ) -> Result<bool> {
        Ok(false)
    }

    fn lookup_one(
        &self,
        _task_type: &PersistentTaskType,
        _api: &dyn PersistedGraphApi,
    ) -> Result<Option<TaskId>> {
        Ok(None)
    }

    fn is_persisted(&self, _task: TaskId, _api: &dyn PersistedGraphApi) -> Result<bool> {
        Ok(false)
    }

    fn persist(
        &self,
        _task: TaskId,
        _data: TaskData,
        _state: PersistTaskState,
        _api: &dyn PersistedGraphApi,
    ) -> Result<Option<PersistResult>> {
        Ok(None)
    }

    fn activate_when_needed(
        &self,
        _task: TaskId,
        _api: &dyn PersistedGraphApi,
    ) -> Result<Option<ActivateResult>> {
        Ok(None)
    }

    fn deactivate_when_needed(
        &self,
        _task: TaskId,
        _api: &dyn PersistedGraphApi,
    ) -> Result<Option<DeactivateResult>> {
        Ok(None)
    }

    fn set_externally_active(&self, _task: TaskId, _api: &dyn PersistedGraphApi) -> Result<bool> {
        Ok(false)
    }

    fn unset_externally_active(&self, _task: TaskId, _api: &dyn PersistedGraphApi) -> Result<bool> {
        Ok(false)
    }

    fn remove_outdated_externally_active(
        &self,
        _api: &dyn PersistedGraphApi,
    ) -> Result<Vec<TaskId>> {
        Ok(Vec::new())
    }

    fn make_dirty(&self, _task: TaskId, _api: &dyn PersistedGraphApi) -> Result<bool> {
        Ok(false)
    }

    fn make_clean(&self, _task: TaskId, _api: &dyn PersistedGraphApi) -> Result<()> {
        Ok(())
    }

    fn make_dependent_dirty(
        &self,
        _vc: RawVc,
        _api: &dyn PersistedGraphApi,
    ) -> Result<Vec<TaskId>> {
        Ok(Vec::new())
    }

    fn get_active_external_tasks(&self, _api: &dyn PersistedGraphApi) -> Result<Vec<TaskId>> {
        Ok(Vec::new())
    }

    fn get_dirty_active_tasks(&self, _api: &dyn PersistedGraphApi) -> Result<Vec<TaskId>> {
        Ok(Vec::new())
    }

    fn get_pending_active_update(
        &self,
        _api: &dyn PersistedGraphApi,
    ) -> Result<(Vec<TaskId>, Vec<TaskId>)> {
        Ok((Vec::new(), Vec::new()))
    }
}
