//! Client-side IPC stub that connects to the Turbopack daemon over a socket.

use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};

use anyhow::{Context, Result, bail};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::{Mutex, mpsc, oneshot},
};

use super::protocol::*;

/// A handle representing a connection to the daemon.
/// Cheaply clonable (Arc-backed).
#[derive(Clone)]
pub struct DaemonClient {
    inner: Arc<DaemonClientInner>,
}

struct DaemonClientInner {
    /// Sends encoded requests to the writer task.
    tx: mpsc::UnboundedSender<Vec<u8>>,
    /// Pending call waiters: call_id → oneshot sender for the response.
    pending: Mutex<HashMap<CallId, oneshot::Sender<Result<DaemonResult, String>>>>,
    /// Subscription callbacks: callback_id → mpsc sender for callback payloads.
    subscriptions: Mutex<HashMap<CallbackId, mpsc::UnboundedSender<Vec<u8>>>>,
    /// Monotonically incrementing call ID.
    next_call_id: AtomicU64,
    /// Monotonically incrementing callback ID.
    next_callback_id: AtomicU64,
}

impl DaemonClient {
    /// Connect to a daemon at `socket_path` and return a client handle.
    /// Spawns two background tasks: one to write outgoing messages, one to read
    /// responses.
    pub async fn connect(socket_path: &str) -> Result<Self> {
        let inner = Arc::new(DaemonClientInner {
            tx: mpsc::unbounded_channel().0,
            pending: Mutex::new(HashMap::new()),
            subscriptions: Mutex::new(HashMap::new()),
            next_call_id: AtomicU64::new(1),
            next_callback_id: AtomicU64::new(1),
        });

        // Platform-specific connection
        #[cfg(unix)]
        let stream = {
            use tokio::net::UnixStream;
            UnixStream::connect(socket_path)
                .await
                .with_context(|| format!("Failed to connect to daemon at {socket_path}"))?
        };

        #[cfg(windows)]
        let stream = {
            use tokio::net::windows::named_pipe::ClientOptions;
            ClientOptions::new()
                .open(socket_path)
                .with_context(|| format!("Failed to connect to daemon at {socket_path}"))?
        };

        let (reader, writer) = tokio::io::split(stream);
        let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();

        let client = DaemonClient {
            inner: Arc::new(DaemonClientInner {
                tx,
                pending: Mutex::new(HashMap::new()),
                subscriptions: Mutex::new(HashMap::new()),
                next_call_id: AtomicU64::new(1),
                next_callback_id: AtomicU64::new(1),
            }),
        };

        // Writer task: sends encoded requests from the channel to the socket
        let client_inner = client.inner.clone();
        let writer = Arc::new(Mutex::new(writer));
        let writer_clone = writer.clone();
        tokio::spawn(async move {
            let _ = client_inner; // keep alive
            while let Some(payload) = rx.recv().await {
                let mut w = writer_clone.lock().await;
                if write_framed(&mut *w, &payload).await.is_err() {
                    break;
                }
            }
        });

        // Reader task: reads responses from the socket and dispatches them
        let client_inner = client.inner.clone();
        let mut reader = reader;
        tokio::spawn(async move {
            loop {
                match read_framed(&mut reader).await {
                    Ok(payload) => {
                        let response: DaemonResponse =
                            match bincode::decode_from_slice(&payload, bincode::config::standard())
                            {
                                Ok((resp, _)) => resp,
                                Err(_) => continue,
                            };
                        match response {
                            DaemonResponse::Ok { call_id, result } => {
                                let mut pending = client_inner.pending.lock().await;
                                if let Some(tx) = pending.remove(&call_id) {
                                    let _ = tx.send(Ok(result));
                                }
                            }
                            DaemonResponse::Err { call_id, message } => {
                                let mut pending = client_inner.pending.lock().await;
                                if let Some(tx) = pending.remove(&call_id) {
                                    let _ = tx.send(Err(message));
                                }
                            }
                            DaemonResponse::CallbackInvoke {
                                callback_id,
                                payload,
                            } => {
                                let subs = client_inner.subscriptions.lock().await;
                                if let Some(tx) = subs.get(&callback_id) {
                                    let _ = tx.send(payload);
                                }
                            }
                        }
                    }
                    Err(_) => break, // connection closed
                }
            }
        });

        Ok(client)
    }

