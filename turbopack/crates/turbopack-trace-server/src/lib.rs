#![feature(box_patterns)]
#![feature(bufreader_peek)]

use std::{
    hash::BuildHasherDefault,
    path::PathBuf,
    sync::Arc,
    thread,
    time::{Duration, Instant},
};

use rustc_hash::FxHasher;

use self::{
    reader::TraceReader, server::serve, span_graph_ref::SpanGraphRef, span_ref::SpanRef,
    store_container::StoreContainer,
};

mod bottom_up;
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

const PAGE_SIZE: usize = 20;

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
}

/// Options for querying spans from the trace store.
pub struct QueryOptions {
    /// Optional parent span ID (as produced by `SpanInfo::id`).
    /// `None` means root level. Pass the `id` from a previous result directly.
    pub parent: Option<String>,
    /// When true, aggregate child spans with the same name.
    pub aggregated: bool,
    /// How to sort the results.
    pub sort: SortMode,
    /// Optional substring search query.
    pub search: Option<String>,
    /// 1-based page number.
    pub page: usize,
}

/// Information about a single span (or aggregated group of spans).
pub struct SpanInfo {
    /// Span ID string. Pass this directly as `parent` to drill into children.
    ///
    /// - A **raw span** ID is its unique decimal store index: `"123"`.
    /// - An **aggregated span** ID is a full `-`-separated path through the aggregation tree:
    ///   `"a2119"`, `"a2119-a2120"`, etc.
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
    /// Raw span ID for aggregated groups (the index of the first span).
    pub first_span_id: Option<String>,
}

/// Result of a `query_spans` call.
pub struct QueryResult {
    pub spans: Vec<SpanInfo>,
    pub page: usize,
    pub total_pages: usize,
    pub total_count: usize,
}

/// Paginate a vec of items. Returns `(page_items, clamped_page, total_pages, total_count)`.
fn paginate<T>(items: Vec<T>, page: usize) -> (Vec<T>, usize, usize, usize) {
    let total_count = items.len();
    let total_pages = total_count.div_ceil(PAGE_SIZE).max(1);
    let page = page.clamp(1, total_pages);
    let start = (page - 1) * PAGE_SIZE;
    let page_items = items.into_iter().skip(start).take(PAGE_SIZE).collect();
    (page_items, page, total_pages, total_count)
}

fn format_span_name(cat: &str, title: &str) -> String {
    if cat.is_empty() {
        title.to_string()
    } else {
        format!("{cat} {title}")
    }
}

/// Apply the requested sort mode to a list of items with duration and name accessors.
fn sort_items<T>(
    items: &mut [T],
    sort: SortMode,
    corrected_total_time: impl Fn(&T) -> u64,
    total_time: impl Fn(&T) -> u64,
    nice_name: impl Fn(&T) -> (&str, &str),
) {
    match sort {
        SortMode::Value => {
            items.sort_by(|a, b| {
                corrected_total_time(b)
                    .cmp(&corrected_total_time(a))
                    .then_with(|| total_time(b).cmp(&total_time(a)))
            });
        }
        SortMode::Name => {
            items.sort_by(|a, b| {
                let (a_cat, a_title) = nice_name(a);
                let (b_cat, b_title) = nice_name(b);
                a_title.cmp(b_title).then_with(|| a_cat.cmp(b_cat))
            });
        }
        SortMode::ExecutionOrder => {}
    }
}

