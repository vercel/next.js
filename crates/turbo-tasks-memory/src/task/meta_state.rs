use std::mem::replace;

use auto_hash_map::AutoSet;
use nohash_hasher::BuildNoHashHasher;
use once_cell::sync::Lazy;
use parking_lot::{RwLockReadGuard, RwLockWriteGuard};
use turbo_tasks::{StatsType, TaskId};

use super::{PartialTaskState, Task, TaskState, UnloadedTaskState};
use crate::{
    map_guard::{ReadGuard, WriteGuard},
    scope::TaskScopes,
};

pub(super) enum TaskMetaState {
    Full(Box<TaskState>),
    Partial(Box<PartialTaskState>),
    Unloaded(UnloadedTaskState),
}

impl TaskMetaState {
    pub(super) fn into_full(self) -> Option<TaskState> {
        match self {
            Self::Full(state) => Some(*state),
            _ => None,
        }
    }

    pub(super) fn into_partial(self) -> Option<PartialTaskState> {
        match self {
            Self::Partial(state) => Some(*state),
            _ => None,
        }
    }

    pub(super) fn into_unloaded(self) -> Option<UnloadedTaskState> {
        match self {
            Self::Unloaded(state) => Some(state),
            _ => None,
        }
    }

    pub(super) fn as_full(&self) -> Option<&TaskState> {
        match self {
            Self::Full(state) => Some(state),
            _ => None,
        }
    }

    pub(super) fn as_partial(&self) -> Option<&PartialTaskState> {
        match self {
            Self::Partial(state) => Some(state),
            _ => None,
        }
    }

    pub(super) fn as_unloaded(&self) -> Option<&UnloadedTaskState> {
        match self {
            Self::Unloaded(state) => Some(state),
            _ => None,
        }
    }

    pub(super) fn as_full_mut(&mut self) -> Option<&mut TaskState> {
        match self {
            Self::Full(state) => Some(state),
            _ => None,
        }
    }

    pub(super) fn as_partial_mut(&mut self) -> Option<&mut PartialTaskState> {
        match self {
            Self::Partial(state) => Some(state),
            _ => None,
        }
    }

    pub(super) fn as_unloaded_mut(&mut self) -> Option<&mut UnloadedTaskState> {
        match self {
            Self::Unloaded(state) => Some(state),
            _ => None,
        }
    }
}

// These need to be impl types since there is no way to reference the zero-sized
// function item type
type TaskMetaStateAsFull = impl Fn(&TaskMetaState) -> Option<&TaskState>;
type TaskMetaStateAsPartial = impl Fn(&TaskMetaState) -> Option<&PartialTaskState>;
type TaskMetaStateAsUnloaded = impl Fn(&TaskMetaState) -> Option<&UnloadedTaskState>;
type TaskMetaStateAsFullMut = impl Fn(&mut TaskMetaState) -> Option<&mut TaskState>;
type TaskMetaStateAsPartialMut = impl Fn(&mut TaskMetaState) -> Option<&mut PartialTaskState>;
type TaskMetaStateAsUnloadedMut = impl Fn(&mut TaskMetaState) -> Option<&mut UnloadedTaskState>;

pub(super) enum TaskMetaStateReadGuard<'a> {
    Full(ReadGuard<'a, TaskMetaState, TaskState, TaskMetaStateAsFull>),
    Partial(ReadGuard<'a, TaskMetaState, PartialTaskState, TaskMetaStateAsPartial>),
    Unloaded(ReadGuard<'a, TaskMetaState, UnloadedTaskState, TaskMetaStateAsUnloaded>),
}

pub(super) type FullTaskWriteGuard<'a> =
    WriteGuard<'a, TaskMetaState, TaskState, TaskMetaStateAsFull, TaskMetaStateAsFullMut>;

pub(super) enum TaskMetaStateWriteGuard<'a> {
    Full(FullTaskWriteGuard<'a>),
    Partial(
        WriteGuard<
            'a,
            TaskMetaState,
            PartialTaskState,
            TaskMetaStateAsPartial,
            TaskMetaStateAsPartialMut,
        >,
    ),
    Unloaded(
        WriteGuard<
            'a,
            TaskMetaState,
            UnloadedTaskState,
            TaskMetaStateAsUnloaded,
            TaskMetaStateAsUnloadedMut,
        >,
    ),
}

impl<'a> From<RwLockReadGuard<'a, TaskMetaState>> for TaskMetaStateReadGuard<'a> {
    fn from(guard: RwLockReadGuard<'a, TaskMetaState>) -> Self {
        match &*guard {
            TaskMetaState::Full(_) => {
                TaskMetaStateReadGuard::Full(ReadGuard::new(guard, TaskMetaState::as_full))
            }
            TaskMetaState::Partial(_) => {
                TaskMetaStateReadGuard::Partial(ReadGuard::new(guard, TaskMetaState::as_partial))
            }
            TaskMetaState::Unloaded(_) => {
                TaskMetaStateReadGuard::Unloaded(ReadGuard::new(guard, TaskMetaState::as_unloaded))
            }
        }
    }
}

impl<'a> From<RwLockWriteGuard<'a, TaskMetaState>> for TaskMetaStateWriteGuard<'a> {
    fn from(guard: RwLockWriteGuard<'a, TaskMetaState>) -> Self {
        match &*guard {
            TaskMetaState::Full(_) => TaskMetaStateWriteGuard::Full(WriteGuard::new(
                guard,
                TaskMetaState::as_full,
                TaskMetaState::as_full_mut,
            )),
            TaskMetaState::Partial(_) => TaskMetaStateWriteGuard::Partial(WriteGuard::new(
                guard,
                TaskMetaState::as_partial,
                TaskMetaState::as_partial_mut,
            )),
            TaskMetaState::Unloaded(_) => TaskMetaStateWriteGuard::Unloaded(WriteGuard::new(
                guard,
                TaskMetaState::as_unloaded,
                TaskMetaState::as_unloaded_mut,
            )),
        }
    }
}

