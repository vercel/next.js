use std::{iter, process::ExitStatus, time::Duration};

use anyhow::{Result, bail};
#[cfg(not(feature = "sync"))]
use async_trait::async_trait;
use bincode::{Decode, Encode};
use bytes::Bytes;
#[cfg(not(feature = "sync"))]
use futures_retry::{FutureRetry, RetryPolicy};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value as JsonValue;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Completion, FxIndexMap, OperationVc, PrettyPrintError, ResolvedVc, Vc, duration_span,
    fxindexmap, parallel::available_parallelism,
    resolve_strongly_consistent_and_take_and_apply_effects, trace::TraceRawVcs,
};
use turbo_tasks_env::{EnvMap, ProcessEnv};
use turbo_tasks_fs::{File, FileContent, FileSystemPath, to_sys_path};
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

#[turbo_tasks::value(
    cell = "new",
    serialization = "skip",
    evict = "last",
    eq = "manual",
    shared
)]
pub struct EvaluatePool {
    #[turbo_tasks(trace_ignore, debug_ignore)]
    pool: Box<dyn EvaluateOperation>,
    pub assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    pub assets_root: FileSystemPath,
    pub project_dir: FileSystemPath,
}

impl EvaluatePool {
    // Only the pool backends construct pools; they are async-only until the
    // blocking pool port lands.
    #[cfg_attr(feature = "sync", allow(dead_code))]
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

    turbo_tasks::dual_fn! {
        pub fn operation(&self) -> Result<Box<dyn Operation>> {
            turbo_tasks::read!(self.pool.operation())
        }
    }

    pub fn stats(&self) -> PoolStatsSnapshot {
        self.pool.stats()
    }

    pub fn pre_warm(&self) {
        self.pool.pre_warm()
    }
}

#[cfg(not(feature = "sync"))]
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

/// Sync-build version of [`EvaluateOperation`]: `operation` is a plain function
/// (a blocking backend implementation would block here until a worker is
/// available). No implementation exists in the sync build yet.
#[cfg(feature = "sync")]
pub trait EvaluateOperation: Send + Sync {
    fn operation(&self) -> Result<Box<dyn Operation>>;
    fn stats(&self) -> PoolStatsSnapshot;
    /// Eagerly spawn a Node.js worker so it's ready when the first [`Self::operation`] is called.
    /// The worker should go into the idle queue.
    ///
    /// If a worker request comes in while this is still initializing, it should wait on the bootup
    /// semaphore and will resume when the worker is ready.
    fn pre_warm(&self);
}

#[cfg(not(feature = "sync"))]
#[async_trait::async_trait]
pub trait Operation: Send {
    async fn recv(&mut self) -> Result<Bytes>;

    async fn send(&mut self, data: Bytes) -> Result<()>;

    async fn wait_or_kill(&mut self) -> Result<ExitStatus>;

    fn disallow_reuse(&mut self) -> ();
}

/// Sync-build version of [`Operation`]: the methods are plain functions (a
/// blocking backend implementation would block on the underlying IPC channel).
#[cfg(feature = "sync")]
pub trait Operation: Send {
    fn recv(&mut self) -> Result<Bytes>;

    fn send(&mut self, data: Bytes) -> Result<()>;

    fn wait_or_kill(&mut self) -> Result<ExitStatus>;

    fn disallow_reuse(&mut self) -> ();
}

