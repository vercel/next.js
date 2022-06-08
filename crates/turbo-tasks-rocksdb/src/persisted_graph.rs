use std::{
    collections::HashSet,
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
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
    util::SharedError,
    with_task_id_mapping, IdMapping, TaskId,
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

pub struct RocksDbPersistedGraph {
    database: Database,
    task_id_forward_mapping: HashMap<TaskId, TaskId>,
    task_id_backward_mapping: HashMap<TaskId, TaskId>,
    next_task_id: AtomicUsize,
    #[cfg(feature = "unsafe_once_map")]
    cache_once: turbo_tasks::util::OnceConcurrentlyMap<[u8], Result<usize, SharedError>>,
    #[cfg(not(feature = "unsafe_once_map"))]
    cache_once: turbo_tasks::util::SafeOnceConcurrentlyMap<Vec<u8>, Result<usize, SharedError>>,
}

impl RocksDbPersistedGraph {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let db = Database::open(path)?;
        let next_id = db.next_task_id.get()?.unwrap_or_default();
        Ok(Self {
            database: db,
            task_id_forward_mapping: HashMap::new(),
            task_id_backward_mapping: HashMap::new(),
            next_task_id: AtomicUsize::new(next_id),
            #[cfg(feature = "unsafe_once_map")]
            cache_once: turbo_tasks::util::OnceConcurrentlyMap::new(),
            #[cfg(not(feature = "unsafe_once_map"))]
            cache_once: turbo_tasks::util::SafeOnceConcurrentlyMap::new(),
        })
    }

    fn with_task_id_mapping<T>(&self, api: &dyn PersistedGraphApi, func: impl FnOnce() -> T) -> T {
        with_task_id_mapping(PgApiMapping::new(self, api), func)
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
            db.next_task_id
                .merge(b, &1)
                .map_err::<Error, _>(|e| e.into())?;
            let id = self.next_task_id.fetch_add(1, Ordering::Relaxed);
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
}

impl PersistedGraph for RocksDbPersistedGraph {
    fn read(
        &self,
        task: TaskId,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<(TaskData, ReadTaskState)>> {
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            if let Some(data) = db.data.get(&task)? {
                if let Some(TaskState {
                    internal: Some(InternalTaskState { clean }),
                    active_parents,
                    ..
                }) = db.state.get(&task)?
                {
                    return Ok(Some((
                        TaskData {
                            children: db.children.get(&task)?.unwrap_or_default(),
                            dependencies: db.dependencies.get(&task)?.unwrap_or_default(),
                            slots: data.slots,
                            slot_mappings: data.slot_mappings,
                            output: data.output,
                        },
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
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            if let Some(TaskState {
                internal: Some(_), ..
            }) = db.state.get(&task)?
            {
                Ok(true)
            } else {
                Ok(false)
            }
        })
    }

    fn lookup_one(
        &self,
        task_type: &PersistentTaskType,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<TaskId>> {
        self.with_task_id_mapping(api, || {
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
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            let db_result = db
                .cache
                .get_prefix(&task_type_to_bytes(&partial_task_type)?, 100)?;
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
        data: TaskData,
        state: PersistTaskState,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<PersistResult>> {
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            let mut tasks_to_deactivate = Vec::new();
            let mut tasks_to_activate = Vec::new();
            let b = &mut db.batch();
            let old_state = db.state.get(&task)?.unwrap_or_default();
            if old_state.active {
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
            let slots = data
                .slots
                .into_iter()
                .map(|slot| {
                    if let TaskSlot::Content(ref c) = slot {
                        // TODO we can avoid double serialization
                        // by having a custom Serialize impl on TaskSlot
                        if bincode::DefaultOptions::new().serialize(c).is_err() {
                            return TaskSlot::NeedComputation;
                        }
                    }
                    slot
                })
                .collect();
            if db
                .data
                .write(
                    b,
                    &task,
                    &PartialTaskData {
                        output: data.output,
                        slot_mappings: data.slot_mappings,
                        slots,
                    },
                )
                .is_err()
            {
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
            println!("persist({task}) -> {result:?}");
            Ok(Some(result))
        })
    }

    fn activate_when_needed(
        &self,
        task: TaskId,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<ActivateResult>> {
        self.with_task_id_mapping(api, || {
            let db = &self.database;
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
                    let b = &mut db.batch();
                    let mut more_tasks_to_activate = Vec::new();
                    for child in children {
                        db.state
                            .merge(b, &child, &TaskStateChange::IncrementActiveParents(1))?;
                        more_tasks_to_activate.push(child);
                        db.pending_active_update.insert(b, &(), &child)?;
                    }
                    db.state.merge(b, &task, &TaskStateChange::Activate)?;
                    if let Some(InternalTaskState { clean: false }) = internal {
                        db.potential_dirty_active_tasks.insert(b, &(), &task)?;
                    }
                    if internal.is_none() {
                        db.potential_active_external_tasks.insert(b, &(), &task)?;
                    }
                    db.pending_active_update.remove(b, &(), &task)?;
                    b.write()?;
                    let result = ActivateResult {
                        keeps_external_active: active_parents > 0,
                        external: internal.is_none(),
                        dirty: internal.map(|i| !i.clean).unwrap_or_default(),
                        more_tasks_to_activate,
                    };
                    println!("activate_when_needed({task}) -> {result:?}");
                    return Ok(Some(result));
                }
            }
            Ok(None)
        })
    }

    fn deactivate_when_needed(
        &self,
        task: TaskId,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<DeactivateResult>> {
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            if let Some(TaskState {
                active,
                active_parents,
                externally_active,
                ..
            }) = db.state.get(&task)?
            {
                if active && active_parents == 0 && !externally_active {
                    let children = db.children.get(&task)?.unwrap_or_default();
                    let b = &mut db.batch();
                    let mut more_tasks_to_deactivate = Vec::new();
                    for child in children {
                        db.state
                            .merge(b, &child, &TaskStateChange::DecrementActiveParents(1))?;
                        more_tasks_to_deactivate.push(child);
                        db.pending_active_update.insert(b, &(), &child)?;
                    }
                    db.state.merge(b, &task, &TaskStateChange::Deactivate)?;
                    db.potential_dirty_active_tasks.remove(b, &(), &task)?;
                    db.pending_active_update.remove(b, &(), &task)?;
                    b.write()?;
                    let result = DeactivateResult {
                        more_tasks_to_deactivate,
                    };
                    println!("deactivate_when_needed({task}) -> {result:?}");
                    return Ok(Some(result));
                }
            }
            Ok(None)
        })
    }

    fn set_externally_active(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<bool> {
        self.with_task_id_mapping(api, || {
            println!("set_externally_active({task})");
            let db = &self.database;
            let b = &mut db.batch();
            db.state
                .merge(b, &task, &TaskStateChange::SetExternallyActive)?;
            db.externally_active_tasks.insert(b, &(), &task)?;
            b.write()?;
            Ok(matches!(
                db.state.get(&task)?,
                Some(TaskState {
                    active: false,
                    active_parents: 0,
                    ..
                })
            ))
        })
    }

    fn unset_externally_active(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<bool> {
        self.with_task_id_mapping(api, || {
            println!("unset_externally_active({task})");
            let db = &self.database;
            let b = &mut db.batch();
            db.state
                .merge(b, &task, &TaskStateChange::UnsetExternallyActive)?;
            db.externally_active_tasks.insert(b, &(), &task)?;
            b.write()?;
            Ok(matches!(
                db.state.get(&task)?,
                Some(TaskState {
                    active: true,
                    active_parents: 0,
                    ..
                })
            ))
        })
    }

    fn make_dirty(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<bool> {
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            let b = &mut db.batch();
            db.state.merge(b, &task, &TaskStateChange::MakeDirty)?;
            db.potential_dirty_active_tasks.insert(b, &(), &task)?;
            b.write()?;
            Ok(matches!(
                db.state.get(&task)?,
                Some(TaskState { active: true, .. })
            ))
        })
    }

    fn make_dependent_dirty(
        &self,
        vc: turbo_tasks::RawVc,
        api: &dyn PersistedGraphApi,
    ) -> Result<Vec<TaskId>> {
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
                if matches!(db.state.get(&task)?, Some(TaskState { active: true, .. })) {
                    result.push(task);
                }
            }
            Ok(result)
        })
    }

    fn make_clean(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<()> {
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            let b = &mut db.batch();
            db.state.merge(b, &task, &TaskStateChange::MakeDirty)?;
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
                    internal: None,
                    active: true,
                    ..
                }) = db.state.get(&task)?
                {
                    result.push(task);
                    continue;
                }
                db.potential_active_external_tasks.remove(b, &(), &task)?;
            }
            b.write()?;
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
                    internal: Some(InternalTaskState { clean: false }),
                    active: true,
                    ..
                }) = db.state.get(&task)?
                {
                    result.push(task);
                    continue;
                }
                db.potential_dirty_active_tasks.remove(b, &(), &task)?;
            }
            b.write()?;
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
            for (task, state) in db.state.get_all()? {
                println!("# {task} {state:?}")
            }
            Ok((tasks_to_activate, tasks_to_deactivate))
        })
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
