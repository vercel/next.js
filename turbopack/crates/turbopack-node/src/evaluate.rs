use std::{
    iter,
    path::PathBuf,
    process::ExitStatus,
    sync::{
        Arc, LazyLock, Weak,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use anyhow::{Result, bail};
use async_trait::async_trait;
use bincode::{Decode, Encode};
use bytes::Bytes;
use futures_retry::{FutureRetry, RetryPolicy};
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value as JsonValue;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Completion, FxIndexMap, PrettyPrintError, ReadRef, ResolvedVc, State, TryJoinIterExt,
    TurboTasksApi, Vc, duration_span, fxindexmap, parallel::available_parallelism,
    resolve_strongly_consistent_and_take_and_apply_effects,
};
use turbo_tasks_env::{EnvMap, ProcessEnv};
use turbo_tasks_fs::{File, FileContent, FileSystemPath, to_sys_path};
use turbo_tasks_hash::HashAlgorithm;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkingContext, ChunkingContextExt, EvaluatableAsset, EvaluatableAssets},
    context::AssetContext,
    file_source::FileSource,
    ident::AssetIdent,
    issue::{Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, StyledString},
    module::Module,
    module_graph::{
        GraphEntries, ModuleGraph,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry, EntryHeuristics},
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
    internal_assets, internal_assets_for_source_mapping,
    pool_stats::PoolStatsSnapshot,
    source_map::StructuredError,
};

#[cfg(test)]
mod tests;

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum EvalJavaScriptOutgoingMessage<'a> {
    #[serde(rename_all = "camelCase")]
    Evaluate {
        entry: &'a str,
        args: Vec<&'a JsonValue>,
    },
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

/// Shared runtime resources only. Task-specific assets must never be retained by this pool.
pub struct EvaluatePool {
    id: u64,
    pool: Box<dyn EvaluateOperation>,
}

/// Source attribution belongs to an evaluation, not to a worker or its pool.
#[derive(Clone)]
pub struct EvaluationAssets {
    pub assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    pub assets_root: FileSystemPath,
    pub project_dir: FileSystemPath,
}

impl EvaluatePool {
    pub(crate) fn new(pool: Box<dyn EvaluateOperation>) -> Self {
        static NEXT_ID: AtomicU64 = AtomicU64::new(1);
        Self {
            id: NEXT_ID.fetch_add(1, Ordering::Relaxed),
            pool,
        }
    }

    /// Retire synchronously, before returning the acquisition future. This lets callers coordinate
    /// invalidation detection with retirement without holding a lock across an await.
    pub fn operation(
        &self,
        restart_pool: bool,
    ) -> impl Future<Output = Result<Box<dyn Operation>>> + Send + '_ {
        if restart_pool {
            self.pool.restart();
        }
        self.pool.operation()
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
    /// Retire idle workers immediately and prevent in-flight workers from returning for reuse.
    fn restart(&self);
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
    fn set_assets(&mut self, _assets: EvaluationAssets) {}

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
    evaluation_entry: ResolvedVc<Box<dyn OutputAsset>>,
    evaluation_entrypoint: FileSystemPath,
}

