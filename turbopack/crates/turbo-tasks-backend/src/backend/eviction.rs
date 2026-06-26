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
    /// Global net live bytes ([`TurboMalloc::memory_usage`]) sampled immediately
    /// after the most recent eviction, or `None` before the first eviction.
    /// Only meaningful in [`EvictionMode::Auto`].
    memory_at_last_eviction: Option<usize>,
}

impl EvictionControl {
    pub(crate) fn new(mode: EvictionMode) -> Self {
        Self {
            mode,
            memory_at_last_eviction: None,
        }
    }

    /// Whether any prior cycle has evicted. Derived from the recorded baseline,
    /// which [`EvictionControl::record_eviction`] sets after each sweep.
    fn has_evicted_before(&self) -> bool {
        self.memory_at_last_eviction.is_some()
    }

    /// Whether to run an eviction sweep this snapshot cycle.
    ///
    /// `snapshot_had_new_data` is whether the just-completed snapshot persisted
    /// new data. We only evict when there's new data to persist (the common case)
    /// or on the very first eviction after startup (data was already on disk from
    /// a prior run, so `snapshot_had_new_data` may be false but in-memory state
    /// can still be evicted).
    ///
    /// Within that, `Off` never evicts, `Full` always evicts, and `Auto` requires
    /// enough net memory allocated since the last eviction to justify the
    /// restore-then-re-evict churn (always evicting the first time, since there's
    /// no prior baseline).
    pub(crate) fn should_evict(&self, snapshot_had_new_data: bool) -> bool {
        // Only evict when there's new data to persist, or on the very first
        // eviction after startup (restored on-disk state can be reclaimed even
        // when this snapshot had no new data).
        if !snapshot_had_new_data && self.has_evicted_before() {
            return false;
        }
        match self.mode {
            EvictionMode::Off => false,
            EvictionMode::Full => {
                if !snapshot_had_new_data && self.has_evicted_before() {
                    return false;
                }
                true
            }
            EvictionMode::Auto => self.auto_threshold_exceeded(),
        }
    }

    /// For [`EvictionMode::Auto`]: whether enough net memory has been allocated
    /// since the last eviction to justify another sweep. Always evicts the first
    /// time (no prior baseline). The threshold scales down under OS memory
    /// pressure so we evict more eagerly when memory is tight.
    fn auto_threshold_exceeded(&self) -> bool {
        /// Minimum net bytes ([`TurboMalloc::memory_usage`] delta) that must be
        /// allocated since the last eviction before another is worthwhile.
        /// Allocated bytes are the proxy for how much a sweep would reclaim.
        /// Default 128 MiB; overridable via `TURBO_ENGINE_EVICT_MIN_BYTES`.
        static MIN_EVICT_BYTES: LazyLock<usize> = LazyLock::new(|| {
            std::env::var("TURBO_ENGINE_EVICT_MIN_BYTES")
                .ok()
                .and_then(|v| v.parse::<usize>().ok())
                .unwrap_or(128 * 1024 * 1024)
        });
        let Some(last) = self.memory_at_last_eviction else {
            // First eviction: no baseline to compare against, so always evict.
            return true;
        };
        let current = TurboMalloc::memory_usage();
        // saturating: if memory shrank since the last eviction there is nothing
        // new to reclaim, so the delta is 0 and we skip.
        let allocated_since = current.saturating_sub(last);
        let threshold = scale_threshold(*MIN_EVICT_BYTES, TurboMalloc::memory_pressure());
        allocated_since >= threshold
    }

    /// Call after completing an eviction cycle.
    pub(crate) fn record_eviction(&mut self) {
        self.memory_at_last_eviction = Some(TurboMalloc::memory_usage());
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
        // Integer math, multiply before divide to avoid truncation. `p` is
        // clamped to 0..=100, so `100 - p` never underflows and the result is in
        // `0..=base`. `base * 100` stays well within usize on 64-bit targets.
        Some(p) => base * (100 - p.min(100) as usize) / 100,
        None => base,
    }
}

#[cfg(test)]
mod tests {
    use super::{EvictionControl, EvictionMode, scale_threshold};

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
