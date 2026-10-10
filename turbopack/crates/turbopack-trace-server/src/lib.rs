#![feature(deref_patterns)]
#![feature(bufreader_peek)]

use std::{
    cmp::Reverse,
    collections::VecDeque,
    hash::BuildHasherDefault,
    path::PathBuf,
    sync::Arc,
    thread,
    time::{Duration, Instant},
};

use rustc_hash::FxHasher;

use self::{
    reader::TraceReader,
    server::serve,
    span_graph_ref::{SpanGraphEventRef, SpanGraphRef},
    span_ref::SpanRef,
    store_container::StoreContainer,
    timestamp::Timestamp,
};

mod bottom_up;
mod chunked_vec;
mod lazy_sorted_vec;
#[cfg(test)]
mod query_tests;
mod reader;
mod self_time_tree;
mod server;
mod span;
mod span_bottom_up_ref;
mod span_graph_ref;
mod span_ref;
mod store;
pub mod store_container;
mod string_tuple_ref;
mod timestamp;
mod u64_empty_string;
mod u64_string;
mod viewer;

#[allow(
    dead_code,
    reason = "It's actually used, not sure why it is marked as dead code"
)]
type FxIndexMap<K, V> = indexmap::IndexMap<K, V, BuildHasherDefault<FxHasher>>;

/// Starts the trace server on a background thread and returns the store
/// immediately. The WebSocket server runs non-blocking.
pub fn start_turbopack_trace_server(path: PathBuf, port: Option<u16>) -> Arc<StoreContainer> {
    let store = Arc::new(StoreContainer::new());

    let store_for_reader = store.clone();
    let store_for_server = store.clone();

    TraceReader::spawn(store_for_reader, path);

    thread::spawn(move || {
        serve(store_for_server, port.unwrap_or(5747));
    });

    store
}

/// Page size used when the caller doesn't ask for one.
const DEFAULT_PAGE_SIZE: usize = 20;

/// Upper bound on a caller-supplied page size, so one response stays bounded.
const MAX_PAGE_SIZE: usize = 500;

/// Default and cap for `QueryOptions::max_depth`. Also bounds the subtree
/// walks, which is why they need no cycle detection.
const DEFAULT_SEARCH_MAX_DEPTH: u32 = 32;

/// How spans should be sorted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SortMode {
    /// No sorting — spans appear in execution/natural order.
    #[default]
    ExecutionOrder,
    /// Sort by value (corrected duration descending).
    Value,
    /// Sort alphabetically by name, then by category.
    Name,
    /// Sort by total allocated bytes, descending.
    Allocations,
    /// Sort by `SpanInfo::persistent_allocations`, descending.
    PersistentAllocations,
}

/// Options for querying spans from the trace store.
pub struct QueryOptions {
    /// Optional parent span ID (as produced by `SpanInfo::id`).
    /// `None` means root level.
    pub parent: Option<String>,
    /// When true, aggregate child spans with the same name.
    pub aggregated: bool,
    /// How to sort the results.
    pub sort: SortMode,
    /// Optional substring search query.
    ///
    /// Matches the parent's entire subtree, not just its direct children. Each
    /// result's `id` is the full path from `parent` down to the match, so it
    /// can be passed straight back as `parent`.
    ///
    /// Cost scales with the size of that subtree, so a root search on a large
    /// trace walks everything. Setting `parent`, or lowering `max_depth`,
    /// bounds it.
    pub search: Option<String>,
    /// Maximum depth to descend below `parent` when `search` is set, or when
    /// `depth` requests a nested subtree. Clamped to `DEFAULT_SEARCH_MAX_DEPTH`.
    pub max_depth: u32,
    /// When greater than 1, each returned span carries this many levels of
    /// descendants inline in `children`.
    pub depth: u32,
    /// 1-based page number.
    pub page: usize,
    /// Number of spans per page. Clamped to `MAX_PAGE_SIZE`; `None` uses
    /// `DEFAULT_PAGE_SIZE`.
    pub page_size: Option<usize>,
    /// Opt-in sample-series limit per returned span. `None` omits details;
    /// `Some(0)` returns empty series. Independent of the viewer's fixed cap.
    pub samples: Option<usize>,
}

/// Requested value series for a span's elapsed range. Captured samples and
/// equal-duration concurrency segments do not share a timestamp grid.
/// Memory is TurboMalloc live bytes, pressure is the recorded pressure byte,
/// and workers are non-parked Tokio scheduler workers (not the blocking pool).
pub struct SpanSampleSeries {
    pub memory_samples: Vec<u64>,
    pub memory_pressure_samples: Vec<u8>,
    pub active_worker_threads_samples: Vec<u64>,
    pub concurrency_samples: Vec<f64>,
}

