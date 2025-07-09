use std::{
    borrow::Cow,
    fmt::{Display, Formatter},
};

use serde::{Deserialize, Serialize};

/// A raw trace line.
#[derive(Debug, Serialize, Deserialize)]
pub enum TraceRow<'a> {
    /// A new span has been started, but not entered yet.
    Start {
        /// Timestamp
        ts: u64,
        /// Unique id for this span.
        id: u64,
        /// Id of the parent span, if any.
        parent: Option<u64>,
        /// The name of the span.
        #[serde(borrow)]
        name: Cow<'a, str>,
        /// The target of the span.
        #[serde(borrow)]
        target: Cow<'a, str>,
        /// A list of key-value pairs for all attributes of the span.
        #[serde(borrow)]
        values: Vec<(Cow<'a, str>, TraceValue<'a>)>,
    },
    /// A span has ended. The id might be reused in future.
    End {
        /// Timestamp
        ts: u64,
        /// Unique id for this span. Must be created by a `Start` event before.
        id: u64,
    },
    /// A span has been entered. This means it is spending CPU time now.
    Enter {
        /// Timestamp
        ts: u64,
        /// Unique id for this span. Must be created by a `Start` event before.
        id: u64,
        /// The thread id of the thread that entered the span.
        thread_id: u64,
    },
    /// A span has been exited. This means it is not spending CPU time anymore.
    Exit {
        /// Timestamp
        ts: u64,
        /// Unique id for this span. Must be entered by a `Enter` event before.
        id: u64,
        /// The thread id of the thread that exits the span.
        thread_id: u64,
    },
    /// A event has happened for some span.
    Event {
        /// Timestamp
        ts: u64,
        /// Id of the parent span, if any.
        parent: Option<u64>,
        /// A list of key-value pairs for all attributes of the event.
        #[serde(borrow)]
        values: Vec<(Cow<'a, str>, TraceValue<'a>)>,
    },
    /// Additional fields for a span
    Record {
        /// Unique id for this span. Must be created by a `Start` event before.
        id: u64,
        /// A list of key-value pairs for all attributes of the span.
        #[serde(borrow)]
        values: Vec<(Cow<'a, str>, TraceValue<'a>)>,
    },
    /// Data about (de)allocations that happened
    Allocation {
        /// Timestamp
        ts: u64,
        /// The thread id of the thread where allocations happened.
        thread_id: u64,
        /// Allocations
        allocations: u64,
        /// Allocation count
        allocation_count: u64,
        /// Deallocations
        deallocations: u64,
        /// Deallocation count
        deallocation_count: u64,
    },
    /// Data about (de)allocations per thread counters. Actual allocations can
    /// be computed from the difference.
    AllocationCounters {
        /// Timestamp
        ts: u64,
        /// The thread id of the thread where allocations happened.
        thread_id: u64,
        /// Allocations
        allocations: u64,
        /// Allocation count
        allocation_count: u64,
        /// Deallocations
        deallocations: u64,
        /// Deallocation count
        deallocation_count: u64,
    },
}

#[derive(Debug, Serialize, Deserialize)]
pub enum TraceValue<'a> {
    String(#[serde(borrow)] Cow<'a, str>),
    Bool(bool),
    UInt(u64),
    Int(i64),
    Float(f64),
}

impl Display for TraceValue<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            TraceValue::String(s) => write!(f, "{s}"),
            TraceValue::Bool(b) => write!(f, "{b}"),
            TraceValue::UInt(u) => write!(f, "{u}"),
            TraceValue::Int(i) => write!(f, "{i}"),
            TraceValue::Float(fl) => write!(f, "{fl}"),
        }
    }
}

impl TraceValue<'_> {
    pub fn as_u64(&self) -> Option<u64> {
        match self {
            TraceValue::UInt(u) => Some(*u),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            TraceValue::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn into_static(self) -> TraceValue<'static> {
        match self {
            TraceValue::String(s) => TraceValue::String(s.into_owned().into()),
            TraceValue::Bool(b) => TraceValue::Bool(b),
            TraceValue::UInt(u) => TraceValue::UInt(u),
            TraceValue::Int(i) => TraceValue::Int(i),
            TraceValue::Float(fl) => TraceValue::Float(fl),
        }
    }
}
