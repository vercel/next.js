use std::{
    cmp::{max, min},
    env,
    num::NonZeroUsize,
    sync::{OnceLock, atomic::AtomicU64},
};

use rustc_hash::FxHashSet;
use turbo_rcstr::{RcStr, rcstr};

use crate::{
    self_time_tree::SelfTimeTree,
    span::{Span, SpanArgs, SpanEvent, SpanIndex, SpanTimeData},
    span_ref::SpanRef,
    timestamp::Timestamp,
};

pub type SpanId = NonZeroUsize;

/// This max depth is used to avoid deep recursion in the span tree,
/// which can lead to stack overflows and performance issues.
/// Spans deeper than this depth will be re-parented to an ancestor
/// at the cut-off depth (Flattening).
const CUT_OFF_DEPTH: u32 = 80;

/// A single memory usage sample: (timestamp, memory_bytes).
/// Sorted by timestamp.
type MemorySample = (Timestamp, u64);

/// Maximum number of memory samples returned in a query result.
const MAX_MEMORY_SAMPLES: usize = 200;

pub struct Store {
    pub(crate) spans: Vec<Span>,
    pub(crate) self_time_tree: Option<SelfTimeTree<SpanIndex>>,
    max_self_time_lookup_time: AtomicU64,
    /// Global sorted list of memory samples (timestamp, memory_bytes).
    memory_samples: Vec<MemorySample>,
}

fn new_root_span() -> Span {
    Span {
        parent: None,
        depth: 0,
        start: Timestamp::MAX,
        category: RcStr::default(),
        name: rcstr!("(root)"),
        args: SpanArgs::new(),
        events: Default::default(),
        is_complete: true,
        self_allocations: 0,
        self_allocation_count: 0,
        self_deallocations: 0,
        self_deallocation_count: 0,
        totals: OnceLock::new(),
        time_data: SpanTimeData {
            self_end: Timestamp::MAX,
            ..Default::default()
        },
        extra: OnceLock::new(),
        names: OnceLock::new(),
    }
}

impl Store {
    pub fn new() -> Self {
        Self {
            spans: {
                let mut v = Vec::with_capacity(131_072);
                v.push(new_root_span());
                v
            },
            self_time_tree: env::var("NO_CORRECTED_TIME")
                .ok()
                .is_none()
                .then(SelfTimeTree::new),
            max_self_time_lookup_time: AtomicU64::new(0),
            memory_samples: Vec::new(),
        }
    }

    pub fn reset(&mut self) {
        self.spans.truncate(1);
        self.spans[0] = new_root_span();
        if let Some(tree) = self.self_time_tree.as_mut() {
            *tree = SelfTimeTree::new();
        }
        *self.max_self_time_lookup_time.get_mut() = 0;
        self.memory_samples.clear();
    }

    pub fn optimize(&mut self) {
        if let Some(tree) = self.self_time_tree.as_mut() {
            tree.optimize();
        }
    }

    pub fn has_time_info(&self) -> bool {
        self.self_time_tree
            .as_ref()
            .is_none_or(|tree| tree.len() > 0)
    }

    pub fn add_span(
        &mut self,
        parent: Option<SpanIndex>,
        start: Timestamp,
        category: RcStr,
        name: RcStr,
        args: SpanArgs,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) -> SpanIndex {
        let id = SpanIndex::new(self.spans.len()).unwrap();
        let ignore_self_time = &name == "thread" || &name == "blocking";
        self.spans.push(Span {
            parent,
            depth: 0,
            start,
            category,
            name,
            args,
            events: Default::default(),
            is_complete: false,
            self_allocations: 0,
            self_allocation_count: 0,
            self_deallocations: 0,
            self_deallocation_count: 0,
            totals: OnceLock::new(),
            time_data: SpanTimeData {
                self_end: start,
                ignore_self_time,
                ..Default::default()
            },
            extra: OnceLock::new(),
            names: OnceLock::new(),
        });
        let mut parent = if let Some(parent) = parent {
            outdated_spans.insert(parent);
            &mut self.spans[parent.get()]
        } else {
            &mut self.spans[0]
        };
        let mut depth = parent.depth + 1;
        if depth >= CUT_OFF_DEPTH
            && let Some(parent_of_parent) = parent.parent
        {
            outdated_spans.insert(parent_of_parent);
            self.spans[id.get()].parent = Some(parent_of_parent);
            parent = &mut self.spans[parent_of_parent.get()];
            depth = CUT_OFF_DEPTH - 1;
        }
        if depth < CUT_OFF_DEPTH {
            parent.events.push(SpanEvent::Child { start, index: id });
        }
        parent.start = min(parent.start, start);
        let span = &mut self.spans[id.get()];
        span.depth = depth;
        id
    }

