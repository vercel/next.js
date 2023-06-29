use swc_core::ecma::{
    ast::*,
    visit::{noop_visit_type, Visit, VisitWith},
};

pub(crate) fn has_top_level_await(m: &Program) -> bool {
    let mut visitor = TopLevelAwaitVisitor::default();

    m.visit_with(&mut visitor);

    visitor.has_top_level_await
}

#[derive(Default)]
struct TopLevelAwaitVisitor {
    has_top_level_await: bool,
}

macro_rules! noop {
    ($name:ident, $T:path) => {
        fn $name(&mut self, _: &$T) {}
    };
}

impl Visit for TopLevelAwaitVisitor {
    fn visit_await_expr(&mut self, _: &AwaitExpr) {
        self.has_top_level_await = true;
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
