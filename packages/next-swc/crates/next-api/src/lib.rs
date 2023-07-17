#![feature(future_join)]
#![feature(arbitrary_self_types)]
#![feature(async_fn_in_trait)]

mod app;
mod entrypoints;
mod pages;
pub mod project;
pub mod route;

pub fn register() {
    next_core::register();
    turbopack_binding::turbopack::build::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
