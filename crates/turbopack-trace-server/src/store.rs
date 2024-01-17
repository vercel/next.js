use std::{cmp::max, collections::HashSet, num::NonZeroUsize, sync::OnceLock};

use crate::{
    span::{Span, SpanEvent, SpanIndex},
    span_ref::SpanRef,
};

pub type SpanId = NonZeroUsize;

pub struct Store {
    pub(crate) spans: Vec<Span>,
}

impl Store {
    pub fn new() -> Self {
        Self {
            spans: vec![Span {
                index: SpanIndex::MAX,
                parent: None,
                start: 0,
                ignore_self_time: false,
                self_end: u64::MAX,
                category: "".into(),
                name: "(root)".into(),
                args: vec![],
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
                corrected_self_time: OnceLock::new(),
                corrected_total_time: OnceLock::new(),
                search_index: OnceLock::new(),
            }],
        }
    }

    pub fn reset(&mut self) {
        self.spans.truncate(1);
        let root = &mut self.spans[0];
        root.events.clear();
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
        parent.events.push(SpanEvent::Child { id });
        id
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
        for id in outdated_spans.iter() {
            let mut span = &mut self.spans[id.get()];
            loop {
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
                let Some(parent) = span.parent else {
                    break;
                };
                if outdated_spans.contains(&parent) {
                    break;
                }
                span = &mut self.spans[parent.get()];
            }
        }
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

    pub fn span(&self, id: SpanId) -> Option<(SpanRef<'_>, bool)> {
        let id = id.get();
        let is_graph = id & 1 == 1;
        let index = id >> 1;
        self.spans
            .get(index)
            .map(|span| (SpanRef { span, store: self }, is_graph))
    }
}