#[turbo_tasks::function(operation, root)]
async fn emit_evaluate_pool_assets_operation(
    entries: ResolvedVc<EvaluateEntries>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    module_graph: ResolvedVc<ModuleGraph>,
) -> Result<Vc<EmittedEvaluatePoolAssets>> {
    let EvaluateEntries {
        entries,
        main_entry_ident,
        bootstrap_entries,
        bootstrap_ident,
    } = &*entries.await?;

    let evaluation_entrypoint = chunking_context
        .chunk_path(
            None,
            **main_entry_ident,
            Some(rcstr!("evaluate_entry")),
            rcstr!(".js"),
        )
        .owned()
        .await?;
    let evaluation_entry = chunking_context.root_entry_chunk_group_asset(
        evaluation_entrypoint.clone(),
        ChunkGroup::Entry(entries.iter().cloned().map(ResolvedVc::upcast).collect()),
        *module_graph,
        OutputAssets::empty(),
        OutputAssets::empty(),
    );

    let entrypoint = chunking_context
        .chunk_path(
            None,
            **bootstrap_ident,
            Some(rcstr!("pool_entry")),
            rcstr!(".js"),
        )
        .owned()
        .await?;

    let bootstrap = chunking_context.root_entry_chunk_group_asset(
        entrypoint.clone(),
        ChunkGroup::Entry(
            bootstrap_entries
                .iter()
                .cloned()
                .map(ResolvedVc::upcast)
                .collect(),
        ),
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
    emit(evaluation_entry, output_root.clone())
        .as_side_effect()
        .await?;

    Ok(EmittedEvaluatePoolAssets {
        bootstrap: bootstrap.to_resolved().await?,
        output_root,
        entrypoint,
        evaluation_entry: evaluation_entry.to_resolved().await?,
        evaluation_entrypoint,
    }
    .cell())
}

#[turbo_tasks::function(operation, root, session_dependent)]
async fn create_evaluate_pool_assets_operation(
    entries: ResolvedVc<EvaluateEntries>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    module_graph: ResolvedVc<ModuleGraph>,
) -> Result<Vc<EmittedEvaluatePoolAssets>> {
    let operation = emit_evaluate_pool_assets_operation(entries, chunking_context, module_graph);
    // Apply the effects here (inside this producing task) via the bounded-retry helper, draining
    // them from the nested emit operation. Returning the serializable `EmittedEvaluatePoolAssets`
    // (rather than a `serialization = "skip"` wrapper carrying the effects) keeps this task's
    // output restorable from the persistent cache, so a warm restart does not re-run the
    // effect-producing tasks.
    //
    // HACK: applying effects from inside a task means they may get re-applied if this task is
    // invalidated. That's acceptable because the pool is created lazily; we can't move the
    // apply to a true top-level task without eagerly reading the operation.
    let assets = resolve_strongly_consistent_and_take_and_apply_effects(operation).await?;

    Ok(*assets)
}

#[turbo_tasks::task_input]
#[derive(Clone, Copy, Hash, Debug, PartialEq, Eq, Encode, Decode)]
pub enum EnvVarTracking {
    WholeEnvTracked,
    Untracked,
}

#[derive(Hash, PartialEq, Eq)]
struct PoolKey {
    backend: RcStr,
    cwd: PathBuf,
    env: Vec<(RcStr, RcStr)>,
    concurrency: usize,
    debug: bool,
}

struct EnginePools {
    owner: Weak<dyn TurboTasksApi>,
    pools: FxHashMap<PoolKey, Arc<EvaluatePool>>,
}

static EVALUATE_POOLS: LazyLock<tokio::sync::Mutex<Vec<EnginePools>>> =
    LazyLock::new(Default::default);

async fn get_or_create_pool(
    key: PoolKey,
    create: impl FnOnce() -> crate::backend::CreatePoolFuture,
) -> Result<Arc<EvaluatePool>> {
    // Serialize first creation, including prewarming, across concurrent lookups.
    let owner = turbo_tasks::turbo_tasks_weak();
    let mut engines = EVALUATE_POOLS.lock().await;
    engines.retain(|engine| engine.owner.strong_count() > 0);
    let index = if let Some(index) = engines
        .iter()
        .position(|engine| Weak::ptr_eq(&engine.owner, &owner))
    {
        index
    } else {
        engines.push(EnginePools {
            owner,
            pools: FxHashMap::default(),
        });
        engines.len() - 1
    };
    let pools = &mut engines[index].pools;
    if let Some(pool) = pools.get(&key) {
        return Ok(pool.clone());
    }
    let pool = Arc::new(create().await?);
    pool.pre_warm();
    pools.insert(key, pool.clone());
    Ok(pool)
}

pub struct PreparedEvaluation {
    pool: Arc<EvaluatePool>,
    assets: EvaluationAssets,
    entry: PathBuf,
    code_state: ReadRef<EvaluationInvalidationState>,
    code_version: InvalidationVersion,
}

// Completion contains no task handles. Retain the ReadRef rather than only its address to avoid
// treating a newly allocated completion at a reused address as the previously observed version.
enum InvalidationVersion {
    Completion(ReadRef<Completion>),
    Code(Vec<(RcStr, Option<RcStr>)>),
}
unsafe impl turbo_tasks::OperationValue for InvalidationVersion {}

impl InvalidationVersion {
    fn matches(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Completion(a), Self::Completion(b)) => ReadRef::ptr_eq(a, b),
            (Self::Code(a), Self::Code(b)) => a == b,
            _ => false,
        }
    }
}

