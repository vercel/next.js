use std::{
    num::{NonZeroU64, NonZeroUsize},
    sync::{Arc, OnceLock},
};

use hashbrown::HashMap;
use smallvec::SmallVec;
use turbo_rcstr::RcStr;

use crate::{lazy_sorted_vec::LazySortedVec, timestamp::Timestamp};

pub type SpanIndex = NonZeroUsize;

/// Storage for `Span::args` ~32% of spans have <=1 arg (typically just the
/// `name` key for `turbo_tasks::function` spans), so inlining one entry
/// avoids a heap allocation in this common case.
pub type SpanArgs = SmallVec<[(RcStr, RcStr); 1]>;

pub struct Span {
    // These values won't change after creation:
    pub parent: Option<SpanIndex>,
    pub depth: u32,
    pub start: Timestamp,
    pub category: RcStr,
    pub name: RcStr,
    pub args: SpanArgs,

    // This might change during writing:
    /// The list of events sorted by start time. Backed by a SmallVec so leaf
    /// spans (~69%, typically just one self-time event) don't pay a heap
    /// allocation.
    pub events: LazySortedVec<SpanEvent>,
    pub is_complete: bool,

    // These values are computed automatically:
    pub self_allocations: u64,
    pub self_allocation_count: u64,
    pub self_deallocations: u64,
    pub self_deallocation_count: u64,

    // These values are computed when accessed (and maybe deleted during writing):
    pub max_depth: OnceLock<u32>,
    pub total_allocations: OnceLock<u64>,
    pub total_deallocations: OnceLock<u64>,
    pub total_persistent_allocations: OnceLock<u64>,
    pub total_span_count: OnceLock<u64>,
    pub total_allocation_count: OnceLock<u64>,

    // More nested fields, but memory lazily allocated
    pub time_data: OnceLock<Box<SpanTimeData>>,
    pub extra: OnceLock<Box<SpanExtra>>,
    pub names: OnceLock<Box<SpanNames>>,
}

#[derive(Default)]
pub struct SpanTimeData {
    // These values won't change after creation:
    pub ignore_self_time: bool,

    // This might change during writing:
    pub self_end: Timestamp,

    // These values are computed automatically:
    pub self_time: Timestamp,

    // These values are computed when accessed (and maybe deleted during writing):
    pub end: OnceLock<Timestamp>,
    pub total_time: OnceLock<Timestamp>,
    pub corrected_self_time: OnceLock<Timestamp>,
    pub corrected_total_time: OnceLock<Timestamp>,
}

#[derive(Default)]
pub struct SpanExtra {
    pub graph: OnceLock<Vec<SpanGraphEvent>>,
    pub bottom_up: OnceLock<Vec<Arc<SpanBottomUp>>>,
    pub search_index: OnceLock<HashMap<RcStr, Vec<SpanIndex>>>,
}

#[derive(Default)]
pub struct SpanNames {
    // These values are computed when accessed (and maybe deleted during writing):
    pub nice_name: OnceLock<(RcStr, RcStr)>,
    pub group_name: OnceLock<(RcStr, RcStr)>,
}

impl Span {
    pub fn time_data(&self) -> &SpanTimeData {
        self.time_data.get_or_init(|| {
            Box::new(SpanTimeData {
                self_end: self.start,
                ignore_self_time: &self.name == "thread" || &self.name == "blocking",
                ..Default::default()
            })
        })
    }

    pub fn time_data_mut(&mut self) -> &mut SpanTimeData {
        self.time_data();
        self.time_data.get_mut().unwrap()
    }

    pub fn extra(&self) -> &SpanExtra {
        self.extra.get_or_init(Default::default)
    }

    pub fn names(&self) -> &SpanNames {
        self.names.get_or_init(Default::default)
    }
}

/// Stores `duration` as `NonZeroU64` so the variant has a niche; combined with
/// `Child`'s `NonZeroUsize` index, this lets the compiler pack `SpanEvent`
/// without a separate discriminant byte (saving 8 bytes per event vs. an
/// `end: Timestamp` layout). Callers must filter zero-duration self-time
/// events before constructing — see [`SpanEvent::self_time`].
pub struct SpanEventSelfTime {
    pub start: Timestamp,
    pub duration: NonZeroU64,
    pub corrected_self_time: OnceLock<Timestamp>,
}

impl SpanEventSelfTime {
    pub fn end(&self) -> Timestamp {
        Timestamp::from_value(*self.start + self.duration.get())
    }
}

pub enum SpanEvent {
    SelfTime(SpanEventSelfTime),
    Child { start: Timestamp, index: SpanIndex },
}

// 32 bytes = 8 (start) + 8 (duration) + 16 (OnceLock<Timestamp>) for the
// SelfTime variant; the Child variant fits in 16 and uses the niche, so no
// extra discriminant byte is needed.
const _: () = assert!(std::mem::size_of::<SpanEvent>() == 32);

