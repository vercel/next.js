#![deny(unsafe_op_in_unsafe_fn)]

use turbo_tasks::{
    backend::{Backend, SlotContent},
    RawVc, TaskId,
};

pub struct MemoryCacheBackend<B: Backend> {
    backend: B,
    slot_cache: flurry::HashMap<(TaskId, usize), SlotContent>,
    output_cache: flurry::HashMap<TaskId, Option<RawVc>>,
}

impl<B: Backend> MemoryCacheBackend<B> {
    pub fn new(backend: B) -> Self {
        Self {
            backend,
            slot_cache: flurry::HashMap::new(),
            output_cache: flurry::HashMap::new(),
        }
    }
}

impl<B: Backend> Backend for MemoryCacheBackend<B> {
    fn initialize(&mut self, task_id_provider: &dyn turbo_tasks::TaskIdProvider) {
        self.backend.initialize(task_id_provider)
    }

    fn startup(&self, turbo_tasks: &dyn turbo_tasks::TurboTasksBackendApi) {
        self.backend.startup(turbo_tasks)
    }

    fn invalidate_task(
        &self,
        task: turbo_tasks::TaskId,
        turbo_tasks: &dyn turbo_tasks::TurboTasksBackendApi,
    ) {
        let output_cache = self.output_cache.pin();
        output_cache.insert(task, None);
        self.backend.invalidate_task(task, turbo_tasks)
    }

    fn invalidate_tasks(
        &self,
        tasks: Vec<turbo_tasks::TaskId>,
        turbo_tasks: &dyn turbo_tasks::TurboTasksBackendApi,
    ) {
        let output_cache = self.output_cache.pin();
        for task in tasks.iter() {
            output_cache.insert(*task, None);
        }
        self.backend.invalidate_tasks(tasks, turbo_tasks)
    }

    fn try_start_task_execution(
        &self,
        task: turbo_tasks::TaskId,
        turbo_tasks: &dyn turbo_tasks::TurboTasksBackendApi,
    ) -> Option<turbo_tasks::backend::TaskExecutionSpec> {
        self.backend.try_start_task_execution(task, turbo_tasks)
    }

    fn task_execution_completed(
        &self,
        task: turbo_tasks::TaskId,
        slot_mappings: Option<turbo_tasks::backend::SlotMappings>,
        result: anyhow::Result<turbo_tasks::RawVc>,
        turbo_tasks: &dyn turbo_tasks::TurboTasksBackendApi,
    ) -> bool {
        match result {
            Ok(result) => {
                self.output_cache.pin().insert(task, Some(result));
            }
            Err(_) => {
                self.output_cache.pin().remove(&task);
            }
        }
        self.backend
            .task_execution_completed(task, slot_mappings, result, turbo_tasks)
    }

    fn run_background_job<'a>(
        &'a self,
        id: turbo_tasks::backend::BackgroundJobId,
        turbo_tasks: &'a dyn turbo_tasks::TurboTasksBackendApi,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send + 'a>> {
        self.backend.run_background_job(id, turbo_tasks)
    }

    fn try_read_task_output(
        &self,
        task: turbo_tasks::TaskId,
        reader: turbo_tasks::TaskId,
        turbo_tasks: &dyn turbo_tasks::TurboTasksBackendApi,
    ) -> anyhow::Result<anyhow::Result<turbo_tasks::RawVc, event_listener::EventListener>> {
        let output_cache = self.output_cache.pin();
        if let Some(&Some(cached_output)) = output_cache.get(&task) {
            self.track_read_task_output(task, reader, turbo_tasks);
            return Ok(Ok(cached_output));
        }

        let result = self.backend.try_read_task_output(task, reader, turbo_tasks);

        if let Ok(Ok(content)) = result {
            let _ = output_cache.try_insert(task, Some(content));
        }

        result
    }

