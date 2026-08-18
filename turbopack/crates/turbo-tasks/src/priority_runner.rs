use std::{
    cell::Cell,
    collections::BinaryHeap,
    fmt::Debug,
    future::Future,
    pin::Pin,
    ptr::drop_in_place,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    task::{Context, Poll},
    time::{Duration, Instant},
};

use crossbeam_utils::CachePadded;
use parking_lot::Mutex;
use pin_project_lite::pin_project;

pub trait Executor<C, T, P>: Send + Sync {
    type Future: Future<Output = ()> + Send;

    fn execute(&self, execute_context: &Arc<C>, task: T, priority: P) -> Self::Future;
}

impl<C, T, P, F, Fut> Executor<C, T, P> for F
where
    F: Fn(&Arc<C>, T, P) -> Fut + Send + Sync,
    Fut: Future<Output = ()> + Send,
{
    type Future = Fut;

    fn execute(&self, execute_context: &Arc<C>, task: T, priority: P) -> Self::Future {
        (self)(execute_context, task, priority)
    }
}

struct HeapItem<P, T> {
    priority: P,
    task: T,
}

impl<P: Eq, T> PartialEq for HeapItem<P, T> {
    fn eq(&self, other: &Self) -> bool {
        self.priority == other.priority
    }
}

impl<P: Eq, T> Eq for HeapItem<P, T> {}

impl<P: Ord, T> Ord for HeapItem<P, T> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.priority.cmp(&other.priority)
    }
}

impl<P: Ord, T> PartialOrd for HeapItem<P, T> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

static SHARD_SEED: AtomicUsize = AtomicUsize::new(1);

thread_local! {
    static SHARD_RNG: Cell<u32> =
        Cell::new((SHARD_SEED.fetch_add(0x9E37_79B9, Ordering::Relaxed) as u32) | 1);
}

fn shard_rand() -> u32 {
    // This xorshift32 PRNG is not intended for high-quality or cryptographic
    // randomness, but is sufficient for inexpensive approximate shard selection.
    // See https://en.wikipedia.org/wiki/Xorshift.
    SHARD_RNG.with(|cell| {
        let mut x = cell.get();
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        cell.set(x);
        x
    })
}

type QueueShard<P, T> = CachePadded<Mutex<BinaryHeap<HeapItem<P, T>>>>;

/// A relaxed priority queue of independently locked binary heaps.
struct ShardedQueue<P: Ord, T> {
    shards: Box<[QueueShard<P, T>]>,
    shard_mask: usize,
    len: AtomicUsize,
}

impl<P: Ord, T> ShardedQueue<P, T> {
    fn new(shard_count: usize) -> Self {
        assert!(
            shard_count >= 2 && shard_count.is_power_of_two(),
            "shard count must be a power of two and at least two"
        );
        Self {
            shards: (0..shard_count)
                .map(|_| CachePadded::new(Mutex::new(BinaryHeap::new())))
                .collect::<Vec<_>>()
                .into_boxed_slice(),
            shard_mask: shard_count - 1,
            len: AtomicUsize::new(0),
        }
    }

    fn is_empty(&self) -> bool {
        self.len.load(Ordering::Acquire) == 0
    }

    /// Pushes an item and returns whether the queue transitioned from empty to non-empty.
    fn push(&self, item: HeapItem<P, T>) -> bool {
        let index = shard_rand() as usize & self.shard_mask;
        let mut shard = self.shards[index].lock();
        shard.push(item);
        self.len.fetch_add(1, Ordering::AcqRel) == 0
    }

    fn pop(&self) -> Option<HeapItem<P, T>> {
        if self.is_empty() {
            return None;
        }

        let shard_count = self.shards.len();

        // Power of two choices: sample two shards and take the better head.
        let a = shard_rand() as usize & self.shard_mask;
        let b = shard_rand() as usize & self.shard_mask;
        if let Some(item) = self.pop_best_of_two(a, b) {
            return Some(item);
        }

        // Non-blocking sweep, so a contended shard doesn't stall this worker.
        for offset in 0..shard_count {
            if let Some(item) = self.pop_from((a + offset) & self.shard_mask, false) {
                return Some(item);
            }
        }

        for offset in 0..shard_count {
            if let Some(item) = self.pop_from((a + offset) & self.shard_mask, true) {
                return Some(item);
            }
        }

        None
    }

