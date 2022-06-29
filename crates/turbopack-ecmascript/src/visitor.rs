use std::collections::HashMap;

use swc_common::{Span, Spanned};
use swc_ecmascript::{
    ast::*,
    visit::{noop_visit_mut_type, VisitMut, VisitMutWith},
};

pub type AstPath = Vec<Span>;

pub type BoxedVisitor = Box<dyn VisitMut + Send + Sync>;

pub struct ApplyVisitors<'a> {
    /// `VisitMut` should be shallow. In other words, it should not visit
    /// children of the node.
    pub visitors: HashMap<Span, &'a [(&'a AstPath, &'a BoxedVisitor)]>,

    index: usize,
}

impl<'a> ApplyVisitors<'a> {
    fn visit_if_required<N>(&mut self, n: &mut N)
    where
        N: Spanned + VisitMutWith<Box<dyn VisitMut + Send + Sync>> + VisitMutWith<Self>,
    {
        // TODO: check if we have a visitor for a child of this node

        n.visit_mut_children_with(self);

        // TODO: check if we have a visitor for this node
    }
}

macro_rules! method {
    ($name:ident,$T:ty) => {
        fn $name(&mut self, n: &mut $T) {
            self.visit_if_required(n);
        }
    };
}

impl VisitMut for ApplyVisitors<'_> {
    noop_visit_mut_type!();

    method!(visit_mut_prop, Prop);
    method!(visit_mut_expr, Expr);
    method!(visit_mut_pat, Pat);
    method!(visit_mut_stmt, Stmt);
    method!(visit_mut_module_decl, ModuleDecl);
}
