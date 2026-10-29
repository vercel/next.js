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

use rustc_hash::{FxHashSet, FxHasher};

use self::{
    reader::TraceReader,
    server::serve,
    span_graph_ref::{SpanGraphEventRef, SpanGraphRef},
    span_ref::SpanRef,
    store_container::StoreContainer,
    timestamp::Timestamp,
};

#[cfg(test)]
mod analysis_tests;
mod bottom_up;
mod chunked_vec;
mod flat_profile;
mod lazy_sorted_vec;
mod memory_timeline;
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

pub use self::{
    flat_profile::{
        FlatProfileOptions, FlatProfileResult, ProfileEntry, ProfileSort, flat_profile,
    },
    memory_timeline::{
        MemoryReading, MemoryTimeline, MemoryTimelineOptions, TimelinePhase, memory_timeline,
    },
};

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
/// Callers that return every field should use smaller pages; a span's memory
/// samples alone can be a few hundred entries.
const MAX_PAGE_SIZE: usize = 10_000;

/// Cap for `QueryOptions::depth`. Each level multiplies the response size, so
/// unlike `max_depth` this one stays bounded.
const MAX_INLINE_DEPTH: u32 = 32;

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
    /// List every span in the subtree below `parent`, as if `search` matched
    /// everything. Ignored when `search` is set.
    pub recursive: bool,
    /// Maximum depth to descend below `parent` when `search` or `recursive` is
    /// set. `u32::MAX` for no limit; the store already flattens spans nested
    /// deeper than its cut-off depth, so the walk is bounded either way.
    /// `QueryResult::depth_limited` reports whether this cut anything off.
    pub max_depth: u32,
    /// When greater than 1, each returned span carries this many levels of
    /// descendants inline in `children`. Clamped to `MAX_INLINE_DEPTH`.
    pub depth: u32,
    /// 1-based page number.
    pub page: usize,
    /// Number of spans per page. Clamped to `MAX_PAGE_SIZE`; `None` uses
    /// `DEFAULT_PAGE_SIZE`.
    pub page_size: Option<usize>,
    /// Fill in `SpanInfo::memory_samples`. Without it the series is left empty
    /// (the summary is still computed), which keeps large pages small.
    pub include_memory_samples: bool,
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
    /// Display name: `"category title"` or just `"title"`. A lone span's name
    /// may include its `name` arg (e.g. a module path); `group_name` never
    /// does.
    pub name: String,
    /// The name spans are grouped by when aggregating: like `name`, but
    /// without the `name` arg, so the same work under different paths shares
    /// one value.
    pub group_name: String,
    /// Raw CPU total time in internal ticks (100 ticks = 1 µs).
    /// For aggregated spans, this is the **example span's** value, not the group total.
    /// See `total_cpu_duration` for the group total.
    pub cpu_duration: u64,
    /// Concurrency-corrected total time in internal ticks.
    /// For aggregated spans, this is the **example span's** value, not the group total.
    /// See `total_corrected_duration` for the group total.
    pub corrected_duration: u64,
    /// Absolute start, in internal ticks since the trace started. The same
    /// clock as `memory_samples` and `memory_timeline`. For aggregated spans,
    /// the earliest member start.
    pub start: u64,
    /// Absolute end, in internal ticks since the trace started. For aggregated
    /// spans, the latest member end.
    pub end: u64,
    /// `start` relative to the parent's start, in internal ticks.
    pub start_relative_to_parent: i64,
    /// `end` relative to the parent's start, in internal ticks.
    pub end_relative_to_parent: i64,
    /// Key-value attributes from the span (the example span, for aggregated
    /// spans).
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
    /// Raw span ID of the group's example span: the member with the largest
    /// corrected duration. Its `cpu_duration`, `corrected_duration`, `args`
    /// and `memory_samples` are the ones reported here.
    pub example_span_id: Option<String>,
    /// Raw span ID of the group member that came first in execution order.
    pub first_span_id: Option<String>,
    /// Raw span ID of the group member with the largest
    /// `total_persistent_allocations`.
    pub heaviest_span_id: Option<String>,
    /// Total bytes allocated by this span and all its children.
    ///
    /// For aggregated groups this is the group total, unlike `cpu_duration`,
    /// `corrected_duration` and `memory_samples`, which describe the example
    /// span only. Every allocation field below follows this field, not those.
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
    /// Process samples recorded while this span (or its example span, for
    /// aggregated groups) was live.
    ///
    /// **Process-wide, not per-span.** There is one global sample series, and a
    /// span's samples are just the slice covering its time range, so spans that
    /// overlap in time report identical values no matter what each allocated.
    /// Rank concurrent work by the allocation fields; use these for absolute
    /// memory over a span that dominates its window.
    ///
    /// Each tuple is `(ts, bytes, pressure, footprint, active_worker_threads)`.
    /// `ts` is absolute, on the same clock as `start`/`end`. `bytes` is the
    /// memory the allocator has committed from the OS (`TurboMalloc::memory_usage`,
    /// mimalloc's `current_commit`); `pressure` is the memory-pressure byte
    /// (0 = no pressure, higher = more pressure); `footprint` is the process
    /// memory footprint (RSS) in bytes (0 = not reported by the platform); and
    /// `active_worker_threads` counts non-parked Tokio scheduler workers.
    /// `100 ticks = 1 µs`.
    ///
    /// The store caps the series at `MAX_MEMORY_SAMPLES`; when more samples
    /// exist in the range, consecutive groups are merged: the timestamp and
    /// value come from the group's max-memory sample, while pressure,
    /// footprint and worker count are each the max over the group.
    pub memory_samples: Vec<(u64, u64, u8, u64, u64)>,
    /// Summary of `memory_samples`. `None` when the span's range holds none.
    pub memory_summary: Option<MemorySummary>,
    /// Committed bytes and footprint at the span's (example span's) start,
    /// interpolated between the surrounding samples. Present even for spans
    /// too short to contain a sample; outside the sampled range it is the
    /// nearest sample. `None` only for a trace without samples.
    pub memory_at_start: Option<MemoryPoint>,
    /// Like `memory_at_start`, at the span's end.
    pub memory_at_end: Option<MemoryPoint>,
    /// Descendants of this span, populated only when `QueryOptions::depth` is
    /// greater than 1. Sorted and aggregated the same way as this level.
    pub children: Vec<SpanInfo>,
}

