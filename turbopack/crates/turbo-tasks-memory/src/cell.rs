use std::{fmt::Debug, mem::replace};

use turbo_tasks::{
    backend::CellContent,
    event::{Event, EventListener},
    TaskId, TaskIdSet, TurboTasksBackendApi,
};

use crate::MemoryBackend;

#[derive(Default, Debug)]
pub(crate) struct Cell {
    dependent_tasks: TaskIdSet,
    state: CellState,
}

#[derive(Default, Debug)]
pub(crate) enum CellState {
    /// No content has been set yet, or
    /// it was removed for memory pressure reasons, or
    /// cell is no longer used (It was assigned once and then no longer used
    /// after recomputation).
    ///
    /// Assigning a value will transition to the Value state.
    /// Reading this cell will,
    /// - transition to the Computing state if the task is progress
    /// - return an error if the task is already done.
    #[default]
    Empty,
    /// The content has been removed for memory pressure reasons, but the
    /// tracking is still active. Any update will invalidate dependent tasks.
    /// Assigning a value will transition to the Value state.
    /// Reading this cell will transition to the Computing state.
    TrackedValueless,
    /// Someone wanted to read the content and it was not available. The content
    /// is now being computed.
    /// Assigning a value will transition to the Value state.
    /// When the task ends this transitions to the Empty state if not assigned.
    Computing {
        /// The event that will be triggered when transitioning to another
        /// state.
        event: Event,
    },
    /// The content was set only once and is tracked.
    /// GC operation will transition to the TrackedValueless state.
    Value { content: CellContent },
}

pub enum ReadContentError {
    Computing {
        listener: EventListener,
        schedule: bool,
    },
    Unused,
}

impl Cell {
    /// Removes a task from the list of dependent tasks.
    pub fn remove_dependent_task(&mut self, task: TaskId) {
        self.dependent_tasks.remove(&task);
    }

    /// Switch the cell to recomputing state.
    fn compute(
        &mut self,
        description: impl Fn() -> String + Sync + Send + 'static,
        note: impl Fn() -> String + Sync + Send + 'static,
    ) -> EventListener {
        let event = Event::new(move || (description)() + " -> CellState::Computing::event");
        let listener = event.listen_with_note(note);
        self.state = CellState::Computing { event };
        listener
    }

    /// Read the content of the cell when avaiable. Registers the reader as
    /// dependent task. Will trigger recomputation is no content is
    /// available.
    pub fn read_content(
        &mut self,
        reader: TaskId,
        task_done: bool,
        description: impl Fn() -> String + Sync + Send + 'static,
        note: impl Fn() -> String + Sync + Send + 'static,
    ) -> Result<CellContent, ReadContentError> {
        match &self.state {
            CellState::Value { content } => {
                self.dependent_tasks.insert(reader);
                Ok(content.clone())
            }
            CellState::Empty if task_done => {
                self.dependent_tasks.insert(reader);
                Err(ReadContentError::Unused)
            }
            _ => {
                // Same behavior for all other states, so we reuse the same code.
                self.read_content_untracked(task_done, description, note)
            }
        }
    }

    /// Read the content of the cell when avaiable. Does not register the reader
    /// as dependent task. Will trigger recomputation is no content is
    /// available.
    ///
    /// INVALIDATION: Be careful with this, it will not
    /// track dependencies, so using it could break cache invalidation.
    pub fn read_content_untracked(
        &mut self,
        task_done: bool,
        description: impl Fn() -> String + Sync + Send + 'static,
        note: impl Fn() -> String + Sync + Send + 'static,
    ) -> Result<CellContent, ReadContentError> {
        match &self.state {
            CellState::Value { content } => Ok(content.clone()),
            CellState::Empty => {
                if task_done {
                    Err(ReadContentError::Unused)
                } else {
                    let listener = self.compute(description, note);
                    Err(ReadContentError::Computing {
                        listener,
                        schedule: true,
                    })
                }
            }
            CellState::Computing { event } => {
                let listener = event.listen_with_note(note);
                Err(ReadContentError::Computing {
                    listener,
                    schedule: false,
                })
            }
            CellState::TrackedValueless => {
                let listener = self.compute(description, note);
                Err(ReadContentError::Computing {
                    listener,
                    schedule: true,
                })
            }
        }
    }