impl<'a> TaskMetaStateReadGuard<'a> {
    pub(super) fn as_full(&mut self) -> Option<&TaskState> {
        match self {
            TaskMetaStateReadGuard::Full(state) => Some(&**state),
            _ => None,
        }
    }
}

impl<'a> TaskMetaStateWriteGuard<'a> {
    pub(super) fn full_from(
        mut guard: RwLockWriteGuard<'a, TaskMetaState>,
        task: &Task,
    ) -> FullTaskWriteGuard<'a> {
        match &*guard {
            TaskMetaState::Full(_) => {}
            TaskMetaState::Partial(_) => {
                let partial = replace(
                    &mut *guard,
                    // placeholder
                    TaskMetaState::Unloaded(UnloadedTaskState {
                        stats_type: StatsType::Essential,
                    }),
                )
                .into_partial()
                .unwrap();
                *guard =
                    TaskMetaState::Full(Box::new(partial.into_full(task.get_event_description())));
            }
            TaskMetaState::Unloaded(_) => {
                let unloaded = replace(
                    &mut *guard,
                    // placeholder
                    TaskMetaState::Unloaded(UnloadedTaskState {
                        stats_type: StatsType::Essential,
                    }),
                )
                .into_unloaded()
                .unwrap();
                *guard =
                    TaskMetaState::Full(Box::new(unloaded.into_full(task.get_event_description())));
            }
        }
        WriteGuard::new(guard, TaskMetaState::as_full, TaskMetaState::as_full_mut)
    }

    #[allow(dead_code, reason = "We need this in future")]
    pub(super) fn partial_from(mut guard: RwLockWriteGuard<'a, TaskMetaState>) -> Self {
        match &*guard {
            TaskMetaState::Full(_) => TaskMetaStateWriteGuard::Full(WriteGuard::new(
                guard,
                TaskMetaState::as_full,
                TaskMetaState::as_full_mut,
            )),
            TaskMetaState::Partial(_) => TaskMetaStateWriteGuard::Partial(WriteGuard::new(
                guard,
                TaskMetaState::as_partial,
                TaskMetaState::as_partial_mut,
            )),
            TaskMetaState::Unloaded(_) => {
                let unloaded = replace(
                    &mut *guard,
                    // placeholder
                    TaskMetaState::Unloaded(UnloadedTaskState {
                        stats_type: StatsType::Essential,
                    }),
                )
                .into_unloaded()
                .unwrap();
                *guard = TaskMetaState::Partial(Box::new(unloaded.into_partial()));
                TaskMetaStateWriteGuard::Partial(WriteGuard::new(
                    guard,
                    TaskMetaState::as_partial,
                    TaskMetaState::as_partial_mut,
                ))
            }
        }
    }

    pub(super) fn scopes_and_children(
        &mut self,
    ) -> (&mut TaskScopes, &AutoSet<TaskId, BuildNoHashHasher<TaskId>>) {
        match self {
            TaskMetaStateWriteGuard::Full(state) => {
                let TaskState {
                    ref mut scopes,
                    ref children,
                    ..
                } = **state;
                (scopes, children)
            }
            TaskMetaStateWriteGuard::Partial(state) => {
                let PartialTaskState { ref mut scopes, .. } = **state;
                static EMPTY: Lazy<AutoSet<TaskId, BuildNoHashHasher<TaskId>>> =
                    Lazy::new(AutoSet::default);
                (scopes, &*EMPTY)
            }
            TaskMetaStateWriteGuard::Unloaded(_) => unreachable!(
                "TaskMetaStateWriteGuard::scopes_and_children must be called with at least a \
                 partial state"
            ),
        }
    }

    pub(super) fn as_full_mut(&mut self) -> Option<&mut TaskState> {
        match self {
            TaskMetaStateWriteGuard::Full(state) => Some(&mut **state),
            _ => None,
        }
    }

    pub(super) fn into_inner(self) -> RwLockWriteGuard<'a, TaskMetaState> {
        match self {
            TaskMetaStateWriteGuard::Full(state) => state.into_inner(),
            TaskMetaStateWriteGuard::Partial(state) => state.into_inner(),
            TaskMetaStateWriteGuard::Unloaded(state) => state.into_inner(),
        }
    }
}