    fn pop_from(&self, index: usize, blocking: bool) -> Option<HeapItem<P, T>> {
        let mut shard = if blocking {
            self.shards[index].lock()
        } else {
            self.shards[index].try_lock()?
        };
        let item = shard.pop()?;
        shrink_amortized(&mut shard);
        self.len.fetch_sub(1, Ordering::AcqRel);
        Some(item)
    }

    fn pop_best_of_two(&self, a: usize, b: usize) -> Option<HeapItem<P, T>> {
        if a == b {
            return self.pop_from(a, false);
        }
        // try_lock never blocks, so acquiring two locks here cannot deadlock.
        let mut shard_a = self.shards[a].try_lock();
        let mut shard_b = self.shards[b].try_lock();
        let take_from_a = match (
            shard_a.as_deref().and_then(|s| s.peek()),
            shard_b.as_deref().and_then(|s| s.peek()),
        ) {
            (Some(head_a), Some(head_b)) => head_a.priority >= head_b.priority,
            (Some(_), None) => true,
            (None, Some(_)) => false,
            (None, None) => return None,
        };
        let shard = if take_from_a {
            shard_a.as_mut()?
        } else {
            shard_b.as_mut()?
        };
        let item = shard.pop()?;
        shrink_amortized(shard);
        self.len.fetch_sub(1, Ordering::AcqRel);
        Some(item)
    }
}

pub struct PriorityRunner<
    C: Send + Sync + 'static,
    T: Send + 'static,
    P: Ord + Send + 'static,
    E: Executor<C, T, P> + 'static,
> {
    executor: E,
    /// The target number of workers to spawn.
    target_workers: usize,
    /// The queue of tasks to execute. These tasks are not scheduled yet.
    queue: ShardedQueue<P, T>,
    /// The number of active workers currently polling tasks.
    /// Workers that responded with Poll::Pending are not counted until they are polled again.
    active_workers: AtomicUsize,
    phantom: std::marker::PhantomData<C>,
}

impl<
    C: Send + Sync + 'static,
    T: Send + 'static,
    P: Debug + Ord + Send + 'static,
    E: Executor<C, T, P> + 'static,
