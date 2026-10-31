use std::{
    fmt::{Debug, Display, Formatter},
    future::Future,
    mem::replace,
    pin::Pin,
};
#[cfg(feature = "hanging_detection")]
use std::{
    sync::Arc,
    task::{Poll, ready},
    time::Duration,
};

#[cfg(feature = "hanging_detection")]
use tokio::time::{Timeout, timeout};

/// Blocks the current thread until `listener` is notified.
///
/// `event-listener` gates its own blocking `wait()` behind `not(target_family = "wasm")`, which
/// excludes every wasm target even though `wasm32-wasip1-threads` has real threads that can park.
/// Its native implementation is just "register a waker, then park in a loop", so on wasm we drive
/// the listener's `Future` to completion with a parking executor, which is the same mechanism.
fn block_on_listener(listener: event_listener::EventListener) {
    #[cfg(not(target_family = "wasm"))]
    {
        use event_listener::Listener as _;

        listener.wait();
    }
    #[cfg(target_family = "wasm")]
    futures::executor::block_on(listener);
}

pub trait EventDescriptor {
    #[cfg(feature = "hanging_detection")]
    fn get_description(self) -> Arc<dyn Fn() -> String + Sync + Send>;
}

impl<T, InnerFn> EventDescriptor for T
where
    T: FnOnce() -> InnerFn,
    InnerFn: Fn() -> String + Sync + Send + 'static,
{
    #[cfg(feature = "hanging_detection")]
    fn get_description(self) -> Arc<dyn Fn() -> String + Sync + Send> {
        Arc::new((self)())
    }
}

#[derive(Clone)]
pub struct EventDescription {
    #[cfg(feature = "hanging_detection")]
    description: Arc<dyn Fn() -> String + Sync + Send>,
}

impl EventDescription {
    #[inline(always)]
    pub fn new<InnerFn>(#[allow(unused_variables)] description: impl FnOnce() -> InnerFn) -> Self
    where
        InnerFn: Fn() -> String + Sync + Send + 'static,
    {
        Self {
            #[cfg(feature = "hanging_detection")]
            description: Arc::new((description)()),
        }
    }
}

impl Display for EventDescription {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        #[cfg(not(feature = "hanging_detection"))]
        return write!(f, "");

        #[cfg(feature = "hanging_detection")]
        return write!(f, "{}", (self.description)());
    }
}

impl EventDescriptor for EventDescription {
    #[cfg(feature = "hanging_detection")]
    fn get_description(self) -> Arc<dyn Fn() -> String + Sync + Send> {
        self.description
    }
}

pub struct Event {
    #[cfg(feature = "hanging_detection")]
    description: Arc<dyn Fn() -> String + Sync + Send>,
    event: event_listener::Event,
}

impl Event {
    /// See [`event_listener::Event::new`]. May attach a description that may optionally be read
    /// later.
    ///
    /// This confusingly takes a closure ([`FnOnce`]) that returns a nested closure ([`Fn`]).
    ///
    /// When `hanging_detection` is disabled, `description` is never called.
    ///
    /// When `hanging_detection` is enabled, the outer closure is called immediately. The outer
    /// closure can have an ephemeral lifetime. The inner closure must be `'static`, but is called
    /// only when the `description` is actually read.
    ///
    /// The outer closure allows avoiding extra lookups (e.g. task type info) that may be needed to
    /// capture information needed for constructing (moving into) the inner closure.
    #[inline(always)]
    pub fn new(#[allow(unused_variables)] description: impl EventDescriptor) -> Self {
        #[cfg(not(feature = "hanging_detection"))]
        return Self {
            event: event_listener::Event::new(),
        };
        #[cfg(feature = "hanging_detection")]
        return Self {
            description: description.get_description(),
            event: event_listener::Event::new(),
        };
    }

    /// See [`event_listener::Event::listen`].
    pub fn listen(&self) -> EventListener {
        #[cfg(not(feature = "hanging_detection"))]
        return EventListener {
            listener: self.event.listen(),
        };
        #[cfg(feature = "hanging_detection")]
        return EventListener {
            description: self.description.clone(),
            note: Arc::new(String::new),
            future: Some(Box::pin(timeout(
                Duration::from_secs(30),
                self.event.listen(),
            ))),
            duration: Duration::from_secs(30),
        };
    }

