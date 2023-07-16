#![feature(future_join)]
#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(async_fn_in_trait)]

pub mod arguments;
pub mod dev;
pub(crate) mod embed_js;

pub fn register() {
    turbopack::register();
    turbopack_dev::register();
    turbopack_ecmascript_plugins::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