/// Walk the aggregation graph tree following a `-`-separated path of `a<N>`
/// segments. Returns the graph node at the end of the path, or `None` if
/// any segment doesn't match.
///
/// Each segment `a<N>` selects the child `SpanGraphRef` whose first span
/// index equals `N`.
fn resolve_graph_by_path<'a>(store: &'a store::Store, path: &str) -> Option<SpanGraphRef<'a>> {
    let mut segments = path.split('-');
    let first = segments.next()?;
    let first_index: usize = first.strip_prefix('a')?.parse().ok()?;

    // Start from the root graph children.
    let mut current: SpanGraphRef<'a> = store
        .root_span()
        .graph()
        .filter_map(|event| match event {
            span_graph_ref::SpanGraphEventRef::Child { graph } => Some(graph),
            span_graph_ref::SpanGraphEventRef::SelfTime { .. } => None,
        })
        .find(|g| g.first_span().index == first_index)?;

    for segment in segments {
        let target_index: usize = segment.strip_prefix('a')?.parse().ok()?;
        let next = current
            .children()
            .find(|g| g.first_span().index == target_index)?;
        current = next;
    }

    Some(current)
}

/// Resolve a parent span from an ID string. For raw IDs, use the last segment.
/// Returns `None` for root level.
fn resolve_parent_span<'a>(
    store: &'a store::Store,
    parent_id: Option<&str>,
) -> Option<SpanRef<'a>> {
    parent_id.and_then(|id| resolve_span_by_id(store, id))
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

    if options.aggregated {
        query_spans_aggregated(store_ref, &options)
    } else {
        query_spans_raw(store_ref, &options)
    }
}

/// Aggregated mode: group child spans by name using the SpanGraph tree.
///
/// When a search query is provided, uses `SpanRef::search` to find matching
/// spans anywhere in the subtree and returns them as individual (raw) results
/// rather than aggregated groups.
fn query_spans_aggregated(store: &store::Store, options: &QueryOptions) -> QueryResult {
    // When searching, use SpanRef::search on the parent span (or root) to find
    // matching spans in the entire subtree. Returns raw spans, not aggregated.
    if let Some(ref query) = options.search {
        let parent_span = resolve_parent_span(store, options.parent.as_deref());
        let parent_start = parent_span.as_ref().map(|s| *s.start()).unwrap_or_default();

        let mut results: Vec<SpanRef<'_>> = if let Some(ref parent) = parent_span {
            parent.search(query).collect()
        } else {
            store.root_span().search(query).collect()
        };

        sort_items(
            &mut results,
            options.sort,
            |s| *s.corrected_total_time(),
            |s| *s.total_time(),
            |s| s.nice_name(),
        );

        let (page_items, page, total_pages, total_count) = paginate(results, options.page);
        let spans = page_items
            .into_iter()
            .map(|span| span_ref_to_info(&span, parent_start))
            .collect();

        return QueryResult {
            spans,
            page,
            total_pages,
            total_count,
        };
    }

    // No search — show aggregated graph children.
    let graph_children: Vec<SpanGraphRef<'_>> = if let Some(ref parent_id) = options.parent {
        if let Some(parent_graph) = resolve_graph_by_path(store, parent_id) {
            parent_graph.children().collect()
        } else {
            return QueryResult {
                spans: Vec::new(),
                page: 1,
                total_pages: 1,
                total_count: 0,
            };
        }
    } else {
        store
            .root_span()
            .graph()
            .filter_map(|event| match event {
                span_graph_ref::SpanGraphEventRef::Child { graph } => Some(graph),
                span_graph_ref::SpanGraphEventRef::SelfTime { .. } => None,
            })
            .collect()
    };

    // Get parent start time for relative offsets.
    let parent_start = resolve_parent_span(store, options.parent.as_deref())
        .map(|s| *s.start())
        .unwrap_or_default();

    let mut filtered = graph_children;

    sort_items(
        &mut filtered,
        options.sort,
        |g| *g.corrected_total_time(),
        |g| *g.total_time(),
        |g| g.nice_name(),
    );

    let (page_items, page, total_pages, total_count) = paginate(filtered, options.page);

    let parent_path = options.parent.as_deref();

    let spans = page_items
        .into_iter()
        .map(|graph| {
            let first = graph.first_span();
            let (cat, title) = graph.nice_name();
            let name = format_span_name(cat, title);
            let count = graph.count() as u64;
            let total_cpu = *graph.total_time();
            let total_corrected = *graph.corrected_total_time();
            let avg_cpu = total_cpu.checked_div(count).unwrap_or(0);
            let avg_corrected = total_corrected.checked_div(count).unwrap_or(0);

            let first_index = first.index;
            // Build full path ID: prepend parent path so this ID can be
            // passed directly as `parent` to drill into children.
            let leaf = format!("a{first_index}");
            let graph_id = match parent_path {
                Some(p) => format!("{p}-{leaf}"),
                None => leaf,
            };

            // start/end of the first/example span relative to parent.
            let span_start = *first.start();
            let span_end = *first.end();
            let rel_start = (span_start as i64) - (parent_start as i64);
            let rel_end = (span_end as i64) - (parent_start as i64);

            SpanInfo {
                id: graph_id,
                name,
                cpu_duration: *first.total_time(),
                corrected_duration: *first.corrected_total_time(),
                start_relative_to_parent: rel_start,
                end_relative_to_parent: rel_end,
                args: first
                    .args()
                    .map(|(k, v)| (k.to_string(), v.to_string()))
                    .collect(),
                is_aggregated: count > 1,
                count: Some(count),
                total_cpu_duration: Some(total_cpu),
                avg_cpu_duration: Some(avg_cpu),
                total_corrected_duration: Some(total_corrected),
                avg_corrected_duration: Some(avg_corrected),
                first_span_id: Some(first_index.to_string()),
            }
        })
        .collect();

    QueryResult {
        spans,
        page,
        total_pages,
        total_count,
    }
}