/// Information about a single span (or aggregated group of spans).
pub struct SpanInfo {
    /// Span ID string.
    ///
    /// The format encodes both the type and the navigation path:
    /// - A **raw span** leaf is its decimal index: `"123"`.
    /// - An **aggregated span** leaf is `"a"` + the first-span index: `"a123"`.
    /// - When the span is a child of another span, the parent's ID is prepended with a dash
    ///   separator, e.g. `"a5-a34"` or `"1-a5-a34-20"`.
    ///
    /// Pass the full ID as the `parent` option of the next `query_spans` call
    /// to enumerate the children of that span.
    pub id: String,
    /// Display name: `"category title"` or just `"title"`.
    pub name: String,
    /// Raw CPU total time in internal ticks (100 ticks = 1 µs).
    /// For aggregated spans, this is the **first (example) span's** value, not the group total.
    /// See `total_cpu_duration` for the group total.
    pub cpu_duration: u64,
    /// Concurrency-corrected total time in internal ticks.
    /// For aggregated spans, this is the **first (example) span's** value, not the group total.
    /// See `total_corrected_duration` for the group total.
    pub corrected_duration: u64,
    /// Start of span relative to parent start, in internal ticks.
    pub start_relative_to_parent: i64,
    /// End of span relative to parent start, in internal ticks.
    pub end_relative_to_parent: i64,
    /// Key-value attributes from the span.
    pub args: Vec<(String, String)>,
    /// True if this entry represents an aggregated group of spans.
    pub is_aggregated: bool,
    /// Number of spans in the group (only set for aggregated spans).
    pub count: Option<u64>,
    /// Sum of cpu_duration across all spans in the group.
    pub total_cpu_duration: Option<u64>,
    /// Average cpu_duration across all spans in the group.
    pub avg_cpu_duration: Option<u64>,
    /// Sum of corrected_duration across all spans in the group.
    pub total_corrected_duration: Option<u64>,
    /// Average corrected_duration across all spans in the group.
    pub avg_corrected_duration: Option<u64>,
    /// Raw span ID of the group's example span, whose `cpu_duration`,
    /// `corrected_duration`, `memory_summary` and `sample_series` are reported here.
    /// First in execution order — *not* the largest, so it can badly understate
    /// a group's allocations. Use `heaviest_span_id` for those.
    pub first_span_id: Option<String>,
    /// Raw span ID of the group member with the largest
    /// `total_persistent_allocations`.
    pub heaviest_span_id: Option<String>,
    /// Total bytes allocated by this span and all its children.
    ///
    /// For aggregated groups this is the group total, unlike `cpu_duration`,
    /// `corrected_duration`, `memory_summary` and `sample_series`, which describe
    /// the example span only. Every allocation field below follows this field,
    /// not those.
    pub allocations: u64,
    /// Total bytes deallocated by this span and all its children.
    /// Group total for aggregated spans.
    pub deallocations: u64,
    /// Sum over each span of `max(0, self_allocations - self_deallocations)`,
    /// for this span and its children. Group total for aggregated spans.
    ///
    /// **A ranking signal, not retained memory.** TurboMalloc's per-span
    /// counters never see memory released outside the allocating span's window
    /// — turbo-tasks cell and cache drops in particular — so a whole-trace
    /// total far above real peak RSS is expected, not a leak. Use
    /// `memory_summary` for absolute memory.
    ///
    /// The per-span floor at zero is also why this is not
    /// `allocations - deallocations`.
    pub persistent_allocations: u64,
    /// Number of allocation operations by this span and all its children.
    /// Group total for aggregated spans.
    pub allocation_count: u64,
    /// Bytes allocated by this span itself, excluding children.
    /// Group total for aggregated spans.
    pub self_allocations: u64,
    /// Bytes deallocated by this span itself, excluding children.
    /// Group total for aggregated spans.
    ///
    /// Frees are charged to whichever span was on top of the thread's stack at
    /// free time, which is often not the span that allocated. So small
    /// `self_allocations` with large `self_deallocations` means this span is
    /// where a child's arena gets dropped — that arena is bounded, not leaking.
    /// The shape to suspect is a large `self_persistent_allocations` with no
    /// such counterpart above it.
    pub self_deallocations: u64,
    /// `max(0, self_allocations - self_deallocations)` for this span alone.
    /// Group total for aggregated spans.
    pub self_persistent_allocations: u64,
    /// Number of allocation operations by this span itself, excluding children.
    /// Group total for aggregated spans.
    pub self_allocation_count: u64,
    /// Summary of TurboMalloc readings while this span (or its example span,
    /// for aggregated groups) was live. `None` when its range holds none.
    ///
    /// **Process-wide, not per-span.** One global series is sliced by the
    /// span's time range, so overlapping ranges report the same readings no
    /// matter what each allocated. Rank concurrent work by allocation fields;
    /// use this summary for absolute memory over a span dominating its window.
    ///
    /// Computed directly from every captured reading in the span's range,
    /// independently of whether or how many sample values are requested.
    pub memory_summary: Option<MemorySummary>,
    /// Opt-in process/global value series for this span's elapsed range
    /// (the example span's range for aggregated groups).
    pub sample_series: Option<SpanSampleSeries>,
    /// Descendants of this span, populated only when `QueryOptions::depth` is
    /// greater than 1. Sorted and aggregated the same way as this level.
    pub children: Vec<SpanInfo>,
}

/// Aggregate view of a span's TurboMalloc memory samples.
///
/// Unlike the allocation counters these are absolute live-heap readings, so
/// `peak` is the figure to quote for memory actually in use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MemorySummary {
    /// Number of captured readings in the span's range, without downsampling.
    pub count: usize,
    /// Live bytes at the first sample in the range.
    pub start: u64,
    /// Live bytes at the last sample in the range.
    pub end: u64,
    /// Smallest live-bytes reading in the range.
    pub min: u64,
    /// Largest live-bytes reading in the range — the span's peak memory.
    pub peak: u64,
    /// Highest memory-pressure byte seen in the range (0 = no pressure).
    pub max_pressure: u8,
}

impl MemorySummary {
    /// Summarize every raw captured reading in the inclusive span range,
    /// without downsampling or allocating a temporary sample vector.
    fn for_range(store: &store::Store, start: Timestamp, end: Timestamp) -> Option<Self> {
        if start > end {
            return None;
        }
        let readings = store.memory_samples_slice(start, end);
        let &(_, first_bytes, first_pressure, _) = readings.first()?;
        let mut summary = Self {
            count: readings.len(),
            start: first_bytes,
            end: readings.last().expect("non-empty range").1,
            min: first_bytes,
            peak: first_bytes,
            max_pressure: first_pressure,
        };
        for &(_, bytes, pressure, _) in &readings[1..] {
            summary.min = summary.min.min(bytes);
            summary.peak = summary.peak.max(bytes);
            summary.max_pressure = summary.max_pressure.max(pressure);
        }
        Some(summary)
    }
}

/// Result of a `query_spans` call.
pub struct QueryResult {
    pub spans: Vec<SpanInfo>,
    pub page: usize,
    pub total_pages: usize,
    pub total_count: usize,
}
/// Paginate a vec of items. Returns `(page_items, clamped_page, total_pages, total_count)`.
fn paginate<T>(items: Vec<T>, page: usize, page_size: usize) -> (Vec<T>, usize, usize, usize) {
    let page_size = page_size.clamp(1, MAX_PAGE_SIZE);
    let total_count = items.len();
    let total_pages = total_count.div_ceil(page_size).max(1);
    let page = page.clamp(1, total_pages);
    let start = (page - 1) * page_size;
    let page_items = items.into_iter().skip(start).take(page_size).collect();
    (page_items, page, total_pages, total_count)
}

fn format_span_name(cat: &str, title: &str) -> String {
    if cat.is_empty() {
        title.to_string()
    } else {
        format!("{cat} {title}")
    }
}

/// Build a span ID by appending a leaf segment to the optional parent path.
fn build_span_id(parent: Option<&str>, leaf: &str) -> String {
    match parent {
        Some(p) => format!("{p}-{leaf}"),
        None => leaf.to_string(),
    }
}

/// A span found while walking, paired with the ID path that leads to it.
struct Located<T> {
    item: T,
    /// Full path ID, e.g. `"a5-a34-a91"`, usable as a `parent`.
    id: String,
}

