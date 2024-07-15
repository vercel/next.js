use std::hash::BuildHasherDefault;

use indexmap::IndexSet;
use rustc_hash::FxHasher;
use swc_core::{
    common::SyntaxContext,
    ecma::{
        ast::{
            AssignTarget, BlockStmtOrExpr, Constructor, ExportNamedSpecifier, ExportSpecifier,
            Expr, Function, Id, Ident, MemberExpr, MemberProp, NamedExport, Pat, PropName,
        },
        visit::{noop_visit_type, Visit, VisitWith},
    },
};

#[derive(Debug, Default, Clone, Copy)]
enum Mode {
    Read,
    #[default]
    Write,
}

#[derive(Default)]
struct Target {
    direct: bool,
    eventual: bool,
}

/// A visitor which collects variables which are read or written.
#[derive(Default)]
pub(crate) struct IdentUsageCollector {
    unresolved: SyntaxContext,
    top_level: SyntaxContext,
    vars: Vars,

    is_nested: bool,
    target: Target,
    /// None means both read and write
    mode: Option<Mode>,
}

impl IdentUsageCollector {
    fn with_nested(&mut self, f: impl FnOnce(&mut Self)) {
        if !self.target.eventual {
            return;
        }

        let old = self.is_nested;
        self.is_nested = true;
        f(self);
        self.is_nested = old;
    }
    fn with_mode(&mut self, mode: Option<Mode>, f: impl FnOnce(&mut Self)) {
        let old = self.mode;
        self.mode = mode;
        f(self);
        self.mode = old;
    }
}

impl Visit for IdentUsageCollector {
    fn visit_assign_target(&mut self, n: &AssignTarget) {
        self.with_mode(Some(Mode::Write), |this| {
            n.visit_children_with(this);
        })
    }

    fn visit_block_stmt_or_expr(&mut self, n: &BlockStmtOrExpr) {
        self.with_nested(|this| {
            n.visit_children_with(this);
        })
    }

    fn visit_constructor(&mut self, n: &Constructor) {
        self.with_nested(|this| {
            n.visit_children_with(this);
        })
    }

    fn visit_export_named_specifier(&mut self, n: &ExportNamedSpecifier) {
        n.orig.visit_with(self);
    }

    fn visit_export_specifier(&mut self, n: &ExportSpecifier) {
        self.with_mode(Some(Mode::Read), |this| {
            n.visit_children_with(this);
        })
    }

    fn visit_expr(&mut self, e: &Expr) {
        self.with_mode(Some(Mode::Read), |this| {
            e.visit_children_with(this);
        })
    }

    fn visit_function(&mut self, n: &Function) {
        self.with_nested(|this| {
            n.visit_children_with(this);
        })
    }

    fn visit_ident(&mut self, n: &Ident) {
        if !self.target.direct && !self.is_nested {
            return;
        }

        if n.span.ctxt == self.unresolved {
            self.vars.found_unresolved = true;
            return;
        }

        // We allow SyntaxContext::empty() because Some built-in files do not go into
        // resolver()
        if n.span.ctxt != self.unresolved
            && n.span.ctxt != self.top_level
            && n.span.ctxt != SyntaxContext::empty()
        {
            return;
        }

        match self.mode {
            Some(Mode::Read) => {
                self.vars.read.insert(n.to_id());
            }
            Some(Mode::Write) => {
                self.vars.write.insert(n.to_id());
            }
            None => {
                self.vars.read.insert(n.to_id());
                self.vars.write.insert(n.to_id());
            }
        }
    }

    fn visit_member_expr(&mut self, e: &MemberExpr) {
        self.with_mode(None, |this| {
            // Skip visit_expr
            e.obj.visit_children_with(this);
        });

        e.prop.visit_with(self);
    }

    fn visit_member_prop(&mut self, n: &MemberProp) {
        if let MemberProp::Computed(..) = n {
            self.with_mode(Some(Mode::Read), |v| {
                n.visit_children_with(v);
            })
        }
    }
    fn visit_named_export(&mut self, n: &NamedExport) {
        if n.src.is_some() {
            return;
        }

        n.visit_children_with(self);
    }

    fn visit_pat(&mut self, p: &Pat) {
        self.with_mode(Some(Mode::Write), |this| {
            p.visit_children_with(this);
        })
    }

    fn visit_prop_name(&mut self, n: &PropName) {
        if let PropName::Computed(..) = n {
            n.visit_children_with(self);
        }
    }

    noop_visit_type!();
}

/// The list of variables which are read or written.
#[derive(Debug, Default)]
pub(crate) struct Vars {
    /// Variables which are read.
    pub read: IndexSet<Id, BuildHasherDefault<FxHasher>>,
    /// Variables which are written.
    pub write: IndexSet<Id, BuildHasherDefault<FxHasher>>,

    pub found_unresolved: bool,
}

/// Returns `(read, write)`
///
/// Note: This functions accept `SyntaxContext` to filter out variables which
/// are not interesting. We only need to analyze top-level variables.
pub(crate) fn ids_captured_by<N>(n: &N, unresolved: SyntaxContext, top_level: SyntaxContext) -> Vars
where
    N: VisitWith<IdentUsageCollector>,
{
    let mut v = IdentUsageCollector {
        unresolved,
        top_level,
        target: Target {
            direct: false,
            eventual: true,
        },
        ..Default::default()
    };
    n.visit_with(&mut v);
    v.vars
}

/// Returns `(read, write)`
///
/// Note: This functions accept `SyntaxContext` to filter out variables which
/// are not interesting. We only need to analyze top-level variables.
pub(crate) fn ids_used_by<N>(n: &N, unresolved: SyntaxContext, top_level: SyntaxContext) -> Vars
where
    N: VisitWith<IdentUsageCollector>,
{
    let mut v = IdentUsageCollector {
        unresolved,
        top_level,
        target: Target {
            direct: true,
            eventual: true,
        },
        ..Default::default()
    };
    n.visit_with(&mut v);
    v.vars
}

/// Returns `(read, write)`
///
/// Note: This functions accept `SyntaxContext` to filter out variables which
/// are not interesting. We only need to analyze top-level variables.
pub(crate) fn ids_used_by_ignoring_nested<N>(
    n: &N,
    unresolved: SyntaxContext,
    top_level: SyntaxContext,
) -> Vars
where
    N: VisitWith<IdentUsageCollector>,
{
    let mut v = IdentUsageCollector {
        unresolved,
        top_level,
        target: Target {
            direct: true,
            eventual: false,
        },
        ..Default::default()
    };
    n.visit_with(&mut v);
    v.vars
}
