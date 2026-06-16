use std::{
    future::Future,
    ops::Deref,
    sync::{Arc, LazyLock},
};

use anyhow::{Context, Result, anyhow};
use futures_util::TryFutureExt;
use napi::{
    JsFunction, JsObject, JsUnknown, NapiRaw, NapiValue, Status,
    bindgen_prelude::{Buffer, External, ToNapiValue},
    threadsafe_function::{ThreadSafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use napi_derive::napi;
use next_code_frame::{
    CodeFrameColorMode, CodeFrameLocation, CodeFrameOptions, Location, render_code_frame,
};
use regex::Regex;
use rustc_hash::FxHashMap;
use serde::Serialize;
use turbo_rcstr::RcStr;
use turbo_tasks::{Effects, OperationVc, ReadRef, TaskId, Vc, VcValueType, take_effects};
use turbo_tasks_fs::FileContent;
use turbopack_core::{
    issue::{
        CollectibleIssuesExt, IssueFilter, IssueSeverity, PlainIssue, PlainIssueSource,
        PlainSource, StyledString,
    },
    source_pos::SourcePos,
};

use crate::next_api::turbopack_ctx::NextTurbopackContext;

/// An [`OperationVc`] that can be passed back and forth to JS across the [`napi`][mod@napi]
/// boundary via [`External`].
///
/// It is a helper type to hold both a [`OperationVc`] and the [`NextTurbopackContext`]. Without
/// this, we'd need to pass both individually all over the place.
///
/// This napi-specific abstraction does not implement [`turbo_tasks::NonLocalValue`] or
/// [`turbo_tasks::OperationValue`] and should be dereferenced to an [`OperationVc`] before being
/// passed to a [`turbo_tasks::function`].
//
// TODO: If we add a tracing garbage collector to turbo-tasks, this should be tracked as a GC root.
#[derive(Clone)]
pub struct DetachedVc<T> {
    turbopack_ctx: NextTurbopackContext,
    /// The Vc. Must be unresolved, otherwise you are referencing an inactive operation.
    vc: OperationVc<T>,
}

impl<T> DetachedVc<T> {
    pub fn new(turbopack_ctx: NextTurbopackContext, vc: OperationVc<T>) -> Self {
        Self { turbopack_ctx, vc }
    }

    pub fn turbopack_ctx(&self) -> &NextTurbopackContext {
        &self.turbopack_ctx
    }
}

impl<T> Deref for DetachedVc<T> {
    type Target = OperationVc<T>;

    fn deref(&self) -> &Self::Target {
        &self.vc
    }
}

/// An opaque handle to the root of a turbo-tasks computation created by
/// [`turbo_tasks::TurboTasks::spawn_root_task`] that can be passed back and forth to JS across the
/// [`napi`][mod@napi] boundary via [`External`].
///
/// JavaScript code receiving this value **must** call [`root_task_dispose`] in a `try...finally`
/// block to avoid leaking root tasks.
///
/// This is used by [`subscribe`] to create a computation that re-executes when dependencies change.
//
// TODO: If we add a tracing garbage collector to turbo-tasks, this should be tracked as a GC root.
pub struct RootTask {
    turbopack_ctx: NextTurbopackContext,
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
        root_task
            .turbopack_ctx
            .turbo_tasks()
            .dispose_root_task(task);
    }
    Ok(())
}

/// [Peeks] at the [`Issue`]s held by the given source and returns them as [`PlainIssue`]s.
/// It does not [consume] any [`Issue`]s held by the source.
///
/// [Peeks]: turbo_tasks::CollectiblesSource::peek_collectibles
/// [`Issue`]: turbopack_core::issue::Issue
/// [consume]: turbo_tasks::CollectiblesSource::take_collectibles
pub async fn get_issues<T: Send>(
    source: OperationVc<T>,
    filter: &IssueFilter,
) -> Result<Arc<Vec<ReadRef<PlainIssue>>>> {
    Ok(Arc::new(
        source.peek_issues().get_plain_issues(filter).await?,
    ))
}

/// Returns true if the file path refers to a Next.js/React internal file whose
/// source code frames would be unhelpful (e.g. large bundled vendored files).
///
/// Mirrors the JS `isInternal()` check from
/// `packages/next/src/shared/lib/is-internal.ts`.
fn is_internal(file_path: &str) -> bool {
    // Uses [/\\] so both Unix and Windows separators are matched without
    // needing to normalize the path
    static RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(
            r"(?x)
            # React vendored in Next.js dist/compiled (reactVendoredRe)
            [/\\]next[/\\]dist[/\\]compiled[/\\](?:react|react-dom|react-server-dom-webpack|react-server-dom-turbopack|scheduler)[/\\]
            # React in node_modules (reactNodeModulesRe)
            | node_modules[/\\](?:react|react-dom|scheduler)[/\\]
            # Next.js internals (nextInternalsRe)
            | node_modules[/\\]next[/\\]
            | [/\\]\.next[/\\]static[/\\]chunks[/\\]webpack\.js$
            | edge-runtime-webpack\.js$
            | webpack-runtime\.js$
            ",
        )
        .expect("is_internal regex must compile")
    });

    RE.is_match(file_path)
}

