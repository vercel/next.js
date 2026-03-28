//! Daemon server that listens on a socket and dispatches requests to the
//! Turbopack engine.

use std::{
    io::Write,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};

use anyhow::Result;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::Mutex,
};

use super::{
    client::{read_framed, write_framed},
    protocol::*,
};

/// State shared across all connections to this daemon instance.
pub struct DaemonState {
    /// Monotonically incrementing handle allocator.
    next_handle: AtomicU64,
    // TODO(multi-project): Add maps for Project, Endpoint, RootTask handles
    // once the in-process implementation is wired up.
}

impl DaemonState {
    pub fn new() -> Arc<Self> {
        Arc::new(DaemonState {
            next_handle: AtomicU64::new(1),
        })
    }

    pub fn allocate_handle(&self) -> OpaqueHandle {
        self.next_handle.fetch_add(1, Ordering::Relaxed)
    }
}

/// Run the daemon server, listening on the given socket path.
/// This function blocks indefinitely until the process is killed.
pub async fn run_daemon_server(socket_path: &str) -> Result<()> {
    let state = DaemonState::new();

    #[cfg(unix)]
    {
        use tokio::net::UnixListener;

        // Remove stale socket if it exists
        let _ = std::fs::remove_file(socket_path);
        let listener = UnixListener::bind(socket_path)?;

        // Signal readiness to the parent process
        print!("READY");
        std::io::stdout().flush()?;

        loop {
            let (conn, _) = listener.accept().await?;
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

    loop {
        let payload = match read_framed(&mut reader).await {
            Ok(p) => p,
            Err(_) => break, // connection closed
        };

        let request: DaemonRequest =
            match bincode::decode_from_slice(&payload, bincode::config::standard()) {
                Ok((req, _)) => req,
                Err(e) => {
                    eprintln!("Failed to decode daemon request: {e}");
                    continue;
                }
            };

        let writer = writer.clone();
        let state = state.clone();
        tokio::spawn(async move {
            let response = dispatch_request(request, &state).await;
            let encoded = bincode::encode_to_vec(&response, bincode::config::standard()).unwrap();
            let mut w = writer.lock().await;
            let _ = write_framed(&mut *w, &encoded).await;
        });
    }

    Ok(())
}

/// Dispatch a request to the appropriate handler.
/// TODO(multi-project): Wire up actual ProjectContainer creation and method
/// dispatch once the project_factory module is ready.
async fn dispatch_request(req: DaemonRequest, state: &DaemonState) -> DaemonResponse {
    match req {
        DaemonRequest::ProjectNew {
            call_id,
            options: _,
            turbo_engine_options: _,
        } => {
            let handle = state.allocate_handle();
            // TODO: Create actual ProjectContainer via project_factory
            DaemonResponse::Ok {
                call_id,
                result: DaemonResult::ProjectHandle(handle),
            }
        }
        DaemonRequest::ProjectShutdown { call_id, .. }
        | DaemonRequest::ProjectOnExit { call_id, .. }
        | DaemonRequest::ProjectInvalidateFileSystemCache { call_id, .. } => DaemonResponse::Ok {
            call_id,
            result: DaemonResult::Unit,
        },
        DaemonRequest::ProjectUpdate { call_id, .. } => DaemonResponse::Ok {
            call_id,
            result: DaemonResult::Unit,
        },
        DaemonRequest::RootTaskDispose { call_id, .. } => DaemonResponse::Ok {
            call_id,
            result: DaemonResult::Unit,
        },
        // For now, return stub responses for unimplemented operations
        _ => {
            let call_id = match &req {
                DaemonRequest::ProjectWriteAllEntrypointsToDisk { call_id, .. }
                | DaemonRequest::ProjectWriteAnalyzeData { call_id, .. }
                | DaemonRequest::ProjectEntrypointsSubscribe { call_id, .. }
                | DaemonRequest::ProjectHmrEvents { call_id, .. }
                | DaemonRequest::ProjectHmrChunkNamesSubscribe { call_id, .. }
                | DaemonRequest::ProjectUpdateInfoSubscribe { call_id, .. }
                | DaemonRequest::ProjectCompilationEventsSubscribe { call_id, .. }
                | DaemonRequest::ProjectTraceSource { call_id, .. }
                | DaemonRequest::ProjectGetSourceForAsset { call_id, .. }
                | DaemonRequest::ProjectGetSourceMap { call_id, .. }
                | DaemonRequest::EndpointWriteToDisk { call_id, .. }
                | DaemonRequest::EndpointServerChangedSubscribe { call_id, .. }
                | DaemonRequest::EndpointClientChangedSubscribe { call_id, .. } => *call_id,
                _ => 0,
            };
            DaemonResponse::Err {
                call_id,
                message: "Not yet implemented in daemon".to_string(),
            }
        }
    }
}
