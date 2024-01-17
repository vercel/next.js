use std::{
    collections::HashMap,
    num::NonZeroUsize,
    sync::{Arc, OnceLock},
};

pub type SpanIndex = NonZeroUsize;

pub struct Span {
    // These values won't change after creation:
    pub index: SpanIndex,
    pub parent: Option<SpanIndex>,
    pub start: u64,
    pub ignore_self_time: bool,
    pub category: String,
    pub name: String,
    pub args: Vec<(String, String)>,

    // This might change during writing:
    pub events: Vec<SpanEvent>,
    pub is_complete: bool,

    // These values are computed automatically:
    pub self_end: u64,
    pub self_time: u64,
    pub self_allocations: u64,
    pub self_allocation_count: u64,
    pub self_deallocations: u64,
    pub self_deallocation_count: u64,

    // These values are computed when accessed (and maybe deleted during writing):
    pub end: OnceLock<u64>,
    pub nice_name: OnceLock<(String, String)>,
    pub group_name: OnceLock<String>,
    pub max_depth: OnceLock<u32>,
    pub total_time: OnceLock<u64>,
    pub total_allocations: OnceLock<u64>,
    pub total_deallocations: OnceLock<u64>,
    pub total_persistent_allocations: OnceLock<u64>,
    pub total_allocation_count: OnceLock<u64>,
    pub corrected_self_time: OnceLock<u64>,
    pub corrected_total_time: OnceLock<u64>,
    pub graph: OnceLock<Vec<SpanGraphEvent>>,
    pub bottom_up: OnceLock<Vec<Arc<SpanBottomUp>>>,
    pub search_index: OnceLock<HashMap<String, Vec<SpanIndex>>>,
}

#[derive(Copy, Clone)]
pub enum SpanEvent {
    SelfTime { start: u64, end: u64 },
    Child { id: SpanIndex },
}

#[derive(Clone)]
pub enum SpanGraphEvent {
    // TODO(sokra) use events instead of children for visualizing span graphs
    #[allow(dead_code)]
    SelfTime {
        duration: u64,
    },
    Child {
        child: Arc<SpanGraph>,
    },
}

pub struct SpanGraph {
    // These values won't change after creation:
    pub root_spans: Vec<SpanIndex>,
    pub recursive_spans: Vec<SpanIndex>,

    // These values are computed when accessed:
    pub max_depth: OnceLock<u32>,
    pub events: OnceLock<Vec<SpanGraphEvent>>,
    pub self_time: OnceLock<u64>,
    pub self_allocations: OnceLock<u64>,
    pub self_deallocations: OnceLock<u64>,
    pub self_persistent_allocations: OnceLock<u64>,
    pub self_allocation_count: OnceLock<u64>,
    pub total_time: OnceLock<u64>,
    pub total_allocations: OnceLock<u64>,
    pub total_deallocations: OnceLock<u64>,
    pub total_persistent_allocations: OnceLock<u64>,
    pub total_allocation_count: OnceLock<u64>,
    pub corrected_self_time: OnceLock<u64>,
    pub corrected_total_time: OnceLock<u64>,
    pub bottom_up: OnceLock<Vec<Arc<SpanBottomUp>>>,
}

pub struct SpanBottomUp {
    // These values won't change after creation:
    pub self_spans: Vec<SpanIndex>,
    pub children: Vec<Arc<SpanBottomUp>>,
    pub example_span: SpanIndex,

    // These values are computed when accessed:
    pub max_depth: OnceLock<u32>,
    pub events: OnceLock<Vec<SpanGraphEvent>>,
    pub self_time: OnceLock<u64>,
    pub corrected_self_time: OnceLock<u64>,
    pub self_allocations: OnceLock<u64>,
    pub self_deallocations: OnceLock<u64>,
    pub self_persistent_allocations: OnceLock<u64>,
    pub self_allocation_count: OnceLock<u64>,
}

impl SpanBottomUp {
    pub fn new(
        self_spans: Vec<SpanIndex>,
        example_span: SpanIndex,
        children: Vec<Arc<SpanBottomUp>>,
    ) -> Self {
        Self {
            self_spans,
            children,
            example_span,
            max_depth: OnceLock::new(),
            events: OnceLock::new(),
            self_time: OnceLock::new(),
            corrected_self_time: OnceLock::new(),
            self_allocations: OnceLock::new(),
            self_deallocations: OnceLock::new(),
            self_persistent_allocations: OnceLock::new(),
            self_allocation_count: OnceLock::new(),
        }
    }
}
