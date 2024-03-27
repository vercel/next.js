use std::{
    cmp::{max, min},
    collections::HashSet,
    mem::replace,
    num::NonZeroUsize,
    sync::OnceLock,
};

use crate::{
    self_time_tree::SelfTimeTree,
    span::{Span, SpanEvent, SpanIndex},
    span_ref::SpanRef,
};

pub type SpanId = NonZeroUsize;

const CUT_OFF_DEPTH: u32 = 150;

pub struct Store {
    pub(crate) spans: Vec<Span>,
    pub(crate) self_time_tree: SelfTimeTree<SpanIndex>,
}

fn new_root_span() -> Span {
    Span {
        index: SpanIndex::MAX,
        parent: None,
        depth: 0,
        start: u64::MAX,
        ignore_self_time: false,
        self_end: 0,
        category: "".into(),
        name: "(root)".into(),
        args: vec![],
        events: vec![],
        is_complete: true,
        end: OnceLock::new(),
        nice_name: OnceLock::new(),
        group_name: OnceLock::new(),
        max_depth: OnceLock::new(),
        graph: OnceLock::new(),
        bottom_up: OnceLock::new(),
        self_time: 0,
        self_allocations: 0,
        self_allocation_count: 0,
        self_deallocations: 0,
        self_deallocation_count: 0,
        total_time: OnceLock::new(),
        total_allocations: OnceLock::new(),
        total_deallocations: OnceLock::new(),
        total_persistent_allocations: OnceLock::new(),
        total_allocation_count: OnceLock::new(),
        total_span_count: OnceLock::new(),
        corrected_self_time: OnceLock::new(),
        corrected_total_time: OnceLock::new(),
        search_index: OnceLock::new(),
    }
}

impl Store {
    pub fn new() -> Self {
        Self {
            spans: vec![new_root_span()],
            self_time_tree: SelfTimeTree::new(),
        }
    }

    pub fn reset(&mut self) {
        self.spans.truncate(1);
        self.spans[0] = new_root_span();
        self.self_time_tree = SelfTimeTree::new();
    }

    pub fn add_span(
        &mut self,
        parent: Option<SpanIndex>,
        start: u64,
        category: String,
        name: String,
        args: Vec<(String, String)>,
        outdated_spans: &mut HashSet<SpanIndex>,
    ) -> SpanIndex {
        let id = SpanIndex::new(self.spans.len()).unwrap();
        self.spans.push(Span {
            index: id,
            parent,
            depth: 0,
            start,
            ignore_self_time: &name == "thread",
            self_end: start,
            category,
            name,
            args,
            events: vec![],
            is_complete: false,
            end: OnceLock::new(),
            nice_name: OnceLock::new(),
            group_name: OnceLock::new(),
            max_depth: OnceLock::new(),
            graph: OnceLock::new(),
            bottom_up: OnceLock::new(),
            self_time: 0,
            self_allocations: 0,
            self_allocation_count: 0,
            self_deallocations: 0,
            self_deallocation_count: 0,
            total_time: OnceLock::new(),
            total_allocations: OnceLock::new(),
            total_deallocations: OnceLock::new(),
            total_persistent_allocations: OnceLock::new(),
            total_allocation_count: OnceLock::new(),
            total_span_count: OnceLock::new(),
            corrected_self_time: OnceLock::new(),
            corrected_total_time: OnceLock::new(),
            search_index: OnceLock::new(),
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
            parent.events.push(SpanEvent::Child { id });
        }
        let span = &mut self.spans[id.get()];
        span.depth = depth;
        id
    }

    pub fn add_args(
        &mut self,
        span_index: SpanIndex,
        args: Vec<(String, String)>,
        outdated_spans: &mut HashSet<SpanIndex>,
    ) {
        let span = &mut self.spans[span_index.get()];
        span.args.extend(args);
        outdated_spans.insert(span_index);
    }

    fn insert_self_time(
        &mut self,
        start: u64,
        end: u64,
        span_index: SpanIndex,
        outdated_spans: &mut HashSet<SpanIndex>,
    ) {
        self.self_time_tree
            .for_each_in_range(start, end, |_, _, span| {
                outdated_spans.insert(*span);
            });
        self.self_time_tree.insert(start, end, span_index);
    }

    pub fn add_self_time(
        &mut self,
        span_index: SpanIndex,
        start: u64,
        end: u64,
        outdated_spans: &mut HashSet<SpanIndex>,
    ) {
        let span = &mut self.spans[span_index.get()];
        if span.ignore_self_time {
            return;
        }
        outdated_spans.insert(span_index);
        span.self_time += end - start;
        span.events.push(SpanEvent::SelfTime { start, end });
        span.self_end = max(span.self_end, end);
        self.insert_self_time(start, end, span_index, outdated_spans);
    }

    pub fn set_total_time(
        &mut self,
        span_index: SpanIndex,
        start_time: u64,
        total_time: u64,
        outdated_spans: &mut HashSet<SpanIndex>,
    ) {
        let span = SpanRef {
            span: &self.spans[span_index.get()],
            store: self,
        };
        let mut children = span
            .children()
            .map(|c| (c.span.start, c.span.self_end, c.span.index))
            .collect::<Vec<_>>();
        children.sort();
        let self_end = start_time + total_time;
        let mut self_time = 0;
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
            events.push(SpanEvent::Child { id: index });
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
        span.self_time = self_time;
        span.events = events;
        span.start = start_time;
        span.self_end = self_end;
    }

    pub fn set_parent(
        &mut self,
        span_index: SpanIndex,
        parent: SpanIndex,
        outdated_spans: &mut HashSet<SpanIndex>,
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
            .position(|event| *event == SpanEvent::Child { id: span_index })
        {
            old_parent.events.remove(index);
        }

        outdated_spans.insert(parent);
        let parent = &mut self.spans[parent.get()];
        parent.events.push(SpanEvent::Child { id: span_index });
    }

    pub fn add_allocation(
        &mut self,
        span_index: SpanIndex,
        allocation: u64,
        count: u64,
        outdated_spans: &mut HashSet<SpanIndex>,
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
        outdated_spans: &mut HashSet<SpanIndex>,
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

    pub fn invalidate_outdated_spans(&mut self, outdated_spans: &HashSet<SpanId>) {
        fn invalidate_span(span: &mut Span) {
            span.end.take();
            span.total_time.take();
            span.total_allocations.take();
            span.total_deallocations.take();
            span.total_persistent_allocations.take();
            span.total_allocation_count.take();
            span.corrected_self_time.take();
            span.corrected_total_time.take();
            span.graph.take();
            span.bottom_up.take();
            span.search_index.take();
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
            &SpanEvent::Child { id } => Some(SpanRef {
                span: &self.spans[id.get()],
                store: self,
            }),
            _ => None,
        })
    }

    pub fn root_span(&self) -> SpanRef<'_> {
        SpanRef {
            span: &self.spans[0],
            store: self,
        }
    }

    pub fn span(&self, id: SpanId) -> Option<(SpanRef<'_>, bool)> {
        let id = id.get();
        let is_graph = id & 1 == 1;
        let index = id >> 1;
        self.spans
            .get(index)
            .map(|span| (SpanRef { span, store: self }, is_graph))
    }
}
