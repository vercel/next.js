#![feature(async_closure)]
#![feature(min_specialization)]

pub mod env;
pub mod next_client;
mod nodejs;
pub mod react_refresh;
mod server_render;
mod server_rendered_source;
mod web_entry_source;

pub use server_rendered_source::create_server_rendered_source;
pub use web_entry_source::create_web_entry_source;

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_dev_server::register();
    turbopack::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
