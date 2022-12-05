#![feature(async_closure)]
#![feature(min_specialization)]

mod app_render;
mod app_source;
mod embed_js;
pub mod env;
mod fallback;
pub mod manifest;
pub mod next_client;
mod next_client_component;
pub mod next_image;
mod next_import_map;
pub mod next_server;
pub mod react_refresh;
mod runtime;
mod server_rendered_source;
mod util;
mod web_entry_source;

pub use app_source::create_app_source;
pub use server_rendered_source::create_server_rendered_source;
pub use turbopack_node::source_map;
pub use web_entry_source::create_web_entry_source;

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_dev_server::register();
    turbopack::register();
    turbopack_node::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
