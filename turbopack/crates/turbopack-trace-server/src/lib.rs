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
    reader::TraceReader, server::serve, span_graph_ref::SpanGraphEventRef, span_ref::SpanRef,
    store_container::StoreContainer,
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
    /// `None` means root level.
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
    /// Raw span ID for aggregated groups (the index of the first span).
    pub first_span_id: Option<String>,
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

/// Build a span ID by appending a leaf segment to the optional parent path.
fn build_span_id(parent: Option<&str>, leaf: &str) -> String {
    match parent {
        Some(p) => format!("{p}-{leaf}"),
        None => leaf.to_string(),
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

    let parent_start = parent_span.as_ref().map(|s| *s.start()).unwrap_or_default();

    if options.aggregated {
        // Collect aggregated children (SpanGraphRef) from either the resolved
        // parent span or the root.
        let graph_children: Vec<_> = if let Some(ref parent) = parent_span {
            // The parent might be an aggregated node: look up which graph node
            // the parent ID refers to, then iterate its children's graph events.
            // For simplicity, resolve via the parent span's graph().
            parent
                .graph()
                .filter_map(|event| match event {
                    SpanGraphEventRef::Child { graph } => Some(graph),
                    SpanGraphEventRef::SelfTime { .. } => None,
                })
                .collect()
        } else {
            // Root level: use root span's graph.
            store_ref
                .root_span()
                .graph()
                .filter_map(|event| match event {
                    SpanGraphEventRef::Child { graph } => Some(graph),
                    SpanGraphEventRef::SelfTime { .. } => None,
                })
                .collect()
        };

        // Apply search filter.
        let mut filtered: Vec<_> = if let Some(ref query) = options.search {
            graph_children
                .into_iter()
                .filter(|g| {
                    let (cat, title) = g.nice_name();
                    cat.contains(query.as_str()) || title.contains(query.as_str())
                })
                .collect()
        } else {
            graph_children
        };

        // Sort if requested.
        match options.sort {
            SortMode::Value => {
                filtered.sort_by(|a, b| {
                    b.corrected_total_time()
                        .cmp(&a.corrected_total_time())
                        .then_with(|| b.total_time().cmp(&a.total_time()))
                });
            }
            SortMode::Name => {
                filtered.sort_by(|a, b| {
                    let (a_cat, a_title) = a.nice_name();
                    let (b_cat, b_title) = b.nice_name();
                    a_title.cmp(b_title).then_with(|| a_cat.cmp(b_cat))
                });
            }
            SortMode::ExecutionOrder => {}
        }

        let (page_items, page, total_pages, total_count) = paginate(filtered, options.page);

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

                // Build the full path ID for this aggregated span.
                // The leaf segment is "a{first_span_index}"; prepend the parent
                // path (if any) with a dash so callers can pass the full string
                // back as `parent` to drill into children.
                let first_index = first.index;
                let graph_id = build_span_id(options.parent.as_deref(), &format!("a{first_index}"));

                // start/end of the first/example span relative to parent.
                let span_start = *first.start();
                let span_end = *first.end();
                let rel_start = (span_start as i64) - (parent_start as i64);
                let rel_end = (span_end as i64) - (parent_start as i64);

                let first_start_ticks = *first.start();
                let memory_samples: Vec<(i64, u64, u8)> = store_ref
                    .memory_samples_for_range_with_ts(first.start(), first.end())
                    .into_iter()
                    .map(|(ts, mem, pressure)| {
                        ((*ts as i64) - (first_start_ticks as i64), mem, pressure)
                    })
                    .collect();

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
                    memory_samples,
                }
            })
            .collect();

        QueryResult {
            spans,
            page,
            total_pages,
            total_count,
        }
    } else {
        // Raw spans mode.
        let raw_children: Vec<SpanRef<'_>> = if let Some(ref parent) = parent_span {
            parent.children().collect()
        } else {
            store_ref.root_spans().collect()
        };

        // Apply search filter using the span's search index.
        let mut filtered: Vec<_> = if let Some(ref query) = options.search {
            if let Some(ref parent) = parent_span {
                parent.search(query).collect()
            } else {
                store_ref.root_span().search(query).collect()
            }
        } else {
            raw_children
        };

        // Sort if requested.
        match options.sort {
            SortMode::Value => {
                filtered.sort_by(|a, b| {
                    b.corrected_total_time()
                        .cmp(&a.corrected_total_time())
                        .then_with(|| b.total_time().cmp(&a.total_time()))
                });
            }
            SortMode::Name => {
                filtered.sort_by(|a, b| {
                    let (a_cat, a_title) = a.nice_name();
                    let (b_cat, b_title) = b.nice_name();
                    a_title.cmp(b_title).then_with(|| a_cat.cmp(b_cat))
                });
            }
            SortMode::ExecutionOrder => {}
        }

        let (page_items, page, total_pages, total_count) = paginate(filtered, options.page);

        let spans = page_items
            .into_iter()
            .map(|span| {
                let (cat, title) = span.nice_name();
                let name = format_span_name(cat, title);
                let span_start = *span.start();
                let span_end = *span.end();
                let rel_start = (span_start as i64) - (parent_start as i64);
                let rel_end = (span_end as i64) - (parent_start as i64);

                let raw_span_start = span_start;
                let memory_samples: Vec<(i64, u64, u8)> = store_ref
                    .memory_samples_for_range_with_ts(span.start(), span.end())
                    .into_iter()
                    .map(|(ts, mem, pressure)| {
                        ((*ts as i64) - (raw_span_start as i64), mem, pressure)
                    })
                    .collect();

                SpanInfo {
                    id: build_span_id(options.parent.as_deref(), &span.index.to_string()),
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
                    memory_samples,
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
