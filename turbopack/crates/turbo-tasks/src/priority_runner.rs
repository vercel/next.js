use std::{
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

use concurrent_queue::ConcurrentQueue;
use parking_lot::Mutex;
use pin_project_lite::pin_project;

use crate::manager::TaskPriority;

pub trait Executor<C, T>: Send + Sync {
    type Future: Future<Output = ()> + Send;

    fn execute(&self, execute_context: &Arc<C>, task: T, priority: TaskPriority) -> Self::Future;
}

impl<C, T, F, Fut> Executor<C, T> for F
where
    F: Fn(&Arc<C>, T, TaskPriority) -> Fut + Send + Sync,
    Fut: Future<Output = ()> + Send,
{
    type Future = Fut;

    fn execute(&self, execute_context: &Arc<C>, task: T, priority: TaskPriority) -> Self::Future {
        (self)(execute_context, task, priority)
    }
}

struct HeapItem<T> {
    priority: TaskPriority,
    task: T,
}

impl<T> PartialEq for HeapItem<T> {
    fn eq(&self, other: &Self) -> bool {
        self.priority == other.priority
    }
}

impl<T> Eq for HeapItem<T> {}

impl<T> Ord for HeapItem<T> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.priority.cmp(&other.priority)
    }
}

impl<T> PartialOrd for HeapItem<T> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

/// The set of ready-to-run tasks, split by [`TaskPriority`] band.
///
/// The two unkeyed bands — `Recomputation` (`high`) and `Initial` (`low`) — are lock-free MPMC
/// queues, so the hot push/pop path (the dominant `Initial` traffic in a from-scratch build, and
/// `Recomputation`) never contends on a mutex. Only the `Invalidation` band, which is ordered
/// exactly by leaf distance, keeps a `Mutex<BinaryHeap>` — it is rarely scheduled into during a
/// build, so its lock is effectively uncontended while preserving full ordering.
///
/// Cross-band priority order is exactly `TaskPriority`'s `Ord`: `Recomputation` >
/// `Invalidation{..}` > `Initial`. Within a fast band, tasks run FIFO (their priorities are equal).
struct Queues<T> {
    high: ConcurrentQueue<HeapItem<T>>,
    invalidation: Mutex<BinaryHeap<HeapItem<T>>>,
    low: ConcurrentQueue<HeapItem<T>>,
}

impl<T> Queues<T> {
    fn new() -> Self {
        Self {
            high: ConcurrentQueue::unbounded(),
            invalidation: Mutex::new(BinaryHeap::new()),
            low: ConcurrentQueue::unbounded(),
        }
    }

    fn is_empty(&self) -> bool {
        self.high.is_empty() && self.low.is_empty() && self.invalidation.lock().is_empty()
    }

    fn push(&self, priority: TaskPriority, task: T) {
        let item = HeapItem { priority, task };
        match priority {
            // unbounded queue: push only fails if closed, which never happens here
            TaskPriority::Recomputation => {
                let _ = self.high.push(item);
            }
            TaskPriority::Initial => {
                let _ = self.low.push(item);
            }
            TaskPriority::Invalidation { .. } => {
                self.invalidation.lock().push(item);
            }
        }
    }

    /// Pop the highest-priority task in exact band order: `Recomputation` first, then the
    /// `Invalidation` heap's max (lowest leaf distance), then `Initial`.
    fn pop(&self) -> Option<(TaskPriority, T)> {
        if let Ok(item) = self.high.pop() {
            return Some((item.priority, item.task));
        }
        {
            let mut heap = self.invalidation.lock();
            if let Some(item) = heap.pop() {
                shrink_amortized(&mut heap);
                return Some((item.priority, item.task));
            }
        }
        if let Ok(item) = self.low.pop() {
            return Some((item.priority, item.task));
        }
        None
    }
}

pub struct PriorityRunner<C: Send + Sync + 'static, T: Send + 'static, E: Executor<C, T> + 'static>
{
    executor: E,
    /// The target number of workers to spawn.
    target_workers: usize,
    /// The tasks to execute, split by priority band. These tasks are not scheduled yet.
    queue: Queues<T>,
    /// The number of active workers currently polling tasks.
    /// Workers that responded with Poll::Pending are not counted until they are polled again.
    active_workers: AtomicUsize,
    phantom: std::marker::PhantomData<C>,
}

