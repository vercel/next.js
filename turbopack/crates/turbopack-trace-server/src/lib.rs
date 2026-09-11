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

/// Default number of spans returned per page when the caller doesn't ask for
/// a specific size.
const DEFAULT_PAGE_SIZE: usize = 20;

/// Upper bound on a caller-supplied page size. Large pages are useful when
/// enumerating the children of a wide span (a few hundred at a time instead of
/// dozens of round-trips), but the cap keeps a single response bounded.
const MAX_PAGE_SIZE: usize = 500;

/// Default maximum depth for a recursive search, and the cap on
/// `QueryOptions::max_depth`. Deep enough to reach any leaf in a realistic
/// trace, shallow enough that a pathological cycle can't run away.
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
    /// Sort by total persistent (net retained) bytes, descending.
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
    /// The search is **recursive**: it matches the parent's entire subtree, not
    /// just its direct children, and each result's `id` is the full navigable
    /// path from `parent` down to the match. Without this, finding a span
    /// requires already knowing which branch it lives on.
    pub search: Option<String>,
    /// Maximum depth to descend below `parent` when `search` is set, or when
    /// `depth` requests a nested subtree. Clamped to `DEFAULT_SEARCH_MAX_DEPTH`.
    pub max_depth: u32,
    /// When greater than 1, each returned span carries its descendants inline
    /// (up to this many levels), so a caller can pull a subtree in one call
    /// instead of one round-trip per level.
    pub depth: u32,
    /// 1-based page number.
    pub page: usize,
    /// Number of spans per page. Clamped to `MAX_PAGE_SIZE`; `None` uses
    /// `DEFAULT_PAGE_SIZE`.
    pub page_size: Option<usize>,
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
    /// Raw span ID of the group's **first** span (the example span whose
    /// `cpu_duration`, `corrected_duration` and `memory_samples` are reported
    /// above). First in execution order — *not* the largest or the most
    /// representative. Drilling in here to explain a group's allocation total
    /// will usually land on an unremarkable span; use `heaviest_span_id` for
    /// that.
    pub first_span_id: Option<String>,
    /// Raw span ID of the group member with the largest
    /// `total_persistent_allocations`, i.e. the one actually responsible for
    /// most of the group's retained bytes. This is the span to drill into when
    /// a group's allocation numbers are what drew your attention.
    pub heaviest_span_id: Option<String>,
    /// Total bytes allocated by this span and all its children.
    ///
    /// For aggregated groups this is the **group total** across every span in
    /// the group. Note the asymmetry with the fields above: `cpu_duration`,
    /// `corrected_duration` and `memory_samples` describe the *example* span
    /// only, while every allocation field here is a group total. Carrying the
    /// example-span mental model over to these fields reads a group's numbers
    /// as one span's.
    pub allocations: u64,
    /// Total bytes deallocated by this span and all its children.
    /// Group total for aggregated spans.
    pub deallocations: u64,
    /// Net bytes attributed to this span and its children: the sum over each
    /// span of `max(0, self_allocations - self_deallocations)`. Group total for
    /// aggregated spans.
    ///
    /// **This is a ranking signal, not a measure of retained memory.** It is
    /// allocated-minus-freed as observed by TurboMalloc's per-span counters,
    /// which never see memory released outside the allocating span's window —
    /// turbo-tasks cell and cache drops in particular. A whole-trace total
    /// running far above real peak RSS is expected, not a leak. Use
    /// `memory_samples` for absolute memory; use this to rank who allocates.
    ///
    /// It is also not `allocations - deallocations`: the per-span floor at zero
    /// means a span that frees more than it allocates contributes 0 rather than
    /// a negative, so the two differ whenever any span has net-negative
    /// self-allocation (see `self_deallocations` for why that is common).
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
    /// Frees are charged to whichever span was on top of the thread's stack
    /// **at free time**, which is often not the span that allocated the memory.
    /// A child that allocates into a buffer its parent later drops shows up as
    /// a child with large `self_allocations` and a parent with large
    /// `self_deallocations` — which reads like "the child leaks" but is the
    /// opposite: it is proof the memory was released.
    ///
    /// Read the pair as a diagnostic. Small `self_allocations` alongside large
    /// `self_deallocations` means this span is where a child's arena gets
    /// dropped, i.e. that arena is bounded. A large `self_persistent_allocations`
    /// with no such counterpart anywhere above it is the shape that actually
    /// warrants suspicion.
    pub self_deallocations: u64,
    /// Net retained bytes by this span itself, excluding children.
    /// Group total for aggregated spans.
    pub self_persistent_allocations: u64,
    /// Number of allocation operations by this span itself, excluding children.
    /// Group total for aggregated spans.
    pub self_allocation_count: u64,
    /// TurboMalloc memory-usage samples recorded while this span (or its
    /// example span, for aggregated groups) was live.
    ///
    /// Each tuple is `(ts_offset_from_span_start_in_ticks, bytes, pressure)`,
    /// where `pressure` is the memory-pressure byte recorded with the sample
    /// (0 = no pressure, higher = more pressure). `100 ticks = 1 µs`. The
    /// offset is always `>= 0` and `<= span_duration`.
    ///
    /// The store caps the series at `MAX_MEMORY_SAMPLES`; when more samples
    /// exist in the range, consecutive groups are merged by picking the
    /// group's max-memory sample (timestamp, value, and pressure kept
    /// together).
    pub memory_samples: Vec<(i64, u64, u8)>,
    /// Summary of `memory_samples`, precomputed so callers don't each rederive
    /// it from the raw triples. `None` when no samples fall in the span's
    /// range.
    pub memory_summary: Option<MemorySummary>,
    /// Descendants of this span, present only when the query asked for a
    /// nested subtree via `QueryOptions::depth`. Each child is a full
    /// `SpanInfo` with its own navigable `id`, sorted and aggregated the same
    /// way as this level.
    pub children: Vec<SpanInfo>,
}

