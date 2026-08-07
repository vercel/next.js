use std::{any::Any, collections::VecDeque, fmt::Display, sync::Arc, time::Duration};

use dashmap::DashMap;
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

pub struct CompilationEventQueue {
    event_history: ArcMx<VecDeque<Arc<dyn CompilationEvent>>>,
    subscribers: Arc<DashMap<EventChannelType, Vec<CompilationEventChannel>>>,
}

impl Default for CompilationEventQueue {
    fn default() -> Self {
        let subscribers = DashMap::new();
        subscribers.insert(
            EventChannelType::Global,
            Vec::<CompilationEventChannel>::new(),
        );

        Self {
            event_history: Arc::new(Mutex::new(VecDeque::with_capacity(MAX_QUEUE_SIZE))),
            subscribers: Arc::new(subscribers),
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

        // Spawn a task to handle the async operations
        tokio::spawn(async move {
            // Append to history AND snapshot the channel lists atomically
            // (under the history lock): this is the single serialization
            // point that keeps subscribe-boundary events exactly-once — an
            // event is either in a subscriber's history snapshot xor in its
            // delivery snapshot, never both. The DashMap operations are
            // synchronous (no await), so this can't deadlock: no lock is ever
            // held across an await.
            let type_key = EventChannelType::Type(message_clone.type_name().to_owned());
            let type_channels: Vec<CompilationEventChannel>;
            let global_channels: Vec<CompilationEventChannel>;
            {
                let mut history = event_history.lock().await;
                if history.len() >= MAX_QUEUE_SIZE {
                    history.pop_front();
                }
                history.push_back(message_clone.clone());
                type_channels = subscribers
                    .get(&type_key)
                    .map(|v| v.clone())
                    .unwrap_or_default();
                global_channels = subscribers
                    .get(&EventChannelType::Global)
                    .map(|v| v.clone())
                    .unwrap_or_default();
            }

            // Deliver to all subscribers concurrently: awaiting a full (but
            // alive) typed channel must not stall or reorder delivery to
            // global subscribers of the same event.
            let failed: Vec<CompilationEventChannel> =
                futures::future::join_all(type_channels.iter().chain(global_channels.iter()).map(
                    |sender| {
                        let message = message_clone.clone();
                        async move {
                            if sender.send(message).await.is_err() {
                                Some(sender.clone())
                            } else {
                                None
                            }
                        }
                    },
                ))
                .await
                .into_iter()
                .flatten()
                .collect();

            // Remove failed subscribers under freshly taken guards, matching
            // by channel identity so concurrently added subscribers are kept.
            if !failed.is_empty() {
                if let Some(mut subs) = subscribers.get_mut(&type_key) {
                    subs.retain(|s| !failed.iter().any(|f| f.same_channel(s)));
                }
                if let Some(mut subs) = subscribers.get_mut(&EventChannelType::Global) {
                    subs.retain(|s| !failed.iter().any(|f| f.same_channel(s)));
                }
            }
        });

        Ok(())
    }

    pub fn subscribe(
        &self,
        event_types: Option<Vec<String>>,
    ) -> mpsc::Receiver<Arc<dyn CompilationEvent>> {
        let (tx, rx) = mpsc::channel(MAX_QUEUE_SIZE);
        let subscribers = self.subscribers.clone();
        let event_history = self.event_history.clone();
        let tx_clone = tx.clone();

        // Spawn a task to handle the async operations
        tokio::spawn(async move {
            // Register the sender AND snapshot the history atomically (under
            // the history lock): an event is either in the snapshot (replayed
            // below) xor in some send's delivery snapshot (delivered live),
            // never both. The entry() guard is dropped synchronously — no
            // lock is ever held across an await.
            // Register the sender AND replay the history inside the history
            // lock. The replay uses try_send: the fresh channel's capacity
            // (MAX_QUEUE_SIZE) is >= the history's capacity (also
            // MAX_QUEUE_SIZE), so it can never block. Everything is
            // synchronous while the lock is held — a later send's history
            // append can't interleave — so subscribers see replayed history
            // strictly before any live event, and every boundary event is
            // delivered exactly once (see the send() side).
            if let Some(event_types) = event_types {
                let history_guard = event_history.lock().await;
                for event_type in event_types.iter() {
                    subscribers
                        .entry(EventChannelType::Type(event_type.clone()))
                        .or_default()
                        .push(tx_clone.clone());
                }
                for event in history_guard.iter() {
                    if event_types.contains(&event.type_name().to_string()) {
                        let _ = tx_clone.try_send(event.clone());
                    }
                }
            } else {
                let history_guard = event_history.lock().await;
                subscribers
                    .entry(EventChannelType::Global)
                    .or_default()
                    .push(tx_clone.clone());
                for event in history_guard.iter() {
                    let _ = tx_clone.try_send(event.clone());
                }
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
    use super::*;

    /// Drives concurrent send + subscribe traffic and asserts everything
    /// completes — the previous implementation held the history lock and
    /// DashMap shard guards across awaits in opposite lock orders (ABBA),
    /// which could deadlock the runtime.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_concurrent_send_and_subscribe_no_deadlock() {
        for round in 0..50 {
            let queue = CompilationEventQueue::default();

            // Pre-fill history so subscribe(None) replays.
            for i in 0..5 {
                queue
                    .send(Arc::new(DiagnosticEvent::new(
                        Severity::Info,
                        format!("seed {i}"),
                    )))
                    .unwrap();
            }

            let mut rx = queue.subscribe(None);
            queue
                .send(Arc::new(DiagnosticEvent::new(
                    Severity::Info,
                    "post".to_string(),
                )))
                .unwrap();

            // Collect the replayed + live events with a deadline.
            let count = tokio::time::timeout(Duration::from_secs(10), async {
                let mut count = 0;
                while count < 6 {
                    match rx.recv().await {
                        Some(_) => count += 1,
                        None => break,
                    }
                }
                count
            })
            .await
            .unwrap_or_else(|_| panic!("round {round}: timed out (deadlock?)"));

            assert_eq!(count, 6, "round {round}: expected 5 replayed + 1 live");

            // And nothing else: an event crossing the subscribe boundary must
            // be delivered exactly once (not replayed AND delivered live).
            let extra = tokio::time::timeout(Duration::from_millis(100), rx.recv()).await;
            assert!(
                matches!(extra, Err(_) | Ok(None)),
                "round {round}: unexpected duplicate event"
            );
        }
    }

    /// A subscriber whose receiver is dropped must be removed from the
    /// subscriber list; live subscribers must be kept.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_dead_subscriber_removed_and_live_kept() {
        let queue = CompilationEventQueue::default();

        let mut rx_live = queue.subscribe(None);
        let rx_dead = queue.subscribe(None);
        drop(rx_dead);

        // Let the subscribe tasks register both senders.
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(
            queue
                .subscribers
                .get(&EventChannelType::Global)
                .unwrap()
                .len(),
            2
        );

        // This send delivers to the live one and must remove the dead one.
        queue
            .send(Arc::new(DiagnosticEvent::new(
                Severity::Info,
                "hello".to_string(),
            )))
            .unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;

        assert!(rx_live.try_recv().is_ok());
        assert_eq!(
            queue
                .subscribers
                .get(&EventChannelType::Global)
                .unwrap()
                .len(),
            1
        );

        // A second event must still reach the live receiver — this only
        // succeeds if the removal kept the live sender (identity-matched)
        // rather than removing the wrong one.
        queue
            .send(Arc::new(DiagnosticEvent::new(
                Severity::Info,
                "second".to_string(),
            )))
            .unwrap();
        tokio::time::timeout(Duration::from_secs(5), rx_live.recv())
            .await
            .expect("timed out waiting for the second event")
            .expect("live subscriber was removed");
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
