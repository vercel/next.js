use std::{
    process::ExitStatus,
    sync::{Arc, LazyLock},
};

use anyhow::{Context, Result};
use bytes::Bytes;
use parking_lot::Mutex;
use rustc_hash::FxHashMap;
use tokio::sync::{
    Mutex as AsyncMutex,
    mpsc::{self, UnboundedReceiver, UnboundedSender},
    oneshot,
};
use turbo_rcstr::RcStr;

use crate::{
    evaluate::Operation,
    pool_stats::{AcquiredPermits, NodeJsPoolStats},
    worker_pool::worker_thread,
};

/// A bidirectional message channel using unbounded mpsc.
#[derive(Clone)]
pub(crate) struct MessageChannel<T: Send + Sync + 'static> {
    sender: UnboundedSender<T>,
    receiver: Arc<AsyncMutex<UnboundedReceiver<T>>>,
}

impl<T: Send + Sync + 'static> MessageChannel<T> {
    pub(super) fn unbounded() -> Self {
        let (sender, receiver) = mpsc::unbounded_channel();
        Self {
            sender,
            receiver: Arc::new(AsyncMutex::new(receiver)),
        }
    }

    pub(crate) async fn send(&self, message: T) -> Result<()> {
        self.sender
            .send(message)
            .map_err(|_| anyhow::anyhow!("failed to send message"))
    }

    /// Synchronous, non-blocking send (the channel is unbounded). Lets callers
    /// on the napi env thread enqueue without going async.
    pub(crate) fn send_sync(&self, message: T) -> Result<()> {
        self.sender
            .send(message)
            .map_err(|_| anyhow::anyhow!("failed to send message"))
    }

    pub(crate) async fn recv(&self) -> Result<T> {
        let mut rx = self.receiver.lock().await;
        rx.recv()
            .await
            .ok_or_else(|| anyhow::anyhow!("failed to recv message"))
    }
}

#[derive(Default)]
pub(crate) struct PoolState {
    pub(crate) idle_workers: Mutex<Vec<u32>>,
    pub(crate) stats: Arc<Mutex<NodeJsPoolStats>>,
    pub(crate) waiters: Mutex<Vec<oneshot::Sender<u32>>>,
}

#[turbo_tasks::value(cell = "new", serialization = "skip", eq = "manual", shared)]
#[derive(Clone, PartialEq, Eq, Hash)]
pub(super) struct WorkerOptions {
    pub(super) filename: RcStr,
    pub(super) cwd: RcStr,
}

// Allow dead_code for test builds where napi exports are not entry points
#[allow(dead_code)]
pub(super) struct TaskMessage {
    pub task_id: u32,
    pub data: Bytes,
}

#[derive(Default)]
pub(crate) struct WorkerPoolOperation {
    #[allow(clippy::type_complexity)]
    worker_routed_channel: Mutex<FxHashMap<u32, Arc<MessageChannel<(u32, Bytes)>>>>,
    #[allow(clippy::type_complexity)]
    task_routed_channel: Mutex<FxHashMap<u32, Arc<MessageChannel<Bytes>>>>,
    pub(crate) pools: Mutex<FxHashMap<Arc<WorkerOptions>, Arc<PoolState>>>,
}

impl WorkerPoolOperation {
    pub(crate) async fn get_pool_state(
        &self,
        worker_options: Arc<WorkerOptions>,
    ) -> Arc<PoolState> {
        self.pools.lock().entry(worker_options).or_default().clone()
    }

    pub(crate) fn scale_down(&self) -> Result<()> {
        let mut to_terminate = Vec::new();

        {
            let pools = self.pools.lock();
            for (worker_options, state) in pools.iter() {
                let mut idle = state.idle_workers.lock();
                if idle.len() > 1 {
                    let workers = idle.split_off(1);
                    let mut stats = state.stats.lock();
                    for worker_id in workers {
                        stats.remove_worker();
                        to_terminate.push((worker_options.clone(), worker_id));
                    }
                }
            }
        }

        to_terminate
            .into_iter()
            .map(|(worker_options, worker_id)| self.terminate_worker(worker_options, worker_id))
            .collect::<Result<Vec<_>>>()?;

        Ok(())
    }

    pub(crate) fn scale_zero(&self) -> Result<()> {
        let mut to_terminate = Vec::new();

        {
            let pools = self.pools.lock();
            for (worker_options, state) in pools.iter() {
                let mut idle = state.idle_workers.lock();
                let workers = std::mem::take(&mut *idle);
                let mut stats = state.stats.lock();
                for worker_id in workers {
                    stats.remove_worker();
                    to_terminate.push((worker_options.clone(), worker_id));
                }
            }
        }

        to_terminate
            .into_iter()
            .map(|(worker_options, worker_id)| self.terminate_worker(worker_options, worker_id))
            .collect::<Result<Vec<_>>>()?;

        Ok(())
    }

    pub(crate) fn terminate_worker(
        &self,
        worker_options: Arc<WorkerOptions>,
        worker_id: u32,
    ) -> Result<()> {
        self.remove_worker_channel(worker_id);
        worker_thread::terminate_worker(worker_options, worker_id);
        Ok(())
    }

