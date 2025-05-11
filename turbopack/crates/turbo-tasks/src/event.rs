#[cfg(feature = "hanging_detection")]
use std::sync::Arc;
#[cfg(feature = "hanging_detection")]
use std::task::ready;
#[cfg(feature = "hanging_detection")]
use std::task::Poll;
#[cfg(feature = "hanging_detection")]
use std::time::Duration;
use std::{
    fmt::{Debug, Formatter},
    future::Future,
    mem::replace,
    pin::Pin,
};

#[cfg(feature = "hanging_detection")]
use tokio::time::timeout;
#[cfg(feature = "hanging_detection")]
use tokio::time::Timeout;

pub struct Event {
    #[cfg(feature = "hanging_detection")]
    description: Arc<dyn Fn() -> String + Sync + Send>,
    event: event_listener::Event,
}

#[cfg(not(feature = "hanging_detection"))]
impl Event {
    /// see [event_listener::Event]::new
    #[inline(always)]
    pub fn new(_description: impl Fn() -> String + Sync + Send + 'static) -> Self {
        Self {
            event: event_listener::Event::new(),
        }
    }

    /// see [event_listener::Event]::listen
    pub fn listen(&self) -> EventListener {
        EventListener {
            listener: self.event.listen(),
        }
    }

    /// see [event_listener::Event]::listen
    pub fn listen_with_note(
        &self,
        _note: impl Fn() -> String + Sync + Send + 'static,
    ) -> EventListener {
        EventListener {
            listener: self.event.listen(),
        }
    }

    /// pulls out the event listener, leaving a new, empty event in its place.
    pub fn take(&mut self) -> Self {
        Self {
            event: replace(&mut self.event, event_listener::Event::new()),
        }
    }
}

#[cfg(feature = "hanging_detection")]
impl Event {
    /// see [event_listener::Event]::new
    #[inline(always)]
    pub fn new(description: impl Fn() -> String + Sync + Send + 'static) -> Self {
        Self {
            description: Arc::new(description),
            event: event_listener::Event::new(),
        }
    }

    /// see [event_listener::Event]::listen
    pub fn listen(&self) -> EventListener {
        EventListener {
            description: self.description.clone(),
            note: Arc::new(|| String::new()),
            future: Some(Box::pin(timeout(
                Duration::from_secs(10),
                self.event.listen(),
            ))),
            duration: Duration::from_secs(10),
        }
    }

    /// see [event_listener::Event]::listen
    pub fn listen_with_note(
        &self,
        note: impl Fn() -> String + Sync + Send + 'static,
    ) -> EventListener {
        EventListener {
            description: self.description.clone(),
            note: Arc::new(note),
            future: Some(Box::pin(timeout(
                Duration::from_secs(10),
                self.event.listen(),
            ))),
            duration: Duration::from_secs(10),
        }
    }

    /// pulls out the event listener, leaving a new, empty event in its place.
    pub fn take(&mut self) -> Event {
        Self {
            description: self.description.clone(),
            event: replace(&mut self.event, event_listener::Event::new()),
        }
    }
}

impl Event {
    /// see [event_listener::Event]::notify
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
                    use crate::util::FormatDuration;
                    eprintln!(
                        "{:?} is potentially hanging (waiting for {})",
                        self,
                        FormatDuration(self.duration)
                    );
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
