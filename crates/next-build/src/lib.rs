#![feature(type_alias_impl_trait)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub mod build_options;

pub use self::build_options::BuildOptions;

pub fn register() {
    turbopack_core::register();
    next_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