    unsafe fn try_read_task_output_untracked(
        &self,
        task: turbo_tasks::TaskId,
        turbo_tasks: &dyn turbo_tasks::TurboTasksBackendApi,
    ) -> anyhow::Result<anyhow::Result<turbo_tasks::RawVc, event_listener::EventListener>> {
        let output_cache = self.output_cache.pin();
        if let Some(&Some(cached_output)) = output_cache.get(&task) {
            return Ok(Ok(cached_output));
        }

        let result = unsafe {
            self.backend
                .try_read_task_output_untracked(task, turbo_tasks)
        };

        if let Ok(Ok(content)) = result {
            output_cache.insert(task, Some(content));
        }

        result
    }

    fn track_read_task_output(
        &self,
        task: TaskId,
        reader: TaskId,
        turbo_tasks: &dyn turbo_tasks::TurboTasksBackendApi,
    ) {
        self.backend
            .track_read_task_output(task, reader, turbo_tasks)
    }

    fn try_read_task_slot(
        &self,
        task: turbo_tasks::TaskId,
        index: usize,
        reader: turbo_tasks::TaskId,
        turbo_tasks: &dyn turbo_tasks::TurboTasksBackendApi,
    ) -> anyhow::Result<anyhow::Result<SlotContent, event_listener::EventListener>> {
        let slot_cache = self.slot_cache.pin();
        if let Some(cached_content) = slot_cache.get(&(task, index)) {
            self.track_read_task_slot(task, index, reader, turbo_tasks);
            return Ok(Ok(cached_content.clone()));
        }

        let result = self
            .backend
            .try_read_task_slot(task, index, reader, turbo_tasks);

        if let Ok(Ok(content)) = &result {
            slot_cache.insert((task, index), content.clone());
        }

        result
    }

    unsafe fn try_read_task_slot_untracked(
        &self,
        task: turbo_tasks::TaskId,
        index: usize,
        turbo_tasks: &dyn turbo_tasks::TurboTasksBackendApi,
    ) -> anyhow::Result<anyhow::Result<SlotContent, event_listener::EventListener>> {
        let slot_cache = self.slot_cache.pin();
        if let Some(cached_content) = slot_cache.get(&(task, index)) {
            return Ok(Ok(cached_content.clone()));
        }

        let result = unsafe {
            self.backend
                .try_read_task_slot_untracked(task, index, turbo_tasks)
        };

        if let Ok(Ok(content)) = &result {
            slot_cache.insert((task, index), content.clone());
        }

        result
    }

    fn track_read_task_slot(
        &self,
        task: TaskId,
        index: usize,
        reader: TaskId,
        turbo_tasks: &dyn turbo_tasks::TurboTasksBackendApi,
    ) {
        self.backend
            .track_read_task_slot(task, index, reader, turbo_tasks)
    }

    fn get_fresh_slot(
        &self,
        task: turbo_tasks::TaskId,
        turbo_tasks: &dyn turbo_tasks::TurboTasksBackendApi,
    ) -> usize {
        self.backend.get_fresh_slot(task, turbo_tasks)
    }

    fn update_task_slot(
        &self,
        task: turbo_tasks::TaskId,
        index: usize,
        content: SlotContent,
        turbo_tasks: &dyn turbo_tasks::TurboTasksBackendApi,
    ) {
        self.slot_cache.pin().insert((task, index), content.clone());
        self.backend
            .update_task_slot(task, index, content, turbo_tasks)
    }

    fn get_or_create_persistent_task(
        &self,
        task_type: turbo_tasks::backend::PersistentTaskType,
        parent_task: turbo_tasks::TaskId,
        turbo_tasks: &dyn turbo_tasks::TurboTasksBackendApi,
    ) -> turbo_tasks::TaskId {
        self.backend
            .get_or_create_persistent_task(task_type, parent_task, turbo_tasks)
    }

    fn create_transient_task(
        &self,
        task_type: turbo_tasks::backend::TransientTaskType,
        turbo_tasks: &dyn turbo_tasks::TurboTasksBackendApi,
    ) -> turbo_tasks::TaskId {
        self.backend.create_transient_task(task_type, turbo_tasks)
    }
}
