use std::{
    cmp::Ordering,
    hash::{BuildHasher, BuildHasherDefault, Hash},
    mem::take,
    ops::{ControlFlow, Deref, DerefMut},
    sync::atomic::AtomicU32,
};

use auto_hash_map::{map::Entry, AutoMap};
use either::Either;
use parking_lot::Mutex;
use rustc_hash::FxHasher;
use turbo_tasks::{
    backend::TaskCollectiblesMap, event::Event, RawVc, TaskId, TaskIdSet, TraitTypeId,
    TurboTasksBackendApi,
};

use super::{
    meta_state::{FullTaskWriteGuard, TaskMetaStateWriteGuard},
    InProgressState, TaskStateType,
};
use crate::{
    aggregation::{
        aggregation_data, AggregationContext, AggregationDataGuard, AggregationNode,
        AggregationNodeGuard, RootQuery,
    },
    MemoryBackend,
};

pub enum RootType {
    Once,
    Root,
    ReadingStronglyConsistent,
}

#[derive(Debug, Default)]
pub struct CollectiblesInfo {
    collectibles: TaskCollectiblesMap,
    dependent_tasks: TaskIdSet,
}

impl CollectiblesInfo {
    fn is_unset(&self) -> bool {
        self.collectibles.is_empty() && self.dependent_tasks.is_empty()
    }
}

pub struct Aggregated {
    /// The number of unfinished items in the lower aggregation level.
    /// Unfinished means not "Done".
    // TODO determine if this can go negative in concurrent situations.
    pub unfinished: i32,
    /// Event that will be notified when all unfinished tasks are done.
    pub unfinished_event: Event,
    /// A list of all tasks that are unfinished. Only for debugging.
    #[cfg(feature = "track_unfinished")]
    pub unfinished_tasks: AutoMap<TaskId, i32, BuildHasherDefault<FxHasher>>,
    /// A list of all tasks that are dirty.
    /// When the it becomes active, these need to be scheduled.
    // TODO evaluate a more efficient data structure for this since we are copying the list on
    // every level.
    pub dirty_tasks: AutoMap<TaskId, i32, BuildHasherDefault<FxHasher>>,
    /// Emitted collectibles with count and dependent_tasks by trait type
    pub collectibles: AutoMap<TraitTypeId, CollectiblesInfo, BuildHasherDefault<FxHasher>>,

    /// Only used for the aggregation root. Which kind of root is this?
    /// [RootType::Once] for OnceTasks or [RootType::Root] for Root Tasks.
    /// [RootType::ReadingStronglyConsistent] while currently reading a task
    /// strongly consistent. It's set to None for other tasks, when the once
    /// task is done or when the root task is disposed.
    pub root_type: Option<RootType>,
}

impl Default for Aggregated {
    fn default() -> Self {
        Self {
            unfinished: 0,
            unfinished_event: Event::new(|| "Aggregated::unfinished_event".to_string()),
            #[cfg(feature = "track_unfinished")]
            unfinished_tasks: AutoMap::with_hasher(),
            dirty_tasks: AutoMap::with_hasher(),
            collectibles: AutoMap::with_hasher(),
            root_type: None,
        }
    }
}

impl Aggregated {
    pub(crate) fn remove_collectible_dependent_task(
        &mut self,
        trait_type: TraitTypeId,
        reader: TaskId,
    ) {
        if let Entry::Occupied(mut entry) = self.collectibles.entry(trait_type) {
            let info = entry.get_mut();
            let removed = info.dependent_tasks.remove(&reader);
            if removed && info.is_unset() {
                entry.remove();
            }
        }
    }

    pub(crate) fn read_collectibles(
        &mut self,
        trait_type: TraitTypeId,
        reader: TaskId,
    ) -> TaskCollectiblesMap {
        match self.collectibles.entry(trait_type) {
            Entry::Occupied(mut e) => {
                let info = e.get_mut();
                info.dependent_tasks.insert(reader);
                info.collectibles.clone()
            }
            Entry::Vacant(e) => {
                e.insert(CollectiblesInfo::default())
                    .dependent_tasks
                    .insert(reader);
                AutoMap::default()
            }
        }
    }
}

#[derive(Default, Debug)]
pub struct TaskChange {
    pub unfinished: i32,
    #[cfg(feature = "track_unfinished")]
    pub unfinished_tasks_update: Vec<(TaskId, i32)>,
    pub dirty_tasks_update: Vec<(TaskId, i32)>,
    pub collectibles: Vec<(TraitTypeId, RawVc, i32)>,
}