> PriorityRunner<C, T, P, E>
{
    pub fn new(executor: E) -> Self {
        let target_workers = tokio::runtime::Handle::current().metrics().num_workers();
        Self::with_shard_count(executor, target_workers.max(2).next_power_of_two())
    }

    fn with_shard_count(executor: E, shard_count: usize) -> Self {
        Self {
            executor,
            target_workers: tokio::runtime::Handle::current().metrics().num_workers(),
            queue: ShardedQueue::new(shard_count),
            active_workers: AtomicUsize::new(0),
            phantom: std::marker::PhantomData,
        }
    }

    pub fn schedule(self: &Arc<Self>, execute_context: &Arc<C>, task: T, priority: P) {
        self.schedule_inner(execute_context, task, priority, || {});
    }

    // The callback lets tests pause at the queue-drain race without affecting production code.
    fn schedule_inner(
        self: &Arc<Self>,
        execute_context: &Arc<C>,
        task: T,
        priority: P,
        before_enqueue: impl FnOnce(),
    ) {
        if !self.queue.is_empty() {
            before_enqueue();
            // If there is already work in the queue, we don't have any
            // free capacity so we can just push the task to the queue.
            // It will be picked up by existing workers.
            if self.queue.push(HeapItem { priority, task }) {
                // The final worker drained the queue after schedule observed work.
                // Reserve capacity and ensure the newly queued task has a worker.
                let active_workers = self.active_workers.fetch_add(1, Ordering::AcqRel);
                if active_workers >= self.target_workers
                    || !self.spawn_worker_if_work_available(execute_context, true)
                {
                    self.decrease_active_workers(execute_context);
                }
            }
            return;
        }
        // The queue is empty, so we might have free capacity to spawn a new worker.
        let active_workers = self.active_workers.fetch_add(1, Ordering::AcqRel);
        if active_workers < self.target_workers {
            // We have free capacity, spawn a new worker to execute this task immediately.
            let future = self.executor.execute(execute_context, task, priority);
            WorkerFuture::spawn(future, execute_context.clone(), self.clone());
        } else {
            // No free capacity, push the task to the queue.
            self.queue.push(HeapItem { priority, task });

            // Undo the added active worker since we didn't spawn a new worker.
            self.decrease_active_workers(execute_context);
        }
    }

    /// Tries to decrease the active worker count by 1.
    /// If there is work available in the queue, a new worker is spawned instead.
    fn reuse_or_decrease_active_workers(self: &Arc<Self>, execute_context: &Arc<C>) {
        let active_workers = self.active_workers.load(Ordering::Acquire) - 1;
        if active_workers >= self.target_workers
            || !self.spawn_worker_if_work_available(execute_context, true)
        {
            // Undo the added active worker since we didn't spawn a new worker.
            // Beware the race condition here:
            // If the active workers became lower in the meantime we might have free
            // capacity now, so we try to spawn a new worker if
            // there is work available.
            self.decrease_active_workers(execute_context);
        }
    }

    /// Tries to decrease the active worker count by 1.
    /// If there is work available in the queue, a new worker is spawned instead.
    fn decrease_active_workers(self: &Arc<Self>, execute_context: &Arc<C>) {
        // If the active workers became lower we might have free
        // capacity now, so we try to spawn a new worker if
        // there is work available.
        // AcqRel passes queue publication through worker-count changes to the
        // thread that becomes responsible for rechecking the queue.
        let active_workers = self.active_workers.fetch_sub(1, Ordering::AcqRel) - 1;
        if active_workers < self.target_workers {
            self.spawn_worker_if_work_available(execute_context, false);
        }
    }

    fn pop_future_from_worker(&self, execute_context: &Arc<C>) -> Option<E::Future> {
        let heap_item = self.queue.pop()?;
        Some(
            self.executor
                .execute(execute_context, heap_item.task, heap_item.priority),
        )
    }

    fn spawn_worker_if_work_available(
        self: &Arc<Self>,
        execute_context: &Arc<C>,
        unused_active_count: bool,
    ) -> bool {
        if let Some(heap_item) = self.queue.pop() {
            let new_future =
                self.executor
                    .execute(execute_context, heap_item.task, heap_item.priority);

            if !unused_active_count {
                self.active_workers.fetch_add(1, Ordering::AcqRel);
            }
            WorkerFuture::spawn(new_future, execute_context.clone(), self.clone());
            true
        } else {
            false
        }
    }
}

fn shrink_amortized<P, T>(queue: &mut BinaryHeap<HeapItem<P, T>>) {
    // Amortized shrinking of the queue, but with a lower threshold to avoid
    // frequent reallocations when the queue is small.
    if queue.capacity() > queue.len() * 3 && queue.capacity() > 128 {
        let new_capacity = queue.len().next_power_of_two().max(128);
        queue.shrink_to(new_capacity);
    }
}

#[derive(Debug)]
enum WorkerState {
    UnfinishedFuture,
    PendingFuture,
    Done,
    Closed,
}

pin_project! {
    struct WorkerFuture<C, T, P, E>
    where
        // pin_project doesn't support bounds with +
        C: Send,
        C: Sync,
        C: 'static,
        T: Send,
        T: 'static,
        P: Ord,
        P: Send,
        P: 'static,
        E: Executor<C, T, P>,
        E: 'static,

    {
        #[pin]
        future: E::Future,
        execute_context: Arc<C>,
        runner: Arc<PriorityRunner<C, T, P, E>>,
        state: WorkerState,
    }
}

impl<
    C: Send + Sync + 'static,
    T: Send + 'static,
    P: Debug + Ord + Send + 'static,
    E: Executor<C, T, P> + 'static,
