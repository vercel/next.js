use std::{
    any::Any,
    collections::{HashMap, VecDeque},
    fmt::Display,
    sync::Arc,
    time::Duration,
};

use serde::Serialize;
use tokio::sync::{Mutex, mpsc};

pub trait CompilationEvent: Sync + Send + Any {
    fn type_name(&self) -> &'static str;
    fn severity(&self) -> Severity;
    fn message(&self) -> String;
    fn to_json(&self) -> String;
}

const MAX_QUEUE_SIZE: usize = 256;

type ArcMx<T> = Arc<Mutex<T>>;
type CompilationEventChannel = mpsc::Sender<Arc<dyn CompilationEvent>>;

#[derive(Debug, Clone, Eq, PartialEq, Hash)]
enum EventChannelType {
    Global,
    Type(String),
}

/// State guarded by a single mutex so that pushing an event to history and
/// registering a subscriber observe a consistent order.
///
/// The dedup between live delivery and history replay hinges on `send` and
/// `subscribe` mutating this state under the *same* lock, and on *where* an
/// event lives at that moment:
/// - `send` locks, pushes the event to `history`, and snapshots the current `subscribers` in one
///   critical section, then delivers live after unlocking.
/// - `subscribe` locks, registers its channel in `subscribers`, and snapshots the current `history`
///   to replay in one critical section, then replays after unlocking.
///
/// Therefore, for any event and any subscriber, exactly one of these holds:
/// - the event was pushed **before** the subscriber registered — it is in the subscriber's history
///   snapshot (replayed) but not in `send`'s subscriber snapshot (not delivered live), or
/// - the event was pushed **after** — it is in `send`'s subscriber snapshot (delivered live) but
///   not in the subscriber's history snapshot (not replayed).
struct QueueState {
    /// Bounded ring buffer of recently-sent events, oldest first.
    history: VecDeque<Arc<dyn CompilationEvent>>,
    /// Active subscriber channels, keyed by the channel type they registered on.
    subscribers: HashMap<EventChannelType, Vec<CompilationEventChannel>>,
}

pub struct CompilationEventQueue {
    state: ArcMx<QueueState>,
}

impl Default for CompilationEventQueue {
    fn default() -> Self {
        Self {
            state: Arc::new(Mutex::new(QueueState {
                history: VecDeque::with_capacity(MAX_QUEUE_SIZE),
                // Subscriber lists are created lazily via `entry().or_default()`
                // when the first subscriber for a channel type registers.
                subscribers: HashMap::new(),
            })),
        }
    }
}

impl CompilationEventQueue {
    /// Broadcast an event to all matching subscribers and record it in history
    /// for future subscribers to replay.
    ///
    /// Delivery is **exactly once** per matching subscriber (a subscriber never
    /// sees an event both live and via replay — see [`QueueState`]), but the
    /// order in which events reach a subscriber is **not** guaranteed. Events will tend to be
    /// delivered in arrival order but it is not guaranteed.  If needed we could enhance this to
    /// guarantee order but this is not a current requirement.
    pub fn send(
        &self,
        message: Arc<dyn CompilationEvent>,
    ) -> Result<(), mpsc::error::SendError<Arc<dyn CompilationEvent>>> {
        let state = self.state.clone();

        // Spawn a task to handle the async operations
        tokio::spawn(async move {
            // Under the lock: record the event in history and snapshot the set
            // of subscribers that should receive it live. Doing the push and the
            // subscriber snapshot in one critical section is what makes replay
            // and live delivery mutually exclusive per subscriber (see
            // `QueueState`). A subscriber that registers after this section
            // captured its snapshot will instead see this event via history
            // replay (the event is already in history when it snapshots); one
            // that registered before is in this snapshot and receives it live.
            let recipients = {
                let mut state = state.lock().await;

                if state.history.len() >= MAX_QUEUE_SIZE {
                    state.history.pop_front();
                }
                state.history.push_back(message.clone());

                // Clone the matching senders so we can `await` on delivery
                // without holding the lock. Both the subscribers registered for
                // this event's type and the global (unfiltered) subscribers
                // receive it.
                let mut recipients = Vec::new();
                if let Some(type_subscribers) = state
                    .subscribers
                    .get(&EventChannelType::Type(message.type_name().to_owned()))
                {
                    recipients.extend(type_subscribers.iter().cloned());
                }
                if let Some(global) = state.subscribers.get(&EventChannelType::Global) {
                    recipients.extend(global.iter().cloned());
                }
                recipients
            };

            // Deliver live without holding the lock.
            let mut closed = false;
            for sender in recipients {
                if sender.send(message.clone()).await.is_err() {
                    closed = true;
                }
            }

            // If any receiver was gone, prune closed channels so they don't
            // accumulate over a long session. Done under the lock, after
            // delivery, so it never races registration.
            if closed {
                let mut state = state.lock().await;
                state
                    .subscribers
                    .values_mut()
                    .for_each(|senders| senders.retain(|s| !s.is_closed()));
            }
        });

        Ok(())
    }

