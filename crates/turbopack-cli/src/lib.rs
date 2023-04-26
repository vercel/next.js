#![feature(future_join)]
#![feature(min_specialization)]

pub mod arguments;
pub mod dev;
pub(crate) mod embed_js;

pub fn register() {
    turbopack::register();
    turbopack_dev::register();
    turbopack_ecmascript_plugins::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
