#![feature(async_closure)]
#![feature(min_specialization)]
#![feature(round_char_boundary)]
#![feature(thread_id_value)]
#![feature(arbitrary_self_types)]
#![feature(async_fn_in_trait)]

pub mod exit;
pub mod issue;
pub mod raw_trace;
pub mod runtime_entry;
pub mod source_context;
pub mod trace_writer;
pub mod tracing;
pub mod tracing_presets;

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