#[turbo_tasks::value(serialization = "skip", eq = "manual")]
#[derive(PartialEq)]
struct EvaluationInvalidationState {
    #[turbo_tasks(unsafe_ignore, debug_ignore)]
    versions: State<FxHashMap<u64, InvalidationVersion>>,
}

#[turbo_tasks::task_input]
#[derive(Clone, Copy, Debug, Hash, PartialEq, Eq, Encode, Decode)]
enum InvalidationKey {
    Additional(ResolvedVc<Completion>),
    Code(ResolvedVc<AssetIdent>),
}

#[turbo_tasks::function]
fn evaluation_invalidation_state(key: InvalidationKey) -> Vc<EvaluationInvalidationState> {
    let _ = key;
    // Do not read the completion here: rerunning this task would reset the remembered version.
    EvaluationInvalidationState {
        versions: State::new(FxHashMap::default()),
    }
    .cell()
}

#[turbo_tasks::value(transparent)]
struct CodeVersion(Vec<(RcStr, Option<RcStr>)>);

#[turbo_tasks::function]
async fn evaluation_code_version(
    entry: Vc<Box<dyn OutputAsset>>,
    root: FileSystemPath,
) -> Result<Vc<CodeVersion>> {
    // Entry files can remain byte-identical while referenced chunks change. Compare the complete
    // emitted graph by relative path and content, not task identity or the absolute output path.
    let mut version = internal_assets(entry, root.clone())
        .await?
        .iter()
        .map(async |asset| {
            let path = asset.path().await?;
            let relative = root
                .get_path_to(&path)
                .expect("internal asset is inside output root");
            let hash = asset
                .content()
                .content_hash(Vc::cell(RcStr::default()), HashAlgorithm::Xxh3Hash128Hex)
                .owned()
                .await?;
            Ok((RcStr::from(relative), hash))
        })
        .try_join()
        .await?;
    version.sort_unstable();
    Ok(Vc::cell(version))
}

