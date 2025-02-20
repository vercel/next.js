use std::{borrow::Cow, iter, ops::ControlFlow, thread::available_parallelism, time::Duration};

use anyhow::{anyhow, bail, Result};
use async_stream::try_stream as generator;
use async_trait::async_trait;
use futures::{
    channel::mpsc::{unbounded, UnboundedSender},
    pin_mut, SinkExt, StreamExt,
};
use futures_retry::{FutureRetry, RetryPolicy};
use parking_lot::Mutex;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value as JsonValue;
use turbo_tasks::{
    apply_effects, duration_span, fxindexmap, mark_finished, prevent_gc, util::SharedError,
    Completion, FxIndexMap, NonLocalValue, OperationVc, RawVc, ResolvedVc, TaskInput,
    TryJoinIterExt, Value, Vc,
};
use turbo_tasks_bytes::{Bytes, Stream};
use turbo_tasks_env::{EnvMap, ProcessEnv};
use turbo_tasks_fs::{to_sys_path, File, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
    changed::content_changed,
    chunk::{ChunkingContext, ChunkingContextExt, EvaluatableAsset, EvaluatableAssets},
    context::AssetContext,
    error::PrettyPrintError,
    file_source::FileSource,
    ident::AssetIdent,
    issue::{Issue, IssueExt, IssueStage, OptionStyledString, StyledString},
    module::Module,
    module_graph::ModuleGraph,
    output::{OutputAsset, OutputAssets},
    reference_type::{InnerAssets, ReferenceType},
    virtual_source::VirtualSource,
};

