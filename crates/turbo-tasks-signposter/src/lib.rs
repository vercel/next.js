#[cfg(all(target_os = "macos", feature = "global"))]
mod global;
#[cfg(target_os = "macos")]
mod log;

#[cfg(all(target_os = "macos", feature = "global"))]
pub use global::*;
#[cfg(target_os = "macos")]
pub use log::*;
