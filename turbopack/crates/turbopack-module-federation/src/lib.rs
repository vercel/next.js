//! Framework-neutral Module Federation support for Turbopack.
//!
//! The browser runtime lands first. Later stack layers add Turbopack's generated container sources
//! and import resolution while keeping the runtime independently testable.