#[turbo_tasks::value]
struct EmittedEvaluatePoolAssets {
    bootstrap: ResolvedVc<Box<dyn OutputAsset>>,
    output_root: FileSystemPath,
    entrypoint: FileSystemPath,
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
    } = &*turbo_tasks::read!(entries)?;

    let entrypoint = turbo_tasks::read!(
        chunking_context
            .chunk_path(
                None,
                **main_entry_ident,
                Some(rcstr!("pool_entry")),
                rcstr!(".js"),
            )
            .owned()
    )?;

    let bootstrap = chunking_context.root_entry_chunk_group_asset(
        entrypoint.clone(),
        ChunkGroup::Entry(entries.iter().cloned().map(ResolvedVc::upcast).collect()),
        *module_graph,
        OutputAssets::empty(),
        OutputAssets::empty(),
    );

    let output_root = turbo_tasks::read!(chunking_context.output_root().owned())?;
    turbo_tasks::read!(emit_package_json(output_root.clone())?.as_side_effect())?;
    turbo_tasks::read!(emit(bootstrap, output_root.clone()).as_side_effect())?;

    Ok(EmittedEvaluatePoolAssets {
        bootstrap: turbo_tasks::read!(bootstrap.to_resolved())?,
        output_root,
        entrypoint,
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
    let assets = turbo_tasks::read!(resolve_strongly_consistent_and_take_and_apply_effects(
        operation
    ))?;

    Ok(*assets)
}

#[turbo_tasks::task_input]
#[derive(Clone, Copy, Hash, Debug, PartialEq, Eq, TraceRawVcs, Encode, Decode)]
pub enum EnvVarTracking {
    WholeEnvTracked,
    Untracked,
}

#[turbo_tasks::function(operation, root)]
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
    // Effects are applied inside `create_evaluate_pool_assets_operation`; a plain strongly
    // consistent read suffices here.
    let assets = turbo_tasks::read!(assets_op.read_strongly_consistent())?;

    let EmittedEvaluatePoolAssets {
        bootstrap,
        output_root,
        entrypoint,
    } = &*assets;

    let (Some(cwd), Some(entrypoint)) = (
        turbo_tasks::read!(to_sys_path(cwd.clone()))?,
        turbo_tasks::read!(to_sys_path(entrypoint.clone()))?,
    ) else {
        panic!("can only evaluate from a disk filesystem");
    };

    // Invalidate pool when code content changes
    turbo_tasks::read!(content_changed(Vc::upcast(**bootstrap)))?;
    let assets_for_source_mapping = turbo_tasks::read!(
        internal_assets_for_source_mapping(**bootstrap, output_root.clone()).to_resolved()
    )?;
    let env = match env_var_tracking {
        EnvVarTracking::WholeEnvTracked => turbo_tasks::read!(env.read_all())?,
        EnvVarTracking::Untracked => {
            // We always depend on some known env vars that are used by Node.js
            turbo_tasks::read!(common_node_env(*env))?;
            for name in ["FORCE_COLOR", "NO_COLOR", "OPENSSL_CONF", "TZ"] {
                turbo_tasks::read!(env.read(name.into()))?;
            }

            turbo_tasks::read!(env.read_all().untracked())?
        }
    };

    let node_backend = turbo_tasks::read!(node_backend.into_trait_ref())?;
    let pool = turbo_tasks::read!(node_backend.create_pool(CreatePoolOptions {
        cwd,
        entrypoint,
        env: env.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        assets_for_source_mapping,
        assets_root: output_root.clone(),
        project_dir: turbo_tasks::read!(chunking_context.root_path().owned())?,
        concurrency: available_parallelism().map_or(1, |v| v.get()),
        debug,
    }))?;
    pool.pre_warm();
    turbo_tasks::read!(additional_invalidation)?;
    Ok(pool.cell())
}

#[turbo_tasks::function]
async fn common_node_env(env: Vc<Box<dyn ProcessEnv>>) -> Result<Vc<EnvMap>> {
    let mut filtered = FxIndexMap::default();
    let env = turbo_tasks::read!(env.read_all())?;
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

#[cfg(not(feature = "sync"))]
struct PoolErrorHandler;

/// Number of attempts before we start slowing down the retry.
const MAX_FAST_ATTEMPTS: usize = 5;
/// Total number of attempts.
const MAX_ATTEMPTS: usize = MAX_FAST_ATTEMPTS * 2;

#[cfg(not(feature = "sync"))]
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

#[cfg(not(feature = "sync"))]
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

    /// Optional human-readable prefix describing *what was being evaluated*,
    /// included verbatim in the message of the synthetic [`StructuredError`]
    /// emitted when the Node.js subprocess crashes mid-evaluation. For
    /// webpack-loader evaluations this is the loader chain ("loaders
    /// [foo, bar]"). The default returns `None`.
    fn crash_context_prefix(&self) -> Option<RcStr> {
        None
    }
}

