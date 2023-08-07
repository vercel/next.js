use std::marker::PhantomData;

use auto_hash_map::AutoSet;
// This specific macro identifier is detected by turbo-tasks-build.
use turbo_tasks_macros::primitive as __turbo_tasks_internal_primitive;

use crate as turbo_tasks;
use crate::{RawVc, TaskId, Vc};

__turbo_tasks_internal_primitive!(AutoSet<RawVc>);

impl Vc<AutoSet<RawVc>> {
    /// Casts a `TaskId` to a `Vc<AutoSet<RawVc>>`.
    ///
    /// # Safety
    ///
    /// The `TaskId` must be point to a valid `AutoSet<RawVc>`.
    pub unsafe fn from_task_id(task_id: TaskId) -> Self {
        Vc {
            node: RawVc::TaskOutput(task_id),
            _t: PhantomData,
        }
    }
}
