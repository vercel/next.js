#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub mod transform;

pub fn register() {
    turbo_tasks::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
