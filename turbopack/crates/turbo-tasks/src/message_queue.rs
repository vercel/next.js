use std::{
    any::Any,
    collections::VecDeque,
    fmt::Display,
    sync::Arc,
    time::{Duration, SystemTime},
};

use dashmap::DashMap;
use parking_lot::Mutex;
use serde::Serialize;
use tokio::sync::{Mutex as TokioMutex, Notify, mpsc};

pub trait CompilationEvent: Sync + Send + Any {
    fn type_name(&self) -> &'static str;
    fn severity(&self) -> Severity;
    fn message(&self) -> String;
    fn to_json(&self) -> String;
}

const MAX_QUEUE_SIZE: usize = 256;

type ArcMx<T> = Arc<TokioMutex<T>>;
type CompilationEventChannel = mpsc::Sender<Arc<dyn CompilationEvent>>;

#[derive(Debug, Clone, Eq, PartialEq, Hash)]
enum EventChannelType {
    Global,
    Type(String),
}

struct DeliveryStateInner {
    closed: bool,
    pending: usize,
}

struct DeliveryState {
    inner: Mutex<DeliveryStateInner>,
    idle: Notify,
}

pub struct CompilationEventQueue {
    event_history: ArcMx<VecDeque<Arc<dyn CompilationEvent>>>,
    subscribers: Arc<DashMap<EventChannelType, Vec<CompilationEventChannel>>>,
    delivery_state: Arc<DeliveryState>,
}

impl Default for CompilationEventQueue {
    fn default() -> Self {
        let subscribers = DashMap::new();
        subscribers.insert(
            EventChannelType::Global,
            Vec::<CompilationEventChannel>::new(),
        );

        Self {
            event_history: Arc::new(TokioMutex::new(VecDeque::with_capacity(MAX_QUEUE_SIZE))),
            subscribers: Arc::new(subscribers),
            delivery_state: Arc::new(DeliveryState {
                inner: Mutex::new(DeliveryStateInner {
                    closed: false,
                    pending: 0,
                }),
                idle: Notify::new(),
            }),
        }
    }
}

impl CompilationEventQueue {
    pub fn send(
        &self,
        message: Arc<dyn CompilationEvent>,
    ) -> Result<(), mpsc::error::SendError<Arc<dyn CompilationEvent>>> {
        let event_history = self.event_history.clone();
        let subscribers = self.subscribers.clone();
        let message_clone = message.clone();
        let delivery_state = self.delivery_state.clone();
        let deliver = {
            let mut state = delivery_state.inner.lock();
            if state.closed {
                false
            } else {
                state.pending += 1;
                true
            }
        };

        // Spawn a task to handle the async operations
        tokio::spawn(async move {
            // Store the message in history
            let mut history = event_history.lock().await;
            if history.len() >= MAX_QUEUE_SIZE {
                history.pop_front();
            }
            history.push_back(message_clone.clone());
            drop(history);

            if deliver {
                // Send to all active receivers of the same message type
                if let Some(mut type_subscribers) = subscribers.get_mut(&EventChannelType::Type(
                    message_clone.type_name().to_owned(),
                )) {
                    let mut removal_indices = Vec::new();
                    for (ix, sender) in type_subscribers.iter().enumerate() {
                        if sender.send(message_clone.clone()).await.is_err() {
                            removal_indices.push(ix);
                        }
                    }

                    for ix in removal_indices.iter().rev() {
                        type_subscribers.remove(*ix);
                    }
                }

                // Send to all global message subscribers
                if let Some(mut all_channel) = subscribers.get_mut(&EventChannelType::Global) {
                    let mut removal_indices = Vec::new();
                    for (ix, sender) in all_channel.iter_mut().enumerate() {
                        if sender.send(message_clone.clone()).await.is_err() {
                            removal_indices.push(ix);
                        }
                    }

                    for ix in removal_indices.iter().rev() {
                        all_channel.remove(*ix);
                    }
                }
            }

            if deliver {
                let mut state = delivery_state.inner.lock();
                state.pending -= 1;
                if state.pending == 0 {
                    delivery_state.idle.notify_one();
                }
            }
        });

        Ok(())
    }

