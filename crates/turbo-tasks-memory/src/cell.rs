use std::{
    fmt::Debug,
    mem::{replace, take},
};

use auto_hash_map::AutoSet;
use turbo_tasks::{
    backend::CellContent,
    event::{Event, EventListener},
    TaskId, TaskIdSet, TurboTasksBackendApi,
};

use crate::MemoryBackend;

#[derive(Default, Debug)]
pub(crate) enum Cell {
    /// No content has been set yet, or it was removed for memory pressure
    /// reasons.
    /// Assigning a value will transition to the Value state.
    /// Reading this cell will transition to the Recomputing state.
    #[default]
    Empty,
    /// The content has been removed for memory pressure reasons, but the
    /// tracking is still active. Any update will invalidate dependent tasks.
    /// Assigning a value will transition to the Value state.
    /// Reading this cell will transition to the Recomputing state.
    TrackedValueless { dependent_tasks: TaskIdSet },
    /// Someone wanted to read the content and it was not available. The content
    /// is now being recomputed.
    /// Assigning a value will transition to the Value state.
    Recomputing {
        dependent_tasks: TaskIdSet,
        event: Event,
    },
    /// The content was set only once and is tracked.
    /// GC operation will transition to the TrackedValueless state.
    Value {
        dependent_tasks: TaskIdSet,
        content: CellContent,
    },
}

#[derive(Debug)]
pub struct RecomputingCell {
    pub listener: EventListener,
    pub schedule: bool,
}

impl Cell {
    /// Removes a task from the list of dependent tasks.
    pub fn remove_dependent_task(&mut self, task: TaskId) {
        match self {
            Cell::Empty => {}
            Cell::Value {
                dependent_tasks, ..
            }
            | Cell::TrackedValueless {
                dependent_tasks, ..
            }
            | Cell::Recomputing {
                dependent_tasks, ..
            } => {
                dependent_tasks.remove(&task);
            }
        }
    }

    /// Switch the cell to recomputing state.
    fn recompute(
        &mut self,
        dependent_tasks: TaskIdSet,
        description: impl Fn() -> String + Sync + Send + 'static,
        note: impl Fn() -> String + Sync + Send + 'static,
    ) -> EventListener {
        let event = Event::new(move || (description)() + " -> Cell::Recomputing::event");
        let listener = event.listen_with_note(note);
        *self = Cell::Recomputing {
            event,
            dependent_tasks,
        };
        listener
    }

    /// Read the content of the cell when avaiable. Registers the reader as
    /// dependent task. Will trigger recomputation is no content is
    /// available.
    pub fn read_content(
        &mut self,
        reader: TaskId,
        description: impl Fn() -> String + Sync + Send + 'static,
        note: impl Fn() -> String + Sync + Send + 'static,
    ) -> Result<CellContent, RecomputingCell> {
        if let Cell::Value {
            content,
            dependent_tasks,
            ..
        } = self
        {
            dependent_tasks.insert(reader);
            return Ok(content.clone());
        }
        // Same behavior for all other states, so we reuse the same code.
        self.read_content_untracked(description, note)
    }

    /// Read the content of the cell when avaiable. Does not register the reader
    /// as dependent task. Will trigger recomputation is no content is
    /// available.
    ///
    /// INVALIDATION: Be careful with this, it will not
    /// track dependencies, so using it could break cache invalidation.
    pub fn read_content_untracked(
        &mut self,
        description: impl Fn() -> String + Sync + Send + 'static,
        note: impl Fn() -> String + Sync + Send + 'static,
    ) -> Result<CellContent, RecomputingCell> {
        match self {
            Cell::Empty => {
                let listener = self.recompute(AutoSet::default(), description, note);
                Err(RecomputingCell {
                    listener,
                    schedule: true,
                })
            }
            Cell::Recomputing { event, .. } => {
                let listener = event.listen_with_note(note);
                Err(RecomputingCell {
                    listener,
                    schedule: false,
                })
            }
            &mut Cell::TrackedValueless {
                ref mut dependent_tasks,
            } => {
                let dependent_tasks = take(dependent_tasks);
                let listener = self.recompute(dependent_tasks, description, note);
                Err(RecomputingCell {
                    listener,
                    schedule: true,
                })
            }
            Cell::Value { content, .. } => Ok(content.clone()),
        }
    }

