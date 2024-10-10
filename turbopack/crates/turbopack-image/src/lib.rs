#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub mod process;

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
