use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc};

use crate::{
    project::{Instrumentation, Middleware},
    route::{Endpoint, Route},
};

#[turbo_tasks::value(shared)]
pub struct Entrypoints {
    pub routes: FxIndexMap<RcStr, Route>,
    pub middleware: Option<Middleware>,
    pub instrumentation: Option<Instrumentation>,
    pub pages_document_endpoint: ResolvedVc<Box<dyn Endpoint>>,
    pub pages_app_endpoint: ResolvedVc<Box<dyn Endpoint>>,
    pub pages_error_endpoint: ResolvedVc<Box<dyn Endpoint>>,
}
