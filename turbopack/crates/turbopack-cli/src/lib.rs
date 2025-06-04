#![feature(future_join)]
#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub mod arguments;
pub mod build;
pub(crate) mod contexts;
pub mod dev;
pub(crate) mod embed_js;
pub(crate) mod util;

pub fn register() {
    turbopack::register();
    turbopack_nodejs::register();
    turbopack_browser::register();
    turbopack_ecmascript_plugins::register();
    turbopack_resolve::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
