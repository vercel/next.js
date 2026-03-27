//! Public API for the Turbopack daemon server and client.

use anyhow::Result;

use crate::ipc::{client::DaemonClient, server::run_daemon_server};

/// Start the Turbopack daemon server, listening on the given socket path.
/// This function blocks indefinitely. It prints "READY" to stdout when it is
/// ready to accept connections.
pub async fn start_daemon(socket_path: &str) -> Result<()> {
    run_daemon_server(socket_path).await
}

/// Connect to a running Turbopack daemon at the given socket path.
/// Returns a client handle that can be used to make RPC calls.
pub async fn connect_daemon(socket_path: &str) -> Result<DaemonClient> {
    DaemonClient::connect(socket_path).await
}
