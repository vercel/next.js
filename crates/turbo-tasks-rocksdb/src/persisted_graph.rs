use std::{
    collections::HashSet,
    fmt::Debug,
    path::Path,
    sync::atomic::{AtomicU8, AtomicUsize, Ordering},
};

use anyhow::{anyhow, Error, Result};
use bincode::Options;
use flurry::HashMap;
use turbo_tasks::{
    backend::PersistentTaskType,
    persisted_graph::{
        ActivateResult, DeactivateResult, PersistResult, PersistTaskState, PersistedGraph,
        PersistedGraphApi, ReadTaskState, TaskData, TaskSlot,
    },
    util::{InfiniteVec, SharedError},
    with_task_id_mapping, FunctionId, IdMapping, TaskId,
};

use crate::db::InternalTaskState;

use super::db::{Database, PartialTaskData, TaskState, TaskStateChange};

fn task_type_to_bytes(ty: &PersistentTaskType) -> Result<Vec<u8>, bincode::Error> {
    let mut result = Vec::new();
    let opt = bincode::DefaultOptions::new();
    let inputs = match ty {
        PersistentTaskType::Native(f, i) => {
            result.push(0);
            opt.serialize_into(&mut result, f)?;
            i
        }
        PersistentTaskType::ResolveNative(f, i) => {
            result.push(1);
            opt.serialize_into(&mut result, f)?;
            i
        }
        PersistentTaskType::ResolveTrait(t, n, i) => {
            result.push(2);
            opt.serialize_into(&mut result, t)?;
            opt.serialize_into(&mut result, n)?;
            i
        }
    };
    for input in inputs {
        opt.serialize_into(&mut result, input)?;
    }
    Ok(result)
}

#[derive(Default)]
pub struct ReadsByFunction(pub InfiniteVec<AtomicUsize>);

impl Debug for ReadsByFunction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut m = f.debug_map();
        for (fn_id, count) in self.0.iter() {
            let i = count.load(Ordering::Relaxed);
            if i > 0 {
                m.entry(&FunctionId::from(fn_id), &i);
            }
        }
        m.finish()
    }
}

#[derive(Default, Debug)]
pub struct Stats {
    lookups: AtomicUsize,
    reads: AtomicUsize,
    reads_by_function: ReadsByFunction,
    activates: AtomicUsize,
    deactivates: AtomicUsize,
    persists: AtomicUsize,
    cleans: AtomicUsize,
    dependent_dirty: AtomicUsize,
    dirties: AtomicUsize,
    flaggings: AtomicUsize,
}

const AC_UNKNOWN: u8 = 0;
const AC_ACTIVE: u8 = 1;
const AC_INACTIVE: u8 = 2;

pub struct RocksDbPersistedGraph {
    database: Database,
    task_id_forward_mapping: HashMap<TaskId, TaskId>,
    task_id_backward_mapping: HashMap<TaskId, TaskId>,
    last_task_id: AtomicUsize,
    #[cfg(feature = "unsafe_once_map")]
    cache_once: turbo_tasks::util::OnceConcurrentlyMap<[u8], Result<usize, SharedError>>,
    #[cfg(not(feature = "unsafe_once_map"))]
    cache_once: turbo_tasks::util::SafeOnceConcurrentlyMap<Vec<u8>, Result<usize, SharedError>>,
    stats: Stats,
    /// AC_UNKNOWN | AC_ACTIVE | AC_INACTIVE
    active_cache: InfiniteVec<AtomicU8>,
}