    fn remove_worker_channel(&self, worker_id: u32) {
        self.worker_routed_channel.lock().remove(&worker_id);
    }

    pub(crate) async fn recv_task_message_in_worker(&self, worker_id: u32) -> Result<(u32, Bytes)> {
        let channel = {
            let mut map = self.worker_routed_channel.lock();
            map.entry(worker_id)
                .or_insert_with(|| Arc::new(MessageChannel::unbounded()))
                .clone()
        };
        channel
            .recv()
            .await
            .with_context(|| format!("failed to recv message in worker {worker_id}"))
    }

    pub(crate) fn send_task_message(&self, message: TaskMessage) -> Result<()> {
        let channel = {
            let mut map = self.task_routed_channel.lock();
            map.entry(message.task_id)
                .or_insert_with(|| Arc::new(MessageChannel::unbounded()))
                .clone()
        };
        channel
            .send_sync(message.data)
            .with_context(|| format!("failed to send response for task {}", message.task_id))
    }
}

pub(crate) static WORKER_POOL_OPERATION: LazyLock<WorkerPoolOperation> =
    LazyLock::new(WorkerPoolOperation::default);

pub(crate) fn terminate_worker(worker_options: Arc<WorkerOptions>, worker_id: u32) -> Result<()> {
    WORKER_POOL_OPERATION.terminate_worker(worker_options, worker_id)
}

pub(crate) async fn get_pool_state(worker_options: Arc<WorkerOptions>) -> Arc<PoolState> {
    WORKER_POOL_OPERATION.get_pool_state(worker_options).await
}

/// Pre-allocated channels for a single task's communication.
/// Holds Arc references to avoid HashMap lookups during send/recv.
pub(crate) struct TaskChannels {
    /// Channel for Rust -> Worker communication (task_id, data)
    worker_channel: Arc<MessageChannel<(u32, Bytes)>>,
    /// Channel for Worker -> Rust communication (data)
    task_channel: Arc<MessageChannel<Bytes>>,
    task_id: u32,
}

impl TaskChannels {
    /// Create and register channels for a new task.
    /// Channels are inserted into the global maps so JS workers can find them.
    pub(crate) fn new(task_id: u32, worker_id: u32) -> Self {
        let worker_channel = {
            let mut map = WORKER_POOL_OPERATION.worker_routed_channel.lock();
            map.entry(worker_id)
                .or_insert_with(|| Arc::new(MessageChannel::unbounded()))
                .clone()
        };

        let task_channel = {
            let mut map = WORKER_POOL_OPERATION.task_routed_channel.lock();
            map.entry(task_id)
                .or_insert_with(|| Arc::new(MessageChannel::unbounded()))
                .clone()
        };

        Self {
            worker_channel,
            task_channel,
            task_id,
        }
    }

    /// Send message to worker (Rust -> JS Worker)
    pub(crate) async fn send_to_worker(&self, message: Bytes) -> Result<()> {
        self.worker_channel
            .send((self.task_id, message))
            .await
            .context("failed to send message to worker")
    }

    /// Receive message from worker (JS Worker -> Rust)
    pub(crate) async fn recv_from_worker(&self) -> Result<Bytes> {
        self.task_channel
            .recv()
            .await
            .context("failed to recv task message")
    }
}

impl Drop for TaskChannels {
    fn drop(&mut self) {
        // Only remove task channel, worker channel is shared across tasks
        WORKER_POOL_OPERATION
            .task_routed_channel
            .lock()
            .remove(&self.task_id);
    }
}

pub(crate) struct WorkerOperation {
    pub(crate) worker_options: Arc<WorkerOptions>,
    pub(crate) worker_id: u32,
    pub(crate) state: Arc<PoolState>,
    pub(crate) on_drop: Option<Box<dyn FnOnce(u32) + Send + Sync>>,
    pub(crate) _permits: AcquiredPermits,
    /// Pre-allocated channels for this task
    pub(crate) channels: TaskChannels,
}

impl Drop for WorkerOperation {
    fn drop(&mut self) {
        if let Some(on_drop) = self.on_drop.take() {
            on_drop(self.worker_id);
        }
        // TaskChannels handles its own cleanup in its Drop impl
    }
}

#[async_trait::async_trait]
impl Operation for WorkerOperation {
    async fn recv(&mut self) -> Result<Bytes> {
        self.channels.recv_from_worker().await
    }

    async fn send(&mut self, message: Bytes) -> Result<()> {
        self.channels.send_to_worker(message).await
    }

    async fn wait_or_kill(&mut self) -> Result<ExitStatus> {
        if self.on_drop.is_some() {
            self.state.stats.lock().remove_worker();
            self.on_drop = None;
        }
        terminate_worker(self.worker_options.clone(), self.worker_id)?;
        Ok(ExitStatus::default())
    }

    fn disallow_reuse(&mut self) {
        if self.on_drop.is_some() {
            self.state.stats.lock().remove_worker();
            self.on_drop = None;
        }
    }
}
