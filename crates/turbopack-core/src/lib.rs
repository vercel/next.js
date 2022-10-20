#![feature(min_specialization)]
#![feature(option_get_or_insert_default)]
#![feature(type_alias_impl_trait)]
#![feature(assert_matches)]
#![feature(lint_reasons)]

pub mod asset;
pub mod chunk;
pub mod code_builder;
pub mod context;
pub mod environment;
pub mod introspect;
pub mod issue;
pub mod reference;
pub mod resolve;
pub mod source_asset;
pub mod source_pos;
pub mod target;
mod utils;
pub mod version;
pub mod virtual_asset;

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
