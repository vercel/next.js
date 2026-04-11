use std::{iter, process::ExitStatus, sync::Arc, thread::available_parallelism, time::Duration};

use anyhow::{Result, bail};
use async_trait::async_trait;
use bincode::{Decode, Encode};
use bytes::Bytes;
use futures_retry::{FutureRetry, RetryPolicy};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value as JsonValue;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Completion, FxIndexMap, NonLocalValue, OperationVc, PrettyPrintError, ReadRef, ResolvedVc,
    TaskInput, TryJoinIterExt, ValueToString, Vc, duration_span, fxindexmap,
    mark_session_dependent, mark_top_level_task, take_effects, trace::TraceRawVcs,
};
use turbo_tasks_env::{EnvMap, ProcessEnv};
use turbo_tasks_fs::{File, FileContent, FileSystemPath, to_sys_path};
use turbo_tasks_hash::{DeterministicHash, Xxh3Hash64Hasher};
use turbopack_core::{
    asset::AssetContent,
    changed::content_changed,
    chunk::{ChunkingContext, ChunkingContextExt, EvaluatableAsset, EvaluatableAssets},
    context::AssetContext,
    file_source::FileSource,
    ident::AssetIdent,
    issue::{Issue, IssueExt, IssueSource, IssueStage, StyledString},
    module::Module,
    module_graph::{
        GraphEntries, ModuleGraph,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry},
    },
    output::{OutputAsset, OutputAssets},
    reference_type::{InnerAssets, ReferenceType},
    source::Source,
    virtual_source::VirtualSource,
};

use crate::{
    AssetsForSourceMapping,
    backend::{CreatePoolOptions, NodeBackend},
    embed_js::embed_file_path,
    emit, emit_package_json,
    format::FormattingMode,
    internal_assets_for_source_mapping,
    pool_stats::PoolStatsSnapshot,
    source_map::StructuredError,
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

#[turbo_tasks::value(cell = "new", serialization = "none", eq = "manual", shared)]
pub struct EvaluatePool {
    #[turbo_tasks(trace_ignore, debug_ignore)]
    pool: Box<dyn EvaluateOperation>,
    pub assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    pub assets_root: FileSystemPath,
    pub project_dir: FileSystemPath,
}

impl EvaluatePool {
    pub(crate) fn new(
        pool: Box<dyn EvaluateOperation>,
        assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
        assets_root: FileSystemPath,
        project_dir: FileSystemPath,
    ) -> Self {
        Self {
            pool,
            assets_for_source_mapping,
            assets_root,
            project_dir,
        }
    }

    pub async fn operation(&self) -> Result<Box<dyn Operation>> {
        self.pool.operation().await
    }

    pub fn stats(&self) -> PoolStatsSnapshot {
        self.pool.stats()
    }

    pub fn pre_warm(&self) {
        self.pool.pre_warm()
    }
}

#[async_trait::async_trait]
pub trait EvaluateOperation: Send + Sync {
    async fn operation(&self) -> Result<Box<dyn Operation>>;
    fn stats(&self) -> PoolStatsSnapshot;
    /// Eagerly spawn a Node.js worker so it's ready when the first [`Self::operation`] is called.
    /// The worker should go into the idle queue.
    ///
    /// If a worker request comes in while this is still initializing, it should wait on the bootup
    /// semaphore and will resume when the worker is ready.
    fn pre_warm(&self);
}

#[async_trait::async_trait]
pub trait Operation: Send {
    async fn recv(&mut self) -> Result<Bytes>;

    async fn send(&mut self, data: Bytes) -> Result<()>;

    async fn wait_or_kill(&mut self) -> Result<ExitStatus>;

    fn disallow_reuse(&mut self) -> ();
}

#[turbo_tasks::value]
struct EmittedEvaluatePoolAssets {
    bootstrap: ResolvedVc<Box<dyn OutputAsset>>,
    output_root: FileSystemPath,
    entrypoint: FileSystemPath,
}

#[turbo_tasks::function(operation)]
async fn emit_evaluate_pool_assets_operation(
    entries: ResolvedVc<EvaluateEntries>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    module_graph: ResolvedVc<ModuleGraph>,
) -> Result<Vc<EmittedEvaluatePoolAssets>> {
    let EvaluateEntries {
        entries,
        main_entry_ident,
    } = &*entries.await?;

    let module_ident = main_entry_ident.to_string().await?;
    let module_ident_hash = {
        let mut hasher = Xxh3Hash64Hasher::new();
        module_ident.deterministic_hash(&mut hasher);
        hasher.finish()
    };
    let file_name = format!("{module_ident_hash:016x}.js");
    let entrypoint = chunking_context.output_root().await?.join(&file_name)?;

    let bootstrap = chunking_context.root_entry_chunk_group_asset(
        entrypoint.clone(),
        ChunkGroup::Entry(entries.iter().cloned().map(ResolvedVc::upcast).collect()),
        *module_graph,
        OutputAssets::empty(),
        OutputAssets::empty(),
    );

    let output_root = chunking_context.output_root().owned().await?;
    emit_package_json(output_root.clone())?
        .as_side_effect()
        .await?;
    emit(bootstrap, output_root.clone())
        .as_side_effect()
        .await?;

    Ok(EmittedEvaluatePoolAssets {
        bootstrap: bootstrap.to_resolved().await?,
        output_root,
        entrypoint: entrypoint.clone(),
    }
    .cell())
}

#[turbo_tasks::value(serialization = "none")]
struct EmittedEvaluatePoolAssetsWithEffects {
    assets: ReadRef<EmittedEvaluatePoolAssets>,
}

#[turbo_tasks::function(operation)]
async fn create_evaluate_pool_assets_operation(
    entries: ResolvedVc<EvaluateEntries>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    module_graph: ResolvedVc<ModuleGraph>,
) -> Result<Vc<EmittedEvaluatePoolAssets>> {
    mark_session_dependent();
    let operation = emit_evaluate_pool_assets_operation(entries, chunking_context, module_graph);
    let assets = operation.resolve().strongly_consistent().await?;
    let effects = Arc::new(take_effects(operation).await?);

    // HACK: `Effects::apply` normally panics if not called at the top-level. We want to apply most
    // effects outside of turbo-task functions to avoid re-executing effects during invalidations.
    //
    // That's not possible here because we lazily create the pool, so instead, use
    // `mark_top_level_task` to avoid the debug assertion. The consequence is that these effects
    // might get evaluated more than once if this function is invalidated.
    mark_top_level_task();
    effects.apply().await?;

    Ok(*assets)
}

#[derive(
    Clone, Copy, Hash, Debug, PartialEq, Eq, TaskInput, NonLocalValue, TraceRawVcs, Encode, Decode,
)]
pub enum EnvVarTracking {
    WholeEnvTracked,
    Untracked,
}

