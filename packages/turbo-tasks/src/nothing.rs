use crate::{self as turbo_tasks};

#[turbo_tasks::value]
pub struct Nothing;

impl NothingRef {
    pub fn new() -> Self {
        NothingRef::slot(Nothing)
    }
}
