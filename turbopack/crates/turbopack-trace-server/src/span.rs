use std::{
    num::{NonZeroU64, NonZeroUsize},
    sync::{Arc, OnceLock, atomic::AtomicU8},
};

use hashbrown::HashMap;
use smallvec::SmallVec;
use turbo_rcstr::RcStr;

use crate::{lazy_sorted_vec::LazySortedVec, timestamp::Timestamp};

pub type SpanIndex = NonZeroUsize;

/// Sentinel in [`Span::max_depth`] meaning "not yet computed". Real values are
/// bounded by `store::CUT_OFF_DEPTH` (80), so this cannot collide.
pub const MAX_DEPTH_UNSET: u8 = u8::MAX;

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

    /// Height of the subtree below this span, lazily computed and cached here
    /// rather than inside [`SpanTotals`].
    ///
    /// It lives in the hot record because it is the one derived value the viewer
    /// asks for about *every* span before drawing anything
    /// (`viewer.rs`: `root_spans.par_iter()` forcing `max_depth()`). While it was
    /// bundled with the subtree totals, that single call materialized the whole
    /// totals cache for the entire trace, which would defeat any attempt to keep
    /// the derived half lazily allocated.
    ///
    /// [`MAX_DEPTH_UNSET`] means "not computed". Values fit a `u8` because
    /// `store::CUT_OFF_DEPTH` caps tree height at 80, and this byte is free —
    /// it shares padding with `depth` and `is_complete`.
    pub max_depth: AtomicU8,

    // These values are computed automatically:
    pub self_allocations: u64,
    pub self_allocation_count: u64,
    pub self_deallocations: u64,
    pub self_deallocation_count: u64,

    // The derived half — subtree totals and the four lazily-computed timestamps —
    // is not stored here at all. See [`crate::cold`]: it lives in arrays parallel
    // to the span chunks, allocated on first touch, so a headless ingest never
    // pays for it.
    pub time_data: SpanTimeData,
    /// Lazy first-touch via `OnceLock`, but inline rather than boxed: ~96% of
    /// spans get names populated after browsing, never invalidated, so the box
    /// indirection is pure overhead.
    pub names: OnceLock<SpanNames>,
}

/// Subtree aggregates, filled together by one `OnceLock` so a partial read
/// pays a single lock rather than one per field.
///
/// Deliberately does *not* include the subtree height; see [`Span::max_depth`].
#[derive(Default, Clone, Copy)]
pub struct SpanTotals {
    pub allocations: u64,
    pub deallocations: u64,
    pub persistent_allocations: u64,
    pub allocation_count: u64,
    pub span_count: u64,
}

/// The timing values the reader writes. The derived ones (`end`, `total_time`
/// and the two corrected times) are in [`crate::cold`].
#[derive(Default)]
pub struct SpanTimeData {
    // These values won't change after creation:
    pub ignore_self_time: bool,

    // This might change during writing:
    pub self_end: Timestamp,

    // These values are computed automatically:
    pub self_time: Timestamp,
}

#[derive(Default)]
pub struct SpanExtra {
    pub graph: OnceLock<Vec<SpanGraphEvent>>,
    pub bottom_up: OnceLock<Vec<Arc<SpanBottomUp>>>,
    pub search_index: OnceLock<HashMap<RcStr, Vec<SpanIndex>>>,
}

#[derive(Clone)]
pub struct SpanName {
    pub category: RcStr,
    pub title: RcStr,
}

pub struct SpanNames {
    pub nice_name: SpanName,
    pub group_name: SpanName,
}

impl Span {
    pub fn names(&self) -> &SpanNames {
        self.names.get_or_init(|| self.compute_names())
    }