#[turbo_tasks::function(operation)]
/// Pass the file you cared as `runtime_entries` to invalidate and reload the
/// evaluated result automatically.
pub async fn get_evaluate_pool(
    entries: ResolvedVc<EvaluateEntries>,
    cwd: FileSystemPath,
    env: ResolvedVc<Box<dyn ProcessEnv>>,
    node_backend: ResolvedVc<Box<dyn NodeBackend>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    module_graph: ResolvedVc<ModuleGraph>,
    additional_invalidation: ResolvedVc<Completion>,
    debug: bool,
    env_var_tracking: EnvVarTracking,
) -> Result<Vc<EvaluatePool>> {
    let assets_op = create_evaluate_pool_assets_operation(entries, chunking_context, module_graph);
    let assets = assets_op.read_strongly_consistent().await?;

    let EmittedEvaluatePoolAssets {
        bootstrap,
        output_root,
        entrypoint,
    } = &*assets;

    let (Some(cwd), Some(entrypoint)) = (
        to_sys_path(cwd.clone()).await?,
        to_sys_path(entrypoint.clone()).await?,
    ) else {
        panic!("can only evaluate from a disk filesystem");
    };

    // Invalidate pool when code content changes
    content_changed(Vc::upcast(**bootstrap)).await?;
    let assets_for_source_mapping =
        internal_assets_for_source_mapping(**bootstrap, output_root.clone())
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

    let node_backend = node_backend.into_trait_ref().await?;
    let pool = node_backend
        .create_pool(CreatePoolOptions {
            cwd,
            entrypoint,
            env: env.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
            assets_for_source_mapping,
            assets_root: output_root.clone(),
            project_dir: chunking_context.root_path().owned().await?,
            concurrency: available_parallelism().map_or(1, |v| v.get()),
            debug,
        })
        .await?;
    pool.pre_warm();
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

pub trait EvaluateContext {
    type InfoMessage: DeserializeOwned;
    type RequestMessage: DeserializeOwned;
    type ResponseMessage: Serialize;
    type State: Default;

    fn pool(&self) -> OperationVc<EvaluatePool>;
    fn keep_alive(&self) -> bool {
        false
    }
    fn args(&self) -> &[ResolvedVc<JsonValue>];
    fn cwd(&self) -> Vc<FileSystemPath>;
    fn emit_error(
        &self,
        error: StructuredError,
        pool: &EvaluatePool,
    ) -> impl Future<Output = Result<()>> + Send;
    fn info(
        &self,
        state: &mut Self::State,
        data: Self::InfoMessage,
        pool: &EvaluatePool,
    ) -> impl Future<Output = Result<()>> + Send;
    fn request(
        &self,
        state: &mut Self::State,
        data: Self::RequestMessage,
        pool: &EvaluatePool,
    ) -> impl Future<Output = Result<Self::ResponseMessage>> + Send;
    fn finish(
        &self,
        state: Self::State,
        pool: &EvaluatePool,
    ) -> impl Future<Output = Result<()>> + Send;
}

pub async fn custom_evaluate(evaluate_context: impl EvaluateContext) -> Result<Vc<Option<RcStr>>> {
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
                .send(Bytes::from(serde_json::to_vec(
                    &EvalJavaScriptOutgoingMessage::Evaluate {
                        args: args.iter().map(|v| &**v).collect(),
                    },
                )?))
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
    let result = pull_operation(&mut operation, &pool, &evaluate_context, &mut state).await?;

    evaluate_context.finish(state, &pool).await?;

    if kill {
        operation.wait_or_kill().await?;
    }

    Ok(Vc::cell(result.map(RcStr::from)))
}

#[turbo_tasks::value]
pub struct EvaluateEntries {
    entries: Vec<ResolvedVc<Box<dyn EvaluatableAsset + 'static>>>,
    main_entry_ident: ResolvedVc<AssetIdent>,
}

#[turbo_tasks::value_impl]
impl EvaluateEntries {
    #[turbo_tasks::function]
    pub async fn graph_entries(self: Vc<Self>) -> Result<Vc<GraphEntries>> {
        Ok(Vc::cell(vec![ChunkGroupEntry::Entry(
            self.await?
                .entries
                .iter()
                .cloned()
                .map(ResolvedVc::upcast)
                .collect(),
        )]))
    }
}

#[turbo_tasks::function]
pub async fn get_evaluate_entries(
    module_asset: ResolvedVc<Box<dyn Module>>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    node_backend: ResolvedVc<Box<dyn NodeBackend>>,
    runtime_entries: Option<ResolvedVc<EvaluatableAssets>>,
) -> Result<Vc<EvaluateEntries>> {
    let node_backend = node_backend.into_trait_ref().await?;
    let runtime_module_path = node_backend.runtime_module_path();

    let runtime_asset = asset_context
        .process(
            Vc::upcast(FileSource::new(
                embed_file_path(runtime_module_path).owned().await?,
            )),
            ReferenceType::Internal(InnerAssets::empty().to_resolved().await?),
        )
        .module()
        .to_resolved()
        .await?;

    let entry_module = asset_context
        .process(
            Vc::upcast(VirtualSource::new(
                runtime_asset.ident().path().await?.join("evaluate.js")?,
                AssetContent::file(
                    FileContent::Content(File::from(
                        "import {run} from 'RUNTIME'; run(() => import('INNER'))",
                    ))
                    .cell(),
                ),
            )),
            ReferenceType::Internal(ResolvedVc::cell(
                fxindexmap! {rcstr!("INNER") => module_asset,
                rcstr!("RUNTIME") => runtime_asset},
            )),
        )
        .module()
        .to_resolved()
        .await?;

    let runtime_entries = {
        let mut entries = vec![];
        let global_module_path = node_backend.globals_module_path();

        let globals_module = asset_context
            .process(
                Vc::upcast(FileSource::new(
                    embed_file_path(global_module_path).owned().await?,
                )),
                ReferenceType::Internal(InnerAssets::empty().to_resolved().await?),
            )
            .module();

        let Some(globals_module) = ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(
            globals_module.to_resolved().await?,
        ) else {
            bail!("Internal module is not evaluatable");
        };

        entries.push(globals_module);

        if let Some(runtime_entries) = runtime_entries {
            for &entry in &*runtime_entries.await? {
                entries.push(entry)
            }
        }
        entries
    };

    Ok(EvaluateEntries {
        entries: runtime_entries
            .iter()
            .copied()
            .chain(iter::once(ResolvedVc::try_downcast(entry_module).unwrap()))
            .collect(),
        main_entry_ident: module_asset.ident().to_resolved().await?,
    }
    .cell())
}

/// Pass the file you cared as `runtime_entries` to invalidate and reload the
/// evaluated result automatically.
#[turbo_tasks::function]
pub async fn evaluate(
    entries: ResolvedVc<EvaluateEntries>,
    cwd: FileSystemPath,
    env: ResolvedVc<Box<dyn ProcessEnv>>,
    node_backend: ResolvedVc<Box<dyn NodeBackend>>,
    context_source_for_issue: ResolvedVc<Box<dyn Source>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    module_graph: ResolvedVc<ModuleGraph>,
    args: Vec<ResolvedVc<JsonValue>>,
    additional_invalidation: ResolvedVc<Completion>,
    debug: bool,
) -> Result<Vc<Option<RcStr>>> {
    custom_evaluate(BasicEvaluateContext {
        entries,
        cwd,
        env,
        node_backend,
        context_source_for_issue,
        chunking_context,
        module_graph,
        args,
        additional_invalidation,
        debug,
    })
    .await
}

/// Repeatedly pulls from the Operation until we receive a
/// value/error/end.
async fn pull_operation<T: EvaluateContext>(
    operation: &mut Box<dyn Operation>,
    pool: &EvaluatePool,
    evaluate_context: &T,
    state: &mut T::State,
) -> Result<Option<String>> {
    let _guard = duration_span!("Node.js evaluation");

    loop {
        let message = serde_json::from_slice(&operation.recv().await?)?;

        match message {
            EvalJavaScriptIncomingMessage::Error(error) => {
                evaluate_context.emit_error(error, pool).await?;
                // Do not reuse the process in case of error
                operation.disallow_reuse();
                // Issue emitted, we want to break but don't want to return an error
                return Ok(None);
            }
            EvalJavaScriptIncomingMessage::End { data } => return Ok(data),
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
                            .send(Bytes::from(serde_json::to_vec(
                                &EvalJavaScriptOutgoingMessage::Result {
                                    id,
                                    error: None,
                                    data: Some(serde_json::to_value(response)?),
                                },
                            )?))
                            .await?;
                    }
                    Err(e) => {
                        operation
                            .send(Bytes::from(serde_json::to_vec(
                                &EvalJavaScriptOutgoingMessage::Result {
                                    id,
                                    error: Some(PrettyPrintError(&e).to_string()),
                                    data: None,
                                },
                            )?))
                            .await?;
                    }
                }
            }
        }
    }
}