/// Retrieve a compatible runtime pool. Neither emitted code nor its invalidation dependencies
/// contribute to pool identity; they belong to the evaluation and trigger retirement instead.
pub async fn get_evaluate_pool(
    entries: ResolvedVc<EvaluateEntries>,
    cwd: FileSystemPath,
    env: ResolvedVc<Box<dyn ProcessEnv>>,
    node_backend: ResolvedVc<Box<dyn NodeBackend>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    module_graph: ResolvedVc<ModuleGraph>,
    debug: bool,
    env_var_tracking: EnvVarTracking,
) -> Result<PreparedEvaluation> {
    let assets_op = create_evaluate_pool_assets_operation(entries, chunking_context, module_graph);
    // Effects are applied by the producing operation. Keep emission strongly consistent before
    // asking a worker to load the evaluation entry.
    let emitted = assets_op.read_strongly_consistent().await?;
    let (Some(cwd), Some(entrypoint), Some(entry)) = (
        to_sys_path(cwd).await?,
        to_sys_path(emitted.entrypoint.clone()).await?,
        to_sys_path(emitted.evaluation_entrypoint.clone()).await?,
    ) else {
        panic!("can only evaluate from a disk filesystem");
    };
    let mut code_version =
        evaluation_code_version(*emitted.evaluation_entry, emitted.output_root.clone())
            .owned()
            .await?;
    code_version.extend(
        evaluation_code_version(*emitted.bootstrap, emitted.output_root.clone())
            .owned()
            .await?,
    );
    code_version.sort_unstable();
    code_version.dedup();
    let code_version = InvalidationVersion::Code(code_version);
    let code_state =
        evaluation_invalidation_state(InvalidationKey::Code(entries.await?.main_entry_ident))
            .await?;
    let assets = EvaluationAssets {
        assets_for_source_mapping: internal_assets_for_source_mapping(
            *emitted.evaluation_entry,
            emitted.output_root.clone(),
        )
        .to_resolved()
        .await?,
        assets_root: emitted.output_root.clone(),
        project_dir: chunking_context.root_path().owned().await?,
    };
    let env = match env_var_tracking {
        EnvVarTracking::WholeEnvTracked => env.read_all().await?,
        EnvVarTracking::Untracked => {
            common_node_env(*env).await?;
            for name in ["FORCE_COLOR", "NO_COLOR", "OPENSSL_CONF", "TZ"] {
                env.read(name.into()).await?;
            }
            env.read_all().untracked().await?
        }
    };
    let node_backend = node_backend.into_trait_ref().await?;
    let concurrency = available_parallelism().map_or(1, |v| v.get());
    let mut effective_env = if node_backend.uses_env() {
        env.iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    effective_env.sort_unstable();
    let key = PoolKey {
        backend: node_backend.runtime_module_path(),
        cwd: cwd.clone(),
        env: effective_env,
        concurrency,
        debug,
    };
    let pool = get_or_create_pool(key, || {
        node_backend.create_pool(CreatePoolOptions {
            cwd,
            entrypoint,
            env: env.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
            concurrency,
            debug,
        })
    })
    .await?;
    Ok(PreparedEvaluation {
        pool,
        assets,
        entry,
        code_state,
        code_version,
    })
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

/// A Node.js process could not connect back to us over the loopback interface.
///
/// Backends return this from [`EvaluateOperation::operation`] so that it can be
/// reported as an actionable issue. This is not a bug in the evaluated code and
/// retrying will not help, it usually means a sandbox blocks local networking.
#[derive(Debug)]
pub struct NodeJsConnectError {
    /// The error output of the child process, which contains the reason the
    /// connection failed.
    pub stderr: String,
}

impl std::fmt::Display for NodeJsConnectError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "The Node.js child process could not connect to the parent process\n{}",
            self.stderr
        )
    }
}

impl std::error::Error for NodeJsConnectError {}

impl NodeJsConnectError {
    /// Finds a [`NodeJsConnectError`] anywhere in the cause chain of `err`.
    pub fn find(err: &anyhow::Error) -> Option<&Self> {
        err.chain().find_map(|cause| cause.downcast_ref::<Self>())
    }
}

struct PoolErrorHandler;

/// Number of attempts before we start slowing down the retry.
const MAX_FAST_ATTEMPTS: usize = 5;
/// Total number of attempts.
const MAX_ATTEMPTS: usize = MAX_FAST_ATTEMPTS * 2;

impl futures_retry::ErrorHandler<anyhow::Error> for PoolErrorHandler {
    type OutError = anyhow::Error;

