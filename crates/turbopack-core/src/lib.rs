#![feature(min_specialization)]
#![feature(option_get_or_insert_default)]

pub mod asset;
pub mod chunk;
pub mod context;
pub mod lazy;
pub mod reference;
pub mod resolve;
pub mod source_asset;
mod utils;

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