use crate::{
    embed_js::embed_file_path,
    emit, emit_package_json, internal_assets_for_source_mapping,
    pool::{FormattingMode, NodeJsOperation, NodeJsPool},
    source_map::StructuredError,
    AssetsForSourceMapping,
};

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum EvalJavaScriptOutgoingMessage<'a> {
    #[serde(rename_all = "camelCase")]
    Evaluate { args: Vec<&'a JsonValue> },
    Result {
        id: u64,
        data: Option<JsonValue>,
        error: Option<String>,
    },
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
enum EvalJavaScriptIncomingMessage {
    Info { data: JsonValue },
    Request { id: u64, data: JsonValue },
    End { data: Option<String> },
    Error(StructuredError),
}

type LoopResult = ControlFlow<Result<Option<String>, StructuredError>, String>;

type EvaluationItem = Result<Bytes, SharedError>;
type JavaScriptStream = Stream<EvaluationItem>;

#[turbo_tasks::value(eq = "manual", cell = "new", serialization = "none")]
pub struct JavaScriptStreamSender {
    #[turbo_tasks(trace_ignore, debug_ignore)]
    get: Box<dyn Fn() -> UnboundedSender<Result<Bytes, SharedError>> + Send + Sync>,
}

#[turbo_tasks::value(transparent)]
#[derive(Clone, Debug)]
pub struct JavaScriptEvaluation(#[turbo_tasks(trace_ignore)] JavaScriptStream);

#[turbo_tasks::value]
struct EmittedEvaluatePoolAssets {
    bootstrap: ResolvedVc<Box<dyn OutputAsset>>,
    output_root: ResolvedVc<FileSystemPath>,
    entrypoint: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::function(operation)]
async fn emit_evaluate_pool_assets_operation(
    module_asset: ResolvedVc<Box<dyn Module>>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    runtime_entries: Option<ResolvedVc<EvaluatableAssets>>,
) -> Result<Vc<EmittedEvaluatePoolAssets>> {
    let runtime_asset = asset_context
        .process(
            Vc::upcast(FileSource::new(embed_file_path("ipc/evaluate.ts".into()))),
            Value::new(ReferenceType::Internal(
                InnerAssets::empty().to_resolved().await?,
            )),
        )
        .module()
        .to_resolved()
        .await?;

    let module_path = module_asset.ident().path().await?;
    let file_name = module_path.file_name();
    let file_name = if file_name.ends_with(".js") {
        Cow::Borrowed(file_name)
    } else if let Some(file_name) = file_name.strip_suffix(".ts") {
        Cow::Owned(format!("{file_name}.js"))
    } else {
        Cow::Owned(format!("{file_name}.js"))
    };
    let entrypoint = chunking_context.output_root().join(file_name.into());
    let entry_module = asset_context
        .process(
            Vc::upcast(VirtualSource::new(
                runtime_asset.ident().path().join("evaluate.js".into()),
                AssetContent::file(
                    File::from("import { run } from 'RUNTIME'; run(() => import('INNER'))").into(),
                ),
            )),
            Value::new(ReferenceType::Internal(ResolvedVc::cell(fxindexmap! {
                "INNER".into() => module_asset,
                "RUNTIME".into() => runtime_asset
            }))),
        )
        .module();

    let runtime_entries = {
        let globals_module = asset_context
            .process(
                Vc::upcast(FileSource::new(embed_file_path("globals.ts".into()))),
                Value::new(ReferenceType::Internal(
                    InnerAssets::empty().to_resolved().await?,
                )),
            )
            .module();

        let Some(globals_module) =
            Vc::try_resolve_sidecast::<Box<dyn EvaluatableAsset>>(globals_module).await?
        else {
            bail!("Internal module is not evaluatable");
        };

        let mut entries = vec![globals_module.to_resolved().await?];
        if let Some(runtime_entries) = runtime_entries {
            for &entry in &*runtime_entries.await? {
                entries.push(entry)
            }
        }
        entries
    };

    let module_graph = ModuleGraph::from_modules(Vc::cell(
        iter::once(entry_module.to_resolved().await?)
            .chain(runtime_entries.iter().copied().map(ResolvedVc::upcast))
            .collect(),
    ));

    let bootstrap = chunking_context.root_entry_chunk_group_asset(
        entrypoint,
        entry_module,
        module_graph,
        OutputAssets::empty(),
        Vc::<EvaluatableAssets>::cell(runtime_entries),
    );

    let output_root = chunking_context.output_root().to_resolved().await?;
    let _ = emit_package_json(*output_root).resolve().await?;
    let _ = emit(bootstrap, *output_root).resolve().await?;

    Ok(EmittedEvaluatePoolAssets {
        bootstrap: bootstrap.to_resolved().await?,
        output_root,
        entrypoint: entrypoint.to_resolved().await?,
    }
    .cell())
}

#[turbo_tasks::function(operation)]
async fn emit_evaluate_pool_assets_with_effects_operation(
    module_asset: ResolvedVc<Box<dyn Module>>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    runtime_entries: Option<ResolvedVc<EvaluatableAssets>>,
) -> Result<Vc<EmittedEvaluatePoolAssets>> {
    let operation = emit_evaluate_pool_assets_operation(
        module_asset,
        asset_context,
        chunking_context,
        runtime_entries,
    );
    let result = operation.resolve_strongly_consistent().await?;
    apply_effects(operation).await?;
    Ok(*result)
}

#[derive(
    Clone, Copy, Hash, Debug, PartialEq, Eq, Serialize, Deserialize, TaskInput, NonLocalValue,
)]
pub enum EnvVarTracking {
    WholeEnvTracked,
    Untracked,
}

#[turbo_tasks::function(operation)]
/// Pass the file you cared as `runtime_entries` to invalidate and reload the
/// evaluated result automatically.
pub async fn get_evaluate_pool(
    module_asset: ResolvedVc<Box<dyn Module>>,
    cwd: ResolvedVc<FileSystemPath>,
    env: ResolvedVc<Box<dyn ProcessEnv>>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    runtime_entries: Option<ResolvedVc<EvaluatableAssets>>,
    additional_invalidation: ResolvedVc<Completion>,
    debug: bool,
    env_var_tracking: EnvVarTracking,
) -> Result<Vc<NodeJsPool>> {
    let EmittedEvaluatePoolAssets {
        bootstrap,
        output_root,
        entrypoint,
    } = *emit_evaluate_pool_assets_with_effects_operation(
        module_asset,
        asset_context,
        chunking_context,
        runtime_entries,
    )
    .read_strongly_consistent()
    .await?;

    let (Some(cwd), Some(entrypoint)) = (to_sys_path(*cwd).await?, to_sys_path(*entrypoint).await?)
    else {
        panic!("can only evaluate from a disk filesystem");
    };

    // Invalidate pool when code content changes
    content_changed(Vc::upcast(*bootstrap)).await?;
    let assets_for_source_mapping = internal_assets_for_source_mapping(*bootstrap, *output_root)
        .to_resolved()
        .await?;
    let env = match env_var_tracking {
        EnvVarTracking::WholeEnvTracked => env.read_all().await?,
        EnvVarTracking::Untracked => {
            // We always depend on some known env vars that are used by Node.js
            common_node_env(*env).await?;
            for name in ["FORCE_COLOR", "NO_COLOR", "OPENSSL_CONF", "TZ"] {
                env.read(name.into()).await?;
            }

            env.read_all().untracked().await?
        }
    };
    let pool = NodeJsPool::new(
        cwd,
        entrypoint,
        env.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        assets_for_source_mapping,
        output_root,
        chunking_context.root_path().to_resolved().await?,
        available_parallelism().map_or(1, |v| v.get()),
        debug,
    );
    additional_invalidation.await?;
    Ok(pool.cell())
}

