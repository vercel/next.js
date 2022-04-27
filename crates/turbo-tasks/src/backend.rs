use crate::{Task, TaskId};

pub trait Backend: Sync + Send {
    unsafe fn insert_task(&self, id: TaskId, task: Task);
    unsafe fn remove_task(&self, id: TaskId);
    fn with_task<T>(&self, id: TaskId, func: impl FnOnce(&Task) -> T) -> T;
}
