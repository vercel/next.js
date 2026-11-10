//! A frozen (immutable) ordered map and set implementation.

pub mod map;
pub mod set;

pub use crate::{map::FrozenMap, set::FrozenSet};