    /// Read the content of the cell when avaiable. Does not register the reader
    /// as dependent task. Will not start recomputing when content is not
    /// available.
    ///
    /// INVALIDATION: Be careful with this, it will not track
    /// dependencies, so using it could break cache invalidation.
    pub fn read_own_content_untracked(&self) -> CellContent {
        match &self.state {
            CellState::Empty | CellState::Computing { .. } | CellState::TrackedValueless => {
                CellContent(None)
            }
            CellState::Value { content } => content.to_owned(),
        }
    }

    /// Assigns a new content to the cell. Will notify dependent tasks if the
    /// content has changed.
    /// If clean = true, the task inputs weren't changes since the last
    /// execution and can be assumed to produce the same content again.
    ///
    /// Safety: This funtion does not check if the type of the content is the
    /// same as the type of the cell. It is the caller's responsibility to
    /// ensure that the content is of the correct type.
    pub fn assign(
        &mut self,
        content: CellContent,
        clean: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        match &self.state {
            CellState::Empty => {}
            CellState::Computing { event } => {
                event.notify(usize::MAX);
                if clean {
                    // We can assume that the task is deterministic and produces the same content
                    // again. No need to notify dependent tasks.
                    self.state = CellState::Value { content };
                    return;
                }
            }
            CellState::TrackedValueless => {
                if clean {
                    // We can assume that the task is deterministic and produces the same content
                    // again. No need to notify dependent tasks.
                    self.state = CellState::Value { content };
                    return;
                }
            }
            CellState::Value {
                content: cell_content,
            } => {
                if content == *cell_content {
                    return;
                }
            }
        }
        self.state = CellState::Value { content };
        // Assigning to a cell will invalidate all dependent tasks as the content might
        // have changed.
        if !self.dependent_tasks.is_empty() {
            turbo_tasks.schedule_notify_tasks_set(&self.dependent_tasks);
            self.dependent_tasks.clear();
        }
    }

    pub fn empty(
        &mut self,
        clean: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Option<CellContent> {
        let content = match replace(&mut self.state, CellState::Empty) {
            CellState::TrackedValueless | CellState::Empty => None,
            CellState::Computing { event } => {
                event.notify(usize::MAX);
                if clean {
                    // We can assume that the task is deterministic and produces the same content
                    // again. No need to notify dependent tasks.
                    return None;
                }
                None
            }
            CellState::Value { content } => Some(content),
        };
        // Assigning to a cell will invalidate all dependent tasks as the content might
        // have changed.
        if !self.dependent_tasks.is_empty() {
            turbo_tasks.schedule_notify_tasks_set(&self.dependent_tasks);
            self.dependent_tasks.clear();
        }
        content
    }

    /// Reduces memory needs to the minimum.
    pub fn shrink_to_fit(&mut self) {
        self.dependent_tasks.shrink_to_fit();
    }

    /// Returns true if the cell is current not used and could be dropped from
    /// the array.
    pub fn is_unused(&self) -> bool {
        self.dependent_tasks.is_empty() && matches!(self.state, CellState::Empty)
    }

    /// Takes the content out of the cell. Make sure to drop the content outside
    /// of the task state lock.
    #[must_use]
    pub fn gc_content(&mut self) -> Option<CellContent> {
        match self.state {
            CellState::Empty | CellState::Computing { .. } | CellState::TrackedValueless => None,
            CellState::Value { .. } => {
                let CellState::Value { content, .. } =
                    replace(&mut self.state, CellState::TrackedValueless)
                else {
                    unreachable!()
                };
                Some(content)
            }
        }
    }

    /// Drops the cell after GC. Will notify all dependent tasks and events.
    pub fn gc_drop(self, turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>) {
        if !self.dependent_tasks.is_empty() {
            turbo_tasks.schedule_notify_tasks_set(&self.dependent_tasks);
        }
        if let CellState::Computing { event } = self.state {
            event.notify(usize::MAX);
        }
    }
}
