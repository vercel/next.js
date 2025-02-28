use std::{
    collections::VecDeque,
    fmt::{Debug, Formatter},
    sync::{Arc, OnceLock},
};

use rayon::iter::{IntoParallelRefIterator, ParallelIterator};

use crate::{
    bottom_up::build_bottom_up_graph,
    span::{SpanGraph, SpanGraphEvent, SpanIndex},
    span_bottom_up_ref::SpanBottomUpRef,
    span_ref::SpanRef,
    store::{SpanId, Store},
    timestamp::Timestamp,
    FxIndexMap,
};

#[derive(Clone)]
pub struct SpanGraphRef<'a> {
    pub(crate) graph: Arc<SpanGraph>,
    pub(crate) store: &'a Store,
}

impl<'a> SpanGraphRef<'a> {
    pub fn first_span(&self) -> SpanRef<'a> {
        let index = self.graph.root_spans[0].get();
        SpanRef {
            span: &self.store.spans[index],
            store: self.store,
            index,
        }
    }

    pub fn id(&self) -> SpanId {
        unsafe { SpanId::new_unchecked((self.first_span().index << 1) | 1) }
    }

    pub fn nice_name(&self) -> (&str, &str) {
        if self.count() == 1 {
            self.first_span().nice_name()
        } else {
            ("", self.first_span().group_name())
        }
    }

    pub fn count(&self) -> usize {
        self.graph.root_spans.len() + self.graph.recursive_spans.len()
    }

    pub fn root_spans(&self) -> impl DoubleEndedIterator<Item = SpanRef<'a>> + '_ {
        self.graph.root_spans.iter().map(move |span| SpanRef {
            span: &self.store.spans[span.get()],
            store: self.store,
            index: span.get(),
        })
    }

    fn recursive_spans(&self) -> impl DoubleEndedIterator<Item = SpanRef<'a>> + '_ {
        self.graph
            .root_spans
            .iter()
            .chain(self.graph.recursive_spans.iter())
            .map(move |span| SpanRef {
                span: &self.store.spans[span.get()],
                store: self.store,
                index: span.get(),
            })
    }

    fn recursive_spans_par(&self) -> impl ParallelIterator<Item = SpanRef<'a>> + '_ {
        self.graph
            .root_spans
            .par_iter()
            .chain(self.graph.recursive_spans.par_iter())
            .map(move |span| SpanRef {
                span: &self.store.spans[span.get()],
                store: self.store,
                index: span.get(),
            })
    }

    fn events_vec_ref(&self) -> &Vec<SpanGraphEvent> {
        self.graph.events.get_or_init(|| {
            if self.count() == 1 {
                let _ = self.first_span().graph();
                self.first_span().extra().graph.get().unwrap().clone()
            } else {
                let self_group = self.first_span().group_name();
                let mut map: FxIndexMap<&str, (Vec<SpanIndex>, Vec<SpanIndex>)> =
                    FxIndexMap::default();
                let mut queue = VecDeque::with_capacity(8);
                for span in self.recursive_spans() {
                    for span in span.children() {
                        let name = span.group_name();
                        if name != self_group {
                            let (list, recusive_list) = map.entry(name).or_default();
                            list.push(span.index());
                            queue.push_back(span);
                            while let Some(child) = queue.pop_front() {
                                for nested_child in child.children() {
                                    let nested_name = nested_child.group_name();
                                    if name == nested_name {
                                        recusive_list.push(nested_child.index());
                                        queue.push_back(nested_child);
                                    }
                                }
                            }
                        }
                    }
                }
                event_map_to_list(map)
            }
        })
    }

    pub fn events(&self) -> impl DoubleEndedIterator<Item = SpanGraphEventRef<'a>> + '_ {
        self.events_vec_ref().iter().map(|graph| match graph {
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

    pub fn events_par(&self) -> impl ParallelIterator<Item = SpanGraphEventRef<'a>> + '_ {
        self.events_vec_ref().par_iter().map(|graph| match graph {
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

    pub fn children(&self) -> impl DoubleEndedIterator<Item = SpanGraphRef<'a>> + '_ {
        self.events().filter_map(|event| match event {
            SpanGraphEventRef::SelfTime { .. } => None,
            SpanGraphEventRef::Child { graph: span } => Some(span),
        })
    }

    pub fn children_par(&self) -> impl ParallelIterator<Item = SpanGraphRef<'a>> + '_ {
        self.events_par().filter_map(|event| match event {
            SpanGraphEventRef::SelfTime { .. } => None,
            SpanGraphEventRef::Child { graph: span } => Some(span),
        })
    }

    pub fn bottom_up(&self) -> impl Iterator<Item = SpanBottomUpRef<'a>> + '_ {
        self.graph
            .bottom_up
            .get_or_init(|| build_bottom_up_graph(self.root_spans()))
            .iter()
            .map(move |bottom_up| SpanBottomUpRef {
                bottom_up: bottom_up.clone(),
                store: self.store,
            })
    }

    pub fn max_depth(&self) -> u32 {
        *self.graph.max_depth.get_or_init(|| {
            self.children()
                .map(|graph| graph.max_depth() + 1)
                .max()
                .unwrap_or_default()
        })
    }

    pub fn self_time(&self) -> Timestamp {
        *self.graph.self_time.get_or_init(|| {
            self.recursive_spans()
                .map(|span| span.self_time())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
        })
    }

    pub fn total_time(&self) -> Timestamp {
        *self.graph.total_time.get_or_init(|| {
            self.children()
                .map(|graph| graph.total_time())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
                + self.self_time()
        })
    }

    pub fn self_allocations(&self) -> u64 {
        *self.graph.self_allocations.get_or_init(|| {
            self.recursive_spans()
                .map(|span| span.self_allocations())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
        })
    }

    pub fn self_deallocations(&self) -> u64 {
        *self.graph.self_deallocations.get_or_init(|| {
            self.recursive_spans()
                .map(|span| span.self_deallocations())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
        })
    }

    pub fn self_persistent_allocations(&self) -> u64 {
        *self.graph.self_persistent_allocations.get_or_init(|| {
            self.recursive_spans()
                .map(|span| span.self_persistent_allocations())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
        })
    }

    pub fn self_allocation_count(&self) -> u64 {
        *self.graph.self_allocation_count.get_or_init(|| {
            self.recursive_spans()
                .map(|span| span.self_allocation_count())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
        })
    }

    pub fn self_span_count(&self) -> u64 {
        self.graph.root_spans.len() as u64 + self.graph.recursive_spans.len() as u64
    }

    pub fn total_allocations(&self) -> u64 {
        *self.graph.total_allocations.get_or_init(|| {
            self.children()
                .map(|graph| graph.total_allocations())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
                + self.self_allocations()
        })
    }

    pub fn total_deallocations(&self) -> u64 {
        *self.graph.total_deallocations.get_or_init(|| {
            self.children()
                .map(|graph| graph.total_deallocations())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
                + self.self_deallocations()
        })
    }

    pub fn total_persistent_allocations(&self) -> u64 {
        *self.graph.total_persistent_allocations.get_or_init(|| {
            self.children()
                .map(|graph| graph.total_persistent_allocations())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
                + self.self_persistent_allocations()
        })
    }

    pub fn total_allocation_count(&self) -> u64 {
        *self.graph.total_allocation_count.get_or_init(|| {
            self.children()
                .map(|graph| graph.total_allocation_count())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
                + self.self_allocation_count()
        })
    }

    pub fn total_span_count(&self) -> u64 {
        *self.graph.total_span_count.get_or_init(|| {
            self.children()
                .map(|graph| graph.total_span_count())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
                + self.self_span_count()
        })
    }

    pub fn corrected_self_time(&self) -> Timestamp {
        *self.graph.corrected_self_time.get_or_init(|| {
            self.recursive_spans_par()
                .map(|span| span.corrected_self_time())
                .sum::<Timestamp>()
        })
    }

    pub fn corrected_total_time(&self) -> Timestamp {
        *self.graph.corrected_total_time.get_or_init(|| {
            self.children_par()
                .map(|graph| graph.corrected_total_time())
                .sum::<Timestamp>()
                + self.corrected_self_time()
        })
    }
}

pub fn event_map_to_list(
    map: FxIndexMap<&str, (Vec<SpanIndex>, Vec<SpanIndex>)>,
) -> Vec<SpanGraphEvent> {
    map.into_iter()
        .map(|(_, (root_spans, recursive_spans))| {
            let graph = SpanGraph {
                root_spans,
                recursive_spans,
                max_depth: OnceLock::new(),
                events: OnceLock::new(),
                self_time: OnceLock::new(),
                self_allocations: OnceLock::new(),
                self_deallocations: OnceLock::new(),
                self_persistent_allocations: OnceLock::new(),
                self_allocation_count: OnceLock::new(),
                total_time: OnceLock::new(),
                total_allocations: OnceLock::new(),
                total_deallocations: OnceLock::new(),
                total_persistent_allocations: OnceLock::new(),
                total_allocation_count: OnceLock::new(),
                total_span_count: OnceLock::new(),
                corrected_self_time: OnceLock::new(),
                corrected_total_time: OnceLock::new(),
                bottom_up: OnceLock::new(),
            };
            SpanGraphEvent::Child {
                child: Arc::new(graph),
            }
        })
        .collect()
}

impl Debug for SpanGraphRef<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SpanGraphRef")
            .field("id", &self.id())
            .field("name", &self.nice_name())
            .field("count", &self.count())
            .field("max_depth", &self.max_depth())
            .field("self_time", &self.self_time())
            .field("self_allocations", &self.self_allocations())
            .field("total_time", &self.total_time())
            .field("total_allocations", &self.total_allocations())
            .finish()
    }
}

// TODO(sokra) use events instead of children for visualizing span graphs
#[allow(dead_code)]
#[derive(Clone)]
pub enum SpanGraphEventRef<'a> {
    SelfTime { duration: Timestamp },
    Child { graph: SpanGraphRef<'a> },
}

impl SpanGraphEventRef<'_> {
    pub fn corrected_total_time(&self) -> Timestamp {
        match self {
            SpanGraphEventRef::SelfTime { duration } => *duration,
            SpanGraphEventRef::Child { graph } => graph.corrected_total_time(),
        }
    }

    pub fn total_time(&self) -> Timestamp {
        match self {
            SpanGraphEventRef::SelfTime { duration } => *duration,
            SpanGraphEventRef::Child { graph } => graph.total_time(),
        }
    }

    pub fn total_allocations(&self) -> u64 {
        match self {
            SpanGraphEventRef::SelfTime { .. } => 0,
            SpanGraphEventRef::Child { graph } => graph.total_allocations(),
        }
    }

    pub fn total_deallocations(&self) -> u64 {
        match self {
            SpanGraphEventRef::SelfTime { .. } => 0,
            SpanGraphEventRef::Child { graph } => graph.total_deallocations(),
        }
    }

    pub fn total_persistent_allocations(&self) -> u64 {
        match self {
            SpanGraphEventRef::SelfTime { .. } => 0,
            SpanGraphEventRef::Child { graph } => graph.total_persistent_allocations(),
        }
    }

    pub fn total_allocation_count(&self) -> u64 {
        match self {
            SpanGraphEventRef::SelfTime { .. } => 0,
            SpanGraphEventRef::Child { graph } => graph.total_allocation_count(),
        }
    }

    pub fn total_span_count(&self) -> u64 {
        match self {
            SpanGraphEventRef::SelfTime { .. } => 0,
            SpanGraphEventRef::Child { graph } => graph.total_span_count(),
        }
    }
}