/// Sync-build version of [`EvaluateContext`]: the message-handling hooks are
/// plain functions returning the result directly.
#[cfg(feature = "sync")]
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
    fn emit_error(&self, error: StructuredError, pool: &EvaluatePool) -> Result<()>;
    fn info(
        &self,
        state: &mut Self::State,
        data: Self::InfoMessage,
        pool: &EvaluatePool,
    ) -> Result<()>;
    fn request(
        &self,
        state: &mut Self::State,
        data: Self::RequestMessage,
        pool: &EvaluatePool,
    ) -> Result<Self::ResponseMessage>;
    fn finish(&self, state: Self::State, pool: &EvaluatePool) -> Result<()>;

    /// Optional human-readable prefix describing *what was being evaluated*,
    /// included verbatim in the message of the synthetic [`StructuredError`]
    /// emitted when the Node.js subprocess crashes mid-evaluation. For
    /// webpack-loader evaluations this is the loader chain ("loaders
    /// [foo, bar]"). The default returns `None`.
    fn crash_context_prefix(&self) -> Option<RcStr> {
        None
    }
}

turbo_tasks::dual_fn! {
    pub fn custom_evaluate(evaluate_context: impl EvaluateContext) -> Result<Vc<Option<RcStr>>> {
        let pool_op = evaluate_context.pool();
        let mut state = Default::default();

        // Read this strongly consistent, since we don't want to run inconsistent
        // node.js code.
        let pool = turbo_tasks::read!(pool_op.read_strongly_consistent())?;

        let args = turbo_tasks::parallel!(evaluate_context.args())?;
        // Assume this is a one-off operation, so we can kill the process
        // TODO use a better way to decide that.
        let kill = !evaluate_context.keep_alive();

        // Workers in the pool could be in a bad state that we didn't detect yet.
        // The bad state might even be unnoticeable until we actually send the job to the
        // worker. So we retry picking workers from the pools until we succeed
        // sending the job.
        #[cfg(not(feature = "sync"))]
        let (mut operation, _) = FutureRetry::new(
            || async {
                let mut operation = turbo_tasks::read!(pool.operation())?;
                turbo_tasks::read!(operation.send(Bytes::from(serde_json::to_vec(
                    &EvalJavaScriptOutgoingMessage::Evaluate {
                        args: args.iter().map(|v| &**v).collect(),
                    },
                )?)))?;
                Ok(operation)
            },
            PoolErrorHandler,
        )
        .await
        .map_err(|(e, _)| e)?;
        // Sync build: the same retry policy as `PoolErrorHandler` above, as a
        // plain (blocking) loop.
        #[cfg(feature = "sync")]
        let mut operation = {
            let mut attempt = 1usize;
            loop {
                let attempt_once = || -> Result<Box<dyn Operation>> {
                    let mut operation = turbo_tasks::read!(pool.operation())?;
                    turbo_tasks::read!(operation.send(Bytes::from(serde_json::to_vec(
                        &EvalJavaScriptOutgoingMessage::Evaluate {
                            args: args.iter().map(|v| &**v).collect(),
                        },
                    )?)))?;
                    Ok(operation)
                };
                match attempt_once() {
                    Ok(operation) => break operation,
                    Err(err) => {
                        if attempt >= MAX_ATTEMPTS {
                            return Err(err);
                        } else if attempt >= MAX_FAST_ATTEMPTS {
                            std::thread::sleep(Duration::from_secs(1));
                        }
                        attempt += 1;
                    }
                }
            }
        };

        // The evaluation sent an initial intermediate value without completing. We'll
        // need to spawn a new thread to continually pull data out of the process,
        // and ferry that along.
        let result = turbo_tasks::read!(pull_operation(
            &mut operation,
            &pool,
            &evaluate_context,
            &mut state
        ))?;

        turbo_tasks::read!(evaluate_context.finish(state, &pool))?;

        if kill {
            turbo_tasks::read!(operation.wait_or_kill())?;
        }

        Ok(Vc::cell(result.map(RcStr::from)))
    }
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
        Ok(GraphEntries::from_chunk_groups(vec![ChunkGroupEntry::Entry(
            turbo_tasks::read!(self)?
                .entries
                .iter()
                .cloned()
                .map(ResolvedVc::upcast)
                .collect(),
        )])
        .cell())
    }
}

