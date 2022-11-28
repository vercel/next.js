use std::{
    fmt::{Debug, Formatter},
    future::Future,
    mem::replace,
    pin::Pin,
};
#[cfg(feature = "hanging_detection")]
use std::{sync::Arc, task::ready, task::Poll, time::Duration};

#[cfg(feature = "hanging_detection")]
use tokio::time::{timeout, Timeout};

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
            future: Some(timeout(Duration::from_secs(10), self.event.listen())),
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
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        unsafe { Pin::new_unchecked(&mut self.get_unchecked_mut().listener) }.poll(cx)
    }
}

#[cfg(feature = "hanging_detection")]
pub struct EventListener {
    description: Arc<dyn Fn() -> String + Sync + Send>,
    future: Option<Timeout<event_listener::EventListener>>,
    duration: Duration,
}

#[cfg(feature = "hanging_detection")]
impl Debug for EventListener {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("EventListener")
            .field(&(self.description)())
            .finish()
    }
}

#[cfg(feature = "hanging_detection")]
impl Future for EventListener {
    type Output = ();

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        let this = unsafe { self.get_unchecked_mut() };
        while let Some(future) = this.future.as_mut() {
            // SAFETY: future is never moved as it's part of the pinned `self`
            match ready!(unsafe { Pin::new_unchecked(future) }.poll(cx)) {
                Ok(_) => {
                    this.future = None;
                    return Poll::Ready(());
                }
                Err(_) => {
                    use crate::util::FormatDuration;
                    eprintln!(
                        "{:?} is potentially hanging (waiting for {})",
                        this,
                        FormatDuration(this.duration)
                    );
                    this.duration *= 2;
                    this.future = Some(timeout(
                        this.duration,
                        this.future.take().unwrap().into_inner(),
                    ));
                }
            }
        }
        // EventListener was awaited again after completion
        Poll::Ready(())
    }
}