> WorkerFuture<C, T, P, E>
{
    fn spawn(future: E::Future, execute_context: Arc<C>, runner: Arc<PriorityRunner<C, T, P, E>>) {
        tokio::task::spawn(Self {
            future,
            execute_context,
            runner,
            state: WorkerState::UnfinishedFuture,
        });
    }
}

impl<
    C: Send + Sync + 'static,
    T: Send + 'static,
    P: Debug + Ord + Send + 'static,
    E: Executor<C, T, P> + 'static,
> Future for WorkerFuture<C, T, P, E>
{
    type Output = ();

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let mut this = self.project();
        if matches!(this.state, WorkerState::PendingFuture) {
            // When the worker is not active (it previously returned Poll::Pending),
            // we need to mark it as active again since it is being polled now.
            this.runner.active_workers.fetch_add(1, Ordering::AcqRel);
            *this.state = WorkerState::UnfinishedFuture;
        }
        let last_yield = Instant::now();
        loop {
            match this.state {
                WorkerState::Closed => return Poll::Ready(()),
                WorkerState::PendingFuture => unreachable!(),
                WorkerState::UnfinishedFuture => {
                    match this.future.as_mut().poll(cx) {
                        Poll::Ready(()) => {
                            *this.state = WorkerState::Done;

                            if last_yield.elapsed() > Duration::from_millis(5) {
                                cx.waker().wake_by_ref();
                                return Poll::Pending;
                            }
                        }
                        Poll::Pending => {
                            // The current future is still pending, we need to suspend this worker.
                            // But we if there are free capacity we can spawn a new worker to pick
                            // up other tasks in the queue.
                            this.runner
                                .reuse_or_decrease_active_workers(this.execute_context);
                            *this.state = WorkerState::PendingFuture;
                            return Poll::Pending;
                        }
                    }
                }
                WorkerState::Done => {
                    let active_workers = this.runner.active_workers.load(Ordering::Acquire);
                    if active_workers > this.runner.target_workers {
                        // There are more active workers than target, so we should end this
                        // worker.
                        this.runner.decrease_active_workers(this.execute_context);
                        *this.state = WorkerState::Closed;
                        return Poll::Ready(());
                    }

                    // This future is done, we need to check the queue for more tasks,
                    // so we can continue working on a new future in this worker.
                    if let Some(new_future) =
                        this.runner.pop_future_from_worker(this.execute_context)
                    {
                        // We are replacing the future with a new one, but the current future is
                        // pinned. So we need to drop the future in place
                        // and replace it with the new future, which becomes
                        // pinned in that place.
                        // SAFETY: The pinned future is dropped in place
                        unsafe {
                            let future_slot = this.future.as_mut().get_unchecked_mut();
                            let future_slot: *mut E::Future = future_slot;
                            drop_in_place(future_slot);
                            future_slot.write(new_future);
                        }
                        *this.state = WorkerState::UnfinishedFuture;
                    } else {
                        // No more tasks to execute
                        // This worker ends here
                        this.runner.decrease_active_workers(this.execute_context);
                        *this.state = WorkerState::Closed;
                        return Poll::Ready(());
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{Arc, Barrier},
        thread::sleep,
        time::Duration,
    };

    use super::*;

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_schedule_when_queue_drained_starts_worker() {
        let runner = Arc::new(PriorityRunner::with_shard_count(
            |results: &Arc<Mutex<Vec<u32>>>, task, _| {
                let results = results.clone();
                async move {
                    results.lock().push(task);
                }
            },
            2,
        ));
        let results = Arc::new(Mutex::new(Vec::new()));

        assert!(runner.queue.push(HeapItem {
            priority: 0,
            task: 0,
        }));
        runner.active_workers.store(1, Ordering::Release);

        let after_empty_check = Arc::new(Barrier::new(2));
        let continue_enqueue = Arc::new(Barrier::new(2));
        let schedule_task = tokio::task::spawn_blocking({
            let runner = runner.clone();
            let results = results.clone();
            let after_empty_check = after_empty_check.clone();
            let continue_enqueue = continue_enqueue.clone();
            move || {
                runner.schedule_inner(&results, 1, 1, || {
                    after_empty_check.wait();
                    continue_enqueue.wait();
                });
            }
        });

        after_empty_check.wait();
        assert_eq!(runner.queue.pop().unwrap().task, 0);
        runner.decrease_active_workers(&results);
        continue_enqueue.wait();
        schedule_task.await.unwrap();

        tokio::time::timeout(Duration::from_secs(1), async {
            loop {
                if results.lock().as_slice() == [1]
                    && runner.active_workers.load(Ordering::Acquire) == 0
                {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("queued task was stranded without an active worker");
        assert!(runner.queue.is_empty());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_cpu_bound_tasks() {
        struct ExecutorImpl;

        impl Executor<Mutex<Vec<u32>>, u32, u32> for ExecutorImpl {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

            fn execute(
                &self,
                execute_context: &Arc<Mutex<Vec<u32>>>,
                task: u32,
                _priority: u32,
            ) -> Self::Future {
                let execute_context = execute_context.clone();
                Box::pin(async move {
                    println!("Executing task {}...", task);
                    sleep(Duration::from_millis((task as u64 + 1) * 10));
                    execute_context.lock().push(task);
                    println!("Finished task {}.", task);
                })
            }
        }

        let executor = ExecutorImpl;

        let runner: Arc<PriorityRunner<Mutex<Vec<u32>>, u32, u32, _>> =
            Arc::new(PriorityRunner::with_shard_count(executor, 2));
        let results = Arc::new(Mutex::new(Vec::new()));

        for i in 0..10 {
            let results = results.clone();
            println!("Scheduling task {}...", i);
            runner.schedule(&results, i, i);
        }

        while results.lock().len() < 10 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let results = results.lock();
        println!("Results: {:?}", *results);

        // Sharding intentionally relaxes global priority ordering. Every task must still run once.
        let mut sorted = results.clone();
        sorted.sort_unstable();
        assert_eq!(sorted, (0..10).collect::<Vec<_>>());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_cpu_bound_with_yield_tasks() {
        struct ExecutorImpl;

        impl Executor<Mutex<Vec<u32>>, u32, u32> for ExecutorImpl {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

            fn execute(
                &self,
                execute_context: &Arc<Mutex<Vec<u32>>>,
                task: u32,
                _priority: u32,
            ) -> Self::Future {
                let execute_context = execute_context.clone();
                Box::pin(async move {
                    println!("Executing task {}...", task);
                    sleep(Duration::from_millis((task as u64 + 1) * 10));
                    execute_context.lock().push(task);
                    println!("Finished task {}.", task);
                    tokio::task::yield_now().await;
                })
            }
        }

        let executor = ExecutorImpl;

        let runner: Arc<PriorityRunner<Mutex<Vec<u32>>, u32, u32, _>> =
            Arc::new(PriorityRunner::with_shard_count(executor, 2));
        let results = Arc::new(Mutex::new(Vec::new()));

        for i in 0..10 {
            let results = results.clone();
            println!("Scheduling task {}...", i);
            runner.schedule(&results, i, i);
        }

        while results.lock().len() < 10 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let results = results.lock();
        println!("Results: {:?}", *results);

        // A yielded worker must not lose work, but sharding means completion order is unspecified.
        let mut sorted = results.clone();
        sorted.sort_unstable();
        assert_eq!(sorted, (0..10).collect::<Vec<_>>());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_sharded_queue_runs_every_task() {
        struct ExecutorImpl;

        impl Executor<Mutex<Vec<u32>>, u32, u32> for ExecutorImpl {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

            fn execute(
                &self,
                execute_context: &Arc<Mutex<Vec<u32>>>,
                task: u32,
                _priority: u32,
            ) -> Self::Future {
                let execute_context = execute_context.clone();
                Box::pin(async move {
                    sleep(Duration::from_millis(2));
                    execute_context.lock().push(task);
                })
            }
        }

        const COUNT: u32 = 64;
        let runner: Arc<PriorityRunner<Mutex<Vec<u32>>, u32, u32, _>> =
            Arc::new(PriorityRunner::with_shard_count(ExecutorImpl, 8));
        let results = Arc::new(Mutex::new(Vec::new()));

        for i in 0..COUNT {
            let results = results.clone();
            runner.schedule(&results, i, i);
        }

        while results.lock().len() < COUNT as usize {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        let results = results.lock();

        // Shards intentionally relax global priority ordering; verify task coverage only.
        let mut sorted = results.clone();
        sorted.sort_unstable();
        assert_eq!(sorted, (0..COUNT).collect::<Vec<_>>());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_waiting_tasks() {
        struct ExecutorImpl;

        impl Executor<Mutex<Vec<u32>>, u32, u32> for ExecutorImpl {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

            fn execute(
                &self,
                execute_context: &Arc<Mutex<Vec<u32>>>,
                task: u32,
                _priority: u32,
            ) -> Self::Future {
                let execute_context = execute_context.clone();
                Box::pin(async move {
                    println!("Executing task {}...", task);
                    tokio::time::sleep(Duration::from_millis((task as u64 + 1) * 10)).await;
                    execute_context.lock().push(task);
                    println!("Finished task {}.", task);
                })
            }
        }

        let executor = ExecutorImpl;

        let runner: Arc<PriorityRunner<Mutex<Vec<u32>>, u32, u32, _>> =
            Arc::new(PriorityRunner::new(executor));
        let results = Arc::new(Mutex::new(Vec::new()));

        for i in 0..10 {
            let results = results.clone();
            println!("Scheduling task {}...", i);
            runner.schedule(&results, i, i);
        }

        while results.lock().len() < 10 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let results = results.lock();
        println!("Results: {:?}", *results);

        // Different task priorities are allowed to complete in any order across shards.
        let mut sorted = results.clone();
        sorted.sort_unstable();
        assert_eq!(sorted, (0..10).collect::<Vec<_>>());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_mixed_cpu_bound_and_waiting_tasks() {
        const NUM_TASKS: u32 = 20;

        struct TestContext {
            started: Arc<tokio::sync::Barrier>,
            release: Arc<tokio::sync::Barrier>,
            completed: Mutex<Vec<u32>>,
        }

        struct ExecutorImpl;

        impl Executor<TestContext, (u32, bool), u32> for ExecutorImpl {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

            fn execute(
                &self,
                context: &Arc<TestContext>,
                (task, cpu_bound): (u32, bool),
                _priority: u32,
            ) -> Self::Future {
                let context = context.clone();
                Box::pin(async move {
                    if cpu_bound {
                        tokio::task::spawn_blocking(|| {
                            std::thread::sleep(Duration::from_millis(1));
                        })
                        .await
                        .unwrap();
                    } else {
                        tokio::task::yield_now().await;
                        tokio::time::sleep(Duration::from_millis(1)).await;
                    }
                    context.started.wait().await;
                    context.release.wait().await;
                    context.completed.lock().push(task);
                })
            }
        }

        let started = Arc::new(tokio::sync::Barrier::new(NUM_TASKS as usize + 1));
        let release = Arc::new(tokio::sync::Barrier::new(NUM_TASKS as usize + 1));
        let context = Arc::new(TestContext {
            started,
            release,
            completed: Mutex::new(Vec::new()),
        });
        let runner = Arc::new(PriorityRunner::new(ExecutorImpl));

        for task in 0..NUM_TASKS {
            runner.schedule(&context, (task, task % 2 == 0), task);
        }

        tokio::time::timeout(Duration::from_secs(10), context.started.wait())
            .await
            .expect("not all mixed tasks reached execution");
        context.release.wait().await;

        tokio::time::timeout(Duration::from_secs(10), async {
            while context.completed.lock().len() < NUM_TASKS as usize {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("not all mixed tasks completed");

        // Mixed work uses real priorities, but sharding makes global completion order unspecified.
        let mut completed = context.completed.lock().clone();
        completed.sort_unstable();
        assert_eq!(completed, (0..NUM_TASKS).collect::<Vec<_>>());
    }
}
