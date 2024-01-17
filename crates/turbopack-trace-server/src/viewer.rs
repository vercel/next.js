use std::{
    cmp::{max, Reverse},
    collections::{HashMap, HashSet},
};

use either::Either;
use itertools::Itertools;
use serde::{Deserialize, Serialize};

use crate::{
    server::ViewRect,
    span_bottom_up_ref::SpanBottomUpRef,
    span_graph_ref::{SpanGraphEventRef, SpanGraphRef},
    span_ref::SpanRef,
    store::{SpanId, Store},
    u64_empty_string,
};

const EXTRA_WIDTH_PERCENTAGE: u64 = 50;
const EXTRA_HEIGHT: u64 = 5;

#[derive(Default)]
pub struct Viewer {
    span_options: HashMap<SpanId, SpanOptions>,
}

#[derive(Clone, Copy, Debug)]
pub enum ValueMode {
    Duration,
    Allocations,
    Deallocations,
    PersistentAllocations,
    AllocationCount,
}

impl ValueMode {
    fn value_from_span(&self, span: &SpanRef<'_>) -> u64 {
        match self {
            ValueMode::Duration => span.corrected_total_time(),
            ValueMode::Allocations => span.total_allocations(),
            ValueMode::Deallocations => span.total_deallocations(),
            ValueMode::PersistentAllocations => span.total_persistent_allocations(),
            ValueMode::AllocationCount => span.total_allocation_count(),
        }
    }

    fn value_from_graph(&self, graph: &SpanGraphRef<'_>) -> u64 {
        match self {
            ValueMode::Duration => graph.corrected_total_time(),
            ValueMode::Allocations => graph.total_allocations(),
            ValueMode::Deallocations => graph.total_deallocations(),
            ValueMode::PersistentAllocations => graph.total_persistent_allocations(),
            ValueMode::AllocationCount => graph.total_allocation_count(),
        }
    }

    fn value_from_graph_event(&self, event: &SpanGraphEventRef<'_>) -> u64 {
        match self {
            ValueMode::Duration => event.corrected_total_time(),
            ValueMode::Allocations => event.total_allocations(),
            ValueMode::Deallocations => event.total_deallocations(),
            ValueMode::PersistentAllocations => event.total_persistent_allocations(),
            ValueMode::AllocationCount => event.total_allocation_count(),
        }
    }

    fn value_from_bottom_up(&self, bottom_up: &SpanBottomUpRef<'_>) -> u64 {
        match self {
            ValueMode::Duration => bottom_up.corrected_self_time(),
            ValueMode::Allocations => bottom_up.self_allocations(),
            ValueMode::Deallocations => bottom_up.self_deallocations(),
            ValueMode::PersistentAllocations => bottom_up.self_persistent_allocations(),
            ValueMode::AllocationCount => bottom_up.self_allocation_count(),
        }
    }

