use crate::module::Module;

/// A module that can collect other modules during the collect phase.
#[turbo_tasks::value_trait]
pub trait CollectingModule: Module {}
