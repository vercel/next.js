use std::{
    future::{Future, IntoFuture},
    mem,
    pin::Pin,
    sync::{
        Arc, Mutex, Weak,
        atomic::{AtomicBool, Ordering},
    },
    task::{Context, Poll},
};

use anyhow::Result;
use futures::{
    future::{JoinAll, join_all},
    task::{ArcWake, AtomicWaker, waker_ref},
};
use pin_project_lite::pin_project;

pin_project! {
    /// Future for the [JoinIterExt::join] method.
    pub struct Join<F>
    where
        F: Future,
    {
        #[pin]
        inner: JoinAll<F>,
    }
}

impl<T, F> Future for Join<F>
where
    F: Future<Output = T>,
{
    type Output = Vec<T>;

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        self.project().inner.poll(cx)
    }
}

pub trait JoinIterExt<T, F>: Iterator
where
    F: Future<Output = T>,
{
    /// Returns a future that resolves to a vector of the outputs of the futures
    /// in the iterator.
    fn join(self) -> Join<F>;
}

pin_project! {
    struct MaybeDone<F>
    where
        F: Future,
    {
        #[pin]
        future: F,
        output: Option<F::Output>,
    }
}

struct WakeTask {
    index: usize,
    queued: AtomicBool,
    shared: Weak<WakeShared>,
}

impl ArcWake for WakeTask {
    fn wake_by_ref(task: &Arc<Self>) {
        if task.queued.swap(true, Ordering::AcqRel) {
            return;
        }
        let Some(shared) = task.shared.upgrade() else {
            return;
        };
        shared.queue.lock().unwrap().push(Arc::clone(task));
        shared.parent.wake();
    }
}

#[derive(Default)]
struct WakeShared {
    queue: Mutex<Vec<Arc<WakeTask>>>,
    parent: AtomicWaker,
}

const WAKE_DRIVEN_THRESHOLD: usize = 30;

enum PollState {
    First,
    Scanning,
    Registering,
    WakeDriven(Arc<WakeShared>),
    Done,
}

/// Joins futures with an allocation-free scheduling fast path when they all resolve on the first
/// poll. Small pending joins continue scanning directly; large pending joins install per-future
/// wakers on the second poll and later poll only the futures those wakers enqueue.
struct IterJoin<F>
where
    F: Future,
{
    elems: Pin<Box<[MaybeDone<F>]>>,
    pending: usize,
    state: PollState,
    wake_tasks: Option<Box<[Option<Arc<WakeTask>>]>>,
}

impl<F> IterJoin<F>
where
    F: Future,
{
    fn new(iter: impl Iterator<Item = F>) -> Self {
        let elems = iter
            .map(|future| MaybeDone {
                future,
                output: None,
            })
            .collect::<Box<[_]>>();
        Self {
            pending: elems.len(),
            elems: Box::into_pin(elems),
            state: PollState::First,
            wake_tasks: None,
        }
    }

    fn take_outputs(&mut self) -> impl Iterator<Item = F::Output> + '_ {
        iter_pin_mut(self.elems.as_mut()).map(|elem| elem.project().output.take().unwrap())
    }
}

// SAFETY: The elements are pinned as part of the boxed slice and are never moved before the slice
// is dropped. Projecting a pinned slice to its individual pinned elements preserves that pinning.
fn iter_pin_mut<T>(slice: Pin<&mut [T]>) -> impl Iterator<Item = Pin<&mut T>> {
    unsafe { slice.get_unchecked_mut() }
        .iter_mut()
        .map(|elem| unsafe { Pin::new_unchecked(elem) })
}

// SAFETY: Like `iter_pin_mut`, this projects one element without moving it from the pinned slice.
fn get_pin_mut<T>(slice: Pin<&mut [T]>, index: usize) -> Pin<&mut T> {
    unsafe { slice.map_unchecked_mut(|slice| &mut slice[index]) }
}