    pub fn subscribe(
        &self,
        event_types: Option<Vec<String>>,
    ) -> mpsc::Receiver<Arc<dyn CompilationEvent>> {
        let (tx, rx) = mpsc::channel(MAX_QUEUE_SIZE);
        let state = self.state.clone();
        let tx_clone = tx.clone();

        // Spawn a task to handle the async operations
        tokio::spawn(async move {
            // Under the lock: register this subscriber and, in the same critical
            // section, snapshot the history it must replay. Because `send` pushes
            // to history and snapshots subscribers under this same lock, an event
            // is in this history snapshot iff it is *not* in the subscriber
            // snapshot `send` will use for it — so every event reaches this
            // subscriber exactly once (via replay or live, never both or
            // neither). See `QueueState`.
            let replay = {
                let mut state = state.lock().await;

                if let Some(event_types) = &event_types {
                    for event_type in event_types.iter() {
                        state
                            .subscribers
                            .entry(EventChannelType::Type(event_type.clone()))
                            .or_default()
                            .push(tx_clone.clone());
                    }

                    state
                        .history
                        .iter()
                        .filter(|event| event_types.contains(&event.type_name().to_string()))
                        .cloned()
                        .collect::<Vec<_>>()
                } else {
                    state
                        .subscribers
                        .entry(EventChannelType::Global)
                        .or_default()
                        .push(tx_clone.clone());

                    state.history.iter().cloned().collect::<Vec<_>>()
                }
            };

            // Replay history without holding the lock.
            for event in replay {
                let _ = tx_clone.send(event).await;
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
    use std::{collections::HashSet, time::Duration};

    use tokio::{sync::mpsc, time::timeout};

    use super::*;

    /// A minimal event whose `type_name` and payload we control, so tests can
    /// assert on both delivery counts and type-filtering.
    #[derive(Debug)]
    struct TestEvent {
        type_name: &'static str,
        id: u64,
    }

    impl TestEvent {
        fn arc(type_name: &'static str, id: u64) -> Arc<dyn CompilationEvent> {
            Arc::new(TestEvent { type_name, id })
        }
    }

    impl CompilationEvent for TestEvent {
        fn type_name(&self) -> &'static str {
            self.type_name
        }
        fn severity(&self) -> Severity {
            Severity::Event
        }
        fn message(&self) -> String {
            self.id.to_string()
        }
        fn to_json(&self) -> String {
            self.id.to_string()
        }
    }

    /// Drain a receiver until it goes quiet, returning the id of each event in
    /// arrival order. The idle timeout is generous because the queue delivers
    /// from spawned tasks.
    async fn drain(mut rx: mpsc::Receiver<Arc<dyn CompilationEvent>>) -> Vec<u64> {
        let mut out = Vec::new();
        while let Ok(Some(event)) = timeout(Duration::from_millis(200), rx.recv()).await {
            out.push(event.message().parse().unwrap());
        }
        out
    }

    #[tokio::test]
    async fn subscribe_before_send_delivers_each_event_once() {
        let queue = CompilationEventQueue::default();
        let rx = queue.subscribe(Some(vec!["TraceEvent".to_string()]));
        // Let the subscribe task register before sending.
        tokio::task::yield_now().await;

        for id in 0..5 {
            queue.send(TestEvent::arc("TraceEvent", id)).unwrap();
        }

        assert_eq!(drain(rx).await, vec![0, 1, 2, 3, 4]);
    }

    #[tokio::test]
    async fn send_before_subscribe_replays_each_event_once() {
        let queue = CompilationEventQueue::default();
        for id in 0..5 {
            queue.send(TestEvent::arc("TraceEvent", id)).unwrap();
        }
        // Let the send tasks record history before subscribing.
        tokio::task::yield_now().await;

        let rx = queue.subscribe(Some(vec!["TraceEvent".to_string()]));
        assert_eq!(drain(rx).await, vec![0, 1, 2, 3, 4]);
    }

    #[tokio::test]
    async fn subscription_filters_by_event_type() {
        let queue = CompilationEventQueue::default();
        queue.send(TestEvent::arc("TraceEvent", 1)).unwrap();
        queue.send(TestEvent::arc("TimingEvent", 2)).unwrap();
        tokio::task::yield_now().await;

        let rx = queue.subscribe(Some(vec!["TraceEvent".to_string()]));
        queue.send(TestEvent::arc("TraceEvent", 3)).unwrap();
        queue.send(TestEvent::arc("TimingEvent", 4)).unwrap();

        // Only TraceEvents (replayed 1, live 3) — never the TimingEvents.
        assert_eq!(drain(rx).await, vec![1, 3]);
    }

    #[tokio::test]
    async fn global_subscription_receives_all_types() {
        let queue = CompilationEventQueue::default();
        queue.send(TestEvent::arc("TraceEvent", 1)).unwrap();
        tokio::task::yield_now().await;

        let rx = queue.subscribe(None);
        queue.send(TestEvent::arc("TimingEvent", 2)).unwrap();

        assert_eq!(drain(rx).await, vec![1, 2]);
    }

    /// Core regression: no matter how `send` and `subscribe` interleave, a
    /// subscriber must never receive the same event twice (the bug delivered an
    /// event both live and via history replay). This drives the send-during-
    /// subscribe window that produced duplicate `turbopack-persistence` spans.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn concurrent_send_and_subscribe_never_duplicates() {
        for _ in 0..200 {
            let queue = Arc::new(CompilationEventQueue::default());

            // Send a burst concurrently with subscribing, so the subscription's
            // register/replay critical section races the sends' push/deliver.
            let sender = {
                let queue = queue.clone();
                tokio::spawn(async move {
                    for id in 0..MAX_QUEUE_SIZE as u64 {
                        queue.send(TestEvent::arc("TraceEvent", id)).unwrap();
                    }
                })
            };

            let rx = queue.subscribe(Some(vec!["TraceEvent".to_string()]));
            sender.await.unwrap();

            let received = drain(rx).await;
            let unique: HashSet<u64> = received.iter().copied().collect();
            assert_eq!(
                received.len(),
                unique.len(),
                "an event was delivered more than once: {received:?}"
            );
        }
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
