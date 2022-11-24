use std::{
    collections::HashSet,
    fmt::Debug,
    mem::take,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex, MutexGuard,
    },
    time::Instant,
};

use anyhow::Result;
use bincode::{DefaultOptions, Options};
use flurry::{HashMap, HashMapRef};
use serde::Serialize;
use turbo_tasks::{
    backend::{
        Backend, BackgroundJobId, CellContent, PersistentTaskType, TaskExecutionSpec,
        TransientTaskType,
    },
    event::{Event, EventListener},
    with_task_id_mapping, IdMapping, RawVc, SharedReference, TaskId, TaskIdProvider,
    TurboTasksBackendApi,
};

use crate::{
    db::{Database, SessionKey, TaskFreshness, TaskOutput},
    sortable_index::SortableIndex,
    table::WriteBatch,
};

fn sequential<T>(map: &HashMap<TaskId, Mutex<()>>, task: TaskId, func: impl FnOnce() -> T) -> T {
    sequential_pinned(&map.pin(), task, func)
}

fn sequential_pinned<T>(
    map: &HashMapRef<TaskId, Mutex<()>>,
    task: TaskId,
    func: impl FnOnce() -> T,
) -> T {
    match map.try_insert(task, Mutex::new(())) {
        Ok(mutex) => {
            let guard = mutex.lock();
            let r = func();
            drop(guard);
            r
        }
        Err(e) => {
            let guard = e.current.lock();
            let r = func();
            drop(guard);
            r
        }
    }
}

fn try_get_sequential_guard<'a>(
    map: &'a HashMapRef<TaskId, Mutex<()>>,
    task: TaskId,
) -> Option<MutexGuard<'a, ()>> {
    match map.try_insert(task, Mutex::new(())) {
        Ok(mutex) => {
            if let Ok(guard) = mutex.try_lock() {
                Some(guard)
            } else {
                None
            }
        }
        Err(e) => {
            if let Ok(guard) = e.current.try_lock() {
                Some(guard)
            } else {
                None
            }
        }
    }
}

#[derive(Debug)]
pub struct RocksDbBackend {
    path: PathBuf,
    database: Option<Database>,
    session: SessionKey,
    generation: u64,
    next_task_id: AtomicUsize,
    ongoing_create: HashMap<Arc<PersistentTaskType>, Event>,
    in_progress_valid: flurry::HashSet<TaskId>,
    task_events: HashMap<TaskId, Event>,
    // protects access to "session_task_active", "session_task_children"
    mutex_task_children: HashMap<TaskId, Mutex<()>>,
    // protects access to "task_cell", "task_state", "task_dependencies"
    mutex_task_dependencies: HashMap<TaskId, Mutex<()>>,
    transient_cells: HashMap<(TaskId, usize), Option<SharedReference>>,
    transient_tasks: HashMap<TaskId, Mutex<TransientTaskType>>,
    transient_task_children: flurry::HashSet<TaskId>,
    task_transient_cell_request: flurry::HashSet<TaskId>,
    task_id_forward_mapping: HashMap<TaskId, TaskId>,
    task_id_backward_mapping: HashMap<TaskId, TaskId>,
}

impl RocksDbBackend {
    pub fn new<T: Serialize, P: AsRef<Path>>(path: P, session: T) -> Result<Self> {
        let session = SessionKey::new(DefaultOptions::new().serialize(&session)?);

        Ok(Self {
            path: path.as_ref().to_path_buf(),
            database: None,
            session,
            generation: 0,
            next_task_id: AtomicUsize::new(0),
            ongoing_create: HashMap::new(),
            in_progress_valid: flurry::HashSet::new(),
            task_events: HashMap::new(),
            mutex_task_children: HashMap::new(),
            mutex_task_dependencies: HashMap::new(),
            transient_cells: HashMap::new(),
            transient_tasks: HashMap::new(),
            transient_task_children: flurry::HashSet::new(),
            task_transient_cell_request: flurry::HashSet::new(),
            task_id_forward_mapping: HashMap::new(),
            task_id_backward_mapping: HashMap::new(),
        })
    }

    fn try_initialize(&mut self, task_id_provider: &dyn TaskIdProvider) -> Result<()> {
        let db = self.with_task_id_mapping(task_id_provider, || {
            let start = Instant::now();
            let db = Database::open(&self.path);
            let elapsed = start.elapsed();
            println!("opening cache {}", FormatDuration(elapsed));
            db
        })?;

        // init globals
        let generation = db.generation.get()?.unwrap_or_default();
        self.generation = generation + 1;
        let next_task_id = db.next_task_id.get()?.unwrap_or_default();
        self.next_task_id.store(next_task_id, Ordering::Release);

        self.database = Some(db);

        Ok(())
    }

