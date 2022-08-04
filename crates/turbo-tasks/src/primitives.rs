use std::collections::HashSet;

use crate::{self as turbo_tasks, RawVc};

#[turbo_tasks::value(transparent)]
pub struct String(std::string::String);

#[turbo_tasks::value(transparent)]
pub struct Strings(Vec<std::string::String>);

#[turbo_tasks::value(transparent)]
pub struct Bool(bool);

#[turbo_tasks::value(transparent)]
pub struct RawVcSet(HashSet<RawVc>);
