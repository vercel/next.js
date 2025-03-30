#![feature(min_specialization)]
#![feature(round_char_boundary)]
#![feature(thread_id_value)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub mod exit;
pub mod filter_layer;
mod flavor;
pub mod raw_trace;
pub mod trace_writer;
pub mod tracing;
pub mod tracing_presets;
