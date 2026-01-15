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

use parking_lot::Mutex;
use pin_project_lite::pin_project;
use tokio::sync::oneshot::{Receiver, Sender};

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
    tx: Option<Sender<()>>,
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
    queue: Mutex<BinaryHeap<HeapItem<P, T>>>,
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
        Self {
            executor,
            target_workers: tokio::runtime::Handle::current().metrics().num_workers(),
            queue: Mutex::new(BinaryHeap::new()),
            active_workers: AtomicUsize::new(0),
            phantom: std::marker::PhantomData,
        }
    }

    pub fn schedule(self: &Arc<Self>, execute_context: &Arc<C>, task: T, priority: P) {
        self.schedule_internal(execute_context, task, priority, None);
    }

    pub fn schedule_with_join_handle(
        self: &Arc<Self>,
        execute_context: &Arc<C>,
        task: T,
        priority: P,
    ) -> JoinHandle {
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.schedule_internal(execute_context, task, priority, Some(tx));
        JoinHandle { receiver: rx }
    }

    fn schedule_internal(
        self: &Arc<Self>,
        execute_context: &Arc<C>,
        task: T,
        priority: P,
        tx: Option<Sender<()>>,
    ) {
        let mut queue = self.queue.lock();
        if !queue.is_empty() {
            // If there is already work in the queue, we don't have any
            // free capacity so we can just push the task to the queue.
            // It will be picked up by existing workers.
            queue.push(HeapItem { priority, task, tx });
            return;
        }
        // The queue is empty, so we might have free capacity to spawn a new worker.
        let active_workers = self.active_workers.fetch_add(1, Ordering::Relaxed);
        if active_workers < self.target_workers {
            // We have free capacity, spawn a new worker to execute this task immediately.
            drop(queue);

            let future = self.executor.execute(execute_context, task, priority);
            WorkerFuture::spawn(future, tx, execute_context.clone(), self.clone());
        } else {
            // No free capacity, push the task to the queue.
            queue.push(HeapItem { priority, task, tx });
            drop(queue);

            // Undo the added active worker since we didn't spawn a new worker.
            self.decrease_active_workers(execute_context);
        }
    }

    /// Tries to decrease the active worker count by 1.
    /// If there is work available in the queue, a new worker is spawned instead.
    fn reuse_or_decrease_active_workers(self: &Arc<Self>, execute_context: &Arc<C>) {
        let active_workers = self.active_workers.load(Ordering::Relaxed) - 1;
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
        let active_workers = self.active_workers.fetch_sub(1, Ordering::Relaxed) - 1;
        if active_workers < self.target_workers {
            self.spawn_worker_if_work_available(execute_context, false);
        }
    }

    fn pop_future_from_worker(
        &self,
        execute_context: &Arc<C>,
    ) -> Option<(E::Future, Option<Sender<()>>)> {
        let mut queue = self.queue.lock();
        if let Some(heap_item) = queue.pop() {
            if queue.len() * 2 + 16 < queue.capacity() {
                queue.shrink_to_fit();
            }
            drop(queue);
            let tx = heap_item.tx;
            Some((
                self.executor
                    .execute(execute_context, heap_item.task, heap_item.priority),
                tx,
            ))
        } else {
            None
        }
    }

    fn spawn_worker_if_work_available(
        self: &Arc<Self>,
        execute_context: &Arc<C>,
        unused_active_count: bool,
    ) -> bool {
        let mut queue = self.queue.lock();
        if let Some(heap_item) = queue.pop() {
            if queue.len() * 2 + 16 < queue.capacity() {
                queue.shrink_to_fit();
            }
            drop(queue);
            let tx = heap_item.tx;
            let new_future =
                self.executor
                    .execute(execute_context, heap_item.task, heap_item.priority);

            if !unused_active_count {
                self.active_workers.fetch_add(1, Ordering::Relaxed);
            }
            WorkerFuture::spawn(new_future, tx, execute_context.clone(), self.clone());
            true
        } else {
            false
        }
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
        tx: Option<Sender<()>>,
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
    fn spawn(
        future: E::Future,
        tx: Option<Sender<()>>,
        execute_context: Arc<C>,
        runner: Arc<PriorityRunner<C, T, P, E>>,
    ) {
        tokio::task::spawn(Self {
            future,
            tx,
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
            this.runner.active_workers.fetch_add(1, Ordering::Relaxed);
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
                            // Notify that the task is done
                            if let Some(tx) = this.tx.take() {
                                let _ = tx.send(());
                            }

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
                    let active_workers = this.runner.active_workers.load(Ordering::Relaxed);
                    if active_workers > this.runner.target_workers {
                        // There are more active workers than target, so we should end this
                        // worker.
                        this.runner.decrease_active_workers(this.execute_context);
                        *this.state = WorkerState::Closed;
                        return Poll::Ready(());
                    }

                    // This future is done, we need to check the queue for more tasks,
                    // so we can continue working on a new future in this worker.
                    if let Some((new_future, new_tx)) =
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
                        *this.tx = new_tx;
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

pub struct JoinHandle {
    receiver: Receiver<()>,
}

impl Future for JoinHandle {
    type Output = ();

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = self.get_mut();
        match Pin::new(&mut this.receiver).poll(cx) {
            Poll::Ready(result) => {
                let _ = result;
                Poll::Ready(())
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{sync::Arc, thread::sleep, time::Duration};

    use super::*;

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

        assert_eq!(*results, vec![0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }

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
            .block_on(test_mixed_cpu_bound_and_waiting_tasks_impl());
    }

    async fn test_mixed_cpu_bound_and_waiting_tasks_impl() {
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
                println!("Created task {}", task);
                Box::pin(async move {
                    let cpu_bound = task < 10;
                    if cpu_bound {
                        println!("Executing cpu-bound task {}...", task);
                        // CPU bound task
                        sleep(Duration::from_millis((task as u64 + 1) * 10));
                    } else {
                        println!("Executing waiting task {}...", task);
                        // Waiting task
                        tokio::time::sleep(Duration::from_millis((task as u64 + 1) * 10)).await;
                    }
                    execute_context.lock().push(task);
                    if cpu_bound {
                        println!("Finished cpu-bound task {}.", task);
                    } else {
                        println!("Finished waiting task {}.", task);
                    }
                })
            }
        }

        let executor = ExecutorImpl;

        let runner: Arc<PriorityRunner<Mutex<Vec<u32>>, u32, u32, _>> =
            Arc::new(PriorityRunner::new(executor));
        let results = Arc::new(Mutex::new(Vec::new()));

        for i in 0..20 {
            let results = results.clone();
            println!("Scheduling task {}...", i);
            runner.schedule(&results, i, i);
        }

        while results.lock().len() < 20 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let results = results.lock();
        println!("Results: {:?}", *results);

        // The first two tasks are directly spawned without queuing
        assert_eq!(&results[0..2], &[0, 1]);
        // All tasks after that are queued and therefore prioritized
        // The waiting tasks are just waiting, so all of them are executed.
        // And the two highest priority cpu-bound tasks are executed too.
        // Since we only have 2 workers, the waiting tasks ain't polled until the cpu-bound tasks
        // are done.
        assert!(results[2..4].contains(&9));
        assert!(results[2..4].contains(&8));
        let waiting_task_pos = results
            .iter()
            .position(|&x| x >= 10)
            .expect("Waiting task should be executed");
        // Waiting tasks should be interleaved with cpu-bound tasks
        assert!(waiting_task_pos < 8);

        let cpu_bound_results = results
            .iter()
            .copied()
            .filter(|&x| x < 10)
            .collect::<Vec<_>>();
        // The last tasks are the tasks with the lowest priority
        assert!(cpu_bound_results[8..10].contains(&2));
        assert!(cpu_bound_results[8..10].contains(&3));
    }
}