    fn compute_names(&self) -> SpanNames {
        // Classify the span. `turbo_tasks::function` and the resolve-call spans
        // get special-cased rendering when they carry a `name` arg; everything
        // else is rendered generically.
        enum Kind {
            Function,
            Resolve,
            Other,
        }
        let kind = match self.name.as_str() {
            "turbo_tasks::function" => Kind::Function,
            "turbo_tasks::resolve_call" | "turbo_tasks::resolve_trait_call" => Kind::Resolve,
            _ => Kind::Other,
        };
        let arg_name = self.args.iter().find(|&(k, _)| k == "name").map(|(_, v)| v);

        // Generic fallback used by both names whenever no special case applies.
        let generic = || SpanName {
            category: self.category.clone(),
            title: self.name.clone(),
        };

        // Each arm constructs the full `SpanNames` so the relationship between
        // `nice_name` and `group_name` is visible at a glance. The `Some(n)`
        // rows handle the "this span carries a `name` arg" case; the `None`
        // arm falls back to the generic shape for both names — including for
        // function/resolve spans, which (in practice) always carry a name arg,
        // so the fallback is mostly defensive.
        match (kind, arg_name) {
            (Kind::Function, Some(n)) => {
                let pretty = SpanName {
                    category: self.name.clone(),
                    title: n.clone(),
                };
                SpanNames {
                    nice_name: pretty.clone(),
                    group_name: pretty,
                }
            }
            (Kind::Resolve, Some(n)) => SpanNames {
                nice_name: SpanName {
                    category: self.name.clone(),
                    title: format!("*{n}").into(),
                },
                group_name: SpanName {
                    category: self.category.clone(),
                    title: format!("{} *{n}", self.name).into(),
                },
            },
            (Kind::Other, Some(n)) => SpanNames {
                nice_name: SpanName {
                    category: self.category.clone(),
                    title: format!("{} {n}", self.name).into(),
                },
                group_name: generic(),
            },
            (_, None) => SpanNames {
                nice_name: generic(),
                group_name: generic(),
            },
        }
    }
}

/// Reserved bit in [`SpanEvent::payload`] marking the child variant.
const CHILD_TAG: u64 = 1 << 63;

/// One entry in a span's timeline: either a stretch of self time, or a child
/// span. Sorted by start time within a span.
///
/// Hand-packed into two words instead of being written as a Rust enum. Both
/// logical variants are `(u64, non-zero u64)`, which leaves the compiler no
/// spare niche to store a discriminant, so the natural enum costs 24 bytes — a
/// whole extra word of tag. Events outnumber spans several to one (28.6M events
/// against 6.8M spans on the reference trace), so that word is hundreds of
/// megabytes of RSS.
///
/// `payload` holds a self-time duration, or a child index with [`CHILD_TAG`]
/// set. Both fit with room to spare: durations are in 1/100 µs, so the tag bit
/// is only reachable after ~2900 years of span time, and a child index is
/// bounded by the number of spans in the trace. The constructors assert this in
/// debug builds.
///
/// Deliberately holds no cache for its corrected self time. A per-event
/// `OnceLock<Timestamp>` used to be half of this struct, and it bought very
/// little: [`crate::span_ref::SpanRef::corrected_self_time`] caches the *sum*
/// over a span's events, which is what actually stops the interval-tree lookups
/// from repeating.
pub struct SpanEvent {
    start: Timestamp,
    payload: NonZeroU64,
}

/// The unpacked view of a [`SpanEvent`]. Produced by [`SpanEvent::kind`]; for
/// the traversals that only care about one variant, prefer
/// [`SpanEvent::child_index`] or [`SpanEvent::self_time_duration`].
pub enum SpanEventKind {
    SelfTime { duration: NonZeroU64 },
    Child { index: SpanIndex },
}

// 16 bytes = 8 (start) + 8 (payload). There is one of these per event and
// events outnumber spans several to one, so this assert is load-bearing: do not
// add a field here, and do not replace the packing with an enum.
const _: () = assert!(std::mem::size_of::<SpanEvent>() == 16);

/// `Span` is allocated once per span in the trace, so at tens of millions of
/// spans every byte here is tens of megabytes of RSS. This bound exists to make
/// a field addition a compile error rather than a code-review catch; lower it as
/// the hot/cold split lands, and never raise it without a note saying what the
/// bytes bought.
const _: () = assert!(std::mem::size_of::<Span>() == 192);

impl SpanEvent {
    /// Constructs a self-time event from start and end timestamps. Returns
    /// `None` if `end <= start` (zero or negative duration), which is why
    /// `payload` can be `NonZeroU64`.
    pub fn self_time(start: Timestamp, end: Timestamp) -> Option<Self> {
        let duration = NonZeroU64::new(*end.saturating_sub(start))?;
        debug_assert_eq!(
            duration.get() & CHILD_TAG,
            0,
            "self-time duration overflowed into the child tag bit"
        );
        Some(Self {
            start,
            payload: duration,
        })
    }