    pub fn add_args(
        &mut self,
        span_index: SpanIndex,
        args: Vec<(RcStr, RcStr)>,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) {
        let span = &mut self.spans[span_index.get()];
        span.args.extend(args);
        outdated_spans.insert(span_index);
    }

    pub fn set_max_self_time_lookup(&self, time: Timestamp) {
        let time = *time;
        let mut old = self
            .max_self_time_lookup_time
            .load(std::sync::atomic::Ordering::Relaxed);
        while old < time {
            match self.max_self_time_lookup_time.compare_exchange(
                old,
                time,
                std::sync::atomic::Ordering::Relaxed,
                std::sync::atomic::Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(real_old) => old = real_old,
            }
        }
    }

    fn insert_self_time(
        &mut self,
        start: Timestamp,
        end: Timestamp,
        span_index: SpanIndex,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) {
        if let Some(tree) = self.self_time_tree.as_mut() {
            if Timestamp::from_value(*self.max_self_time_lookup_time.get_mut()) >= start {
                tree.for_each_in_range_optimize(start, end, &mut |_, _, span| {
                    outdated_spans.insert(*span);
                });
            }
            tree.insert(start, end, span_index);
        }
    }

    pub fn add_self_time(
        &mut self,
        span_index: SpanIndex,
        start: Timestamp,
        end: Timestamp,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) {
        let event = SpanEvent::self_time(start, end);
        let span = &mut self.spans[span_index.get()];
        let time_data = &mut span.time_data;
        if time_data.ignore_self_time {
            return;
        }
        outdated_spans.insert(span_index);
        time_data.self_time += end - start;
        time_data.self_end = max(time_data.self_end, end);
        if let Some(event) = event {
            span.events.push(event);
            self.insert_self_time(start, end, span_index, outdated_spans);
        }
    }

    pub fn set_total_time(
        &mut self,
        span_index: SpanIndex,
        start_time: Timestamp,
        total_time: Timestamp,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) {
        let span = SpanRef {
            span: &self.spans[span_index.get()],
            store: self,
            index: span_index.get(),
        };
        let mut children = span
            .children()
            .map(|c| (c.span.start, c.span.time_data.self_end, c.index()))
            .collect::<Vec<_>>();
        children.sort();
        let self_end = start_time + total_time;
        let mut self_time = Timestamp::ZERO;
        let mut current = start_time;
        let mut events = Vec::new();
        for (start, end, index) in children {
            if start > current {
                if start > self_end {
                    if let Some(event) = SpanEvent::self_time(current, self_end) {
                        events.push(event);
                        self.insert_self_time(current, self_end, span_index, outdated_spans);
                        self_time += self_end - current;
                    }
                    break;
                }
                if let Some(event) = SpanEvent::self_time(current, start) {
                    events.push(event);
                    self.insert_self_time(current, start, span_index, outdated_spans);
                    self_time += start - current;
                }
            }
            events.push(SpanEvent::Child { start, index });
            current = max(current, end);
        }
        current -= start_time;
        if current < total_time {
            self_time += total_time - current;
            let st = current + start_time;
            let en = start_time + total_time;
            if let Some(event) = SpanEvent::self_time(st, en) {
                events.push(event);
                self.insert_self_time(st, en, span_index, outdated_spans);
            }
        }
        let span = &mut self.spans[span_index.get()];
        outdated_spans.insert(span_index);
        let time_data = &mut span.time_data;
        time_data.self_time = self_time;
        time_data.self_end = self_end;
        span.events = events.into();
        span.start = start_time;
    }

    pub fn set_parent(
        &mut self,
        span_index: SpanIndex,
        parent: SpanIndex,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) {
        outdated_spans.insert(span_index);
        let span = &mut self.spans[span_index.get()];
        let span_start = span.start;

        let old_parent = span.parent.replace(parent);
        let old_parent = if let Some(parent) = old_parent {
            outdated_spans.insert(parent);
            &mut self.spans[parent.get()]
        } else {
            &mut self.spans[0]
        };
        old_parent.events.retain_unordered(
            |event: &SpanEvent| !matches!(event, SpanEvent::Child { index, .. } if *index == span_index),
        );

        outdated_spans.insert(parent);
        let parent = &mut self.spans[parent.get()];
        parent.events.push(SpanEvent::Child {
            start: span_start,
            index: span_index,
        });
    }

