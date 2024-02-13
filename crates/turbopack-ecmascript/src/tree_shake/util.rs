use std::hash::BuildHasherDefault;

use indexmap::IndexSet;
use rustc_hash::FxHasher;
use swc_core::ecma::{
    ast::{
        AssignTarget, BlockStmtOrExpr, Constructor, Expr, Function, Id, Ident, MemberProp, Pat,
        PropName,
    },
    visit::{noop_visit_type, visit_obj_and_computed, Visit, VisitWith},
};

#[derive(Debug, Default, Clone, Copy)]
enum Mode {
    Read,
    #[default]
    Write,
}

/// A visitor which collects variables which are read or written.
#[derive(Default)]
pub(crate) struct IdentUsageCollector {
    vars: Vars,
    ignore_nested: bool,
    mode: Mode,
}

impl IdentUsageCollector {
    fn with_mode(&mut self, mode: Mode, f: impl FnOnce(&mut Self)) {
        let old = self.mode;
        self.mode = mode;
        f(self);
        self.mode = old;
    }
}

impl Visit for IdentUsageCollector {
    fn visit_assign_target(&mut self, n: &AssignTarget) {
        self.with_mode(Mode::Write, |this| {
            n.visit_children_with(this);
        })
    }

    fn visit_block_stmt_or_expr(&mut self, n: &BlockStmtOrExpr) {
        if self.ignore_nested {
            return;
        }

        n.visit_children_with(self);
    }

    fn visit_constructor(&mut self, n: &Constructor) {
        if self.ignore_nested {
            return;
        }

        n.visit_children_with(self);
    }

    fn visit_expr(&mut self, e: &Expr) {
        self.with_mode(Mode::Read, |this| {
            e.visit_children_with(this);
        })
    }

    fn visit_function(&mut self, n: &Function) {
        if self.ignore_nested {
            return;
        }

        n.visit_children_with(self);
    }

    fn visit_ident(&mut self, n: &Ident) {
        match self.mode {
            Mode::Read => {
                self.vars.read.insert(n.to_id());
            }
            Mode::Write => {
                self.vars.write.insert(n.to_id());
            }
        }
    }

    fn visit_member_prop(&mut self, n: &MemberProp) {
        if let MemberProp::Computed(..) = n {
            n.visit_children_with(self);
        }
    }

    fn visit_pat(&mut self, p: &Pat) {
        self.with_mode(Mode::Write, |this| {
            p.visit_children_with(this);
        })
    }

    fn visit_prop_name(&mut self, n: &PropName) {
        if let PropName::Computed(..) = n {
            n.visit_children_with(self);
        }
    }

    noop_visit_type!();

    visit_obj_and_computed!();
}

/// A visitor which collects variables which are read or written, but not at the
/// evaluation time.
#[derive(Default)]
pub(crate) struct CapturedIdCollector {
    vars: Vars,
    is_nested: bool,
    mode: Mode,
}

impl CapturedIdCollector {
    fn with_nested(&mut self, f: impl FnOnce(&mut Self)) {
        let old = self.is_nested;
        self.is_nested = true;
        f(self);
        self.is_nested = old;
    }

    fn with_mode(&mut self, mode: Mode, f: impl FnOnce(&mut Self)) {
        let old = self.mode;
        self.mode = mode;
        f(self);
        self.mode = old;
    }
}

impl Visit for CapturedIdCollector {
    fn visit_assign_target(&mut self, n: &AssignTarget) {
        self.with_mode(Mode::Write, |this| {
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

    fn visit_expr(&mut self, e: &Expr) {
        self.with_mode(Mode::Read, |this| {
            e.visit_children_with(this);
        })
    }

    fn visit_function(&mut self, n: &Function) {
        self.with_nested(|this| {
            n.visit_children_with(this);
        })
    }

    fn visit_ident(&mut self, n: &Ident) {
        if !self.is_nested {
            return;
        }

        match self.mode {
            Mode::Read => {
                self.vars.read.insert(n.to_id());
            }
            Mode::Write => {
                self.vars.write.insert(n.to_id());
            }
        }
    }

    fn visit_pat(&mut self, p: &Pat) {
        self.with_mode(Mode::Write, |this| {
            p.visit_children_with(this);
        })
    }

    fn visit_prop_name(&mut self, n: &PropName) {
        if let PropName::Computed(..) = n {
            n.visit_children_with(self);
        }
    }

    noop_visit_type!();

    visit_obj_and_computed!();
}

/// The list of variables which are read or written.
#[derive(Debug, Default)]
pub(crate) struct Vars {
    /// Variables which are read.
    pub read: IndexSet<Id, BuildHasherDefault<FxHasher>>,
    /// Variables which are written.
    pub write: IndexSet<Id, BuildHasherDefault<FxHasher>>,
}

/// Returns `(read, write)`
pub(crate) fn ids_captured_by<N>(n: &N) -> Vars
where
    N: VisitWith<CapturedIdCollector>,
{
    let mut v = CapturedIdCollector {
        is_nested: false,
        ..Default::default()
    };
    n.visit_with(&mut v);
    v.vars
}

/// Returns `(read, write)`
pub(crate) fn ids_used_by<N>(n: &N) -> Vars
where
    N: VisitWith<IdentUsageCollector>,
{
    let mut v = IdentUsageCollector {
        ignore_nested: false,
        ..Default::default()
    };
    n.visit_with(&mut v);
    v.vars
}

/// Returns `(read, write)`
pub(crate) fn ids_used_by_ignoring_nested<N>(n: &N) -> Vars
where
    N: VisitWith<IdentUsageCollector>,
{
    let mut v = IdentUsageCollector {
        ignore_nested: true,
        ..Default::default()
    };
    n.visit_with(&mut v);
    v.vars
}
