#![feature(min_specialization)]
#![feature(option_get_or_insert_default)]

pub mod asset;
pub mod chunk;
pub mod code_builder;
pub mod context;
pub mod environment;
pub mod issue;
pub mod reference;
pub mod resolve;
pub mod source_asset;
mod source_pos;
pub mod target;
mod utils;
pub mod version;
pub mod wrapper_asset;

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
