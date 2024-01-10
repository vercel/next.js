use std::{
    cmp::max,
    collections::{HashMap, HashSet, VecDeque},
    fmt::{Debug, Formatter},
    num::NonZeroUsize,
    sync::{Arc, OnceLock},
    vec,
};

use indexmap::IndexMap;

use crate::span::{Span, SpanEvent, SpanGraph, SpanGraphEvent, SpanIndex};

pub type SpanId = NonZeroUsize;

pub struct Store {
    spans: Vec<Span>,
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

#[derive(Copy, Clone)]
pub struct SpanRef<'a> {
    span: &'a Span,
    store: &'a Store,
}

impl<'a> SpanRef<'a> {
    pub fn id(&self) -> SpanId {
        unsafe { SpanId::new_unchecked(self.span.index.get() << 1) }
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
        self.span.self_allocations
    }

    pub fn self_deallocations(&self) -> u64 {
        self.span.self_deallocations
    }

    pub fn self_persistent_allocations(&self) -> u64 {
        self.span
            .self_allocations
            .saturating_sub(self.span.self_deallocations)
    }

    pub fn self_allocation_count(&self) -> u64 {
        self.span.self_allocation_count
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

    pub fn graph(&self) -> impl Iterator<Item = SpanGraphEventRef<'a>> {
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
                            corrected_self_time: OnceLock::new(),
                            corrected_total_time: OnceLock::new(),
                        };
                        SpanGraphEvent::Child {
                            child: Arc::new(graph),
                        }
                    })
                    .collect()
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

// TODO(sokra) use events instead of children for visualizing span graphs
#[allow(dead_code)]
#[derive(Clone)]
pub enum SpanGraphEventRef<'a> {
    SelfTime { duration: u64 },
    Child { graph: SpanGraphRef<'a> },
}

impl<'a> SpanGraphEventRef<'a> {
    pub fn corrected_total_time(&self) -> u64 {
        match self {
            SpanGraphEventRef::SelfTime { duration } => *duration,
            SpanGraphEventRef::Child { graph } => graph.corrected_total_time(),
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
}

#[derive(Clone)]
pub struct SpanGraphRef<'a> {
    graph: Arc<SpanGraph>,
    store: &'a Store,
}

impl<'a> SpanGraphRef<'a> {
    pub fn first_span(&self) -> SpanRef<'a> {
        SpanRef {
            span: &self.store.spans[self.graph.root_spans[0].get()],
            store: self.store,
        }
    }

    pub fn id(&self) -> SpanId {
        unsafe { SpanId::new_unchecked((self.first_span().span.index.get() << 1) | 1) }
    }

    pub fn nice_name(&self) -> (&str, &str) {
        if self.count() == 1 {
            return self.first_span().nice_name();
        } else {
            return ("", self.first_span().group_name());
        }
    }

    pub fn count(&self) -> usize {
        self.graph.root_spans.len() + self.graph.recursive_spans.len()
    }

    pub fn root_spans(&self) -> impl Iterator<Item = SpanRef<'a>> + DoubleEndedIterator + '_ {
        self.graph.root_spans.iter().map(move |span| SpanRef {
            span: &self.store.spans[span.get()],
            store: self.store,
        })
    }

    fn recursive_spans(&self) -> impl Iterator<Item = SpanRef<'a>> + DoubleEndedIterator + '_ {
        self.graph
            .root_spans
            .iter()
            .chain(self.graph.recursive_spans.iter())
            .map(move |span| SpanRef {
                span: &self.store.spans[span.get()],
                store: self.store,
            })
    }

    pub fn events(&self) -> impl Iterator<Item = SpanGraphEventRef<'a>> + DoubleEndedIterator + '_ {
        self.graph
            .events
            .get_or_init(|| {
                if self.count() == 1 {
                    let _ = self.first_span().graph();
                    self.first_span().span.graph.get().unwrap().clone()
                } else {
                    let self_group = self.first_span().group_name();
                    let mut map: IndexMap<&str, (Vec<SpanIndex>, Vec<SpanIndex>)> = IndexMap::new();
                    let mut queue = VecDeque::with_capacity(8);
                    for span in self.recursive_spans() {
                        for span in span.children() {
                            let name = span.group_name();
                            if name != self_group {
                                let (list, recusive_list) = map.entry(name).or_default();
                                list.push(span.span.index);
                                queue.push_back(span);
                                while let Some(child) = queue.pop_front() {
                                    for nested_child in child.children() {
                                        let nested_name = nested_child.group_name();
                                        if name == nested_name {
                                            recusive_list.push(nested_child.span.index);
                                            queue.push_back(nested_child);
                                        }
                                    }
                                }
                            }
                        }
                    }
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
                                corrected_self_time: OnceLock::new(),
                                corrected_total_time: OnceLock::new(),
                            };
                            SpanGraphEvent::Child {
                                child: Arc::new(graph),
                            }
                        })
                        .collect()
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

    pub fn children(&self) -> impl Iterator<Item = SpanGraphRef<'a>> + DoubleEndedIterator + '_ {
        self.events().filter_map(|event| match event {
            SpanGraphEventRef::SelfTime { .. } => None,
            SpanGraphEventRef::Child { graph: span } => Some(span),
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

    // TODO(sokra) show self time in details
    #[allow(dead_code)]
    pub fn self_time(&self) -> u64 {
        *self.graph.self_time.get_or_init(|| {
            self.recursive_spans()
                .map(|span| span.self_time())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
        })
    }

    // TODO(sokra) show total time in details
    #[allow(dead_code)]
    pub fn total_time(&self) -> u64 {
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

    pub fn corrected_self_time(&self) -> u64 {
        *self.graph.self_time.get_or_init(|| {
            self.recursive_spans()
                .map(|span| span.corrected_self_time())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
        })
    }

    pub fn corrected_total_time(&self) -> u64 {
        *self.graph.total_time.get_or_init(|| {
            self.children()
                .map(|graph| graph.corrected_total_time())
                .reduce(|a, b| a + b)
                .unwrap_or_default()
                + self.corrected_self_time()
        })
    }
}

impl<'a> Debug for SpanGraphRef<'a> {
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
