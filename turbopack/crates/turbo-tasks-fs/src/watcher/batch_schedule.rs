use std::{
    sync::{
        Arc,
        mpsc::{Receiver, RecvTimeoutError},
    },
    time::{Duration, Instant},
};

use serde::Serialize;
use turbo_tasks::message_queue::{CompilationEvent, Severity};

use crate::{DiskWatcherConfig, watcher::fs_api::DiskFileSystemWatcherApi};

/// Decides how long a batch of watcher events stays open, and emits a repeated
/// [`FilesystemSettlingEvent`] for as long as it does.
pub struct BatchSchedule {
    settling_event_initial_delay: Duration,
    settling_event_max_delay: Duration,
    pending: Option<PendingBatch>,
}

/// A batch that has at least one event in it and hasn't been flushed yet.
struct PendingBatch {
    started: Instant,
    /// The batch is flushed once this passes without any further events.
    deadline: Instant,
    /// When to emit the next [`FilesystemSettlingEvent`].
    settling_event_next_at: Instant,
    /// Grows exponentially (up to [`BatchSchedule::settling_event_max_delay`]) so that a writer
    /// holding a batch open for minutes doesn't flood the compilation event queue.
    event_interval: Duration,
}

impl BatchSchedule {
    pub fn new(config: &DiskWatcherConfig) -> Self {
        Self {
            settling_event_initial_delay: config.settling_event_initial_delay,
            settling_event_max_delay: config.settling_event_max_delay,
            pending: None,
        }
    }

    /// Keeps the batch open for at least `delay` from now, opening a new batch if there isn't one.
    pub fn extend(&mut self, delay: Duration) {
        let now = Instant::now();
        let deadline = now.checked_add(delay).unwrap_or_else(far_future);
        match &mut self.pending {
            Some(pending) => pending.deadline = pending.deadline.max(deadline),
            None => {
                self.pending = Some(PendingBatch {
                    started: now,
                    deadline,
                    settling_event_next_at: now
                        .checked_add(self.settling_event_initial_delay)
                        .unwrap_or_else(far_future),
                    event_interval: self.settling_event_initial_delay,
                })
            }
        }
    }

    /// Waits for the next watcher event, emitting [`FilesystemSettlingEvent`]s while the pending
    /// batch keeps growing. If no batch is pending, this blocks until an event arrives.
    ///
    /// [`RecvTimeoutError::Timeout`] means the pending batch's deadline has passed *and* nothing
    /// more is queued, so the batch is complete and should be flushed.
    pub fn recv_event<FsApi: DiskFileSystemWatcherApi>(
        &mut self,
        rx: &Receiver<notify::Result<notify::Event>>,
        fs: &FsApi,
    ) -> Result<notify::Result<notify::Event>, RecvTimeoutError> {
        let max_event_delay = self.settling_event_max_delay;
        loop {
            let Some(pending) = &mut self.pending else {
                // no pending batch: wait indefinitely
                return rx.recv().map_err(|_| RecvTimeoutError::Disconnected);
            };

            let now = Instant::now();
            if now >= pending.settling_event_next_at {
                pending.emit_settling_event(fs, now, max_event_delay);
            }

            let timeout = pending
                .deadline
                .min(pending.settling_event_next_at)
                .saturating_duration_since(now);

            match rx.recv_timeout(timeout) {
                Ok(event) => {
                    return Ok(event);
                }
                Err(RecvTimeoutError::Timeout) => {
                    if Instant::now() >= pending.deadline {
                        self.pending = None;
                        return Err(RecvTimeoutError::Timeout);
                    }
                    continue;
                }
                Err(err) => return Err(err),
            }
        }
    }

    /// Closes the pending batch, used when a rescan happens.
    pub fn reset(&mut self) {
        self.pending = None;
    }
}

impl PendingBatch {
    fn emit_settling_event<FsApi: DiskFileSystemWatcherApi>(
        &mut self,
        fs: &FsApi,
        now: Instant,
        max_event_delay: Duration,
    ) {
        let _guard = fs.tokio_handle().enter();
        if let Some(turbo_tasks) = fs.turbo_tasks() {
            turbo_tasks.send_compilation_event(Arc::new(FilesystemSettlingEvent {
                elapsed_secs: (now - self.started).as_secs(),
            }));
        }
        self.event_interval = self.event_interval.saturating_mul(2).min(max_event_delay);
        // Schedule from "now" instead of accumulating intervals, so that emitting late (e.g. under
        // heavy load) doesn't produce a catch-up burst of events.
        self.settling_event_next_at = now
            .checked_add(self.event_interval)
            .unwrap_or_else(far_future);
    }
}

/// Emitted when frequent filesystem updates cause us to keep a batch open for an extended period of
/// time. Informing the user when this happens may help them understand what's happening, and that
/// Turbopack is not stalled.
#[derive(Debug, Clone, Serialize)]
pub struct FilesystemSettlingEvent {
    /// How long the current batch has been held open, in seconds.
    pub elapsed_secs: u64,
}

impl CompilationEvent for FilesystemSettlingEvent {
    fn type_name(&self) -> &'static str {
        "FilesystemSettlingEvent"
    }

    fn severity(&self) -> Severity {
        Severity::Info
    }

    fn message(&self) -> String {
        format!(
            "Turbopack has seen frequent file updates and is waiting for the filesystem to settle \
             ({}s elapsed).",
            self.elapsed_secs
        )
    }

    fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap()
    }
}

// from https://github.com/tokio-rs/tokio/blob/29cd6ec1ec6f90a7ee1ad641c03e0e00badbcb0e/tokio/src/time/instant.rs#L57-L63
fn far_future() -> Instant {
    // Roughly 30 years from now.
    // API does not provide a way to obtain max `Instant`
    // or convert specific date in the future to instant.
    // 1000 years overflows on macOS, 100 years overflows on FreeBSD.
    Instant::now() + Duration::from_secs(86400 * 365 * 30)
}
