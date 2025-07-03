use std::{future::Future, ops::Deref, path::PathBuf, sync::Arc};

use anyhow::{Context, Result, anyhow};
use either::Either;
use napi::{
    JsFunction, JsObject, JsUnknown, NapiRaw, NapiValue, Status,
    bindgen_prelude::{External, ToNapiValue},
    threadsafe_function::{ThreadSafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use rustc_hash::FxHashMap;
use serde::Serialize;
use turbo_tasks::{
    Effects, OperationVc, ReadRef, TaskId, TryJoinIterExt, TurboTasks, TurboTasksApi, Vc,
    VcValueType, get_effects,
    message_queue::{CompilationEvent, Severity},
};
use turbo_tasks_backend::{
    DefaultBackingStorage, GitVersionInfo, NoopBackingStorage, StartupCacheState,
    TurboTasksBackend, db_invalidation::invalidation_reasons, default_backing_storage,
    noop_backing_storage,
};
use turbo_tasks_fs::FileContent;
use turbopack_core::{
    diagnostics::{Diagnostic, DiagnosticContextExt, PlainDiagnostic},
    error::PrettyPrintError,
    issue::{
        IssueDescriptionExt, IssueSeverity, PlainIssue, PlainIssueSource, PlainSource, StyledString,
    },
    source_pos::SourcePos,
};

use crate::util::log_internal_error_and_inform;

pub type NextTurboTasks =
    Arc<TurboTasks<TurboTasksBackend<Either<DefaultBackingStorage, NoopBackingStorage>>>>;

#[derive(Serialize)]
struct StartupCacheInvalidationEvent {
    reason_code: Option<String>,
}

impl CompilationEvent for StartupCacheInvalidationEvent {
    fn type_name(&self) -> &'static str {
        "StartupCacheInvalidationEvent"
    }

    fn severity(&self) -> Severity {
        Severity::Warning
    }

    fn message(&self) -> String {
        let reason_msg = match self.reason_code.as_deref() {
            Some(invalidation_reasons::PANIC) => {
                " because we previously detected an internal error in Turbopack"
            }
            Some(invalidation_reasons::USER_REQUEST) => " as the result of a user request",
            _ => "", // ignore unknown reasons
        };
        format!(
            "Turbopack's persistent cache has been deleted{reason_msg}. Builds or page loads may \
             be slower as a result."
        )
    }

    fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap()
    }
}

pub fn create_turbo_tasks(
    output_path: PathBuf,
    persistent_caching: bool,
    _memory_limit: usize,
    dependency_tracking: bool,
    is_ci: bool,
) -> Result<NextTurboTasks> {
    Ok(if persistent_caching {
        let version_info = GitVersionInfo {
            describe: env!("VERGEN_GIT_DESCRIBE"),
            dirty: option_env!("CI").is_none_or(|value| value.is_empty())
                && env!("VERGEN_GIT_DIRTY") == "true",
        };
        let (backing_storage, cache_state) =
            default_backing_storage(&output_path.join("cache/turbopack"), &version_info, is_ci)?;
        let tt = TurboTasks::new(TurboTasksBackend::new(
            turbo_tasks_backend::BackendOptions {
                storage_mode: Some(if std::env::var("TURBO_ENGINE_READ_ONLY").is_ok() {
                    turbo_tasks_backend::StorageMode::ReadOnly
                } else {
                    turbo_tasks_backend::StorageMode::ReadWrite
                }),
                dependency_tracking,
                ..Default::default()
            },
            Either::Left(backing_storage),
        ));
        if let StartupCacheState::Invalidated { reason_code } = cache_state {
            tt.send_compilation_event(Arc::new(StartupCacheInvalidationEvent { reason_code }));
        }
        tt
    } else {
        TurboTasks::new(TurboTasksBackend::new(
            turbo_tasks_backend::BackendOptions {
                storage_mode: None,
                dependency_tracking,
                ..Default::default()
            },
            Either::Right(noop_backing_storage()),
        ))
    })
}

/// A helper type to hold both a Vc operation and the TurboTasks root process.
/// Without this, we'd need to pass both individually all over the place
#[derive(Clone)]
pub struct VcArc<T> {
    turbo_tasks: NextTurboTasks,
    /// The Vc. Must be unresolved, otherwise you are referencing an inactive operation.
    vc: OperationVc<T>,
}

