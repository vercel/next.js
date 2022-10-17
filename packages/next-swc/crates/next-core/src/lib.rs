#![feature(async_closure)]
#![feature(min_specialization)]

mod embed_js;
pub mod env;
pub mod next_client;
mod next_import_map;
mod nodejs;
mod path_regex;
pub mod react_refresh;
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