    pub fn add_allocation(
        &mut self,
        span_index: SpanIndex,
        allocation: u64,
        count: u64,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) {
        let span = &mut self.spans[span_index.get()];
        outdated_spans.insert(span_index);
        span.self_allocations += allocation;
        span.self_allocation_count += count;
    }

    pub fn add_deallocation(
        &mut self,
        span_index: SpanIndex,
        deallocation: u64,
        count: u64,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) {
        let span = &mut self.spans[span_index.get()];
        outdated_spans.insert(span_index);
        span.self_deallocations += deallocation;
        span.self_deallocation_count += count;
    }

    pub fn add_memory_sample(&mut self, ts: Timestamp, memory: u64) {
        // Samples arrive nearly sorted (roughly chronological from the trace
        // writer), so an insertion-sort step is efficient: push to the end
        // then swap backward until the timestamp ordering is restored.
        self.memory_samples.push((ts, memory));
        let mut i = self.memory_samples.len() - 1;
        while i > 0 && self.memory_samples[i - 1].0 > ts {
            self.memory_samples.swap(i, i - 1);
            i -= 1;
        }
    }

    /// Returns up to `MAX_MEMORY_SAMPLES` memory samples in the range
    /// `[start, end]`. When more samples exist, groups of N consecutive
    /// samples are merged by taking the maximum memory value in each group.
    pub fn memory_samples_for_range(&self, start: Timestamp, end: Timestamp) -> Vec<u64> {
        // Binary search for the first sample >= start
        let lo = self.memory_samples.partition_point(|(ts, _)| *ts < start);
        // Binary search for the first sample > end
        let hi = self.memory_samples.partition_point(|(ts, _)| *ts <= end);

        let slice = &self.memory_samples[lo..hi];
        let count = slice.len();
        if count == 0 {
            return Vec::new();
        }

        if count <= MAX_MEMORY_SAMPLES {
            return slice.iter().map(|(_, mem)| *mem).collect();
        }

        // Merge groups of N samples, taking the max memory in each group.
        let n = count.div_ceil(MAX_MEMORY_SAMPLES);
        slice
            .chunks(n)
            .map(|chunk| chunk.iter().map(|(_, mem)| *mem).max().unwrap())
            .collect()
    }

    pub fn complete_span(&mut self, span_index: SpanIndex) {
        let span = &mut self.spans[span_index.get()];
        span.is_complete = true;
    }

    pub fn invalidate_outdated_spans(&mut self, outdated_spans: &FxHashSet<SpanId>) {
        fn invalidate_span(span: &mut Span) {
            span.time_data.end.take();
            span.time_data.total_time.take();
            span.time_data.corrected_self_time.take();
            span.time_data.corrected_total_time.take();
            for event in span.events.iter_mut_unordered() {
                if let SpanEvent::SelfTime(self_time) = event {
                    self_time.corrected_self_time.take();
                }
            }
            span.totals.take();
            span.extra.take();
        }

        for id in outdated_spans.iter() {
            let mut span = &mut self.spans[id.get()];
            loop {
                invalidate_span(span);
                let Some(parent) = span.parent else {
                    break;
                };
                if outdated_spans.contains(&parent) {
                    break;
                }
                span = &mut self.spans[parent.get()];
            }
        }

        invalidate_span(&mut self.spans[0]);
    }

    pub fn root_spans(&self) -> impl Iterator<Item = SpanRef<'_>> {
        self.spans[0].events.iter().filter_map(|event| match event {
            &SpanEvent::Child { index: id, .. } => Some(SpanRef {
                span: &self.spans[id.get()],
                store: self,
                index: id.get(),
            }),
            _ => None,
        })
    }

    pub fn root_span(&self) -> SpanRef<'_> {
        SpanRef {
            span: &self.spans[0],
            store: self,
            index: 0,
        }
    }

    pub fn span(&self, id: SpanId) -> Option<(SpanRef<'_>, bool)> {
        let id = id.get();
        let is_graph = id & 1 == 1;
        let index = id >> 1;
        self.spans.get(index).map(|span| {
            (
                SpanRef {
                    span,
                    store: self,
                    index,
                },
                is_graph,
            )
        })
    }
}