/// Aggregate view of a span's memory samples.
///
/// Unlike the allocation counters these are absolute readings of the
/// allocator's committed memory, so `peak` is the figure to quote for memory
/// actually in use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MemorySummary {
    /// Number of samples in the span's range (after the store's downsampling).
    pub count: usize,
    /// Committed bytes at the first sample in the range.
    pub start: u64,
    /// Committed bytes at the last sample in the range.
    pub end: u64,
    /// Smallest committed-bytes reading in the range.
    pub min: u64,
    /// Largest committed-bytes reading in the range — the span's peak memory.
    pub peak: u64,
    /// Highest memory-pressure byte seen in the range (0 = no pressure).
    pub max_pressure: u8,
    /// Largest process memory footprint (RSS) in bytes seen in the range
    /// (0 = not reported by the platform).
    pub max_footprint: u64,
}

impl MemorySummary {
    /// Summarize a sample series, or `None` if it is empty.
    fn from_samples(samples: &[(u64, u64, u8, u64, u64)]) -> Option<Self> {
        let (_, first_bytes, first_pressure, first_footprint, _) = *samples.first()?;
        let mut summary = MemorySummary {
            count: samples.len(),
            start: first_bytes,
            end: samples.last().expect("non-empty").1,
            min: first_bytes,
            peak: first_bytes,
            max_pressure: first_pressure,
            max_footprint: first_footprint,
        };
        for &(_, bytes, pressure, footprint, _) in &samples[1..] {
            summary.min = summary.min.min(bytes);
            summary.peak = summary.peak.max(bytes);
            summary.max_pressure = summary.max_pressure.max(pressure);
            summary.max_footprint = summary.max_footprint.max(footprint);
        }
        Some(summary)
    }
}

/// Memory readings at one point in time, interpolated between samples.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MemoryPoint {
    /// Bytes the allocator has committed from the OS.
    pub bytes: u64,
    /// Process memory footprint (RSS) in bytes (0 = not reported by the
    /// platform).
    pub footprint: u64,
}

impl MemoryPoint {
    fn at(store: &store::Store, ts: Timestamp) -> Option<Self> {
        store
            .memory_at(ts)
            .map(|(bytes, footprint)| MemoryPoint { bytes, footprint })
    }
}