    /// See [`event_listener::Event::listen`]. May attach a note that may optionally be read later.
    ///
    /// This confusingly takes a closure ([`FnOnce`]) that returns a nested closure ([`Fn`]).
    ///
    /// When `hanging_detection` is disabled, `note` is never called.
    ///
    /// When `hanging_detection` is enabled, the outer closure is called immediately. The outer
    /// closure can have an ephemeral lifetime. The inner closer must be `'static`, but is called
    /// only when the `note` is actually read.
    ///
    /// The outer closure allow avoiding extra lookups (e.g. task type info) that may be needed to
    /// capture information needed for constructing (moving into) the inner closure.
    pub fn listen_with_note(&self, _note: impl EventDescriptor) -> EventListener {
        #[cfg(not(feature = "hanging_detection"))]
        return EventListener {
            listener: self.event.listen(),
        };
        #[cfg(feature = "hanging_detection")]
        return EventListener {
            description: self.description.clone(),
            note: _note.get_description(),
            future: Some(Box::pin(timeout(
                Duration::from_secs(30),
                self.event.listen(),
            ))),
            duration: Duration::from_secs(30),
        };
    }

    /// pulls out the event listener, leaving a new, empty event in its place.
    pub fn take(&mut self) -> Event {
        #[cfg(not(feature = "hanging_detection"))]
        return Self {
            event: replace(&mut self.event, event_listener::Event::new()),
        };
        #[cfg(feature = "hanging_detection")]
        return Self {
            description: self.description.clone(),
            event: replace(&mut self.event, event_listener::Event::new()),
        };
    }
}

impl Event {
    /// see [`event_listener::Event::notify`]
    pub fn notify(&self, n: usize) {
        self.event.notify(n);
    }
}

impl Debug for Event {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let mut t = f.debug_tuple("Event");
        #[cfg(feature = "hanging_detection")]
        t.field(&(self.description)());
        t.finish()
    }
}

#[cfg(not(feature = "hanging_detection"))]
pub struct EventListener {
    listener: event_listener::EventListener,
}

#[cfg(not(feature = "hanging_detection"))]
impl Debug for EventListener {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("EventListener").finish()
    }
}

#[cfg(not(feature = "hanging_detection"))]
impl Future for EventListener {
    type Output = ();

    fn poll(
        self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        let listener = unsafe { self.map_unchecked_mut(|s| &mut s.listener) };
        listener.poll(cx)
    }
}

#[cfg(not(feature = "hanging_detection"))]
impl EventListener {
    /// Blocks the current thread until the event is notified.
    ///
    /// This is the synchronous equivalent of `.await`-ing the `EventListener`.
    /// Only valid in synchronous contexts (e.g. backend operations).
    pub fn wait(self) {
        block_on_listener(self.listener);
    }
}

#[cfg(feature = "hanging_detection")]
pub struct EventListener {
    description: Arc<dyn Fn() -> String + Sync + Send>,
    note: Arc<dyn Fn() -> String + Sync + Send>,
    // Timeout need to stay pinned while polling and also while it's dropped.
    // So it's important to put it into a pinned Box to be able to take it out of the Option.
    future: Option<std::pin::Pin<Box<Timeout<event_listener::EventListener>>>>,
    duration: Duration,
}

#[cfg(feature = "hanging_detection")]
impl Debug for EventListener {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let mut t = f.debug_tuple("EventListener");
        t.field(&(self.description)());
        let note = (self.note)();
        if !note.is_empty() {
            t.field(&note);
        }
        t.finish()
    }
}

#[cfg(feature = "hanging_detection")]
impl Future for EventListener {
    type Output = ();

