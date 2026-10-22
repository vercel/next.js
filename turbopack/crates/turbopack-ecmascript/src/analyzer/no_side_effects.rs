use std::collections::HashSet;

use swc_core::{
    common::{Spanned, comments::Comments},
    ecma::{
        ast::{
            Decl, DefaultDecl, ExportDecl, ExportDefaultDecl, FnDecl, FnExpr, Id, Pat, Program,
            VarDecl,
        },
        visit::{Visit, VisitWith, noop_visit_type},
    },
};

const NO_SIDE_EFFECTS_FLAG: &str = "NO_SIDE_EFFECTS";

/// Bindings declared with an SWC-compatible `NO_SIDE_EFFECTS` annotation.
#[derive(Default, Debug)]
pub(crate) struct NoSideEffectsInfo {
    bindings: HashSet<Id>,
    default_export: bool,
}

impl NoSideEffectsInfo {
    pub(crate) fn contains(&self, id: &Id) -> bool {
        self.bindings.contains(id)
    }

    pub(crate) fn default_export(&self) -> bool {
        self.default_export
    }
}

pub(crate) fn collect_no_side_effects(
    program: &Program,
    comments: Option<&dyn Comments>,
) -> NoSideEffectsInfo {
    let mut collector = NoSideEffectsCollector {
        comments,
        info: NoSideEffectsInfo::default(),
    };
    program.visit_with(&mut collector);
    collector.info
}

struct NoSideEffectsCollector<'a> {
    comments: Option<&'a dyn Comments>,
    info: NoSideEffectsInfo,
}

impl NoSideEffectsCollector<'_> {
    fn has_annotation(&self, span: swc_core::common::Span) -> bool {
        self.comments
            .is_some_and(|comments| comments.has_flag(span.lo, NO_SIDE_EFFECTS_FLAG))
    }
}

impl Visit for NoSideEffectsCollector<'_> {
    noop_visit_type!(fail);

    fn visit_export_decl(&mut self, export: &ExportDecl) {
        export.visit_children_with(self);

        if let Decl::Fn(function) = &export.decl
            && self.has_annotation(function.function.span)
        {
            self.info.bindings.insert(function.ident.to_id());
        }
    }

    fn visit_fn_decl(&mut self, function: &FnDecl) {
        function.visit_children_with(self);

        if self.has_annotation(function.function.span) {
            self.info.bindings.insert(function.ident.to_id());
        }
    }

    fn visit_fn_expr(&mut self, function: &FnExpr) {
        function.visit_children_with(self);

        if let Some(ident) = &function.ident
            && self.has_annotation(function.function.span)
        {
            self.info.bindings.insert(ident.to_id());
        }
    }

    fn visit_export_default_decl(&mut self, export: &ExportDefaultDecl) {
        export.visit_children_with(self);

        if let DefaultDecl::Fn(function) = &export.decl
            && self.has_annotation(function.function.span)
        {
            self.info.default_export = true;
        }
    }

    fn visit_var_decl(&mut self, declaration: &VarDecl) {
        declaration.visit_children_with(self);

        for declarator in &declaration.decls {
            if let Pat::Ident(binding) = &declarator.name
                && let Some(initializer) = &declarator.init
                && (self.has_annotation(declaration.span)
                    || self.has_annotation(declarator.span)
                    || self.has_annotation(initializer.span()))
            {
                self.info.bindings.insert(binding.id.to_id());
            }
        }
    }
}