impl<C: Send + Sync + 'static, T: Send + 'static, E: Executor<C, T> + 'static>
    PriorityRunner<C, T, E>
{
    pub fn new(executor: E) -> Self {
        Self {
            executor,
            target_workers: tokio::runtime::Handle::current().metrics().num_workers(),
            queue: Queues::new(),
            active_workers: AtomicUsize::new(0),
            phantom: std::marker::PhantomData,
        }
    }

    pub fn schedule(self: &Arc<Self>, execute_context: &Arc<C>, task: T, priority: TaskPriority) {
        if !self.queue.is_empty() {
            // There is already backlog, so existing workers will pick this up — no spawn attempt
            // (matches the original: only an empty queue implies possible free capacity).
            self.queue.push(priority, task);
            return;
        }
        // The queue looked empty, so we might have free capacity to spawn a new worker.
        //
        // Unlike the old single-mutex design the empty-check and the worker reservation are no
        // longer one atomic step, so two schedulers can race. That is only a scheduling hint: the
        // worst case is spawning one worker too many or too few, which the active-worker accounting
        // (`reuse_or_decrease_active_workers` / `decrease_active_workers`, and
        // `WorkerFuture::poll`'s `Done` re-check) self-corrects. Correctness only needs the
        // task to be enqueued and eventually popped by some worker.
        //
        // All `active_workers` operations use `AcqRel`/`Acquire` (not `Relaxed`) so the counter
        // forms a release/acquire edge with the lock-free queue: a `queue.push` sequenced before a
        // release decrement is observed by whichever later decrement drives the count below
        // `target_workers` and re-checks the queue (see `decrease_active_workers`). The old
        // single-mutex design got this edge from the queue lock; the banded lock-free queue needs
        // it on the counter instead — without it a freshly-enqueued task could be stranded with no
        // live worker.
        let active_workers = self.active_workers.fetch_add(1, Ordering::AcqRel);
        if active_workers < self.target_workers {
            // We have free capacity, spawn a new worker to execute this task immediately.
            let future = self.executor.execute(execute_context, task, priority);
            WorkerFuture::spawn(future, execute_context.clone(), self.clone());
        } else {
            // No free capacity, push the task to a band queue for an existing worker to pick up.
            self.queue.push(priority, task);

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
    ///
    /// This re-check is load-bearing for liveness: it is the path that re-spawns a worker for a
    /// task that was enqueued (rather than directly spawned) by `schedule` while the pool was
    /// saturated. The `fetch_sub` uses `AcqRel`, so the decrement that drives the count below
    /// `target_workers` acquires every `queue.push` released before an earlier counter op in the
    /// (total-ordered) decrement sequence — guaranteeing `spawn_worker_if_work_available` observes
    /// such a push. With `Relaxed` this edge would not exist and the task could be stranded.
    fn decrease_active_workers(self: &Arc<Self>, execute_context: &Arc<C>) {
        // If the active workers became lower we might have free
        // capacity now, so we try to spawn a new worker if
        // there is work available.
        let active_workers = self.active_workers.fetch_sub(1, Ordering::AcqRel) - 1;
        if active_workers < self.target_workers {
            self.spawn_worker_if_work_available(execute_context, false);
        }
    }

    fn pop_future_from_worker(&self, execute_context: &Arc<C>) -> Option<E::Future> {
        if let Some((priority, task)) = self.queue.pop() {
            Some(self.executor.execute(execute_context, task, priority))
        } else {
            None
        }
    }

    fn spawn_worker_if_work_available(
        self: &Arc<Self>,
        execute_context: &Arc<C>,
        unused_active_count: bool,
    ) -> bool {
        if let Some((priority, task)) = self.queue.pop() {
            let new_future = self.executor.execute(execute_context, task, priority);

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

fn shrink_amortized<T>(queue: &mut BinaryHeap<HeapItem<T>>) {
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
    struct WorkerFuture<C, T, E>
    where
        // pin_project doesn't support bounds with +
        C: Send,
        C: Sync,
        C: 'static,
        T: Send,
        T: 'static,
        E: Executor<C, T>,
        E: 'static,

    {
        #[pin]
        future: E::Future,
        execute_context: Arc<C>,
        runner: Arc<PriorityRunner<C, T, E>>,
        state: WorkerState,
    }
}

impl<C: Send + Sync + 'static, T: Send + 'static, E: Executor<C, T> + 'static>
    WorkerFuture<C, T, E>
{
    fn spawn(future: E::Future, execute_context: Arc<C>, runner: Arc<PriorityRunner<C, T, E>>) {
        tokio::task::spawn(Self {
            future,
            execute_context,
            runner,
            state: WorkerState::UnfinishedFuture,
        });
    }
}

impl<C: Send + Sync + 'static, T: Send + 'static, E: Executor<C, T> + 'static> Future
    for WorkerFuture<C, T, E>
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
        cmp::Reverse,
        sync::{Arc, Barrier},
        thread::sleep,
        time::Duration,
    };

    use super::*;

    fn prio(i: u32) -> TaskPriority {
        TaskPriority::Invalidation {
            priority: Reverse(u32::MAX - i),
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_cpu_bound_tasks() {
        struct ExecutorImpl;

        impl Executor<Mutex<Vec<u32>>, u32> for ExecutorImpl {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

            fn execute(
                &self,
                execute_context: &Arc<Mutex<Vec<u32>>>,
                task: u32,
                _priority: TaskPriority,
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

        let runner: Arc<PriorityRunner<Mutex<Vec<u32>>, u32, _>> =
            Arc::new(PriorityRunner::new(executor));
        let results = Arc::new(Mutex::new(Vec::new()));

        for i in 0..10 {
            let results = results.clone();
            println!("Scheduling task {}...", i);
            runner.schedule(&results, i, prio(i));
        }

        while results.lock().len() < 10 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let results = results.lock();
        println!("Results: {:?}", *results);

        // The first two tasks are directly spawned without queuing
        assert_eq!(&results[0..2], &[0, 1]);
        // All tasks after that are queued and therefore prioritized
        // This means the highest priority tasks are executed next
        assert!(results[2..4].contains(&9));
        assert!(results[2..4].contains(&8));
        // The last tasks are the tasks with the lowest priority
        assert!(results[8..10].contains(&2));
        assert!(results[8..10].contains(&3));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_cpu_bound_with_yield_tasks() {
        struct ExecutorImpl;

        impl Executor<Mutex<Vec<u32>>, u32> for ExecutorImpl {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

            fn execute(
                &self,
                execute_context: &Arc<Mutex<Vec<u32>>>,
                task: u32,
                _priority: TaskPriority,
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

        let runner: Arc<PriorityRunner<Mutex<Vec<u32>>, u32, _>> =
            Arc::new(PriorityRunner::new(executor));
        let results = Arc::new(Mutex::new(Vec::new()));

        for i in 0..10 {
            let results = results.clone();
            println!("Scheduling task {}...", i);
            runner.schedule(&results, i, prio(i));
        }

        while results.lock().len() < 10 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let results = results.lock();
        println!("Results: {:?}", *results);

        // The first two tasks are directly spawned without queuing
        assert_eq!(&results[0..2], &[0, 1]);
        // All tasks after that are queued and therefore prioritized
        // This means the highest priority tasks are executed next
        assert!(results[2..4].contains(&9));
        assert!(results[2..4].contains(&8));
        // The last tasks are the tasks with the lowest priority
        assert!(results[8..10].contains(&2));
        assert!(results[8..10].contains(&3));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_waiting_tasks() {
        struct ExecutorImpl;

        impl Executor<Mutex<Vec<u32>>, u32> for ExecutorImpl {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

            fn execute(
                &self,
                execute_context: &Arc<Mutex<Vec<u32>>>,
                task: u32,
                _priority: TaskPriority,
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

        let runner: Arc<PriorityRunner<Mutex<Vec<u32>>, u32, _>> =
            Arc::new(PriorityRunner::new(executor));
        let results = Arc::new(Mutex::new(Vec::new()));

        for i in 0..10 {
            let results = results.clone();
            println!("Scheduling task {}...", i);
            runner.schedule(&results, i, prio(i));
        }

        while results.lock().len() < 10 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let results = results.lock();
        println!("Results: {:?}", *results);

        assert_eq!(*results, vec![0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }

    /// Test that verifies priority ordering with mixed CPU-bound and waiting tasks.
    ///
    /// - Tasks 0-9 are CPU-bound (simulated using a non-tokio barrier)
    /// - Tasks 10-19 are waiting tasks (async yield)
    ///
    /// Each task waits on two barriers (start, finish). The release sequence
    /// controls execution order deterministically.
    #[test]
    fn test_mixed_cpu_bound_and_waiting_tasks() {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .event_interval(1)
            .global_queue_interval(1)
            .disable_lifo_slot()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                tokio::time::timeout(
                    Duration::from_secs(10),
                    test_mixed_cpu_bound_and_waiting_tasks_impl(),
                )
                .await
            })
            .expect("Timed out")
    }

    async fn test_mixed_cpu_bound_and_waiting_tasks_impl() {
        const NUM_TASKS: usize = 20;

        struct TestContext {
            dispatch_order: Mutex<Vec<u32>>,
            completion_order: Mutex<Vec<u32>>,
            task_barriers: Vec<(Barrier, Barrier)>,
        }

        impl Drop for TestContext {
            fn drop(&mut self) {
                // Print ordering for debugging purposes (in both test success
                // and failure cases). Not asserted because the barriers will
                // enforce a reasonable ordering and there's a bit of a race
                // between barrier release and printing anyways.
                let dispatch_order = self.dispatch_order.lock().clone();
                let completion_order = self.completion_order.lock().clone();
                println!("Dispatch order: {:?}", dispatch_order);
                println!("Completion order: {:?}", completion_order);
            }
        }

        struct ExecutorImpl;

        impl Executor<TestContext, (u32, bool)> for ExecutorImpl {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

            fn execute(
                &self,
                ctx: &Arc<TestContext>,
                (task, cpu): (u32, bool),
                _priority: TaskPriority,
            ) -> Self::Future {
                let ctx = ctx.clone();
                Box::pin(async move {
                    println!("Dispatched task {task}");
                    ctx.dispatch_order.lock().push(task);
                    let ctx_clone = ctx.clone();
                    tokio::task::spawn_blocking(move || {
                        ctx_clone.task_barriers[task as usize].0.wait();
                    })
                    .await
                    .unwrap();
                    println!("Started task {task}");
                    if !cpu {
                        tokio::task::yield_now().await;
                    }
                    // The ending barrier is sync!
                    ctx.task_barriers[task as usize].1.wait();
                    println!("Finished task {task}");
                    ctx.completion_order.lock().push(task);
                })
            }
        }

        let ctx = Arc::new(TestContext {
            dispatch_order: Mutex::new(Vec::new()),
            completion_order: Mutex::new(Vec::new()),
            task_barriers: (0..NUM_TASKS)
                .map(|_| (Barrier::new(2), Barrier::new(2)))
                .collect(),
        });

        let runner = Arc::new(PriorityRunner::new(ExecutorImpl));

        #[derive(Debug)]
        enum Action {
            Schedule(u32, bool),      // true if cpu, false if wait
            ScheduleStart(u32, bool), // true if cpu, false if wait
            StartFinish(u32),
            Start(u32),
            Finish(u32),
        }

        // This action sequence encodes scheduling and barrier-runs.
        #[rustfmt::skip]
        let actions: &[Action] = &[
            // Schedule and start 0 and 1 (CPU-bound).
            Action::ScheduleStart(0, true),
            Action::ScheduleStart(1, true),

            // These sneak in during a thread race
            Action::Schedule(2, true),
            Action::Schedule(3, true),
            Action::Schedule(4, true),
            Action::Schedule(5, true),

            // Let CPU-bound 0 and 1 reach complete which allows 4 and 5 to start
            Action::Finish(0),
            Action::Finish(1),
            Action::Start(4),
            Action::Start(5),

            // Schedule the rest of the tasks while the CPU-bound tasks are running
            Action::Schedule(6, true),
            Action::Schedule(7, true),
            Action::Schedule(8, true),
            Action::Schedule(9, true),
            // 10..19 are waiting tasks
            Action::Schedule(10, false),
            Action::Schedule(11, false),
            Action::Schedule(12, false),
            Action::Schedule(13, false),
            Action::Schedule(14, false),
            Action::Schedule(15, false),
            Action::Schedule(16, false),
            Action::Schedule(17, false),
            Action::Schedule(18, false),
            Action::Schedule(19, false),

            // Let CPU-bound 2 and 3 reach complete which lets in the high priority tasks
            Action::Finish(4),
            Action::StartFinish(19),
            Action::Finish(5),
            Action::StartFinish(18),

            // Then let the rest of the waiting tasks through
            Action::StartFinish(17),
            Action::StartFinish(16),
            Action::StartFinish(15),
            Action::StartFinish(14),
            Action::StartFinish(13),
            Action::StartFinish(12),
            Action::StartFinish(11),
            Action::StartFinish(10),

            // And interleave the CPU ones a bit
            Action::Start(9),
            Action::Start(8),
            Action::Finish(8),
            Action::Start(7),
            Action::Finish(7),
            Action::Finish(9),
            Action::Start(6),
            Action::Finish(6),
            Action::Start(3),
            Action::Start(2),
            Action::Finish(2),
            Action::Finish(3),
        ];

        // Run in a blocking thread to avoid competing for workers
        let ctx_clone = ctx.clone();
        tokio::task::spawn_blocking(move || {
            let ctx = ctx_clone;
            let mut scheduled = 0;
            let mut started = 0;
            let mut finished = 0;
            for action in actions {
                println!("{:?}", action);
                match action {
                    Action::Schedule(task, cpu) => {
                        runner.schedule(&ctx, (*task, *cpu), prio(*task));
                        scheduled += 1;
                    }
                    Action::ScheduleStart(task, cpu) => {
                        runner.schedule(&ctx, (*task, *cpu), prio(*task));
                        ctx.task_barriers[*task as usize].0.wait();
                        scheduled += 1;
                        started += 1;
                    }
                    Action::StartFinish(task) => {
                        ctx.task_barriers[*task as usize].0.wait();
                        started += 1;
                        ctx.task_barriers[*task as usize].1.wait();
                        finished += 1;
                    }
                    Action::Start(task) => {
                        ctx.task_barriers[*task as usize].0.wait();
                        started += 1;
                    }
                    Action::Finish(task) => {
                        ctx.task_barriers[*task as usize].1.wait();
                        finished += 1;
                    }
                }
            }

            assert_eq!(scheduled, NUM_TASKS);
            assert_eq!(started, NUM_TASKS);
            assert_eq!(finished, NUM_TASKS);
        })
        .await
        .unwrap();

        println!("Waiting for completion...");
        while ctx.completion_order.lock().len() < NUM_TASKS {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    /// Directly exercise `Queues` band routing + ordering: `Recomputation` drains before the
    /// `Invalidation` heap (in exact leaf-distance order) before `Initial`, with FIFO within each
    /// unkeyed band.
    #[test]
    fn queues_pop_in_exact_band_and_heap_order() {
        let q: Queues<&str> = Queues::new();
        assert!(q.is_empty());

        // Push out of priority order, mixing all three bands and several distinct leaf distances.
        q.push(TaskPriority::Initial, "initial-a");
        q.push(TaskPriority::invalidation(5), "inv-d5");
        q.push(TaskPriority::Recomputation, "recomp-a");
        q.push(TaskPriority::Initial, "initial-b");
        q.push(TaskPriority::invalidation(1), "inv-d1");
        q.push(TaskPriority::invalidation(3), "inv-d3");
        q.push(TaskPriority::Recomputation, "recomp-b");

        assert!(!q.is_empty());

        let mut out = Vec::new();
        while let Some((_, task)) = q.pop() {
            out.push(task);
        }

        // Recomputation first (FIFO within band), then the Invalidation heap in exact leaf-distance
        // order (distance 1 > 3 > 5 since smaller distance = higher priority), then Initial (FIFO).
        assert_eq!(
            out,
            vec![
                "recomp-a",
                "recomp-b",
                "inv-d1",
                "inv-d3",
                "inv-d5",
                "initial-a",
                "initial-b"
            ]
        );
        assert!(q.is_empty());
    }

    /// Liveness stress test for the schedule/retire race: saturate the worker pool and rapidly
    /// schedule a large fan-out of short tasks from *within* executing tasks (so `schedule` runs
    /// while the pool is saturated and workers are constantly hitting the `Done` → pop → retire
    /// path), mixing all three priority bands. Asserts every scheduled task eventually runs — a
    /// stranded task (the hazard the acquire/release ordering on `active_workers` guards against)
    /// would leave the count short and hang, caught by the outer timeout.
    #[test]
    fn stress_no_task_is_stranded() {
        // A fresh tokio runtime per iteration; loop to shake interleavings. Each iteration spawns a
        // wide fan-out tree of tiny tasks and waits for all of them under a timeout.
        for iteration in 0..50 {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .worker_threads(4)
                .enable_all()
                .build()
                .unwrap();
            rt.block_on(async {
                tokio::time::timeout(Duration::from_secs(20), stress_iteration(iteration))
                    .await
                    .unwrap_or_else(|_| panic!("iteration {iteration} timed out — task stranded"));
            });
        }
    }

    struct StressCtx {
        runner: Mutex<Option<Arc<PriorityRunner<StressCtx, u32, StressExecutor>>>>,
        /// Total number of tasks that have run so far (roots + all fanned-out children).
        completed: std::sync::atomic::AtomicUsize,
        /// Total number of tasks scheduled so far. Stays >= `completed`; they are equal exactly
        /// when the whole tree has drained. Incremented before each `schedule`.
        scheduled: std::sync::atomic::AtomicUsize,
    }

    #[derive(Clone, Copy)]
    struct StressExecutor;

    impl Executor<StressCtx, u32> for StressExecutor {
        type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

        fn execute(
            &self,
            ctx: &Arc<StressCtx>,
            depth: u32,
            _priority: TaskPriority,
        ) -> Self::Future {
            let ctx = ctx.clone();
            Box::pin(async move {
                // Fan out two children for a few levels, then stop. This keeps scheduling tasks
                // while the pool is saturated and workers churn through the retire path.
                if depth > 0 {
                    let runner = ctx.runner.lock().clone().unwrap();
                    for child in 0..2u32 {
                        // Count the child as scheduled BEFORE scheduling it, so `scheduled` is
                        // never observed lower than the true outstanding work.
                        ctx.scheduled
                            .fetch_add(1, std::sync::atomic::Ordering::AcqRel);
                        // Spread children across all three bands to exercise every push target.
                        let priority = match (depth + child) % 3 {
                            0 => TaskPriority::Initial,
                            1 => TaskPriority::Recomputation,
                            _ => TaskPriority::invalidation(depth),
                        };
                        runner.schedule(&ctx, depth - 1, priority);
                    }
                }
                // Occasionally yield so the worker suspends/resumes (exercises the Pending path
                // too).
                if depth.is_multiple_of(2) {
                    tokio::task::yield_now().await;
                }
                ctx.completed
                    .fetch_add(1, std::sync::atomic::Ordering::AcqRel);
            })
        }
    }

    async fn stress_iteration(_iteration: u32) {
        use std::sync::atomic::Ordering;
        const ROOTS: usize = 64;
        const DEPTH: u32 = 6;
        // Each task fans out to 2 children for DEPTH levels: a full binary tree of 2^(DEPTH+1)-1
        // nodes per root.
        let per_root = (1usize << (DEPTH + 1)) - 1;
        let total = ROOTS * per_root;

        let ctx = Arc::new(StressCtx {
            runner: Mutex::new(None),
            completed: std::sync::atomic::AtomicUsize::new(0),
            scheduled: std::sync::atomic::AtomicUsize::new(ROOTS),
        });
        let runner = Arc::new(PriorityRunner::new(StressExecutor));
        *ctx.runner.lock() = Some(runner.clone());

        for i in 0..ROOTS {
            let priority = match i % 3 {
                0 => TaskPriority::Initial,
                1 => TaskPriority::Recomputation,
                _ => TaskPriority::invalidation(DEPTH),
            };
            runner.schedule(&ctx, DEPTH, priority);
        }

        // Poll until every task has run. If any task is stranded (the hazard), `completed` never
        // reaches `total` and the outer timeout fails the test.
        while ctx.completed.load(Ordering::Acquire) < total {
            tokio::time::sleep(Duration::from_millis(2)).await;
        }
        assert_eq!(ctx.scheduled.load(Ordering::Acquire), total);
        assert_eq!(ctx.completed.load(Ordering::Acquire), total);

        // Drop the self-reference so the runner Arc can be released.
        *ctx.runner.lock() = None;
    }
}
