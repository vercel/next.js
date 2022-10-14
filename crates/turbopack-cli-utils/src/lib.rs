#![feature(async_closure)]
#![feature(min_specialization)]
#![feature(round_char_boundary)]

pub mod issue;

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