/// Does this name match the search query?
///
/// Comma-separated terms are ANDed. Each term is a plain substring match
/// against the span's display name, `"category title"` — the `name` a result
/// reports — which is why a term copied out of a response finds its span
/// again.
fn name_matches(cat: &str, title: &str, query: &str) -> bool {
    query
        .split(',')
        .map(str::trim)
        .filter(|term| !term.is_empty())
        .all(|term| contains_in_joined(cat, title, term))
}

/// Is `term` a substring of `"{cat} {title}"`, without building that string?
///
/// This runs for every span in the searched subtree, so the concatenation is
/// worth avoiding: it was the dominant cost of a search.
///
/// A substring of the joined name either lies within one field or straddles
/// the single space between them, so the straddling case splits the term at a
/// space and checks that `cat` ends with the head and `title` starts with the
/// tail. Every space in the term is tried, since both sides may contain their
/// own.
fn contains_in_joined(cat: &str, title: &str, term: &str) -> bool {
    if cat.contains(term) || title.contains(term) {
        return true;
    }
    // `format_span_name` drops the separator only for an empty category, so
    // that is the one case with no joining space to straddle. An empty title
    // still leaves a trailing space, which a term may legitimately end on, so
    // it must not short-circuit here.
    if cat.is_empty() {
        return false;
    }
    term.match_indices(' ')
        .any(|(i, _)| cat.ends_with(&term[..i]) && title.starts_with(&term[i + 1..]))
}

/// Collect the aggregated children of a graph node.
fn graph_children<'a>(graph: &SpanGraphRef<'a>) -> Vec<SpanGraphRef<'a>> {
    graph
        .events()
        .filter_map(|event| match event {
            SpanGraphEventRef::Child { graph } => Some(graph),
            SpanGraphEventRef::SelfTime { .. } => None,
        })
        .collect()
}

/// Collect the aggregated children of a raw span.
fn span_graph_children<'a>(span: &SpanRef<'a>) -> Vec<SpanGraphRef<'a>> {
    span.graph()
        .filter_map(|event| match event {
            SpanGraphEventRef::Child { graph } => Some(graph),
            SpanGraphEventRef::SelfTime { .. } => None,
        })
        .collect()
}

/// Walk the aggregated graph below `roots`, returning every node whose name
/// matches `query`, each tagged with its full path ID.
///
/// Raw spans get recursion from the store's search index, but graph nodes are
/// built on demand and have no index, so this walks them directly.
///
/// A match does not stop the descent — nested spans often share a name with an
/// ancestor.
fn search_graph_recursive<'a>(
    roots: Vec<Located<SpanGraphRef<'a>>>,
    query: &str,
    max_depth: u32,
) -> Vec<Located<SpanGraphRef<'a>>> {
    let mut matches = Vec::new();
    let mut queue: VecDeque<(Located<SpanGraphRef<'a>>, u32)> =
        roots.into_iter().map(|located| (located, 1)).collect();

    while let Some((located, depth)) = queue.pop_front() {
        let (cat, title) = located.item.nice_name();
        let is_match = name_matches(cat, title, query);

        if depth < max_depth {
            for child in graph_children(&located.item) {
                let leaf = format!("a{}", child.first_span().index);
                let id = build_span_id(Some(&located.id), &leaf);
                queue.push_back((Located { item: child, id }, depth + 1));
            }
        }

        if is_match {
            matches.push(located);
        }
    }

    matches
}

/// Walk raw spans below `roots`, returning every span whose name matches
/// `query`.
///
/// Used for multi-word terms, which the store's index cannot answer; see the
/// call site.
fn search_spans_recursive<'a>(
    roots: Vec<SpanRef<'a>>,
    query: &str,
    max_depth: u32,
) -> Vec<SpanRef<'a>> {
    let mut matches = Vec::new();
    let mut queue: VecDeque<(SpanRef<'a>, u32)> = roots.into_iter().map(|span| (span, 1)).collect();

    while let Some((span, depth)) = queue.pop_front() {
        let (cat, title) = span.nice_name();
        if name_matches(cat, title, query) {
            matches.push(span);
        }
        if depth < max_depth {
            for child in span.children() {
                queue.push_back((child, depth + 1));
            }
        }
    }

    matches
}