impl RocksDbPersistedGraph {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let db = Database::open(path)?;
        let last_id = db.last_task_id.get()?.unwrap_or_default();
        Ok(Self {
            database: db,
            task_id_forward_mapping: HashMap::new(),
            task_id_backward_mapping: HashMap::new(),
            last_task_id: AtomicUsize::new(last_id),
            #[cfg(feature = "unsafe_once_map")]
            cache_once: turbo_tasks::util::OnceConcurrentlyMap::new(),
            #[cfg(not(feature = "unsafe_once_map"))]
            cache_once: turbo_tasks::util::SafeOnceConcurrentlyMap::new(),
            stats: Stats::default(),
            active_cache: InfiniteVec::new(),
        })
    }

    fn with_task_id_mapping<T>(&self, api: &dyn PersistedGraphApi, func: impl FnOnce() -> T) -> T {
        with_task_id_mapping(PgApiMapping::new(self, api), func)
    }

    fn with_read_only_task_id_mapping<T>(
        &self,
        api: &dyn PersistedGraphApi,
        func: impl FnOnce() -> T,
    ) -> T {
        with_task_id_mapping(PgApiReadOnlyMapping::new(self, api), func)
    }

    fn get_task_type(&self, ty: &PersistentTaskType) -> Result<Option<usize>> {
        let db = &self.database;
        let ty_bytes = task_type_to_bytes(ty)?;
        Ok(db.cache.get(&ty_bytes)?)
    }

    fn get_or_create_task_type(&self, ty: &PersistentTaskType) -> Result<usize> {
        let db = &self.database;
        let ty_bytes = task_type_to_bytes(ty)?;
        if let Some(id) = db.cache.get(&ty_bytes)? {
            return Ok(id);
        }
        Ok(self.cache_once.action(&ty_bytes, || {
            if let Some(id) = db.cache.get(&ty_bytes)? {
                return Ok(id);
            }
            let b = &mut db.batch();
            db.last_task_id
                .merge(b, &1)
                .map_err::<Error, _>(|e| e.into())?;
            let id = self.last_task_id.fetch_add(1, Ordering::Relaxed) + 1;
            db.task_type
                .write(b, &id, ty)
                .map_err::<Error, _>(|e| e.into())?;
            b.write().map_err::<Error, _>(|e| e.into())?;
            // Need to write it in two steps due to unordered writes
            // Once it's in "cache" it can be discovered by lookups
            let b = &mut db.batch();
            db.cache
                .write(b, &ty_bytes, &id)
                .map_err::<Error, _>(|e| e.into())?;
            b.write().map_err::<Error, _>(|e| e.into())?;
            Ok(id)
        })?)
    }

    fn lookup_task_type(&self, id: usize) -> Result<PersistentTaskType> {
        let db = &self.database;
        Ok(db
            .task_type
            .get(&id)?
            .ok_or_else(|| anyhow!("Invalid task id {}", id))?)
    }

    fn get_active(&self, task: TaskId) -> Result<bool> {
        let ac = self.active_cache.get(*task);
        let ac_value = ac.load(Ordering::Acquire);
        if ac_value != AC_UNKNOWN {
            return Ok(ac_value == AC_ACTIVE);
        }
        let db = &self.database;
        if let Some(TaskState { active, .. }) = db.state.get(&task)? {
            ac.store(
                if active { AC_ACTIVE } else { AC_INACTIVE },
                Ordering::Release,
            );
            return Ok(active);
        }
        Ok(false)
    }

    fn print_db(&self, api: &dyn PersistedGraphApi) -> Result<()> {
        let db = &self.database;
        let mapping = PgApiMapping::new(self, api);
        for (task, state) in db.state.get_all()? {
            let ty = db.task_type.get(&*mapping.forward(task));
            println!("# {task} {ty:?} {state:?}");
            if let Ok(Some(children)) = db.children.get(&task) {
                println!("# children: {children:?}");
            }
        }
        Ok(())
    }
}

