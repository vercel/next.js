use std::{
    cmp::max,
    collections::VecDeque,
    fmt::{Debug, Formatter},
    vec,
};

use hashbrown::HashMap;
use rayon::iter::{IntoParallelIterator, IntoParallelRefIterator, ParallelIterator};
use rustc_hash::FxHashSet;
use turbo_rcstr::{RcStr, rcstr};

use crate::{
    FxIndexMap,
    bottom_up::build_bottom_up_graph,
    span::{
        Span, SpanEvent, SpanEventSelfTime, SpanExtra, SpanGraphEvent, SpanIndex, SpanName,
        SpanNames, SpanTimeData, SpanTotals,
    },
    span_bottom_up_ref::SpanBottomUpRef,
    span_graph_ref::{SpanGraphEventRef, SpanGraphRef, event_map_to_list},
    store::{SpanId, Store},
    timestamp::Timestamp,
};

pub type GroupNameToDirectAndRecusiveSpans<'l> =
    FxIndexMap<(&'l str, &'l str), (Vec<SpanIndex>, Vec<SpanIndex>)>;

#[derive(Copy, Clone)]
pub struct SpanRef<'a> {
    pub(crate) span: &'a Span,
    pub(crate) store: &'a Store,
    pub(crate) index: usize,
}

impl<'a> SpanRef<'a> {
    pub fn id(&self) -> SpanId {
        unsafe { SpanId::new_unchecked(self.index << 1) }
    }

    pub fn index(&self) -> SpanIndex {
        SpanIndex::new(self.index).unwrap()
    }

