use std::{any::Any, collections::VecDeque, fmt::Display, sync::Arc, time::Duration};

use dashmap::DashMap;
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
            // Store the message in history
            let mut history = event_history.lock().await;
            if history.len() >= MAX_QUEUE_SIZE {
                history.pop_front();
            }
            history.push_back(message_clone.clone());

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
            let mut all_channel = subscribers.get_mut(&EventChannelType::Global).unwrap();
            let mut removal_indices = Vec::new();
            for (ix, sender) in all_channel.iter_mut().enumerate() {
                if sender.send(message_clone.clone()).await.is_err() {
                    removal_indices.push(ix);
                }
            }

            for ix in removal_indices.iter().rev() {
                all_channel.remove(*ix);
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
            // Store the sender
            if let Some(event_types) = event_types {
                for event_type in event_types.iter() {
                    let mut type_subscribers = subscribers
                        .entry(EventChannelType::Type(event_type.clone()))
                        .or_default();
                    type_subscribers.push(tx_clone.clone());
                }

                for event in event_history.lock().await.iter() {
                    if event_types.contains(&event.type_name().to_string()) {
                        let _ = tx_clone.send(event.clone()).await;
                    }
                }
            } else {
                let mut global_subscribers =
                    subscribers.entry(EventChannelType::Global).or_default();
                global_subscribers.push(tx_clone.clone());

                for event in event_history.lock().await.iter() {
                    let _ = tx_clone.send(event.clone()).await;
                }
            }
        });

        rx
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Hash, serde::Serialize, serde::Deserialize)]
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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
/// Compilation event that is used to log the duration of a task
pub struct TimingEvent {
    /// Message of the event without the timing information
    ///
    /// Example:
    /// ```rust
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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
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

#[cfg(test)]
mod tests {
    use super::*;

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