impl PersistedGraph for RocksDbPersistedGraph {
    fn read(
        &self,
        task: TaskId,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<(TaskData, ReadTaskState)>> {
        let db_task = PgApiReadOnlyMapping::new(self, api).forward(task);
        if db_task == TaskId::from(0) {
            return Ok(None);
        }
        self.stats.reads.fetch_add(1, Ordering::Relaxed);
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            if let Some(data) = db.data.get(&task)? {
                if let Some(TaskState {
                    internal: Some(InternalTaskState { clean }),
                    active_parents,
                    ..
                }) = db.state.get(&task)?
                {
                    let ty = db.task_type.get(&*db_task)?.unwrap();
                    match ty {
                        PersistentTaskType::Native(f, _)
                        | PersistentTaskType::ResolveNative(f, _) => {
                            self.stats
                                .reads_by_function
                                .0
                                .get(*f)
                                .fetch_add(1, Ordering::Relaxed);
                        }
                        _ => {}
                    }
                    return Ok(Some((
                        data,
                        ReadTaskState {
                            clean,
                            keeps_external_active: active_parents > 0,
                        },
                    )));
                }
            }
            Ok(None)
        })
    }

    fn is_persisted(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<bool> {
        let db_task = PgApiReadOnlyMapping::new(self, api).forward(task);
        if db_task == TaskId::from(0) {
            return Ok(false);
        }
        let db = &self.database;
        if let Some(TaskState {
            internal: Some(_), ..
        }) = db.state.get(&db_task)?
        {
            Ok(true)
        } else {
            Ok(false)
        }
    }

    fn lookup_one(
        &self,
        task_type: &PersistentTaskType,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<TaskId>> {
        self.stats.lookups.fetch_add(1, Ordering::Relaxed);
        self.with_read_only_task_id_mapping(api, || {
            let db = &self.database;
            if let Some(id) = db.cache.get(&task_type_to_bytes(&task_type)?)? {
                let task = PgApiMapping::new(self, api).backward(TaskId::from(id));
                if let Some(TaskState {
                    internal: Some(_), ..
                }) = db.state.get(&task)?
                {
                    return Ok(Some(task));
                }
            }
            Ok(None)
        })
    }

    fn lookup(
        &self,
        partial_task_type: &PersistentTaskType,
        api: &dyn PersistedGraphApi,
    ) -> Result<bool> {
        self.stats.lookups.fetch_add(1, Ordering::Relaxed);
        self.with_read_only_task_id_mapping(api, || {
            let db = &self.database;
            let db_result = db
                .cache
                .get_prefix(&task_type_to_bytes(&partial_task_type)?, 1000)?;
            let mapping = PgApiMapping::new(self, api);
            for id in db_result.0 {
                mapping.backward(TaskId::from(id));
            }
            Ok(db_result.1)
        })
    }

    fn persist(
        &self,
        task: TaskId,
        mut data: TaskData,
        state: PersistTaskState,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<PersistResult>> {
        self.stats.persists.fetch_add(1, Ordering::Relaxed);
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            let mut tasks_to_deactivate = Vec::new();
            let mut tasks_to_activate = Vec::new();
            let b = &mut db.batch();
            let ac = self.active_cache.get(*task);
            let old_active = {
                match ac.load(Ordering::Acquire) {
                    AC_ACTIVE => true,
                    AC_INACTIVE => false,
                    _ => db.state.get(&task)?.unwrap_or_default().active,
                }
            };
            if old_active {
                // Task is and will stay active
                if let Some(old_children) = db.children.get(&task)? {
                    // There are existing children that are active
                    // We need to compute a diff and update the active parents counts
                    let mut removed_children = old_children.into_iter().collect::<HashSet<_>>();
                    for child in data.children.iter() {
                        if !removed_children.remove(child) {
                            db.state.merge(
                                b,
                                &child,
                                &TaskStateChange::IncrementActiveParents(1),
                            )?;
                            tasks_to_activate.push(*child);
                            db.pending_active_update.insert(b, &(), &child)?;
                        }
                    }
                    for child in removed_children {
                        db.state
                            .merge(b, &child, &TaskStateChange::DecrementActiveParents(1))?;
                        tasks_to_deactivate.push(child);
                        db.pending_active_update.insert(b, &(), &child)?;
                    }
                } else {
                    // Task had no children before
                    // No need for expensive diffing
                    for child in data.children.iter() {
                        db.state
                            .merge(b, &child, &TaskStateChange::IncrementActiveParents(1))?;
                        tasks_to_activate.push(*child);
                        db.pending_active_update.insert(b, &(), &child)?;
                    }
                }
            } else if state.externally_active {
                // Task was not active before, but will activate with this operation
                for child in data.children.iter() {
                    db.state
                        .merge(b, &child, &TaskStateChange::IncrementActiveParents(1))?;
                    tasks_to_activate.push(*child);
                    db.pending_active_update.insert(b, &(), &child)?;
                }
            }
            db.state
                .merge(b, &task, &TaskStateChange::Persist(state.externally_active))?;
            ac.store(AC_ACTIVE, Ordering::Release);
            for slot in data.slots.iter_mut() {
                if let TaskSlot::Content(ref c) = slot {
                    // TODO we can avoid double serialization
                    // by having a custom Serialize impl on TaskSlot
                    if bincode::DefaultOptions::new().serialize(c).is_err() {
                        *slot = TaskSlot::NeedComputation;
                    }
                }
            }
            if db.data.write(b, &task, &data).is_err() {
                b.cancel();
                return Ok(None);
            }
            db.children.write(b, &task, &data.children)?;
            if let Some(old_dependencies) = db.dependencies.get(&task)? {
                // There are existing dependencies, we need to compute a diff
                let mut removed_dependencies = old_dependencies.into_iter().collect::<HashSet<_>>();
                for dep in data.dependencies.iter() {
                    if !removed_dependencies.remove(dep) {
                        db.dependents.insert(b, dep, &task)?;
                    }
                }
                for dep in removed_dependencies {
                    db.dependents.remove(b, &dep, &task)?;
                }
            } else {
                for dep in data.dependencies.iter() {
                    db.dependents.insert(b, dep, &task)?;
                }
            }
            db.dependencies.write(b, &task, &data.dependencies)?;
            db.pending_active_update.remove(b, &(), &task)?;
            b.write()?;
            let result = PersistResult {
                tasks_to_activate,
                tasks_to_deactivate,
            };
            // println!("persist({task}) -> {result:?}");
            Ok(Some(result))
        })
    }

    fn activate_when_needed(
        &self,
        task: TaskId,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<ActivateResult>> {
        self.stats.activates.fetch_add(1, Ordering::Relaxed);
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            let b = &mut db.batch();
            db.pending_active_update.remove(b, &(), &task)?;
            let ac = self.active_cache.get(*task);
            if ac.load(Ordering::Acquire) != AC_ACTIVE {
                if let Some(TaskState {
                    internal,
                    active,
                    active_parents,
                    externally_active,
                    ..
                }) = db.state.get(&task)?
                {
                    if !active && (active_parents > 0 || externally_active) {
                        let children = db.children.get(&task)?.unwrap_or_default();
                        let mut more_tasks_to_activate = Vec::new();
                        for child in children {
                            db.state.merge(
                                b,
                                &child,
                                &TaskStateChange::IncrementActiveParents(1),
                            )?;
                            more_tasks_to_activate.push(child);
                            db.pending_active_update.insert(b, &(), &child)?;
                        }
                        db.state.merge(b, &task, &TaskStateChange::Activate)?;
                        ac.store(AC_ACTIVE, Ordering::Release);
                        if let Some(InternalTaskState { clean: false }) = internal {
                            db.potential_dirty_active_tasks.insert(b, &(), &task)?;
                        }
                        if internal.is_none() {
                            db.potential_active_external_tasks.insert(b, &(), &task)?;
                        }
                        b.write()?;
                        let result = ActivateResult {
                            keeps_external_active: active_parents > 0,
                            external: internal.is_none(),
                            dirty: internal.map(|i| !i.clean).unwrap_or_default(),
                            more_tasks_to_activate,
                        };
                        // println!("activate_when_needed({task}) -> {result:?}");
                        return Ok(Some(result));
                    }
                }
            }
            b.write()?;
            Ok(None)
        })
    }

    fn deactivate_when_needed(
        &self,
        task: TaskId,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<DeactivateResult>> {
        self.stats.deactivates.fetch_add(1, Ordering::Relaxed);
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            let b = &mut db.batch();
            db.pending_active_update.remove(b, &(), &task)?;
            let ac = self.active_cache.get(*task);
            if ac.load(Ordering::Acquire) != AC_INACTIVE {
                if let Some(TaskState {
                    active,
                    active_parents,
                    externally_active,
                    ..
                }) = db.state.get(&task)?
                {
                    if active && active_parents == 0 && !externally_active {
                        let children = db.children.get(&task)?.unwrap_or_default();
                        let mut more_tasks_to_deactivate = Vec::new();
                        for child in children {
                            db.state.merge(
                                b,
                                &child,
                                &TaskStateChange::DecrementActiveParents(1),
                            )?;
                            more_tasks_to_deactivate.push(child);
                            db.pending_active_update.insert(b, &(), &child)?;
                        }
                        db.state.merge(b, &task, &TaskStateChange::Deactivate)?;
                        ac.store(AC_INACTIVE, Ordering::Release);
                        db.potential_dirty_active_tasks.remove(b, &(), &task)?;
                        b.write()?;
                        let result = DeactivateResult {
                            more_tasks_to_deactivate,
                        };
                        // println!("deactivate_when_needed({task}) -> {result:?}");
                        return Ok(Some(result));
                    }
                }
            }
            b.write()?;
            Ok(None)
        })
    }

    fn set_externally_active(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<bool> {
        self.stats.flaggings.fetch_add(1, Ordering::Relaxed);
        self.with_task_id_mapping(api, || {
            // println!("set_externally_active({task})");
            let db = &self.database;
            let b = &mut db.batch();
            db.state
                .merge(b, &task, &TaskStateChange::SetExternallyActive)?;
            db.externally_active_tasks.insert(b, &(), &task)?;
            b.write()?;
            let ac = self.active_cache.get(*task);
            let ac_value = ac.load(Ordering::Acquire);
            if ac_value == AC_ACTIVE {
                return Ok(false);
            }
            if let Some(TaskState {
                active,
                active_parents,
                ..
            }) = db.state.get(&task)?
            {
                if active && ac_value != AC_ACTIVE {
                    ac.store(AC_ACTIVE, Ordering::Release);
                } else if !active && ac_value != AC_INACTIVE {
                    ac.store(AC_INACTIVE, Ordering::Release);
                }
                return Ok(!active && active_parents == 0);
            }
            Ok(false)
        })
    }

    fn unset_externally_active(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<bool> {
        self.stats.flaggings.fetch_add(1, Ordering::Relaxed);
        self.with_task_id_mapping(api, || {
            // println!("unset_externally_active({task})");
            let db = &self.database;
            let b = &mut db.batch();
            db.state
                .merge(b, &task, &TaskStateChange::UnsetExternallyActive)?;
            db.externally_active_tasks.insert(b, &(), &task)?;
            b.write()?;
            let ac = self.active_cache.get(*task);
            let ac_value = ac.load(Ordering::Acquire);
            if ac_value == AC_INACTIVE {
                return Ok(false);
            }
            if let Some(TaskState {
                active,
                active_parents,
                ..
            }) = db.state.get(&task)?
            {
                if active && ac_value != AC_ACTIVE {
                    ac.store(AC_ACTIVE, Ordering::Release);
                } else if !active && ac_value != AC_INACTIVE {
                    ac.store(AC_INACTIVE, Ordering::Release);
                }
                return Ok(active && active_parents == 0);
            }
            Ok(false)
        })
    }

    fn make_dirty(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<bool> {
        self.stats.dirties.fetch_add(1, Ordering::Relaxed);
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            let b = &mut db.batch();
            db.state.merge(b, &task, &TaskStateChange::MakeDirty)?;
            db.potential_dirty_active_tasks.insert(b, &(), &task)?;
            b.write()?;
            self.get_active(task)
        })
    }

    fn make_dependent_dirty(
        &self,
        vc: turbo_tasks::RawVc,
        api: &dyn PersistedGraphApi,
    ) -> Result<Vec<TaskId>> {
        if PgApiReadOnlyMapping::new(self, api).forward(vc.get_task_id()) == TaskId::from(0) {
            return Ok(Vec::new());
        }
        self.stats.dependent_dirty.fetch_add(1, Ordering::Relaxed);
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            let b = &mut db.batch();
            let mut result = Vec::new();
            let tasks = db.dependents.get_all(&vc)?;
            for task in tasks.iter() {
                db.state.merge(b, task, &TaskStateChange::MakeDirty)?;
                db.potential_dirty_active_tasks.insert(b, &(), &task)?;
            }
            b.write()?;
            for task in tasks {
                if self.get_active(task)? {
                    result.push(task);
                }
            }
            Ok(result)
        })
    }

    fn make_clean(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<()> {
        if PgApiReadOnlyMapping::new(self, api).forward(task) == TaskId::from(0) {
            return Ok(());
        }
        self.stats.cleans.fetch_add(1, Ordering::Relaxed);
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            let b = &mut db.batch();
            db.state.merge(b, &task, &TaskStateChange::MakeClean)?;
            db.potential_dirty_active_tasks.remove(b, &(), &task)?;
            b.write()?;

            Ok(())
        })
    }

    fn remove_outdated_externally_active(
        &self,
        api: &dyn PersistedGraphApi,
    ) -> Result<Vec<TaskId>> {
        self.with_task_id_mapping(api, || {
            // For startup
            todo!()
        })
    }

    fn get_active_external_tasks(&self, api: &dyn PersistedGraphApi) -> Result<Vec<TaskId>> {
        // For startup
        self.with_task_id_mapping(api, || {
            let mut result = Vec::new();
            let db = &self.database;
            let b = &mut db.batch();
            for task in db.potential_active_external_tasks.get_all(&())? {
                if let Some(TaskState {
                    internal, active, ..
                }) = db.state.get(&task)?
                {
                    self.active_cache.get(*task).store(
                        if active { AC_ACTIVE } else { AC_INACTIVE },
                        Ordering::Release,
                    );
                    if internal.is_none() && active {
                        result.push(task);
                        continue;
                    }
                }
                db.potential_active_external_tasks.remove(b, &(), &task)?;
            }
            b.write()?;
            println!("{} active_external_tasks", result.len());
            Ok(result)
        })
    }

    fn get_dirty_active_tasks(&self, api: &dyn PersistedGraphApi) -> Result<Vec<TaskId>> {
        // For startup
        self.with_task_id_mapping(api, || {
            let mut result = Vec::new();
            let db = &self.database;
            let b = &mut db.batch();
            for task in db.potential_dirty_active_tasks.get_all(&())? {
                if let Some(TaskState {
                    internal, active, ..
                }) = db.state.get(&task)?
                {
                    self.active_cache.get(*task).store(
                        if active { AC_ACTIVE } else { AC_INACTIVE },
                        Ordering::Release,
                    );
                    if matches!(internal, Some(InternalTaskState { clean: false })) && active {
                        result.push(task);
                        continue;
                    }
                }
                db.potential_dirty_active_tasks.remove(b, &(), &task)?;
            }
            b.write()?;
            println!("{} dirty_active_tasks", result.len());
            Ok(result)
        })
    }

    fn get_pending_active_update(
        &self,
        api: &dyn PersistedGraphApi,
    ) -> Result<(Vec<TaskId>, Vec<TaskId>)> {
        // For startup
        self.with_task_id_mapping(api, || {
            let mut tasks_to_activate = Vec::new();
            let mut tasks_to_deactivate = Vec::new();
            let db = &self.database;
            let b = &mut db.batch();
            for task in db.pending_active_update.get_all(&())? {
                if let Some(TaskState {
                    active_parents,
                    externally_active,
                    active,
                    ..
                }) = db.state.get(&task)?
                {
                    self.active_cache.get(*task).store(
                        if active { AC_ACTIVE } else { AC_INACTIVE },
                        Ordering::Release,
                    );
                    if !active && (active_parents > 0 || externally_active) {
                        tasks_to_activate.push(task);
                        continue;
                    }
                    if active && active_parents == 0 && !externally_active {
                        tasks_to_deactivate.push(task);
                        continue;
                    }
                }
                db.potential_dirty_active_tasks.remove(b, &(), &task)?;
            }
            b.write()?;
            println!(
                "{} tasks_to_activate, {} tasks_to_deactivate",
                tasks_to_activate.len(),
                tasks_to_deactivate.len()
            );
            // self.print_db(api)?;
            Ok((tasks_to_activate, tasks_to_deactivate))
        })
    }

    fn stop(&self, api: &dyn PersistedGraphApi) -> Result<()> {
        println!("{:#?}", self.stats);
        // self.with_task_id_mapping(api, || {
        //     self.print_db(api)?;
        Ok(())
        // })
    }
}