    fn handle(&mut self, attempt: usize, err: anyhow::Error) -> RetryPolicy<Self::OutError> {
        // A process that cannot connect to us will not be able to on a retry either.
        if attempt >= MAX_ATTEMPTS || NodeJsConnectError::find(&err).is_some() {
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

    fn pool(&self) -> impl Future<Output = Result<PreparedEvaluation>> + Send;
    fn additional_invalidation(&self) -> ResolvedVc<Completion>;
    fn keep_alive(&self) -> bool {
        false
    }
    fn args(&self) -> &[ResolvedVc<JsonValue>];
    fn cwd(&self) -> Vc<FileSystemPath>;
    /// The source that issues about this evaluation are attributed to.
    fn context_source_for_issue(&self) -> ResolvedVc<Box<dyn Source>>;
    fn emit_error(
        &self,
        error: StructuredError,
        pool: &EvaluationAssets,
    ) -> impl Future<Output = Result<()>> + Send;
    fn info(
        &self,
        state: &mut Self::State,
        data: Self::InfoMessage,
        pool: &EvaluationAssets,
    ) -> impl Future<Output = Result<()>> + Send;
    fn request(
        &self,
        state: &mut Self::State,
        data: Self::RequestMessage,
        pool: &EvaluationAssets,
    ) -> impl Future<Output = Result<Self::ResponseMessage>> + Send;
    fn finish(
        &self,
        state: Self::State,
        pool: &EvaluationAssets,
    ) -> impl Future<Output = Result<()>> + Send;

    /// Optional human-readable prefix describing *what was being evaluated*,
    /// included verbatim in the message of the synthetic [`StructuredError`]
    /// emitted when the Node.js subprocess crashes mid-evaluation. For
    /// webpack-loader evaluations this is the loader chain ("loaders
    /// [foo, bar]"). The default returns `None`.
    fn crash_context_prefix(&self) -> Option<RcStr> {
        None
    }
}

fn evaluation_operation<'a>(
    pool: &'a EvaluatePool,
    code_state: &EvaluationInvalidationState,
    code_version: InvalidationVersion,
    additional_state: &EvaluationInvalidationState,
    additional_version: InvalidationVersion,
) -> impl Future<Output = Result<Box<dyn Operation>>> + Send + 'a {
    // Keep comparison and synchronous retirement atomic for callers sharing these States. A
    // second caller must not observe the new version and acquire an old idle worker in between.
    let mut code = code_state.versions.get_untracked();
    let mut extra = additional_state.versions.get_untracked();
    let restart_pool = code
        .get(&pool.id)
        .is_some_and(|v| !v.matches(&code_version))
        || extra
            .get(&pool.id)
            .is_some_and(|v| !v.matches(&additional_version));
    code.insert(pool.id, code_version);
    extra.insert(pool.id, additional_version);
    pool.operation(restart_pool)
}