/// Result of a `query_spans` call.
pub struct QueryResult {
    pub spans: Vec<SpanInfo>,
    pub page: usize,
    pub total_pages: usize,
    pub total_count: usize,
    /// True when `max_depth` stopped the walk above spans that have
    /// descendants, so results below that depth may be missing.
    pub depth_limited: bool,
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

/// What a `parent` ID resolves to.
#[derive(Clone)]
enum Parent<'a> {
    /// A raw span, or the trace root.
    Span(SpanRef<'a>),
    /// An aggregated group, standing for all of its members at once.
    Graph(SpanGraphRef<'a>),
}

impl<'a> Parent<'a> {
    /// Resolve a span ID as produced by `SpanInfo::id`, or the trace root for
    /// `None`. `None` when the ID names no span.
    ///
    /// IDs use the format `[a]<index>[-[a]<index>...]`:
    /// - A plain decimal segment (e.g. `"123"`) is the raw span at that store index.
    /// - A segment prefixed with `"a"` (e.g. `"a123"`) is the aggregated group whose first span has
    ///   that store index. A group only exists below a particular parent, so these are resolved
    ///   along the path: each one is looked up among the groups below the previous segment.
    ///
    /// If an `a` segment doesn't match a group below the previous one (a hand-built ID, say), it
    /// falls back to the raw span at that index.
    fn resolve(store: &'a store::Store, id: Option<&str>) -> Option<Self> {
        let mut current = Parent::Span(store.root_span());
        let Some(id) = id else {
            return Some(current);
        };
        for segment in id.split('-') {
            current = match segment.strip_prefix('a') {
                Some(index) => {
                    let index: usize = index.parse().ok()?;
                    match current
                        .graph_children()
                        .into_iter()
                        .find(|graph| graph.first_span().index == index)
                    {
                        Some(graph) => Parent::Graph(graph),
                        None => Parent::Span(span_at(store, index)?),
                    }
                }
                None => Parent::Span(span_at(store, segment.parse().ok()?)?),
            };
        }
        Some(current)
    }

    /// The raw spans this parent stands for: the group's members, or the span
    /// itself.
    fn members(&self) -> Vec<SpanRef<'a>> {
        match self {
            Parent::Span(span) => vec![*span],
            Parent::Graph(graph) => graph.root_spans().collect(),
        }
    }

    /// Aggregated children, merged across every member of a group.
    fn graph_children(&self) -> Vec<SpanGraphRef<'a>> {
        match self {
            Parent::Span(span) => span_graph_children(span),
            Parent::Graph(graph) => graph_children(graph),
        }
    }

    /// Start and end on the store clock. The trace root starts at zero.
    fn extent(&self) -> (Timestamp, Timestamp) {
        match self {
            Parent::Span(span) if span.is_root() => (Timestamp::ZERO, span.end()),
            Parent::Span(span) => (span.start(), span.end()),
            Parent::Graph(graph) => group_extent(graph),
        }
    }
}

fn span_at(store: &store::Store, index: usize) -> Option<SpanRef<'_>> {
    store
        .spans
        .get(index)
        .map(|span| SpanRef { span, store, index })
}

/// Earliest member start and latest member end of a group.
fn group_extent(graph: &SpanGraphRef<'_>) -> (Timestamp, Timestamp) {
    graph
        .root_spans()
        .fold((Timestamp::MAX, Timestamp::ZERO), |(start, end), span| {
            (start.min(span.start()), end.max(span.end()))
        })
}

/// The member a group reports durations, args and memory for: the one with
/// the largest corrected duration. The first member is often a trivial one,
/// which made groups look cheap when their heavy member dominated.
fn group_example<'a>(graph: &SpanGraphRef<'a>) -> SpanRef<'a> {
    graph
        .root_spans()
        .max_by_key(|span| (span.corrected_total_time(), span.total_time()))
        .unwrap_or_else(|| graph.first_span())
}