impl TaskChange {
    pub fn is_empty(&self) -> bool {
        #[allow(unused_mut, reason = "feature flag")]
        let mut empty = self.unfinished == 0
            && self.dirty_tasks_update.is_empty()
            && self.collectibles.is_empty();
        #[cfg(feature = "track_unfinished")]
        if !self.unfinished_tasks_update.is_empty() {
            empty = false;
        }
        empty
    }
}

pub struct TaskAggregationContext<'a> {
    pub turbo_tasks: &'a dyn TurboTasksBackendApi<MemoryBackend>,
    pub backend: &'a MemoryBackend,
    pub dirty_tasks_to_schedule: Mutex<Option<TaskIdSet>>,
    pub tasks_to_notify: Mutex<Option<TaskIdSet>>,
}

impl<'a> TaskAggregationContext<'a> {
    pub fn new(
        turbo_tasks: &'a dyn TurboTasksBackendApi<MemoryBackend>,
        backend: &'a MemoryBackend,
    ) -> Self {
        Self {
            turbo_tasks,
            backend,
            dirty_tasks_to_schedule: Mutex::new(None),
            tasks_to_notify: Mutex::new(None),
        }
    }

    pub fn apply_queued_updates(&mut self) {
        {
            let mut _span = None;
            let tasks = self.dirty_tasks_to_schedule.get_mut();
            if let Some(tasks) = tasks.as_mut() {
                let tasks = take(tasks);
                if !tasks.is_empty() {
                    _span.get_or_insert_with(|| {
                        tracing::trace_span!("task aggregation apply_queued_updates").entered()
                    });
                    self.backend
                        .schedule_when_dirty_from_aggregation(tasks, self.turbo_tasks);
                }
            }
        }
        let tasks = self.tasks_to_notify.get_mut();
        if let Some(tasks) = tasks.as_mut() {
            let tasks = take(tasks);
            if !tasks.is_empty() {
                self.turbo_tasks.schedule_notify_tasks_set(&tasks);
            }
        }
    }

    pub fn aggregation_data(&self, id: TaskId) -> AggregationDataGuard<TaskGuard<'_>> {
        aggregation_data(self, &id)
    }
}

#[cfg(debug_assertions)]
impl Drop for TaskAggregationContext<'_> {
    fn drop(&mut self) {
        let tasks_to_schedule = self.dirty_tasks_to_schedule.get_mut();
        if let Some(tasks_to_schedule) = tasks_to_schedule.as_ref() {
            if !tasks_to_schedule.is_empty() {
                panic!("TaskAggregationContext dropped without scheduling all tasks");
            }
        }
        let tasks_to_notify = self.tasks_to_notify.get_mut();
        if let Some(tasks_to_notify) = tasks_to_notify.as_ref() {
            if !tasks_to_notify.is_empty() {
                panic!("TaskAggregationContext dropped without notifying all tasks");
            }
        }
    }
}