pub async fn custom_evaluate(evaluate_context: impl EvaluateContext) -> Result<Vc<Option<RcStr>>> {
    let PreparedEvaluation {
        pool,
        assets,
        entry,
        code_state,
        code_version,
    } = evaluate_context.pool().await?;
    let additional = evaluate_context.additional_invalidation();
    let additional_version = InvalidationVersion::Completion(additional.await?);
    let additional_state =
        evaluation_invalidation_state(InvalidationKey::Additional(additional)).await?;
    let mut state = Default::default();
    let mut acquire = Some(evaluation_operation(
        &pool,
        &code_state,
        code_version,
        &additional_state,
        additional_version,
    ));

    let args = evaluate_context.args().iter().try_join().await?;
    // Assume this is a one-off operation, so we can kill the process
    // TODO use a better way to decide that.
    let kill = !evaluate_context.keep_alive();

    // Workers in the pool could be in a bad state that we didn't detect yet.
    // The bad state might even be unnoticeable until we actually send the job to the
    // worker. So we retry picking workers from the pools until we succeed
    // sending the job.

    let operation = FutureRetry::new(
        || {
            let acquire = acquire.take();
            let pool = &pool;
            let assets = &assets;
            let args = &args;
            let entry = &entry;
            async move {
                let mut operation = match acquire {
                    Some(acquire) => acquire.await?,
                    None => pool.operation(false).await?,
                };
                operation.set_assets(assets.clone());
                operation
                    .send(Bytes::from(serde_json::to_vec(
                        &EvalJavaScriptOutgoingMessage::Evaluate {
                            entry: entry
                                .to_str()
                                .ok_or_else(|| anyhow::anyhow!("evaluation entry is not UTF-8"))?,
                            args: args.iter().map(|v| &**v).collect(),
                        },
                    )?))
                    .await?;
                Ok(operation)
            }
        },
        PoolErrorHandler,
    )
    .await;
    let mut operation = match operation {
        Ok((operation, _)) => operation,
        Err((err, _)) => {
            if let Some(connect_error) = NodeJsConnectError::find(&err) {
                NodeJsConnectIssue {
                    source: IssueSource::from_source_only(
                        evaluate_context.context_source_for_issue(),
                    ),
                    crash_context: evaluate_context.crash_context_prefix(),
                    // Connection errors happen first thing on startup, so we shouldn't be too
                    // worried about this being overly long.
                    stderr: connect_error.stderr.as_str().trim().into(),
                }
                .resolved_cell()
                .emit();
                return Ok(Vc::cell(None));
            }
            return Err(err);
        }
    };

    // The evaluation sent an initial intermediate value without completing. We'll
    // need to spawn a new thread to continually pull data out of the process,
    // and ferry that along.
    let result = pull_operation(&mut operation, &assets, &evaluate_context, &mut state).await?;

    evaluate_context.finish(state, &assets).await?;

    if kill {
        operation.wait_or_kill().await?;
    }

    Ok(Vc::cell(result.map(RcStr::from)))
}

#[turbo_tasks::value]
pub struct EvaluateEntries {
    entries: Vec<ResolvedVc<Box<dyn EvaluatableAsset + 'static>>>,
    main_entry_ident: ResolvedVc<AssetIdent>,
    bootstrap_entries: Vec<ResolvedVc<Box<dyn EvaluatableAsset>>>,
    bootstrap_ident: ResolvedVc<AssetIdent>,
}

#[turbo_tasks::value_impl]
impl EvaluateEntries {
    #[turbo_tasks::function]
    pub async fn graph_entries(self: Vc<Self>) -> Result<Vc<GraphEntries>> {
        let entries = self.await?;
        Ok(GraphEntries::from_chunk_groups(vec![
            ChunkGroupEntry::Entry {
                modules: entries
                    .entries
                    .iter()
                    .cloned()
                    .map(ResolvedVc::upcast)
                    .collect(),
                heuristics: EntryHeuristics::default(),
            },
            ChunkGroupEntry::Entry {
                modules: entries
                    .bootstrap_entries
                    .iter()
                    .cloned()
                    .map(ResolvedVc::upcast)
                    .collect(),
                heuristics: EntryHeuristics::default(),
            },
        ])
        .cell())
    }
}

#[turbo_tasks::value]
struct EvaluateBootstrap {
    entries: Vec<ResolvedVc<Box<dyn EvaluatableAsset>>>,
    ident: ResolvedVc<AssetIdent>,
    runtime_path: FileSystemPath,
}

#[turbo_tasks::function]
async fn get_evaluate_bootstrap(
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    node_backend: ResolvedVc<Box<dyn NodeBackend>>,
) -> Result<Vc<EvaluateBootstrap>> {
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

    let bootstrap_module = asset_context
        .process(
            Vc::upcast(VirtualSource::new(
                runtime_asset.ident().await?.path.join("bootstrap.js")?,
                AssetContent::file(
                    FileContent::Content(File::from("import {run} from 'RUNTIME'; run()")).cell(),
                ),
            )),
            ReferenceType::Internal(ResolvedVc::cell(
                fxindexmap! { rcstr!("RUNTIME") => runtime_asset },
            )),
        )
        .module()
        .to_resolved()
        .await?;

    let global_module_path = node_backend.globals_module_path();
    let globals_module = asset_context
        .process(
            Vc::upcast(FileSource::new(
                embed_file_path(global_module_path).owned().await?,
            )),
            ReferenceType::Internal(InnerAssets::empty().to_resolved().await?),
        )
        .module()
        .to_resolved()
        .await?;
    let Some(globals_module) =
        ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(globals_module)
    else {
        bail!("Internal module is not evaluatable");
    };
    Ok(EvaluateBootstrap {
        entries: vec![
            globals_module,
            ResolvedVc::try_downcast(bootstrap_module).unwrap(),
        ],
        ident: bootstrap_module.ident().to_resolved().await?,
        runtime_path: runtime_asset.ident().await?.path.clone(),
    }
    .cell())
}