impl SpanEvent {
    /// Constructs a `SelfTime` event from start and end timestamps. Returns `None`
    /// if `end <= start` (zero or negative duration).
    pub fn self_time(start: Timestamp, end: Timestamp) -> Option<Self> {
        let duration = NonZeroU64::new(*end.saturating_sub(start))?;
        Some(SpanEvent::SelfTime(SpanEventSelfTime {
            start,
            duration,
            corrected_self_time: OnceLock::new(),
        }))
    }

    pub fn start(&self) -> Timestamp {
        match self {
            SpanEvent::SelfTime(self_time) => self_time.start,
            SpanEvent::Child { start, .. } => *start,
        }
    }
}

impl PartialEq for SpanEvent {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == std::cmp::Ordering::Equal
    }
}

impl Eq for SpanEvent {}

impl PartialOrd for SpanEvent {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for SpanEvent {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.start()
            .cmp(&other.start())
            .then_with(|| match (self, other) {
                (SpanEvent::SelfTime(_), SpanEvent::Child { .. }) => std::cmp::Ordering::Less,
                (SpanEvent::Child { .. }, SpanEvent::SelfTime(_)) => std::cmp::Ordering::Greater,
                (SpanEvent::SelfTime(a), SpanEvent::SelfTime(b)) => a.duration.cmp(&b.duration),
                (
                    SpanEvent::Child { start: _, index: a },
                    SpanEvent::Child { start: _, index: b },
                ) => a.cmp(b),
            })
    }
}

#[derive(Clone)]
pub enum SpanGraphEvent {
    // TODO(sokra) use events instead of children for visualizing span graphs
    #[allow(dead_code)]
    SelfTime {
        duration: Timestamp,
    },
    Child {
        child: Arc<SpanGraph>,
    },
}

pub struct SpanGraph {
    // These values won't change after creation:
    pub root_spans: Vec<SpanIndex>,
    pub recursive_spans: Vec<SpanIndex>,

    // These values are computed when accessed:
    pub max_depth: OnceLock<u32>,
    pub events: OnceLock<Vec<SpanGraphEvent>>,
    pub self_time: OnceLock<Timestamp>,
    pub self_allocations: OnceLock<u64>,
    pub self_deallocations: OnceLock<u64>,
    pub self_persistent_allocations: OnceLock<u64>,
    pub self_allocation_count: OnceLock<u64>,
    pub total_time: OnceLock<Timestamp>,
    pub total_allocations: OnceLock<u64>,
    pub total_deallocations: OnceLock<u64>,
    pub total_persistent_allocations: OnceLock<u64>,
    pub total_allocation_count: OnceLock<u64>,
    pub total_span_count: OnceLock<u64>,
    pub corrected_self_time: OnceLock<Timestamp>,
    pub corrected_total_time: OnceLock<Timestamp>,
    pub bottom_up: OnceLock<Vec<Arc<SpanBottomUp>>>,
}

pub struct SpanBottomUp {
    // These values won't change after creation:
    pub self_spans: Vec<SpanIndex>,
    pub children: Vec<Arc<SpanBottomUp>>,
    pub example_span: SpanIndex,

    // These values are computed when accessed:
    pub max_depth: OnceLock<u32>,
    pub events: OnceLock<Vec<SpanGraphEvent>>,
    pub self_time: OnceLock<Timestamp>,
    pub corrected_self_time: OnceLock<Timestamp>,
    pub self_allocations: OnceLock<u64>,
    pub self_deallocations: OnceLock<u64>,
    pub self_persistent_allocations: OnceLock<u64>,
    pub self_allocation_count: OnceLock<u64>,
}

impl SpanBottomUp {
    pub fn new(
        self_spans: Vec<SpanIndex>,
        example_span: SpanIndex,
        children: Vec<Arc<SpanBottomUp>>,
    ) -> Self {
        Self {
            self_spans,
            children,
            example_span,
            max_depth: OnceLock::new(),
            events: OnceLock::new(),
            self_time: OnceLock::new(),
            corrected_self_time: OnceLock::new(),
            self_allocations: OnceLock::new(),
            self_deallocations: OnceLock::new(),
            self_persistent_allocations: OnceLock::new(),
            self_allocation_count: OnceLock::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn span_event_self_time_filters_zero_duration() {
        let t = Timestamp::from_micros(100);
        assert!(SpanEvent::self_time(t, t).is_none());
        // end < start should also return None (saturating_sub clamps to 0).
        assert!(SpanEvent::self_time(t, Timestamp::from_micros(50)).is_none());
    }

    #[test]
    fn span_event_self_time_constructs_positive_duration() {
        let start = Timestamp::from_micros(100);
        let end = Timestamp::from_micros(150);
        let event = SpanEvent::self_time(start, end).unwrap();
        match event {
            SpanEvent::SelfTime(self_time) => {
                assert_eq!(self_time.start, start);
                assert_eq!(self_time.duration.get(), *end - *start);
                assert_eq!(self_time.end(), end);
            }
            SpanEvent::Child { .. } => panic!("expected SelfTime"),
        }
    }

    #[test]
    fn span_event_size_is_packed() {
        // Backstop for the const assert; if this fails the const assert above
        // would also fail, but having a test gives a clearer error message.
        assert_eq!(std::mem::size_of::<SpanEvent>(), 32);
    }
}
