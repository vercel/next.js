use std::{
    process::ExitStatus,
    sync::{Arc, LazyLock},
};

use anyhow::{Context, Result};
use bytes::Bytes;
use parking_lot::Mutex;
use rustc_hash::FxHashMap;
use tokio::{
    select,
    sync::{
        Mutex as AsyncMutex,
        mpsc::{self, UnboundedReceiver, UnboundedSender},
        oneshot, watch,
    },
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

/// Registers a waiter for the next released worker, first pruning any
/// waiters whose receivers were canceled. Without pruning, canceled
/// acquisitions accumulate until some unrelated worker is released — and
/// forever if none is.
pub(crate) fn push_waiter(waiters: &mut Vec<oneshot::Sender<u32>>, tx: oneshot::Sender<u32>) {
    waiters.retain(|tx| !tx.is_closed());
    waiters.push(tx);
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
    /// Per-worker death notification, set to `true` when the worker exits
    /// unexpectedly or is terminated. Wakes tasks blocked in
    /// [`TaskChannels::recv_from_worker`] so they fail instead of waiting
    /// forever for a response that can never arrive. Entries are retained
    /// for the process lifetime (one tiny entry per worker ever created).
    worker_death: Mutex<FxHashMap<u32, watch::Sender<bool>>>,
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
        self.signal_worker_death(worker_id);
        worker_thread::terminate_worker(worker_options, worker_id);
        Ok(())
    }

    /// Handles an unexpected worker exit reported by the JS side: wakes tasks
    /// blocked on the worker, removes its routed channel so the dead worker
    /// is never handed out again, and reaps it from the idle pool. A worker
    /// that was checked out is accounted for by its task's teardown path
    /// (see [`WorkerOperation`]'s drop), not here.
    pub(crate) fn worker_exited(&self, worker_options: Arc<WorkerOptions>, worker_id: u32) {
        self.remove_worker_channel(worker_id);
        // Tombstone: create the entry even if no task ever subscribed, so a
        // later subscriber observes the death immediately instead of waiting
        // forever.
        let death = {
            let mut map = self.worker_death.lock();
            map.entry(worker_id)
                .or_insert_with(|| watch::channel(false).0)
                .clone()
        };
        let _ = death.send(true);

        let pools = self.pools.lock();
        if let Some(state) = pools.get(&worker_options) {
            let mut idle = state.idle_workers.lock();
            let len_before = idle.len();
            idle.retain(|&id| id != worker_id);
            if idle.len() != len_before {
                state.stats.lock().remove_worker();
            }
        }
    }

    /// Whether the worker is still expected to be usable: its routed channel
    /// is removed when the worker is terminated or exits.
    pub(crate) fn is_worker_alive(&self, worker_id: u32) -> bool {
        self.worker_routed_channel.lock().contains_key(&worker_id)
    }

    /// Subscribes to the death signal for `worker_id`; `true` means the
    /// worker exited or was terminated.
    fn worker_death_receiver(&self, worker_id: u32) -> watch::Receiver<bool> {
        self.worker_death
            .lock()
            .entry(worker_id)
            .or_insert_with(|| watch::channel(false).0)
            .subscribe()
    }

    fn signal_worker_death(&self, worker_id: u32) {
        if let Some(death) = self.worker_death.lock().get(&worker_id) {
            let _ = death.send(true);
        }
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
            let map = self.task_routed_channel.lock();
            map.get(&message.task_id).cloned()
        };
        let Some(channel) = channel else {
            // The task's channels were already torn down (the task was
            // canceled, failed, or completed early). Drop the late message:
            // recreating the channel would leave an entry no receiver ever
            // drains, retaining the queued bytes forever.
            return Ok(());
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
    worker_id: u32,
    /// Set when the worker exits or is terminated; see
    /// [`WorkerPoolOperation::worker_death`].
    death: watch::Receiver<bool>,
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

        let death = WORKER_POOL_OPERATION.worker_death_receiver(worker_id);

        Self {
            worker_channel,
            task_channel,
            task_id,
            worker_id,
            death,
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
    ///
    /// Fails promptly when the worker dies or is terminated, instead of
    /// waiting forever for a response that can never arrive.
    pub(crate) async fn recv_from_worker(&self) -> Result<Bytes> {
        if *self.death.borrow() {
            anyhow::bail!("worker {} exited", self.worker_id);
        }
        let mut death = self.death.clone();
        select! {
            biased;
            message = self.task_channel.recv() => {
                message.context("failed to recv task message")
            }
            _ = death.changed() => {
                anyhow::bail!("worker {} exited", self.worker_id)
            }
        }
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
            // Clearing the return-to-pool callback does not stop the underlying Node.js worker.
            let _ = terminate_worker(self.worker_options.clone(), self.worker_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A message arriving for a task whose channels were already torn down
    /// must be discarded instead of recreating a channel that no receiver
    /// will ever drain (which would retain the queued bytes forever).
    #[test]
    fn late_task_message_after_task_drop_is_discarded() {
        let task_id = 4_000_000_001;
        let worker_id = 4_000_000_002;
        {
            let _channels = TaskChannels::new(task_id, worker_id);
        }
        // Simulate the JS worker's late end/error message arriving after the
        // Rust task was torn down (canceled, failed, or completed early).
        WORKER_POOL_OPERATION
            .send_task_message(TaskMessage {
                task_id,
                data: Bytes::from_static(b"late"),
            })
            .expect("late messages are dropped, not an error");
        assert!(
            !WORKER_POOL_OPERATION
                .task_routed_channel
                .lock()
                .contains_key(&task_id),
            "late message must not recreate a task channel"
        );
        // Clean up the worker channel created by TaskChannels::new.
        WORKER_POOL_OPERATION.remove_worker_channel(worker_id);
    }

    /// Waiters whose receivers were canceled must not linger until the next
    /// worker release: they are pruned eagerly when a new waiter registers.
    #[test]
    fn canceled_waiters_are_pruned_on_push() {
        let mut waiters: Vec<oneshot::Sender<u32>> = Vec::new();
        let (stale_tx, stale_rx) = oneshot::channel();
        drop(stale_rx);
        push_waiter(&mut waiters, stale_tx);
        let (live_tx, _live_rx) = oneshot::channel::<u32>();
        push_waiter(&mut waiters, live_tx);
        assert_eq!(
            waiters.len(),
            1,
            "canceled waiters must be pruned when a new waiter registers"
        );
    }

    fn test_worker_options(tag: &str) -> Arc<WorkerOptions> {
        Arc::new(WorkerOptions {
            filename: tag.into(),
            cwd: "/".into(),
        })
    }

    /// An unexpected worker exit must reap the worker from the idle pool,
    /// fail its in-flight task promptly (instead of hanging forever), and
    /// keep the dead id from ever being handed out again.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn worker_exited_reaps_pool_and_fails_inflight_task() {
        let options = test_worker_options("exited-pool.js");
        let worker_id = 4_000_001_101;
        let task_id = 4_000_001_102;

        let state = WORKER_POOL_OPERATION.get_pool_state(options.clone()).await;
        state.idle_workers.lock().push(worker_id);
        {
            let mut stats = state.stats.lock();
            stats.add_booting_worker();
            stats.finished_booting_worker();
        }

        // An in-flight task blocked in recv on the dying worker.
        let channels = TaskChannels::new(task_id, worker_id);
        let recv = channels.recv_from_worker();

        WORKER_POOL_OPERATION.worker_exited(options.clone(), worker_id);

        tokio::time::timeout(std::time::Duration::from_secs(5), recv)
            .await
            .expect("recv must not hang after worker exit")
            .expect_err("recv must fail after worker exit");

        // The idle worker was reaped and accounted for exactly once.
        assert!(state.idle_workers.lock().is_empty());
        assert_eq!(state.stats.lock().workers, 0);
        // And the dead id can never be handed out again.
        assert!(!WORKER_POOL_OPERATION.is_worker_alive(worker_id));
        // A channel created after the death observes the tombstone.
        let late = TaskChannels::new(4_000_001_103, worker_id);
        assert!(*late.death.borrow());
    }

    /// Terminating a worker (scale-down, non-reusable operation, wait/kill)
    /// must also wake tasks blocked on it.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn terminate_worker_wakes_inflight_task() {
        let options = test_worker_options("terminated-pool.js");
        let worker_id = 4_000_002_101;
        let task_id = 4_000_002_102;

        let channels = TaskChannels::new(task_id, worker_id);
        let recv = channels.recv_from_worker();

        WORKER_POOL_OPERATION
            .terminate_worker(options, worker_id)
            .unwrap();

        tokio::time::timeout(std::time::Duration::from_secs(5), recv)
            .await
            .expect("recv must not hang after terminate")
            .expect_err("recv must fail after terminate");
    }
}
