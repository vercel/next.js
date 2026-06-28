//! Eviction policy for the background snapshot loop.
//!
//! When the persistent cache is enabled, the backend periodically snapshots its
//! in-memory state to disk. After a snapshot it may evict the evictable tasks
//! from memory and reload them from disk on demand. [`EvictionControl`] decides
//! whether each snapshot cycle should run such a sweep, based on the configured
//! [`EvictionMode`].

use std::sync::LazyLock;

use turbo_tasks_malloc::TurboMalloc;

/// Strategy for evicting evictable tasks from in-memory storage after a
/// snapshot.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EvictionMode {
    /// Never evict.
    Off,
    /// Evict after a snapshot only once enough memory has been allocated since
    /// the last eviction to justify the cost of restoring evicted tasks on
    /// demand. Uses allocator statistics to estimate reclaimable memory.
    /// See [`EvictionControl::auto_threshold_exceeded`].
    Auto,
    /// After every snapshot, evict all evictable tasks from memory, reloading
    /// them from disk on demand.
    Full,
}

/// Owns the eviction policy for the development time background snapshot loop: the configured
/// [`EvictionMode`] plus the threshold bookkeeping for [`EvictionMode::Auto`].
pub(crate) struct EvictionControl {
    mode: EvictionMode,
    /// The lowest global net live bytes ([`TurboMalloc::memory_usage`]) observed
    /// since the most recent eviction, or `None` before the first eviction.
    /// Only meaningful in [`EvictionMode::Auto`].
    ///
    /// Tracking the running minimum (rather than trusting the single post-eviction sample) matters
    /// because memory can keep falling *after* a sweep returns typically because some other
    /// threads are holding onto some Arc managed values that will `drop` once their temporary
    /// holds are gone.
    memory_floor: Option<usize>,
}

impl EvictionControl {
    pub(crate) fn new(mode: EvictionMode) -> Self {
        Self {
            mode,
            memory_floor: None,
        }
    }

    /// Whether any prior cycle has evicted. Derived from the recorded baseline,
    /// which [`EvictionControl::record_eviction`] sets after each sweep.
    fn has_evicted_before(&self) -> bool {
        self.memory_floor.is_some()
    }

    /// Whether to run an eviction sweep this snapshot cycle.
    ///
    /// `snapshot_had_new_data` is whether the just-completed snapshot persisted
    /// new data.  Used only by the `full` variant
    ///
    /// Within that, `Off` never evicts, `Full` always evicts, and `Auto` requires
    /// enough net memory allocated since the last eviction to justify the
    /// restore-then-re-evict churn (always evicting the first time, since there's
    /// no prior baseline).
    pub(crate) fn should_evict(&mut self, snapshot_had_new_data: bool) -> bool {
        // Only evict when there's new data to persist, or on the very first
        // eviction after startup (restored on-disk state can be reclaimed even
        // when this snapshot had no new data).

        match self.mode {
            EvictionMode::Off => false,
            EvictionMode::Full => {
                // In full mode we only skip evicting if we didn't save anything and have already
                // evicted
                snapshot_had_new_data || !self.has_evicted_before()
            }
            EvictionMode::Auto => self.auto_threshold_exceeded(),
        }
    }

    /// For [`EvictionMode::Auto`]: whether enough net memory has been allocated
    /// since the last eviction to justify another sweep. Always evicts the first
    /// time (no prior baseline). The threshold scales down under OS memory
    /// pressure so we evict more eagerly when memory is tight.
    fn auto_threshold_exceeded(&mut self) -> bool {
        /// Minimum net bytes ([`TurboMalloc::memory_usage`] delta) that must be
        /// allocated since the last eviction before another is worthwhile.
        /// Allocated bytes are the proxy for how much a sweep would reclaim.
        /// Default 128 MiB; overridable via `TURBO_ENGINE_EVICT_MIN_BYTES`.
        static MIN_EVICT_BYTES: LazyLock<usize> = LazyLock::new(|| {
            std::env::var("TURBO_ENGINE_EVICT_MIN_BYTES")
                .ok()
                .and_then(|s| {
                    let s = s.trim();
                    let lower = s.to_ascii_lowercase();
                    let (num, mult) = if let Some(n) = lower.strip_suffix('g') {
                        (n, 1024 * 1024 * 1024)
                    } else if let Some(n) = lower.strip_suffix('m') {
                        (n, 1024 * 1024)
                    } else if let Some(n) = lower.strip_suffix('k') {
                        (n, 1024)
                    } else {
                        (lower.as_str(), 1)
                    };
                    match num.trim().parse::<usize>() {
                        Ok(n) => Some(n * mult),
                        Err(e) => {
                            eprintln!(
                                "error: could not parse `TURBO_ENGINE_EVICT_MIN_BYTES` value: \
                                 {e:?}"
                            );
                            None
                        }
                    }
                })
                .unwrap_or(128 * 1024 * 1024)
        });

        let current = TurboMalloc::memory_usage();
        let threshold = scale_threshold(*MIN_EVICT_BYTES, TurboMalloc::memory_pressure());
        let (lowered_floor, evict) = evaluate_threshold(self.memory_floor, current, threshold);
        // Only a memory drop lowers the floor here; seeding it is left to
        // `record_eviction` so a decision alone never counts as "has evicted".
        if let Some(floor) = lowered_floor {
            self.memory_floor = Some(floor);
        }
        evict
    }

