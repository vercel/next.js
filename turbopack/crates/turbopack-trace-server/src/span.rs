use std::{
    num::NonZeroUsize,
    sync::{Arc, OnceLock},
};

use rustc_hash::FxHashMap;

use crate::timestamp::Timestamp;

pub type SpanIndex = NonZeroUsize;

pub struct Span {
    // These values won't change after creation:
    pub parent: Option<SpanIndex>,
    pub depth: u32,
    pub start: Timestamp,
    pub category: String,
    pub name: String,
    pub args: Vec<(String, String)>,

    // This might change during writing:
    pub events: Vec<SpanEvent>,
    pub is_complete: bool,

    // These values are computed automatically:
    pub self_allocations: u64,
    pub self_allocation_count: u64,
    pub self_deallocations: u64,
    pub self_deallocation_count: u64,

    // These values are computed when accessed (and maybe deleted during writing):
    pub max_depth: OnceLock<u32>,
    pub total_allocations: OnceLock<u64>,
    pub total_deallocations: OnceLock<u64>,
    pub total_persistent_allocations: OnceLock<u64>,
    pub total_span_count: OnceLock<u64>,
    pub total_allocation_count: OnceLock<u64>,

    // More nested fields, but memory lazily allocated
    pub time_data: OnceLock<Box<SpanTimeData>>,
    pub extra: OnceLock<Box<SpanExtra>>,
    pub names: OnceLock<Box<SpanNames>>,
}

#[derive(Default)]
pub struct SpanTimeData {
    // These values won't change after creation:
    pub ignore_self_time: bool,

    // This might change during writing:
    pub self_end: Timestamp,

    // These values are computed automatically:
    pub self_time: Timestamp,

    // These values are computed when accessed (and maybe deleted during writing):
    pub end: OnceLock<Timestamp>,
    pub total_time: OnceLock<Timestamp>,
    pub corrected_self_time: OnceLock<Timestamp>,
    pub corrected_total_time: OnceLock<Timestamp>,
}

#[derive(Default)]
pub struct SpanExtra {
    pub graph: OnceLock<Vec<SpanGraphEvent>>,
    pub bottom_up: OnceLock<Vec<Arc<SpanBottomUp>>>,
    pub search_index: OnceLock<FxHashMap<String, Vec<SpanIndex>>>,
}

#[derive(Default)]
pub struct SpanNames {
    // These values are computed when accessed (and maybe deleted during writing):
    pub nice_name: OnceLock<(String, String)>,
    pub group_name: OnceLock<String>,
}

impl Span {
    pub fn time_data(&self) -> &SpanTimeData {
        self.time_data.get_or_init(|| {
            Box::new(SpanTimeData {
                self_end: self.start,
                ignore_self_time: &self.name == "thread",
                ..Default::default()
            })
        })
    }

    pub fn time_data_mut(&mut self) -> &mut SpanTimeData {
        self.time_data();
        self.time_data.get_mut().unwrap()
    }

    pub fn extra(&self) -> &SpanExtra {
        self.extra.get_or_init(Default::default)
    }

    pub fn names(&self) -> &SpanNames {
        self.names.get_or_init(Default::default)
    }
}

#[derive(Copy, Clone, PartialEq, Eq)]
pub enum SpanEvent {
    SelfTime { start: Timestamp, end: Timestamp },
    Child { index: SpanIndex },
}

#[derive(Clone)]
pub enum SpanGraphEvent {
    // TODO(sokra) use events instead of children for visualizing span graphs
    #[allow(dead_code)]
    SelfTime {
        duration: Timestamp,
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
    pub self_time: OnceLock<Timestamp>,
    pub self_allocations: OnceLock<u64>,
    pub self_deallocations: OnceLock<u64>,
    pub self_persistent_allocations: OnceLock<u64>,
    pub self_allocation_count: OnceLock<u64>,
    pub total_time: OnceLock<Timestamp>,
    pub total_allocations: OnceLock<u64>,
    pub total_deallocations: OnceLock<u64>,
    pub total_persistent_allocations: OnceLock<u64>,
    pub total_allocation_count: OnceLock<u64>,
    pub total_span_count: OnceLock<u64>,
    pub corrected_self_time: OnceLock<Timestamp>,
    pub corrected_total_time: OnceLock<Timestamp>,
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
    pub self_time: OnceLock<Timestamp>,
    pub corrected_self_time: OnceLock<Timestamp>,
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
