use std::mem::replace;

use parking_lot::{RwLockReadGuard, RwLockWriteGuard};

use super::{PartialTaskState, TaskState, UnloadedTaskState};
use crate::{
    aggregation::AggregationNode,
    map_guard::{ReadGuard, WriteGuard},
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

pub(super) type TaskMetaStateAsFull = for<'a> fn(&'a TaskMetaState) -> Option<&'a TaskState>;
pub(super) type TaskMetaStateAsPartial =
    for<'a> fn(&'a TaskMetaState) -> Option<&'a PartialTaskState>;
pub(super) type TaskMetaStateAsUnloaded =
    for<'a> fn(&'a TaskMetaState) -> Option<&'a UnloadedTaskState>;
pub(super) type TaskMetaStateAsFullMut =
    for<'a> fn(&'a mut TaskMetaState) -> Option<&'a mut TaskState>;
pub(super) type TaskMetaStateAsPartialMut =
    for<'a> fn(&'a mut TaskMetaState) -> Option<&'a mut PartialTaskState>;
pub(super) type TaskMetaStateAsUnloadedMut =
    for<'a> fn(&'a mut TaskMetaState) -> Option<&'a mut UnloadedTaskState>;

#[allow(dead_code, reason = "test")]
pub(super) enum TaskMetaStateReadGuard<'a> {
    Full(ReadGuard<'a, TaskMetaState, TaskState, TaskMetaStateAsFull>),
    Partial(ReadGuard<'a, TaskMetaState, PartialTaskState, TaskMetaStateAsPartial>),
    Unloaded,
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
    TemporaryFiller,
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
            TaskMetaState::Unloaded(_) => TaskMetaStateReadGuard::Unloaded,
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

impl TaskMetaStateReadGuard<'_> {
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
    ) -> FullTaskWriteGuard<'a> {
        match &*guard {
            TaskMetaState::Full(_) => {}
            TaskMetaState::Partial(_) => {
                let partial = replace(
                    &mut *guard,
                    // placeholder
                    TaskMetaState::Unloaded(UnloadedTaskState {}),
                )
                .into_partial()
                .unwrap();
                *guard = TaskMetaState::Full(Box::new(partial.into_full()));
            }
            TaskMetaState::Unloaded(_) => {
                let unloaded = replace(
                    &mut *guard,
                    // placeholder
                    TaskMetaState::Unloaded(UnloadedTaskState {}),
                )
                .into_unloaded()
                .unwrap();
                *guard = TaskMetaState::Full(Box::new(unloaded.into_full()));
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
                    TaskMetaState::Unloaded(UnloadedTaskState {}),
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
            TaskMetaStateWriteGuard::TemporaryFiller => unreachable!(),
        }
    }

    pub(super) fn ensure_at_least_partial(&mut self) {
        if matches!(self, TaskMetaStateWriteGuard::Unloaded(..)) {
            let TaskMetaStateWriteGuard::Unloaded(state) =
                replace(self, TaskMetaStateWriteGuard::TemporaryFiller)
            else {
                unreachable!();
            };
            let mut state = state.into_inner();
            *state = TaskMetaState::Partial(Box::new(PartialTaskState {
                aggregation_node: AggregationNode::new(),
            }));
            *self = TaskMetaStateWriteGuard::Partial(WriteGuard::new(
                state,
                TaskMetaState::as_partial,
                TaskMetaState::as_partial_mut,
            ));
        }
    }
}
