use indexmap::IndexMap;
use turbo_tasks::Vc;

use crate::{
    project::{Instrumentation, Middleware},
    route::{Endpoint, Route},
};

#[turbo_tasks::value(shared)]
pub struct Entrypoints {
    pub routes: IndexMap<String, Route>,
    pub middleware: Option<Middleware>,
    pub instrumentation: Option<Instrumentation>,
    pub pages_document_endpoint: Vc<Box<dyn Endpoint>>,
    pub pages_app_endpoint: Vc<Box<dyn Endpoint>>,
    pub pages_error_endpoint: Vc<Box<dyn Endpoint>>,
}