impl AggregationContext for TaskAggregationContext<'_> {
    type Guard<'l>
        = TaskGuard<'l>
    where
        Self: 'l;
    type Data = Aggregated;
    type DataChange = TaskChange;
    type NodeRef = TaskId;

    fn node<'b>(&'b self, reference: &TaskId) -> Self::Guard<'b> {
        let task = self.backend.task(*reference);
        TaskGuard::new(*reference, task.state_mut())
    }

    fn node_pair<'l>(
        &'l self,
        id1: &Self::NodeRef,
        id2: &Self::NodeRef,
    ) -> (Self::Guard<'l>, Self::Guard<'l>) {
        let task1 = self.backend.task(*id1);
        let task2 = self.backend.task(*id2);
        loop {
            {
                let state1 = task1.state_mut();
                if let Some(state2) = task2.try_state_mut() {
                    return (TaskGuard::new(*id1, state1), TaskGuard::new(*id2, state2));
                }
            }
            {
                let state2 = task2.state_mut();
                if let Some(state1) = task1.try_state_mut() {
                    return (TaskGuard::new(*id1, state1), TaskGuard::new(*id2, state2));
                }
            }
        }
    }

    fn atomic_in_progress_counter<'l>(&self, id: &'l TaskId) -> &'l AtomicU32
    where
        Self: 'l,
    {
        &self
            .backend
            .task(*id)
            .graph_modification_in_progress_counter
    }

    fn apply_change(
        &self,
        info: &mut Aggregated,
        change: &Self::DataChange,
    ) -> Option<Self::DataChange> {
        let mut unfinished = 0;
        if info.unfinished > 0 {
            info.unfinished += change.unfinished;
            if info.unfinished <= 0 {
                info.unfinished_event.notify(usize::MAX);
                unfinished = -1;
            }
        } else {
            info.unfinished += change.unfinished;
            if info.unfinished > 0 {
                unfinished = 1;
            }
        }
        #[cfg(feature = "track_unfinished")]
        let mut unfinished_tasks_update = Vec::new();
        #[cfg(feature = "track_unfinished")]
        for &(task, count) in change.unfinished_tasks_update.iter() {
            match update_count_entry(info.unfinished_tasks.entry(task), count) {
                (_, UpdateCountEntryChange::Removed) => unfinished_tasks_update.push((task, -1)),
                (_, UpdateCountEntryChange::Inserted) => unfinished_tasks_update.push((task, 1)),
                _ => {}
            }
        }
        let mut dirty_tasks_update = Vec::new();
        let is_root = info.root_type.is_some();
        for &(task, count) in change.dirty_tasks_update.iter() {
            match update_count_entry(info.dirty_tasks.entry(task), count) {
                (_, UpdateCountEntryChange::Removed) => dirty_tasks_update.push((task, -1)),
                (_, UpdateCountEntryChange::Inserted) => {
                    if is_root {
                        let mut tasks_to_schedule = self.dirty_tasks_to_schedule.lock();
                        tasks_to_schedule.get_or_insert_default().insert(task);
                    }
                    dirty_tasks_update.push((task, 1))
                }
                _ => {}
            }
        }
        for &(trait_type_id, collectible, count) in change.collectibles.iter() {
            let collectibles_info_entry = info.collectibles.entry(trait_type_id);
            match collectibles_info_entry {
                Entry::Occupied(mut e) => {
                    let collectibles_info = e.get_mut();
                    let (value, _) = update_count_entry(
                        collectibles_info.collectibles.entry(collectible),
                        count,
                    );
                    if !collectibles_info.dependent_tasks.is_empty() {
                        self.tasks_to_notify
                            .lock()
                            .get_or_insert_default()
                            .extend(take(&mut collectibles_info.dependent_tasks).into_iter());
                    }
                    if value == 0 && collectibles_info.is_unset() {
                        e.remove();
                    }
                }
                Entry::Vacant(e) => {
                    let mut collectibles_info = CollectiblesInfo::default();
                    collectibles_info.collectibles.insert(collectible, count);
                    e.insert(collectibles_info);
                }
            }
        }
        #[cfg(feature = "track_unfinished")]
        if info.unfinished > 0 && info.unfinished_tasks.is_empty()
            || info.unfinished == 0 && !info.unfinished_tasks.is_empty()
        {
            panic!(
                "inconsistent state: unfinished {}, unfinished_tasks {:?}, change {:?}",
                info.unfinished, info.unfinished_tasks, change
            );
        }
        let new_change = TaskChange {
            unfinished,
            #[cfg(feature = "track_unfinished")]
            unfinished_tasks_update,
            dirty_tasks_update,
            collectibles: change.collectibles.clone(),
        };
        if new_change.is_empty() {
            None
        } else {
            Some(new_change)
        }
    }

    fn data_to_add_change(&self, data: &Aggregated) -> Option<Self::DataChange> {
        let mut change = TaskChange::default();
        if data.unfinished > 0 {
            change.unfinished = 1;
        }
        #[cfg(feature = "track_unfinished")]
        for (&task, &count) in data.unfinished_tasks.iter() {
            if count > 0 {
                change.unfinished_tasks_update.push((task, 1));
            }
        }
        for (&task, &count) in data.dirty_tasks.iter() {
            if count > 0 {
                change.dirty_tasks_update.push((task, 1));
            }
        }
        for (trait_type_id, collectibles_info) in data.collectibles.iter() {
            for (collectible, count) in collectibles_info.collectibles.iter() {
                change
                    .collectibles
                    .push((*trait_type_id, *collectible, *count));
            }
        }
        if change.is_empty() {
            None
        } else {
            Some(change)
        }
    }

    fn data_to_remove_change(&self, data: &Aggregated) -> Option<Self::DataChange> {
        let mut change = TaskChange::default();
        if data.unfinished > 0 {
            change.unfinished = -1;
        }
        #[cfg(feature = "track_unfinished")]
        for (&task, &count) in data.unfinished_tasks.iter() {
            change.unfinished_tasks_update.push((task, -count));
        }
        for (&task, &count) in data.dirty_tasks.iter() {
            if count > 0 {
                change.dirty_tasks_update.push((task, -1));
            }
        }
        for (trait_type_id, collectibles_info) in data.collectibles.iter() {
            for (collectible, count) in collectibles_info.collectibles.iter() {
                change
                    .collectibles
                    .push((*trait_type_id, *collectible, -*count));
            }
        }
        if change.is_empty() {
            None
        } else {
            Some(change)
        }
    }
}