struct PgApiMapping<'a> {
    this: &'a RocksDbPersistedGraph,
    task_id_forward_mapping: flurry::HashMapRef<'a, TaskId, TaskId>,
    task_id_backward_mapping: flurry::HashMapRef<'a, TaskId, TaskId>,
    api: &'a dyn PersistedGraphApi,
}

impl<'a> PgApiMapping<'a> {
    fn new(this: &'a RocksDbPersistedGraph, api: &'a dyn PersistedGraphApi) -> Self {
        Self {
            this,
            api,
            task_id_backward_mapping: this.task_id_backward_mapping.pin(),
            task_id_forward_mapping: this.task_id_forward_mapping.pin(),
        }
    }
}

impl<'a> IdMapping<TaskId> for PgApiMapping<'a> {
    fn forward(&self, id: TaskId) -> TaskId {
        let m = &self.task_id_forward_mapping;
        if let Some(r) = m.get(&id) {
            return *r;
        }
        let ty = self.api.lookup_task_type(id);
        let new_id = TaskId::from(self.this.get_or_create_task_type(ty).unwrap());
        let _ = self.task_id_backward_mapping.try_insert(new_id, id);
        let _ = m.try_insert(id, new_id);
        new_id
    }

    fn backward(&self, id: TaskId) -> TaskId {
        let m = &self.task_id_backward_mapping;
        if let Some(r) = m.get(&id) {
            return *r;
        }
        let ty = self.this.lookup_task_type(*id).unwrap();
        let new_id = self.api.get_or_create_task_type(ty);
        let _ = self.task_id_forward_mapping.try_insert(new_id, id);
        let _ = m.try_insert(id, new_id);
        new_id
    }
}