/// Walk the aggregated graph below `roots`, returning every node whose name
/// matches `query`, each tagged with its full path ID, and whether `max_depth`
/// cut off any descendants.
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
) -> (Vec<Located<SpanGraphRef<'a>>>, bool) {
    let mut matches = Vec::new();
    let mut depth_limited = false;
    let mut queue: VecDeque<(Located<SpanGraphRef<'a>>, u32)> =
        roots.into_iter().map(|located| (located, 1)).collect();

    while let Some((located, depth)) = queue.pop_front() {
        let (cat, title) = located.item.nice_name();
        let is_match = name_matches(cat, title, query);

        let children = graph_children(&located.item);
        if depth < max_depth {
            for child in children {
                let leaf = format!("a{}", child.first_span().index);
                let id = build_span_id(Some(&located.id), &leaf);
                queue.push_back((Located { item: child, id }, depth + 1));
            }
        } else if !children.is_empty() {
            depth_limited = true;
        }

        if is_match {
            matches.push(located);
        }
    }

    (matches, depth_limited)
}

/// Raw spans below `members` whose name matches `query`, through the store's
/// search index, in no particular order.
///
/// The index keys a span's category, title and arg values separately (it is
/// shared with the WebSocket viewer), and matches each comma-separated term as
/// a substring of one key. A term with spaces can straddle category and title,
/// as a `name` copied from a result does, so it can't be looked up as is.
/// Instead each of its words is, which narrows the spans to those containing
/// every word somewhere, and those candidates are checked against the query.
fn index_search<'a>(members: &[SpanRef<'a>], query: &str) -> Vec<SpanRef<'a>> {
    if !query.split(',').any(|term| term.trim().contains(' ')) {
        return members.iter().flat_map(|span| span.search(query)).collect();
    }
    let words = query
        .split(|c: char| c == ',' || c.is_whitespace())
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join(",");
    members
        .iter()
        .flat_map(|span| span.search(&words))
        .filter(|span| {
            let (cat, title) = span.nice_name();
            name_matches(cat, title, query)
        })
        .collect()
}

/// Walk raw spans below `roots`, returning every span whose name matches
/// `query`, and whether `max_depth` cut off any descendants.
///
/// Used for groups, where the store's index can't answer; see the call site.
fn search_spans_recursive<'a>(
    roots: Vec<SpanRef<'a>>,
    query: &str,
    max_depth: u32,
) -> (Vec<SpanRef<'a>>, bool) {
    let mut matches = Vec::new();
    let mut depth_limited = false;
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
        } else if span.children().next().is_some() {
            depth_limited = true;
        }
    }

    (matches, depth_limited)
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

/// Sort raw spans in place. Stable, so ties keep their order.
fn sort_spans(items: &mut [SpanRef<'_>], sort: SortMode) {
    match sort {
        SortMode::Value => items.sort_by(|a, b| {
            b.corrected_total_time()
                .cmp(&a.corrected_total_time())
                .then_with(|| b.total_time().cmp(&a.total_time()))
        }),
        SortMode::Name => items.sort_by(|a, b| {
            let (a_cat, a_title) = a.nice_name();
            let (b_cat, b_title) = b.nice_name();
            a_title.cmp(b_title).then_with(|| a_cat.cmp(b_cat))
        }),
        SortMode::Allocations => {
            items.sort_by_key(|s| Reverse(s.total_allocations()));
        }
        SortMode::PersistentAllocations => {
            items.sort_by_key(|s| Reverse(s.total_persistent_allocations()));
        }
        SortMode::ExecutionOrder => {}
    }
}

/// The memory fields of a `SpanInfo` for `span`.
struct SpanMemory {
    samples: Vec<(u64, u64, u8, u64, u64)>,
    summary: Option<MemorySummary>,
    at_start: Option<MemoryPoint>,
    at_end: Option<MemoryPoint>,
}

impl SpanMemory {
    /// `include_samples` keeps the series; the summary is computed either way.
    fn of(store: &store::Store, span: &SpanRef<'_>, include_samples: bool) -> Self {
        let mut samples: Vec<_> = store
            .memory_samples_for_range_with_ts(span.start(), span.end())
            .into_iter()
            .map(|(ts, mem, pressure, footprint, workers)| (*ts, mem, pressure, footprint, workers))
            .collect();
        let summary = MemorySummary::from_samples(&samples);
        if !include_samples {
            samples = Vec::new();
        }
        SpanMemory {
            summary,
            samples,
            at_start: MemoryPoint::at(store, span.start()),
            at_end: MemoryPoint::at(store, span.end()),
        }
    }
}

fn group_name_of(span: &SpanRef<'_>) -> String {
    let (cat, title) = span.group_name();
    format_span_name(cat, title)
}

/// Build a `SpanInfo` for an aggregated graph node, recursing into children
/// while `depth > 1`.
fn build_graph_span_info(
    store: &store::Store,
    located: Located<SpanGraphRef<'_>>,
    parent_start: Timestamp,
    sort: SortMode,
    depth: u32,
    include_memory_samples: bool,
) -> SpanInfo {
    let Located { item: graph, id } = located;
    let first = graph.first_span();
    let example = group_example(&graph);
    let (start, end) = group_extent(&graph);
    let (cat, title) = graph.nice_name();
    let count = graph.count() as u64;
    let total_cpu = *graph.total_time();
    let total_corrected = *graph.corrected_total_time();

    let heaviest = graph
        .root_spans()
        .max_by_key(|span| span.total_persistent_allocations())
        .map(|span| span.index.to_string());

    let memory = SpanMemory::of(store, &example, include_memory_samples);

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
                build_graph_span_info(store, child, start, sort, depth - 1, include_memory_samples)
            })
            .collect()
    } else {
        Vec::new()
    };

    SpanInfo {
        id,
        name: format_span_name(cat, title),
        group_name: group_name_of(&first),
        cpu_duration: *example.total_time(),
        corrected_duration: *example.corrected_total_time(),
        start: *start,
        end: *end,
        start_relative_to_parent: (*start as i64) - (*parent_start as i64),
        end_relative_to_parent: (*end as i64) - (*parent_start as i64),
        args: example
            .args()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect(),
        is_aggregated: count > 1,
        count: Some(count),
        total_cpu_duration: Some(total_cpu),
        avg_cpu_duration: Some(total_cpu.checked_div(count).unwrap_or(0)),
        total_corrected_duration: Some(total_corrected),
        avg_corrected_duration: Some(total_corrected.checked_div(count).unwrap_or(0)),
        example_span_id: Some(example.index.to_string()),
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
        memory_samples: memory.samples,
        memory_summary: memory.summary,
        memory_at_start: memory.at_start,
        memory_at_end: memory.at_end,
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
    include_memory_samples: bool,
) -> SpanInfo {
    let Located { item: span, id } = located;
    let (cat, title) = span.nice_name();

    let memory = SpanMemory::of(store, &span, include_memory_samples);

    let children = if depth > 1 {
        let mut children: Vec<_> = span.children().collect();
        sort_spans(&mut children, sort);
        children
            .into_iter()
            .map(|child| {
                let located = Located {
                    id: build_span_id(Some(&id), &child.index.to_string()),
                    item: child,
                };
                build_raw_span_info(
                    store,
                    located,
                    span.start(),
                    sort,
                    depth - 1,
                    include_memory_samples,
                )
            })
            .collect()
    } else {
        Vec::new()
    };

    SpanInfo {
        id,
        name: format_span_name(cat, title),
        group_name: group_name_of(&span),
        cpu_duration: *span.total_time(),
        corrected_duration: *span.corrected_total_time(),
        start: *span.start(),
        end: *span.end(),
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
        example_span_id: None,
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
        memory_samples: memory.samples,
        memory_summary: memory.summary,
        memory_at_start: memory.at_start,
        memory_at_end: memory.at_end,
        children,
    }
}