    fn poll(
        mut self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        while let Some(future) = self.future.as_mut() {
            match ready!(future.as_mut().poll(cx)) {
                Ok(_) => {
                    self.future = None;
                    return Poll::Ready(());
                }
                Err(_) => {
                    let note = (self.note)();
                    let description = (self.description)();
                    if note.is_empty() {
                        eprintln!(
                            "EventListener({}) is potentially hanging, waiting for {}s",
                            description,
                            self.duration.as_secs(),
                        );
                    } else {
                        eprintln!(
                            "EventListener({}) is potentially hanging, waiting for {}s from {}",
                            description,
                            self.duration.as_secs(),
                            note
                        );
                    }
                    self.duration *= 2;
                    // SAFETY: Taking from Option is safe because the value is inside of a pinned
                    // Box. Pinning must continue until dropped.
                    let future = self.future.take().unwrap();
                    self.future = Some(Box::pin(timeout(
                        self.duration,
                        // SAFETY: We can move the inner future since it's an EventListener and
                        // that is Unpin.
                        unsafe { std::pin::Pin::into_inner_unchecked(future) }.into_inner(),
                    )));
                }
            }
        }
        // EventListener was awaited again after completion
        Poll::Ready(())
    }
}

#[cfg(feature = "hanging_detection")]
impl EventListener {
    /// Blocks the current thread until the event is notified.
    ///
    /// Note: In `hanging_detection` builds, timeout warnings are not emitted
    /// for sync waits (only for async `.await` usage).
    pub fn wait(mut self) {
        if let Some(future) = self.future.take() {
            // SAFETY: EventListener is Unpin, so it's safe to move out of the Pin.
            block_on_listener(unsafe { std::pin::Pin::into_inner_unchecked(future) }.into_inner());
        }
    }
}

#[cfg(all(test, not(feature = "hanging_detection")))]
mod tests {
    use std::{
        hint::black_box,
        sync::{
            Arc,
            atomic::{AtomicBool, Ordering},
        },
        time::Instant,
    };

    use tokio::time::{Duration, timeout};

    use super::*;

    // The closures used for descriptions/notes should be eliminated. This may only happen at higher
    // optimization levels (that would be okay), but in practice it seems to work even for
    // opt-level=0.
    #[tokio::test]
    async fn ensure_dead_code_elimination() {
        fn dead_fn() {
            // This code triggers a build error when it's not removed.
            unsafe {
                unsafe extern "C" {
                    fn trigger_link_error() -> !;
                }
                trigger_link_error();
            }
        }

        let event = black_box(Event::new(|| {
            dead_fn();
            || {
                dead_fn();
                String::new()
            }
        }));
        let listener = black_box(event.listen_with_note(|| {
            dead_fn();
            || {
                dead_fn();
                String::new()
            }
        }));

        let _ = black_box(timeout(Duration::from_millis(10), listener)).await;
    }

    /// `EventListener::wait` has to actually block until another thread notifies the event.
    ///
    /// The notification is sent only after a delay, so the waiter is registered and parked first —
    /// this exercises the parking path rather than the already-notified fast path. The assertions
    /// are written so that a `wait()` which returned early (or did nothing at all) fails rather
    /// than silently passing, and a `wait()` which never woke up would hang the test.
    #[test]
    fn wait_blocks_until_notified_by_another_thread() {
        const DELAY: Duration = Duration::from_millis(300);
        // Allow for timer granularity: assert on a slightly shorter span than we sleep for.
        const MIN_BLOCKED: Duration = Duration::from_millis(200);

        let event = Arc::new(Event::new(|| || "test event".to_string()));
        let listener = event.listen();

        let notified = Arc::new(AtomicBool::new(false));
        let notifier = {
            let event = event.clone();
            let notified = notified.clone();
            std::thread::spawn(move || {
                std::thread::sleep(DELAY);
                notified.store(true, Ordering::SeqCst);
                event.notify(1);
            })
        };

        let start = Instant::now();
        listener.wait();
        let blocked_for = start.elapsed();

        assert!(
            notified.load(Ordering::SeqCst),
            "wait() returned before the notifying thread ran"
        );
        assert!(
            blocked_for >= MIN_BLOCKED,
            "wait() did not block; it returned after {blocked_for:?}"
        );

        notifier.join().unwrap();
    }
}
