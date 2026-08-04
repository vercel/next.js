// The websocket update server is a live tokio-driven connection; it only exists in the
// `tokio_runtime` build. `stream` keeps its pure `GetContentFn` machinery dual and gates
// the tokio mpsc / `ReceiverStream`-based update pipeline the same way.
#[cfg(feature = "tokio_runtime")]
pub mod server;
pub mod stream;

#[cfg(feature = "tokio_runtime")]
pub(super) use server::UpdateServer;
