use std::{fmt::Debug, mem::take};

use auto_hash_map::AutoSet;
use turbo_tasks::{
    backend::CellContent,
    event::{Event, EventListener},
    TaskId, TurboTasksBackendApi,
};

#[derive(Debug)]
pub(crate) enum FullCell {
    UpdatedValue {
        content: CellContent,
        updates: u32,
        dependent_tasks: AutoSet<TaskId>,
    },
    /// Someone wanted to read the content and it was not available. The content
    /// is now being recomputed.
    /// This is used when there are dependent tasks
    Recomputing {
        event: Event,
        updates: u32,
        dependent_tasks: AutoSet<TaskId>,
    },
}

#[derive(Default, Debug)]
pub(crate) enum Cell {
    /// No content has been set yet, or it was removed for memory pressure
    /// reasons.
    #[default]
    Empty,
    /// Someone wanted to read the content and it was not available. The content
    /// is now being recomputed.
    /// This is only used when there are no dependent tasks
    Recomputing {
        event: Event,
        updates: u32,
    },
    /// The content was set only once and is tracked.
    InitialValue {
        content: CellContent,
        dependent_tasks: AutoSet<TaskId>,
    },
    // This is in a box so we don't need the updates counter for most cells that are only written
    // once.
    Full(Box<FullCell>),
}

#[derive(Debug)]
pub struct RecomputingCell {
    pub listener: EventListener,
    pub schedule: bool,
}

impl Cell {
    pub fn remove_dependent_task(&mut self, task: TaskId) {
        match self {
            Cell::Empty | Cell::Recomputing { .. } => {}
            Cell::InitialValue {
                dependent_tasks, ..
            }
            | Cell::Full(
                box (FullCell::Recomputing {
                    dependent_tasks, ..
                }
                | FullCell::UpdatedValue {
                    dependent_tasks, ..
                }),
            ) => {
                dependent_tasks.remove(&task);
            }
        }
    }

    fn recompute(
        &mut self,
        updates: u32,
        dependent_tasks: AutoSet<TaskId>,
        description: impl Fn() -> String + Sync + Send + 'static,
        note: impl Fn() -> String + Sync + Send + 'static,
    ) -> EventListener {
        let event = Event::new(move || (description)() + " -> Cell::Recomputing::event");
        let listener = event.listen_with_note(note);
        if dependent_tasks.is_empty() {
            *self = Cell::Recomputing { event, updates };
        } else {
            *self = Cell::Full(box FullCell::Recomputing {
                event,
                updates,
                dependent_tasks,
            });
        }
        listener
    }

    pub fn read_content(
        &mut self,
        reader: TaskId,
        description: impl Fn() -> String + Sync + Send + 'static,
        note: impl Fn() -> String + Sync + Send + 'static,
    ) -> Result<CellContent, RecomputingCell> {
        match self {
            Cell::Empty => {
                let listener = self.recompute(1, AutoSet::new(), description, note);
                Err(RecomputingCell {
                    listener,
                    schedule: true,
                })
            }
            Cell::Recomputing { event, .. }
            | Cell::Full(box FullCell::Recomputing { event, .. }) => {
                let listener = event.listen_with_note(note);
                Err(RecomputingCell {
                    listener,
                    schedule: false,
                })
            }
            Cell::InitialValue {
                content,
                dependent_tasks,
                ..
            }
            | Cell::Full(box FullCell::UpdatedValue {
                content,
                dependent_tasks,
                ..
            }) => {
                dependent_tasks.insert(reader);
                Ok(content.clone())
            }
        }
    }

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    pub fn read_content_untracked(
        &mut self,
        description: impl Fn() -> String + Sync + Send + 'static,
        note: impl Fn() -> String + Sync + Send + 'static,
    ) -> Result<CellContent, RecomputingCell> {
        match self {
            Cell::Empty => {
                let listener = self.recompute(1, AutoSet::new(), description, note);
                Err(RecomputingCell {
                    listener,
                    schedule: true,
                })
            }
            Cell::Recomputing { event, .. }
            | Cell::Full(box FullCell::Recomputing { event, .. }) => {
                let listener = event.listen_with_note(note);
                Err(RecomputingCell {
                    listener,
                    schedule: false,
                })
            }
            Cell::InitialValue { content, .. }
            | Cell::Full(box FullCell::UpdatedValue { content, .. }) => Ok(content.clone()),
        }
    }

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    pub fn read_own_content_untracked(&self) -> CellContent {
        match self {
            Cell::Empty
            | Cell::Recomputing { .. }
            | Cell::Full(box FullCell::Recomputing { .. }) => CellContent(None),
            Cell::InitialValue { content, .. }
            | Cell::Full(box FullCell::UpdatedValue { content, .. }) => content.clone(),
        }
    }

    pub fn assign(&mut self, content: CellContent, turbo_tasks: &dyn TurboTasksBackendApi) {
        match self {
            Cell::Empty => {
                *self = Cell::InitialValue {
                    content,
                    dependent_tasks: AutoSet::new(),
                };
            }
            &mut Cell::Recomputing {
                ref mut event,
                updates,
            } => {
                event.notify(usize::MAX);
                if updates == 1 {
                    *self = Cell::InitialValue {
                        content,
                        dependent_tasks: AutoSet::new(),
                    };
                } else {
                    *self = Cell::Full(box FullCell::UpdatedValue {
                        content,
                        dependent_tasks: AutoSet::new(),
                        updates,
                    });
                }
            }
            &mut Cell::Full(box ref mut cell @ FullCell::Recomputing { .. }) => {
                let FullCell::Recomputing {
                    ref mut event,
                    updates,
                    ref mut dependent_tasks,
                } = *cell else {
                    unreachable!()
                };
                event.notify(usize::MAX);
                if updates == 1 {
                    *self = Cell::InitialValue {
                        content,
                        dependent_tasks: take(dependent_tasks),
                    };
                } else {
                    *cell = FullCell::UpdatedValue {
                        content,
                        dependent_tasks: take(dependent_tasks),
                        updates,
                    };
                }
            }
            Cell::InitialValue {
                content: old_content,
                dependent_tasks,
            } => {
                if content != *old_content {
                    if !dependent_tasks.is_empty() {
                        turbo_tasks.schedule_notify_tasks_set(dependent_tasks);
                        dependent_tasks.clear();
                    }
                    *self = Cell::Full(box FullCell::UpdatedValue {
                        content,
                        updates: 2,
                        dependent_tasks: take(dependent_tasks),
                    });
                }
            }
            Cell::Full(box FullCell::UpdatedValue {
                content: cell_content,
                updates,
                dependent_tasks,
            }) => {
                if content != *cell_content {
                    if !dependent_tasks.is_empty() {
                        turbo_tasks.schedule_notify_tasks_set(dependent_tasks);
                        dependent_tasks.clear();
                    }
                    *updates += 1;
                    *cell_content = content;
                }
            }
        }
    }
}