impl<T> VcArc<T> {
    pub fn new(turbo_tasks: NextTurboTasks, vc: OperationVc<T>) -> Self {
        Self { turbo_tasks, vc }
    }

    pub fn turbo_tasks(&self) -> &NextTurboTasks {
        &self.turbo_tasks
    }
}

impl<T> Deref for VcArc<T> {
    type Target = OperationVc<T>;

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
    turbo_tasks: NextTurboTasks,
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
    #[napi(ts_arg_type = "{ __napiType: \"RootTask\" }")] mut root_task: External<RootTask>,
) -> napi::Result<()> {
    if let Some(task) = root_task.task_id.take() {
        root_task.turbo_tasks.dispose_root_task(task);
    }
    Ok(())
}

pub async fn get_issues<T: Send>(source: OperationVc<T>) -> Result<Arc<Vec<ReadRef<PlainIssue>>>> {
    let issues = source.peek_issues_with_path().await?;
    Ok(Arc::new(issues.get_plain_issues().await?))
}

/// Reads the [turbopack_core::diagnostics::Diagnostic] held
/// by the given source and returns it as a
/// [turbopack_core::diagnostics::PlainDiagnostic]. It does
/// not consume any Diagnostics held by the source.
pub async fn get_diagnostics<T: Send>(
    source: OperationVc<T>,
) -> Result<Arc<Vec<ReadRef<PlainDiagnostic>>>> {
    let captured_diags = source.peek_diagnostics().await?;
    let mut diags = captured_diags
        .diagnostics
        .iter()
        .map(|d| d.into_plain())
        .try_join()
        .await?;

    diags.sort();

    Ok(Arc::new(diags))
}

#[napi(object)]
pub struct NapiIssue {
    pub severity: String,
    pub stage: String,
    pub file_path: String,
    pub title: serde_json::Value,
    pub description: Option<serde_json::Value>,
    pub detail: Option<serde_json::Value>,
    pub source: Option<NapiIssueSource>,
    pub documentation_link: String,
    pub import_traces: serde_json::Value,
}

impl From<&PlainIssue> for NapiIssue {
    fn from(issue: &PlainIssue) -> Self {
        Self {
            description: issue
                .description
                .as_ref()
                .map(|styled| serde_json::to_value(StyledStringSerialize::from(styled)).unwrap()),
            stage: issue.stage.to_string(),
            file_path: issue.file_path.to_string(),
            detail: issue
                .detail
                .as_ref()
                .map(|styled| serde_json::to_value(StyledStringSerialize::from(styled)).unwrap()),
            documentation_link: issue.documentation_link.to_string(),
            severity: issue.severity.as_str().to_string(),
            source: issue.source.as_ref().map(|source| source.into()),
            title: serde_json::to_value(StyledStringSerialize::from(&issue.title)).unwrap(),
            import_traces: serde_json::to_value(&issue.import_traces).unwrap(),
        }
    }
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StyledStringSerialize<'a> {
    Line {
        value: Vec<StyledStringSerialize<'a>>,
    },
    Stack {
        value: Vec<StyledStringSerialize<'a>>,
    },
    Text {
        value: &'a str,
    },
    Code {
        value: &'a str,
    },
    Strong {
        value: &'a str,
    },
}

impl<'a> From<&'a StyledString> for StyledStringSerialize<'a> {
    fn from(value: &'a StyledString) -> Self {
        match value {
            StyledString::Line(parts) => StyledStringSerialize::Line {
                value: parts.iter().map(|p| p.into()).collect(),
            },
            StyledString::Stack(parts) => StyledStringSerialize::Stack {
                value: parts.iter().map(|p| p.into()).collect(),
            },
            StyledString::Text(string) => StyledStringSerialize::Text { value: string },
            StyledString::Code(string) => StyledStringSerialize::Code { value: string },
            StyledString::Strong(string) => StyledStringSerialize::Strong { value: string },
        }
    }
}

#[napi(object)]
pub struct NapiIssueSource {
    pub source: NapiSource,
    pub range: Option<NapiIssueSourceRange>,
}