/// Waits up to 10 seconds for at least some data to be loaded, so callers
/// don't need to poll separately.
fn wait_for_data(store: &StoreContainer) {
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
}

/// Query spans from the store.
///
/// Waits up to 10 seconds for at least some data to be loaded before
/// returning, so callers don't need to poll separately.
pub fn query_spans(store: &Arc<StoreContainer>, options: QueryOptions) -> QueryResult {
    wait_for_data(store);

    let store_guard = store.read();
    let store_ref = &*store_guard;

    let Some(parent) = Parent::resolve(store_ref, options.parent.as_deref()) else {
        return QueryResult {
            spans: Vec::new(),
            page: 1,
            total_pages: 1,
            total_count: 0,
            depth_limited: false,
        };
    };

    let (parent_start, _) = parent.extent();
    let max_depth = options.max_depth.max(1);
    let depth = options.depth.clamp(1, MAX_INLINE_DEPTH);
    let page_size = options
        .page_size
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .clamp(1, MAX_PAGE_SIZE);
    // `recursive` lists the whole subtree, which is a search that matches
    // everything: a query without terms.
    let search = options
        .search
        .clone()
        .or_else(|| options.recursive.then(String::new));

    if options.aggregated {
        let direct: Vec<Located<SpanGraphRef<'_>>> = parent
            .graph_children()
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
        let (mut filtered, depth_limited) = match search {
            Some(ref query) => search_graph_recursive(direct, query, max_depth),
            None => (direct, false),
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
                    options.include_memory_samples,
                )
            })
            .collect();

        QueryResult {
            spans,
            page,
            total_pages,
            total_count,
            depth_limited,
        }
    } else {
        let members = parent.members();
        let mut depth_limited = false;
        // What a search's results are pathed from. Without a search every
        // result is a direct child, whose ID is just its index.
        let mut ancestors = None;
        let mut filtered: Vec<SpanRef<'_>> = if let Some(ref query) = search {
            let matches = if let Parent::Graph(_) = parent {
                // A group would need an index built for each of its members,
                // so walk them instead.
                let roots = members.iter().flat_map(|span| span.children()).collect();
                let (matches, limited) = search_spans_recursive(roots, query, max_depth);
                depth_limited = limited;
                matches
            } else {
                index_search(&members, query)
            };
            let set: FxHashSet<usize> = members.iter().map(|span| span.index).collect();
            let mut matches: Vec<_> = if max_depth == u32::MAX {
                // A span's index covers its own subtree, so every match is a
                // descendant, apart from the span itself. Walking up to check
                // the depth was most of a page's cost, so skip it when there
                // is no limit to check.
                matches
                    .into_iter()
                    .filter(|span| !set.contains(&span.index))
                    .collect()
            } else {
                // The index isn't depth-limited, so apply the limit here. Only
                // the depth is needed; IDs are built for the returned page
                // alone, since building them for every match also dominated.
                matches
                    .into_iter()
                    .filter(|span| match walk_to_ancestor(span, &set, |_| {}) {
                        Some(depth) if depth <= max_depth as usize => true,
                        Some(_) => {
                            depth_limited = true;
                            false
                        }
                        None => false,
                    })
                    .collect()
            };
            // The index answers in hash order; restore execution order so
            // that is what an unsorted search returns, and pages are stable.
            matches.sort_unstable_by_key(|span| span.index);
            ancestors = Some(set);
            matches
        } else {
            members.iter().flat_map(|span| span.children()).collect()
        };

        sort_spans(&mut filtered, options.sort);

        let (page_items, page, total_pages, total_count) =
            paginate(filtered, options.page, page_size);

        let spans = page_items
            .into_iter()
            .map(|span| {
                let leaf = match &ancestors {
                    Some(ancestors) => raw_span_path(&span, ancestors)
                        .expect("filtered to descendants")
                        .join("-"),
                    None => span.index.to_string(),
                };
                let located = Located {
                    id: build_span_id(options.parent.as_deref(), &leaf),
                    item: span,
                };
                build_raw_span_info(
                    store_ref,
                    located,
                    parent_start,
                    options.sort,
                    depth,
                    options.include_memory_samples,
                )
            })
            .collect();

        QueryResult {
            spans,
            page,
            total_pages,
            total_count,
            depth_limited,
        }
    }
}

