use swc_core::{
    common::Span,
    ecma::{
        ast::*,
        visit::{Visit, VisitWith, noop_visit_type},
    },
};

/// Checks if the program contains a top level await, if it does it will returns
/// the span of the first await.
pub(crate) fn has_top_level_await(m: &Program) -> Option<Span> {
    let mut visitor = TopLevelAwaitVisitor::default();

    m.visit_with(&mut visitor);

    visitor.top_level_await_span
}

#[derive(Default)]
struct TopLevelAwaitVisitor {
    top_level_await_span: Option<Span>,
}

macro_rules! noop {
    ($name:ident, $T:path) => {
        fn $name(&mut self, _: &$T) {}
    };
}

impl Visit for TopLevelAwaitVisitor {
    fn visit_await_expr(&mut self, n: &AwaitExpr) {
        if self.top_level_await_span.is_none() {
            self.top_level_await_span = Some(n.span);
        }
    }

    // prevent non top level items from visiting their children
    noop_visit_type!();
    noop!(visit_arrow_expr, ArrowExpr);
    noop!(visit_constructor, Constructor);
    noop!(visit_function, Function);

    fn visit_getter_prop(&mut self, n: &GetterProp) {
        n.key.visit_children_with(self);
    }

    fn visit_setter_prop(&mut self, n: &SetterProp) {
        n.key.visit_children_with(self);
    }

    fn visit_class_prop(&mut self, n: &ClassProp) {
        n.key.visit_children_with(self);
        n.decorators.visit_children_with(self);
        if n.is_static {
            n.value.visit_children_with(self);
        }
    }

    fn visit_private_prop(&mut self, n: &PrivateProp) {
        n.decorators.visit_children_with(self);
        if n.is_static {
            n.value.visit_children_with(self);
        }
    }

    fn visit_auto_accessor(&mut self, n: &AutoAccessor) {
        n.key.visit_children_with(self);
        n.decorators.visit_children_with(self);
        if n.is_static {
            n.value.visit_children_with(self);
        }
    }
}
