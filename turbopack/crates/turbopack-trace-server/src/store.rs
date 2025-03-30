use std::{
    cmp::{max, min},
    env,
    mem::replace,
    num::NonZeroUsize,
    sync::{atomic::AtomicU64, OnceLock},
};

use rustc_hash::FxHashSet;

use crate::{
    self_time_tree::SelfTimeTree,
    span::{Span, SpanEvent, SpanIndex},
    span_ref::SpanRef,
    timestamp::Timestamp,
};

pub type SpanId = NonZeroUsize;

const CUT_OFF_DEPTH: u32 = 150;

pub struct Store {
    pub(crate) spans: Vec<Span>,
    pub(crate) self_time_tree: Option<SelfTimeTree<SpanIndex>>,
    max_self_time_lookup_time: AtomicU64,
}

fn new_root_span() -> Span {
    Span {
        parent: None,
        depth: 0,
        start: Timestamp::MAX,
        category: "".into(),
        name: "(root)".into(),
        args: vec![],
        events: vec![],
        is_complete: true,
        max_depth: OnceLock::new(),
        self_allocations: 0,
        self_allocation_count: 0,
        self_deallocations: 0,
        self_deallocation_count: 0,
        total_allocations: OnceLock::new(),
        total_deallocations: OnceLock::new(),
        total_persistent_allocations: OnceLock::new(),
        total_allocation_count: OnceLock::new(),
        total_span_count: OnceLock::new(),
        time_data: OnceLock::new(),
        extra: OnceLock::new(),
        names: OnceLock::new(),
    }
}

impl Store {
    pub fn new() -> Self {
        Self {
            spans: vec![new_root_span()],
            self_time_tree: env::var("NO_CORRECTED_TIME")
                .ok()
                .is_none()
                .then(SelfTimeTree::new),
            max_self_time_lookup_time: AtomicU64::new(0),
        }
    }

    pub fn reset(&mut self) {
        self.spans.truncate(1);
        self.spans[0] = new_root_span();
        if let Some(tree) = self.self_time_tree.as_mut() {
            *tree = SelfTimeTree::new();
        }
        *self.max_self_time_lookup_time.get_mut() = 0;
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
        category: String,
        name: String,
        args: Vec<(String, String)>,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) -> SpanIndex {
        let id = SpanIndex::new(self.spans.len()).unwrap();
        self.spans.push(Span {
            parent,
            depth: 0,
            start,
            category,
            name,
            args,
            events: vec![],
            is_complete: false,
            max_depth: OnceLock::new(),
            self_allocations: 0,
            self_allocation_count: 0,
            self_deallocations: 0,
            self_deallocation_count: 0,
            total_allocations: OnceLock::new(),
            total_deallocations: OnceLock::new(),
            total_persistent_allocations: OnceLock::new(),
            total_allocation_count: OnceLock::new(),
            total_span_count: OnceLock::new(),
            time_data: OnceLock::new(),
            extra: OnceLock::new(),
            names: OnceLock::new(),
        });
        let parent = if let Some(parent) = parent {
            outdated_spans.insert(parent);
            &mut self.spans[parent.get()]
        } else {
            &mut self.spans[0]
        };
        parent.start = min(parent.start, start);
        let depth = parent.depth + 1;
        if depth < CUT_OFF_DEPTH {
            parent.events.push(SpanEvent::Child { index: id });
        }
        let span = &mut self.spans[id.get()];
        span.depth = depth;
        id
    }

    pub fn add_args(
        &mut self,
        span_index: SpanIndex,
        args: Vec<(String, String)>,
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
                tree.for_each_in_range(start, end, |_, _, span| {
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
        let span = &mut self.spans[span_index.get()];
        let time_data = span.time_data_mut();
        if time_data.ignore_self_time {
            return;
        }
        outdated_spans.insert(span_index);
        time_data.self_time += end - start;
        time_data.self_end = max(time_data.self_end, end);
        span.events.push(SpanEvent::SelfTime { start, end });
        self.insert_self_time(start, end, span_index, outdated_spans);
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
            .map(|c| (c.span.start, c.span.time_data().self_end, c.index()))
            .collect::<Vec<_>>();
        children.sort();
        let self_end = start_time + total_time;
        let mut self_time = Timestamp::ZERO;
        let mut current = start_time;
        let mut events = Vec::new();
        for (start, end, index) in children {
            if start > current {
                if start > self_end {
                    events.push(SpanEvent::SelfTime {
                        start: current,
                        end: self_end,
                    });
                    self.insert_self_time(current, self_end, span_index, outdated_spans);
                    self_time += self_end - current;
                    break;
                }
                events.push(SpanEvent::SelfTime {
                    start: current,
                    end: start,
                });
                self.insert_self_time(current, start, span_index, outdated_spans);
                self_time += start - current;
            }
            events.push(SpanEvent::Child { index });
            current = max(current, end);
        }
        current -= start_time;
        if current < total_time {
            self_time += total_time - current;
            events.push(SpanEvent::SelfTime {
                start: current + start_time,
                end: start_time + total_time,
            });
            self.insert_self_time(
                current + start_time,
                start_time + total_time,
                span_index,
                outdated_spans,
            );
        }
        let span = &mut self.spans[span_index.get()];
        outdated_spans.insert(span_index);
        let time_data = span.time_data_mut();
        time_data.self_time = self_time;
        time_data.self_end = self_end;
        span.events = events;
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

        let old_parent = replace(&mut span.parent, Some(parent));
        let old_parent = if let Some(parent) = old_parent {
            outdated_spans.insert(parent);
            &mut self.spans[parent.get()]
        } else {
            &mut self.spans[0]
        };
        if let Some(index) = old_parent
            .events
            .iter()
            .position(|event| *event == SpanEvent::Child { index: span_index })
        {
            old_parent.events.remove(index);
        }

        outdated_spans.insert(parent);
        let parent = &mut self.spans[parent.get()];
        parent.events.push(SpanEvent::Child { index: span_index });
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

    pub fn complete_span(&mut self, span_index: SpanIndex) {
        let span = &mut self.spans[span_index.get()];
        span.is_complete = true;
    }

    pub fn invalidate_outdated_spans(&mut self, outdated_spans: &FxHashSet<SpanId>) {
        fn invalidate_span(span: &mut Span) {
            if let Some(time_data) = span.time_data.get_mut() {
                time_data.end.take();
                time_data.total_time.take();
                time_data.corrected_self_time.take();
                time_data.corrected_total_time.take();
            }
            span.total_allocations.take();
            span.total_deallocations.take();
            span.total_persistent_allocations.take();
            span.total_allocation_count.take();
            span.total_span_count.take();
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
            &SpanEvent::Child { index: id } => Some(SpanRef {
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
