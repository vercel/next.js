//! IPC infrastructure for the Turbopack daemon.
//!
//! - [`client`]: Connects to a running daemon over a Unix/named-pipe socket.
//! - [`server`]: Listens on a socket and dispatches requests to turbo-tasks.
//! - [`protocol`]: Shared bincode-serializable message types.

pub mod client;
pub mod protocol;
pub mod server;
