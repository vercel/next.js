use crate::{
    backend::{Backend, CachedTaskType, TaskExecutionSpec},
    event::Event,
    registry, OutputContent, TaskPersistence, TurboTasksBackendApi,
};

/// A potentially in-flight local task stored in `CurrentGlobalTaskState::local_tasks`.
pub enum LocalTask {
    Scheduled { done_event: Event },
    Done { output: OutputContent },
}

pub fn get_local_task_execution_spec<'a>(
    turbo_tasks: &'_ dyn TurboTasksBackendApi<impl Backend + 'static>,
    ty: &'a CachedTaskType,
    // if this is a `CachedTaskType::Resolve*`, we'll spawn another task with this persistence
    persistence: TaskPersistence,
) -> TaskExecutionSpec<'a> {
    match ty {
        CachedTaskType::Native {
            fn_type: native_fn_id,
            this,
            arg,
        } => {
            debug_assert_eq!(persistence, TaskPersistence::LocalCells);
            let func = registry::get_function(*native_fn_id);
            let span = func.span(TaskPersistence::LocalCells);
            let entered = span.enter();
            let future = func.execute(*this, &**arg);
            drop(entered);
            TaskExecutionSpec { future, span }
        }
        CachedTaskType::ResolveNative {
            fn_type: native_fn_id,
            this,
            arg,
        } => {
            let func = registry::get_function(*native_fn_id);
            let span = func.resolve_span(TaskPersistence::LocalCells);
            let entered = span.enter();
            let future = Box::pin(CachedTaskType::run_resolve_native(
                *native_fn_id,
                *this,
                &**arg,
                persistence,
                turbo_tasks.pin(),
            ));
            drop(entered);
            TaskExecutionSpec { future, span }
        }
        CachedTaskType::ResolveTrait {
            trait_type: trait_type_id,
            method_name: name,
            this,
            arg,
        } => {
            let trait_type = registry::get_trait(*trait_type_id);
            let span = trait_type.resolve_span(name);
            let entered = span.enter();
            let future = Box::pin(CachedTaskType::run_resolve_trait(
                *trait_type_id,
                name.clone(),
                *this,
                &**arg,
                persistence,
                turbo_tasks.pin(),
            ));
            drop(entered);
            TaskExecutionSpec { future, span }
        }
    }
}