    fn try_startup(&self, turbo_tasks: &dyn TurboTasksBackendApi) -> Result<()> {
        let db = self.database.as_ref().unwrap();

        // Process interruped active updates
        let mut schedule = Vec::new();
        for task in db.session_ongoing_active_update.get_all(&self.session)? {
            self.try_update_active_state(task, &mut schedule)?;
        }
        for task in db.session_scheduled_tasks.get_all(&self.session)? {
            schedule.push(task);
        }
        for task in schedule {
            turbo_tasks.schedule(task);
        }

        let generation = self.generation;
        // Bring session up to date and update generation
        if let Some(session_generation) = db.session_generation.get(&self.session)? {
            if session_generation != generation - 1 {
                assert!(session_generation < generation);
                todo!("bring session up to date");
            }
        }
        {
            let b = &mut db.batch();
            db.generation.write(b, &generation)?;
            db.session_generation.write(b, &self.session, &generation)?;
            b.write()?;
        }

        Ok(())
    }

    fn try_get_next_task_id(&self) -> Result<TaskId> {
        let db = self.database.as_ref().unwrap();
        let b = &mut db.batch();
        db.next_task_id.merge(b, &1)?;
        b.write()?;
        let id = self.next_task_id.fetch_add(1, Ordering::AcqRel);
        Ok(TaskId::from(id))
    }

    pub fn with_task_id_mapping<T, P: TaskIdProvider>(
        &self,
        task_id_provider: P,
        func: impl FnOnce() -> T,
    ) -> T {
        with_task_id_mapping(
            BackendIdMapping {
                backend: self,
                task_id_provider,
            },
            func,
        )
    }

    fn listen_to_task(&self, task: TaskId) -> EventListener {
        match self
            .task_events
            .pin()
            .try_insert(task, Event::new(|| "TODO".to_string()))
        {
            Ok(e) => e.listen(),
            Err(e) => e.current.listen(),
        }
    }

