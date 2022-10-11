use crate::{self as turbo_tasks};

/// Just an empty type.
/// [NothingVc] can be used as return value instead of `()`
/// to have a concrete reference that can be awaited.
#[turbo_tasks::value]
pub struct Nothing;

#[turbo_tasks::value_impl]
impl NothingVc {
    #[turbo_tasks::function]
    pub fn new() -> Self {
        NothingVc::cell(Nothing)
    }
}