impl<F> IterJoin<F>
where
    F: Future,
{
    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<()> {
        let this = self.get_mut();

        match &this.state {
            PollState::First => {
                for elem in iter_pin_mut(this.elems.as_mut()) {
                    let elem = elem.project();
                    if let Poll::Ready(output) = elem.future.poll(cx) {
                        *elem.output = Some(output);
                        this.pending -= 1;
                    }
                }
                if this.pending == 0 {
                    this.state = PollState::Done;
                    return Poll::Ready(());
                }
                this.state = if this.elems.len() <= WAKE_DRIVEN_THRESHOLD {
                    PollState::Scanning
                } else {
                    PollState::Registering
                };
            }
            PollState::Scanning => {
                for elem in iter_pin_mut(this.elems.as_mut()) {
                    let elem = elem.project();
                    if elem.output.is_some() {
                        continue;
                    }
                    if let Poll::Ready(output) = elem.future.poll(cx) {
                        *elem.output = Some(output);
                        this.pending -= 1;
                    }
                }
                if this.pending == 0 {
                    this.state = PollState::Done;
                    return Poll::Ready(());
                }
            }
            PollState::Registering => {
                // Futures were initially polled with the parent waker so the all-ready case avoids
                // scheduler setup. Poll each unfinished future once more with an indexed waker;
                // after this pass, wake-driven polling can identify exactly which futures to poll.
                let shared = Arc::new(WakeShared::default());
                shared.parent.register(cx.waker());
                let mut wake_tasks = vec![None; this.elems.len()].into_boxed_slice();
                for (index, elem) in iter_pin_mut(this.elems.as_mut()).enumerate() {
                    let elem = elem.project();
                    if elem.output.is_some() {
                        continue;
                    }
                    let task = Arc::new(WakeTask {
                        index,
                        queued: AtomicBool::new(false),
                        shared: Arc::downgrade(&shared),
                    });
                    let waker = waker_ref(&task);
                    let mut child_cx = Context::from_waker(&waker);
                    if let Poll::Ready(output) = elem.future.poll(&mut child_cx) {
                        *elem.output = Some(output);
                        this.pending -= 1;
                    } else {
                        wake_tasks[index] = Some(task);
                    }
                }
                if this.pending == 0 {
                    this.state = PollState::Done;
                    return Poll::Ready(());
                }
                this.wake_tasks = Some(wake_tasks);
                this.state = PollState::WakeDriven(shared);
            }
            PollState::WakeDriven(shared) => {
                let shared = Arc::clone(shared);
                shared.parent.register(cx.waker());

                let ready = {
                    let mut queue = shared.queue.lock().unwrap();
                    // Reset `queued` while holding the queue lock. A concurrent wake then either
                    // observes the old queued item (which this poll handles) or waits for the lock
                    // and appends a new item; it cannot be lost between those operations.
                    let queued = mem::take(&mut *queue);
                    for task in &queued {
                        task.queued.store(false, Ordering::Release);
                    }
                    queued
                };

                for task in ready {
                    let wake_tasks = this.wake_tasks.as_mut().unwrap();
                    if wake_tasks[task.index].is_none() {
                        continue;
                    }
                    let mut elem = get_pin_mut(this.elems.as_mut(), task.index);
                    let elem = elem.as_mut().project();
                    if elem.output.is_some() {
                        wake_tasks[task.index] = None;
                        continue;
                    }
                    let waker = waker_ref(&task);
                    let mut child_cx = Context::from_waker(&waker);
                    if let Poll::Ready(output) = elem.future.poll(&mut child_cx) {
                        *elem.output = Some(output);
                        wake_tasks[task.index] = None;
                        this.pending -= 1;
                    }
                }
                if this.pending == 0 {
                    this.state = PollState::Done;
                    return Poll::Ready(());
                }
            }
            PollState::Done => panic!("IterJoin polled after completion"),
        }

        Poll::Pending
    }
}

pin_project! {
    /// Future for the [TryJoinIterExt::try_join] method.
    #[must_use]
    pub struct TryJoin<F>
    where
        F: Future,
    {
        #[pin]
        inner: IterJoin<F>,
    }
}

impl<T, F> Future for TryJoin<F>
where
    F: Future<Output = Result<T>>,
{
    type Output = Result<Vec<T>>;

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        let mut this = self.project();
        match this.inner.as_mut().poll(cx) {
            Poll::Ready(()) => Poll::Ready(this.inner.get_mut().take_outputs().collect()),
            Poll::Pending => Poll::Pending,
        }
    }
}

pub trait TryJoinIterExt<T, F>: Iterator
where
    F: Future<Output = Result<T>>,
{
    /// Returns a future that resolves to a vector of the outputs of the futures
    /// in the iterator, or to an error if one of the futures fail.
    ///
    /// Unlike `Futures::future::try_join_all`, this returns the Error that
    /// occurs first in the list of futures, not the first to fail in time.
    fn try_join(self) -> TryJoin<F>;
}

