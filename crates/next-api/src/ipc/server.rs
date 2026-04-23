//! Daemon server that listens on a socket and dispatches requests to the
//! Turbopack engine.

use std::{
    collections::HashMap,
    io::Write,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};

use anyhow::{Context, Result};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::{Mutex, RwLock},
    task::AbortHandle,
};
use turbo_rcstr::rcstr;
use turbo_tasks::ResolvedVc;
use turbo_tasks_backend::BackingStorage;

use super::{
    client::{read_framed, write_framed},
    protocol::*,
};
use crate::{
    project::{ProjectContainer, ProjectOptions},
    turbo_tasks_factory::{NextTurboTasks, create_turbo_tasks},
};

/// A live project instance managed by the daemon.
struct DaemonProject {
    turbo_tasks: NextTurboTasks,
    container: ResolvedVc<ProjectContainer>,
}

/// State shared across all connections to this daemon instance.
pub struct DaemonState {
    /// Monotonically incrementing handle allocator.
    next_handle: AtomicU64,
    /// Live project instances, keyed by OpaqueHandle.
    projects: RwLock<HashMap<OpaqueHandle, Arc<DaemonProject>>>,
    /// Active subscription abort handles, keyed by CallbackId.
    subscriptions: RwLock<HashMap<CallbackId, AbortHandle>>,
}

impl DaemonState {
    pub fn new() -> Arc<Self> {
        Arc::new(DaemonState {
            next_handle: AtomicU64::new(1),
            projects: RwLock::new(HashMap::new()),
            subscriptions: RwLock::new(HashMap::new()),
        })
    }

    pub fn allocate_handle(&self) -> OpaqueHandle {
        self.next_handle.fetch_add(1, Ordering::Relaxed)
    }

    /// Look up a project by handle.
    async fn get_project(&self, handle: OpaqueHandle) -> Option<Arc<DaemonProject>> {
        self.projects.read().await.get(&handle).cloned()
    }
}

/// Starts the daemon server and listens for connections on `socket_path`.
///
/// This function blocks indefinitely on Unix (infinite accept loop) and only
/// returns if there is a fatal error during socket setup. On Windows, the
/// behavior is analogous but uses named pipes.
pub async fn run_daemon_server(socket_path: &str) -> Result<()> {
    let state = DaemonState::new();

    #[cfg(unix)]
    {
        use tokio::net::UnixListener;

        // Remove stale socket if it exists
        let _ = std::fs::remove_file(socket_path);
        let listener = UnixListener::bind(socket_path)?;

        // Restrict socket access to the current user only
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = std::fs::Permissions::from_mode(0o600);
            std::fs::set_permissions(socket_path, perms)?;
        }

        // Signal readiness to the parent process
        print!("READY");
        std::io::stdout().flush()?;

        loop {
            let (conn, _) = match listener.accept().await {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("Daemon accept error (retrying): {e}");
                    continue;
                }
            };
            let state = state.clone();
            tokio::spawn(async move {
                if let Err(e) = handle_connection(conn, state).await {
                    eprintln!("Daemon connection error: {e}");
                }
            });
        }
    }

    #[cfg(windows)]
    {
        use tokio::net::windows::named_pipe::ServerOptions;

        let mut server = ServerOptions::new()
            .first_pipe_instance(true)
            .create(socket_path)?;

        // Signal readiness to the parent process
        print!("READY");
        std::io::stdout().flush()?;

        loop {
            server.connect().await?;
            let conn = server;
            let state = state.clone();
            tokio::spawn(async move {
                if let Err(e) = handle_connection(conn, state).await {
                    eprintln!("Daemon connection error: {e}");
                }
            });
            // Create next accept slot
            server = ServerOptions::new().create(socket_path)?;
        }
    }
}

