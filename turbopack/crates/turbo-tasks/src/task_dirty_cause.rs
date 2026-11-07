use bincode::{Decode, Encode};
use smallvec::SmallVec;

use crate::{FunctionId, TraitTypeId, ValueTypeId, registry};

#[derive(Encode, Decode, Clone, Debug, PartialEq, Eq)]
pub enum TaskDirtyCause {
    InitialDirty,
    CellChange {
        value_type: ValueTypeId,
        keys: SmallVec<[Option<u64>; 2]>,
    },
    CellRemoved {
        value_type: ValueTypeId,
    },
    OutputChange {
        function: FunctionId,
    },
    RootOutputChange,
    CollectiblesChange {
        collectible_type: TraitTypeId,
    },
    Invalidator,
    Unknown,
}

// NOTE: `TaskDirtyCause` is formatted for tracing inside `make_task_dirty_internal`, which
// already holds the dependent task's `StorageWriteGuard`. The `Display` impl below must NOT
// acquire any task guard — doing so would take a second map shard write lock with no ordering
// guarantee against the first and two concurrent invalidations of each other's outputs would
// form a classic hold-and-wait deadlock on the dashmap. The function name lookup via
// `get_native_function` only touches the global function registry and never acquires a task
// guard, so it is safe. The `TaskLockCounter` debug-assert that normally catches this kind
// of nested acquire is `cfg(debug_assertions)`-only, so release builds hang silently.
impl std::fmt::Display for TaskDirtyCause {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskDirtyCause::InitialDirty => write!(f, "initial dirty"),
            TaskDirtyCause::CellChange { value_type, keys } => {
                if keys.is_empty() {
                    write!(
                        f,
                        "{} cell changed",
                        registry::get_value_type(*value_type).ty.name
                    )
                } else {
                    write!(
                        f,
                        "{} cell changed (keys: {})",
                        registry::get_value_type(*value_type).ty.name,
                        keys.iter()
                            .map(|key| match key {
                                Some(k) => k.to_string(),
                                None => "*".to_string(),
                            })
                            .collect::<Vec<_>>()
                            .join(", ")
                    )
                }
            }
            TaskDirtyCause::CellRemoved { value_type } => {
                write!(
                    f,
                    "{} cell removed",
                    registry::get_value_type(*value_type).ty.name
                )
            }
            TaskDirtyCause::OutputChange { function } => {
                write!(
                    f,
                    "{} output changed",
                    registry::get_native_function(*function).ty.name
                )
            }
            TaskDirtyCause::RootOutputChange => {
                write!(f, "root output changed")
            }
            TaskDirtyCause::CollectiblesChange { collectible_type } => {
                write!(
                    f,
                    "{} collectible changed",
                    registry::get_trait(*collectible_type).ty.name
                )
            }
            TaskDirtyCause::Invalidator => write!(f, "invalidator"),
            TaskDirtyCause::Unknown => write!(f, "unknown"),
        }
    }
}