/// Renders a code frame for a source location, if available.
///
/// This avoids transferring the full source file content across the NAPI
/// boundary just to call back into Rust for code frame rendering.
///
/// Because this accesses the terminal size, this function call should not be cached (e.g. in
/// turbo-tasks).
fn render_source_code_frame(
    severity: IssueSeverity,
    source: &PlainIssueSource,
    file_path: &str,
) -> Result<Option<String>> {
    let Some((start, end)) = source.range else {
        return Ok(None);
    };

    if is_internal(file_path) {
        return Ok(None);
    }

    let content = match &*source.asset.content {
        FileContent::Content(c) => {
            let Ok(content) = c.content().to_str() else {
                return Ok(None);
            };
            content
        }
        FileContent::NotFound => return Ok(None),
    };

    // SourcePos is 0-indexed; Location is 1-indexed
    let location = CodeFrameLocation {
        start: Location {
            line: (start.line + 1) as usize,
            column: Some((start.column + 1) as usize),
        },
        end: Some(Location {
            line: (end.line + 1) as usize,
            column: Some((end.column + 1) as usize),
        }),
    };

    render_code_frame(
        &content,
        &location,
        &CodeFrameOptions {
            color: match severity {
                IssueSeverity::Bug | IssueSeverity::Fatal | IssueSeverity::Error => {
                    CodeFrameColorMode::Error
                }
                IssueSeverity::Warning => CodeFrameColorMode::Warning,
                IssueSeverity::Hint
                | IssueSeverity::Note
                | IssueSeverity::Suggestion
                | IssueSeverity::Info => CodeFrameColorMode::Info,
            },
            highlight_code: true,
            max_width: terminal_size::terminal_size()
                .map(|(w, _)| w.0 as usize)
                .unwrap_or(100),
            ..Default::default()
        },
    )
}

/// Renders a code frame for the issue's primary source location.
fn render_issue_code_frame(issue: &PlainIssue) -> Result<Option<String>> {
    let Some(source) = issue.source.as_ref() else {
        return Ok(None);
    };
    render_source_code_frame(issue.severity, source, &issue.file_path)
}

#[napi(object)]
pub struct NapiIssue {
    pub severity: String,
    pub stage: String,
    pub file_path: RcStr,
    pub title: serde_json::Value,
    pub description: Option<serde_json::Value>,
    pub detail: Option<serde_json::Value>,
    pub source: Option<NapiIssueSource>,
    pub additional_sources: Vec<NapiAdditionalIssueSource>,
    pub documentation_link: RcStr,
    pub import_traces: serde_json::Value,
    /// Pre-rendered code frame for the issue's source location, if available.
    /// Rendered in Rust to avoid transferring full source file content to JS.
    pub code_frame: Option<String>,
}

#[napi(object)]
pub struct NapiAdditionalIssueSource {
    pub description: RcStr,
    pub source: NapiIssueSource,
    /// Pre-rendered code frame for this additional source location, if available.
    pub code_frame: Option<String>,
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
            source: issue.source.as_ref().map(|source| source.into()),
            additional_sources: issue
                .additional_sources
                .iter()
                .map(|s| NapiAdditionalIssueSource {
                    description: s.description.clone(),
                    code_frame: render_source_code_frame(
                        issue.severity,
                        &s.source,
                        &s.source.asset.file_path,
                    )
                    .unwrap_or_default(),
                    source: (&s.source).into(),
                })
                .collect(),
            title: serde_json::to_value(StyledStringSerialize::from(&issue.title)).unwrap(),
            import_traces: serde_json::to_value(&issue.import_traces).unwrap(),
            code_frame: render_issue_code_frame(issue).unwrap_or_default(),
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
    pub ident: RcStr,
    pub file_path: RcStr,
}

