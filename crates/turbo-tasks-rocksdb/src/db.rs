use std::ops::Add;

use serde::{Deserialize, Serialize};
use turbo_tasks::{
    backend::{PersistentTaskType, SlotMappings},
    persisted_graph::TaskSlot,
    RawVc, TaskId,
};

use crate::table::{database, table};

#[derive(Serialize, Deserialize, Debug)]
pub enum TaskState {
    Internal {
        clean: bool,
        active: bool,
        active_parents: u32,
        external_incoming: u32,
    },
    External {
        external_outgoing: u32,
    },
}

impl Default for TaskState {
    fn default() -> Self {
        TaskState::External {
            external_outgoing: 0,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub enum TaskStateChange {
    MakeDirty,
    MakeClean,
    Activate,
    Deactivate,
    IncrementActiveParents(u32),
    DecrementActiveParents(u32),
    AddExternalIncoming(u32),
    RemoveExternalIncoming(u32),
    AddExternalOutgoing(u32),
    RemoveExternalOutgoing(u32),
    ConvertToInternal { external_active_parents: u32 },
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
        match &mut self {
            TaskState::Internal {
                clean,
                active,
                active_parents,
                external_incoming,
            } => match change {
                TaskStateChange::MakeDirty => {
                    *clean = false;
                }
                TaskStateChange::MakeClean => {
                    *clean = true;
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
                TaskStateChange::AddExternalIncoming(by) => {
                    *active_parents += by;
                    *external_incoming += by
                }
                TaskStateChange::RemoveExternalIncoming(by) => {
                    *active_parents -= by;
                    *external_incoming -= by
                }
                TaskStateChange::AddExternalOutgoing(by) => *external_incoming -= by,
                TaskStateChange::RemoveExternalOutgoing(by) => *external_incoming += by,
                TaskStateChange::ConvertToInternal { .. } => {}
                TaskStateChange::Multiple(_) => unreachable!(),
            },
            TaskState::External { external_outgoing } => match change {
                TaskStateChange::MakeDirty
                | TaskStateChange::MakeClean
                | TaskStateChange::Activate
                | TaskStateChange::Deactivate
                | TaskStateChange::IncrementActiveParents(_)
                | TaskStateChange::DecrementActiveParents(_)
                | TaskStateChange::AddExternalIncoming(_)
                | TaskStateChange::RemoveExternalIncoming(_) => {}
                TaskStateChange::AddExternalOutgoing(by) => {
                    *external_outgoing += by;
                }
                TaskStateChange::RemoveExternalOutgoing(by) => {
                    *external_outgoing -= by;
                }
                TaskStateChange::ConvertToInternal {
                    external_active_parents,
                } => {
                    return TaskState::Internal {
                        clean: true,
                        active: external_active_parents > 0,
                        active_parents: external_active_parents,
                        external_incoming: external_active_parents - *external_outgoing,
                    }
                }
                TaskStateChange::Multiple(_) => unreachable!(),
            },
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
                    matches!(i, TaskStateChange::MakeClean | TaskStateChange::MakeDirty)
                });
                list.push(rhs);
            }
            TaskStateChange::Activate | TaskStateChange::Deactivate => {
                list.retain(|i| {
                    matches!(i, TaskStateChange::Activate | TaskStateChange::Deactivate)
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
            TaskStateChange::AddExternalIncoming(by) => {
                add_sum_to_list!(
                    list,
                    by as i32,
                    TaskStateChange::AddExternalIncoming,
                    TaskStateChange::RemoveExternalIncoming
                );
            }
            TaskStateChange::RemoveExternalIncoming(by) => {
                add_sum_to_list!(
                    list,
                    -(by as i32),
                    TaskStateChange::AddExternalIncoming,
                    TaskStateChange::RemoveExternalIncoming
                );
            }
            TaskStateChange::AddExternalOutgoing(by) => {
                add_sum_to_list!(
                    list,
                    by as i32,
                    TaskStateChange::AddExternalOutgoing,
                    TaskStateChange::RemoveExternalOutgoing
                );
            }
            TaskStateChange::RemoveExternalOutgoing(by) => {
                add_sum_to_list!(
                    list,
                    -(by as i32),
                    TaskStateChange::AddExternalOutgoing,
                    TaskStateChange::RemoveExternalOutgoing
                );
            }
            TaskStateChange::ConvertToInternal { .. } => {
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
    pub slots: Vec<TaskSlot>,
    pub slot_mappings: Option<SlotMappings>,
    pub output: RawVc,
}

table!(next_task_id, (usize), merge((usize): |a: usize, b| a + b, |a, b| a + b));
table!(task_type, (usize) => (PersistentTaskType));
table!(cache, raw => (usize));
table!(state, (TaskId) => (TaskState), merge((TaskStateChange): |s, c| s + c, |c1, c2| c1 + c2));
table!(data, (TaskId) => (PartialTaskData));
table!(children, (TaskId) => (Vec<TaskId>));
table!(dependencies, (TaskId) => (Vec<RawVc>));
table!(dependents, (RawVc) => [TaskId], prefix(u8));
table!(external_incoming, (()) => [TaskId]);
table!(external_outgoing, (()) => [TaskId]);

database!(
    next_task_id,
    task_type,
    cache,
    state,
    data,
    children,
    dependencies,
    dependents,
    external_incoming,
    external_outgoing
);