#[turbo_tasks::function]
async fn common_node_env(env: Vc<Box<dyn ProcessEnv>>) -> Result<Vc<EnvMap>> {
    let mut filtered = FxIndexMap::default();
    let env = env.read_all().await?;
    for (key, value) in &*env {
        let uppercase = key.to_uppercase();
        for filter in &["NODE_", "UV_", "SSL_"] {
            if uppercase.starts_with(filter) {
                filtered.insert(key.clone(), value.clone());
                break;
            }
        }
    }
    Ok(Vc::cell(filtered))
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

#[async_trait]
pub trait EvaluateContext {
    type InfoMessage: DeserializeOwned;
    type RequestMessage: DeserializeOwned;
    type ResponseMessage: Serialize;
    type State: Default;

    fn compute(self, sender: Vc<JavaScriptStreamSender>);
    fn pool(&self) -> OperationVc<NodeJsPool>;
    fn keep_alive(&self) -> bool {
        false
    }
    fn args(&self) -> &[ResolvedVc<JsonValue>];
    fn cwd(&self) -> Vc<FileSystemPath>;
    async fn emit_error(&self, error: StructuredError, pool: &NodeJsPool) -> Result<()>;
    async fn info(
        &self,
        state: &mut Self::State,
        data: Self::InfoMessage,
        pool: &NodeJsPool,
    ) -> Result<()>;
    async fn request(
        &self,
        state: &mut Self::State,
        data: Self::RequestMessage,
        pool: &NodeJsPool,
    ) -> Result<Self::ResponseMessage>;
    async fn finish(&self, _state: Self::State, _pool: &NodeJsPool) -> Result<()>;
}

pub fn custom_evaluate(evaluate_context: impl EvaluateContext) -> Vc<JavaScriptEvaluation> {
    // TODO: The way we invoke compute_evaluate_stream as side effect is not
    // GC-safe, so we disable GC for this task.
    prevent_gc();

    // Note the following code uses some hacks to create a child task that produces
    // a stream that is returned by this task.

    // We create a new cell in this task, which will be updated from the
    // [compute_evaluate_stream] task.
    let cell = turbo_tasks::macro_helpers::find_cell_by_type(*JAVASCRIPTEVALUATION_VALUE_TYPE_ID);

    // We initialize the cell with a stream that is open, but has no values.
    // The first [compute_evaluate_stream] pipe call will pick up that stream.
    let (sender, receiver) = unbounded();
    cell.update(JavaScriptEvaluation(JavaScriptStream::new_open(
        vec![],
        Box::new(receiver),
    )));
    let initial = Mutex::new(Some(sender));

    // run the evaluation as side effect
    evaluate_context.compute(
        JavaScriptStreamSender {
            get: Box::new(move || {
                if let Some(sender) = initial.lock().take() {
                    sender
                } else {
                    // In cases when only [compute_evaluate_stream] is (re)executed, we need to
                    // update the old stream with a new value.
                    let (sender, receiver) = unbounded();
                    cell.update(JavaScriptEvaluation(JavaScriptStream::new_open(
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

/// Pass the file you cared as `runtime_entries` to invalidate and reload the
/// evaluated result automatically.
#[turbo_tasks::function]
pub fn evaluate(
    module_asset: ResolvedVc<Box<dyn Module>>,
    cwd: ResolvedVc<FileSystemPath>,
    env: ResolvedVc<Box<dyn ProcessEnv>>,
    context_ident_for_issue: ResolvedVc<AssetIdent>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    runtime_entries: Option<ResolvedVc<EvaluatableAssets>>,
    args: Vec<ResolvedVc<JsonValue>>,
    additional_invalidation: ResolvedVc<Completion>,
    debug: bool,
) -> Vc<JavaScriptEvaluation> {
    custom_evaluate(BasicEvaluateContext {
        module_asset,
        cwd,
        env,
        context_ident_for_issue,
        asset_context,
        chunking_context,
        runtime_entries,
        args,
        additional_invalidation,
        debug,
    })
}

pub async fn compute(
    evaluate_context: impl EvaluateContext,
    sender: Vc<JavaScriptStreamSender>,
) -> Result<Vc<()>> {
    mark_finished();
    let Ok(sender) = sender.await else {
        // Impossible to handle the error in a good way.
        return Ok(Default::default());
    };

    let stream = generator! {
        let pool_op = evaluate_context.pool();
        let mut state = Default::default();

        // Read this strongly consistent, since we don't want to run inconsistent
        // node.js code.
        let pool = pool_op.read_strongly_consistent().await?;

        let args = evaluate_context.args().iter().try_join().await?;
        // Assume this is a one-off operation, so we can kill the process
        // TODO use a better way to decide that.
        let kill = !evaluate_context.keep_alive();

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
            let output = pull_operation(&mut operation, &pool, &evaluate_context, &mut state).await?;

            match output {
                LoopResult::Continue(data) => {
                    yield data.into();
                }
                LoopResult::Break(Ok(Some(data))) => {
                    yield data.into();
                    break;
                }
                LoopResult::Break(Err(e)) => {
                    let error = print_error(e, &pool, &evaluate_context).await?;
                    Err(anyhow!("Node.js evaluation failed: {}", error))?;
                    break;
                }
                LoopResult::Break(Ok(None)) => {
                    break;
                }
            }
        }

        evaluate_context.finish(state, &pool).await?;

        if kill {
            operation.wait_or_kill().await?;
        }
    };

    let mut sender = (sender.get)();
    pin_mut!(stream);
    while let Some(value) = stream.next().await {
        if sender.send(value).await.is_err() {
            return Ok(Default::default());
        }
        if sender.flush().await.is_err() {
            return Ok(Default::default());
        }
    }

    Ok(Default::default())
}

/// Repeatedly pulls from the NodeJsOperation until we receive a
/// value/error/end.
async fn pull_operation<T: EvaluateContext>(
    operation: &mut NodeJsOperation,
    pool: &NodeJsPool,
    evaluate_context: &T,
    state: &mut T::State,
) -> Result<LoopResult> {
    let guard = duration_span!("Node.js evaluation");

    let output = loop {
        match operation.recv().await? {
            EvalJavaScriptIncomingMessage::Error(error) => {
                evaluate_context.emit_error(error, pool).await?;
                // Do not reuse the process in case of error
                operation.disallow_reuse();
                // Issue emitted, we want to break but don't want to return an error
                break ControlFlow::Break(Ok(None));
            }
            EvalJavaScriptIncomingMessage::End { data } => break ControlFlow::Break(Ok(data)),
            EvalJavaScriptIncomingMessage::Info { data } => {
                evaluate_context
                    .info(state, serde_json::from_value(data)?, pool)
                    .await?;
            }
            EvalJavaScriptIncomingMessage::Request { id, data } => {
                match evaluate_context
                    .request(state, serde_json::from_value(data)?, pool)
                    .await
                {
                    Ok(response) => {
                        operation
                            .send(EvalJavaScriptOutgoingMessage::Result {
                                id,
                                error: None,
                                data: Some(serde_json::to_value(response)?),
                            })
                            .await?;
                    }
                    Err(e) => {
                        operation
                            .send(EvalJavaScriptOutgoingMessage::Result {
                                id,
                                error: Some(PrettyPrintError(&e).to_string()),
                                data: None,
                            })
                            .await?;
                    }
                }
            }
        }
    };
    drop(guard);

    Ok(output)
}

#[turbo_tasks::function]
async fn basic_compute(
    evaluate_context: BasicEvaluateContext,
    sender: Vc<JavaScriptStreamSender>,
) -> Result<Vc<()>> {
    compute(evaluate_context, sender).await
}

#[derive(Clone, PartialEq, Eq, Hash, TaskInput, Debug, Serialize, Deserialize)]
struct BasicEvaluateContext {
    module_asset: ResolvedVc<Box<dyn Module>>,
    cwd: ResolvedVc<FileSystemPath>,
    env: ResolvedVc<Box<dyn ProcessEnv>>,
    context_ident_for_issue: ResolvedVc<AssetIdent>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    runtime_entries: Option<ResolvedVc<EvaluatableAssets>>,
    args: Vec<ResolvedVc<JsonValue>>,
    additional_invalidation: ResolvedVc<Completion>,
    debug: bool,
}

#[async_trait]
impl EvaluateContext for BasicEvaluateContext {
    type InfoMessage = ();
    type RequestMessage = ();
    type ResponseMessage = ();
    type State = ();

    fn compute(self, sender: Vc<JavaScriptStreamSender>) {
        let _ = basic_compute(self, sender);
    }

    fn pool(&self) -> OperationVc<crate::pool::NodeJsPool> {
        get_evaluate_pool(
            self.module_asset,
            self.cwd,
            self.env,
            self.asset_context,
            self.chunking_context,
            self.runtime_entries,
            self.additional_invalidation,
            self.debug,
            EnvVarTracking::WholeEnvTracked,
        )
    }

    fn args(&self) -> &[ResolvedVc<serde_json::Value>] {
        &self.args
    }

    fn cwd(&self) -> Vc<turbo_tasks_fs::FileSystemPath> {
        *self.cwd
    }

    fn keep_alive(&self) -> bool {
        !self.args.is_empty()
    }

    async fn emit_error(&self, error: StructuredError, pool: &NodeJsPool) -> Result<()> {
        EvaluationIssue {
            error,
            context_ident: self.context_ident_for_issue,
            assets_for_source_mapping: pool.assets_for_source_mapping,
            assets_root: pool.assets_root,
            root_path: self.chunking_context.root_path().to_resolved().await?,
        }
        .resolved_cell()
        .emit();
        Ok(())
    }

    async fn info(
        &self,
        _state: &mut Self::State,
        _data: Self::InfoMessage,
        _pool: &NodeJsPool,
    ) -> Result<()> {
        bail!("BasicEvaluateContext does not support info messages")
    }

    async fn request(
        &self,
        _state: &mut Self::State,
        _data: Self::RequestMessage,
        _pool: &NodeJsPool,
    ) -> Result<Self::ResponseMessage> {
        bail!("BasicEvaluateContext does not support request messages")
    }

    async fn finish(&self, _state: Self::State, _pool: &NodeJsPool) -> Result<()> {
        Ok(())
    }
}

pub fn scale_zero() {
    NodeJsPool::scale_zero();
}

pub fn scale_down() {
    NodeJsPool::scale_down();
}

async fn print_error(
    error: StructuredError,
    pool: &NodeJsPool,
    evaluate_context: &impl EvaluateContext,
) -> Result<String> {
    error
        .print(
            *pool.assets_for_source_mapping,
            *pool.assets_root,
            evaluate_context.cwd(),
            FormattingMode::Plain,
        )
        .await
}
/// An issue that occurred while evaluating node code.
#[turbo_tasks::value(shared)]
pub struct EvaluationIssue {
    pub context_ident: ResolvedVc<AssetIdent>,
    pub error: StructuredError,
    pub assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    pub assets_root: ResolvedVc<FileSystemPath>,
    pub root_path: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl Issue for EvaluationIssue {
    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Error evaluating Node.js code".into()).cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Transform.into()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.context_ident.path()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        Ok(Vc::cell(Some(
            StyledString::Text(
                self.error
                    .print(
                        *self.assets_for_source_mapping,
                        *self.assets_root,
                        *self.root_path,
                        FormattingMode::Plain,
                    )
                    .await?
                    .into(),
            )
            .resolved_cell(),
        )))
    }
}