    pub fn parent(&self) -> Option<SpanRef<'a>> {
        self.span.parent.map(|index| SpanRef {
            span: &self.store.spans[index.get()],
            store: self.store,
            index: index.get(),
        })
    }

    pub fn start(&self) -> Timestamp {
        self.span.start
    }

    pub fn time_data(&self) -> &'a SpanTimeData {
        &self.span.time_data
    }

    pub fn extra(&self) -> &'a SpanExtra {
        self.span.extra()
    }

    pub fn names(&self) -> &'a SpanNames {
        self.span.names()
    }

    pub fn end(&self) -> Timestamp {
        let time_data = self.time_data();
        *time_data.end.get_or_init(|| {
            max(
                time_data.self_end,
                self.children()
                    .map(|child| child.end())
                    .max()
                    .unwrap_or_default(),
            )
        })
    }

    pub fn is_complete(&self) -> bool {
        self.span.is_complete
    }

    pub fn is_root(&self) -> bool {
        self.index == 0
    }

    pub fn nice_name(&self) -> (&'a str, &'a str) {
        let SpanName { category, title } = &self.names().nice_name;
        (category.as_str(), title.as_str())
    }

    pub fn group_name(&self) -> (&'a str, &'a str) {
        let SpanName { category, title } = &self.names().group_name;
        (category.as_str(), title.as_str())
    }

    pub fn args(&self) -> impl Iterator<Item = (&str, &str)> {
        self.span.args.iter().map(|(k, v)| (k.as_str(), v.as_str()))
    }

    pub fn self_time(&self) -> Timestamp {
        self.time_data().self_time
    }

    pub fn self_allocations(&self) -> u64 {
        // 32 bytes for the tracing itself
        self.span.self_allocations.saturating_sub(32)
    }

    pub fn self_deallocations(&self) -> u64 {
        self.span.self_deallocations
    }

    pub fn self_persistent_allocations(&self) -> u64 {
        self.self_allocations()
            .saturating_sub(self.span.self_deallocations)
    }

    pub fn self_allocation_count(&self) -> u64 {
        // 4 allocations for the tracing itself
        self.span.self_allocation_count.saturating_sub(4)
    }

    pub fn self_span_count(&self) -> u64 {
        1
    }

    /// Events sorted by start time, including self time and children.
    pub fn events(&self) -> impl DoubleEndedIterator<Item = SpanEventRef<'a>> {
        self.span
            .events
            .iter()
            .map(|event: &'a SpanEvent| match event {
                SpanEvent::SelfTime(self_time) => SpanEventRef::SelfTime {
                    self_time: SpanEventSelfTimeRef {
                        store: self.store,
                        self_time,
                    },
                },
                SpanEvent::Child { index, .. } => SpanEventRef::Child {
                    span: SpanRef {
                        span: &self.store.spans[index.get()],
                        store: self.store,
                        index: index.get(),
                    },
                },
            })
    }

    /// Children sorted by start time, excluding self time.
    pub fn children(&self) -> impl DoubleEndedIterator<Item = SpanRef<'a>> + 'a + use<'a> {
        self.span.events.iter().filter_map(|event| match event {
            SpanEvent::SelfTime { .. } => None,
            SpanEvent::Child { index, .. } => Some(SpanRef {
                span: &self.store.spans[index.get()],
                store: self.store,
                index: index.get(),
            }),
        })
    }

    /// Children sorted by start time, excluding self time, in parallel.
    pub fn children_par(&self) -> impl ParallelIterator<Item = SpanRef<'a>> + 'a {
        self.span.events.par_iter().filter_map(|event| match event {
            SpanEvent::SelfTime { .. } => None,
            SpanEvent::Child { index, .. } => Some(SpanRef {
                span: &self.store.spans[index.get()],
                store: self.store,
                index: index.get(),
            }),
        })
    }

    pub fn total_time(&self) -> Timestamp {
        *self.time_data().total_time.get_or_init(|| {
            self.children()
                .map(|child| child.total_time())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
                + self.self_time()
        })
    }

    /// Compute (or fetch) the bundled subtree totals. All six totals share a
    /// single `OnceLock`, so the first call walks the subtree once and fills
    /// every field; subsequent calls return cached values. Children's bundles
    /// are computed recursively, so depth-many calls happen once per subtree
    /// regardless of which field is queried first.
    fn totals(&self) -> &'a SpanTotals {
        self.span.totals.get_or_init(|| {
            let mut t = SpanTotals {
                max_depth: 0,
                allocations: self.self_allocations(),
                deallocations: self.self_deallocations(),
                persistent_allocations: self.self_persistent_allocations(),
                allocation_count: self.self_allocation_count(),
                span_count: 1,
            };
            for child in self.children() {
                let c = child.totals();
                t.max_depth = max(t.max_depth, c.max_depth + 1);
                t.allocations += c.allocations;
                t.deallocations += c.deallocations;
                t.persistent_allocations += c.persistent_allocations;
                t.allocation_count += c.allocation_count;
                t.span_count += c.span_count;
            }
            t
        })
    }

    pub fn total_allocations(&self) -> u64 {
        self.totals().allocations
    }

    pub fn total_deallocations(&self) -> u64 {
        self.totals().deallocations
    }

    pub fn total_persistent_allocations(&self) -> u64 {
        self.totals().persistent_allocations
    }

    pub fn total_allocation_count(&self) -> u64 {
        self.totals().allocation_count
    }

    pub fn total_span_count(&self) -> u64 {
        self.totals().span_count
    }

    pub fn corrected_self_time(&self) -> Timestamp {
        let store = self.store;
        *self.time_data().corrected_self_time.get_or_init(|| {
            let mut self_time = self
                .span
                .events
                .par_iter()
                .filter_map(|event: &'a SpanEvent| {
                    if let SpanEvent::SelfTime(self_time) = event {
                        return Some(
                            SpanEventSelfTimeRef { store, self_time }.corrected_self_time(),
                        );
                    }
                    None
                })
                .sum();
            if self.children().next().is_none() {
                self_time = max(self_time, Timestamp::from_value(1));
            }
            self_time
        })
    }

    pub fn corrected_total_time(&self) -> Timestamp {
        *self.time_data().corrected_total_time.get_or_init(|| {
            self.children_par()
                .map(|child| child.corrected_total_time())
                .sum::<Timestamp>()
                + self.corrected_self_time()
        })
    }

    pub fn max_depth(&self) -> u32 {
        self.totals().max_depth
    }

    pub fn graph(&self) -> impl Iterator<Item = SpanGraphEventRef<'a>> + '_ {
        self.extra()
            .graph
            .get_or_init(|| {
                struct Entry<'a> {
                    span: SpanRef<'a>,
                    recursive: Vec<SpanIndex>,
                }
                let entries = self
                    .children_par()
                    .map(|span| {
                        let name = span.group_name();
                        let mut recursive = Vec::new();
                        let mut queue = VecDeque::with_capacity(0);
                        for nested_child in span.children() {
                            let nested_name = nested_child.group_name();
                            if name == nested_name {
                                recursive.push(nested_child.index());
                                queue.push_back(nested_child);
                            }
                        }
                        while let Some(child) = queue.pop_front() {
                            for nested_child in child.children() {
                                let nested_name = nested_child.group_name();
                                if name == nested_name {
                                    recursive.push(nested_child.index());
                                    queue.push_back(nested_child);
                                }
                            }
                        }
                        Entry { span, recursive }
                    })
                    .collect_vec_list();
                let mut map: GroupNameToDirectAndRecusiveSpans = FxIndexMap::default();
                for Entry {
                    span,
                    mut recursive,
                } in entries.into_iter().flatten()
                {
                    let name = span.group_name();
                    let (list, recursive_list) = map.entry(name).or_default();
                    list.push(span.index());
                    recursive_list.append(&mut recursive);
                }
                event_map_to_list(map)
            })
            .iter()
            .map(|event| match event {
                SpanGraphEvent::SelfTime { duration } => SpanGraphEventRef::SelfTime {
                    duration: *duration,
                },
                SpanGraphEvent::Child { child } => SpanGraphEventRef::Child {
                    graph: SpanGraphRef {
                        graph: child.clone(),
                        store: self.store,
                    },
                },
            })
    }

    pub fn bottom_up(self) -> impl Iterator<Item = SpanBottomUpRef<'a>> {
        self.extra()
            .bottom_up
            .get_or_init(|| build_bottom_up_graph([self].into_iter()))
            .iter()
            .map(move |bottom_up| SpanBottomUpRef {
                bottom_up: bottom_up.clone(),
                store: self.store,
            })
    }

    pub fn search(&self, query: &str) -> impl Iterator<Item = SpanRef<'a>> {
        let mut query_items = query.split(",").map(str::trim);
        let index = self.search_index();
        let mut result = FxHashSet::default();
        let query = query_items.next().unwrap();
        for (key, spans) in index {
            if key.contains(query) {
                result.extend(spans.iter().copied());
            }
        }
        for query in query_items {
            let mut and_result = FxHashSet::default();
            for (key, spans) in index {
                if key.contains(query) {
                    and_result.extend(spans.iter().copied());
                }
            }
            result.retain(|index| and_result.contains(index));
        }
        let store = self.store;
        result.into_iter().map(move |index| SpanRef {
            span: &store.spans[index.get()],
            store,
            index: index.get(),
        })
    }

    fn search_index(&self) -> &HashMap<RcStr, Vec<SpanIndex>> {
        self.extra().search_index.get_or_init(|| {
            let mut all_spans = Vec::new();
            all_spans.push(self.index);
            let mut i = 0;
            while i < all_spans.len() {
                let index = all_spans[i];
                let span = SpanRef {
                    span: &self.store.spans[index],
                    store: self.store,
                    index,
                };
                for child in span.children() {
                    all_spans.push(child.index);
                }
                i += 1;
            }

            enum SpanOrMap<'a> {
                Span(SpanRef<'a>),
                Map(HashMap<RcStr, Vec<SpanIndex>>),
            }

            /// Insert `span_index` into `index` under the given key.
            ///
            /// `lookup` is the string used for the hash lookup. `make_key` produces
            /// the stored map key when a new entry is created (may differ from
            /// `lookup`, e.g. `"name=foo"` stored under the hash of `"foo"`).
            fn push_to_index(
                index: &mut HashMap<RcStr, Vec<SpanIndex>>,
                lookup: &str,
                make_key: impl FnOnce() -> RcStr,
                span_index: SpanIndex,
            ) {
                index
                    .raw_entry_mut()
                    .from_key(lookup)
                    .and_modify(|_, v| v.push(span_index))
                    .or_insert_with(|| (make_key(), vec![span_index]));
            }

            fn add_span_to_map<'a>(index: &mut HashMap<RcStr, Vec<SpanIndex>>, span: SpanRef<'a>) {
                if span.is_root() {
                    return;
                }
                let (cat, name) = span.nice_name();
                if !cat.is_empty() {
                    push_to_index(index, cat, || RcStr::from(cat), span.index());
                }
                if !name.is_empty() {
                    push_to_index(
                        index,
                        name,
                        || RcStr::from(format!("name={name}")),
                        span.index(),
                    );
                }
                for (k, v) in span.span.args.iter() {
                    push_to_index(
                        index,
                        v.as_str(),
                        || RcStr::from(format!("{k}={v}")),
                        span.index(),
                    );
                }
                if !span.is_complete() && span.span.name != "thread" {
                    push_to_index(
                        index,
                        "incomplete_span",
                        || rcstr!("incomplete_span"),
                        span.index(),
                    );
                }
            }

            let result = all_spans
                .into_par_iter()
                .map(|index| {
                    SpanOrMap::Span(SpanRef {
                        span: &self.store.spans[index],
                        store: self.store,
                        index,
                    })
                })
                .reduce(
                    || SpanOrMap::Map(HashMap::default()),
                    |a, b| {
                        let mut map = match a {
                            SpanOrMap::Span(span) => {
                                let mut map = HashMap::default();
                                add_span_to_map(&mut map, span);
                                map
                            }
                            SpanOrMap::Map(map) => map,
                        };
                        match b {
                            SpanOrMap::Span(span) => {
                                add_span_to_map(&mut map, span);
                            }
                            SpanOrMap::Map(other_map) => {
                                for (name, value) in other_map {
                                    map.entry(name).or_default().extend(value);
                                }
                            }
                        }
                        SpanOrMap::Map(map)
                    },
                );
            match result {
                SpanOrMap::Span(span) => {
                    let mut map = HashMap::default();
                    add_span_to_map(&mut map, span);
                    map
                }
                SpanOrMap::Map(map) => map,
            }
        })
    }
}