    /// Waits until all events sent so far have been delivered to subscribers, then closes all
    /// subscriber channels. Subscriptions drain their remaining events and then end. Events sent
    /// afterwards are only recorded in the history, and new subscriptions close after replaying
    /// it.
    pub async fn flush_and_close(&self) {
        loop {
            let idle = self.delivery_state.idle.notified();
            {
                let mut state = self.delivery_state.inner.lock();
                state.closed = true;
                if state.pending == 0 {
                    break;
                }
            }
            idle.await;
        }
        // Dropping the senders closes the subscriber channels once they are drained.
        self.subscribers.clear();
    }

    pub fn subscribe(
        &self,
        event_types: Option<Vec<String>>,
    ) -> mpsc::Receiver<Arc<dyn CompilationEvent>> {
        let (tx, rx) = mpsc::channel(MAX_QUEUE_SIZE);
        let subscribers = self.subscribers.clone();
        let event_history = self.event_history.clone();
        let delivery_state = self.delivery_state.clone();
        let tx_clone = tx.clone();

        // Spawn a task to handle the async operations
        tokio::spawn(async move {
            // Store the sender (unless the queue was closed)
            if let Some(event_types) = event_types {
                if !delivery_state.inner.lock().closed {
                    for event_type in event_types.iter() {
                        let mut type_subscribers = subscribers
                            .entry(EventChannelType::Type(event_type.clone()))
                            .or_default();
                        type_subscribers.push(tx_clone.clone());
                    }
                }

                for event in event_history.lock().await.iter() {
                    if event_types.contains(&event.type_name().to_string()) {
                        let _ = tx_clone.send(event.clone()).await;
                    }
                }
            } else {
                if !delivery_state.inner.lock().closed {
                    let mut global_subscribers =
                        subscribers.entry(EventChannelType::Global).or_default();
                    global_subscribers.push(tx_clone.clone());
                }

                for event in event_history.lock().await.iter() {
                    let _ = tx_clone.send(event.clone()).await;
                }
            }
            // If the queue was closed, tx_clone was never stored and is dropped here, closing
            // the receiver after the history replay.
            if delivery_state.inner.lock().closed {
                // The queue was closed while subscribing: make sure no sender stored above
                // lingers (flush_and_close may have cleared the map before we inserted).
                subscribers.clear();
            }
        });

        rx
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Hash, Serialize)]
pub enum Severity {
    Info,
    Trace,
    Warning,
    Error,
    Fatal,
    Event,
}

impl Display for Severity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Severity::Info => write!(f, "INFO"),
            Severity::Trace => write!(f, "TRACE"),
            Severity::Warning => write!(f, "WARNING"),
            Severity::Error => write!(f, "ERROR"),
            Severity::Fatal => write!(f, "FATAL"),
            Severity::Event => write!(f, "EVENT"),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
/// Compilation event that is used to log the duration of a task
pub struct TimingEvent {
    /// Message of the event without the timing information
    ///
    /// Example:
    /// ```rust
    /// use std::time::Duration;
    /// use turbo_tasks::message_queue::{CompilationEvent, TimingEvent};
    ///
    /// let event = TimingEvent::new("Compiled successfully".to_string(), Duration::from_millis(100));
    /// let message = event.message();
    /// assert_eq!(message, "Compiled successfully in 100ms");
    /// ```
    pub message: String,
    /// Duration in milliseconds
    pub duration: Duration,
}

impl TimingEvent {
    pub fn new(message: String, duration: Duration) -> Self {
        Self { message, duration }
    }
}

impl CompilationEvent for TimingEvent {
    fn type_name(&self) -> &'static str {
        "TimingEvent"
    }

    fn severity(&self) -> Severity {
        Severity::Event
    }

    fn message(&self) -> String {
        let duration_secs = self.duration.as_secs_f64();
        let duration_string = if duration_secs > 120.0 {
            format!("{:.1}min", duration_secs / 60.0)
        } else if duration_secs > 40.0 {
            format!("{duration_secs:.0}s")
        } else if duration_secs > 2.0 {
            format!("{duration_secs:.1}s")
        } else {
            format!("{:.0}ms", duration_secs * 1000.0)
        };
        format!("{} in {}", self.message, duration_string)
    }

    fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap()
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DiagnosticEvent {
    pub message: String,
    pub severity: Severity,
}

impl DiagnosticEvent {
    pub fn new(severity: Severity, message: String) -> Self {
        Self { message, severity }
    }
}