#[turbo_tasks::function]
pub async fn get_evaluate_entries(
    module_asset: ResolvedVc<Box<dyn Module>>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    node_backend: ResolvedVc<Box<dyn NodeBackend>>,
    runtime_entries: Option<ResolvedVc<EvaluatableAssets>>,
) -> Result<Vc<EvaluateEntries>> {
    let node_backend = turbo_tasks::read!(node_backend.into_trait_ref())?;
    let runtime_module_path = node_backend.runtime_module_path();

    let runtime_asset = turbo_tasks::read!(
        asset_context
            .process(
                Vc::upcast(FileSource::new(turbo_tasks::read!(
                    embed_file_path(runtime_module_path).owned()
                )?,)),
                ReferenceType::Internal(turbo_tasks::read!(InnerAssets::empty().to_resolved())?),
            )
            .module()
            .to_resolved()
    )?;

    let entry_module = turbo_tasks::read!(
        asset_context
            .process(
                Vc::upcast(VirtualSource::new(
                    turbo_tasks::read!(runtime_asset.ident())?
                        .path
                        .join("evaluate.js")?,
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
    )?;

    let runtime_entries = {
        let mut entries = vec![];
        let global_module_path = node_backend.globals_module_path();

        let globals_module = asset_context
            .process(
                Vc::upcast(FileSource::new(turbo_tasks::read!(
                    embed_file_path(global_module_path).owned()
                )?)),
                ReferenceType::Internal(turbo_tasks::read!(InnerAssets::empty().to_resolved())?),
            )
            .module();

        let Some(globals_module) = ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(
            turbo_tasks::read!(globals_module.to_resolved())?,
        ) else {
            bail!("Internal module is not evaluatable");
        };

        entries.push(globals_module);

        if let Some(runtime_entries) = runtime_entries {
            for &entry in &*turbo_tasks::read!(runtime_entries)? {
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
        main_entry_ident: turbo_tasks::read!(module_asset.ident().to_resolved())?,
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
    turbo_tasks::read!(custom_evaluate(BasicEvaluateContext {
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
    }))
}

/// Repeatedly pulls from the Operation until we receive a
/// value/error/end.
///
/// (`dual_fn!` cannot parse the bounded generic parameter, so the async and
/// sync versions are two cfg-gated copies of the same `read!`-based body —
/// keep them in sync.)
#[cfg(not(feature = "sync"))]
async fn pull_operation<T: EvaluateContext>(
    operation: &mut Box<dyn Operation>,
    pool: &EvaluatePool,
    evaluate_context: &T,
    state: &mut T::State,
) -> Result<Option<String>> {
    let _guard = duration_span!("Node.js evaluation");

    loop {
        let recv_result = turbo_tasks::read!(operation.recv());
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
                turbo_tasks::read!(evaluate_context.emit_error(synthetic, pool))?;
                operation.disallow_reuse();
                return Ok(None);
            }
        };
        let message = serde_json::from_slice(&bytes)?;

        match message {
            EvalJavaScriptIncomingMessage::Error(error) => {
                turbo_tasks::read!(evaluate_context.emit_error(error, pool))?;
                // Do not reuse the process in case of error
                operation.disallow_reuse();
                // Issue emitted, we want to break but don't want to return an error
                return Ok(None);
            }
            EvalJavaScriptIncomingMessage::End { data } => return Ok(data),
            EvalJavaScriptIncomingMessage::Info { data } => {
                turbo_tasks::read!(evaluate_context.info(
                    state,
                    serde_json::from_value(data)?,
                    pool
                ))?;
            }
            EvalJavaScriptIncomingMessage::Request { id, data } => {
                match turbo_tasks::read!(evaluate_context.request(
                    state,
                    serde_json::from_value(data)?,
                    pool
                )) {
                    Ok(response) => {
                        turbo_tasks::read!(operation.send(Bytes::from(serde_json::to_vec(
                            &EvalJavaScriptOutgoingMessage::Result {
                                id,
                                error: None,
                                data: Some(serde_json::to_value(response)?),
                            },
                        )?)))?;
                    }
                    Err(e) => {
                        turbo_tasks::read!(operation.send(Bytes::from(serde_json::to_vec(
                            &EvalJavaScriptOutgoingMessage::Result {
                                id,
                                error: Some(PrettyPrintError(&e).to_string()),
                                data: None,
                            },
                        )?)))?;
                    }
                }
            }
        }
    }
}

/// Env-gated (`TT_NODE_TRACE=1`) tracer for the sync node-eval IPC protocol. Prints one line
/// per recv/send/request step, tagged with the OS thread id and a process-global message
/// sequence, so a deadlock dump can be correlated against exactly what the node subprocess
/// last said (or failed to say). Diagnostic aid for the sync-engine stall investigation.
#[cfg(feature = "sync")]
fn node_trace(args: std::fmt::Arguments<'_>) {
    static ON: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    if *ON.get_or_init(|| std::env::var("TT_NODE_TRACE").is_ok()) {
        eprintln!("[node t{:?}] {args}", std::thread::current().id());
    }
}

#[cfg(feature = "sync")]
static NODE_MSG_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Sync-build copy of [`pull_operation`] (see the doc comment on the async
/// version above): identical body, plain `fn`.
#[cfg(feature = "sync")]
fn pull_operation<T: EvaluateContext>(
    operation: &mut Box<dyn Operation>,
    pool: &EvaluatePool,
    evaluate_context: &T,
    state: &mut T::State,
) -> Result<Option<String>> {
    let _guard = duration_span!("Node.js evaluation");
    let op_id = NODE_MSG_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    node_trace(format_args!("op#{op_id} pull_operation START"));

    loop {
        node_trace(format_args!(
            "op#{op_id} RECV waiting for subprocess message..."
        ));
        let recv_result = turbo_tasks::read!(operation.recv());
        let bytes = match recv_result {
            Ok(bytes) => bytes,
            Err(err) => {
                node_trace(format_args!(
                    "op#{op_id} RECV err: {}",
                    PrettyPrintError(&err)
                ));
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
                turbo_tasks::read!(evaluate_context.emit_error(synthetic, pool))?;
                operation.disallow_reuse();
                return Ok(None);
            }
        };
        node_trace(format_args!("op#{op_id} RECV got {} bytes", bytes.len()));
        let message = serde_json::from_slice(&bytes)?;

        match message {
            EvalJavaScriptIncomingMessage::Error(error) => {
                node_trace(format_args!(
                    "op#{op_id} <- Error (subprocess reported error)"
                ));
                turbo_tasks::read!(evaluate_context.emit_error(error, pool))?;
                // Do not reuse the process in case of error
                operation.disallow_reuse();
                // Issue emitted, we want to break but don't want to return an error
                return Ok(None);
            }
            EvalJavaScriptIncomingMessage::End { data } => {
                node_trace(format_args!("op#{op_id} <- End (done)"));
                return Ok(data);
            }
            EvalJavaScriptIncomingMessage::Info { data } => {
                node_trace(format_args!("op#{op_id} <- Info"));
                turbo_tasks::read!(evaluate_context.info(
                    state,
                    serde_json::from_value(data)?,
                    pool
                ))?;
            }
            EvalJavaScriptIncomingMessage::Request { id, data } => {
                node_trace(format_args!(
                    "op#{op_id} <- Request id={id}: computing answer (turbo-task read)..."
                ));
                match turbo_tasks::read!(evaluate_context.request(
                    state,
                    serde_json::from_value(data)?,
                    pool
                )) {
                    Ok(response) => {
                        node_trace(format_args!(
                            "op#{op_id} -> Request id={id} answered OK; sending result..."
                        ));
                        turbo_tasks::read!(operation.send(Bytes::from(serde_json::to_vec(
                            &EvalJavaScriptOutgoingMessage::Result {
                                id,
                                error: None,
                                data: Some(serde_json::to_value(response)?),
                            },
                        )?)))?;
                        node_trace(format_args!("op#{op_id} -> Request id={id} result sent"));
                    }
                    Err(e) => {
                        node_trace(format_args!(
                            "op#{op_id} -> Request id={id} answered ERR; sending result..."
                        ));
                        turbo_tasks::read!(operation.send(Bytes::from(serde_json::to_vec(
                            &EvalJavaScriptOutgoingMessage::Result {
                                id,
                                error: Some(PrettyPrintError(&e).to_string()),
                                data: None,
                            },
                        )?)))?;
                        node_trace(format_args!(
                            "op#{op_id} -> Request id={id} (err) result sent"
                        ));
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

impl BasicEvaluateContext {
    fn pool_impl(&self) -> OperationVc<EvaluatePool> {
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

    turbo_tasks::dual_fn! {
        fn emit_error_impl(&self, error: StructuredError, pool: &EvaluatePool) -> Result<()> {
            EvaluationIssue {
                error,
                source: IssueSource::from_source_only(self.context_source_for_issue),
                assets_for_source_mapping: pool.assets_for_source_mapping,
                assets_root: pool.assets_root.clone(),
                root_path: turbo_tasks::read!(self.chunking_context.root_path().owned())?,
                detail: None,
            }
            .resolved_cell()
            .emit();
            Ok(())
        }
    }
}

#[cfg(not(feature = "sync"))]
impl EvaluateContext for BasicEvaluateContext {
    type InfoMessage = ();
    type RequestMessage = ();
    type ResponseMessage = ();
    type State = ();

    fn pool(&self) -> OperationVc<EvaluatePool> {
        self.pool_impl()
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
        self.emit_error_impl(error, pool).await
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

#[cfg(feature = "sync")]
impl EvaluateContext for BasicEvaluateContext {
    type InfoMessage = ();
    type RequestMessage = ();
    type ResponseMessage = ();
    type State = ();

    fn pool(&self) -> OperationVc<EvaluatePool> {
        self.pool_impl()
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

    fn emit_error(&self, error: StructuredError, pool: &EvaluatePool) -> Result<()> {
        self.emit_error_impl(error, pool)
    }

    fn info(
        &self,
        _state: &mut Self::State,
        _data: Self::InfoMessage,
        _pool: &EvaluatePool,
    ) -> Result<()> {
        bail!("BasicEvaluateContext does not support info messages")
    }

    fn request(
        &self,
        _state: &mut Self::State,
        _data: Self::RequestMessage,
        _pool: &EvaluatePool,
    ) -> Result<Self::ResponseMessage> {
        bail!("BasicEvaluateContext does not support request messages")
    }

    fn finish(&self, _state: Self::State, _pool: &EvaluatePool) -> Result<()> {
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

impl EvaluationIssue {
    turbo_tasks::dual_fn! {
        fn description_impl(&self) -> Result<Option<StyledString>> {
            Ok(Some(StyledString::Text(
                turbo_tasks::read!(self.error.print(
                    *self.assets_for_source_mapping,
                    self.assets_root.clone(),
                    self.root_path.clone(),
                    FormattingMode::Plain,
                ))?
                .into(),
            )))
        }
    }
}

#[cfg(not(feature = "sync"))]
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
        turbo_tasks::read!(self.source.file_path())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        self.description_impl().await
    }

    async fn detail(&self) -> Result<Option<StyledString>> {
        Ok(self.detail.clone().map(StyledString::Text))
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.source)
    }
}

#[cfg(feature = "sync")]
#[turbo_tasks::value_impl]
impl Issue for EvaluationIssue {
    fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!("Error evaluating Node.js code")))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Transform
    }

    fn file_path(&self) -> Result<FileSystemPath> {
        turbo_tasks::read!(self.source.file_path())
    }

    fn description(&self) -> Result<Option<StyledString>> {
        self.description_impl()
    }

    fn detail(&self) -> Result<Option<StyledString>> {
        Ok(self.detail.clone().map(StyledString::Text))
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.source)
    }
}