/// Handle a single client connection.
async fn handle_connection<S>(stream: S, state: Arc<DaemonState>) -> Result<()>
where
    S: AsyncReadExt + AsyncWriteExt + Unpin + Send + 'static,
{
    let (mut reader, writer) = tokio::io::split(stream);
    let writer = Arc::new(Mutex::new(writer));

    // TODO(multi-project): When subscription dispatch is implemented, track
    // callback IDs per connection and abort them here on disconnect.

    loop {
        let payload = match read_framed(&mut reader).await {
            Ok(p) => p,
            Err(_) => break, // connection closed
        };

        let request: DaemonRequest =
            match bincode::decode_from_slice(&payload, bincode::config::standard()) {
                Ok((req, _)) => req,
                Err(e) => {
                    eprintln!("Failed to decode daemon request, closing connection: {e}");
                    break;
                }
            };

        // CancelSubscription is fire-and-forget: no response needed
        if let DaemonRequest::CancelSubscription { callback_id } = request {
            let mut subs = state.subscriptions.write().await;
            if let Some(abort_handle) = subs.remove(&callback_id) {
                abort_handle.abort();
            }
            continue;
        }

        let writer = writer.clone();
        let state = state.clone();
        tokio::spawn(async move {
            let response = dispatch_request(request, &state).await;
            let encoded = match bincode::encode_to_vec(&response, bincode::config::standard()) {
                Ok(e) => e,
                Err(e) => {
                    eprintln!("Failed to encode daemon response: {e}");
                    return;
                }
            };
            let mut w = writer.lock().await;
            let _ = write_framed(&mut *w, &encoded).await;
        });
    }

    Ok(())
}

/// Create a project from daemon request options.
async fn create_daemon_project(
    options: ProjectOptions,
    turbo_engine_options: TurboEngineOptions,
    dist_dir: &str,
) -> Result<DaemonProject> {
    let memory_limit = turbo_engine_options
        .memory_limit
        .map(|m| m as usize)
        .unwrap_or(usize::MAX);
    let dependency_tracking = turbo_engine_options.dependency_tracking.unwrap_or(true);
    let is_ci = turbo_engine_options.is_ci.unwrap_or(false);
    let is_short_session = turbo_engine_options.is_short_session.unwrap_or(false);
    let skip_compaction = turbo_engine_options.skip_compaction.unwrap_or(false);

    let turbo_tasks = create_turbo_tasks(
        PathBuf::from(dist_dir),
        options.is_persistent_caching_enabled,
        memory_limit,
        dependency_tracking,
        is_ci,
        is_short_session,
        skip_compaction,
    )?;

    let is_dev = options.dev;
    let tt = turbo_tasks.clone();
    let container = tt
        .run(async move {
            let container_op = ProjectContainer::new_operation(rcstr!("next.js"), is_dev);
            ProjectContainer::initialize(container_op, options).await?;
            container_op.resolve().strongly_consistent().await
        })
        .await
        .context("Failed to create ProjectContainer")?;

    Ok(DaemonProject {
        turbo_tasks,
        container,
    })
}

