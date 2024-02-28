#![feature(async_closure)]
#![feature(min_specialization)]
#![feature(round_char_boundary)]
#![feature(thread_id_value)]
#![feature(arbitrary_self_types)]

pub mod issue;
pub mod runtime_entry;
pub mod source_context;

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_resolve::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
