//! A flat profile: every span below a parent, grouped by name across the whole
//! subtree, wherever in the tree each one sits.

use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;

use crate::{
    DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Parent, format_span_name, name_matches, paginate,
    span_ref::SpanRef, store_container::StoreContainer, wait_for_data,
};

/// How flat profile entries are sorted. Every mode sorts descending.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ProfileSort {
    /// `corrected_self_duration`.
    #[default]
    SelfTime,
    /// `corrected_total_duration`.
    TotalTime,
    /// `self_allocations`.
    SelfAllocations,
    /// `self_persistent_allocations`.
    SelfPersistentAllocations,
    /// `count`.
    Count,
}

pub struct FlatProfileOptions {
    /// Span ID whose subtree to profile, as produced by `SpanInfo::id`. `None`
    /// profiles the whole trace. For an aggregated group, every member's
    /// subtree is included.
    pub parent: Option<String>,
    /// Keep only entries whose name matches, with the same matching as
    /// `QueryOptions::search`.
    pub search: Option<String>,
    pub sort: ProfileSort,
    /// 1-based page number.
    pub page: usize,
    /// Entries per page. Clamped to `MAX_PAGE_SIZE`; `None` uses
    /// `DEFAULT_PAGE_SIZE`.
    pub page_size: Option<usize>,
}

/// All spans with one name. Durations are in internal ticks (100 ticks = 1 µs).
pub struct ProfileEntry {
    /// The span's group name, without its `name` arg, so e.g. every module's
    /// analysis lands in one entry.
    pub name: String,
    /// Number of spans with this name.
    pub count: u64,
    /// Summed self time (excluding children).
    pub self_duration: u64,
    /// Summed concurrency-corrected self time. These sum to the subtree's
    /// wall-clock-like total, so they are the figures to rank by.
    pub corrected_self_duration: u64,
    /// Summed total time (including children), counting only the outermost
    /// span where spans with this name nest, so recursion isn't counted twice.
    pub total_duration: u64,
    /// Like `total_duration`, concurrency-corrected.
    pub corrected_total_duration: u64,
    /// Summed `self_allocations` of the spans.
    pub self_allocations: u64,
    /// Summed `self_deallocations` of the spans.
    pub self_deallocations: u64,
    /// Summed `self_persistent_allocations` of the spans.
    pub self_persistent_allocations: u64,
    /// Summed `self_allocation_count` of the spans.
    pub self_allocation_count: u64,
    /// Raw span ID of the span with the largest corrected total time. Usable
    /// as a `parent`.
    pub example_span_id: String,
    /// Corrected total time of the example span.
    pub example_corrected_duration: u64,
}

pub struct FlatProfileResult {
    pub entries: Vec<ProfileEntry>,
    pub page: usize,
    pub total_pages: usize,
    /// Number of entries (distinct names) across all pages.
    pub total_count: usize,
    /// Number of spans in the profiled subtree.
    pub span_count: u64,
    /// Corrected self time of the whole subtree, the denominator for shares of
    /// `corrected_self_duration`.
    pub total_corrected_self_duration: u64,
    /// Self allocations of the whole subtree.
    pub total_self_allocations: u64,
}

#[derive(Default)]
struct Accumulator<'a> {
    count: u64,
    self_duration: u64,
    corrected_self_duration: u64,
    total_duration: u64,
    corrected_total_duration: u64,
    self_allocations: u64,
    self_deallocations: u64,
    self_persistent_allocations: u64,
    self_allocation_count: u64,
    example: Option<(u64, SpanRef<'a>)>,
}

enum Step<'a> {
    Enter(SpanRef<'a>),
    /// Leaves the span with this group name.
    Exit((&'a RcStr, &'a RcStr)),
}

pub fn flat_profile(store: &StoreContainer, options: FlatProfileOptions) -> FlatProfileResult {
    wait_for_data(store);

    let store_guard = store.read();
    let store_ref = &*store_guard;
    let page_size = options
        .page_size
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .clamp(1, MAX_PAGE_SIZE);

    let members = Parent::resolve(store_ref, options.parent.as_deref())
        .map(|parent| parent.members())
        .unwrap_or_default();

    let mut groups: FxHashMap<(&RcStr, &RcStr), Accumulator<'_>> = FxHashMap::default();
    // How many spans with each name are on the current path, to count only the
    // outermost one of nested same-named spans towards the totals.
    let mut on_path: FxHashMap<(&RcStr, &RcStr), u32> = FxHashMap::default();
    let mut stack: Vec<Step<'_>> = members
        .iter()
        .flat_map(|span| span.children())
        .map(Step::Enter)
        .collect();
    let mut span_count = 0;

    while let Some(step) = stack.pop() {
        let span = match step {
            Step::Enter(span) => span,
            Step::Exit(name) => {
                *on_path.get_mut(&name).expect("entered before") -= 1;
                continue;
            }
        };
        span_count += 1;
        let name = span.group_name();
        let group = groups.entry(name).or_default();
        let corrected_total = *span.corrected_total_time();
        group.count += 1;
        group.self_duration += *span.self_time();
        group.corrected_self_duration += *span.corrected_self_time();
        group.self_allocations += span.self_allocations();
        group.self_deallocations += span.self_deallocations();
        group.self_persistent_allocations += span.self_persistent_allocations();
        group.self_allocation_count += span.self_allocation_count();
        let depth = on_path.entry(name).or_default();
        if *depth == 0 {
            group.total_duration += *span.total_time();
            group.corrected_total_duration += corrected_total;
        }
        *depth += 1;
        if group
            .example
            .is_none_or(|(duration, _)| corrected_total > duration)
        {
            group.example = Some((corrected_total, span));
        }

        stack.push(Step::Exit(name));
        stack.extend(span.children().map(Step::Enter));
    }

    let total_corrected_self_duration = groups.values().map(|g| g.corrected_self_duration).sum();
    let total_self_allocations = groups.values().map(|g| g.self_allocations).sum();

    let mut entries: Vec<ProfileEntry> = groups
        .into_iter()
        .filter(|((cat, title), _)| {
            options
                .search
                .as_deref()
                .is_none_or(|query| name_matches(cat, title, query))
        })
        .map(|((cat, title), group)| {
            let (example_corrected_duration, example) = group.example.expect("at least one span");
            ProfileEntry {
                name: format_span_name(cat, title),
                count: group.count,
                self_duration: group.self_duration,
                corrected_self_duration: group.corrected_self_duration,
                total_duration: group.total_duration,
                corrected_total_duration: group.corrected_total_duration,
                self_allocations: group.self_allocations,
                self_deallocations: group.self_deallocations,
                self_persistent_allocations: group.self_persistent_allocations,
                self_allocation_count: group.self_allocation_count,
                example_span_id: example.index.to_string(),
                example_corrected_duration,
            }
        })
        .collect();

    let key = |entry: &ProfileEntry| match options.sort {
        ProfileSort::SelfTime => entry.corrected_self_duration,
        ProfileSort::TotalTime => entry.corrected_total_duration,
        ProfileSort::SelfAllocations => entry.self_allocations,
        ProfileSort::SelfPersistentAllocations => entry.self_persistent_allocations,
        ProfileSort::Count => entry.count,
    };
    // Ties broken by name so pages are stable across calls.
    entries.sort_by(|a, b| key(b).cmp(&key(a)).then_with(|| a.name.cmp(&b.name)));

    let (entries, page, total_pages, total_count) = paginate(entries, options.page, page_size);
    FlatProfileResult {
        entries,
        page,
        total_pages,
        total_count,
        span_count,
        total_corrected_self_duration,
        total_self_allocations,
    }
}
