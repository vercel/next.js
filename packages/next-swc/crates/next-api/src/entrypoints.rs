use indexmap::IndexMap;

use crate::{project::Middleware, route::Route};

#[turbo_tasks::value(shared)]
pub struct Entrypoints {
    pub routes: IndexMap<String, Route>,
    pub middleware: Option<Middleware>,
}
