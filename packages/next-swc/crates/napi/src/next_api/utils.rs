use std::{future::Future, ops::Deref, sync::Arc};

use anyhow::{anyhow, Context, Result};
use napi::{
    bindgen_prelude::{External, ToNapiValue},
    threadsafe_function::{ThreadSafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode},
    JsFunction, JsObject, NapiRaw, NapiValue, Status,
};
use serde::Serialize;
use turbo_tasks::{unit, TaskId, TurboTasks};
use turbopack_binding::{
    turbo::tasks_memory::MemoryBackend, turbopack::core::error::PrettyPrintError,
};

/// A helper type to hold both a Vc operation and the TurboTasks root process.
/// Without this, we'd need to pass both individually all over the place
#[derive(Clone)]
pub struct VcArc<T> {
    turbo_tasks: Arc<TurboTasks<MemoryBackend>>,
    /// The Vc. Must be resolved, otherwise you are referencing an inactive
    /// operation.
    vc: T,
}

impl<T> VcArc<T> {
    pub fn new(turbo_tasks: Arc<TurboTasks<MemoryBackend>>, vc: T) -> Self {
        Self { turbo_tasks, vc }
    }

    pub fn turbo_tasks(&self) -> &Arc<TurboTasks<MemoryBackend>> {
        &self.turbo_tasks
    }
}

impl<T> Deref for VcArc<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.vc
    }
}

pub fn serde_enum_to_string<T: Serialize>(value: &T) -> Result<String> {
    Ok(serde_json::to_value(value)?
        .as_str()
        .context("value must serialize to a string")?
        .to_string())
}

/// The root of our turbopack computation.
pub struct RootTask {
    #[allow(dead_code)]
    turbo_tasks: Arc<TurboTasks<MemoryBackend>>,
    #[allow(dead_code)]
    task_id: Option<TaskId>,
}

impl Drop for RootTask {
    fn drop(&mut self) {
        // TODO stop the root task
    }
}

#[napi]
pub fn root_task_dispose(
    #[napi(ts_arg_type = "{ __napiType: \"RootTask\" }")] _root_task: External<RootTask>,
) -> napi::Result<()> {
    // TODO(alexkirsz) Implement. Not panicking here to avoid crashing the process
    // when testing.
    eprintln!("root_task_dispose not yet implemented");
    Ok(())
}

#[napi(object)]
pub struct NapiIssue {}

#[napi(object)]
pub struct NapiDiagnostic {}

pub struct TurbopackResult<T: ToNapiValue> {
    pub result: T,
    pub issues: Vec<NapiIssue>,
    pub diagnostics: Vec<NapiDiagnostic>,
}

impl<T: ToNapiValue> ToNapiValue for TurbopackResult<T> {
    unsafe fn to_napi_value(
        env: napi::sys::napi_env,
        val: Self,
    ) -> napi::Result<napi::sys::napi_value> {
        let result = T::to_napi_value(env, val.result)?;
        // let issues = ToNapiValue::to_napi_value(env, val.issues)?;
        // let diagnostics = ToNapiValue::to_napi_value(env, val.diagnostics)?;

        let result = JsObject::from_raw(env, result)?;

        let mut obj = napi::Env::from_raw(env).create_object()?;
        for key in JsObject::keys(&result)? {
            obj.set_named_property(&key, result.get_named_property(&key)?)?;
        }
        obj.set_named_property("issues", val.issues)?;
        obj.set_named_property("diagnostics", val.diagnostics)?;

        Ok(obj.raw())
    }
}

pub fn subscribe<T: 'static + Send + Sync, F: Future<Output = Result<T>> + Send, V: ToNapiValue>(
    turbo_tasks: Arc<TurboTasks<MemoryBackend>>,
    func: JsFunction,
    handler: impl 'static + Sync + Send + Clone + Fn() -> F,
    mapper: impl 'static + Sync + Send + FnMut(ThreadSafeCallContext<T>) -> napi::Result<Vec<V>>,
) -> napi::Result<External<RootTask>> {
    let func: ThreadsafeFunction<T> = func.create_threadsafe_function(0, mapper)?;
    let task_id = turbo_tasks.spawn_root_task(move || {
        let handler = handler.clone();
        let func = func.clone();
        Box::pin(async move {
            let result = handler().await;

            let status = func.call(
                result.map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string())),
                ThreadsafeFunctionCallMode::NonBlocking,
            );
            if !matches!(status, Status::Ok) {
                let error = anyhow!("Error calling JS function: {}", status);
                eprintln!("{}", error);
                return Err(error);
            }
            Ok(unit().node)
        })
    });
    Ok(External::new(RootTask {
        turbo_tasks,
        task_id: Some(task_id),
    }))
}
