use std::time::Instant;

/// Guard that emits a tracing event when dropped with the duration of the
/// lifetime of the guard.
pub struct DurationSpanGuard<F: FnOnce(u64)> {
    start: Instant,
    f: Option<F>,
}

impl<F: FnOnce(u64)> DurationSpanGuard<F> {
    pub fn new(f: F) -> Self {
        Self {
            start: Instant::now(),
            f: Some(f),
        }
    }
}

impl<F: FnOnce(u64)> Drop for DurationSpanGuard<F> {
    fn drop(&mut self) {
        if let Some(f) = self.f.take() {
            f(self.start.elapsed().as_micros() as u64);
        }
    }
}

/// Creates a event-based span that traces a certain duration (lifetime of the
/// guard). It's not a real span, which means it can be used across threads.
///
/// It will trace a duration and not the time the cpu is doing actual work. This
/// way it can be used to trace non-cpu-time or time that is spend in other
/// processes.
///
/// Set `blocking = true` for waiting (for example, network I/O or a pool slot).
/// The trace server preserves the elapsed range but excludes its own duration
/// from CPU time, concurrency and corrected-time accounting, like an entered
/// span with the same attribute. Counted child work is unaffected.
/// Use `blocking = false` for work performed by another thread or process;
/// omitting the attribute also retains this counted behavior for compatibility.
/// Such durations approximate external work, not measured process CPU time.
#[macro_export]
macro_rules! duration_span {
    ($name:literal) => {
        turbo_tasks::duration_span::DurationSpanGuard::new(|duration| {
            turbo_tasks::macro_helpers::tracing::info!(name = $name, duration = duration);
        })
    };
    ($name:literal, $($arg:tt)+) => {
        turbo_tasks::duration_span::DurationSpanGuard::new(|duration| {
            turbo_tasks::macro_helpers::tracing::info!(name = $name, $($arg)+, duration = duration);
        })
    };
}