impl Debug for SpanRef<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SpanRef")
            .field("id", &self.id())
            .field("name", &self.nice_name())
            .field("start", &self.start())
            .field("end", &self.end())
            .field("is_complete", &self.is_complete())
            .field("self_time", &self.self_time())
            .field("total_time", &self.total_time())
            .field("max_depth", &self.max_depth())
            .finish()
    }
}

pub struct SpanEventSelfTimeRef<'a> {
    store: &'a Store,
    self_time: &'a SpanEventSelfTime,
}

impl<'a> SpanEventSelfTimeRef<'a> {
    pub fn start(&self) -> Timestamp {
        self.self_time.start
    }

    pub fn end(&self) -> Timestamp {
        self.self_time.end()
    }

    pub fn corrected_self_time(&self) -> Timestamp {
        *self.self_time.corrected_self_time.get_or_init(|| {
            // `duration` is `NonZeroU64`, so zero-duration events are filtered
            // at construction time (see `SpanEvent::self_time`).
            let end = self.self_time.end();
            let duration = Timestamp::from_value(self.self_time.duration.get());
            self.store.set_max_self_time_lookup(end);
            self.store.self_time_tree.as_ref().map_or(duration, |tree| {
                tree.lookup_range_corrected_time(self.self_time.start, end)
            })
        })
    }
}