/// Sort located aggregated nodes in place.
fn sort_graph(items: &mut [Located<SpanGraphRef<'_>>], sort: SortMode) {
    match sort {
        SortMode::Value => items.sort_by(|a, b| {
            b.item
                .corrected_total_time()
                .cmp(&a.item.corrected_total_time())
                .then_with(|| b.item.total_time().cmp(&a.item.total_time()))
        }),
        SortMode::Name => items.sort_by(|a, b| {
            let (a_cat, a_title) = a.item.nice_name();
            let (b_cat, b_title) = b.item.nice_name();
            a_title.cmp(b_title).then_with(|| a_cat.cmp(b_cat))
        }),
        SortMode::Allocations => {
            items.sort_by_key(|s| Reverse(s.item.total_allocations()));
        }
        SortMode::PersistentAllocations => {
            items.sort_by_key(|s| Reverse(s.item.total_persistent_allocations()));
        }
        SortMode::ExecutionOrder => {}
    }
}

/// Sort located raw spans in place.
fn sort_spans(items: &mut [Located<SpanRef<'_>>], sort: SortMode) {
    match sort {
        SortMode::Value => items.sort_by(|a, b| {
            b.item
                .corrected_total_time()
                .cmp(&a.item.corrected_total_time())
                .then_with(|| b.item.total_time().cmp(&a.item.total_time()))
        }),
        SortMode::Name => items.sort_by(|a, b| {
            let (a_cat, a_title) = a.item.nice_name();
            let (b_cat, b_title) = b.item.nice_name();
            a_title.cmp(b_title).then_with(|| a_cat.cmp(b_cat))
        }),
        SortMode::Allocations => {
            items.sort_by_key(|s| Reverse(s.item.total_allocations()));
        }
        SortMode::PersistentAllocations => {
            items.sort_by_key(|s| Reverse(s.item.total_persistent_allocations()));
        }
        SortMode::ExecutionOrder => {}
    }
}

fn sample_series_for(store: &store::Store, span: &SpanRef<'_>, limit: usize) -> SpanSampleSeries {
    let start = span.start();
    let end = span.end();
    let samples = store.memory_samples_for_range_with_ts(start, end, limit);
    SpanSampleSeries {
        memory_samples: samples.iter().map(|sample| sample.1).collect(),
        memory_pressure_samples: store.memory_pressure_samples_for_range(start, end, limit),
        active_worker_threads_samples: samples.iter().map(|sample| sample.3).collect(),
        concurrency_samples: store.concurrency_samples_for_range(start, end, limit),
    }
}

/// Build a `SpanInfo` for an aggregated graph node, recursing into children
/// while `depth > 1`.
fn build_graph_span_info(
    store: &store::Store,
    located: Located<SpanGraphRef<'_>>,
    parent_start: Timestamp,
    sort: SortMode,
    depth: u32,
    samples: Option<usize>,
) -> SpanInfo {
    let Located { item: graph, id } = located;
    let first = graph.first_span();
    let (cat, title) = graph.nice_name();
    let count = graph.count() as u64;
    let total_cpu = *graph.total_time();
    let total_corrected = *graph.corrected_total_time();

    let heaviest = graph
        .root_spans()
        .max_by_key(|span| span.total_persistent_allocations())
        .map(|span| span.index.to_string());

    let memory_summary = MemorySummary::for_range(store, first.start(), first.end());

    let children = if depth > 1 {
        let mut located_children: Vec<_> = graph_children(&graph)
            .into_iter()
            .map(|child| {
                let leaf = format!("a{}", child.first_span().index);
                Located {
                    id: build_span_id(Some(&id), &leaf),
                    item: child,
                }
            })
            .collect();
        sort_graph(&mut located_children, sort);
        located_children
            .into_iter()
            .map(|child| {
                build_graph_span_info(store, child, first.start(), sort, depth - 1, samples)
            })
            .collect()
    } else {
        Vec::new()
    };

    SpanInfo {
        id,
        name: format_span_name(cat, title),
        cpu_duration: *first.total_time(),
        corrected_duration: *first.corrected_total_time(),
        start_relative_to_parent: (*first.start() as i64) - (*parent_start as i64),
        end_relative_to_parent: (*first.end() as i64) - (*parent_start as i64),
        args: first
            .args()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect(),
        is_aggregated: count > 1,
        count: Some(count),
        total_cpu_duration: Some(total_cpu),
        avg_cpu_duration: Some(total_cpu.checked_div(count).unwrap_or(0)),
        total_corrected_duration: Some(total_corrected),
        avg_corrected_duration: Some(total_corrected.checked_div(count).unwrap_or(0)),
        first_span_id: Some(first.index.to_string()),
        heaviest_span_id: heaviest,
        allocations: graph.total_allocations(),
        deallocations: graph.total_deallocations(),
        persistent_allocations: graph.total_persistent_allocations(),
        allocation_count: graph.total_allocation_count(),
        self_allocations: graph.self_allocations(),
        self_deallocations: graph.self_deallocations(),
        self_persistent_allocations: graph.self_persistent_allocations(),
        self_allocation_count: graph.self_allocation_count(),
        memory_summary,
        sample_series: samples.map(|limit| sample_series_for(store, &first, limit)),
        children,
    }
}

/// Build a `SpanInfo` for a raw span, recursing into children while `depth > 1`.
fn build_raw_span_info(
    store: &store::Store,
    located: Located<SpanRef<'_>>,
    parent_start: Timestamp,
    sort: SortMode,
    depth: u32,
    samples: Option<usize>,
) -> SpanInfo {
    let Located { item: span, id } = located;
    let (cat, title) = span.nice_name();

    let memory_summary = MemorySummary::for_range(store, span.start(), span.end());

    let children = if depth > 1 {
        let mut located_children: Vec<_> = span
            .children()
            .map(|child| Located {
                id: build_span_id(Some(&id), &child.index.to_string()),
                item: child,
            })
            .collect();
        sort_spans(&mut located_children, sort);
        located_children
            .into_iter()
            .map(|child| build_raw_span_info(store, child, span.start(), sort, depth - 1, samples))
            .collect()
    } else {
        Vec::new()
    };

    SpanInfo {
        id,
        name: format_span_name(cat, title),
        cpu_duration: *span.total_time(),
        corrected_duration: *span.corrected_total_time(),
        start_relative_to_parent: (*span.start() as i64) - (*parent_start as i64),
        end_relative_to_parent: (*span.end() as i64) - (*parent_start as i64),
        args: span
            .args()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect(),
        is_aggregated: false,
        count: None,
        total_cpu_duration: None,
        avg_cpu_duration: None,
        total_corrected_duration: None,
        avg_corrected_duration: None,
        first_span_id: None,
        heaviest_span_id: None,
        allocations: span.total_allocations(),
        deallocations: span.total_deallocations(),
        persistent_allocations: span.total_persistent_allocations(),
        allocation_count: span.total_allocation_count(),
        self_allocations: span.self_allocations(),
        self_deallocations: span.self_deallocations(),
        self_persistent_allocations: span.self_persistent_allocations(),
        self_allocation_count: span.self_allocation_count(),
        memory_summary,
        sample_series: samples.map(|limit| sample_series_for(store, &span, limit)),
        children,
    }
}

/// Query spans from the store.
///
/// Waits up to 10 seconds for at least some data to be loaded before
/// returning, so callers don't need to poll separately.
pub fn query_spans(store: &Arc<StoreContainer>, options: QueryOptions) -> QueryResult {
    // Wait briefly for initial data if the store is empty.
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        {
            let guard = store.read();
            // root span always exists (index 0); real spans start at index 1
            if guard.spans.len() > 1 {
                break;
            }
        }
        if Instant::now() >= deadline {
            break;
        }
        thread::sleep(Duration::from_millis(50));
    }

    let store_guard = store.read();
    let store_ref = &*store_guard;

    let parent_span: Option<SpanRef<'_>> = if let Some(ref parent_id) = options.parent {
        resolve_span_by_id(store_ref, parent_id)
    } else {
        None
    };

    let parent_start = parent_span.as_ref().map(|s| s.start()).unwrap_or_default();
    let max_depth = options.max_depth.clamp(1, DEFAULT_SEARCH_MAX_DEPTH);
    let depth = options.depth.clamp(1, DEFAULT_SEARCH_MAX_DEPTH);
    let page_size = options
        .page_size
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .clamp(1, MAX_PAGE_SIZE);

    if options.aggregated {
        let direct: Vec<Located<SpanGraphRef<'_>>> = match parent_span {
            Some(ref parent) => span_graph_children(parent),
            None => span_graph_children(&store_ref.root_span()),
        }
        .into_iter()
        .map(|graph| {
            let leaf = format!("a{}", graph.first_span().index);
            Located {
                id: build_span_id(options.parent.as_deref(), &leaf),
                item: graph,
            }
        })
        .collect();

        // A search descends the subtree; without one we stay at this level.
        let mut filtered = match options.search {
            Some(ref query) => search_graph_recursive(direct, query, max_depth),
            None => direct,
        };

        sort_graph(&mut filtered, options.sort);

        let (page_items, page, total_pages, total_count) =
            paginate(filtered, options.page, page_size);

        let spans = page_items
            .into_iter()
            .map(|located| {
                build_graph_span_info(
                    store_ref,
                    located,
                    parent_start,
                    options.sort,
                    depth,
                    options.samples,
                )
            })
            .collect();

        QueryResult {
            spans,
            page,
            total_pages,
            total_count,
        }
    } else {
        // The store's index keys category and title separately, so a term
        // spanning both (a `name` copied from a result) matches no key. It is
        // shared with the WebSocket viewer, so rather than change its keys,
        // walk the subtree ourselves whenever any term contains a space.
        // Single-word queries still take the index, which is much faster.
        let filtered: Vec<Located<SpanRef<'_>>> = if let Some(ref query) = options.search {
            let needs_scan = query.split(',').any(|term| term.trim().contains(' '));
            let matches: Vec<SpanRef<'_>> = if needs_scan {
                let roots: Vec<SpanRef<'_>> = match parent_span {
                    Some(ref parent) => parent.children().collect(),
                    None => store_ref.root_spans().collect(),
                };
                search_spans_recursive(roots, query, max_depth)
            } else {
                match parent_span {
                    Some(ref parent) => parent.search(query).collect(),
                    None => store_ref.root_span().search(query).collect(),
                }
            };
            matches
                .into_iter()
                .filter_map(|span| {
                    raw_span_path(&span, parent_span.as_ref(), max_depth).map(|id| Located {
                        item: span,
                        id: build_span_id(options.parent.as_deref(), &id),
                    })
                })
                .collect()
        } else {
            match parent_span {
                Some(ref parent) => parent.children().collect::<Vec<_>>(),
                None => store_ref.root_spans().collect::<Vec<_>>(),
            }
            .into_iter()
            .map(|span| Located {
                id: build_span_id(options.parent.as_deref(), &span.index.to_string()),
                item: span,
            })
            .collect()
        };

        let mut filtered = filtered;
        sort_spans(&mut filtered, options.sort);

        let (page_items, page, total_pages, total_count) =
            paginate(filtered, options.page, page_size);

        let spans = page_items
            .into_iter()
            .map(|located| {
                build_raw_span_info(
                    store_ref,
                    located,
                    parent_start,
                    options.sort,
                    depth,
                    options.samples,
                )
            })
            .collect();

        QueryResult {
            spans,
            page,
            total_pages,
            total_count,
        }
    }
}

