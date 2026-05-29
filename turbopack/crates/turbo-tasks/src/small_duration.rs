use std::{
    fmt::{Debug, Display},
    time::Duration,
};

/// Stores a [`Duration`] in a given precision (in nanoseconds) in 4 bytes.
///
/// For instance, for `P = 10_000` (10 microseconds), this allows a for a total
/// duration of 11.9 hours. Values smaller than 10 microseconds are stored as 10
/// microseconds.
#[derive(Clone, Copy, Eq, PartialEq, Ord, PartialOrd, Hash, Default)]
pub struct SmallDuration<const P: u64>(u32);

impl<const P: u64> SmallDuration<P> {
    pub const ZERO: SmallDuration<P> = SmallDuration(0);
    // TODO(alexkirsz) Figure out if MIN should be 0 or 1.
    pub const MIN: SmallDuration<P> = SmallDuration(1);
    pub const MAX: SmallDuration<P> = SmallDuration(u32::MAX);

    pub const fn from_nanos(nanos: u64) -> Self {
        if nanos == 0 {
            return SmallDuration::ZERO;
        }
        if nanos <= P {
            return SmallDuration::MIN;
        }
        let value = nanos / P;
        if value > u32::MAX as u64 {
            return SmallDuration::MAX;
        }
        SmallDuration(value as u32)
    }

    pub const fn from_micros(micros: u64) -> Self {
        if micros == 0 {
            return SmallDuration::ZERO;
        }
        let micros_precision = P / 1_000;
        if micros <= micros_precision {
            return SmallDuration::MIN;
        }
        let value = micros * 1_000 / P;
        if value > u32::MAX as u64 {
            return SmallDuration::MAX;
        }
        SmallDuration(value as u32)
    }

    pub const fn from_millis(millis: u64) -> Self {
        if millis == 0 {
            return SmallDuration::ZERO;
        }
        let millis_precision = P / 1_000_000;
        if millis <= millis_precision {
            return SmallDuration::MIN;
        }
        let value = millis * 1_000_000 / P;
        if value > u32::MAX as u64 {
            return SmallDuration::MAX;
        }
        SmallDuration(value as u32)
    }

    pub const fn from_secs(secs: u64) -> Self {
        if secs == 0 {
            return SmallDuration::ZERO;
        }
        let secs_precision = P / 1_000_000_000;
        if secs <= secs_precision {
            return SmallDuration::MIN;
        }
        let value = secs * 1_000_000_000 / P;
        if value > u32::MAX as u64 {
            return SmallDuration::MAX;
        }
        SmallDuration(value as u32)
    }

    pub(self) fn to_duration(self) -> Duration {
        Duration::from_nanos(self.0 as u64 * P)
    }
}

impl<const P: u64> From<Duration> for SmallDuration<P> {
    fn from(duration: Duration) -> Self {
        if duration.is_zero() {
            return SmallDuration::ZERO;
        }
        let nanos = duration.as_nanos();
        if nanos <= P as u128 {
            return SmallDuration::MIN;
        }
        (nanos / P as u128)
            .try_into()
            .map_or(SmallDuration::MAX, SmallDuration)
    }
}

impl<const P: u64> From<SmallDuration<P>> for Duration {
    fn from(duration: SmallDuration<P>) -> Self {
        duration.to_duration()
    }
}

impl<const P: u64> Display for SmallDuration<P> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let duration = Duration::from(*self);
        duration.fmt(f)
    }
}

impl<const P: u64> Debug for SmallDuration<P> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let duration = Duration::from(*self);
        duration.fmt(f)
    }
}

impl<const P: u64> PartialEq<Duration> for SmallDuration<P> {
    fn eq(&self, other: &Duration) -> bool {
        self.to_duration() == *other
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::SmallDuration;

    #[test]
    fn test_1_nano() {
        type Sd = SmallDuration<1>;

        assert_eq!(Sd::from_nanos(1), Duration::from_nanos(1));
        assert_eq!(Sd::from_nanos(42), Duration::from_nanos(42));

        assert_eq!(Sd::from_micros(1), Duration::from_micros(1));
        assert_eq!(Sd::from_micros(42), Duration::from_micros(42));

        assert_eq!(Sd::from_millis(1), Duration::from_millis(1));
        assert_eq!(Sd::from_millis(42), Duration::from_millis(42));

        assert_eq!(Sd::from_secs(1), Duration::from_secs(1));

        // 1ns precision can only store up to ~4.29s.
        assert_eq!(Sd::from_secs(4), Duration::from_secs(4));
        assert_eq!(Sd::from_secs(5), Sd::MAX);
    }

    #[test]
    fn test_1_micro() {
        type Sd = SmallDuration<1_000>;

        // 1µs precision can't store ns-level variations.
        assert_eq!(Sd::from_nanos(1), Sd::MIN);
        assert_eq!(Sd::from_nanos(42), Sd::MIN);

        assert_eq!(Sd::from_micros(1), Duration::from_micros(1));
        assert_eq!(Sd::from_micros(42), Duration::from_micros(42));

        assert_eq!(Sd::from_millis(1), Duration::from_millis(1));
        assert_eq!(Sd::from_millis(42), Duration::from_millis(42));

        assert_eq!(Sd::from_secs(1), Duration::from_secs(1));
        assert_eq!(Sd::from_secs(42), Duration::from_secs(42));

        // 1µs precision can only store up to ~4,294s.
        assert_eq!(Sd::from_secs(4_000), Duration::from_secs(4_000));
        assert_eq!(Sd::from_secs(5_000), Sd::MAX);
    }

    #[test]
    fn test_1_milli() {
        type Sd = SmallDuration<1_000_000>;

        // 1ms precision can't store ns-or-µs-level variations.
        assert_eq!(Sd::from_nanos(1), Sd::MIN);
        assert_eq!(Sd::from_nanos(42), Sd::MIN);
        assert_eq!(Sd::from_micros(1), Sd::MIN);
        assert_eq!(Sd::from_micros(42), Sd::MIN);

        assert_eq!(Sd::from_millis(1), Duration::from_millis(1));
        assert_eq!(Sd::from_millis(42), Duration::from_millis(42));

        assert_eq!(Sd::from_secs(1), Duration::from_secs(1));
        assert_eq!(Sd::from_secs(42), Duration::from_secs(42));

        // 1ms precision can only store up to ~4,294,000s.
        assert_eq!(Sd::from_secs(4_000_000), Duration::from_secs(4_000_000));
        assert_eq!(Sd::from_secs(5_000_000), Sd::MAX);
    }

    #[test]
    fn test_1_sec() {
        type Sd = SmallDuration<1_000_000_000>;

        // 1ms precision can't store ns/µs/ms-level variations.
        assert_eq!(Sd::from_nanos(1), Sd::MIN);
        assert_eq!(Sd::from_nanos(42), Sd::MIN);
        assert_eq!(Sd::from_micros(1), Sd::MIN);
        assert_eq!(Sd::from_micros(42), Sd::MIN);
        assert_eq!(Sd::from_millis(1), Sd::MIN);
        assert_eq!(Sd::from_millis(42), Sd::MIN);

        assert_eq!(Sd::from_secs(1), Duration::from_secs(1));
        assert_eq!(Sd::from_secs(42), Duration::from_secs(42));

        // 1s precision can only store up to ~4,294,000,000s.
        assert_eq!(
            Sd::from_secs(4_000_000_000),
            Duration::from_secs(4_000_000_000)
        );
        assert_eq!(Sd::from_secs(5_000_000_000), Sd::MAX);
    }
}
