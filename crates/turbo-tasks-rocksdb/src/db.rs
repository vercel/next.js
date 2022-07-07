use std::ops::Add;

use serde::{Deserialize, Serialize};
use turbo_tasks::{
    backend::{CellMappings, PersistentTaskType},
    persisted_graph::{TaskCell, TaskData},
    without_task_id_mapping, RawVc,
};

use crate::table::{database, table};

#[derive(Serialize, Deserialize, Debug)]
pub struct InternalTaskState {
    pub clean: bool,
}

#[derive(Serialize, Deserialize, Debug, Default)]
pub struct TaskState {
    pub internal: Option<InternalTaskState>,
    pub active: bool,
    pub active_parents: u32,
    pub externally_active: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum TaskStateChange {
    MakeDirty,
    MakeClean,
    Activate,
    Deactivate,
    IncrementActiveParents(u32),
    DecrementActiveParents(u32),
    SetExternallyActive,
    UnsetExternallyActive,
    Persist(bool),
    Multiple(Vec<TaskStateChange>),
}

impl Default for TaskStateChange {
    fn default() -> Self {
        TaskStateChange::Multiple(Vec::new())
    }
}

impl Add<TaskStateChange> for TaskState {
    type Output = TaskState;

    fn add(mut self, change: TaskStateChange) -> Self::Output {
        if let TaskStateChange::Multiple(list) = change {
            for item in list {
                self = self + item;
            }
            return self;
        }
        let TaskState {
            ref mut active_parents,
            ref mut externally_active,
            ref mut active,
            ref mut internal,
        } = self;
        match change {
            TaskStateChange::MakeDirty => {
                if let Some(InternalTaskState { ref mut clean, .. }) = internal {
                    *clean = false;
                }
            }
            TaskStateChange::MakeClean => {
                if let Some(InternalTaskState { ref mut clean, .. }) = internal {
                    *clean = true;
                }
            }
            TaskStateChange::Activate => {
                *active = true;
            }
            TaskStateChange::Deactivate => {
                *active = false;
            }
            TaskStateChange::IncrementActiveParents(by) => {
                *active_parents += by;
            }
            TaskStateChange::DecrementActiveParents(by) => {
                *active_parents -= by;
            }
            TaskStateChange::SetExternallyActive => {
                *externally_active = true;
            }
            TaskStateChange::UnsetExternallyActive => {
                *externally_active = false;
            }
            TaskStateChange::Persist(is_externally_active) => {
                *internal = Some(InternalTaskState { clean: true });
                *externally_active = is_externally_active;
                if is_externally_active {
                    *active = true;
                }
            }
            TaskStateChange::Multiple(_) => unreachable!(),
        }
        self
    }
}

macro_rules! add_sum_to_list {
    ($list:ident, $start:expr, $inc_op:path, $dec_op:path) => {{
        let mut sum = $start;
        $list.retain(|i| match i {
            $inc_op(by) => {
                sum += *by as i32;
                false
            }
            $dec_op(by) => {
                sum -= *by as i32;
                false
            }
            _ => true,
        });
        if sum > 0 {
            $list.push($inc_op(sum as u32));
        } else if sum < 0 {
            $list.push($dec_op((-sum) as u32));
        }
    }};
}

impl Add for TaskStateChange {
    type Output = TaskStateChange;

    fn add(mut self, rhs: Self) -> Self::Output {
        if let TaskStateChange::Multiple(list) = rhs {
            for item in list {
                self = self + item;
            }
            return self;
        }
        let list = if let TaskStateChange::Multiple(list) = &mut self {
            list
        } else {
            self = TaskStateChange::Multiple(vec![self]);
            if let TaskStateChange::Multiple(list) = &mut self {
                list
            } else {
                unreachable!()
            }
        };
        match rhs {
            TaskStateChange::MakeDirty | TaskStateChange::MakeClean => {
                list.retain(|i| {
                    !matches!(i, TaskStateChange::MakeClean | TaskStateChange::MakeDirty)
                });
                list.push(rhs);
            }
            TaskStateChange::Activate | TaskStateChange::Deactivate => {
                list.retain(|i| {
                    !matches!(i, TaskStateChange::Activate | TaskStateChange::Deactivate)
                });
                list.push(rhs);
            }
            TaskStateChange::IncrementActiveParents(by) => {
                add_sum_to_list!(
                    list,
                    by as i32,
                    TaskStateChange::IncrementActiveParents,
                    TaskStateChange::DecrementActiveParents
                );
            }
            TaskStateChange::DecrementActiveParents(by) => {
                add_sum_to_list!(
                    list,
                    -(by as i32),
                    TaskStateChange::IncrementActiveParents,
                    TaskStateChange::DecrementActiveParents
                );
            }
            TaskStateChange::SetExternallyActive | TaskStateChange::UnsetExternallyActive => {
                list.retain(|i| {
                    !matches!(
                        i,
                        TaskStateChange::SetExternallyActive
                            | TaskStateChange::UnsetExternallyActive
                    )
                });
                list.push(rhs);
            }
            TaskStateChange::Persist { .. } => {
                list.push(rhs);
            }
            TaskStateChange::Multiple(_) => unreachable!(),
        }
        if list.len() == 1 {
            list.drain(..).next().unwrap()
        } else {
            self
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PartialTaskData {
    pub cells: Vec<TaskCell>,
    pub cell_mappings: Option<CellMappings>,
    pub output: RawVc,
}

table!(last_task_id, (usize), merge((usize): |a: usize, b| a + b, |a, b| a + b));
table!(task_type, (usize) => (PersistentTaskType));
table!(cache, raw => (usize));
table!(state, (usize) => (TaskState), merge((TaskStateChange): |s, c| s + c, |c1, c2| c1 + c2, without_task_id_mapping));
table!(data, (usize) => (TaskData));
table!(children, (usize) => (Vec<usize>));
table!(dependencies, (usize) => (Vec<RawVc>));
table!(dependents, (RawVc) => [usize], prefix(u8));
table!(externally_active_tasks, (()) => [usize]);
table!(potential_active_external_tasks, (()) => [usize]);
table!(potential_dirty_active_tasks, (()) => [usize]);
table!(pending_active_update, (()) => [usize]);

database!(
    last_task_id,
    task_type,
    cache,
    state,
    data,
    children,
    dependencies,
    dependents,
    externally_active_tasks,
    potential_active_external_tasks,
    potential_dirty_active_tasks,
    pending_active_update
);
