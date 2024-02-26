use std::{
    cmp::max,
    collections::{HashMap, HashSet, VecDeque},
    fmt::{Debug, Formatter},
    vec,
};

use indexmap::IndexMap;

use crate::{
    bottom_up::build_bottom_up_graph,
    span::{Span, SpanEvent, SpanGraphEvent, SpanIndex},
    span_bottom_up_ref::SpanBottomUpRef,
    span_graph_ref::{event_map_to_list, SpanGraphEventRef, SpanGraphRef},
    store::{SpanId, Store},
};

#[derive(Copy, Clone)]
pub struct SpanRef<'a> {
    pub(crate) span: &'a Span,
    pub(crate) store: &'a Store,
}

impl<'a> SpanRef<'a> {
    pub fn id(&self) -> SpanId {
        unsafe { SpanId::new_unchecked(self.span.index.get() << 1) }
    }

    pub fn index(&self) -> SpanIndex {
        self.span.index
    }

    pub fn parent(&self) -> Option<SpanRef<'a>> {
        self.span.parent.map(|id| SpanRef {
            span: &self.store.spans[id.get()],
            store: self.store,
        })
    }

    pub fn start(&self) -> u64 {
        self.span.start
    }

    pub fn end(&self) -> u64 {
        *self.span.end.get_or_init(|| {
            max(
                self.span.self_end,
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

    pub fn nice_name(&self) -> (&'a str, &'a str) {
        let (category, title) = self.span.nice_name.get_or_init(|| {
            if let Some(name) = self
                .span
                .args
                .iter()
                .find(|&(k, _)| k == "name")
                .map(|(_, v)| v.as_str())
            {
                if matches!(
                    self.span.name.as_str(),
                    "turbo_tasks::resolve_call" | "turbo_tasks::resolve_trait_call"
                ) {
                    (
                        format!("{} {}", self.span.name, self.span.category),
                        format!("*{name}"),
                    )
                } else {
                    (
                        format!("{} {}", self.span.name, self.span.category),
                        name.to_string(),
                    )
                }
            } else {
                (self.span.category.to_string(), self.span.name.to_string())
            }
        });
        (category, title)
    }

    pub fn group_name(&self) -> &'a str {
        self.span.group_name.get_or_init(|| {
            if matches!(self.span.name.as_str(), "turbo_tasks::function") {
                self.span
                    .args
                    .iter()
                    .find(|&(k, _)| k == "name")
                    .map(|(_, v)| v.to_string())
                    .unwrap_or_else(|| self.span.name.to_string())
            } else if matches!(
                self.span.name.as_str(),
                "turbo_tasks::resolve_call" | "turbo_tasks::resolve_trait_call"
            ) {
                self.span
                    .args
                    .iter()
                    .find(|&(k, _)| k == "name")
                    .map(|(_, v)| format!("*{v}"))
                    .unwrap_or_else(|| self.span.name.to_string())
            } else {
                self.span.name.to_string()
            }
        })
    }

    pub fn args(&self) -> impl Iterator<Item = (&str, &str)> {
        self.span.args.iter().map(|(k, v)| (k.as_str(), v.as_str()))
    }

    pub fn self_time(&self) -> u64 {
        self.span.self_time
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

    // TODO(sokra) use events instead of children for visualizing span graphs
    #[allow(dead_code)]
    pub fn events_count(&self) -> usize {
        self.span.events.len()
    }

    // TODO(sokra) use events instead of children for visualizing span graphs
    #[allow(dead_code)]
    pub fn events(&self) -> impl Iterator<Item = SpanEventRef<'a>> {
        self.span.events.iter().map(|event| match event {
            &SpanEvent::SelfTime { start, end } => SpanEventRef::SelfTime { start, end },
            SpanEvent::Child { id } => SpanEventRef::Child {
                span: SpanRef {
                    span: &self.store.spans[id.get()],
                    store: self.store,
                },
            },
        })
    }

    pub fn children(&self) -> impl Iterator<Item = SpanRef<'a>> + DoubleEndedIterator + 'a {
        self.span.events.iter().filter_map(|event| match event {
            SpanEvent::SelfTime { .. } => None,
            SpanEvent::Child { id } => Some(SpanRef {
                span: &self.store.spans[id.get()],
                store: self.store,
            }),
        })
    }

    pub fn total_time(&self) -> u64 {
        *self.span.total_time.get_or_init(|| {
            self.children()
                .map(|child| child.total_time())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
                + self.self_time()
        })
    }

    pub fn total_allocations(&self) -> u64 {
        *self.span.total_allocations.get_or_init(|| {
            self.children()
                .map(|child| child.total_allocations())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
                + self.self_allocations()
        })
    }

    pub fn total_deallocations(&self) -> u64 {
        *self.span.total_deallocations.get_or_init(|| {
            self.children()
                .map(|child| child.total_deallocations())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
                + self.self_deallocations()
        })
    }

    pub fn total_persistent_allocations(&self) -> u64 {
        *self.span.total_persistent_allocations.get_or_init(|| {
            self.children()
                .map(|child| child.total_persistent_allocations())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
                + self.self_persistent_allocations()
        })
    }

    pub fn total_allocation_count(&self) -> u64 {
        *self.span.total_allocation_count.get_or_init(|| {
            self.children()
                .map(|child| child.total_allocation_count())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
                + self.self_allocation_count()
        })
    }

    pub fn total_span_count(&self) -> u64 {
        *self.span.total_span_count.get_or_init(|| {
            self.children()
                .map(|child| child.total_span_count())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
                + 1
        })
    }

    pub fn corrected_self_time(&self) -> u64 {
        *self
            .span
            .corrected_self_time
            .get_or_init(|| self.self_time())
    }

    pub fn corrected_total_time(&self) -> u64 {
        *self
            .span
            .corrected_total_time
            .get_or_init(|| self.total_time())
    }

    pub fn max_depth(&self) -> u32 {
        *self.span.max_depth.get_or_init(|| {
            self.children()
                .map(|child| child.max_depth() + 1)
                .max()
                .unwrap_or_default()
        })
    }

    pub fn graph(&self) -> impl Iterator<Item = SpanGraphEventRef<'a>> + '_ {
        self.span
            .graph
            .get_or_init(|| {
                let mut map: IndexMap<&str, (Vec<SpanIndex>, Vec<SpanIndex>)> = IndexMap::new();
                let mut queue = VecDeque::with_capacity(8);
                for child in self.children() {
                    let name = child.group_name();
                    let (list, recursive_list) = map.entry(name).or_default();
                    list.push(child.span.index);
                    queue.push_back(child);
                    while let Some(child) = queue.pop_front() {
                        for nested_child in child.children() {
                            let nested_name = nested_child.group_name();
                            if name == nested_name {
                                recursive_list.push(nested_child.span.index);
                                queue.push_back(nested_child);
                            }
                        }
                    }
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
        self.span
            .bottom_up
            .get_or_init(|| {
                build_bottom_up_graph([SpanRef {
                    span: self.span,
                    store: self.store,
                }])
            })
            .iter()
            .map(|bottom_up| SpanBottomUpRef {
                bottom_up: bottom_up.clone(),
                store: self.store,
            })
    }

    pub fn search(&self, query: &str) -> impl Iterator<Item = SpanRef<'a>> {
        let index = self.search_index();
        let mut result = HashSet::new();
        for (key, spans) in index {
            if key.contains(query) {
                result.extend(spans.iter().copied());
            }
        }
        let store = self.store;
        result.into_iter().map(move |index| SpanRef {
            span: &store.spans[index.get()],
            store,
        })
    }

    fn search_index(&self) -> &HashMap<String, Vec<SpanIndex>> {
        self.span.search_index.get_or_init(|| {
            let mut index: HashMap<String, Vec<SpanIndex>> = HashMap::new();
            let mut queue = VecDeque::with_capacity(8);
            queue.push_back(*self);
            while let Some(span) = queue.pop_front() {
                let (cat, name) = span.nice_name();
                if !cat.is_empty() {
                    index
                        .raw_entry_mut()
                        .from_key(cat)
                        .and_modify(|_, v| v.push(span.span.index))
                        .or_insert_with(|| (cat.to_string(), vec![span.span.index]));
                }
                if !name.is_empty() {
                    index
                        .raw_entry_mut()
                        .from_key(name)
                        .and_modify(|_, v| v.push(span.span.index))
                        .or_insert_with(|| (name.to_string(), vec![span.span.index]));
                }
                for (_, value) in span.span.args.iter() {
                    index
                        .raw_entry_mut()
                        .from_key(value)
                        .and_modify(|_, v| v.push(span.span.index))
                        .or_insert_with(|| (value.to_string(), vec![span.span.index]));
                }
                if !span.is_complete() {
                    let name = "incomplete";
                    index
                        .raw_entry_mut()
                        .from_key(name)
                        .and_modify(|_, v| v.push(span.span.index))
                        .or_insert_with(|| (name.to_string(), vec![span.span.index]));
                }
                for child in span.children() {
                    queue.push_back(child);
                }
            }
            index
        })
    }
}

impl<'a> Debug for SpanRef<'a> {
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

#[derive(Copy, Clone)]
pub enum SpanEventRef<'a> {
    SelfTime { start: u64, end: u64 },
    Child { span: SpanRef<'a> },
}
