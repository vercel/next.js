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
};

use parking_lot::Mutex;
use pin_project_lite::pin_project;

pub trait Executor<C, T>: Send + Sync {
    type Future: Future<Output = ()> + Send;

    fn execute(&self, execute_context: &Arc<C>, task: T) -> Self::Future;
}

impl<C, T, F, Fut> Executor<C, T> for F
where
    F: Fn(&Arc<C>, T) -> Fut + Send + Sync,
    Fut: Future<Output = ()> + Send,
{
    type Future = Fut;

    fn execute(&self, execute_context: &Arc<C>, task: T) -> Self::Future {
        (self)(execute_context, task)
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

pub struct PriorityRunner<
    C: Send + Sync + 'static,
    T: Send + 'static,
    P: Ord + Send + 'static,
    E: Executor<C, T> + 'static,
> {
    executor: E,
    target_workers: usize,
    inner: Mutex<InnerState<T, P>>,
    active_polls: AtomicUsize,
    phantom: std::marker::PhantomData<C>,
}

struct InnerState<T, P> {
    queue: BinaryHeap<HeapItem<P, T>>,
}

impl<
    C: Send + Sync + 'static,
    T: Send + 'static,
    P: Debug + Ord + Send + 'static,
    E: Executor<C, T> + 'static,
> PriorityRunner<C, T, P, E>
{
    pub fn new(executor: E) -> Self {
        Self {
            executor,
            target_workers: tokio::runtime::Handle::current().metrics().num_workers(),
            inner: Mutex::new(InnerState {
                queue: BinaryHeap::new(),
            }),
            active_polls: AtomicUsize::new(0),
            phantom: std::marker::PhantomData,
        }
    }

    pub fn schedule(self: &Arc<Self>, execute_context: &Arc<C>, task: T, priority: P) {
        let mut inner = self.inner.lock();
        if !inner.queue.is_empty() {
            // If there is already work in the queue, we don't have any
            // free capacity so we can just push the task to the queue.
            // It will be picked up by existing workers.
            inner.queue.push(HeapItem { priority, task });
            return;
        }
        // The queue is empty, so we might have free capacity to spawn a new worker.
        let active_polls = self.active_polls.fetch_add(1, Ordering::Relaxed);
        if active_polls < self.target_workers {
            // We have free capacity, spawn a new worker to execute this task immediately.
            drop(inner);

            let future = self.executor.execute(execute_context, task);
            WorkerFuture::spawn(future, execute_context.clone(), self.clone(), true);
        } else {
            // No free capacity, push the task to the queue.
            inner.queue.push(HeapItem { priority, task });
            drop(inner);

            // Active polls might be reduced in the meantime and we might have free capacity now,
            // so we try to spawn a new worker if there is still work available.
            let active_polls = self.active_polls.load(Ordering::Relaxed) - 1;
            if active_polls >= self.target_workers
                || !self.spawn_worker_if_work_available(&execute_context, true)
            {
                // Undo the added active poll since we didn't spawn a new worker.
                self.active_polls.fetch_sub(1, Ordering::Relaxed);
            }
        }
    }

    fn pop_future_from_worker(&self, execute_context: &Arc<C>) -> Option<E::Future> {
        let mut inner = self.inner.lock();
        if let Some(heap_item) = inner.queue.pop() {
            Some(self.executor.execute(execute_context, heap_item.task))
        } else {
            None
        }
    }

    fn spawn_worker_if_work_available(
        self: &Arc<Self>,
        execute_context: &Arc<C>,
        has_active_poll: bool,
    ) -> bool {
        let mut inner = self.inner.lock();
        if let Some(heap_item) = inner.queue.pop() {
            let new_future = self.executor.execute(execute_context, heap_item.task);
            drop(inner);

            if !has_active_poll {
                self.active_polls.fetch_add(1, Ordering::Relaxed);
            }
            WorkerFuture::spawn(new_future, execute_context.clone(), self.clone(), true);
            true
        } else {
            false
        }
    }
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
        E: Executor<C, T>,
        E: 'static,

    {
        #[pin]
        future: E::Future,
        execute_context: Arc<C>,
        runner: Arc<PriorityRunner<C, T, P, E>>,
        has_active_poll: bool,
    }
}

impl<
    C: Send + Sync + 'static,
    T: Send + 'static,
    P: Debug + Ord + Send + 'static,
    E: Executor<C, T> + 'static,
> WorkerFuture<C, T, P, E>
{
    fn spawn(
        future: E::Future,
        execute_context: Arc<C>,
        runner: Arc<PriorityRunner<C, T, P, E>>,
        has_active_poll: bool,
    ) {
        tokio::task::spawn(Self {
            future,
            execute_context,
            runner,
            has_active_poll,
        });
    }
}

impl<
    C: Send + Sync + 'static,
    T: Send + 'static,
    P: Debug + Ord + Send + 'static,
    E: Executor<C, T> + 'static,
> Future for WorkerFuture<C, T, P, E>
{
    type Output = ();

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let mut this = self.project();
        if !*this.has_active_poll {
            this.runner.active_polls.fetch_add(1, Ordering::Relaxed);
            *this.has_active_poll = true;
        }
        loop {
            match this.future.as_mut().poll(cx) {
                Poll::Ready(()) => {
                    // This future is done, we need to check the queue for more tasks,
                    // so we can continue working on a new future in this worker.
                    if let Some(new_future) =
                        this.runner.pop_future_from_worker(&this.execute_context)
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
                        continue;
                    } else {
                        // No more tasks to execute
                        // This worker ends here
                        this.runner.active_polls.fetch_sub(1, Ordering::Relaxed);
                        return Poll::Ready(());
                    }
                }
                Poll::Pending => {
                    // The current future is still pending, we need to suspend this worker.
                    // But we if there are free capacity we can spawn a new worker to pick up
                    // other tasks in the queue.

                    // Quick check if we can spawn a new worker from the existing active poll.
                    let active_polls = this.runner.active_polls.load(Ordering::Relaxed) - 1;
                    if active_polls >= this.runner.target_workers
                        || !this
                            .runner
                            .spawn_worker_if_work_available(&this.execute_context, true)
                    {
                        // Undo the subtracted active poll since we didn't spawn a new worker.
                        // If the active polls became lower in the meantime we might have free
                        // capacity now, so we try to spawn a new worker if
                        // there is work available.
                        let active_polls =
                            this.runner.active_polls.fetch_sub(1, Ordering::Relaxed) - 1;
                        if active_polls < this.runner.target_workers {
                            this.runner
                                .spawn_worker_if_work_available(&this.execute_context, false);
                        }
                    }
                    *this.has_active_poll = false;
                    return Poll::Pending;
                }
            }
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

        impl Executor<Mutex<Vec<u32>>, u32> for ExecutorImpl {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

            fn execute(&self, execute_context: &Arc<Mutex<Vec<u32>>>, task: u32) -> Self::Future {
                let execute_context = execute_context.clone();
                Box::pin(async move {
                    println!("Executing task {}...", task);
                    sleep(Duration::from_millis(task as u64 * 10));
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
        assert!(results[0..2].iter().any(|&x| x == 0));
        assert!(results[0..2].iter().any(|&x| x == 1));
        // All tasks after that are queued and therefore prioritized
        // This means the highest priority tasks are executed next
        assert!(results[2..4].iter().any(|&x| x == 9));
        assert!(results[2..4].iter().any(|&x| x == 8));
        // The last tasks are the tasks with the lowest priority
        assert!(results[8..10].iter().any(|&x| x == 2));
        assert!(results[8..10].iter().any(|&x| x == 3));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_waiting_tasks() {
        struct ExecutorImpl;

        impl Executor<Mutex<Vec<u32>>, u32> for ExecutorImpl {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

            fn execute(&self, execute_context: &Arc<Mutex<Vec<u32>>>, task: u32) -> Self::Future {
                let execute_context = execute_context.clone();
                Box::pin(async move {
                    println!("Executing task {}...", task);
                    tokio::time::sleep(Duration::from_millis(task as u64 * 10)).await;
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
}