struct BasicEvaluateContext {
    entries: ResolvedVc<EvaluateEntries>,
    cwd: FileSystemPath,
    env: ResolvedVc<Box<dyn ProcessEnv>>,
    node_backend: ResolvedVc<Box<dyn NodeBackend>>,
    context_source_for_issue: ResolvedVc<Box<dyn Source>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    module_graph: ResolvedVc<ModuleGraph>,
    args: Vec<ResolvedVc<JsonValue>>,
    additional_invalidation: ResolvedVc<Completion>,
    debug: bool,
}

impl EvaluateContext for BasicEvaluateContext {
    type InfoMessage = ();
    type RequestMessage = ();
    type ResponseMessage = ();
    type State = ();

    fn pool(&self) -> OperationVc<EvaluatePool> {
        get_evaluate_pool(
            self.entries,
            self.cwd.clone(),
            self.env,
            self.node_backend,
            self.chunking_context,
            self.module_graph,
            self.additional_invalidation,
            self.debug,
            EnvVarTracking::WholeEnvTracked,
        )
    }

    fn args(&self) -> &[ResolvedVc<serde_json::Value>] {
        &self.args
    }

    fn cwd(&self) -> Vc<turbo_tasks_fs::FileSystemPath> {
        self.cwd.clone().cell()
    }