#[derive(Default)]
pub struct ActiveQuery {
    active: bool,
}

impl RootQuery for ActiveQuery {
    type Data = Aggregated;
    type Result = bool;

    fn query(&mut self, data: &Self::Data) -> ControlFlow<()> {
        if data.root_type.is_some() {
            self.active = true;
            ControlFlow::Break(())
        } else {
            ControlFlow::Continue(())
        }
    }

    fn result(self) -> Self::Result {
        self.active
    }
}

pub struct TaskGuard<'l> {
    id: TaskId,
    guard: TaskMetaStateWriteGuard<'l>,
}

impl<'l> TaskGuard<'l> {
    pub fn new(id: TaskId, mut guard: TaskMetaStateWriteGuard<'l>) -> Self {
        guard.ensure_at_least_partial();
        Self { id, guard }
    }

    pub fn from_full(id: TaskId, guard: FullTaskWriteGuard<'l>) -> Self {
        Self {
            id,
            guard: TaskMetaStateWriteGuard::Full(guard),
        }
    }

    pub fn into_inner(self) -> TaskMetaStateWriteGuard<'l> {
        self.guard
    }
}

impl Deref for TaskGuard<'_> {
    type Target = AggregationNode<
        <Self as AggregationNodeGuard>::NodeRef,
        <Self as AggregationNodeGuard>::Data,
    >;

    fn deref(&self) -> &Self::Target {
        match self.guard {
            TaskMetaStateWriteGuard::Full(ref guard) => &guard.aggregation_node,
            TaskMetaStateWriteGuard::Partial(ref guard) => &guard.aggregation_node,
            TaskMetaStateWriteGuard::Unloaded(_) => unreachable!(),
            TaskMetaStateWriteGuard::TemporaryFiller => unreachable!(),
        }
    }
}

impl DerefMut for TaskGuard<'_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        match self.guard {
            TaskMetaStateWriteGuard::Full(ref mut guard) => &mut guard.aggregation_node,
            TaskMetaStateWriteGuard::Partial(ref mut guard) => &mut guard.aggregation_node,
            TaskMetaStateWriteGuard::Unloaded(_) => unreachable!(),
            TaskMetaStateWriteGuard::TemporaryFiller => unreachable!(),
        }
    }
}

