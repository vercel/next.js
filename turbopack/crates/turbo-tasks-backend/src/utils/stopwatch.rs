use std::time::{Duration, Instant};

/// A simple accumulating stopwatch for measuring total elapsed time across multiple
/// start/stop intervals.
///
/// Time accrues only while the stopwatch is running. [`Stopwatch::start`] begins an
/// interval, [`Stopwatch::stop`] ends it and folds the interval into the accumulated
/// total, and [`Stopwatch::elapsed`] reports the accumulated total plus any currently
/// running interval. Both `start` and `stop` are idempotent, so callers don't need to
/// track the running state themselves.
///
/// The current time is supplied by the caller (rather than read internally) so the type
/// stays a pure value: callers pass `Instant::now()`, and tests can supply a controlled
/// clock.
#[derive(Debug, Default)]
pub struct Stopwatch {
    /// Total time accumulated from completed intervals.
    accumulated: Duration,
    /// Start of the current running interval, or `None` while stopped.
    started_at: Option<Instant>,
}

impl Stopwatch {
    /// Creates a new, stopped stopwatch with zero elapsed time.
    pub fn new() -> Self {
        Self::default()
    }

    /// Starts timing a new interval at `now`. No-op if already running.
    pub fn start(&mut self, now: Instant) {
        if self.started_at.is_none() {
            self.started_at = Some(now);
        }
    }

    /// Stops the current interval at `now`, folding its duration into the accumulated
    /// total. No-op if already stopped.
    pub fn stop(&mut self, now: Instant) {
        if let Some(started_at) = self.started_at.take() {
            self.accumulated += now.saturating_duration_since(started_at);
        }
    }

    /// Resets the accumulated total to zero. If the stopwatch is currently running, it
    /// keeps running but the current interval restarts from `now` (so time before the
    /// reset is discarded rather than carried forward).
    pub fn reset(&mut self, now: Instant) {
        self.accumulated = Duration::ZERO;
        if self.started_at.is_some() {
            self.started_at = Some(now);
        }
    }

    /// The total elapsed time as of `now`: completed intervals plus any currently running
    /// interval.
    pub fn elapsed(&self, now: Instant) -> Duration {
        self.accumulated
            + self.started_at.map_or(Duration::ZERO, |started_at| {
                now.saturating_duration_since(started_at)
            })
    }
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use super::Stopwatch;

    /// Returns a base instant and a helper to derive instants offset by milliseconds.
    fn clock() -> (Instant, impl Fn(u64) -> Instant) {
        let base = Instant::now();
        (base, move |ms: u64| base + Duration::from_millis(ms))
    }

    #[test]
    fn accumulates_across_intervals() {
        let (base, at) = clock();
        let mut sw = Stopwatch::new();
        assert_eq!(sw.elapsed(base), Duration::ZERO);

        sw.start(at(0));
        sw.stop(at(100));
        assert_eq!(sw.elapsed(at(150)), Duration::from_millis(100));

        // Stopped: time does not accrue.
        assert_eq!(sw.elapsed(at(200)), Duration::from_millis(100));

        // A second interval adds on top.
        sw.start(at(200));
        sw.stop(at(230));
        assert_eq!(sw.elapsed(at(500)), Duration::from_millis(130));
    }

    #[test]
    fn elapsed_includes_running_interval() {
        let (_, at) = clock();
        let mut sw = Stopwatch::new();
        sw.start(at(0));
        // Without stopping, elapsed reflects the in-flight interval.
        assert_eq!(sw.elapsed(at(40)), Duration::from_millis(40));
        assert_eq!(sw.elapsed(at(50)), Duration::from_millis(50));
    }

    #[test]
    fn start_and_stop_are_idempotent() {
        let (base, at) = clock();
        let mut sw = Stopwatch::new();
        // Redundant stop is a no-op.
        sw.stop(base);
        assert_eq!(sw.elapsed(base), Duration::ZERO);

        sw.start(at(0));
        // Redundant start does not restart the interval.
        sw.start(at(20));
        sw.stop(at(40));
        assert_eq!(sw.elapsed(at(40)), Duration::from_millis(40));
    }

    #[test]
    fn reset_while_stopped_zeroes_total() {
        let (_, at) = clock();
        let mut sw = Stopwatch::new();
        sw.start(at(0));
        sw.stop(at(70));
        sw.reset(at(70));
        assert_eq!(sw.elapsed(at(200)), Duration::ZERO);
    }

    #[test]
    fn reset_while_running_keeps_running_from_now() {
        let (_, at) = clock();
        let mut sw = Stopwatch::new();
        sw.start(at(0));
        // Reset mid-interval: prior time discarded, but still running from at(70).
        sw.reset(at(70));
        assert_eq!(sw.elapsed(at(70)), Duration::ZERO);
        assert_eq!(sw.elapsed(at(95)), Duration::from_millis(25));
    }
}
