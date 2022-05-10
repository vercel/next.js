use std::{
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
};

use anyhow::{anyhow, Error, Result};
use bincode::Options;
use flurry::HashMap;
use turbo_tasks::{
    backend::PersistentTaskType,
    persisted_graph::{
        ActivateResult, DeactivateResult, PersistTaskState, PersistedGraph, PersistedGraphApi,
        ReadTaskState, TaskData, TaskSlot,
    },
    util::SharedError,
    with_task_id_mapping, IdMapping, TaskId,
};

use super::{
    db::{Database, PartialTaskData, TaskState, TaskStateChange},
    once_map::*,
};

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
    cache_once: OnceConcurrentlyMap<[u8], Result<usize, SharedError>>,
    #[cfg(not(feature = "unsafe_once_map"))]
    cache_once: SafeOnceConcurrentlyMap<Vec<u8>, Result<usize, SharedError>>,
}

impl RocksDbPersistedGraph {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let db = Database::open(path)?;
        // let next_id = db.next_task_id.get()?.unwrap_or_default();
        let next_id = if let Some(next_id) = db.next_task_id.get()? {
            next_id
        } else {
            let next_id = 10000000;
            let b = &mut db.batch();
            db.next_task_id.write(b, &next_id)?;
            b.write()?;
            next_id
        };
        println!("next_task_id = {next_id}");
        Ok(Self {
            database: db,
            task_id_forward_mapping: HashMap::new(),
            task_id_backward_mapping: HashMap::new(),
            next_task_id: AtomicUsize::new(next_id),
            #[cfg(feature = "unsafe_once_map")]
            cache_once: OnceConcurrentlyMap::new(),
            #[cfg(not(feature = "unsafe_once_map"))]
            cache_once: SafeOnceConcurrentlyMap::new(),
        })
    }

    fn with_task_id_mapping<T>(&self, api: &dyn PersistedGraphApi, func: impl FnOnce() -> T) -> T {
        with_task_id_mapping(PgApiMapping { this: self, api }, func)
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
                if let Some(TaskState::Internal {
                    clean,
                    external_incoming,
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
                            external_incoming,
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
            if let Some(TaskState::Internal { .. }) = db.state.get(&task)? {
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
                let task = PgApiMapping { api, this: self }.backward(TaskId::from(id));
                if let Some(TaskState::Internal { .. }) = db.state.get(&task)? {
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
            let mapping = PgApiMapping { api, this: self };
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
    ) -> Result<bool> {
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            let b = &mut db.batch();
            db.state.merge(
                b,
                &task,
                &TaskStateChange::ConvertToInternal {
                    external_active_parents: state.external_active_parents,
                },
            )?;
            let slots = data
                .slots
                .into_iter()
                .map(|slot| {
                    if let TaskSlot::Content(ref c) = slot {
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
                return Ok(false);
            }
            db.children.write(b, &task, &data.children)?;
            for dep in data.dependencies.iter() {
                db.dependents.insert(b, dep, &task)?;
            }
            db.dependencies.write(b, &task, &data.dependencies)?;
            // We are not sure if external_incoming is set, and it may vary concurrently
            // To be sure we just set it
            db.external_incoming.insert(b, &(), &task)?;
            b.write()?;
            Ok(true)
        })
    }

    fn activate_when_needed(
        &self,
        task: TaskId,
        api: &dyn PersistedGraphApi,
    ) -> Result<Option<ActivateResult>> {
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            if let Some(TaskState::Internal {
                clean,
                active,
                active_parents,
                ..
            }) = db.state.get(&task)?
            {
                if !active && active_parents > 0 {
                    let children = db.children.get(&task)?.unwrap_or_default();
                    let b = &mut db.batch();
                    let mut increased_external_outgoing = Vec::new();
                    let mut more_tasks_to_activate = Vec::new();
                    for child in children {
                        if let Some(TaskState::Internal { active_parents, .. }) =
                            db.state.get(&child)?
                        {
                            db.state.merge(
                                b,
                                &child,
                                &TaskStateChange::IncrementActiveParents(1),
                            )?;
                            if active_parents == 0 {
                                more_tasks_to_activate.push(child);
                            }
                        } else {
                            db.external_outgoing.insert(b, &(), &child)?;
                            increased_external_outgoing.push((child, 1));
                        }
                    }
                    db.state.merge(b, &task, &TaskStateChange::Activate)?;
                    b.write()?;
                    let result = ActivateResult {
                        dirty: !clean,
                        increased_external_outgoing,
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
            if let Some(TaskState::Internal {
                active,
                active_parents,
                ..
            }) = db.state.get(&task)?
            {
                if active && active_parents == 0 {
                    let children = db.children.get(&task)?.unwrap_or_default();
                    let b = &mut db.batch();
                    let mut decreased_external_outgoing = Vec::new();
                    let mut more_tasks_to_deactivate = Vec::new();
                    for child in children {
                        if let Some(TaskState::Internal { .. }) = db.state.get(&child)? {
                            db.state.merge(
                                b,
                                &child,
                                &TaskStateChange::DecrementActiveParents(1),
                            )?;
                            more_tasks_to_deactivate.push(child);
                        } else {
                            decreased_external_outgoing.push((child, 1));
                        }
                    }
                    db.state.merge(b, &task, &TaskStateChange::Activate)?;
                    b.write()?;
                    return Ok(Some(DeactivateResult {
                        decreased_external_outgoing,
                        more_tasks_to_deactivate,
                    }));
                }
            }
            Ok(None)
        })
    }

    fn add_external_incoming(
        &self,
        task: TaskId,
        by: u32,
        api: &dyn PersistedGraphApi,
    ) -> Result<bool> {
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            db.state
                .merge_no_batch(&task, &TaskStateChange::AddExternalIncoming(by))?;
            Ok(matches!(
                db.state.get(&task)?,
                Some(TaskState::Internal { active: false, .. })
            ))
        })
    }

    fn remove_external_incoming(
        &self,
        task: TaskId,
        by: u32,
        api: &dyn PersistedGraphApi,
    ) -> Result<bool> {
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            db.state
                .merge_no_batch(&task, &TaskStateChange::RemoveExternalIncoming(by))?;
            Ok(matches!(
                db.state.get(&task)?,
                Some(TaskState::Internal {
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
            db.state
                .merge_no_batch(&task, &TaskStateChange::MakeDirty)?;
            Ok(matches!(
                db.state.get(&task)?,
                Some(TaskState::Internal { active: true, .. })
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
            }
            b.write()?;
            for task in tasks {
                if matches!(
                    db.state.get(&task)?,
                    Some(TaskState::Internal { active: true, .. })
                ) {
                    result.push(task);
                }
            }
            Ok(result)
        })
    }

    fn make_clean(&self, task: TaskId, api: &dyn PersistedGraphApi) -> Result<()> {
        self.with_task_id_mapping(api, || {
            let db = &self.database;
            db.state
                .merge_no_batch(&task, &TaskStateChange::MakeDirty)?;
            Ok(())
        })
    }

    fn remove_outdated_external_incoming(
        &self,
        api: &dyn PersistedGraphApi,
    ) -> Result<Vec<TaskId>> {
        self.with_task_id_mapping(api, || {
            // For startup
            todo!()
        })
    }

    fn get_external_outgoing(&self, api: &dyn PersistedGraphApi) -> Result<Vec<(TaskId, usize)>> {
        // For startup
        self.with_task_id_mapping(api, || {
            let mut result = Vec::new();
            let db = &self.database;
            let b = &mut db.batch();
            for task in db.external_outgoing.get_all(&())? {
                if let Some(TaskState::External { external_outgoing }) = db.state.get(&task)? {
                    if external_outgoing > 0 {
                        result.push((task, external_outgoing as usize));
                        continue;
                    }
                }
                db.external_outgoing.remove(b, &(), &task)?;
            }
            Ok(result)
        })
    }

    fn get_dirty_active_tasks(&self, api: &dyn PersistedGraphApi) -> Result<Vec<TaskId>> {
        self.with_task_id_mapping(api, || {
            // For startup
            todo!()
        })
    }
}

struct PgApiMapping<'a> {
    this: &'a RocksDbPersistedGraph,
    api: &'a dyn PersistedGraphApi,
}

impl<'a> IdMapping<TaskId> for PgApiMapping<'a> {
    fn forward(&self, id: TaskId) -> TaskId {
        let m = self.this.task_id_forward_mapping.pin();
        if let Some(r) = m.get(&id) {
            return *r;
        }
        let ty = self.api.lookup_task_type(id);
        let new_id = TaskId::from(self.this.get_or_create_task_type(ty).unwrap());
        let m2 = self.this.task_id_backward_mapping.pin();
        let _ = m2.try_insert(new_id, id);
        let _ = m.try_insert(id, new_id);
        new_id
    }

    fn backward(&self, id: TaskId) -> TaskId {
        let m = self.this.task_id_backward_mapping.pin();
        if let Some(r) = m.get(&id) {
            return *r;
        }
        let ty = self.this.lookup_task_type(*id).unwrap();
        let new_id = self.api.get_or_create_task_type(ty);
        let m2 = self.this.task_id_forward_mapping.pin();
        let _ = m2.try_insert(new_id, id);
        let _ = m.try_insert(id, new_id);
        new_id
    }
}
