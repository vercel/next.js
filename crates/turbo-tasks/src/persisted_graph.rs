use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::{
    backend::{PersistentTaskType, SlotContent, SlotMappings},
    RawVc, TaskId,
};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum TaskSlot {
    Content(SlotContent),
    NeedComputation,
}

impl Default for TaskSlot {
    fn default() -> Self {
        TaskSlot::Content(SlotContent(None))
    }
}

#[derive(Serialize, Deserialize)]
pub struct TaskData {
    pub children: Vec<TaskId>,
    pub dependencies: Vec<RawVc>,
    pub slots: Vec<TaskSlot>,
    pub slot_mappings: Option<SlotMappings>,
    pub output: RawVc,
}
pub struct ReadTaskState {
    pub clean: bool,
    pub external_incoming: u32,
}

pub struct PersistTaskState {
    pub clean: bool,
    pub external_active_parents: u32,
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
    pub increased_external_outgoing: Vec<(TaskId, u32)>,

    /// Further tasks that need to be activated that
    /// didn't fit into that batch
    pub more_tasks_to_activate: Vec<TaskId>,

    /// Task is dirty and need to be scheduled for execution
    pub dirty: bool,
}

#[derive(Debug)]
pub struct DeactivateResult {
    pub decreased_external_outgoing: Vec<(TaskId, u32)>,

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
    /// together with dependencies, children and slots.
    /// Assumes children are already tracked as active_parents
    /// when the task is active.
    /// Removes "external incoming" for all children that are
    /// in the persisted graph.
    /// Before: external_active_parents = "external outgoing" + "memory only
    /// parents" "memory only parents" should become "external incoming"
    /// "external outgoing" should become "internal active parents"
    /// So: active_parents = external_active_parents
    /// external_incoming = external_active_parents - external_outgoing
    /// external_outgoing = 0
    /// Returns false, if the task failed to persist.
    fn persist(
        &self,
        task: TaskId,
        data: TaskData,
        state: PersistTaskState,
        api: &dyn PersistedGraphApi,
    ) -> Result<bool>;

    /// Activate a task in the persisted graph when active_parents > 0.
    #[must_use]
    fn activate_when_needed(
        &self,
        task: TaskId,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<ActivateResult>>;

    /// Deactivate a task in the persisted graph when active_parents == 0.
    #[must_use]
    fn deactivate_when_needed(
        &self,
        task: TaskId,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<DeactivateResult>>;

    /// Increase the parent count due to an external parent.
    /// Also tracks the count as "external incoming".
    /// Returns true, when activate_when_needed should be called soonish.
    #[must_use]
    fn add_external_incoming(
        &self,
        task: TaskId,
        by: u32,
        api: &dyn PersistedGraphApi,
    ) -> Result<bool>;

    /// Decrease the parent count due to an external parent.
    /// Also removes the "external incoming" tracking for that count.
    /// Returns true, when deactivate_when_needed should be called soonish.
    #[must_use]
    fn remove_external_incoming(
        &self,
        task: TaskId,
        by: u32,
        api: &dyn PersistedGraphApi,
    ) -> Result<bool>;

    /// update the dirty flag for a stored task
    /// Returns true, when the task is active and should be scheduled
    #[must_use]
    fn make_dirty(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<bool>;

    /// update the dirty flag for a stored task
    #[must_use]
    fn make_clean(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<()>;

    /// make all tasks that depend on that vc dirty and
    /// return a list of active tasks that should be scheduled
    #[must_use]
    fn make_dependent_dirty(&self, vc: RawVc, api: &dyn PersistedGraphApi) -> Result<Vec<TaskId>>;

    /// Removes outdated external incoming counts.
    /// Returns the tasks for which deactivate_when_needed should be called
    /// soonish.
    #[must_use]
    fn remove_outdated_external_incoming(&self, api: &dyn PersistedGraphApi)
        -> Result<Vec<TaskId>>;

    /// Get all external task which are held active by the persistent graph.
    /// Returns tasks and the count of "external outgoing"
    #[must_use]
    fn get_external_outgoing(&self, api: &dyn PersistedGraphApi) -> Result<Vec<(TaskId, usize)>>;

    /// Get all tasks that are dirty and active.
    /// They should probably be scheduled
    #[must_use]
    fn get_dirty_active_tasks(&self, api: &dyn PersistedGraphApi) -> Result<Vec<TaskId>>;
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
        task: TaskId,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<(TaskData, ReadTaskState)>> {
        Ok(None)
    }

    fn lookup(
        &self,
        partial_task_type: &PersistentTaskType,
        api: &dyn PersistedGraphApi,
    ) -> Result<bool> {
        Ok(false)
    }

    fn lookup_one(
        &self,
        task_type: &PersistentTaskType,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<TaskId>> {
        Ok(None)
    }

    fn is_persisted(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<bool> {
        Ok(false)
    }

    fn persist(
        &self,
        task: TaskId,
        data: TaskData,
        state: PersistTaskState,
        api: &dyn PersistedGraphApi,
    ) -> Result<bool> {
        Ok(false)
    }

    fn activate_when_needed(
        &self,
        task: TaskId,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<ActivateResult>> {
        Ok(None)
    }

    fn deactivate_when_needed(
        &self,
        task: TaskId,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<DeactivateResult>> {
        Ok(None)
    }

    fn add_external_incoming(
        &self,
        task: TaskId,
        by: u32,
        api: &dyn PersistedGraphApi,
    ) -> Result<bool> {
        Ok(false)
    }

    fn remove_external_incoming(
        &self,
        task: TaskId,
        by: u32,
        api: &dyn PersistedGraphApi,
    ) -> Result<bool> {
        Ok(false)
    }

    fn make_dirty(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<bool> {
        Ok(false)
    }

    fn make_clean(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<()> {
        Ok(())
    }

    fn make_dependent_dirty(&self, vc: RawVc, api: &dyn PersistedGraphApi) -> Result<Vec<TaskId>> {
        Ok(Vec::new())
    }

    fn remove_outdated_external_incoming(
        &self,
        api: &dyn PersistedGraphApi,
    ) -> Result<Vec<TaskId>> {
        Ok(Vec::new())
    }

    fn get_external_outgoing(&self, api: &dyn PersistedGraphApi) -> Result<Vec<(TaskId, usize)>> {
        Ok(Vec::new())
    }

    fn get_dirty_active_tasks(&self, api: &dyn PersistedGraphApi) -> Result<Vec<TaskId>> {
        Ok(Vec::new())
    }
}