    fn try_get_or_create_persistent_task(
        &self,
        task_type: PersistentTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<TaskId> {
        let db = self.database.as_ref().unwrap();
        // Lookup in task_cache
        if let Some(id) = db.task_cache.get_value(&task_type)? {
            return Ok(id);
        }
        let task_type = Arc::new(task_type);
        // Sync with parallel ongoing creates
        let guard = &self.ongoing_create.guard();
        let id = match self.ongoing_create.try_insert(
            task_type.clone(),
            Event::new(|| "TODO".to_string()),
            guard,
        ) {
            Err(e) => {
                let listener = e.current.listen();
                if let Some(id) = db.task_cache.get_value(&task_type)? {
                    return Ok(id);
                }
                listener.wait();
                db.task_cache.get_value(&task_type)?.unwrap()
            }
            Ok(event) => {
                // Update task_cache
                let id = turbo_tasks.get_fresh_task_id();
                let b = &mut db.batch();
                db.task_cache.write(b, &task_type, &id)?;
                b.write()?;
                // If not found:
                //   Update
                self.ongoing_create.remove(&task_type, guard);
                event.notify(usize::MAX);
                id
            }
        };
        self.try_connect_parent_child(parent_task, id, turbo_tasks)?;
        Ok(id)
    }

    fn try_connect_parent_child(
        &self,
        parent: TaskId,
        child: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<()> {
        let db = self.database.as_ref().unwrap();
        let mut update_active_state = HashSet::new();
        let mut schedule = Vec::new();
        if self.transient_tasks.pin().contains_key(&parent) {
            if self.transient_task_children.pin().insert(child) {
                let mut batch = db.batch();
                let b = &mut batch;
                db.session_transient_task_children
                    .insert(b, &self.session, &child)?;
                self.try_increment_active_parents(
                    batch,
                    child,
                    &mut update_active_state,
                    &mut schedule,
                )?;
            }
        } else {
            sequential(&self.mutex_task_children, parent, || -> Result<()> {
                let mut batch = db.batch();
                let b = &mut batch;
                db.task_children.insert(b, &parent, &child)?;
                db.task_generations
                    .insert_unique(b, &SortableIndex(self.generation), &parent)?;
                db.session_task_children
                    .insert(b, (&self.session, &parent), &child)?;
                if db.session_task_active.has(&self.session, &parent)? {
                    self.try_increment_active_parents(
                        batch,
                        child,
                        &mut update_active_state,
                        &mut schedule,
                    )?;
                } else {
                    batch.write()?;
                    drop(batch);
                }
                Ok(())
            })?;
        }
        for task in update_active_state {
            self.try_update_active_state(task, &mut schedule)?;
        }
        for task in schedule {
            turbo_tasks.schedule(task);
        }
        Ok(())
    }

    /// Increments the active parents counter and updates as much of the active
    /// states for the child tasks as possible. Children that couldn't be
    /// updated are queued in `update_active_state`, for which
    /// `try_update_active_state` should be called, afterwards. It might
    /// detect that some tasks need to be scheduled. These are pushed into
    /// `schedule`. For them `turbo_tasks.schedule` should be called.
    fn try_increment_active_parents(
        &self,
        mut b: WriteBatch,
        task: TaskId,
        update_active_state: &mut HashSet<TaskId>,
        schedule: &mut Vec<TaskId>,
    ) -> Result<()> {
        let db = self.database.as_ref().unwrap();
        let mutex_task_children = self.mutex_task_children.pin();
        let mut collected_guards = Vec::new();
        let mut active_state_updated = HashSet::new();
        self.try_increment_active_parents_inner(
            db,
            &mut b,
            task,
            &mutex_task_children,
            update_active_state,
            &mut active_state_updated,
            schedule,
            &mut collected_guards,
        )?;
        b.write()?;
        drop(collected_guards);
        Ok(())
    }

    fn try_increment_active_parents_inner<'a>(
        &'a self,
        db: &Database,
        b: &mut WriteBatch,
        task: TaskId,
        mutex_task_children: &'a HashMapRef<TaskId, Mutex<()>>,
        update_active_state: &mut HashSet<TaskId>,
        active_state_updated: &mut HashSet<TaskId>,
        schedule: &mut Vec<TaskId>,
        collected_guards: &mut Vec<MutexGuard<'a, ()>>,
    ) -> Result<()> {
        let old_count = db
            .session_active_parents
            .get((&self.session, &task))?
            .unwrap_or_default();
        db.session_active_parents
            .merge(b, (&self.session, &task), &1)?;
        if old_count == 0 {
            if !active_state_updated.contains(&task) {
                if let Some(g) = try_get_sequential_guard(mutex_task_children, task) {
                    collected_guards.push(g);
                    self.try_update_active_state_inner(
                        db,
                        b,
                        task,
                        true,
                        mutex_task_children,
                        update_active_state,
                        active_state_updated,
                        schedule,
                        collected_guards,
                    )?;
                } else {
                    update_active_state.insert(task);
                    // TODO FIXME: This could be inserted multiple times
                    // but the first try_update_active_state will remove it
                    // Maybe use a 3 state progress None -> Invalid -> Updating -> None/Invalid
                    db.session_ongoing_active_update
                        .insert(b, &self.session, &task)?;
                }
                active_state_updated.insert(task);
            }
        }
        Ok(())
    }

    fn try_update_active_state(&self, task: TaskId, schedule: &mut Vec<TaskId>) -> Result<()> {
        let db = self.database.as_ref().unwrap();
        let mut update_active_state = HashSet::new();
        let mutex_task_children = self.mutex_task_children.pin();
        sequential_pinned(&mutex_task_children, task, || -> Result<()> {
            let b = &mut db.batch();
            let mut active_state_updated = HashSet::new();
            let mut collected_guards = Vec::new();
            self.try_update_active_state_inner(
                db,
                b,
                task,
                false,
                &mutex_task_children,
                &mut update_active_state,
                &mut active_state_updated,
                schedule,
                &mut collected_guards,
            )?;
            b.write()?;
            drop(collected_guards);
            Ok(())
        })?;
        for child in update_active_state {
            self.try_update_active_state(child, schedule)?;
        }
        Ok(())
    }

    fn try_update_active_state_inner<'a>(
        &'a self,
        db: &Database,
        b: &mut WriteBatch,
        task: TaskId,
        inlined_in_increase: bool,
        mutex_task_children: &'a HashMapRef<TaskId, Mutex<()>>,
        update_active_state: &mut HashSet<TaskId>,
        active_state_updated: &mut HashSet<TaskId>,
        schedule: &mut Vec<TaskId>,
        collected_guards: &mut Vec<MutexGuard<'a, ()>>,
    ) -> Result<()> {
        let should_be_active = inlined_in_increase
            || db
                .session_active_parents
                .get((&self.session, &task))?
                .unwrap_or_default()
                > 0;
        if db.session_task_active.has(&self.session, &task)? != should_be_active {
            if should_be_active {
                db.session_task_active.insert(b, &self.session, &task)?;
                // Schedule task
                db.session_scheduled_tasks.insert(b, &self.session, &task)?;
                schedule.push(task);
            } else {
                db.session_task_active.remove(b, &self.session, &task)?;
            }
            for child in db.task_children.get_all(&task)? {
                if should_be_active {
                    self.try_increment_active_parents_inner(
                        db,
                        b,
                        task,
                        mutex_task_children,
                        update_active_state,
                        active_state_updated,
                        schedule,
                        collected_guards,
                    )?;
                } else {
                    // TODO add try_decrement_active_parents_inner
                    db.session_active_parents.merge(
                        b,
                        (&self.session, &child),
                        &if should_be_active { 1 } else { -1 },
                    )?;
                    db.session_ongoing_active_update
                        .insert(b, &self.session, &child)?;
                    update_active_state.insert(child);
                }
            }
            if !inlined_in_increase {
                db.session_ongoing_active_update
                    .remove(b, &self.session, &task)?;
            }
        }
        Ok(())
    }

