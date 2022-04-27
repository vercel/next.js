use crate::{backend::Backend, no_move_vec::NoMoveVec, Task};

pub struct MemoryBackend {
    memory_tasks: NoMoveVec<Task, 13>,
}

impl MemoryBackend {
    pub fn new() -> Self {
        Self {
            memory_tasks: NoMoveVec::new(),
        }
    }
}

impl Backend for MemoryBackend {
    /// SAFETY: id must be a fresh id
    unsafe fn insert_task(&self, id: crate::TaskId, task: Task) {
        unsafe {
            self.memory_tasks.insert(*id, task);
        }
    }

    /// SAFETY: id must no longer be used
    unsafe fn remove_task(&self, id: crate::TaskId) {
        unsafe {
            self.memory_tasks.remove(*id);
        }
    }

    fn with_task<T>(&self, id: crate::TaskId, func: impl FnOnce(&Task) -> T) -> T {
        func(&self.memory_tasks.get(*id).unwrap())
    }
}