impl AggregationNodeGuard for TaskGuard<'_> {
    type Data = Aggregated;
    type NodeRef = TaskId;
    type DataChange = TaskChange;
    type ChildrenIter<'a>
        = impl Iterator<Item = TaskId> + 'a
    where
        Self: 'a;

    fn children(&self) -> Self::ChildrenIter<'_> {
        match self.guard {
            TaskMetaStateWriteGuard::Full(ref guard) => Either::Left(guard.state_type.children()),
            TaskMetaStateWriteGuard::Partial(_) | TaskMetaStateWriteGuard::Unloaded(_) => {
                Either::Right(std::iter::empty())
            }
            TaskMetaStateWriteGuard::TemporaryFiller => unreachable!(),
        }
    }

    fn get_add_change(&self) -> Option<Self::DataChange> {
        match self.guard {
            TaskMetaStateWriteGuard::Full(ref guard) => {
                let mut change = TaskChange::default();
                if !matches!(
                    guard.state_type,
                    TaskStateType::Done { .. }
                        | TaskStateType::InProgress (box InProgressState{
                            count_as_finished: true,
                            ..
                        })
                ) {
                    change.unfinished = 1;
                    #[cfg(feature = "track_unfinished")]
                    change.unfinished_tasks_update.push((self.id, 1));
                }
                if matches!(guard.state_type, TaskStateType::Dirty { .. }) {
                    change.dirty_tasks_update.push((self.id, 1));
                }
                if let Some(collectibles) = guard.collectibles.as_ref() {
                    for (&(trait_type_id, collectible), count) in collectibles.iter() {
                        change
                            .collectibles
                            .push((trait_type_id, collectible, *count));
                    }
                }
                if let TaskStateType::InProgress(box InProgressState {
                    outdated_collectibles,
                    ..
                }) = &guard.state_type
                {
                    if let Some(collectibles) = outdated_collectibles.as_ref() {
                        for (&(trait_type_id, collectible), count) in collectibles.iter() {
                            change
                                .collectibles
                                .push((trait_type_id, collectible, *count));
                        }
                    }
                }
                if change.is_empty() {
                    None
                } else {
                    Some(change)
                }
            }
            TaskMetaStateWriteGuard::Partial(_) | TaskMetaStateWriteGuard::Unloaded(_) => {
                Some(TaskChange {
                    unfinished: 1,
                    dirty_tasks_update: vec![(self.id, 1)],
                    collectibles: vec![],
                })
            }
            TaskMetaStateWriteGuard::TemporaryFiller => unreachable!(),
        }
    }

    fn get_remove_change(&self) -> Option<Self::DataChange> {
        match self.guard {
            TaskMetaStateWriteGuard::Full(ref guard) => {
                let mut change = TaskChange::default();
                if !matches!(
                    guard.state_type,
                    TaskStateType::Done { .. }
                        | TaskStateType::InProgress (box InProgressState{
                            count_as_finished: true,
                            ..
                        })
                ) {
                    change.unfinished = -1;
                    #[cfg(feature = "track_unfinished")]
                    change.unfinished_tasks_update.push((self.id, -1));
                }
                if matches!(guard.state_type, TaskStateType::Dirty { .. }) {
                    change.dirty_tasks_update.push((self.id, -1));
                }
                if let Some(collectibles) = guard.collectibles.as_ref() {
                    for (&(trait_type_id, collectible), count) in collectibles.iter() {
                        change
                            .collectibles
                            .push((trait_type_id, collectible, -*count));
                    }
                }
                if let TaskStateType::InProgress(box InProgressState {
                    outdated_collectibles,
                    ..
                }) = &guard.state_type
                {
                    if let Some(collectibles) = outdated_collectibles.as_ref() {
                        for (&(trait_type_id, collectible), count) in collectibles.iter() {
                            change
                                .collectibles
                                .push((trait_type_id, collectible, -*count));
                        }
                    }
                }
                if change.is_empty() {
                    None
                } else {
                    Some(change)
                }
            }
            TaskMetaStateWriteGuard::Partial(_) | TaskMetaStateWriteGuard::Unloaded(_) => {
                Some(TaskChange {
                    unfinished: -1,
                    dirty_tasks_update: vec![(self.id, -1)],
                    collectibles: vec![],
                })
            }
            TaskMetaStateWriteGuard::TemporaryFiller => unreachable!(),
        }
    }

    fn get_initial_data(&self) -> Self::Data {
        let mut data = Aggregated::default();
        if let Some(TaskChange {
            unfinished,
            #[cfg(feature = "track_unfinished")]
            unfinished_tasks_update,
            dirty_tasks_update,
            collectibles,
        }) = self.get_add_change()
        {
            data.unfinished = unfinished;
            #[cfg(feature = "track_unfinished")]
            {
                data.unfinished_tasks = unfinished_tasks_update.into_iter().collect();
            }
            for (t, n) in dirty_tasks_update.into_iter() {
                data.dirty_tasks.insert(t, n);
            }
            for (trait_type_id, collectible, count) in collectibles.into_iter() {
                let info = data.collectibles.entry(trait_type_id).or_default();
                update_count_entry(info.collectibles.entry(collectible), count);
            }
        }
        data
    }
}

pub type TaskAggregationNode = AggregationNode<TaskId, Aggregated>;

enum UpdateCountEntryChange {
    Removed,
    Inserted,
    Updated,
}

fn update_count_entry<K: Eq + Hash, H: BuildHasher + Default, const I: usize>(
    entry: Entry<'_, K, i32, H, I>,
    update: i32,
) -> (i32, UpdateCountEntryChange) {
    match entry {
        Entry::Occupied(mut e) => {
            let value = e.get_mut();
            if *value < 0 {
                *value += update;
                match (*value).cmp(&0) {
                    Ordering::Less => (*value, UpdateCountEntryChange::Updated),
                    Ordering::Equal => {
                        e.remove();
                        (0, UpdateCountEntryChange::Updated)
                    }
                    Ordering::Greater => (*value, UpdateCountEntryChange::Inserted),
                }
            } else {
                *value += update;
                match (*value).cmp(&0) {
                    Ordering::Less => (*value, UpdateCountEntryChange::Removed),
                    Ordering::Equal => {
                        e.remove();
                        (0, UpdateCountEntryChange::Removed)
                    }
                    Ordering::Greater => (*value, UpdateCountEntryChange::Updated),
                }
            }
        }
        Entry::Vacant(e) => match update.cmp(&0) {
            Ordering::Less => {
                e.insert(update);
                (update, UpdateCountEntryChange::Updated)
            }
            Ordering::Equal => (0, UpdateCountEntryChange::Updated),
            Ordering::Greater => {
                e.insert(update);
                (update, UpdateCountEntryChange::Inserted)
            }
        },
    }
}