    fn value_from_bottom_up_span(&self, bottom_up_span: &SpanRef<'_>) -> u64 {
        match self {
            ValueMode::Duration => bottom_up_span.corrected_self_time(),
            ValueMode::Allocations => bottom_up_span.self_allocations(),
            ValueMode::Deallocations => bottom_up_span.self_deallocations(),
            ValueMode::PersistentAllocations => bottom_up_span.self_persistent_allocations(),
            ValueMode::AllocationCount => bottom_up_span.self_allocation_count(),
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub enum ViewMode {
    RawSpans { sorted: bool },
    Aggregated { sorted: bool },
    BottomUp { sorted: bool },
    AggregatedBottomUp { sorted: bool },
}

impl ViewMode {
    fn as_spans(self) -> Self {
        match self {
            ViewMode::RawSpans { sorted } => ViewMode::RawSpans { sorted },
            ViewMode::Aggregated { sorted } => ViewMode::RawSpans { sorted },
            ViewMode::BottomUp { sorted } => ViewMode::BottomUp { sorted },
            ViewMode::AggregatedBottomUp { sorted } => ViewMode::BottomUp { sorted },
        }
    }

    fn as_bottom_up(self) -> Self {
        match self {
            ViewMode::RawSpans { sorted } => ViewMode::BottomUp { sorted },
            ViewMode::Aggregated { sorted } => ViewMode::AggregatedBottomUp { sorted },
            ViewMode::BottomUp { sorted } => ViewMode::BottomUp { sorted },
            ViewMode::AggregatedBottomUp { sorted } => ViewMode::AggregatedBottomUp { sorted },
        }
    }

    fn aggregate_children(&self) -> bool {
        match self {
            ViewMode::RawSpans { .. } => false,
            ViewMode::Aggregated { .. } => true,
            ViewMode::BottomUp { .. } => false,
            ViewMode::AggregatedBottomUp { .. } => true,
        }
    }

    fn bottom_up(&self) -> bool {
        match self {
            ViewMode::RawSpans { .. } => false,
            ViewMode::Aggregated { .. } => false,
            ViewMode::BottomUp { .. } => true,
            ViewMode::AggregatedBottomUp { .. } => true,
        }
    }

    fn sort_children(&self) -> bool {
        match self {
            ViewMode::RawSpans { sorted } => *sorted,
            ViewMode::Aggregated { sorted } => *sorted,
            ViewMode::BottomUp { sorted } => *sorted,
            ViewMode::AggregatedBottomUp { sorted } => *sorted,
        }
    }
}

#[derive(Default)]
struct SpanOptions {
    view_mode: Option<(ViewMode, bool)>,
}

pub struct Update {
    pub lines: Vec<ViewLineUpdate>,
    pub max: u64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ViewLineUpdate {
    y: u64,
    spans: Vec<ViewSpan>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ViewSpan {
    #[serde(with = "u64_empty_string")]
    id: u64,
    #[serde(rename = "x")]
    start: u64,
    #[serde(rename = "w")]
    width: u64,
    #[serde(rename = "cat")]
    category: String,
    #[serde(rename = "t")]
    text: String,
    #[serde(rename = "c")]
    count: u64,
    #[serde(rename = "k")]
    kind: u8,
}

#[derive(Debug)]
enum QueueItem<'a> {
    Span(SpanRef<'a>),
    SpanGraph(SpanGraphRef<'a>),
    SpanBottomUp(SpanBottomUpRef<'a>),
    SpanBottomUpSpan(SpanRef<'a>),
}

impl<'a> QueueItem<'a> {
    fn value(&self, value_mode: ValueMode) -> u64 {
        match self {
            QueueItem::Span(span) => value_mode.value_from_span(span),
            QueueItem::SpanGraph(span_graph) => value_mode.value_from_graph(span_graph),
            QueueItem::SpanBottomUp(span_bottom_up) => {
                value_mode.value_from_bottom_up(span_bottom_up)
            }
            QueueItem::SpanBottomUpSpan(span) => value_mode.value_from_bottom_up_span(span),
        }
    }

    fn max_depth(&self) -> u32 {
        match self {
            QueueItem::Span(span) => span.max_depth(),
            QueueItem::SpanGraph(span_graph) => span_graph.max_depth(),
            QueueItem::SpanBottomUp(span_bottom_up) => span_bottom_up.max_depth(),
            QueueItem::SpanBottomUpSpan(span) => span.max_depth(),
        }
    }
}

#[derive(Debug)]
struct QueueItemWithState<'a> {
    item: QueueItem<'a>,
    line_index: usize,
    start: u64,
    placeholder: bool,
    view_mode: ViewMode,
    filtered: bool,
}

struct ChildItem<'a> {
    item: QueueItemWithState<'a>,
    depth: u32,
    pixel_range: (u64, u64),
}

impl Viewer {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_view_mode(&mut self, id: SpanId, view_mode: Option<(ViewMode, bool)>) {
        self.span_options.entry(id).or_default().view_mode = view_mode;
    }

    pub fn compute_update(&mut self, store: &Store, view_rect: &ViewRect) -> Update {
        let mut highlighted_spans: HashSet<SpanId> = HashSet::new();
        let search_mode = !view_rect.query.is_empty();

        let default_view_mode = view_rect.view_mode.as_str();
        let (default_view_mode, default_sorted) = default_view_mode
            .strip_suffix("-sorted")
            .map_or((default_view_mode, false), |s| (s, true));
        let default_view_mode = match default_view_mode {
            "aggregated" => ViewMode::Aggregated {
                sorted: default_sorted,
            },
            "raw-spans" => ViewMode::RawSpans {
                sorted: default_sorted,
            },
            "bottom-up" => ViewMode::BottomUp {
                sorted: default_sorted,
            },
            "aggregated-bottom-up" => ViewMode::AggregatedBottomUp {
                sorted: default_sorted,
            },
            _ => ViewMode::Aggregated {
                sorted: default_sorted,
            },
        };

        let value_mode = match view_rect.value_mode.as_str() {
            "duration" => ValueMode::Duration,
            "allocations" => ValueMode::Allocations,
            "deallocations" => ValueMode::Deallocations,
            "persistent-deallocations" => ValueMode::PersistentAllocations,
            "allocation-count" => ValueMode::AllocationCount,
            _ => ValueMode::Duration,
        };

        let mut queue = Vec::new();

        let mut root_spans = store.root_spans().collect::<Vec<_>>();
        root_spans.sort_by_key(|span| span.start());
        let mut children = Vec::new();
        let mut current = 0;
        for span in root_spans {
            if matches!(value_mode, ValueMode::Duration) {
                // Move current to start if needed.
                current = max(current, span.start());
            }
            if add_child_item(
                &mut children,
                &mut current,
                view_rect,
                0,
                if view_rect.query.is_empty() {
                    default_view_mode
                } else {
                    default_view_mode.as_spans()
                },
                value_mode,
                QueueItem::Span(span),
                false,
            ) && search_mode
            {
                let mut has_results = false;
                for mut result in span.search(&view_rect.query) {
                    has_results = true;
                    highlighted_spans.insert(result.id());
                    while let Some(parent) = result.parent() {
                        result = parent;
                        if !highlighted_spans.insert(result.id()) {
                            break;
                        }
                    }
                }
                if !has_results {
                    children.last_mut().unwrap().item.filtered = true;
                }
            }
        }
        enqueue_children(children, &mut queue);

        let mut lines: Vec<Vec<LineEntry<'_>>> = vec![];

        while let Some(QueueItemWithState {
            item: span,
            line_index,
            start,
            placeholder,
            view_mode,
            filtered,
        }) = queue.pop()
        {
            let line = get_line(&mut lines, line_index);
            let width = span.value(value_mode);

            // compute children
            let mut children = Vec::new();
            let mut current = start;
            match &span {
                QueueItem::Span(span) => {
                    let (selected_view_mode, inherit) = self
                        .span_options
                        .get(&span.id())
                        .and_then(|o| o.view_mode)
                        .unwrap_or((view_mode, false));
                    let selected_view_mode = if span.is_complete() {
                        selected_view_mode
                    } else {
                        selected_view_mode.as_spans()
                    };

                    let view_mode = if inherit {
                        selected_view_mode
                    } else {
                        view_mode
                    };
                    if selected_view_mode.bottom_up() {
                        let bottom_up = span.bottom_up();
                        if selected_view_mode.aggregate_children() {
                            let bottom_up = if selected_view_mode.sort_children() {
                                Either::Left(bottom_up.sorted_by_cached_key(|child| {
                                    Reverse(value_mode.value_from_bottom_up(child))
                                }))
                            } else {
                                Either::Right(bottom_up)
                            };
                            for child in bottom_up {
                                // TODO search
                                add_child_item(
                                    &mut children,
                                    &mut current,
                                    view_rect,
                                    line_index + 1,
                                    view_mode,
                                    value_mode,
                                    QueueItem::SpanBottomUp(child),
                                    false,
                                );
                            }
                        } else {
                            let bottom_up = bottom_up
                                .flat_map(|bottom_up| bottom_up.spans().collect::<Vec<_>>());
                            let bottom_up = if selected_view_mode.sort_children() {
                                Either::Left(bottom_up.sorted_by_cached_key(|child| {
                                    Reverse(value_mode.value_from_bottom_up_span(child))
                                }))
                            } else {
                                Either::Right(bottom_up)
                            };
                            for child in bottom_up {
                                let filtered =
                                    search_mode && !highlighted_spans.contains(&child.id());
                                add_child_item(
                                    &mut children,
                                    &mut current,
                                    view_rect,
                                    line_index + 1,
                                    view_mode,
                                    value_mode,
                                    QueueItem::SpanBottomUpSpan(child),
                                    filtered,
                                );
                            }
                        }
                    } else if !selected_view_mode.aggregate_children() {
                        let spans = if selected_view_mode.sort_children() {
                            Either::Left(span.children().sorted_by_cached_key(|child| {
                                Reverse(value_mode.value_from_span(child))
                            }))
                        } else {
                            Either::Right(span.children())
                        };
                        for child in spans {
                            let filtered = search_mode && !highlighted_spans.contains(&child.id());
                            add_child_item(
                                &mut children,
                                &mut current,
                                view_rect,
                                line_index + 1,
                                view_mode,
                                value_mode,
                                QueueItem::Span(child),
                                filtered,
                            );
                        }
                    } else {
                        let events = if selected_view_mode.sort_children() {
                            Either::Left(span.graph().sorted_by_cached_key(|child| {
                                Reverse(value_mode.value_from_graph_event(child))
                            }))
                        } else {
                            Either::Right(span.graph())
                        };
                        for event in events {
                            match event {
                                SpanGraphEventRef::SelfTime { duration: _ } => {}
                                SpanGraphEventRef::Child { graph } => {
                                    add_child_item(
                                        &mut children,
                                        &mut current,
                                        view_rect,
                                        line_index + 1,
                                        view_mode,
                                        value_mode,
                                        QueueItem::SpanGraph(graph),
                                        false,
                                    );
                                }
                            }
                        }
                    }
                }
                QueueItem::SpanGraph(span_graph) => {
                    let (selected_view_mode, inherit) = self
                        .span_options
                        .get(&span_graph.id())
                        .and_then(|o| o.view_mode)
                        .unwrap_or((view_mode, false));

                    let view_mode = if inherit {
                        selected_view_mode
                    } else {
                        view_mode
                    };
                    if selected_view_mode.bottom_up() {
                        let bottom_up = span_graph.bottom_up();
                        if selected_view_mode.aggregate_children() {
                            let bottom_up = if selected_view_mode.sort_children() {
                                Either::Left(bottom_up.sorted_by_cached_key(|child| {
                                    Reverse(value_mode.value_from_bottom_up(child))
                                }))
                            } else {
                                Either::Right(bottom_up)
                            };
                            for child in bottom_up {
                                // TODO search
                                add_child_item(
                                    &mut children,
                                    &mut current,
                                    view_rect,
                                    line_index + 1,
                                    view_mode,
                                    value_mode,
                                    QueueItem::SpanBottomUp(child),
                                    false,
                                );
                            }
                        } else {
                            let bottom_up = bottom_up
                                .flat_map(|bottom_up| bottom_up.spans().collect::<Vec<_>>());
                            let bottom_up = if selected_view_mode.sort_children() {
                                Either::Left(bottom_up.sorted_by_cached_key(|child| {
                                    Reverse(value_mode.value_from_bottom_up_span(child))
                                }))
                            } else {
                                Either::Right(bottom_up)
                            };
                            for child in bottom_up {
                                let filtered =
                                    search_mode && !highlighted_spans.contains(&child.id());
                                add_child_item(
                                    &mut children,
                                    &mut current,
                                    view_rect,
                                    line_index + 1,
                                    view_mode,
                                    value_mode,
                                    QueueItem::SpanBottomUpSpan(child),
                                    filtered,
                                );
                            }
                        }
                    } else if !selected_view_mode.aggregate_children() && span_graph.count() > 1 {
                        let spans = if selected_view_mode.sort_children() {
                            Either::Left(span_graph.root_spans().sorted_by_cached_key(|child| {
                                Reverse(value_mode.value_from_span(child))
                            }))
                        } else {
                            Either::Right(span_graph.root_spans())
                        };
                        for child in spans {
                            let filtered = search_mode && !highlighted_spans.contains(&child.id());
                            add_child_item(
                                &mut children,
                                &mut current,
                                view_rect,
                                line_index + 1,
                                view_mode,
                                value_mode,
                                QueueItem::Span(child),
                                filtered,
                            );
                        }
                    } else {
                        let events = if selected_view_mode.sort_children() {
                            Either::Left(span_graph.events().sorted_by_cached_key(|child| {
                                Reverse(value_mode.value_from_graph_event(child))
                            }))
                        } else {
                            Either::Right(span_graph.events())
                        };
                        for child in events {
                            if let SpanGraphEventRef::Child { graph } = child {
                                add_child_item(
                                    &mut children,
                                    &mut current,
                                    view_rect,
                                    line_index + 1,
                                    view_mode,
                                    value_mode,
                                    QueueItem::SpanGraph(graph),
                                    false,
                                );
                            }
                        }
                    }
                }
                QueueItem::SpanBottomUp(bottom_up) => {
                    let view_mode = self
                        .span_options
                        .get(&bottom_up.id())
                        .and_then(|o| o.view_mode)
                        .map(|(v, _)| v.as_bottom_up())
                        .unwrap_or(view_mode);

                    if view_mode.aggregate_children() {
                        let bottom_up = if view_mode.sort_children() {
                            Either::Left(bottom_up.children().sorted_by_cached_key(|child| {
                                Reverse(value_mode.value_from_bottom_up(child))
                            }))
                        } else {
                            Either::Right(bottom_up.children())
                        };
                        for child in bottom_up {
                            // TODO search
                            add_child_item(
                                &mut children,
                                &mut current,
                                view_rect,
                                line_index + 1,
                                view_mode,
                                value_mode,
                                QueueItem::SpanBottomUp(child),
                                false,
                            );
                        }
                    } else {
                        let spans = if view_mode.sort_children() {
                            Either::Left(bottom_up.spans().sorted_by_cached_key(|child| {
                                Reverse(value_mode.value_from_bottom_up_span(child))
                            }))
                        } else {
                            Either::Right(bottom_up.spans())
                        };
                        for child in spans {
                            let filtered = search_mode && !highlighted_spans.contains(&child.id());
                            add_child_item(
                                &mut children,
                                &mut current,
                                view_rect,
                                line_index + 1,
                                view_mode,
                                value_mode,
                                QueueItem::SpanBottomUpSpan(child),
                                filtered,
                            );
                        }
                    }
                }
                QueueItem::SpanBottomUpSpan(_) => {
                    // no children
                }
            }

            // When span size is smaller than a pixel, we only show the deepest child.
            if placeholder {
                let child = children
                    .into_iter()
                    .max_by_key(|ChildItem { item, depth, .. }| (!item.filtered, *depth));
                if let Some(ChildItem {
                    item: mut entry, ..
                }) = child
                {
                    entry.placeholder = true;
                    queue.push(entry);
                }

                // add span to line
                line.push(LineEntry {
                    start,
                    width,
                    ty: LineEntryType::Placeholder(filtered),
                });
            } else {
                // add children to queue
                enqueue_children(children, &mut queue);

                // add span to line
                line.push(LineEntry {
                    start,
                    width,
                    ty: match span {
                        QueueItem::Span(span) => LineEntryType::Span(span, filtered),
                        QueueItem::SpanGraph(span_graph) => {
                            LineEntryType::SpanGraph(span_graph, filtered)
                        }
                        QueueItem::SpanBottomUp(bottom_up) => {
                            LineEntryType::SpanBottomUp(bottom_up, filtered)
                        }
                        QueueItem::SpanBottomUpSpan(bottom_up_span) => {
                            LineEntryType::SpanBottomUpSpan(bottom_up_span, filtered)
                        }
                    },
                });
            }
        }

        let lines = lines
            .into_iter()
            .enumerate()
            .map(|(y, line)| ViewLineUpdate {
                y: y as u64,
                spans: line
                    .into_iter()
                    .map(|entry| match entry.ty {
                        LineEntryType::Placeholder(filtered) => ViewSpan {
                            id: 0,
                            start: entry.start,
                            width: entry.width,
                            category: String::new(),
                            text: String::new(),
                            count: 1,
                            kind: if filtered { 11 } else { 1 },
                        },
                        LineEntryType::Span(span, filtered) => {
                            let (category, text) = span.nice_name();
                            ViewSpan {
                                id: span.id().get() as u64,
                                start: entry.start,
                                width: entry.width,
                                category: category.to_string(),
                                text: text.to_string(),
                                count: 1,
                                kind: if filtered { 10 } else { 0 },
                            }
                        }
                        LineEntryType::SpanGraph(graph, filtered) => {
                            let (category, text) = graph.nice_name();
                            ViewSpan {
                                id: graph.id().get() as u64,
                                start: entry.start,
                                width: entry.width,
                                category: category.to_string(),
                                text: text.to_string(),
                                count: graph.count() as u64,
                                kind: if filtered { 10 } else { 0 },
                            }
                        }
                        LineEntryType::SpanBottomUp(bottom_up, filtered) => {
                            let (category, text) = bottom_up.nice_name();
                            ViewSpan {
                                id: bottom_up.id().get() as u64,
                                start: entry.start,
                                width: entry.width,
                                category: category.to_string(),
                                text: text.to_string(),
                                count: bottom_up.count() as u64,
                                kind: if filtered { 12 } else { 2 },
                            }
                        }
                        LineEntryType::SpanBottomUpSpan(bottom_up_span, filtered) => {
                            let (category, text) = bottom_up_span.nice_name();
                            ViewSpan {
                                id: bottom_up_span.id().get() as u64,
                                start: entry.start,
                                width: entry.width,
                                category: category.to_string(),
                                text: text.to_string(),
                                count: 1,
                                kind: if filtered { 12 } else { 2 },
                            }
                        }
                    })
                    .collect(),
            })
            .collect();
        Update {
            lines,
            max: current,
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn add_child_item<'a>(
    children: &mut Vec<ChildItem<'a>>,
    current: &mut u64,
    view_rect: &ViewRect,
    line_index: usize,
    view_mode: ViewMode,
    value_mode: ValueMode,
    child: QueueItem<'a>,
    filtered: bool,
) -> bool {
    let child_width = child.value(value_mode);
    let max_depth = child.max_depth();
    let pixel1 = *current * view_rect.horizontal_pixels / view_rect.width;
    let pixel2 = ((*current + child_width) * view_rect.horizontal_pixels + view_rect.width - 1)
        / view_rect.width;
    let start = *current;
    *current += child_width;

    // filter by view rect (vertical)
    if line_index > (view_rect.y + view_rect.height + EXTRA_HEIGHT) as usize {
        return false;
    }

    if line_index > 0 {
        // filter by view rect (horizontal)
        if start > view_rect.x + view_rect.width * (100 + EXTRA_WIDTH_PERCENTAGE) / 100 {
            return false;
        }
        if *current
            < view_rect
                .x
                .saturating_sub(view_rect.width * EXTRA_WIDTH_PERCENTAGE / 100)
        {
            return false;
        }
    }

    children.push(ChildItem {
        item: QueueItemWithState {
            item: child,
            line_index,
            start,
            placeholder: false,
            view_mode,
            filtered,
        },
        depth: max_depth,
        pixel_range: (pixel1, pixel2),
    });

    true
}

const MIN_VISIBLE_PIXEL_SIZE: u64 = 3;

fn enqueue_children<'a>(mut children: Vec<ChildItem<'a>>, queue: &mut Vec<QueueItemWithState<'a>>) {
    children.reverse();
    let mut last_pixel = u64::MAX;
    let mut last_max_depth = 0;
    for ChildItem {
        item: mut entry,
        depth: max_depth,
        pixel_range: (pixel1, pixel2),
    } in children
    {
        if last_pixel <= pixel1 + MIN_VISIBLE_PIXEL_SIZE {
            if last_max_depth < max_depth {
                queue.pop();
                entry.placeholder = true;
            } else {
                if let Some(entry) = queue.last_mut() {
                    entry.placeholder = true;
                }
                continue;
            }
        };
        queue.push(entry);
        last_max_depth = max_depth;
        last_pixel = pixel2;
    }
}

fn get_line<T: Default>(lines: &mut Vec<T>, i: usize) -> &mut T {
    if i >= lines.len() {
        lines.resize_with(i + 1, || Default::default());
    }
    &mut lines[i]
}

struct LineEntry<'a> {
    start: u64,
    width: u64,
    ty: LineEntryType<'a>,
}

enum LineEntryType<'a> {
    Placeholder(bool),
    Span(SpanRef<'a>, bool),
    SpanGraph(SpanGraphRef<'a>, bool),
    SpanBottomUp(SpanBottomUpRef<'a>, bool),
    SpanBottomUpSpan(SpanRef<'a>, bool),
}