    /// Constructs a child event. `index` is a [`SpanIndex`] and so never zero,
    /// which keeps `payload` non-zero independently of the tag.
    pub fn child(start: Timestamp, index: SpanIndex) -> Self {
        let raw = index.get() as u64;
        debug_assert_eq!(
            raw & CHILD_TAG,
            0,
            "span index overflowed into the child tag bit"
        );
        Self {
            start,
            payload: NonZeroU64::new(raw | CHILD_TAG)
                .expect("child payload is non-zero because the tag bit is set"),
        }
    }

    pub fn start(&self) -> Timestamp {
        self.start
    }

    pub fn kind(&self) -> SpanEventKind {
        let raw = self.payload.get();
        match self.child_index() {
            Some(index) => SpanEventKind::Child { index },
            None => SpanEventKind::SelfTime {
                // SAFETY-free: `payload` is already `NonZeroU64`, and with the
                // tag clear it is the duration verbatim.
                duration: NonZeroU64::new(raw).expect("payload is non-zero"),
            },
        }
    }

    /// The child index, or `None` for a self-time event.
    pub fn child_index(&self) -> Option<SpanIndex> {
        let raw = self.payload.get();
        if raw & CHILD_TAG == 0 {
            return None;
        }
        Some(
            SpanIndex::new((raw & !CHILD_TAG) as usize)
                .expect("a child event is never constructed with index 0"),
        )
    }

    /// The self-time duration, or `None` for a child event.
    pub fn self_time_duration(&self) -> Option<NonZeroU64> {
        (self.payload.get() & CHILD_TAG == 0).then_some(self.payload)
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
    /// Lexicographic on `(start, payload)`, which reproduces the previous
    /// hand-written ordering exactly. [`CHILD_TAG`] is the high bit, so at equal
    /// start every self-time payload sorts below every child payload
    /// (self time before children); self-time events then order by duration and
    /// children by index, as before.
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.start
            .cmp(&other.start)
            .then_with(|| self.payload.cmp(&other.payload))
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
        assert_eq!(event.start(), start);
        assert_eq!(event.child_index(), None);
        let duration = event.self_time_duration().expect("expected SelfTime");
        assert_eq!(duration.get(), *end - *start);
        match event.kind() {
            SpanEventKind::SelfTime { duration } => assert_eq!(duration.get(), *end - *start),
            SpanEventKind::Child { .. } => panic!("expected SelfTime"),
        }
    }

    #[test]
    fn span_event_child_round_trips_through_the_tag_bit() {
        let start = Timestamp::from_micros(100);
        for raw in [1usize, 2, 65_535, 65_536, 13_300_000, usize::from(u16::MAX)] {
            let index = SpanIndex::new(raw).unwrap();
            let event = SpanEvent::child(start, index);
            assert_eq!(event.start(), start);
            assert_eq!(
                event.child_index(),
                Some(index),
                "index {raw} did not round-trip"
            );
            assert_eq!(event.self_time_duration(), None);
            match event.kind() {
                SpanEventKind::Child { index: got } => assert_eq!(got, index),
                SpanEventKind::SelfTime { .. } => panic!("expected Child"),
            }
        }
    }

    #[test]
    fn span_event_order_puts_self_time_before_children_at_equal_start() {
        // The packed ordering relies on CHILD_TAG being the high bit. This is
        // the property that lets `Ord` be a plain two-field comparison while
        // reproducing the previous hand-written match, so it is worth pinning.
        let t = Timestamp::from_micros(10);
        let self_time = SpanEvent::self_time(t, Timestamp::from_micros(20)).unwrap();
        let child = SpanEvent::child(t, SpanIndex::new(1).unwrap());
        assert!(self_time < child);

        // Self-time events at equal start order by duration.
        let shorter = SpanEvent::self_time(t, Timestamp::from_micros(15)).unwrap();
        assert!(shorter < self_time);

        // Children at equal start order by index.
        let child_2 = SpanEvent::child(t, SpanIndex::new(2).unwrap());
        assert!(child < child_2);

        // And start still dominates both.
        let later =
            SpanEvent::self_time(Timestamp::from_micros(11), Timestamp::from_micros(12)).unwrap();
        assert!(child_2 < later);
    }

    #[test]
    fn span_event_size_is_packed() {
        // Backstop for the const assert; if this fails the const assert above
        // would also fail, but having a test gives a clearer error message.
        assert_eq!(std::mem::size_of::<SpanEvent>(), 16);
    }
}