pub enum SpanEventRef<'a> {
    SelfTime { self_time: SpanEventSelfTimeRef<'a> },
    Child { span: SpanRef<'a> },
}

impl SpanEventRef<'_> {
    pub fn total_time(&self) -> Timestamp {
        match self {
            SpanEventRef::SelfTime {
                self_time: event, ..
            } => event.end().saturating_sub(event.start()),
            SpanEventRef::Child { span } => span.total_time(),
        }
    }

    pub fn corrected_self_time(&self) -> Timestamp {
        match self {
            SpanEventRef::SelfTime { self_time: event } => event.corrected_self_time(),
            SpanEventRef::Child { span } => span.corrected_self_time(),
        }
    }
}

#[cfg(test)]
mod tests {
    use rustc_hash::FxHashSet;
    use turbo_rcstr::RcStr;

    use crate::{span::SpanArgs, span_ref::SpanRef, store::Store, timestamp::Timestamp};

    fn span_ref<'a>(store: &'a Store, idx: crate::span::SpanIndex) -> SpanRef<'a> {
        SpanRef {
            span: &store.spans[idx.get()],
            store,
            index: idx.get(),
        }
    }

    #[test]
    fn totals_aggregate_subtree() {
        let mut store = Store::new();
        let mut outdated = FxHashSet::default();

        // root → a → b
        // root → c
        let a = store.add_span(
            None,
            Timestamp::from_micros(0),
            RcStr::default(),
            RcStr::from("a"),
            SpanArgs::new(),
            &mut outdated,
        );
        let b = store.add_span(
            Some(a),
            Timestamp::from_micros(1),
            RcStr::default(),
            RcStr::from("b"),
            SpanArgs::new(),
            &mut outdated,
        );
        let c = store.add_span(
            None,
            Timestamp::from_micros(2),
            RcStr::default(),
            RcStr::from("c"),
            SpanArgs::new(),
            &mut outdated,
        );

        // Use values large enough that the 32-byte/4-allocation tracing
        // overhead subtraction in `self_allocations()` / `self_allocation_count()`
        // doesn't dominate.
        store.add_allocation(a, 1000, 10, &mut outdated);
        store.add_allocation(b, 500, 5, &mut outdated);
        store.add_allocation(c, 200, 2, &mut outdated);

        let a_ref = span_ref(&store, a);
        let b_ref = span_ref(&store, b);
        let c_ref = span_ref(&store, c);

        // Sanity: per-span self_* values reflect the saturating overhead subtraction.
        assert_eq!(a_ref.self_allocations(), 1000 - 32);
        assert_eq!(b_ref.self_allocations(), 500 - 32);
        assert_eq!(c_ref.self_allocations(), 200 - 32);

        // Totals are the recursive subtree sum of self_*.
        assert_eq!(
            a_ref.total_allocations(),
            a_ref.self_allocations() + b_ref.self_allocations()
        );
        assert_eq!(b_ref.total_allocations(), b_ref.self_allocations());
        assert_eq!(c_ref.total_allocations(), c_ref.self_allocations());

        // span_count is 1 + child count.
        assert_eq!(a_ref.total_span_count(), 2);
        assert_eq!(b_ref.total_span_count(), 1);
        assert_eq!(c_ref.total_span_count(), 1);

        // total_allocation_count similarly.
        assert_eq!(
            a_ref.total_allocation_count(),
            a_ref.self_allocation_count() + b_ref.self_allocation_count()
        );
    }

    #[test]
    fn totals_invalidate_and_recompute() {
        let mut store = Store::new();
        let mut outdated = FxHashSet::default();
        let s = store.add_span(
            None,
            Timestamp::from_micros(0),
            RcStr::default(),
            RcStr::from("s"),
            SpanArgs::new(),
            &mut outdated,
        );
        store.add_allocation(s, 1000, 10, &mut outdated);

        // Cache the totals.
        let before = span_ref(&store, s).total_allocations();
        assert_eq!(before, 1000 - 32);

        // Add more allocations and invalidate.
        let mut outdated = FxHashSet::default();
        store.add_allocation(s, 200, 2, &mut outdated);
        store.invalidate_outdated_spans(&outdated);

        // After invalidation, the cached totals must be recomputed from new self_*.
        let after = span_ref(&store, s).total_allocations();
        assert_eq!(after, 1200 - 32);
    }
}
