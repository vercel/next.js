use crate as turbo_tasks;

#[turbo_tasks::value(transparent)]
pub struct String(std::string::String);

#[turbo_tasks::value(transparent)]
pub struct Bool(bool);