struct PgApiReadOnlyMapping<'a> {
    this: &'a RocksDbPersistedGraph,
    task_id_forward_mapping: flurry::HashMapRef<'a, TaskId, TaskId>,
    task_id_backward_mapping: flurry::HashMapRef<'a, TaskId, TaskId>,
    api: &'a dyn PersistedGraphApi,
}

impl<'a> PgApiReadOnlyMapping<'a> {
    fn new(this: &'a RocksDbPersistedGraph, api: &'a dyn PersistedGraphApi) -> Self {
        Self {
            this,
            api,
            task_id_backward_mapping: this.task_id_backward_mapping.pin(),
            task_id_forward_mapping: this.task_id_forward_mapping.pin(),
        }
    }
}

impl<'a> IdMapping<TaskId> for PgApiReadOnlyMapping<'a> {
    fn forward(&self, id: TaskId) -> TaskId {
        let m = &self.task_id_forward_mapping;
        if let Some(r) = m.get(&id) {
            return *r;
        }
        let ty = self.api.lookup_task_type(id);
        if let Some(id) = self.this.get_task_type(ty).unwrap() {
            TaskId::from(id)
        } else {
            TaskId::from(0)
        }
    }

    fn backward(&self, id: TaskId) -> TaskId {
        let m = &self.task_id_backward_mapping;
        if let Some(r) = m.get(&id) {
            return *r;
        }
        let ty = self.this.lookup_task_type(*id).unwrap();
        let new_id = self.api.get_or_create_task_type(ty);
        let _ = self.task_id_forward_mapping.try_insert(new_id, id);
        let _ = m.try_insert(id, new_id);
        new_id
    }
}
