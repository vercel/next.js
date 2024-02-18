#![feature(type_alias_impl_trait)]
#![feature(arbitrary_self_types)]

pub mod build_options;

pub use self::build_options::BuildOptions;

pub fn register() {
    turbopack_binding::turbo::tasks::register();
    turbopack_binding::turbo::tasks_fs::register();
    turbopack_binding::turbopack::turbopack::register();
    turbopack_binding::turbopack::core::register();
    turbopack_binding::turbopack::node::register();
    turbopack_binding::turbopack::dev::register();
    turbopack_binding::turbopack::build::register();
    next_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
