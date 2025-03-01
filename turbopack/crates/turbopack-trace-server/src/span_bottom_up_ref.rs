use std::{
    collections::VecDeque,
    fmt::{Debug, Formatter},
    sync::Arc,
};

use crate::{
    span::{SpanBottomUp, SpanGraphEvent, SpanIndex},
    span_graph_ref::{event_map_to_list, SpanGraphEventRef, SpanGraphRef},
    span_ref::SpanRef,
    store::{SpanId, Store},
    timestamp::Timestamp,
    FxIndexMap,
};

pub struct SpanBottomUpRef<'a> {
    pub(crate) bottom_up: Arc<SpanBottomUp>,
    pub(crate) store: &'a Store,
}

impl<'a> SpanBottomUpRef<'a> {
    pub fn id(&self) -> SpanId {
        unsafe { SpanId::new_unchecked((self.bottom_up.example_span.get() << 1) | 1) }
    }

    fn first_span(&self) -> SpanRef<'a> {
        let index = self.bottom_up.self_spans[0].get();
        SpanRef {
            span: &self.store.spans[index],
            store: self.store,
            index,
        }
    }

    fn example_span(&self) -> SpanRef<'a> {
        let index = self.bottom_up.example_span.get();
        SpanRef {
            span: &self.store.spans[index],
            store: self.store,
            index,
        }
    }

    pub fn spans(&self) -> impl Iterator<Item = SpanRef<'a>> + '_ {
        let store = self.store;
        self.bottom_up.self_spans.iter().map(move |span| SpanRef {
            span: &store.spans[span.get()],
            store,
            index: span.get(),
        })
    }

    pub fn count(&self) -> usize {
        self.bottom_up.self_spans.len()
    }

    pub fn group_name(&self) -> &'a str {
        self.first_span().group_name()
    }

    pub fn nice_name(&self) -> (&'a str, &'a str) {
        if self.count() == 1 {
            self.example_span().nice_name()
        } else {
            ("", self.example_span().group_name())
        }
    }

    pub fn children(&self) -> impl Iterator<Item = SpanBottomUpRef<'a>> + '_ {
        self.bottom_up
            .children
            .iter()
            .map(|bottom_up| SpanBottomUpRef {
                bottom_up: bottom_up.clone(),
                store: self.store,
            })
    }

    #[allow(dead_code)]
    pub fn graph(&self) -> impl Iterator<Item = SpanGraphEventRef<'a>> + '_ {
        self.bottom_up
            .events
            .get_or_init(|| {
                if self.count() == 1 {
                    let _ = self.first_span().graph();
                    self.first_span().extra().graph.get().unwrap().clone()
                } else {
                    let mut map: FxIndexMap<&str, (Vec<SpanIndex>, Vec<SpanIndex>)> =
                        FxIndexMap::default();
                    let mut queue = VecDeque::with_capacity(8);
                    for child in self.spans() {
                        let name = child.group_name();
                        let (list, recursive_list) = map.entry(name).or_default();
                        list.push(child.index());
                        queue.push_back(child);
                        while let Some(child) = queue.pop_front() {
                            for nested_child in child.children() {
                                let nested_name = nested_child.group_name();
                                if name == nested_name {
                                    recursive_list.push(nested_child.index());
                                    queue.push_back(nested_child);
                                }
                            }
                        }
                    }
                    event_map_to_list(map)
                }
            })
            .iter()
            .map(|graph| match graph {
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

    pub fn max_depth(&self) -> u32 {
        *self.bottom_up.max_depth.get_or_init(|| {
            self.children()
                .map(|bottom_up| bottom_up.max_depth() + 1)
                .max()
                .unwrap_or(0)
        })
    }

    pub fn corrected_self_time(&self) -> Timestamp {
        *self
            .bottom_up
            .corrected_self_time
            .get_or_init(|| self.spans().map(|span| span.corrected_self_time()).sum())
    }

    pub fn self_time(&self) -> Timestamp {
        *self
            .bottom_up
            .self_time
            .get_or_init(|| self.spans().map(|span| span.self_time()).sum())
    }

    pub fn self_allocations(&self) -> u64 {
        *self
            .bottom_up
            .self_allocations
            .get_or_init(|| self.spans().map(|span| span.self_allocations()).sum())
    }

    pub fn self_deallocations(&self) -> u64 {
        *self
            .bottom_up
            .self_deallocations
            .get_or_init(|| self.spans().map(|span| span.self_deallocations()).sum())
    }

    pub fn self_persistent_allocations(&self) -> u64 {
        *self.bottom_up.self_persistent_allocations.get_or_init(|| {
            self.spans()
                .map(|span| span.self_persistent_allocations())
                .sum()
        })
    }

    pub fn self_allocation_count(&self) -> u64 {
        *self
            .bottom_up
            .self_allocation_count
            .get_or_init(|| self.spans().map(|span| span.self_allocation_count()).sum())
    }

    pub fn self_span_count(&self) -> u64 {
        self.bottom_up.self_spans.len() as u64
    }
}

impl Debug for SpanBottomUpRef<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SpanBottomUpRef")
            .field("group_name", &self.group_name())
            .field("max_depth", &self.max_depth())
            .field("corrected_self_time", &self.corrected_self_time())
            .field("self_allocations", &self.self_allocations())
            .field("self_deallocations", &self.self_deallocations())
            .field(
                "self_persistent_allocations",
                &self.self_persistent_allocations(),
            )
            .field("self_allocation_count", &self.self_allocation_count())
            .finish()
    }
}
