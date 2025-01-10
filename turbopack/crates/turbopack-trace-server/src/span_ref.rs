use std::{
    cmp::max,
    collections::{HashMap, HashSet, VecDeque},
    fmt::{Debug, Formatter},
    vec,
};

use rayon::iter::{IntoParallelRefIterator, ParallelIterator};

use crate::{
    bottom_up::build_bottom_up_graph,
    span::{Span, SpanEvent, SpanExtra, SpanGraphEvent, SpanIndex, SpanNames, SpanTimeData},
    span_bottom_up_ref::SpanBottomUpRef,
    span_graph_ref::{event_map_to_list, SpanGraphEventRef, SpanGraphRef},
    store::{SpanId, Store},
    FxIndexMap,
};

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

    pub fn start(&self) -> u64 {
        self.span.start
    }

    pub fn time_data(&self) -> &'a SpanTimeData {
        self.span.time_data()
    }

    pub fn extra(&self) -> &'a SpanExtra {
        self.span.extra()
    }

    pub fn names(&self) -> &'a SpanNames {
        self.span.names()
    }

    pub fn end(&self) -> u64 {
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
        let (category, title) = self.names().nice_name.get_or_init(|| {
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
        self.names().group_name.get_or_init(|| {
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
            SpanEvent::Child { index } => SpanEventRef::Child {
                span: SpanRef {
                    span: &self.store.spans[index.get()],
                    store: self.store,
                    index: index.get(),
                },
            },
        })
    }

    pub fn children(&self) -> impl DoubleEndedIterator<Item = SpanRef<'a>> + 'a {
        self.span.events.iter().filter_map(|event| match event {
            SpanEvent::SelfTime { .. } => None,
            SpanEvent::Child { index } => Some(SpanRef {
                span: &self.store.spans[index.get()],
                store: self.store,
                index: index.get(),
            }),
        })
    }

    pub fn children_par(&self) -> impl ParallelIterator<Item = SpanRef<'a>> + 'a {
        self.span.events.par_iter().filter_map(|event| match event {
            SpanEvent::SelfTime { .. } => None,
            SpanEvent::Child { index } => Some(SpanRef {
                span: &self.store.spans[index.get()],
                store: self.store,
                index: index.get(),
            }),
        })
    }

    pub fn total_time(&self) -> u64 {
        *self.time_data().total_time.get_or_init(|| {
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
        let store = self.store;
        *self.time_data().corrected_self_time.get_or_init(|| {
            let mut self_time = self
                .span
                .events
                .par_iter()
                .filter_map(|event| {
                    if let SpanEvent::SelfTime { start, end } = event {
                        let duration = end - start;
                        if duration != 0 {
                            store.set_max_self_time_lookup(*end);
                            let concurrent_time = store
                                .self_time_tree
                                .as_ref()
                                .map_or(duration, |tree| tree.lookup_range_count(*start, *end));
                            return Some(duration * duration / concurrent_time);
                        }
                    }
                    None
                })
                .sum();
            if self.children().next().is_none() {
                self_time = max(self_time, 1);
            }
            self_time
        })
    }

    pub fn corrected_total_time(&self) -> u64 {
        *self.time_data().corrected_total_time.get_or_init(|| {
            self.children_par()
                .map(|child| child.corrected_total_time())
                .sum::<u64>()
                + self.corrected_self_time()
        })
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
                let mut map: FxIndexMap<&str, (Vec<SpanIndex>, Vec<SpanIndex>)> =
                    FxIndexMap::default();
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
        let mut result = HashSet::new();
        let query = query_items.next().unwrap();
        for (key, spans) in index {
            if key.contains(query) {
                result.extend(spans.iter().copied());
            }
        }
        for query in query_items {
            let mut and_result = HashSet::new();
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

    fn search_index(&self) -> &HashMap<String, Vec<SpanIndex>> {
        self.extra().search_index.get_or_init(|| {
            let mut index: HashMap<String, Vec<SpanIndex>> = HashMap::new();
            let mut queue = VecDeque::with_capacity(8);
            queue.push_back(*self);
            while let Some(span) = queue.pop_front() {
                if !span.is_root() {
                    let (cat, name) = span.nice_name();
                    if !cat.is_empty() {
                        index
                            .raw_entry_mut()
                            .from_key(cat)
                            .and_modify(|_, v| v.push(span.index()))
                            .or_insert_with(|| (cat.to_string(), vec![span.index()]));
                    }
                    if !name.is_empty() {
                        index
                            .raw_entry_mut()
                            .from_key(name)
                            .and_modify(|_, v| v.push(span.index()))
                            .or_insert_with(|| (name.to_string(), vec![span.index()]));
                    }
                    for (_, value) in span.span.args.iter() {
                        index
                            .raw_entry_mut()
                            .from_key(value)
                            .and_modify(|_, v| v.push(span.index()))
                            .or_insert_with(|| (value.to_string(), vec![span.index()]));
                    }
                    if !span.is_complete() && !span.time_data().ignore_self_time {
                        let name = "incomplete_span";
                        index
                            .raw_entry_mut()
                            .from_key(name)
                            .and_modify(|_, v| v.push(span.index()))
                            .or_insert_with(|| (name.to_string(), vec![span.index()]));
                    }
                }
                for child in span.children() {
                    queue.push_back(child);
                }
            }
            index
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

#[allow(dead_code)]
#[derive(Copy, Clone)]
pub enum SpanEventRef<'a> {
    SelfTime { start: u64, end: u64 },
    Child { span: SpanRef<'a> },
}