    /// Allocate the next call ID.
    pub fn next_call_id(&self) -> CallId {
        self.inner.next_call_id.fetch_add(1, Ordering::Relaxed)
    }

    /// Allocate the next callback ID.
    pub fn next_callback_id(&self) -> CallbackId {
        self.inner.next_callback_id.fetch_add(1, Ordering::Relaxed)
    }

    /// Send a request and await a response (one-shot RPC).
    pub async fn call(&self, req: DaemonRequest) -> Result<DaemonResult> {
        let call_id = match &req {
            DaemonRequest::ProjectNew { call_id, .. }
            | DaemonRequest::ProjectUpdate { call_id, .. }
            | DaemonRequest::ProjectInvalidateFileSystemCache { call_id, .. }
            | DaemonRequest::ProjectShutdown { call_id, .. }
            | DaemonRequest::ProjectOnExit { call_id, .. }
            | DaemonRequest::ProjectWriteAllEntrypointsToDisk { call_id, .. }
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
            | DaemonRequest::EndpointClientChangedSubscribe { call_id, .. }
            | DaemonRequest::RootTaskDispose { call_id, .. } => *call_id,
            DaemonRequest::CancelSubscription { .. } => {
                bail!("CancelSubscription has no call_id; use cancel_subscription() instead")
            }
        };

        let (tx, rx) = oneshot::channel();
        self.inner.pending.lock().await.insert(call_id, tx);

        let encoded = bincode::encode_to_vec(&req, bincode::config::standard())
            .context("Failed to encode daemon request")?;
        self.inner
            .tx
            .send(encoded)
            .map_err(|_| anyhow::anyhow!("Daemon connection closed"))?;

        let result = rx
            .await
            .context("Daemon connection dropped")?
            .map_err(|msg| anyhow::anyhow!("{msg}"))?;
        Ok(result)
    }

    /// Register a subscription and return a receiver for callback payloads.
    pub async fn register_subscription(
        &self,
        callback_id: CallbackId,
    ) -> mpsc::UnboundedReceiver<Vec<u8>> {
        let (tx, rx) = mpsc::unbounded_channel();
        self.inner
            .subscriptions
            .lock()
            .await
            .insert(callback_id, tx);
        rx
    }

    /// Cancel a subscription.
    pub async fn cancel_subscription(&self, callback_id: CallbackId) -> Result<()> {
        self.inner.subscriptions.lock().await.remove(&callback_id);
        let req = DaemonRequest::CancelSubscription { callback_id };
        let encoded = bincode::encode_to_vec(&req, bincode::config::standard())?;
        self.inner
            .tx
            .send(encoded)
            .map_err(|_| anyhow::anyhow!("Daemon connection closed"))?;
        Ok(())
    }
}

/// Frame encoding: 4-byte little-endian length prefix followed by payload.
pub async fn write_framed<W: AsyncWriteExt + Unpin>(
    w: &mut W,
    payload: &[u8],
) -> std::io::Result<()> {
    let len = payload.len() as u32;
    w.write_all(&len.to_le_bytes()).await?;
    w.write_all(payload).await?;
    w.flush().await
}

/// Read a length-prefixed frame.
pub async fn read_framed<R: AsyncReadExt + Unpin>(r: &mut R) -> std::io::Result<Vec<u8>> {
    let mut len_buf = [0u8; 4];
    r.read_exact(&mut len_buf).await?;
    let len = u32::from_le_bytes(len_buf) as usize;
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf).await?;
    Ok(buf)
}
