#![feature(async_closure)]
#![feature(min_specialization)]
#![feature(round_char_boundary)]
#![feature(thread_id_value)]
#![feature(arbitrary_self_types)]

pub mod exit;
mod flavor;
pub mod raw_trace;
pub mod trace_writer;
pub mod tracing;
pub mod tracing_presets;