impl CompilationEvent for DiagnosticEvent {
    fn type_name(&self) -> &'static str {
        "DiagnosticEvent"
    }

    fn severity(&self) -> Severity {
        self.severity
    }

    fn message(&self) -> String {
        self.message.clone()
    }

    fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap()
    }
}

/// A generic trace event that carries a name, wall-clock timing, and arbitrary attributes.
/// Forwarded as a `CompilationEvent` to the JS side for inclusion in `.next/trace`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceEvent {
    pub name: &'static str,
    pub start_time_ms: f64,
    pub end_time_ms: f64,
    /// Should be an array of key value pairs
    pub attributes: serde_json::Value,
}

impl TraceEvent {
    pub fn new(
        name: &'static str,
        start_time_ms: f64,
        end_time_ms: f64,
        attributes: serde_json::Value,
    ) -> Self {
        // basic sanity test
        debug_assert!(matches!(attributes, serde_json::Value::Array(_)));
        Self {
            name,
            start_time_ms,
            end_time_ms,
            attributes,
        }
    }

    /// Creates a `TraceEvent` that started at `wall_start` (wall clock) and ran for `duration`.
    ///
    /// Prefer passing a duration measured with a monotonic clock (e.g.
    /// [`std::time::Instant::elapsed`]) over computing it from two [`SystemTime`]s, so that
    /// wall-clock adjustments don't skew (or negate) the span's duration.
    pub fn new_with_duration(
        name: &'static str,
        wall_start: SystemTime,
        duration: Duration,
        attributes: serde_json::Value,
    ) -> Self {
        let start_time_ms = wall_start
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            // as_millis_f64 is not stable yet
            .as_secs_f64()
            * 1000.0;
        Self::new(
            name,
            start_time_ms,
            start_time_ms + duration.as_secs_f64() * 1000.0,
            attributes,
        )
    }
}

impl CompilationEvent for TraceEvent {
    fn type_name(&self) -> &'static str {
        "TraceEvent"
    }

    fn severity(&self) -> Severity {
        Severity::Event
    }

    fn message(&self) -> String {
        let duration_ms = self.end_time_ms - self.start_time_ms;
        format!("{} in {:.0}ms", self.name, duration_ms)
    }

    fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_flush_and_close() {
        let queue = CompilationEventQueue::default();
        let mut rx = queue.subscribe(None);
        // Wait until the subscription is registered so delivery is deterministic.
        while queue
            .subscribers
            .get(&EventChannelType::Global)
            .unwrap()
            .is_empty()
        {
            tokio::task::yield_now().await;
        }

        queue
            .send(Arc::new(TimingEvent::new(
                "test".to_string(),
                Duration::from_millis(1),
            )))
            .unwrap();
        queue.flush_and_close().await;

        // The event is delivered before the channel closes.
        let event = rx.recv().await.unwrap();
        assert_eq!(event.message(), "test in 1ms");
        assert!(rx.recv().await.is_none());

        // Subscribing after close replays the history and closes immediately.
        let mut rx2 = queue.subscribe(None);
        let event = rx2.recv().await.unwrap();
        assert_eq!(event.message(), "test in 1ms");
        assert!(rx2.recv().await.is_none());
    }

    #[test]
    fn test_trace_event_new_with_duration() {
        let start = SystemTime::UNIX_EPOCH + Duration::from_secs(10);
        let event = TraceEvent::new_with_duration(
            "test",
            start,
            Duration::from_millis(1500),
            serde_json::json!([]),
        );
        assert_eq!(event.name, "test");
        assert_eq!(event.start_time_ms, 10_000.0);
        assert_eq!(event.end_time_ms, 11_500.0);
    }

    #[test]
    fn test_timing_event_string_formatting() {
        let tests = vec![
            (Duration::from_nanos(1588), "0ms"),
            (Duration::from_nanos(1022616), "1ms"),
            (Duration::from_millis(100), "100ms"),
            (Duration::from_millis(1000), "1000ms"),
            (Duration::from_millis(10000), "10.0s"),
            (Duration::from_millis(20381), "20.4s"),
            (Duration::from_secs(60), "60s"),
            (Duration::from_secs(100), "100s"),
            (Duration::from_secs(125), "2.1min"),
        ];

        for (duration, expected) in tests {
            let event = TimingEvent::new("Compiled successfully".to_string(), duration);
            assert_eq!(
                event.message(),
                format!("Compiled successfully in {expected}")
            );
        }
    }
}