/// Raw (non-aggregated) mode: list individual child spans.
fn query_spans_raw(store: &store::Store, options: &QueryOptions) -> QueryResult {
    let parent_span = resolve_parent_span(store, options.parent.as_deref());
    let parent_start = parent_span.as_ref().map(|s| *s.start()).unwrap_or_default();

    let raw_children: Vec<SpanRef<'_>> = if let Some(ref parent) = parent_span {
        parent.children().collect()
    } else {
        store.root_spans().collect()
    };

    // Apply search filter using the span's search index.
    let mut filtered: Vec<_> = if let Some(ref query) = options.search {
        if let Some(ref parent) = parent_span {
            parent.search(query).collect()
        } else {
            store.root_span().search(query).collect()
        }
    } else {
        raw_children
    };

    sort_items(
        &mut filtered,
        options.sort,
        |s| *s.corrected_total_time(),
        |s| *s.total_time(),
        |s| s.nice_name(),
    );

    let (page_items, page, total_pages, total_count) = paginate(filtered, options.page);
    let spans = page_items
        .into_iter()
        .map(|span| span_ref_to_info(&span, parent_start))
        .collect();

    QueryResult {
        spans,
        page,
        total_pages,
        total_count,
    }
}

/// Convert a raw `SpanRef` to a `SpanInfo` with timings relative to `parent_start`.
fn span_ref_to_info(span: &SpanRef<'_>, parent_start: u64) -> SpanInfo {
    let (cat, title) = span.nice_name();
    let name = format_span_name(cat, title);
    let span_start = *span.start();
    let span_end = *span.end();
    let rel_start = (span_start as i64) - (parent_start as i64);
    let rel_end = (span_end as i64) - (parent_start as i64);

    SpanInfo {
        id: span.index.to_string(),
        name,
        cpu_duration: *span.total_time(),
        corrected_duration: *span.corrected_total_time(),
        start_relative_to_parent: rel_start,
        end_relative_to_parent: rel_end,
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
    }
}

/// Resolve a span by its MCP ID string.
///
/// For raw span IDs (e.g. `"123"`) or the last segment of a path
/// (e.g. `"a2119-a2120"` → span at index 2120), returns the `SpanRef`.
fn resolve_span_by_id<'a>(store: &'a store::Store, id: &str) -> Option<SpanRef<'a>> {
    // For path-style IDs, take the last segment.
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