/// Build the dash-separated index path from `ancestor` (exclusive) down to
/// `span` (inclusive), e.g. `"12-48-91"`.
///
/// `None` when `span` is not a descendant of `ancestor`, or when the chain is
/// longer than `max_depth`. Passing `None` for `ancestor` walks up to the
/// trace root.
fn raw_span_path(
    span: &SpanRef<'_>,
    ancestor: Option<&SpanRef<'_>>,
    max_depth: u32,
) -> Option<String> {
    let stop_at = ancestor.map(|a| a.index);
    let mut segments = Vec::new();
    let mut current = *span;

    loop {
        if Some(current.index) == stop_at {
            break;
        }
        if segments.len() as u32 >= max_depth {
            return None;
        }
        segments.push(current.index.to_string());
        match current.parent() {
            Some(parent) => current = parent,
            // Reached the root without finding `ancestor`.
            None => {
                if stop_at.is_some() {
                    return None;
                }
                break;
            }
        }
    }

    segments.reverse();
    Some(segments.join("-"))
}

/// Resolve a span by its MCP ID string.
///
/// IDs use the format `[a]<index>[-[a]<index>...]`:
/// - A plain decimal segment (e.g. `"123"`) refers to a raw span at that store index.
/// - A segment prefixed with `"a"` (e.g. `"a123"`) refers to the first span of an aggregated group
///   at that store index.
/// - Segments are separated by `-` to form a navigation path, e.g. `"a5-a34-20"`. Only the **last**
///   segment is needed to look up the span whose children we want to enumerate; the earlier
///   segments provide navigation context for the caller.
fn resolve_span_by_id<'a>(store: &'a store::Store, id: &str) -> Option<SpanRef<'a>> {
    // Take only the last path segment (everything after the final `-`).
    let last = id.split('-').next_back().unwrap_or(id);
    // Strip the optional "a" prefix that marks aggregated spans.
    let index_str = last.strip_prefix('a').unwrap_or(last);
    let index: usize = index_str.parse().ok()?;
    store.spans.get(index).map(|s| SpanRef {
        span: s,
        store,
        index,
    })
}

#[cfg(test)]
mod tests {
    use rustc_hash::FxHashSet;
    use turbo_rcstr::RcStr;

    use super::*;
    use crate::{
        span::{SpanArgs, SpanIndex},
        timestamp::Timestamp,
    };

    /// Build a store shaped like:
    ///
    /// ```text
    /// root
    ///  └─ outer            (index 1)
    ///      ├─ middle       (index 2)
    ///      │   └─ cat needle (index 3)   ← only reachable 3 levels down
    ///      └─ other        (index 4)
    /// ```
    fn nested_store() -> (Arc<StoreContainer>, Vec<SpanIndex>) {
        let container = Arc::new(StoreContainer::new());
        let mut indices = Vec::new();
        {
            let mut store = container.write();
            let mut outdated = FxHashSet::default();

            let outer = store.add_span(
                None,
                Timestamp::from_micros(0),
                RcStr::default(),
                RcStr::from("outer"),
                SpanArgs::new(),
                &mut outdated,
            );
            let middle = store.add_span(
                Some(outer),
                Timestamp::from_micros(1),
                RcStr::default(),
                RcStr::from("middle"),
                SpanArgs::new(),
                &mut outdated,
            );
            // `needle` gets a category so its display name ("cat needle")
            // spans both fields, which the display-name search test needs.
            let needle = store.add_span(
                Some(middle),
                Timestamp::from_micros(2),
                RcStr::from("cat"),
                RcStr::from("needle"),
                SpanArgs::new(),
                &mut outdated,
            );
            let other = store.add_span(
                Some(outer),
                Timestamp::from_micros(3),
                RcStr::default(),
                RcStr::from("other"),
                SpanArgs::new(),
                &mut outdated,
            );

            // Most bytes in `other`, so allocation order differs from
            // execution order.
            store.add_allocation(needle, 1_000, 10, &mut outdated);
            store.add_allocation(other, 50_000, 100, &mut outdated);

            for span in [outer, middle, needle, other] {
                store.complete_span(span);
            }
            store.invalidate_outdated_spans(&outdated);
            indices.extend([outer, middle, needle, other]);
        }
        (container, indices)
    }