/// Aggregate view of a span's TurboMalloc memory samples.
///
/// Unlike the allocation counters, these are absolute live-heap readings, so
/// `peak` is the number to quote for "how much memory was actually in use".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MemorySummary {
    /// Number of samples in the span's range (after the store's downsampling).
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
    /// Summarize a sample series, or `None` if it is empty.
    fn from_samples(samples: &[(i64, u64, u8)]) -> Option<Self> {
        let (_, first_bytes, first_pressure) = *samples.first()?;
        let mut summary = MemorySummary {
            count: samples.len(),
            start: first_bytes,
            end: samples.last().expect("non-empty").1,
            min: first_bytes,
            peak: first_bytes,
            max_pressure: first_pressure,
        };
        for &(_, bytes, pressure) in &samples[1..] {
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

/// A candidate span found while walking, paired with the full navigable ID
/// path that leads to it.
struct Located<T> {
    item: T,
    /// Full path ID, e.g. `"a5-a34-a91"`. Passing this back as `parent`
    /// enumerates the located span's children.
    id: String,
}

/// Does this name match the search query?
///
/// Comma-separated terms are ANDed, and each term is a substring match against
/// the category, the title, or the `"category title"` display name. Matching
/// the display name matters because that is the `name` a caller sees in a
/// result — searching for a name copied out of one response has to find it
/// again, and a term spanning the two fields matches neither on its own.
fn name_matches(cat: &str, title: &str, query: &str) -> bool {
    let display = format_span_name(cat, title);
    query
        .split(',')
        .map(str::trim)
        .filter(|term| !term.is_empty())
        .all(|term| cat.contains(term) || title.contains(term) || display.contains(term))
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
/// The raw-span path gets recursion for free from the store's search index
/// (`SpanRef::search` indexes the whole subtree), but the aggregated path has
/// no such index — a graph node is built on demand. So we BFS it here, which
/// is what makes `search` usable in the default `aggregated: true` mode: a
/// caller can find a span by name without already knowing which branch holds
/// it.
///
/// A match does not stop the descent: a matching node's subtree is still
/// searched, since nested spans often share a name with an ancestor.
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

/// Walk raw spans below `roots`, returning every span whose display name
/// matches `query`.
///
/// Only used as a fallback when the store's search index comes up empty; see
/// the call site.
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
        // Descending, matching the documented order and the aggregated path.
        SortMode::Allocations => {
            items.sort_by_key(|s| Reverse(s.item.total_allocations()));
        }
        SortMode::PersistentAllocations => {
            items.sort_by_key(|s| Reverse(s.item.total_persistent_allocations()));
        }
        SortMode::ExecutionOrder => {}
    }
}

/// Memory samples recorded while `span` was live, offset from its start.
fn memory_samples_for(store: &store::Store, span: &SpanRef<'_>) -> Vec<(i64, u64, u8)> {
    let span_start = *span.start() as i64;
    store
        .memory_samples_for_range_with_ts(span.start(), span.end())
        .into_iter()
        .map(|(ts, mem, pressure)| ((*ts as i64) - span_start, mem, pressure))
        .collect()
}

/// Build a `SpanInfo` for an aggregated graph node, recursing into children
/// while `depth > 1`.
fn build_graph_span_info(
    store: &store::Store,
    located: Located<SpanGraphRef<'_>>,
    parent_start: Timestamp,
    sort: SortMode,
    depth: u32,
) -> SpanInfo {
    let Located { item: graph, id } = located;
    let first = graph.first_span();
    let (cat, title) = graph.nice_name();
    let count = graph.count() as u64;
    let total_cpu = *graph.total_time();
    let total_corrected = *graph.corrected_total_time();

    // The group member holding the most retained bytes. `first_span` is just
    // whichever ran first, so drilling in on it to explain a group's
    // allocations usually lands on the wrong span.
    let heaviest = graph
        .root_spans()
        .max_by_key(|span| span.total_persistent_allocations())
        .map(|span| span.index.to_string());

    let memory_samples = memory_samples_for(store, &first);
    let memory_summary = MemorySummary::from_samples(&memory_samples);

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
            .map(|child| build_graph_span_info(store, child, first.start(), sort, depth - 1))
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
        memory_samples,
        memory_summary,
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
) -> SpanInfo {
    let Located { item: span, id } = located;
    let (cat, title) = span.nice_name();

    let memory_samples = memory_samples_for(store, &span);
    let memory_summary = MemorySummary::from_samples(&memory_samples);

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
            .map(|child| build_raw_span_info(store, child, span.start(), sort, depth - 1))
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
        memory_samples,
        memory_summary,
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

    // Resolve the parent span.
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
        // Direct aggregated children of the resolved parent (or of the root).
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

        // Search descends the whole subtree; without a query we stay at this level.
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
                build_graph_span_info(store_ref, located, parent_start, options.sort, depth)
            })
            .collect();

        QueryResult {
            spans,
            page,
            total_pages,
            total_count,
        }
    } else {
        // Raw spans mode. `SpanRef::search` is already recursive (the store's
        // search index covers the whole subtree), so a search here returns
        // descendants at any depth; the walk below only exists to recover each
        // hit's full path ID.
        let filtered: Vec<Located<SpanRef<'_>>> = if let Some(ref query) = options.search {
            let mut matches: Vec<SpanRef<'_>> = match parent_span {
                Some(ref parent) => parent.search(query).collect(),
                None => store_ref.root_span().search(query).collect(),
            };
            // The store's index keys category and title separately (it is
            // shared with the WebSocket viewer), so a query spanning both —
            // such as a `name` copied straight out of a previous result —
            // misses. Fall back to a subtree scan for those, matching the
            // aggregated path.
            if matches.is_empty() {
                let roots: Vec<SpanRef<'_>> = match parent_span {
                    Some(ref parent) => parent.children().collect(),
                    None => store_ref.root_spans().collect(),
                };
                matches = search_spans_recursive(roots, query, max_depth);
            }
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
                build_raw_span_info(store_ref, located, parent_start, options.sort, depth)
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
    ///      │   └─ needle   (index 3)   ← only reachable 3 levels down
    ///      └─ other        (index 4)
    /// ```
    ///
    /// `needle` is deliberately not a direct child of anything a caller would
    /// query first, so a non-recursive search cannot find it.
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
            let needle = store.add_span(
                Some(middle),
                Timestamp::from_micros(2),
                RcStr::default(),
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

            // Allocate most bytes in `other` so allocation sorting has a clear
            // winner that differs from execution order.
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
        }
    }

    #[test]
    fn aggregated_search_finds_deep_descendants() {
        let (store, _) = nested_store();

        // `needle` is three levels below the root. A search that only filtered
        // direct children would return nothing here.
        let result = query(
            &store,
            QueryOptions {
                search: Some("needle".to_string()),
                ..options()
            },
        );

        assert_eq!(result.total_count, 1, "expected to find the nested span");
        assert_eq!(result.spans[0].name, "needle");
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

        // The ID must be the whole path, not just the leaf, so it can be passed
        // back as `parent`.
        let id = &result.spans[0].id;
        assert_eq!(
            id.split('-').count(),
            3,
            "expected a 3-segment path, got {id}"
        );

        // And it must actually resolve back to `needle`.
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
        assert_eq!(result.spans[0].name, "needle");
        // outer-middle-needle
        assert_eq!(result.spans[0].id.split('-').count(), 3);
    }

    #[test]
    fn raw_search_matches_the_display_name() {
        let (store, _) = nested_store();
        // The store's index keys category and title separately; a display-name
        // query must still resolve via the fallback scan.
        let result = query(
            &store,
            QueryOptions {
                aggregated: false,
                search: Some("needle".to_string()),
                ..options()
            },
        );
        assert_eq!(result.total_count, 1);
        assert_eq!(result.spans[0].name, "needle");
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
        assert_eq!(middle.children[0].name, "needle");

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
    fn memory_summary_is_absent_without_samples() {
        let (store, _) = nested_store();
        let result = query(&store, options());
        assert!(result.spans[0].memory_summary.is_none());
    }

    #[test]
    fn memory_summary_reports_peak_not_last() {
        let samples = [(0i64, 100u64, 0u8), (1, 900, 3), (2, 200, 1)];
        let summary = MemorySummary::from_samples(&samples).expect("samples present");
        assert_eq!(summary.count, 3);
        assert_eq!(summary.start, 100);
        assert_eq!(summary.end, 200);
        assert_eq!(summary.min, 100);
        assert_eq!(summary.peak, 900);
        assert_eq!(summary.max_pressure, 3);
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
    }
}