impl From<&PlainIssueSource> for NapiIssueSource {
    fn from(
        PlainIssueSource {
            asset: source,
            range,
        }: &PlainIssueSource,
    ) -> Self {
        Self {
            source: (&**source).into(),
            range: range.as_ref().map(|range| range.into()),
        }
    }
}

#[napi(object)]
pub struct NapiIssueSourceRange {
    pub start: NapiSourcePos,
    pub end: NapiSourcePos,
}

impl From<&(SourcePos, SourcePos)> for NapiIssueSourceRange {
    fn from((start, end): &(SourcePos, SourcePos)) -> Self {
        Self {
            start: (*start).into(),
            end: (*end).into(),
        }
    }
}

#[napi(object)]
pub struct NapiSource {
    pub ident: String,
    pub content: Option<String>,
}

impl From<&PlainSource> for NapiSource {
    fn from(source: &PlainSource) -> Self {
        Self {
            ident: source.ident.to_string(),
            content: match &*source.content {
                FileContent::Content(content) => match content.content().to_str() {
                    Ok(str) => Some(str.into_owned()),
                    Err(_) => None,
                },
                FileContent::NotFound => None,
            },
        }
    }
}

#[napi(object)]
pub struct NapiSourcePos {
    pub line: u32,
    pub column: u32,
}

impl From<SourcePos> for NapiSourcePos {
    fn from(pos: SourcePos) -> Self {
        Self {
            line: pos.line,
            column: pos.column,
        }
    }
}

#[napi(object)]
pub struct NapiDiagnostic {
    pub category: String,
    pub name: String,
    #[napi(ts_type = "Record<string, string>")]
    pub payload: FxHashMap<String, String>,
}

impl NapiDiagnostic {
    pub fn from(diagnostic: &PlainDiagnostic) -> Self {
        Self {
            category: diagnostic.category.to_string(),
            name: diagnostic.name.to_string(),
            payload: diagnostic
                .payload
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        }
    }
}

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
        let mut obj = unsafe { napi::Env::from_raw(env).create_object()? };

        let result = unsafe {
            let result = T::to_napi_value(env, val.result)?;
            JsUnknown::from_raw(env, result)?
        };
        if matches!(result.get_type()?, napi::ValueType::Object) {
            // SAFETY: We know that result is an object, so we can cast it to a JsObject
            let result = unsafe { result.cast::<JsObject>() };

            for key in JsObject::keys(&result)? {
                let value: JsUnknown = result.get_named_property(&key)?;
                obj.set_named_property(&key, value)?;
            }
        }

        obj.set_named_property("issues", val.issues)?;
        obj.set_named_property("diagnostics", val.diagnostics)?;

        Ok(unsafe { obj.raw() })
    }
}

pub fn subscribe<T: 'static + Send + Sync, F: Future<Output = Result<T>> + Send, V: ToNapiValue>(
    turbo_tasks: NextTurboTasks,
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
                result.map_err(|e| {
                    log_internal_error_and_inform(&e);
                    napi::Error::from_reason(PrettyPrintError(&e).to_string())
                }),
                ThreadsafeFunctionCallMode::NonBlocking,
            );
            if !matches!(status, Status::Ok) {
                let error = anyhow!("Error calling JS function: {}", status);
                eprintln!("{error}");
                return Err::<Vc<()>, _>(error);
            }
            Ok(Default::default())
        })
    });
    Ok(External::new(RootTask {
        turbo_tasks,
        task_id: Some(task_id),
    }))
}

// Await the source and return fatal issues if there are any, otherwise
// propagate any actual error results.
pub async fn strongly_consistent_catch_collectables<R: VcValueType + Send>(
    source_op: OperationVc<R>,
) -> Result<(
    Option<ReadRef<R>>,
    Arc<Vec<ReadRef<PlainIssue>>>,
    Arc<Vec<ReadRef<PlainDiagnostic>>>,
    Arc<Effects>,
)> {
    let result = source_op.read_strongly_consistent().await;
    let issues = get_issues(source_op).await?;
    let diagnostics = get_diagnostics(source_op).await?;
    let effects = Arc::new(get_effects(source_op).await?);

    let result = if result.is_err() && issues.iter().any(|i| i.severity <= IssueSeverity::Error) {
        None
    } else {
        Some(result?)
    };

    Ok((result, issues, diagnostics, effects))
}
