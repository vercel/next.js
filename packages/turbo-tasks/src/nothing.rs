use crate::{self as turbo_tasks};

/// Just an empty type.
/// [NothingRef] can be used as return value instead of `()`
/// to have a concrete reference that can be awaited.
#[turbo_tasks::value]
#[derive(PartialEq, Eq)]
pub struct Nothing;

#[turbo_tasks::value_impl]
impl NothingRef {
    pub fn new() -> Self {
        NothingRef::slot(Nothing)
    }
}