    fn keep_alive(&self) -> bool {
        !self.args.is_empty()
    }

    async fn emit_error(&self, error: StructuredError, pool: &EvaluatePool) -> Result<()> {
        EvaluationIssue {
            error,
            source: IssueSource::from_source_only(self.context_source_for_issue),
            assets_for_source_mapping: pool.assets_for_source_mapping,
            assets_root: pool.assets_root.clone(),
            root_path: self.chunking_context.root_path().owned().await?,
        }
        .resolved_cell()
        .emit();
        Ok(())
    }

    async fn info(
        &self,
        _state: &mut Self::State,
        _data: Self::InfoMessage,
        _pool: &EvaluatePool,
    ) -> Result<()> {
        bail!("BasicEvaluateContext does not support info messages")
    }

    async fn request(
        &self,
        _state: &mut Self::State,
        _data: Self::RequestMessage,
        _pool: &EvaluatePool,
    ) -> Result<Self::ResponseMessage> {
        bail!("BasicEvaluateContext does not support request messages")
    }

    async fn finish(&self, _state: Self::State, _pool: &EvaluatePool) -> Result<()> {
        Ok(())
    }
}

/// An issue that occurred while evaluating node code.
#[turbo_tasks::value(shared)]
pub struct EvaluationIssue {
    pub source: IssueSource,
    pub error: StructuredError,
    pub assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    pub assets_root: FileSystemPath,
    pub root_path: FileSystemPath,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for EvaluationIssue {
    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!("Error evaluating Node.js code")))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Transform
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        self.source.file_path().owned().await
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(
            self.error
                .print(
                    *self.assets_for_source_mapping,
                    self.assets_root.clone(),
                    self.root_path.clone(),
                    FormattingMode::Plain,
                )
                .await?
                .into(),
        )))
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.source)
    }
}
