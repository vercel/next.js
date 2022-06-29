use swc_common::Span;
use swc_ecmascript::visit::{VisitMut, noop_visit_mut_type};

pub struct ApplyVisitors {
    /// `VisitMut` should be shallow. In other words, it should not visit
    /// children of the node.
    pub visitors: Vec<(Span, Box<dyn VisitMut + Send + Sync>)>,
}

impl VisitMut for ApplyVisitors {
    noop_visit_mut_type!();
}
