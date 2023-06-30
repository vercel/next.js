use std::{borrow::Cow, ops::ControlFlow, thread::available_parallelism, time::Duration};

use anyhow::{anyhow, bail, Result};
use async_stream::try_stream as generator;
use futures::{
    channel::mpsc::{unbounded, UnboundedSender},
    pin_mut, SinkExt, StreamExt,
};
use futures_retry::{FutureRetry, RetryPolicy};
use indexmap::indexmap;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use turbo_tasks::{
    duration_span, mark_finished,
    primitives::{JsonValueVc, StringVc},
    util::SharedError,
    CompletionVc, NothingVc, RawVc, TryJoinIterExt, Value, ValueToString,
};
use turbo_tasks_bytes::{Bytes, Stream};
use turbo_tasks_env::{ProcessEnv, ProcessEnvVc};
use turbo_tasks_fs::{
    glob::GlobVc, to_sys_path, DirectoryEntry, File, FileSystemPathVc, ReadGlobResultVc,
};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{
        ChunkableAsset, ChunkingContext, ChunkingContextVc, EvaluatableAssetVc, EvaluatableAssetsVc,
    },
    context::{AssetContext, AssetContextVc},
    ident::AssetIdentVc,
    issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc},
    reference_type::{InnerAssetsVc, ReferenceType},
    source_asset::SourceAssetVc,
    virtual_asset::VirtualAssetVc,
};

