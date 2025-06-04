#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub mod ecmascript;
pub mod node_native_binding;
pub mod resolve;
pub mod resolve_options_context;
pub mod typescript;

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