    fn query(store: &Arc<StoreContainer>, options: QueryOptions) -> QueryResult {
        query_spans(store, options)
    }

    fn options() -> QueryOptions {
        QueryOptions {
            parent: None,
            aggregated: true,
            sort: SortMode::ExecutionOrder,
            search: None,
            max_depth: DEFAULT_SEARCH_MAX_DEPTH,
            depth: 1,
            page: 1,
            page_size: None,
            samples: None,
        }
    }

    #[test]
    fn requested_series_use_example_ranges_and_recurse_into_children() {
        let container = Arc::new(StoreContainer::new());
        {
            let mut store = container.write();
            let mut outdated = FxHashSet::default();
            let first = store.add_span(
                None,
                Timestamp::ZERO,
                RcStr::default(),
                RcStr::from("group"),
                SpanArgs::new(),
                &mut outdated,
            );
            let second = store.add_span(
                None,
                Timestamp::from_value(1000),
                RcStr::default(),
                RcStr::from("group"),
                SpanArgs::new(),
                &mut outdated,
            );
            let child = store.add_span(
                Some(first),
                Timestamp::ZERO,
                RcStr::default(),
                RcStr::from("child"),
                SpanArgs::new(),
                &mut outdated,
            );
            store.add_self_time(
                first,
                Timestamp::ZERO,
                Timestamp::from_value(1000),
                &mut outdated,
            );
            store.add_self_time(
                second,
                Timestamp::from_value(1000),
                Timestamp::from_value(2000),
                &mut outdated,
            );
            store.add_self_time(
                child,
                Timestamp::ZERO,
                Timestamp::from_value(600),
                &mut outdated,
            );
            for i in 0..600 {
                store.add_memory_sample(
                    Timestamp::from_value(i),
                    i,
                    if i == 1 { 100 } else { (i % 100) as u8 },
                    i % 8,
                );
            }
            for span in [first, second, child] {
                store.complete_span(span);
            }
            store.invalidate_outdated_spans(&outdated);
        }
        for aggregated in [false, true] {
            for limit in [None, Some(0), Some(1), Some(300), Some(1000)] {
                let result = query(
                    &container,
                    QueryOptions {
                        aggregated,
                        depth: 2,
                        samples: limit,
                        ..options()
                    },
                );
                let first = &result.spans[0];
                let expected_summary = MemorySummary {
                    count: 600,
                    start: 0,
                    end: 599,
                    min: 0,
                    peak: 599,
                    max_pressure: 100,
                };
                assert_eq!(first.memory_summary, Some(expected_summary));
                let child = &first.children[0];
                assert_eq!(child.memory_summary, Some(expected_summary));
                if let Some(limit) = limit {
                    for span in [first, child] {
                        let series = span.sample_series.as_ref().unwrap();
                        for length in [
                            series.memory_samples.len(),
                            series.memory_pressure_samples.len(),
                            series.active_worker_threads_samples.len(),
                            series.concurrency_samples.len(),
                        ] {
                            assert!(length <= limit);
                        }
                        assert_eq!(series.memory_samples.len(), limit.min(600));
                        let elapsed =
                            (span.end_relative_to_parent - span.start_relative_to_parent) as usize;
                        assert_eq!(series.concurrency_samples.len(), limit.min(elapsed));
                        if limit > 0 {
                            assert_eq!(series.memory_samples.last(), Some(&599));
                            assert_eq!(
                                series.active_worker_threads_samples.last(),
                                Some(&(599 % 8))
                            );
                        }
                    }
                    if limit == 1 {
                        assert_eq!(
                            first.sample_series.as_ref().unwrap().concurrency_samples,
                            vec![1.6]
                        );
                        assert_eq!(
                            child.sample_series.as_ref().unwrap().concurrency_samples,
                            vec![2.0]
                        );
                        assert_eq!(
                            first
                                .sample_series
                                .as_ref()
                                .unwrap()
                                .memory_pressure_samples,
                            vec![100]
                        );
                    }
                } else {
                    assert!(first.sample_series.is_none());
                    assert!(child.sample_series.is_none());
                }
                if aggregated {
                    assert_eq!(first.count, Some(2));
                    // The second member has no capture samples. Its elapsed
                    // range must not be appended to the example's series.
                    assert_eq!(result.spans.len(), 1);
                } else {
                    assert_eq!(result.spans.len(), 2);
                    assert!(result.spans[1].memory_summary.is_none());
                    if limit.is_some() {
                        assert!(
                            result.spans[1]
                                .sample_series
                                .as_ref()
                                .unwrap()
                                .memory_samples
                                .is_empty()
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn aggregated_search_finds_deep_descendants() {
        let (store, _) = nested_store();

        // `needle` is three levels below the root.
        let result = query(
            &store,
            QueryOptions {
                search: Some("needle".to_string()),
                ..options()
            },
        );

        assert_eq!(result.total_count, 1, "expected to find the nested span");
        assert_eq!(result.spans[0].name, "cat needle");
    }

    #[test]
    fn aggregated_search_returns_full_navigable_path() {
        let (store, _) = nested_store();
        let result = query(
            &store,
            QueryOptions {
                search: Some("needle".to_string()),
                ..options()
            },
        );

        let id = &result.spans[0].id;
        assert_eq!(
            id.split('-').count(),
            3,
            "expected a 3-segment path, got {id}"
        );

        // The path must resolve back to `needle`.
        let children = query(
            &store,
            QueryOptions {
                parent: Some(id.clone()),
                ..options()
            },
        );
        assert_eq!(children.total_count, 0, "needle has no children");
    }

    #[test]
    fn raw_search_finds_deep_descendants_with_paths() {
        let (store, _) = nested_store();
        let result = query(
            &store,
            QueryOptions {
                aggregated: false,
                search: Some("needle".to_string()),
                ..options()
            },
        );

        assert_eq!(result.total_count, 1);
        assert_eq!(result.spans[0].name, "cat needle");
        // outer-middle-needle
        assert_eq!(result.spans[0].id.split('-').count(), 3);
    }

    #[test]
    fn raw_search_matches_the_display_name() {
        let (store, _) = nested_store();
        // "cat needle" is the `name` a result reports, but the store's index
        // keys "cat" and "needle" separately, so only the fallback scan
        // resolves it.
        let result = query(
            &store,
            QueryOptions {
                aggregated: false,
                search: Some("cat needle".to_string()),
                ..options()
            },
        );
        assert_eq!(result.total_count, 1);
        assert_eq!(result.spans[0].name, "cat needle");
    }

    #[test]
    fn raw_search_handles_multi_word_terms_that_the_index_matches_partially() {
        let (store, _) = nested_store();
        // "cat" alone matches via the store's index. Adding a second word must
        // narrow the result, not be silently dropped: the index answers whole
        // terms only, so trusting it here returned every "cat" span.
        let both = query(
            &store,
            QueryOptions {
                aggregated: false,
                search: Some("cat needle".to_string()),
                ..options()
            },
        );
        assert_eq!(both.total_count, 1);
        assert_eq!(both.spans[0].name, "cat needle");

        // A second word that matches nothing must yield nothing, even though
        // the first word matches.
        let neither = query(
            &store,
            QueryOptions {
                aggregated: false,
                search: Some("cat nomatch".to_string()),
                ..options()
            },
        );
        assert_eq!(neither.total_count, 0);
    }

    #[test]
    fn search_respects_max_depth() {
        let (store, _) = nested_store();
        let shallow = query(
            &store,
            QueryOptions {
                search: Some("needle".to_string()),
                max_depth: 2,
                ..options()
            },
        );
        assert_eq!(
            shallow.total_count, 0,
            "needle sits at depth 3 and must be excluded at max_depth 2"
        );
    }

    #[test]
    fn depth_returns_nested_children_in_one_call() {
        let (store, _) = nested_store();
        let result = query(
            &store,
            QueryOptions {
                depth: 3,
                ..options()
            },
        );

        let outer = &result.spans[0];
        assert_eq!(outer.name, "outer");
        assert_eq!(outer.children.len(), 2, "middle and other");

        let middle = outer
            .children
            .iter()
            .find(|c| c.name == "middle")
            .expect("middle present");
        assert_eq!(middle.children.len(), 1);
        assert_eq!(middle.children[0].name, "cat needle");

        // Nested IDs stay navigable.
        assert!(middle.children[0].id.starts_with(&outer.id));
    }

    #[test]
    fn depth_one_leaves_children_empty() {
        let (store, _) = nested_store();
        let result = query(&store, options());
        assert!(result.spans[0].children.is_empty());
    }

    #[test]
    fn raw_allocation_sorts_are_descending() {
        let (store, _) = nested_store();

        // Regression: these sorted ascending, so the "biggest allocator" query
        // returned the smallest ones.
        for sort in [SortMode::Allocations, SortMode::PersistentAllocations] {
            let result = query(
                &store,
                QueryOptions {
                    aggregated: false,
                    // Search the whole tree so more than one span is ranked.
                    search: Some("e".to_string()),
                    sort,
                    ..options()
                },
            );
            let values: Vec<u64> = result
                .spans
                .iter()
                .map(|s| match sort {
                    SortMode::PersistentAllocations => s.persistent_allocations,
                    _ => s.allocations,
                })
                .collect();
            let mut sorted = values.clone();
            sorted.sort_by(|a, b| b.cmp(a));
            assert_eq!(values, sorted, "{sort:?} must be descending");
        }
    }

    #[test]
    fn page_size_is_honored_and_capped() {
        let (store, _) = nested_store();

        let paged = query(
            &store,
            QueryOptions {
                parent: Some("1".to_string()),
                aggregated: false,
                page_size: Some(1),
                ..options()
            },
        );
        assert_eq!(paged.spans.len(), 1);
        assert_eq!(paged.total_count, 2, "outer has two children");
        assert_eq!(paged.total_pages, 2);

        // An absurd request is clamped rather than rejected.
        let huge = query(
            &store,
            QueryOptions {
                page_size: Some(usize::MAX),
                ..options()
            },
        );
        assert_eq!(huge.page, 1);
    }

    #[test]
    fn heaviest_span_id_points_at_the_biggest_member() {
        let (store, indices) = nested_store();
        let result = query(
            &store,
            QueryOptions {
                parent: Some("1".to_string()),
                ..options()
            },
        );

        let other = result
            .spans
            .iter()
            .find(|s| s.name == "other")
            .expect("other present");
        // Single-member group: heaviest is that member.
        assert_eq!(
            other.heaviest_span_id.as_deref(),
            Some(indices[3].get().to_string().as_str())
        );
    }

    #[test]
    fn heaviest_span_id_differs_from_first_in_a_multi_member_group() {
        // A single-member group cannot tell the two apart, so build a group of
        // three same-named siblings where the heaviest is neither first nor
        // last. This is the case that matters: on a real trace `first_span_id`
        // reached a 75MB member of a 370MB group whose heaviest held 209MB.
        let container = Arc::new(StoreContainer::new());
        let mut members = Vec::new();
        {
            let mut store = container.write();
            let mut outdated = FxHashSet::default();
            let parent = store.add_span(
                None,
                Timestamp::from_micros(0),
                RcStr::default(),
                RcStr::from("parent"),
                SpanArgs::new(),
                &mut outdated,
            );
            // Same name so they aggregate; allocations ordered small, large,
            // medium so the winner is not simply the first or the last.
            for (i, bytes) in [1_000u64, 90_000, 40_000].into_iter().enumerate() {
                let child = store.add_span(
                    Some(parent),
                    Timestamp::from_micros(i as u64 + 1),
                    RcStr::default(),
                    RcStr::from("member"),
                    SpanArgs::new(),
                    &mut outdated,
                );
                store.add_allocation(child, bytes, 10, &mut outdated);
                store.complete_span(child);
                members.push(child);
            }
            store.complete_span(parent);
            store.invalidate_outdated_spans(&outdated);
        }

        let result = query(
            &container,
            QueryOptions {
                parent: Some("1".to_string()),
                ..options()
            },
        );
        let group = result
            .spans
            .iter()
            .find(|s| s.name == "member")
            .expect("group present");
        assert_eq!(group.count, Some(3), "the three spans must aggregate");

        let first = members[0].get().to_string();
        let heaviest = members[1].get().to_string();
        assert_eq!(group.first_span_id.as_deref(), Some(first.as_str()));
        assert_eq!(group.heaviest_span_id.as_deref(), Some(heaviest.as_str()));
        assert_ne!(
            group.first_span_id, group.heaviest_span_id,
            "otherwise this test cannot tell the two apart"
        );
    }

    #[test]
    fn memory_summary_is_absent_without_samples() {
        let (store, _) = nested_store();
        let result = query(&store, options());
        assert!(result.spans[0].memory_summary.is_none());
    }

    #[test]
    fn memory_summary_reports_peak_not_last() {
        let samples = [
            (Timestamp::from_micros(0), 100, 0, 2),
            (Timestamp::from_micros(1), 900, 3, 1),
            (Timestamp::from_micros(2), 200, 1, 3),
        ];
        let mut store = store::Store::new();
        for (ts, bytes, pressure, workers) in samples {
            store.add_memory_sample(ts, bytes, pressure, workers);
        }
        let summary = MemorySummary::for_range(&store, Timestamp::ZERO, Timestamp::from_micros(2))
            .expect("readings present");
        assert_eq!(summary.count, 3);
        assert_eq!(summary.start, 100);
        assert_eq!(summary.end, 200);
        assert_eq!(summary.min, 100);
        assert_eq!(summary.peak, 900);
        assert_eq!(summary.max_pressure, 3);
        assert!(
            MemorySummary::for_range(&store, Timestamp::from_micros(3), Timestamp::from_micros(4))
                .is_none()
        );
    }

    #[test]
    fn memory_summary_uses_raw_readings_at_inclusive_boundaries() {
        let mut store = store::Store::new();
        // Insert out of order, preserving the two readings at the same timestamp.
        for (ts, bytes, pressure) in [
            (4, 500, 100),
            (2, 10, 99),
            (2, 80, 1),
            (1, 0, 100),
            (3, 30, 2),
        ] {
            store.add_memory_sample(Timestamp::from_micros(ts), bytes, pressure, 0);
        }
        assert_eq!(
            MemorySummary::for_range(&store, Timestamp::from_micros(2), Timestamp::from_micros(3)),
            Some(MemorySummary {
                count: 3,
                start: 10,
                end: 30,
                min: 10,
                peak: 80,
                max_pressure: 99,
            })
        );
        // A point range includes both equal-time readings in insertion order.
        assert_eq!(
            MemorySummary::for_range(&store, Timestamp::from_micros(2), Timestamp::from_micros(2)),
            Some(MemorySummary {
                count: 2,
                start: 10,
                end: 80,
                min: 10,
                peak: 80,
                max_pressure: 99,
            })
        );
        assert_eq!(
            MemorySummary::for_range(&store, Timestamp::from_micros(3), Timestamp::from_micros(3)),
            Some(MemorySummary {
                count: 1,
                start: 30,
                end: 30,
                min: 30,
                peak: 30,
                max_pressure: 2,
            })
        );
    }

    #[test]
    fn memory_summary_is_absent_for_empty_and_reversed_ranges() {
        let mut store = store::Store::new();
        assert!(MemorySummary::for_range(&store, Timestamp::ZERO, Timestamp::MAX).is_none());
        store.add_memory_sample(Timestamp::from_micros(2), 100, 50, 0);
        for (start, end) in [(0, 1), (3, 4), (3, 1)] {
            assert!(
                MemorySummary::for_range(
                    &store,
                    Timestamp::from_micros(start),
                    Timestamp::from_micros(end)
                )
                .is_none()
            );
        }
    }

    #[test]
    fn search_terms_are_anded() {
        assert!(name_matches("cat", "needle in haystack", "needle,haystack"));
        assert!(!name_matches("cat", "needle only", "needle,haystack"));
        // Category counts as a match target too.
        assert!(name_matches("turbopack", "build", "turbopack"));
    }

    #[test]
    fn search_matches_the_display_name_callers_see() {
        // A result's `name` is "cat title"; searching for that exact string has
        // to find the span again, even though it spans both fields.
        assert!(name_matches("turbopack", "build", "turbopack build"));
        // Every word still has to land somewhere.
        assert!(!name_matches("turbopack", "build", "turbopack missing"));
        assert!(!name_matches("turbopack", "build", "nope"));
    }

    #[test]
    fn search_term_is_a_substring_of_the_display_name() {
        // Contiguous, in order — exactly what a term copied from a `name` is.
        assert!(name_matches("turbopack", "build", "turbopack build"));
        assert!(!name_matches("turbopack", "build", "build turbopack"));
        // Words with something between them are not a substring.
        assert!(name_matches(
            "a",
            "analyze ecmascript module",
            "analyze ecmascript"
        ));
        assert!(!name_matches(
            "a",
            "analyze ecmascript module",
            "analyze module"
        ));
        // A term may straddle the space joining the two fields.
        assert!(name_matches(
            "turbopack_ecmascript",
            "analyze module",
            "ecmascript analyze"
        ));
        assert!(!name_matches(
            "turbopack_ecmascript",
            "analyze module",
            "analyze ecmascript"
        ));
        // Straddling requires the exact boundary, not just both halves present.
        assert!(!name_matches(
            "turbopack_ecmascript",
            "analyze module",
            "turbopack module"
        ));
    }

    #[test]
    fn joined_match_is_equivalent_to_the_formatted_name() {
        // `contains_in_joined` must agree with formatting the name and calling
        // `contains`, including when a field is empty. `format_span_name` drops
        // the separator only for an empty category, so an empty title still
        // leaves a trailing space — guarding on `title.is_empty()` would lose
        // the terms that end on it.
        for (cat, title) in [("foo", ""), ("", "bar"), ("foo", "bar"), ("", "")] {
            for term in ["foo", "bar", "foo ", " bar", "foo bar", "o b", "", " "] {
                let expected = format_span_name(cat, title).contains(term);
                assert_eq!(
                    contains_in_joined(cat, title, term),
                    expected,
                    "cat={cat:?} title={title:?} term={term:?}"
                );
            }
        }
    }

    #[test]
    fn search_handles_non_ascii_without_panicking() {
        // The cursor slices `cat`/`title` by byte offset, so every offset has
        // to land on a char boundary.
        assert!(name_matches("café", "über naïve", "café über"));
        assert!(name_matches("café", "über naïve", "é ü"));
        assert!(name_matches("café", "über naïve", "über naïve"));
        assert!(!name_matches("café", "über naïve", "naïve café"));
        assert!(!name_matches("日本語", "テスト", "テスト 日本語"));
        assert!(name_matches("日本語", "テスト", "日本語 テスト"));
    }

    #[test]
    fn search_ignores_empty_terms_and_padding() {
        // Trimming and the empty-word filter must not turn separators into a
        // vacuous match-everything.
        assert!(name_matches("turbopack", "build", "  build  "));
        assert!(name_matches("turbopack", "build", "build,,"));
        assert!(!name_matches("turbopack", "build", "build, nope"));
    }
}