    /// Call after completing an eviction cycle. Seeds the memory floor with the
    /// post-eviction usage; later cycles lower it further as memory settles.
    pub(crate) fn record_eviction(&mut self) {
        self.memory_floor = Some(TurboMalloc::memory_usage());
    }
}

/// The pure decision behind [`EvictionControl::auto_threshold_exceeded`], split
/// out so it can be unit-tested without touching the allocator.
fn evaluate_threshold(
    floor: Option<usize>,
    current: usize,
    threshold: usize,
) -> (Option<usize>, bool) {
    match floor {
        None => (None, true),
        Some(floor) if current < floor => (Some(current), false),
        Some(floor) => (None, current - floor >= threshold),
    }
}

/// Scale a base eviction threshold down linearly with OS memory pressure.
///
/// `threshold = base * (1 - pressure / 100)`. At pressure 0 the base is
/// unchanged; at pressure 100 the threshold is 0, so every cycle evicts (the
/// `Auto` mode degrades to `Full` when memory is maxed out, reclaiming as much
/// as possible). When pressure is unavailable (`None`) the base is returned
/// unchanged.
fn scale_threshold(base: usize, pressure: Option<u8>) -> usize {
    match pressure {
        Some(p) => (base as f64 * (1.0 - p.min(100) as f64 / 100.0)).round() as usize,
        None => base,
    }
}

#[cfg(test)]
mod tests {
    use super::{EvictionControl, EvictionMode, evaluate_threshold, scale_threshold};

    const MIB: usize = 1024 * 1024;

    #[test]
    fn evaluate_threshold_first_eviction_always_runs() {
        // No floor yet → evict; floor not seeded here (record_eviction does that).
        assert_eq!(evaluate_threshold(None, 500 * MIB, 128 * MIB), (None, true));
    }

    #[test]
    fn evaluate_threshold_growth_below_threshold_skips() {
        // Grew 64 MiB since the floor, threshold is 128 MiB → skip, floor unchanged.
        assert_eq!(
            evaluate_threshold(Some(900 * MIB), 964 * MIB, 128 * MIB),
            (None, false)
        );
    }

    #[test]
    fn evaluate_threshold_growth_at_threshold_evicts() {
        // Grew exactly the threshold → evict, floor unchanged (record_eviction resets it).
        assert_eq!(
            evaluate_threshold(Some(900 * MIB), 1028 * MIB, 128 * MIB),
            (None, true)
        );
    }

    #[test]
    fn evaluate_threshold_drop_below_floor_lowers_floor_and_skips() {
        // Regression: after a sweep we recorded ~926 MiB, but memory kept falling
        // to ~677 MiB. The floor must follow memory down and we must not evict.
        assert_eq!(
            evaluate_threshold(Some(926 * MIB), 677 * MIB, 56 * MIB),
            (Some(677 * MIB), false)
        );
    }

    #[test]
    fn off_mode_never_evicts() {
        let mut control = EvictionControl::new(EvictionMode::Off);
        for &new_data in &[true, false] {
            assert!(!control.should_evict(new_data));
            // Even after a (forced) eviction, Off never evicts.
            control.record_eviction();
            assert!(!control.should_evict(new_data));
        }
    }

    #[test]
    fn full_mode_evicts_on_new_data() {
        let mut control = EvictionControl::new(EvictionMode::Full);
        // New data → always evict, before and after a prior eviction.
        assert!(control.should_evict(true));
        control.record_eviction();
        assert!(control.should_evict(true));
    }

    #[test]
    fn full_mode_evicts_first_time_without_new_data() {
        let mut control = EvictionControl::new(EvictionMode::Full);
        // No new data, but never evicted before → first eviction still runs.
        assert!(control.should_evict(false));
        // No new data and already evicted → skip.
        control.record_eviction();
        assert!(!control.should_evict(false));
    }

    #[test]
    fn auto_mode_evicts_first_time() {
        // Fresh control has no baseline, so the first eligible cycle always
        // evicts regardless of the memory threshold.
        let mut control = EvictionControl::new(EvictionMode::Auto);
        assert!(control.should_evict(true));
        assert!(control.should_evict(false));
        // But still respects the new-data/first-time trigger once it has evicted.
        control.record_eviction();
        assert!(!control.should_evict(false));
    }

    #[test]
    fn scale_threshold_behavior() {
        assert_eq!(scale_threshold(100, Some(0)), 100);
        assert_eq!(scale_threshold(100, Some(50)), 50);
        assert_eq!(scale_threshold(100, Some(100)), 0);
        // Pressure is documented as 0..=100; values above clamp to 100.
        assert_eq!(scale_threshold(100, Some(200)), 0);
    }

    #[test]
    fn scale_threshold_is_monotonic_non_increasing() {
        let mut prev = scale_threshold(100, Some(0));
        for p in 1..=100u8 {
            let cur = scale_threshold(100, Some(p));
            assert!(
                cur <= prev,
                "threshold should not increase with pressure: p={p}, cur={cur}, prev={prev}"
            );
            prev = cur;
        }
    }
}
