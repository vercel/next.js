#![feature(min_specialization)]
#![feature(type_alias_impl_trait)]
#![feature(assert_matches)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![feature(impl_trait_in_assoc_type)]
#![feature(iter_intersperse)]
#![feature(map_try_insert)]
#![feature(hash_set_entry)]

pub mod asset;
pub mod changed;
pub mod chunk;
pub mod code_builder;
pub mod compile_time_info;
pub mod condition;
pub mod context;
pub mod data_uri_source;
pub mod debug_id;
pub mod diagnostics;
pub mod environment;
pub mod error;
pub mod file_source;
pub mod ident;
pub mod introspect;
pub mod issue;
pub mod module;
pub mod module_graph;
pub mod node_addon_module;
pub mod output;
pub mod package_json;
pub mod proxied_asset;
pub mod raw_module;
pub mod raw_output;
pub mod rebase;
pub mod reference;
pub mod reference_type;
pub mod resolve;
pub mod server_fs;
pub mod source;
pub mod source_map;
pub mod source_pos;
pub mod source_transform;
pub mod target;
pub mod traced_asset;
mod utils;
pub mod version;
pub mod virtual_output;
pub mod virtual_source;

pub mod virtual_fs {
    pub use turbo_tasks_fs::VirtualFileSystem;
}

pub const PROJECT_FILESYSTEM_NAME: &str = "project";
pub const SOURCE_URL_PROTOCOL: &str = "turbopack:";

#[doc(hidden)]
pub mod __private {
    pub use turbo_tasks::FxIndexMap;
}