/// Dispatch a request to the appropriate handler.
async fn dispatch_request(req: DaemonRequest, state: &DaemonState) -> DaemonResponse {
    match req {
        // ── Project lifecycle ────────────────────────────────────────────
        DaemonRequest::ProjectNew {
            call_id,
            options,
            turbo_engine_options,
            dist_dir,
        } => match create_daemon_project(options, turbo_engine_options, &dist_dir).await {
            Ok(project) => {
                let handle = state.allocate_handle();
                state
                    .projects
                    .write()
                    .await
                    .insert(handle, Arc::new(project));
                DaemonResponse::Ok {
                    call_id,
                    result: DaemonResult::ProjectHandle(handle),
                }
            }
            Err(e) => DaemonResponse::Err {
                call_id,
                message: format!("Failed to create project: {e:#}"),
            },
        },

        DaemonRequest::ProjectUpdate {
            call_id,
            project,
            options,
        } => {
            let Some(proj) = state.get_project(project).await else {
                return DaemonResponse::Err {
                    call_id,
                    message: format!("Unknown project handle: {project}"),
                };
            };
            let container = proj.container;
            match proj
                .turbo_tasks
                .run(async move { container.update(options).await })
                .await
            {
                Ok(()) => DaemonResponse::Ok {
                    call_id,
                    result: DaemonResult::Unit,
                },
                Err(e) => DaemonResponse::Err {
                    call_id,
                    message: format!("Project update failed: {e:#}"),
                },
            }
        }

        DaemonRequest::ProjectInvalidateFileSystemCache { call_id, project } => {
            let Some(proj) = state.get_project(project).await else {
                return DaemonResponse::Err {
                    call_id,
                    message: format!("Unknown project handle: {project}"),
                };
            };
            let tt = proj.turbo_tasks.clone();
            match tokio::task::spawn_blocking(move || {
                use turbo_tasks_backend::db_invalidation::invalidation_reasons;
                tt.backend()
                    .backing_storage()
                    .invalidate(invalidation_reasons::USER_REQUEST)
            })
            .await
            {
                Ok(Ok(())) => DaemonResponse::Ok {
                    call_id,
                    result: DaemonResult::Unit,
                },
                Ok(Err(e)) => DaemonResponse::Err {
                    call_id,
                    message: format!("Cache invalidation failed: {e:#}"),
                },
                Err(e) => DaemonResponse::Err {
                    call_id,
                    message: format!("Cache invalidation panicked: {e:#}"),
                },
            }
        }

        DaemonRequest::ProjectShutdown { call_id, project } => {
            let proj = state.projects.write().await.remove(&project);
            if let Some(proj) = proj {
                proj.turbo_tasks.stop_and_wait().await;
            }
            DaemonResponse::Ok {
                call_id,
                result: DaemonResult::Unit,
            }
        }

        DaemonRequest::ProjectOnExit { call_id, project } => {
            // OnExit stops turbo-tasks and removes the handle from the map.
            // Uses atomic remove to avoid TOCTOU races with concurrent Shutdown.
            if let Some(proj) = state.projects.write().await.remove(&project) {
                proj.turbo_tasks.stop_and_wait().await;
            }
            DaemonResponse::Ok {
                call_id,
                result: DaemonResult::Unit,
            }
        }

        // ── RootTask ────────────────────────────────────────────────────
        DaemonRequest::RootTaskDispose {
            call_id,
            root_task: _,
        } => {
            // Root tasks are managed via CancelSubscription on the callback_id.
            DaemonResponse::Ok {
                call_id,
                result: DaemonResult::Unit,
            }
        }

        // ── Source map operations ────────────────────────────────────────
        DaemonRequest::ProjectTraceSource { call_id, .. }
        | DaemonRequest::ProjectGetSourceForAsset { call_id, .. }
        | DaemonRequest::ProjectGetSourceMap { call_id, .. } => {
            // TODO(multi-project): Move trace/source-map operations from
            // next-napi-bindings into next-api so the daemon can call them.
            DaemonResponse::Err {
                call_id,
                message: "Source map operations not yet implemented in daemon".to_string(),
            }
        }

        // ── Subscriptions and build operations ──────────────────────────
        DaemonRequest::ProjectWriteAllEntrypointsToDisk { call_id, .. }
        | DaemonRequest::ProjectWriteAnalyzeData { call_id, .. }
        | DaemonRequest::ProjectEntrypointsSubscribe { call_id, .. }
        | DaemonRequest::ProjectHmrEvents { call_id, .. }
        | DaemonRequest::ProjectHmrChunkNamesSubscribe { call_id, .. }
        | DaemonRequest::ProjectUpdateInfoSubscribe { call_id, .. }
        | DaemonRequest::ProjectCompilationEventsSubscribe { call_id, .. }
        | DaemonRequest::EndpointWriteToDisk { call_id, .. }
        | DaemonRequest::EndpointServerChangedSubscribe { call_id, .. }
        | DaemonRequest::EndpointClientChangedSubscribe { call_id, .. } => {
            // TODO(multi-project): Implement subscription and build dispatch.
            // These require serializable mirror types for entrypoints, endpoints,
            // issues, diagnostics, and HMR events.
            DaemonResponse::Err {
                call_id,
                message: "Subscriptions and build operations not yet implemented in daemon"
                    .to_string(),
            }
        }

        // CancelSubscription is handled before dispatch (fire-and-forget)
        DaemonRequest::CancelSubscription { .. } => unreachable!(),
    }
}