impl<T, F, IF, It> JoinIterExt<T, F> for It
where
    F: Future<Output = T>,
    IF: IntoFuture<Output = T, IntoFuture = F>,
    It: Iterator<Item = IF>,
{
    fn join(self) -> Join<F> {
        Join {
            inner: join_all(self.map(|f| f.into_future())),
        }
    }
}

impl<T, F, IF, It> TryJoinIterExt<T, F> for It
where
    F: Future<Output = Result<T>>,
    IF: IntoFuture<Output = Result<T>, IntoFuture = F>,
    It: Iterator<Item = IF>,
{
    fn try_join(self) -> TryJoin<F> {
        TryJoin {
            inner: IterJoin::new(self.map(|f| f.into_future())),
        }
    }
}

pin_project! {
    /// Future for the [TryFlatJoinIterExt::try_flat_join] method.
    pub struct TryFlatJoin<F>
    where
        F: Future,
    {
        #[pin]
        inner: IterJoin<F>,
    }
}

impl<F, I, U> Future for TryFlatJoin<F>
where
    F: Future<Output = Result<I>>,
    I: IntoIterator<IntoIter = U, Item = U::Item>,
    U: Iterator,
{
    type Output = Result<Vec<U::Item>>;

    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        let mut this = self.project();
        match this.inner.as_mut().poll(cx) {
            Poll::Ready(()) => {
                let mut output = Vec::new();
                for result in this.inner.get_mut().take_outputs() {
                    output.extend(result?);
                }
                Poll::Ready(Ok(output))
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

pub trait TryFlatJoinIterExt<F, I, U>: Iterator
where
    F: Future<Output = Result<I>>,
    I: IntoIterator<IntoIter = U, Item = U::Item>,
    U: Iterator,
{
    /// Returns a future that resolves to a vector of the outputs of the futures
    /// in the iterator, or to an error if one of the futures fail.
    ///
    /// It also flattens the result.
    ///
    /// Unlike `Futures::future::try_join_all`, this returns the Error that
    /// occurs first in the list of futures, not the first to fail in time.
    fn try_flat_join(self) -> TryFlatJoin<F>;
}

impl<F, IF, It, I, U> TryFlatJoinIterExt<F, I, U> for It
where
    F: Future<Output = Result<I>>,
    IF: IntoFuture<Output = Result<I>, IntoFuture = F>,
    It: Iterator<Item = IF>,
    I: IntoIterator<IntoIter = U, Item = U::Item>,
    U: Iterator,
{
    fn try_flat_join(self) -> TryFlatJoin<F> {
        TryFlatJoin {
            inner: IterJoin::new(self.map(|f| f.into_future())),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        future::{Future, ready},
        marker::PhantomPinned,
        pin::Pin,
        sync::{
            Arc,
            atomic::{AtomicBool, AtomicUsize, Ordering},
        },
        task::{Context, Poll},
    };

    use anyhow::{Result, anyhow};
    use futures::{executor::block_on, task::AtomicWaker};

    use crate::{TryFlatJoinIterExt, TryJoinIterExt};

    struct PollTwice {
        value: usize,
        polled: bool,
        result: Result<usize>,
        _pinned: PhantomPinned,
    }

    impl Future for PollTwice {
        type Output = Result<usize>;

        fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
            // SAFETY: Mutating these fields does not move the pinned future.
            let this = unsafe { self.get_unchecked_mut() };
            if this.polled {
                Poll::Ready(std::mem::replace(&mut this.result, Ok(this.value)))
            } else {
                this.polled = true;
                cx.waker().wake_by_ref();
                Poll::Pending
            }
        }
    }

    struct StepFuture {
        value: usize,
        ready: Arc<AtomicBool>,
        waker: Arc<AtomicWaker>,
        polls: Arc<AtomicUsize>,
        _pinned: PhantomPinned,
    }

    struct ThreadWake {
        ready: Arc<AtomicBool>,
        started: bool,
    }

    struct WakeWhenReady {
        value: usize,
        polls: usize,
        ready_after: usize,
        completed: bool,
    }

    impl Future for WakeWhenReady {
        type Output = Result<usize>;

        fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
            assert!(!self.completed, "future polled after completion");
            self.polls += 1;
            cx.waker().wake_by_ref();
            if self.polls == self.ready_after {
                self.completed = true;
                Poll::Ready(Ok(self.value))
            } else {
                Poll::Pending
            }
        }
    }

    impl Future for ThreadWake {
        type Output = Result<usize>;

        fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
            if self.ready.load(Ordering::Acquire) {
                return Poll::Ready(Ok(42));
            }
            if !self.started {
                self.started = true;
                let ready = Arc::clone(&self.ready);
                let waker = cx.waker().clone();
                std::thread::spawn(move || {
                    ready.store(true, Ordering::Release);
                    waker.wake();
                });
            }
            Poll::Pending
        }
    }

    impl Future for StepFuture {
        type Output = Result<usize>;

        fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
            self.polls.fetch_add(1, Ordering::Relaxed);
            if self.ready.load(Ordering::Acquire) {
                Poll::Ready(Ok(self.value))
            } else {
                self.waker.register(cx.waker());
                Poll::Pending
            }
        }
    }

    fn poll_twice(value: usize, result: Result<usize>) -> PollTwice {
        PollTwice {
            value,
            polled: false,
            result,
            _pinned: PhantomPinned,
        }
    }

    #[test]
    fn immediate_join_preserves_order_at_all_sizes() {
        for size in [0, 10, 100] {
            let actual = block_on(
                (0..size)
                    .map(|value| ready(Ok::<_, anyhow::Error>(value)))
                    .try_join(),
            )
            .unwrap();
            assert_eq!(actual, (0..size).collect::<Vec<_>>());
        }
    }

    #[test]
    fn immediate_flat_join_preserves_order() {
        let actual = block_on(
            (0..100)
                .map(|value| ready(Ok::<_, anyhow::Error>([value, value + 100])))
                .try_flat_join(),
        )
        .unwrap();
        let expected = (0..100)
            .flat_map(|value| [value, value + 100])
            .collect::<Vec<_>>();
        assert_eq!(actual, expected);
    }

    #[test]
    fn large_non_unpin_futures_resolve_on_second_poll() {
        let actual = block_on(
            (0..100)
                .map(|value| poll_twice(value, Ok(value)))
                .try_join(),
        )
        .unwrap();
        assert_eq!(actual, (0..100).collect::<Vec<_>>());
    }

    #[test]
    fn errors_are_returned_in_input_order() {
        let error = block_on(
            [
                poll_twice(0, Err(anyhow!("first"))),
                poll_twice(1, Err(anyhow!("second"))),
            ]
            .into_iter()
            .try_join(),
        )
        .unwrap_err();
        assert_eq!(error.to_string(), "first");
    }

    #[test]
    fn completed_futures_queued_by_a_racing_wake_are_not_polled_again() {
        let values = block_on(
            (0..31)
                .map(|value| WakeWhenReady {
                    value,
                    polls: 0,
                    ready_after: if value == 30 { 3 } else { 2 },
                    completed: false,
                })
                .try_join(),
        )
        .unwrap();
        assert_eq!(values, (0..31).collect::<Vec<_>>());
    }

    #[test]
    fn wake_from_another_thread_is_supported() {
        let values = block_on(
            [ThreadWake {
                ready: Arc::new(AtomicBool::new(false)),
                started: false,
            }]
            .into_iter()
            .try_join(),
        )
        .unwrap();
        assert_eq!(values, [42]);
    }

    #[test]
    fn sequential_wakes_only_poll_ready_futures() {
        let size = 100;
        let polls = Arc::new(AtomicUsize::new(0));
        let controls = (0..size)
            .map(|_| {
                (
                    Arc::new(AtomicBool::new(false)),
                    Arc::new(AtomicWaker::new()),
                )
            })
            .collect::<Vec<_>>();
        let future = controls
            .iter()
            .enumerate()
            .map(|(value, (ready, waker))| StepFuture {
                value,
                ready: Arc::clone(ready),
                waker: Arc::clone(waker),
                polls: Arc::clone(&polls),
                _pinned: PhantomPinned,
            })
            .try_join();
        let mut future = std::pin::pin!(future);
        let waker = futures::task::noop_waker();
        let mut cx = Context::from_waker(&waker);

        assert!(future.as_mut().poll(&mut cx).is_pending());
        let mut completed = false;
        for (ready, waker) in &controls {
            ready.store(true, Ordering::Release);
            waker.wake();
            match future.as_mut().poll(&mut cx) {
                Poll::Ready(result) => {
                    assert_eq!(result.unwrap(), (0..size).collect::<Vec<_>>());
                    completed = true;
                    break;
                }
                Poll::Pending => {}
            }
        }

        assert!(completed);
        assert!(polls.load(Ordering::Relaxed) <= size * 3);
    }
}