    /// Read the content of the cell when avaiable. Does not register the reader
    /// as dependent task. Will not start recomputing when content is not
    /// available.
    ///
    /// INVALIDATION: Be careful with this, it will not track
    /// dependencies, so using it could break cache invalidation.
    pub fn read_own_content_untracked(&self) -> CellContent {
        match self {
            Cell::Empty | Cell::Recomputing { .. } | Cell::TrackedValueless { .. } => {
                CellContent(None)
            }
            Cell::Value { content, .. } => content.clone(),
        }
    }

    /// Assigns a new content to the cell. Will notify dependent tasks if the
    /// content has changed.
    /// If clean = true, the task inputs weren't changes since the last
    /// execution and can be assumed to produce the same content again.
    pub fn assign(
        &mut self,
        content: CellContent,
        clean: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        match self {
            Cell::Empty => {
                *self = Cell::Value {
                    content,
                    dependent_tasks: AutoSet::default(),
                };
            }
            &mut Cell::Recomputing {
                ref mut event,
                ref mut dependent_tasks,
            } => {
                event.notify(usize::MAX);
                if clean {
                    // We can assume that the task is deterministic and produces the same content
                    // again. No need to notify dependent tasks.
                    *self = Cell::Value {
                        content,
                        dependent_tasks: take(dependent_tasks),
                    };
                } else {
                    // Assigning to a cell will invalidate all dependent tasks as the content might
                    // have changed.
                    if !dependent_tasks.is_empty() {
                        turbo_tasks.schedule_notify_tasks_set(dependent_tasks);
                    }
                    *self = Cell::Value {
                        content,
                        dependent_tasks: AutoSet::default(),
                    };
                }
            }
            &mut Cell::TrackedValueless {
                ref mut dependent_tasks,
            } => {
                if clean {
                    // We can assume that the task is deterministic and produces the same content
                    // again. No need to notify dependent tasks.
                    *self = Cell::Value {
                        content,
                        dependent_tasks: take(dependent_tasks),
                    };
                } else {
                    // Assigning to a cell will invalidate all dependent tasks as the content might
                    // have changed.
                    if !dependent_tasks.is_empty() {
                        turbo_tasks.schedule_notify_tasks_set(dependent_tasks);
                    }
                    *self = Cell::Value {
                        content,
                        dependent_tasks: AutoSet::default(),
                    };
                }
            }
            Cell::Value {
                content: ref mut cell_content,
                dependent_tasks,
            } => {
                if content != *cell_content {
                    if !dependent_tasks.is_empty() {
                        turbo_tasks.schedule_notify_tasks_set(dependent_tasks);
                        dependent_tasks.clear();
                    }
                    *cell_content = content;
                }
            }
        }
    }

    /// Reduces memory needs to the minimum.
    pub fn shrink_to_fit(&mut self) {
        match self {
            Cell::Empty => {}
            Cell::TrackedValueless {
                dependent_tasks, ..
            }
            | Cell::Recomputing {
                dependent_tasks, ..
            }
            | Cell::Value {
                dependent_tasks, ..
            } => {
                dependent_tasks.shrink_to_fit();
            }
        }
    }

    /// Takes the content out of the cell. Make sure to drop the content outside
    /// of the task state lock.
    #[must_use]
    pub fn gc_content(&mut self) -> Option<CellContent> {
        match self {
            Cell::Empty | Cell::Recomputing { .. } | Cell::TrackedValueless { .. } => None,
            Cell::Value {
                dependent_tasks, ..
            } => {
                let dependent_tasks = take(dependent_tasks);
                let Cell::Value { content, .. } =
                    replace(self, Cell::TrackedValueless { dependent_tasks })
                else {
                    unreachable!()
                };
                Some(content)
            }
        }
    }

    /// Drops the cell after GC. Will notify all dependent tasks and events.
    pub fn gc_drop(self, turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>) {
        match self {
            Cell::Empty => {}
            Cell::Recomputing {
                event,
                dependent_tasks,
                ..
            } => {
                event.notify(usize::MAX);
                if !dependent_tasks.is_empty() {
                    turbo_tasks.schedule_notify_tasks_set(&dependent_tasks);
                }
            }
            Cell::TrackedValueless {
                dependent_tasks, ..
            }
            | Cell::Value {
                dependent_tasks, ..
            } => {
                if !dependent_tasks.is_empty() {
                    turbo_tasks.schedule_notify_tasks_set(&dependent_tasks);
                }
            }
        }
    }
}