impl From<&PlainSource> for NapiSource {
    fn from(source: &PlainSource) -> Self {
        Self {
            ident: source.ident.clone(),
            file_path: source.file_path.clone(),
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
pub struct NapiUsedFeature {
    pub feature_name: RcStr,
    /// How many times it was used, typically this means how often it was imported.
    pub invocation_count: u32,
}

impl NapiUsedFeature {
    pub fn new(feature_name: RcStr, invocation_count: u32) -> Self {
        Self {
            feature_name,
            invocation_count,
        }
    }
}

pub struct TurbopackResult<T: ToNapiValue> {
    pub result: T,
    pub issues: Vec<NapiIssue>,
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

        Ok(unsafe { obj.raw() })
    }
}

pub fn subscribe<T: 'static + Send + Sync, F: Future<Output = Result<T>> + Send, V: ToNapiValue>(
    ctx: NextTurbopackContext,
    func: JsFunction,
    handler: impl 'static + Sync + Send + Clone + Fn() -> F,
    mapper: impl 'static + Sync + Send + FnMut(ThreadSafeCallContext<T>) -> napi::Result<Vec<V>>,
) -> napi::Result<External<RootTask>> {
    let func: ThreadsafeFunction<T> = func.create_threadsafe_function(0, mapper)?;
    let task_id = ctx.turbo_tasks().spawn_root_task({
        let ctx = ctx.clone();
        move || {
            let ctx = ctx.clone();
            let handler = handler.clone();
            let func = func.clone();
            async move {
                let result = handler()
                    .or_else(|e| ctx.throw_turbopack_internal_result(&e))
                    .await;

                let status = func.call(result, ThreadsafeFunctionCallMode::NonBlocking);
                if !matches!(status, Status::Ok) {
                    let error = anyhow!("Error calling JS function: {}", status);
                    eprintln!("{error}");
                    return Err::<Vc<()>, _>(error);
                }
                Ok(Default::default())
            }
        }
    });
    Ok(External::new(RootTask {
        turbopack_ctx: ctx,
        task_id: Some(task_id),
    }))
}

// Await the source and return fatal issues if there are any, otherwise
// propagate any actual error results.
pub async fn strongly_consistent_catch_collectables<R: VcValueType + Send>(
    source_op: OperationVc<R>,
    filter: &IssueFilter,
) -> Result<(
    Option<ReadRef<R>>,
    Arc<Vec<ReadRef<PlainIssue>>>,
    Arc<Effects>,
)> {
    let result = source_op.read_strongly_consistent().final_read_hint().await;
    let issues = get_issues(source_op, filter).await?;
    let effects = Arc::new(take_effects(source_op).await?);

    let result = if result.is_err() && issues.iter().any(|i| i.severity <= IssueSeverity::Error) {
        None
    } else {
        Some(result?)
    };

    Ok((result, issues, effects))
}

#[napi]
pub fn expand_next_js_template(
    content: Buffer,
    template_path: String,
    next_package_dir_path: String,
    #[napi(ts_arg_type = "Record<string, string>")] replacements: FxHashMap<String, String>,
    #[napi(ts_arg_type = "Record<string, string>")] injections: FxHashMap<String, String>,
    #[napi(ts_arg_type = "Record<string, string | null>")] imports: FxHashMap<
        String,
        Option<String>,
    >,
) -> napi::Result<String> {
    Ok(next_taskless::expand_next_js_template(
        str::from_utf8(&content).context("template content must be valid utf-8")?,
        &template_path,
        &next_package_dir_path,
        replacements.iter().map(|(k, v)| (&**k, &**v)),
        injections.iter().map(|(k, v)| (&**k, &**v)),
        imports.iter().map(|(k, v)| (&**k, v.as_deref())),
    )?)
}