/// Walk up from `span` to just below one of `ancestors`, calling `visit` for
/// each span on the way (`span` first), and return how many there were: the
/// depth of `span` below that ancestor.
///
/// `None` when `span` is not a strict descendant of any of `ancestors`. The
/// trace root, index 0, is the ancestor of every top-level span.
fn walk_to_ancestor<'a>(
    span: &SpanRef<'a>,
    ancestors: &FxHashSet<usize>,
    mut visit: impl FnMut(&SpanRef<'a>),
) -> Option<usize> {
    let mut depth = 0;
    let mut current = Some(*span);
    loop {
        // Top-level spans have no parent; the trace root stands in for it.
        let index = current.map_or(0, |span| span.index);
        if ancestors.contains(&index) {
            break;
        }
        let span = current?;
        visit(&span);
        depth += 1;
        current = span.parent();
    }
    // Zero when `span` is one of the ancestors itself.
    (depth > 0).then_some(depth)
}

/// The store indices from just below one of `ancestors` down to `span`
/// (inclusive), top first. `None` like [`walk_to_ancestor`].
fn raw_span_path(span: &SpanRef<'_>, ancestors: &FxHashSet<usize>) -> Option<Vec<String>> {
    let mut segments = Vec::new();
    walk_to_ancestor(span, ancestors, |span| {
        segments.push(span.index.to_string())
    })?;
    segments.reverse();
    Some(segments)
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
            recursive: false,
            max_depth: u32::MAX,
            depth: 1,
            page: 1,
            page_size: None,
            include_memory_samples: true,
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
            (0u64, 100u64, 0u8, 5000u64, 2u64),
            (1, 900, 3, 4000, 1),
            (2, 200, 1, 7000, 3),
        ];
        let summary = MemorySummary::from_samples(&samples).expect("samples present");
        assert_eq!(summary.count, 3);
        assert_eq!(summary.start, 100);
        assert_eq!(summary.end, 200);
        assert_eq!(summary.min, 100);
        assert_eq!(summary.peak, 900);
        assert_eq!(summary.max_pressure, 3);
        // Footprint is maxed independently of the memory peak.
        assert_eq!(summary.max_footprint, 7000);
        assert!(MemorySummary::from_samples(&[]).is_none());
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