    fn try_make_dirty(&self, b: &mut WriteBatch, task: TaskId) -> Result<()> {
        let db = self.database.as_ref().unwrap();
        // Update task clean flag
        db.task_state.merge(b, &task, &false)?;
        // Make in progress task invalid (if any)
        self.in_progress_valid.pin().remove(&task);
        // Update task generation
        db.task_generations
            .insert_unique(b, &SortableIndex(self.generation), &task)?;
        Ok(())
    }

    fn try_invalidate_task(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<()> {
        let db = self.database.as_ref().unwrap();
        if db.task_state.get(&task)?.unwrap_or_default().0 != TaskFreshness::Dirty {
            sequential(&self.mutex_task_dependencies, task, || {
                if db.task_state.get(&task)?.unwrap_or_default().0 != TaskFreshness::Dirty {
                    let b = &mut db.batch();
                    self.try_make_dirty(b, task)?;
                    // Clear task_dependencies
                    for dep in db.task_dependencies.get_values(&task)? {
                        db.task_dependencies.remove(b, &task, &dep)?;
                    }
                    // Check if task is active in session
                    let active = db.session_task_active.has(&self.session, &task)?;
                    if active {
                        // Schedule task
                        db.session_scheduled_tasks.insert(b, &self.session, &task)?;
                        b.write()?;
                        turbo_tasks.schedule(task);
                    } else {
                        b.write()?;
                    }
                }
                Ok(())
            })
        } else {
            Ok(())
        }
    }

    fn try_invalidate_dependencies(
        &self,
        mut batch: WriteBatch,
        vc: RawVc,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<()> {
        let db = self.database.as_ref().unwrap();
        let need_write = sequential(
            &self.mutex_task_dependencies,
            vc.get_task_id(),
            || -> Result<bool> {
                let b = &mut batch;
                let tasks = db.task_dependencies.get_keys(&vc)?;
                if !tasks.is_empty() {
                    for task in tasks.iter() {
                        self.try_make_dirty(b, *task)?;
                        // We assume task is active since this is usually called from
                        // changes in a running task (which is probably active).
                        // But on task start active state is still validated again.
                        db.session_scheduled_tasks.insert(b, &self.session, &task)?;
                    }
                    b.write()?;
                    if !tasks.is_empty() {
                        turbo_tasks.schedule_notify_tasks(&tasks);
                    }
                    Ok(false)
                } else {
                    Ok(true)
                }
            },
        )?;
        if need_write {
            batch.write()?;
        }
        Ok(())
    }

    fn try_update_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        content: CellContent,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<()> {
        let db = self.database.as_ref().unwrap();
        // Update task_cell
        let mut batch = db.batch();
        let b = &mut batch;
        match content {
            CellContent(None) => {
                db.task_cell.delete(b, (&task, &index))?;
                self.transient_cells.pin().remove(&(task, index));
            }
            CellContent(content) => {
                if db.task_cell.write(b, (&task, &index), &content).is_err() {
                    db.task_cell.write(b, (&task, &index), &None)?;
                    self.transient_cells.pin().insert((task, index), content);
                } else {
                    self.transient_cells.pin().remove(&(task, index));
                }
            }
        }

        // invalidate all task_dependencies
        self.try_invalidate_dependencies(batch, RawVc::TaskCell(task, index), turbo_tasks)
    }

    fn try_task_execution_completed(
        &self,
        task: TaskId,
        result: Result<RawVc>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<bool> {
        let db = self.database.as_ref().unwrap();
        let mut batch = db.batch();
        let b = &mut batch;
        let state = db.task_state.get(&task).ok().unwrap_or_default();
        let new_state = Some(match result {
            Ok(vc) => TaskOutput::Result(vc),
            Err(e) => TaskOutput::Error(e.to_string()),
        });
        // Store result, not yet mark clean
        db.task_state
            .write(b, &task, (&TaskFreshness::PreparedForClean, &new_state))?;
        let change = if let Some((_, old_state)) = state {
            old_state != new_state
        } else {
            // We do not need to consider that as change
            // since the task output couldn't be read yet
            // (there didn't exist one yet)
            false
        };
        if change {
            // When result differs from old result:
            //   Invalidate all task_dependents
            self.try_invalidate_dependencies(batch, RawVc::TaskOutput(task), turbo_tasks)?;
        } else {
            batch.write()?;
        }
        let valid = self.in_progress_valid.pin().remove(&task);
        if !valid {
            // reexecute
            let b = &mut db.batch();
            db.task_state.merge(b, &task, &false)?;
            b.write()?;
            Ok(true)
        } else {
            let b = &mut db.batch();

            // Finalize task freshness
            // This will account for race conditions between "in_progress_valid" and
            // "task_state"
            db.task_state.merge(b, &task, &true)?;

            // Remove task from list of scheduled tasks
            db.session_scheduled_tasks
                .remove(b, &self.session, &task)
                .unwrap();

            b.write()?;

            // Notify events
            if let Some(event) = self.task_events.pin().get(&task) {
                event.notify(usize::MAX);
            }

            Ok(false)
        }
    }
}

impl Backend for RocksDbBackend {
    fn initialize(&mut self, task_id_provider: &dyn TaskIdProvider) {
        self.try_initialize(task_id_provider).unwrap();
    }

    fn startup(&self, turbo_tasks: &dyn TurboTasksBackendApi) {
        self.with_task_id_mapping(turbo_tasks, || {
            self.try_startup(turbo_tasks).unwrap();
        })
    }

    fn invalidate_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi) {
        self.with_task_id_mapping(turbo_tasks, || {
            self.try_invalidate_task(task, turbo_tasks).unwrap();
        })
    }

    fn invalidate_tasks(&self, tasks: Vec<TaskId>, turbo_tasks: &dyn TurboTasksBackendApi) {
        self.with_task_id_mapping(turbo_tasks, || {
            for task in tasks {
                self.try_invalidate_task(task, turbo_tasks).unwrap();
            }
        })
    }

    fn try_start_task_execution(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<TaskExecutionSpec> {
        #[cfg(feature = "log_backend")]
        println!("RB try_start_task_execution({})", task);
        self.with_task_id_mapping(turbo_tasks, || {
            let db = self.database.as_ref().unwrap();
            // Grap task_type
            if let Some(task_type) = db.task_cache.get_key(&task).ok()? {
                let task_transient_cell_request =
                    self.task_transient_cell_request.pin().remove(&task);
                if !task_transient_cell_request {
                    // Cancel when the task is already clean
                    let clean = db.task_state.get(&task).ok()?.unwrap_or_default().0
                        == TaskFreshness::Clean;
                    if clean {
                        return None;
                    }
                    // Cancel when the task is not active
                    let active = db.session_task_active.has(&self.session, &task).ok()?;
                    if !active {
                        return None;
                    }
                }
                self.in_progress_valid.pin().insert(task);
                Some(TaskExecutionSpec {
                    future: Box::pin(task_type.run(turbo_tasks.pin())),
                })
            } else {
                if let Some(mutex) = self.transient_tasks.pin().get(&task) {
                    let task_type = &mut *mutex.lock().unwrap();
                    let future = match task_type {
                        TransientTaskType::Root(func) => (func)(),
                        TransientTaskType::Once(future) => std::mem::replace(
                            future,
                            Box::pin(async {
                                Err(anyhow::anyhow!("Once task can only be executed once"))
                            }),
                        ),
                    };
                    self.in_progress_valid.pin().insert(task);
                    Some(TaskExecutionSpec { future })
                } else {
                    None
                }
            }
        })
    }

    fn task_execution_completed(
        &self,
        task: TaskId,
        result: Result<RawVc>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> bool {
        #[cfg(feature = "log_backend")]
        println!("RB task_execution_completed({})", task);
        self.with_task_id_mapping(turbo_tasks, || {
            self.try_task_execution_completed(task, result, turbo_tasks)
                .unwrap()
        })
    }

    fn run_background_job<'a>(
        &'a self,
        _id: BackgroundJobId,
        _turbo_tasks: &'a dyn TurboTasksBackendApi,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send + 'a>> {
        unreachable!()
    }

    fn try_read_task_output(
        &self,
        task: TaskId,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<RawVc, turbo_tasks::event::EventListener>> {
        #[cfg(feature = "log_backend")]
        println!(
            "RB try_read_task_output(task: {}, reader: {})",
            task, reader
        );
        sequential(&self.mutex_task_dependencies, task, || {
            // SAFETY: We track the dependency below
            let result = unsafe { self.try_read_task_output_untracked(task, turbo_tasks) };

            if !matches!(result, Ok(Err(EventListener { .. }))) {
                self.track_read_task_output(task, reader, turbo_tasks);
            }

            result
        })
    }

    unsafe fn try_read_task_output_untracked(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<RawVc, turbo_tasks::event::EventListener>> {
        #[cfg(feature = "log_backend")]
        println!("RB try_read_task_output_untracked({})", task);
        fn output_to_result(output: TaskOutput) -> Result<RawVc> {
            match output {
                TaskOutput::Result(vc) => Ok(vc),
                TaskOutput::Error(message) => Err(anyhow::anyhow!("Task errored: {}", message)),
            }
        }

        self.with_task_id_mapping(turbo_tasks, || {
            let db = self.database.as_ref().unwrap();
            // Read task_output
            match db.task_state.get(&task)? {
                Some((TaskFreshness::PreparedForClean, None))
                | Some((TaskFreshness::Clean, None)) => unreachable!(),
                Some((TaskFreshness::Dirty, _))
                | Some((TaskFreshness::PreparedForClean, _))
                | None => {
                    let listener = self.listen_to_task(task);
                    // Check state again in case of race conditions
                    match db.task_state.get(&task)? {
                        Some((TaskFreshness::PreparedForClean, None))
                        | Some((TaskFreshness::Clean, None)) => unreachable!(),
                        Some((TaskFreshness::Dirty, _))
                        | Some((TaskFreshness::PreparedForClean, _))
                        | None => Ok(Err(listener)),
                        Some((TaskFreshness::Clean, Some(output))) => {
                            Ok(Ok(output_to_result(output)?))
                        }
                    }
                }
                Some((TaskFreshness::Clean, Some(output))) => Ok(Ok(output_to_result(output)?)),
            }
        })
    }

    fn track_read_task_output(
        &self,
        task: TaskId,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        #[cfg(feature = "log_backend")]
        println!(
            "RB track_read_task_output(task: {}, reader: {})",
            task, reader
        );
        self.with_task_id_mapping(turbo_tasks, || {
            let db = self.database.as_ref().unwrap();
            // Add dependency
            let b = &mut db.batch();
            let vc = RawVc::TaskOutput(task);
            db.task_dependencies.insert(b, &reader, &vc).unwrap();
            b.write().unwrap();
        });
    }

    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<CellContent, EventListener>> {
        #[cfg(feature = "log_backend")]
        println!(
            "RB try_read_task_cell(task: {}, index: {}, reader: {})",
            task, index, reader
        );
        sequential(&self.mutex_task_dependencies, task, || {
            // SAFETY: We track the dependency below
            let result = unsafe { self.try_read_task_cell_untracked(task, index, turbo_tasks) };

            if !matches!(result, Ok(Err(EventListener { .. }))) {
                self.track_read_task_cell(task, index, reader, turbo_tasks);
            }

            result
        })
    }

    unsafe fn try_read_task_cell_untracked(
        &self,
        task: TaskId,
        index: CellId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<CellContent, EventListener>> {
        #[cfg(feature = "log_backend")]
        println!(
            "RB try_read_task_cell_untracked(task: {}, index: {})",
            task, index
        );
        self.with_task_id_mapping(turbo_tasks, || {
            let db = self.database.as_ref().unwrap();
            // Read task_cell
            let content = db.task_cell.get((&task, &index))?;
            match content {
                None => {
                    // empty cell
                    Ok(Ok(CellContent(None)))
                }
                Some(None) => {
                    // non serializable cell content
                    let cell_ref = (task, index);
                    // check if it's already a transient cell and if we already have content
                    match self.transient_cells.pin().try_insert(cell_ref, None) {
                        Err(e) => {
                            if let Some(content) = e.current {
                                return Ok(Ok(CellContent(Some(content.clone()))));
                            }
                            let listener = self.listen_to_task(task);
                            // Lookup again, in case of race conditions
                            if let Some(Some(content)) = self.transient_cells.pin().get(&cell_ref) {
                                return Ok(Ok(CellContent(Some(content.clone()))));
                            }
                            Ok(Err(listener))
                        }
                        Ok(_) => {
                            // we inserted the transient cell
                            let listener = self.listen_to_task(task);
                            // Lookup again, in case of race conditions
                            if let Some(Some(content)) = self.transient_cells.pin().get(&cell_ref) {
                                return Ok(Ok(CellContent(Some(content.clone()))));
                            }
                            // Since we inserted the transient cell entry, we are responsible for
                            // scheduling the task. No need to persist that, since it's a transient
                            // cell request
                            if self.task_transient_cell_request.pin().insert(task) {
                                turbo_tasks.schedule(task);
                            }
                            Ok(Err(listener))
                        }
                    }
                }
                Some(Some(content)) => Ok(Ok(CellContent(Some(content)))),
            }
        })
    }

    fn track_read_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        #[cfg(feature = "log_backend")]
        println!(
            "RB track_read_task_cell(task: {}, index: {}, reader: {})",
            task, index, reader
        );
        self.with_task_id_mapping(turbo_tasks, || {
            let db = self.database.as_ref().unwrap();
            // Add dependency (task_dependencies)
            let b = &mut db.batch();
            let vc = RawVc::TaskCell(task, index);
            db.task_dependencies.insert(b, &reader, &vc).unwrap();
            b.write().unwrap();
        });
    }

    fn update_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        content: CellContent,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        #[cfg(feature = "log_backend")]
        println!("RB update_task_cell(task: {}, index: {})", task, index);
        self.with_task_id_mapping(turbo_tasks, || {
            self.try_update_task_cell(task, index, content, turbo_tasks)
                .unwrap();
        })
    }

    fn get_or_create_persistent_task(
        &self,
        task_type: PersistentTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> TaskId {
        #[cfg(feature = "log_backend")]
        println!(
            "RB get_or_create_persistent_task(task_type: {:?}, parent_task: {})",
            task_type, parent_task
        );
        self.with_task_id_mapping(turbo_tasks, || {
            self.try_get_or_create_persistent_task(task_type, parent_task, turbo_tasks)
                .unwrap()
        })
    }

    fn create_transient_task(
        &self,
        task_type: TransientTaskType,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> TaskId {
        let id = turbo_tasks.get_fresh_task_id();
        self.transient_tasks.pin().insert(id, Mutex::new(task_type));
        id
    }
}

struct BackendIdMapping<'a, T: TaskIdProvider + 'a> {
    backend: &'a RocksDbBackend,
    task_id_provider: T,
}

impl<'a, T: TaskIdProvider + 'a> IdMapping<TaskId> for BackendIdMapping<'a, T> {
    fn forward(&self, id: TaskId) -> TaskId {
        let m = self.backend.task_id_forward_mapping.pin();
        if let Some(r) = m.get(&id) {
            return *r;
        }
        let new_id = self.backend.try_get_next_task_id().unwrap();
        let m2 = self.backend.task_id_backward_mapping.pin();
        m2.insert(new_id, id);
        match m.try_insert(id, new_id) {
            Ok(_) => new_id,
            Err(e) => {
                m2.remove(&new_id);
                unsafe { self.task_id_provider.reuse_task_id(new_id) };
                *e.current
            }
        }
    }

    fn backward(&self, id: TaskId) -> TaskId {
        let m = self.backend.task_id_backward_mapping.pin();
        if let Some(r) = m.get(&id) {
            return *r;
        }
        let new_id = self.task_id_provider.get_fresh_task_id();
        let m2 = self.backend.task_id_forward_mapping.pin();
        m2.insert(new_id, id);
        match m.try_insert(id, new_id) {
            Ok(_) => new_id,
            Err(e) => {
                m2.remove(&new_id);
                unsafe { self.task_id_provider.reuse_task_id(new_id) };
                *e.current
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{path::PathBuf, sync::Weak};

    use turbo_tasks::{
        util::IdFactory, Completion, FunctionId, SharedReference, TaskIdProvider, TaskInput,
        TurboTasksCallApi, Typed,
    };

    use super::*;

    #[test]
    fn rocksdb() {
        struct TT {
            this: Weak<TT>,
            scheduled_tasks: Mutex<Vec<TaskId>>,
            notified_tasks: Mutex<Vec<TaskId>>,
            task_id_factory: IdFactory<TaskId>,
        }

        impl TurboTasksCallApi for TT {
            fn dynamic_call(
                &self,
                func: turbo_tasks::FunctionId,
                inputs: Vec<turbo_tasks::TaskInput>,
            ) -> RawVc {
                todo!()
            }

            fn native_call(
                &self,
                func: turbo_tasks::FunctionId,
                inputs: Vec<turbo_tasks::TaskInput>,
            ) -> RawVc {
                todo!()
            }

            fn trait_call(
                &self,
                trait_type: turbo_tasks::TraitTypeId,
                trait_fn_name: Cow<'static, str>,
                inputs: Vec<turbo_tasks::TaskInput>,
            ) -> RawVc {
                todo!()
            }
        }

        impl TurboTasksBackendApi for TT {
            fn pin(&self) -> Arc<dyn TurboTasksBackendApi> {
                self.this.upgrade().unwrap()
            }

            fn schedule(&self, task: TaskId) {
                self.scheduled_tasks.lock().unwrap().push(task);
            }

            fn schedule_backend_background_job(&self, id: BackgroundJobId) {
                todo!()
            }

            fn schedule_notify_tasks(&self, tasks: &Vec<TaskId>) {
                self.notified_tasks.lock().unwrap().extend(tasks);
            }

            fn schedule_notify_tasks_set(&self, tasks: &HashSet<TaskId>) {
                self.notified_tasks.lock().unwrap().extend(tasks);
            }
        }

        impl TaskIdProvider for TT {
            fn get_fresh_task_id(&self) -> TaskId {
                self.task_id_factory.get()
            }

            unsafe fn reuse_task_id(&self, id: TaskId) {
                unsafe { self.task_id_factory.reuse(id) }
            }
        }

        let turbo_tasks = Arc::new_cyclic(|this| TT {
            this: this.clone(),
            scheduled_tasks: Default::default(),
            notified_tasks: Default::default(),
            task_id_factory: IdFactory::new(),
        });

        let package_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let db = package_root.join("tests_output/db");
        std::fs::remove_dir_all(&db).unwrap();
        turbo_tasks::register();
        let b = RocksDbBackend::new(db, "hello").unwrap();
        b.startup(&*turbo_tasks);
        let content = CellContent(Some(SharedReference(
            Some(Completion::get_value_type_id()),
            Arc::new(Completion),
        )));
        let root_task = b.create_transient_task(
            TransientTaskType::Root(Box::new(|| {
                Box::pin(async { Err(anyhow::anyhow!("unexpected")) })
            })),
            &*turbo_tasks,
        );

        let task1 = b.get_or_create_persistent_task(
            PersistentTaskType::Native(FunctionId::from(1), vec![]),
            root_task,
            &*turbo_tasks,
        );
        let task2 = b.get_or_create_persistent_task(
            PersistentTaskType::Native(FunctionId::from(1), vec![TaskInput::Bool(true)]),
            root_task,
            &*turbo_tasks,
        );
        assert_eq!(
            turbo_tasks
                .scheduled_tasks
                .lock()
                .unwrap()
                .drain(..)
                .collect::<Vec<_>>(),
            vec![task1, task2]
        );
        let cell = 0;
        b.update_task_cell(
            task1,
            Completion::get_value_type_id(),
            cell,
            content.clone(),
            &*turbo_tasks,
        );
        let read = b.try_read_task_cell(task1, cell, task2, &*turbo_tasks);
        read.unwrap().unwrap().cast::<Completion>().unwrap();
        assert_eq!(
            turbo_tasks
                .notified_tasks
                .lock()
                .unwrap()
                .drain(..)
                .collect::<Vec<_>>(),
            vec![]
        );

        // updating a cell should notify
        b.update_task_cell(
            task1,
            Completion::get_value_type_id(),
            cell,
            content,
            &*turbo_tasks,
        );
        assert_eq!(
            turbo_tasks
                .notified_tasks
                .lock()
                .unwrap()
                .drain(..)
                .collect::<Vec<_>>(),
            vec![task2]
        );

        // invalidating a task should schedule task directly
        b.invalidate_task(task1, &*turbo_tasks);
        assert_eq!(
            turbo_tasks
                .scheduled_tasks
                .lock()
                .unwrap()
                .drain(..)
                .collect::<Vec<_>>(),
            vec![task1]
        );
    }
}