#[turbo_tasks::function]
pub async fn get_evaluate_entries(
    module_asset: ResolvedVc<Box<dyn Module>>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    node_backend: ResolvedVc<Box<dyn NodeBackend>>,
    runtime_entries: Option<ResolvedVc<EvaluatableAssets>>,
) -> Result<Vc<EvaluateEntries>> {
    // Construct this independently of the evaluation entry so a multi-entry module graph sees
    // exactly one bootstrap module, not different module handles with the same ident.
    let bootstrap = get_evaluate_bootstrap(*asset_context, *node_backend).await?;
    let entry_module = asset_context
        .process(
            Vc::upcast(VirtualSource::new(
                bootstrap.runtime_path.join("evaluate.js")?,
                AssetContent::file(
                    FileContent::Content(File::from("export default () => import('INNER')")).cell(),
                ),
            )),
            ReferenceType::Internal(ResolvedVc::cell(
                fxindexmap! {rcstr!("INNER") => module_asset},
            )),
        )
        .module()
        .to_resolved()
        .await?;
    let runtime_entries = if let Some(runtime_entries) = runtime_entries {
        runtime_entries.await?.iter().copied().collect::<Vec<_>>()
    } else {
        Vec::new()
    };

    Ok(EvaluateEntries {
        entries: runtime_entries
            .iter()
            .copied()
            .chain(iter::once(ResolvedVc::try_downcast(entry_module).unwrap()))
            .collect(),
        main_entry_ident: module_asset.ident().to_resolved().await?,
        bootstrap_ident: bootstrap.ident,
        bootstrap_entries: bootstrap.entries.clone(),
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
    pool: &EvaluationAssets,
    evaluate_context: &T,
    state: &mut T::State,
) -> Result<Option<String>> {
    let _guard = duration_span!("Node.js evaluation", blocking = false);

    loop {
        let recv_result = operation.recv().await;
        let bytes = match recv_result {
            Ok(bytes) => bytes,
            Err(err) => {
                // The Node.js subprocess crashed (or some other IPC failure
                // closed the connection) before sending a response. Convert
                // this into a synthesized issue with whatever diagnostic
                // context the pool managed to capture, so the user sees a
                // real error message instead of an internal turbo-tasks
                // execution-failed cascade.
                let message = match evaluate_context.crash_context_prefix() {
                    Some(prefix) => format!(
                        "Node.js subprocess crashed while evaluating {}: {}",
                        prefix,
                        PrettyPrintError(&err)
                    ),
                    None => format!(
                        "Node.js subprocess crashed while evaluating: {}",
                        PrettyPrintError(&err)
                    ),
                };
                let synthetic = StructuredError::from_message("Error".to_string(), message);
                evaluate_context.emit_error(synthetic, pool).await?;
                operation.disallow_reuse();
                return Ok(None);
            }
        };
        let message = serde_json::from_slice(&bytes)?;

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

    fn pool(&self) -> impl Future<Output = Result<PreparedEvaluation>> + Send {
        get_evaluate_pool(
            self.entries,
            self.cwd.clone(),
            self.env,
            self.node_backend,
            self.chunking_context,
            self.module_graph,
            self.debug,
            EnvVarTracking::WholeEnvTracked,
        )
    }

    fn additional_invalidation(&self) -> ResolvedVc<Completion> {
        self.additional_invalidation
    }

    fn args(&self) -> &[ResolvedVc<serde_json::Value>] {
        &self.args
    }

    fn cwd(&self) -> Vc<turbo_tasks_fs::FileSystemPath> {
        self.cwd.clone().cell()
    }

    fn context_source_for_issue(&self) -> ResolvedVc<Box<dyn Source>> {
        self.context_source_for_issue
    }

    fn keep_alive(&self) -> bool {
        !self.args.is_empty()
    }

    async fn emit_error(&self, error: StructuredError, pool: &EvaluationAssets) -> Result<()> {
        EvaluationIssue {
            error,
            source: IssueSource::from_source_only(self.context_source_for_issue),
            assets_for_source_mapping: pool.assets_for_source_mapping,
            assets_root: pool.assets_root.clone(),
            root_path: self.chunking_context.root_path().owned().await?,
            detail: None,
        }
        .resolved_cell()
        .emit();
        Ok(())
    }

    async fn info(
        &self,
        _state: &mut Self::State,
        _data: Self::InfoMessage,
        _pool: &EvaluationAssets,
    ) -> Result<()> {
        bail!("BasicEvaluateContext does not support info messages")
    }

    async fn request(
        &self,
        _state: &mut Self::State,
        _data: Self::RequestMessage,
        _pool: &EvaluationAssets,
    ) -> Result<Self::ResponseMessage> {
        bail!("BasicEvaluateContext does not support request messages")
    }

    async fn finish(&self, _state: Self::State, _pool: &EvaluationAssets) -> Result<()> {
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
    /// Optional extra context shown only when log details are enabled — e.g.
    /// the loader chain that was running when a webpack-loader subprocess
    /// errored.
    pub detail: Option<RcStr>,
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
        self.source.file_path().await
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

    async fn detail(&self) -> Result<Option<StyledString>> {
        Ok(self.detail.clone().map(StyledString::Text))
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.source)
    }
}

/// Node.js child processes could not connect back to the parent process, which
/// makes it impossible to run any Node.js code (webpack loaders, PostCSS, ...).
#[turbo_tasks::value(shared)]
pub struct NodeJsConnectIssue {
    /// The source being transformed when the connection failed. The failure is
    /// unrelated to its contents, but this tells the user which transform hit it.
    pub source: IssueSource,
    /// What was being evaluated, e.g. the loader chain.
    pub crash_context: Option<RcStr>,
    /// Error output of the child process, describing why the connection failed.
    pub stderr: RcStr,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for NodeJsConnectIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Node.js worker processes could not connect to Turbopack"
        )))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Transform
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        self.source.file_path().await
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.source)
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        let mut first_line = vec![StyledString::Text(rcstr!(
            "Turbopack is configured to run webpack loaders and PostCSS transforms in child \
             processes that communicate with it over a loopback TCP connection, but the child \
             process was unable to connect"
        ))];

        if let Some(crash_context) = &self.crash_context {
            first_line.push(StyledString::Text(rcstr!(" while evaluating ")));
            first_line.push(StyledString::Code(crash_context.clone()));
        };
        first_line.push(StyledString::Text(rcstr!(":")));
        Ok(Some(StyledString::Stack(vec![
            StyledString::Line(first_line),
            StyledString::Code(self.stderr.clone()),
            StyledString::Line(vec![
                StyledString::Text(rcstr!(
                    "This is likely caused by a sandbox or firewall that blocks connections. \
                     Allow local connections, or run this code using worker threads by setting "
                )),
                StyledString::Code(rcstr!(
                    "experimental.turbopackPluginRuntimeStrategy: 'workerThreads'"
                )),
                StyledString::Text(rcstr!(" in your Next.js config.")),
            ]),
        ])))
    }

    fn documentation_link(&self) -> RcStr {
        rcstr!(
            "https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackPluginRuntimeStrategy"
        )
    }
}
