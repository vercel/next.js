#![feature(async_closure)]
#![feature(min_specialization)]

mod app_render;
mod app_source;
mod embed_js;
pub mod env;
mod fallback;
pub mod next_client;
mod next_client_component;
mod next_import_map;
pub mod next_server;
mod nodejs;
mod path_regex;
pub mod react_refresh;
mod runtime;
mod server_rendered_source;
pub mod source_map;
mod util;
mod web_entry_source;

pub use app_source::create_app_source;
pub use server_rendered_source::create_server_rendered_source;
pub use web_entry_source::create_web_entry_source;

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_dev_server::register();
    turbopack::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