use crate::{
    bootstrap::NodeJsBootstrapAsset,
    embed_js::embed_file_path,
    emit, emit_package_json, internal_assets_for_source_mapping,
    pool::{FormattingMode, NodeJsOperation, NodeJsPool, NodeJsPoolVc},
    source_map::StructuredError,
    AssetsForSourceMappingVc,
};

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum EvalJavaScriptOutgoingMessage<'a> {
    #[serde(rename_all = "camelCase")]
    Evaluate { args: Vec<&'a JsonValue> },
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
enum EvalJavaScriptIncomingMessage {
    FileDependency {
        path: String,
    },
    BuildDependency {
        path: String,
    },
    DirDependency {
        path: String,
        glob: String,
    },
    EmittedError {
        severity: IssueSeverity,
        error: StructuredError,
    },
    Value {
        // TODO(WEB-735): There is like 3 levels of JSON string encoding that goes into returning a
        // value, making it really inefficient.
        data: String,
    },
    End {
        data: Option<String>,
    },
    Error(StructuredError),
}

type LoopResult = ControlFlow<Result<Option<String>, StructuredError>, String>;

type EvaluationItem = Result<Bytes, SharedError>;
type JavaScriptStream = Stream<EvaluationItem>;

#[turbo_tasks::value(eq = "manual", cell = "new", serialization = "none")]
struct JavaScriptStreamSender {
    #[turbo_tasks(trace_ignore, debug_ignore)]
    get: Box<dyn Fn() -> UnboundedSender<Result<Bytes, SharedError>> + Send + Sync>,
}

#[turbo_tasks::value(transparent)]
#[derive(Clone, Debug)]
pub struct JavaScriptEvaluation(#[turbo_tasks(trace_ignore)] JavaScriptStream);

#[turbo_tasks::function]
/// Pass the file you cared as `runtime_entries` to invalidate and reload the
/// evaluated result automatically.
pub async fn get_evaluate_pool(
    module_asset: AssetVc,
    cwd: FileSystemPathVc,
    env: ProcessEnvVc,
    context: AssetContextVc,
    chunking_context: ChunkingContextVc,
    runtime_entries: Option<EvaluatableAssetsVc>,
    additional_invalidation: CompletionVc,
    debug: bool,
) -> Result<NodeJsPoolVc> {
    let runtime_asset = context.process(
        SourceAssetVc::new(embed_file_path("ipc/evaluate.ts")).into(),
        Value::new(ReferenceType::Internal(InnerAssetsVc::empty())),
    );

    let module_path = module_asset.ident().path().await?;
    let file_name = module_path.file_name();
    let file_name = if file_name.ends_with(".js") {
        Cow::Borrowed(file_name)
    } else if let Some(file_name) = file_name.strip_suffix(".ts") {
        Cow::Owned(format!("{file_name}.js"))
    } else {
        Cow::Owned(format!("{file_name}.js"))
    };
    let path = chunking_context.output_root().join(file_name.as_ref());
    let entry_module = context.process(
        VirtualAssetVc::new(
            runtime_asset.ident().path().join("evaluate.js"),
            File::from(
                "import { run } from 'RUNTIME'; run((...args) => \
                 (require('INNER').default(...args)))",
            )
            .into(),
        )
        .into(),
        Value::new(ReferenceType::Internal(InnerAssetsVc::cell(indexmap! {
            "INNER".to_string() => module_asset,
            "RUNTIME".to_string() => runtime_asset
        }))),
    );

    let Some(entry_module) = EvaluatableAssetVc::resolve_from(entry_module).await? else {
        bail!("Internal module is not evaluatable");
    };

    let (Some(cwd), Some(entrypoint)) = (to_sys_path(cwd).await?, to_sys_path(path).await?) else {
        panic!("can only evaluate from a disk filesystem");
    };

    let runtime_entries = {
        let globals_module = context.process(
            SourceAssetVc::new(embed_file_path("globals.ts")).into(),
            Value::new(ReferenceType::Internal(InnerAssetsVc::empty())),
        );

        let Some(globals_module) = EvaluatableAssetVc::resolve_from(globals_module).await? else {
            bail!("Internal module is not evaluatable");
        };

        let mut entries = vec![globals_module];
        if let Some(runtime_entries) = runtime_entries {
            for &entry in &*runtime_entries.await? {
                entries.push(entry)
            }
        }

        EvaluatableAssetsVc::cell(entries)
    };

    let bootstrap = NodeJsBootstrapAsset {
        path,
        chunking_context,
        entry: entry_module.as_root_chunk(chunking_context),
        evaluatable_assets: runtime_entries.with_entry(entry_module),
    }
    .cell()
    .into();

    let output_root = chunking_context.output_root();
    let emit_package = emit_package_json(output_root);
    let emit = emit(bootstrap, output_root);
    let assets_for_source_mapping = internal_assets_for_source_mapping(bootstrap, output_root);
    emit_package.await?;
    emit.await?;
    let pool = NodeJsPool::new(
        cwd,
        entrypoint,
        env.read_all()
            .await?
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
        assets_for_source_mapping,
        output_root,
        chunking_context.context_path().root(),
        available_parallelism().map_or(1, |v| v.get()),
        debug,
    );
    additional_invalidation.await?;
    Ok(pool.cell())
}

struct PoolErrorHandler;

/// Number of attempts before we start slowing down the retry.
const MAX_FAST_ATTEMPTS: usize = 5;
/// Total number of attempts.
const MAX_ATTEMPTS: usize = MAX_FAST_ATTEMPTS * 2;

impl futures_retry::ErrorHandler<anyhow::Error> for PoolErrorHandler {
    type OutError = anyhow::Error;

    fn handle(&mut self, attempt: usize, err: anyhow::Error) -> RetryPolicy<Self::OutError> {
        if attempt >= MAX_ATTEMPTS {
            RetryPolicy::ForwardError(err)
        } else if attempt >= MAX_FAST_ATTEMPTS {
            RetryPolicy::WaitRetry(Duration::from_secs(1))
        } else {
            RetryPolicy::Repeat
        }
    }
}

/// Pass the file you cared as `runtime_entries` to invalidate and reload the
/// evaluated result automatically.
#[turbo_tasks::function]
pub fn evaluate(
    module_asset: AssetVc,
    cwd: FileSystemPathVc,
    env: ProcessEnvVc,
    context_ident_for_issue: AssetIdentVc,
    context: AssetContextVc,
    chunking_context: ChunkingContextVc,
    runtime_entries: Option<EvaluatableAssetsVc>,
    args: Vec<JsonValueVc>,
    additional_invalidation: CompletionVc,
    debug: bool,
) -> JavaScriptEvaluationVc {
    // Note the following code uses some hacks to create a child task that produces
    // a stream that is returned by this task.

    // We create a new cell in this task, which will be updated from the
    // [compute_evaluate_stream] task.
    let cell = turbo_tasks::macro_helpers::find_cell_by_type(*JAVASCRIPTEVALUATION_VALUE_TYPE_ID);

    // We initialize the cell with a stream that is open, but has no values.
    // The first [compute_evaluate_stream] pipe call will pick up that stream.
    let (sender, receiver) = unbounded();
    cell.update_shared(JavaScriptEvaluation(JavaScriptStream::new_open(
        vec![],
        Box::new(receiver),
    )));
    let initial = Mutex::new(Some(sender));

    // run the evaluation as side effect
    let _ = compute_evaluate_stream(
        module_asset,
        cwd,
        env,
        context_ident_for_issue,
        context,
        chunking_context,
        runtime_entries,
        args,
        additional_invalidation,
        debug,
        JavaScriptStreamSender {
            get: Box::new(move || {
                if let Some(sender) = initial.lock().take() {
                    sender
                } else {
                    // In cases when only [compute_evaluate_stream] is (re)executed, we need to
                    // update the old stream with a new value.
                    let (sender, receiver) = unbounded();
                    cell.update_shared(JavaScriptEvaluation(JavaScriptStream::new_open(
                        vec![],
                        Box::new(receiver),
                    )));
                    sender
                }
            }),
        }
        .cell(),
    );

    let raw: RawVc = cell.into();
    raw.into()
}

#[turbo_tasks::function]
async fn compute_evaluate_stream(
    module_asset: AssetVc,
    cwd: FileSystemPathVc,
    env: ProcessEnvVc,
    context_ident_for_issue: AssetIdentVc,
    context: AssetContextVc,
    chunking_context: ChunkingContextVc,
    runtime_entries: Option<EvaluatableAssetsVc>,
    args: Vec<JsonValueVc>,
    additional_invalidation: CompletionVc,
    debug: bool,
    sender: JavaScriptStreamSenderVc,
) -> Result<NothingVc> {
    mark_finished();
    let Ok(sender) = sender.await else {
        // Impossible to handle the error in a good way.
        return Ok(NothingVc::new());
    };

    let stream = generator! {
        let pool = get_evaluate_pool(
            module_asset,
            cwd,
            env,
            context,
            chunking_context,
            runtime_entries,
            additional_invalidation,
            debug,
        );

        // Read this strongly consistent, since we don't want to run inconsistent
        // node.js code.
        let pool = pool.strongly_consistent().await?;

        let args = args.into_iter().try_join().await?;
        // Assume this is a one-off operation, so we can kill the process
        // TODO use a better way to decide that.
        let kill = args.is_empty();

        // Workers in the pool could be in a bad state that we didn't detect yet.
        // The bad state might even be unnoticeable until we actually send the job to the
        // worker. So we retry picking workers from the pools until we succeed
        // sending the job.

        let (mut operation, _) = FutureRetry::new(
            || async {
                let mut operation = pool.operation().await?;
                operation
                    .send(EvalJavaScriptOutgoingMessage::Evaluate {
                        args: args.iter().map(|v| &**v).collect(),
                    })
                    .await?;
                Ok(operation)
            },
            PoolErrorHandler,
        )
        .await
        .map_err(|(e, _)| e)?;

        // The evaluation sent an initial intermediate value without completing. We'll
        // need to spawn a new thread to continually pull data out of the process,
        // and ferry that along.
        loop {
            let output = pull_operation(&mut operation, cwd, &pool, context_ident_for_issue, chunking_context).await?;

            match output {
                LoopResult::Continue(data) => {
                    yield data.into();
                }
                LoopResult::Break(Ok(Some(data))) => {
                    yield data.into();
                    break;
                }
                LoopResult::Break(Err(e)) => {
                    let error = e.print(pool.assets_for_source_mapping, pool.assets_root, chunking_context.context_path().root(), FormattingMode::Plain).await?;
                    Err(anyhow!("Node.js evaluation failed: {}", error))?;
                    break;
                }
                LoopResult::Break(Ok(None)) => {
                    break;
                }
            }
        }

        if kill {
            operation.wait_or_kill().await?;
        }
    };

    let mut sender = (sender.get)();
    pin_mut!(stream);
    while let Some(value) = stream.next().await {
        if sender.send(value).await.is_err() {
            return Ok(NothingVc::new());
        }
        if sender.flush().await.is_err() {
            return Ok(NothingVc::new());
        }
    }

    Ok(NothingVc::new())
}

/// Repeatedly pulls from the NodeJsOperation until we receive a
/// value/error/end.
async fn pull_operation(
    operation: &mut NodeJsOperation,
    cwd: FileSystemPathVc,
    pool: &NodeJsPool,
    context_ident_for_issue: AssetIdentVc,
    chunking_context: ChunkingContextVc,
) -> Result<LoopResult> {
    let mut file_dependencies = Vec::new();
    let mut dir_dependencies = Vec::new();

    let guard = duration_span!("Node.js evaluation");

    let output = loop {
        match operation.recv().await? {
            EvalJavaScriptIncomingMessage::Error(error) => {
                EvaluationIssue {
                    error,
                    context_ident: context_ident_for_issue,
                    assets_for_source_mapping: pool.assets_for_source_mapping,
                    assets_root: pool.assets_root,
                    project_dir: chunking_context.context_path().root(),
                }
                .cell()
                .as_issue()
                .emit();
                // Do not reuse the process in case of error
                operation.disallow_reuse();
                // Issue emitted, we want to break but don't want to return an error
                break ControlFlow::Break(Ok(None));
            }
            EvalJavaScriptIncomingMessage::Value { data } => break ControlFlow::Continue(data),
            EvalJavaScriptIncomingMessage::End { data } => break ControlFlow::Break(Ok(data)),
            EvalJavaScriptIncomingMessage::FileDependency { path } => {
                // TODO We might miss some changes that happened during execution
                file_dependencies.push(cwd.join(&path).read());
            }
            EvalJavaScriptIncomingMessage::BuildDependency { path } => {
                // TODO We might miss some changes that happened during execution
                BuildDependencyIssue {
                    context_ident: context_ident_for_issue,
                    path: cwd.join(&path),
                }
                .cell()
                .as_issue()
                .emit();
            }
            EvalJavaScriptIncomingMessage::DirDependency { path, glob } => {
                // TODO We might miss some changes that happened during execution
                dir_dependencies.push(dir_dependency(
                    cwd.join(&path).read_glob(GlobVc::new(&glob), false),
                ));
            }
            EvalJavaScriptIncomingMessage::EmittedError { error, severity } => {
                EvaluateEmittedErrorIssue {
                    context: context_ident_for_issue.path(),
                    error,
                    severity: severity.cell(),
                    assets_for_source_mapping: pool.assets_for_source_mapping,
                    assets_root: pool.assets_root,
                    project_dir: chunking_context.context_path().root(),
                }
                .cell()
                .as_issue()
                .emit();
            }
        }
    };
    drop(guard);

    // Read dependencies to make them a dependencies of this task. This task will
    // execute again when they change.
    for dep in file_dependencies {
        dep.await?;
    }
    for dep in dir_dependencies {
        dep.await?;
    }

    Ok(output)
}

/// An issue that occurred while evaluating node code.
#[turbo_tasks::value(shared)]
pub struct EvaluationIssue {
    pub context_ident: AssetIdentVc,
    pub error: StructuredError,
    pub assets_for_source_mapping: AssetsForSourceMappingVc,
    pub assets_root: FileSystemPathVc,
    pub project_dir: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl Issue for EvaluationIssue {
    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Error evaluating Node.js code".to_string())
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("build".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.context_ident.path()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(
            self.error
                .print(
                    self.assets_for_source_mapping,
                    self.assets_root,
                    self.project_dir,
                    FormattingMode::Plain,
                )
                .await?,
        ))
    }
}

/// An issue that occurred while evaluating node code.
#[turbo_tasks::value(shared)]
pub struct BuildDependencyIssue {
    pub context_ident: AssetIdentVc,
    pub path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl Issue for BuildDependencyIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Build dependencies are not yet supported".to_string())
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("build".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.context_ident.path()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(
            format!("The file at {} is a build dependency, which is not yet implemented.
Changing this file or any dependency will not be recognized and might require restarting the server", self.path.to_string().await?)
        ))
    }
}

/// A hack to invalidate when any file in a directory changes. Need to be
/// awaited before files are accessed.
#[turbo_tasks::function]
async fn dir_dependency(glob: ReadGlobResultVc) -> Result<CompletionVc> {
    let shallow = dir_dependency_shallow(glob);
    let glob = glob.await?;
    glob.inner
        .values()
        .map(|&inner| dir_dependency(inner))
        .try_join()
        .await?;
    shallow.await?;
    Ok(CompletionVc::new())
}

#[turbo_tasks::function]
async fn dir_dependency_shallow(glob: ReadGlobResultVc) -> Result<CompletionVc> {
    let glob = glob.await?;
    for item in glob.results.values() {
        // Reading all files to add itself as dependency
        match *item {
            DirectoryEntry::File(file) => {
                file.track().await?;
            }
            DirectoryEntry::Directory(dir) => {
                dir_dependency(dir.read_glob(GlobVc::new("**"), false)).await?;
            }
            DirectoryEntry::Symlink(symlink) => {
                symlink.read_link().await?;
            }
            DirectoryEntry::Other(other) => {
                other.get_type().await?;
            }
            DirectoryEntry::Error => {}
        }
    }
    Ok(CompletionVc::new())
}

#[turbo_tasks::value(shared)]
pub struct EvaluateEmittedErrorIssue {
    pub context: FileSystemPathVc,
    pub severity: IssueSeverityVc,
    pub error: StructuredError,
    pub assets_for_source_mapping: AssetsForSourceMappingVc,
    pub assets_root: FileSystemPathVc,
    pub project_dir: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl Issue for EvaluateEmittedErrorIssue {
    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.context
    }

    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        self.severity
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("loaders".to_string())
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Issue while running loader".to_string())
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(
            self.error
                .print(
                    self.assets_for_source_mapping,
                    self.assets_root,
                    self.project_dir,
                    FormattingMode::Plain,
                )
                .await?,
        ))
    }
}
