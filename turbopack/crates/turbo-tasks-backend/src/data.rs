use turbo_tasks::{util::SharedError, CellId, KeyValuePair, SharedReference, TaskId};

#[derive(Debug, Copy, Clone, Hash, PartialEq, Eq)]
pub struct CellRef {
    task: TaskId,
    cell: CellId,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum OutputValue {
    Cell(CellRef),
    Output(TaskId),
    Error,
}
impl OutputValue {
    fn is_transient(&self) -> bool {
        match self {
            OutputValue::Cell(cell) => cell.task.is_transient(),
            OutputValue::Output(task) => task.is_transient(),
            OutputValue::Error => false,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum RootType {
    RootTask,
    OnceTask,
    ReadingStronglyConsistent,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum InProgressState {
    Scheduled { clean: bool },
    InProgress { clean: bool, stale: bool },
}

#[derive(Debug, Clone, KeyValuePair)]
pub enum CachedDataItem {
    // Output
    Output {
        value: OutputValue,
    },
    Collectible {
        collectible: CellRef,
        value: (),
    },

    // State
    Dirty {
        value: (),
    },
    DirtyWhenPersisted {
        value: (),
    },

    // Children
    Child {
        task: TaskId,
        value: (),
    },

    // Cells
    CellData {
        cell: CellId,
        value: SharedReference,
    },

    // Dependencies
    OutputDependency {
        target: TaskId,
        value: (),
    },
    CellDependency {
        target: CellRef,
        value: (),
    },

    // Dependent
    OutputDependent {
        task: TaskId,
        value: (),
    },
    CellDependent {
        cell: CellId,
        task: TaskId,
        value: (),
    },

    // Aggregation Graph
    AggregationNumber {
        value: u32,
    },
    Follower {
        task: TaskId,
        value: (),
    },
    Upper {
        task: TaskId,
        value: (),
    },

    // Aggregated Data
    AggregatedDirtyTask {
        task: TaskId,
        value: (),
    },
    AggregatedCollectible {
        collectible: CellRef,
        value: (),
    },
    AggregatedUnfinishedTasks {
        value: u32,
    },

    // Transient Root Type
    AggregateRootType {
        value: RootType,
    },

    // Transient In Progress state
    InProgress {
        value: InProgressState,
    },
    OutdatedCollectible {
        collectible: CellRef,
        value: (),
    },
    OutdatedOutputDependency {
        target: TaskId,
        value: (),
    },
    OutdatedCellDependency {
        target: CellRef,
        value: (),
    },

    // Transient Error State
    Error {
        value: SharedError,
    },
}

impl CachedDataItem {
    pub fn is_persistent(&self) -> bool {
        match self {
            CachedDataItem::Output { value } => value.is_transient(),
            CachedDataItem::Collectible { collectible, .. } => !collectible.task.is_transient(),
            CachedDataItem::Dirty { .. } => true,
            CachedDataItem::DirtyWhenPersisted { .. } => true,
            CachedDataItem::Child { task, .. } => !task.is_transient(),
            CachedDataItem::CellData { .. } => true,
            CachedDataItem::OutputDependency { target, .. } => !target.is_transient(),
            CachedDataItem::CellDependency { target, .. } => !target.task.is_transient(),
            CachedDataItem::OutputDependent { task, .. } => !task.is_transient(),
            CachedDataItem::CellDependent { task, .. } => !task.is_transient(),
            CachedDataItem::AggregationNumber { .. } => true,
            CachedDataItem::Follower { task, .. } => !task.is_transient(),
            CachedDataItem::Upper { task, .. } => !task.is_transient(),
            CachedDataItem::AggregatedDirtyTask { task, .. } => !task.is_transient(),
            CachedDataItem::AggregatedCollectible { collectible, .. } => {
                !collectible.task.is_transient()
            }
            CachedDataItem::AggregatedUnfinishedTasks { .. } => true,
            CachedDataItem::AggregateRootType { .. } => false,
            CachedDataItem::InProgress { .. } => false,
            CachedDataItem::OutdatedCollectible { .. } => false,
            CachedDataItem::OutdatedOutputDependency { .. } => false,
            CachedDataItem::OutdatedCellDependency { .. } => false,
            CachedDataItem::Error { .. } => false,
        }
    }
}

impl CachedDataItemKey {
    pub fn is_persistent(&self) -> bool {
        match self {
            CachedDataItemKey::Output { .. } => true,
            CachedDataItemKey::Collectible { collectible, .. } => !collectible.task.is_transient(),
            CachedDataItemKey::Dirty { .. } => true,
            CachedDataItemKey::DirtyWhenPersisted { .. } => true,
            CachedDataItemKey::Child { task, .. } => !task.is_transient(),
            CachedDataItemKey::CellData { .. } => true,
            CachedDataItemKey::OutputDependency { target, .. } => !target.is_transient(),
            CachedDataItemKey::CellDependency { target, .. } => !target.task.is_transient(),
            CachedDataItemKey::OutputDependent { task, .. } => !task.is_transient(),
            CachedDataItemKey::CellDependent { task, .. } => !task.is_transient(),
            CachedDataItemKey::AggregationNumber { .. } => true,
            CachedDataItemKey::Follower { task, .. } => !task.is_transient(),
            CachedDataItemKey::Upper { task, .. } => !task.is_transient(),
            CachedDataItemKey::AggregatedDirtyTask { task, .. } => !task.is_transient(),
            CachedDataItemKey::AggregatedCollectible { collectible, .. } => {
                !collectible.task.is_transient()
            }
            CachedDataItemKey::AggregatedUnfinishedTasks { .. } => true,
            CachedDataItemKey::AggregateRootType { .. } => false,
            CachedDataItemKey::InProgress { .. } => false,
            CachedDataItemKey::OutdatedCollectible { .. } => false,
            CachedDataItemKey::OutdatedOutputDependency { .. } => false,
            CachedDataItemKey::OutdatedCellDependency { .. } => false,
            CachedDataItemKey::Error { .. } => false,
        }
    }
}

impl CachedDataItemValue {
    pub fn is_persistent(&self) -> bool {
        match self {
            CachedDataItemValue::Output { value } => !value.is_transient(),
            _ => true,
        }
    }
}

trait IsDefault {
    fn is_default(&self) -> bool;
}

pub struct CachedDataUpdate {
    pub task: TaskId,
    pub key: CachedDataItemKey,
    pub value: Option<CachedDataItemValue>,
}
