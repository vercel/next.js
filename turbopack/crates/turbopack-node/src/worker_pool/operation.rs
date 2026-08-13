use std::{
    process::ExitStatus,
    sync::{Arc, LazyLock},
};

use anyhow::{Context, Result};
use bytes::Bytes;
use parking_lot::Mutex;
use rustc_hash::{FxHashMap, FxHashSet};
use tokio::sync::{
    Mutex as AsyncMutex,
    mpsc::{self, UnboundedReceiver, UnboundedSender},
    oneshot, watch,
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
    close_tx: watch::Sender<bool>,
    close_rx: watch::Receiver<bool>,
}

impl<T: Send + Sync + 'static> MessageChannel<T> {
    pub(super) fn unbounded() -> Self {
        let (sender, receiver) = mpsc::unbounded_channel();
        let (close_tx, close_rx) = watch::channel(false);
        Self {
            sender,
            receiver: Arc::new(AsyncMutex::new(receiver)),
            close_tx,
            close_rx,
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

    /// Closes the channel, causing any pending or future `recv` to fail. Used
    /// to unblock an operation whose worker died without reporting back. A
    /// watch channel cannot lose the wakeup: a close that lands before the
    /// receiver starts waiting is still observed.
    pub(crate) fn close(&self) {
        let _ = self.close_tx.send(true);
    }

    pub(crate) async fn recv(&self) -> Result<T> {
        let mut rx = self.receiver.lock().await;
        let mut close_rx = self.close_rx.clone();
        tokio::select! {
            msg = rx.recv() => {
                msg.ok_or_else(|| anyhow::anyhow!("failed to recv message"))
            }
            result = close_rx.changed() => {
                let _ = result;
                // A message that was already queued before the close must
                // win: the worker's final response is still valid, only its
                // reuse is unsafe.
                match rx.try_recv() {
                    Ok(msg) => Ok(msg),
                    Err(_) => Err(anyhow::anyhow!("channel closed")),
                }
            }
        }
    }
}

#[derive(Default)]
pub(crate) struct PoolState {
    pub(crate) idle_workers: Mutex<Vec<u32>>,
    pub(crate) stats: Arc<Mutex<NodeJsPoolStats>>,
    pub(crate) waiters: Mutex<Vec<oneshot::Sender<u32>>>,
}

/// Classification of a dead worker for pool accounting.
pub(crate) enum WorkerDeath {
    /// The worker was executing a task: its channel was closed so the pending
    /// `recv` fails. Statistics are balanced by the operation's
    /// `disallow_reuse`/`wait_or_kill` path, which removes the worker exactly
    /// once.
    Busy,
    /// The worker was idle: it was removed from the idle list and the pool
    /// statistics.
    Idle,
    /// The worker finished booting but was neither busy nor idle (in transit
    /// to an acquirer, or routed to a waiter): the total worker count was
    /// decremented.
    CreatedUnassigned,
    /// The worker never finished booting: the caller fails the matching
    /// pending creation and balances the booting statistics.
    BootFailed,
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
    /// The task each worker is currently executing, if any.
    worker_current_task: Mutex<FxHashMap<u32, u32>>,
    /// Workers that finished booting and have not died since. Distinguishes
    /// "died while booting" (never in this set) from "created but currently
    /// neither busy nor idle" (in transit to an acquirer or waiter-routed).
    created_workers: Mutex<FxHashSet<u32>>,
    /// Workers that died unexpectedly. Ids are process-unique, so a dead id
    /// must never be handed out again by any path (idle pop, waiter handoff,
    /// operation drop, acquisition).
    dead_workers: Mutex<FxHashSet<u32>>,
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
                        // Claim the accounting while removing from idle: a
                        // worker that self-exits in between is then a no-op
                        // in the death handler instead of being counted a
                        // second time.
                        if self.mark_worker_dead(worker_id) {
                            stats.remove_worker();
                        }
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
                    // See scale_down: claim the accounting while removing
                    // from idle so the death handler becomes a no-op.
                    if self.mark_worker_dead(worker_id) {
                        stats.remove_worker();
                    }
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
        self.created_workers.lock().remove(&worker_id);
        // Mark before scheduling the JavaScript-side termination: the
        // terminator callback runs later, and a self-exit that lands in
        // between must not be accounted a second time.
        self.mark_worker_dead(worker_id);
        worker_thread::terminate_worker(worker_options, worker_id);
        Ok(())
    }

    fn remove_worker_channel(&self, worker_id: u32) {
        self.worker_routed_channel.lock().remove(&worker_id);
    }

    /// Whether the worker is known to have died unexpectedly. Dead workers
    /// must never be handed out again, so every acquisition and return path
    /// checks this set.
    pub(crate) fn is_dead(&self, worker_id: u32) -> bool {
        self.dead_workers.lock().contains(&worker_id)
    }

    /// Atomically claims a worker as accounted for. Returns `true` when this
    /// call won the claim — only then may the caller balance the pool
    /// statistics. Any exit report or termination path that comes later sees
    /// the id already marked and becomes a no-op, keeping the accounting
    /// single-owner in every interleaving.
    pub(crate) fn mark_worker_dead(&self, worker_id: u32) -> bool {
        self.dead_workers.lock().insert(worker_id)
    }

    /// Records that a worker finished booting. Death classification relies on
    /// this to tell boot deaths apart from created-but-unassigned deaths.
    pub(crate) fn mark_worker_created(&self, worker_id: u32) {
        self.created_workers.lock().insert(worker_id);
    }

    /// Reaps a worker that died unexpectedly (crash, `process.exit`, OOM).
    ///
    /// Records the id as dead so no path ever hands it out again, removes
    /// the routed channel, closes the in-flight task's channel when busy so
    /// a pending `recv` fails and surfaces as a subprocess crash instead of
    /// hanging forever, and balances pool statistics for every non-busy
    /// class. Boot failures are reported to the caller, which fails the
    /// pending creation for the same pool.
    pub(crate) fn handle_worker_death(
        &self,
        worker_options: Arc<WorkerOptions>,
        worker_id: u32,
    ) -> WorkerDeath {
        // A worker already marked dead (by an earlier report, or by the
        // termination path balancing the statistics before scheduling the JS
        // terminator) must not be accounted for a second time. Such a report
        // is short-circuited before it can be mistaken for a boot failure.
        let newly_marked = self.dead_workers.lock().insert(worker_id);
        self.remove_worker_channel(worker_id);
        let was_created = self.created_workers.lock().remove(&worker_id);

        if !newly_marked {
            return WorkerDeath::CreatedUnassigned;
        }

        // The removed task id is bound outside the `if let` scrutinee: the
        // guard must drop before `task_routed_channel` is locked, matching
        // the lock order in `TaskChannels::drop`.
        let removed_task = { self.worker_current_task.lock().remove(&worker_id) };
        if let Some(task_id) = removed_task {
            let channel = self.task_routed_channel.lock().remove(&task_id);
            if let Some(channel) = channel {
                channel.close();
            }
            // The death path owns the statistics for every dead worker, busy
            // or not: `disallow_reuse`/`wait_or_kill`/`on_drop` skip removal
            // for workers in the dead set, so the count stays exact even when
            // the operation had already received its final message.
            if let Some(state) = self.pools.lock().get(worker_options.as_ref()) {
                state.stats.lock().remove_worker();
            }
            return WorkerDeath::Busy;
        }

        if let Some(state) = self.pools.lock().get(worker_options.as_ref()) {
            let mut idle = state.idle_workers.lock();
            if let Some(position) = idle.iter().position(|id| *id == worker_id) {
                idle.remove(position);
                if newly_marked {
                    state.stats.lock().remove_worker();
                }
                return WorkerDeath::Idle;
            }

            if was_created {
                // Finished booting but neither busy nor idle: in transit to
                // an acquirer or routed to a waiter. The booting counter was
                // already balanced when the boot completed, so only the total
                // worker count has to be decremented here.
                if newly_marked {
                    state.stats.lock().remove_worker();
                }
                return WorkerDeath::CreatedUnassigned;
            }
        }

        WorkerDeath::BootFailed
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
    worker_id: u32,
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

        WORKER_POOL_OPERATION
            .worker_current_task
            .lock()
            .insert(worker_id, task_id);

        Self {
            worker_channel,
            task_channel,
            task_id,
            worker_id,
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

    /// Closes the task channel so a pending or future `recv_from_worker`
    /// fails immediately. Used when the worker dies between acquisition and
    /// task registration.
    pub(crate) fn close_task_channel(&self) {
        self.task_channel.close();
    }
}

impl Drop for TaskChannels {
    fn drop(&mut self) {
        // Only remove task channel, worker channel is shared across tasks
        WORKER_POOL_OPERATION
            .task_routed_channel
            .lock()
            .remove(&self.task_id);

        let mut current_tasks = WORKER_POOL_OPERATION.worker_current_task.lock();
        if current_tasks.get(&self.worker_id) == Some(&self.task_id) {
            current_tasks.remove(&self.worker_id);
        }
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
            // Atomically claim the accounting before balancing it: a worker
            // that dies in between reports itself already marked and becomes
            // a no-op instead of being counted twice.
            if WORKER_POOL_OPERATION.mark_worker_dead(self.worker_id) {
                self.state.stats.lock().remove_worker();
            }
            self.on_drop = None;
        }
        terminate_worker(self.worker_options.clone(), self.worker_id)?;
        Ok(ExitStatus::default())
    }

    fn disallow_reuse(&mut self) {
        if self.on_drop.is_some() {
            // Atomically claim the accounting before balancing it: a worker
            // that dies in between reports itself already marked and becomes
            // a no-op instead of being counted twice.
            if WORKER_POOL_OPERATION.mark_worker_dead(self.worker_id) {
                self.state.stats.lock().remove_worker();
            }
            self.on_drop = None;
            // Clearing the return-to-pool callback does not stop the underlying Node.js worker.
            let _ = terminate_worker(self.worker_options.clone(), self.worker_id);
        }
    }
}
