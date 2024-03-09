use std::{collections::HashMap, future::Future, ops::Deref, sync::Arc};

use anyhow::{anyhow, Context, Result};
use napi::{
    bindgen_prelude::{External, ToNapiValue},
    threadsafe_function::{ThreadSafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode},
    JsFunction, JsObject, JsUnknown, NapiRaw, NapiValue, Status,
};
use serde::Serialize;
use turbo_tasks::{ReadRef, TaskId, TryJoinIterExt, TurboTasks, Vc};
use turbopack_binding::{
    turbo::{tasks_fs::FileContent, tasks_memory::MemoryBackend},
    turbopack::core::{
        diagnostics::{Diagnostic, DiagnosticContextExt, PlainDiagnostic},
        error::PrettyPrintError,
        issue::{IssueDescriptionExt, PlainIssue, PlainIssueSource, PlainSource, StyledString},
        source_pos::SourcePos,
    },
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
    #[napi(ts_arg_type = "{ __napiType: \"RootTask\" }")] mut root_task: External<RootTask>,
) -> napi::Result<()> {
    if let Some(task) = root_task.task_id.take() {
        root_task.turbo_tasks.dispose_root_task(task);
    }
    Ok(())
}

pub async fn get_issues<T: Send>(source: Vc<T>) -> Result<Arc<Vec<ReadRef<PlainIssue>>>> {
    let issues = source.peek_issues_with_path().await?;
    Ok(Arc::new(issues.get_plain_issues().await?))
}

/// Reads the [turbopack_binding::turbopack::core::diagnostics::Diagnostic] held
/// by the given source and returns it as a
/// [turbopack_binding::turbopack::core::diagnostics::PlainDiagnostic]. It does
/// not consume any Diagnostics held by the source.
pub async fn get_diagnostics<T: Send>(source: Vc<T>) -> Result<Arc<Vec<ReadRef<PlainDiagnostic>>>> {
    let captured_diags = source.peek_diagnostics().await?;

    Ok(Arc::new(
        captured_diags
            .diagnostics
            .iter()
            .map(|d| d.into_plain())
            .try_join()
            .await?,
    ))
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
    pub sub_issues: Vec<NapiIssue>,
}

impl From<&PlainIssue> for NapiIssue {
    fn from(issue: &PlainIssue) -> Self {
        Self {
            description: issue
                .description
                .as_ref()
                .map(|styled| serde_json::to_value(StyledStringSerialize::from(styled)).unwrap()),
            stage: issue.stage.to_string(),
            file_path: issue.file_path.clone(),
            detail: issue
                .detail
                .as_ref()
                .map(|styled| serde_json::to_value(StyledStringSerialize::from(styled)).unwrap()),
            documentation_link: issue.documentation_link.clone(),
            severity: issue.severity.as_str().to_string(),
            source: issue.source.as_deref().map(|source| source.into()),
            title: serde_json::to_value(StyledStringSerialize::from(&issue.title)).unwrap(),
            sub_issues: issue
                .sub_issues
                .iter()
                .map(|issue| (&**issue).into())
                .collect(),
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
            line: pos.line as u32,
            column: pos.column as u32,
        }
    }
}

#[napi(object)]
pub struct NapiDiagnostic {
    pub category: String,
    pub name: String,
    pub payload: HashMap<String, String>,
}

impl NapiDiagnostic {
    pub fn from(diagnostic: &PlainDiagnostic) -> Self {
        Self {
            category: diagnostic.category.clone(),
            name: diagnostic.name.clone(),
            payload: diagnostic.payload.clone(),
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
        let mut obj = napi::Env::from_raw(env).create_object()?;

        let result = T::to_napi_value(env, val.result)?;
        let result = JsUnknown::from_raw(env, result)?;
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
