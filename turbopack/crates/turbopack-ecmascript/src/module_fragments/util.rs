use rustc_hash::FxHashSet;
use swc_core::{
    common::SyntaxContext,
    ecma::{
        ast::{
            ArrowExpr, AssignPatProp, AssignTarget, ClassDecl, ClassExpr, Constructor, DefaultDecl,
            ExportDefaultDecl, ExportNamedSpecifier, ExportSpecifier, Expr, FnDecl, FnExpr,
            Function, Id, Ident, ImportSpecifier, MemberExpr, MemberProp, NamedExport, Param, Pat,
            Prop, PropName, VarDeclarator, *,
        },
        visit::{Visit, VisitWith, noop_visit_type},
    },
};
use turbo_tasks::FxIndexSet;

use crate::TURBOPACK_HELPER;

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
pub(crate) struct IdentUsageCollector<'a> {
    unresolved: SyntaxContext,
    top_level: SyntaxContext,
    top_level_vars: &'a FxHashSet<Id>,

    vars: Vars,

    is_nested: bool,
    target: Target,
    /// None means both read and write
    mode: Option<Mode>,
}

impl IdentUsageCollector<'_> {
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

impl Visit for IdentUsageCollector<'_> {
    fn visit_assign_target(&mut self, n: &AssignTarget) {
        self.with_mode(Some(Mode::Write), |this| {
            n.visit_children_with(this);
        })
    }

    fn visit_class(&mut self, n: &Class) {
        n.super_class.visit_with(self);

        self.with_nested(|this| {
            n.decorators.visit_with(this);

            n.body.visit_with(this);
        });
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

        if n.ctxt == self.unresolved {
            self.vars.found_unresolved = true;
            return;
        }

        // We allow SyntaxContext::empty() because Some built-in files do not go into
        // resolver()
        if n.ctxt != self.unresolved
            && n.ctxt != self.top_level
            && n.ctxt != SyntaxContext::empty()
            && !self.top_level_vars.contains(&n.to_id())
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

    fn visit_prop(&mut self, n: &Prop) {
        match n {
            Prop::Shorthand(v) => {
                self.with_mode(None, |c| c.visit_ident(v));
            }

            _ => n.visit_children_with(self),
        }
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
    pub read: FxIndexSet<Id>,
    /// Variables which are written.
    pub write: FxIndexSet<Id>,

    pub found_unresolved: bool,
}

/// Returns `(read, write)`
///
/// Note: This functions accept `SyntaxContext` to filter out variables which
/// are not interesting. We only need to analyze top-level variables.
pub(crate) fn ids_captured_by<'a, N>(
    n: &N,
    unresolved: SyntaxContext,
    top_level: SyntaxContext,
    top_level_vars: &'a FxHashSet<Id>,
) -> Vars
where
    N: VisitWith<IdentUsageCollector<'a>>,
{
    let mut v = IdentUsageCollector {
        unresolved,
        top_level,
        top_level_vars,
        target: Target {
            direct: false,
            eventual: true,
        },
        vars: Vars::default(),
        is_nested: false,
        mode: None,
    };
    n.visit_with(&mut v);
    v.vars
}

/// Returns `(read, write)`
///
/// Note: This functions accept `SyntaxContext` to filter out variables which
/// are not interesting. We only need to analyze top-level variables.
pub(crate) fn ids_used_by<'a, N>(
    n: &N,
    unresolved: SyntaxContext,
    top_level: SyntaxContext,
    top_level_vars: &'a FxHashSet<Id>,
) -> Vars
where
    N: VisitWith<IdentUsageCollector<'a>>,
{
    let mut v = IdentUsageCollector {
        unresolved,
        top_level,
        top_level_vars,
        target: Target {
            direct: true,
            eventual: true,
        },
        vars: Vars::default(),
        is_nested: false,
        mode: None,
    };
    n.visit_with(&mut v);
    v.vars
}

/// Returns `(read, write)`
///
/// Note: This functions accept `SyntaxContext` to filter out variables which
/// are not interesting. We only need to analyze top-level variables.
pub(crate) fn ids_used_by_ignoring_nested<'a, N>(
    n: &N,
    unresolved: SyntaxContext,
    top_level: SyntaxContext,
    top_level_vars: &'a FxHashSet<Id>,
) -> Vars
where
    N: VisitWith<IdentUsageCollector<'a>>,
{
    let mut v = IdentUsageCollector {
        unresolved,
        top_level,
        top_level_vars,
        target: Target {
            direct: true,
            eventual: false,
        },
        vars: Vars::default(),
        is_nested: false,
        mode: None,
    };
    n.visit_with(&mut v);
    v.vars
}

pub struct TopLevelBindingCollector {
    bindings: FxHashSet<Id>,
    is_pat_decl: bool,
}

impl TopLevelBindingCollector {
    fn add(&mut self, i: &Ident) {
        self.bindings.insert(i.to_id());
    }
}

impl Visit for TopLevelBindingCollector {
    noop_visit_type!();

    fn visit_arrow_expr(&mut self, _: &ArrowExpr) {}

    fn visit_assign_pat_prop(&mut self, node: &AssignPatProp) {
        node.value.visit_with(self);

        if self.is_pat_decl {
            self.add(&node.key);
        }
    }

    fn visit_class_decl(&mut self, node: &ClassDecl) {
        self.add(&node.ident);
    }

    fn visit_expr(&mut self, _: &Expr) {}

    fn visit_export_default_decl(&mut self, e: &ExportDefaultDecl) {
        match &e.decl {
            DefaultDecl::Class(ClassExpr {
                ident: Some(ident), ..
            }) => {
                self.add(ident);
            }
            DefaultDecl::Fn(FnExpr {
                ident: Some(ident),
                function: f,
            }) if f.body.is_some() => {
                self.add(ident);
            }
            _ => {}
        }
    }

    fn visit_fn_decl(&mut self, node: &FnDecl) {
        self.add(&node.ident);
    }

    fn visit_import_specifier(&mut self, node: &ImportSpecifier) {
        match node {
            ImportSpecifier::Named(s) => self.add(&s.local),
            ImportSpecifier::Default(s) => {
                self.add(&s.local);
            }
            ImportSpecifier::Namespace(s) => {
                self.add(&s.local);
            }
        }
    }

    fn visit_param(&mut self, node: &Param) {
        let old = self.is_pat_decl;
        self.is_pat_decl = true;
        node.visit_children_with(self);
        self.is_pat_decl = old;
    }

    fn visit_pat(&mut self, node: &Pat) {
        node.visit_children_with(self);

        if self.is_pat_decl
            && let Pat::Ident(i) = node
        {
            self.add(&i.id)
        }
    }

    fn visit_var_declarator(&mut self, node: &VarDeclarator) {
        let old = self.is_pat_decl;
        self.is_pat_decl = true;
        node.name.visit_with(self);

        self.is_pat_decl = false;
        node.init.visit_with(self);
        self.is_pat_decl = old;
    }
}

/// Collects binding identifiers.
pub fn collect_top_level_decls<N>(n: &N) -> FxHashSet<Id>
where
    N: VisitWith<TopLevelBindingCollector>,
{
    let mut v = TopLevelBindingCollector {
        bindings: Default::default(),
        is_pat_decl: false,
    };
    n.visit_with(&mut v);
    v.bindings
}

pub fn should_skip_tree_shaking(m: &Program) -> bool {
    let Program::Module(m) = m else {
        return true;
    };

    // If there's no export, we will result in module evaluation containing all code, so just we
    // skip tree shaking.
    if m.body.iter().all(|item| {
        matches!(
            item,
            ModuleItem::ModuleDecl(ModuleDecl::Import(..)) | ModuleItem::Stmt(..)
        )
    }) {
        return true;
    }

    for item in m.body.iter() {
        match item {
            // Skip turbopack helpers.
            ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                with, specifiers, ..
            })) => {
                if let Some(with) = with.as_deref().and_then(|v| v.as_import_with()) {
                    for item in with.values.iter() {
                        if item.key.sym == *TURBOPACK_HELPER {
                            // Skip tree shaking if the import is from turbopack-helper
                            return true;
                        }
                    }
                }

                // TODO(PACK-3150): Tree shaking has a bug related to ModuleExportName::Str
                for s in specifiers.iter() {
                    if let ImportSpecifier::Named(is) = s
                        && matches!(is.imported, Some(ModuleExportName::Str(..)))
                    {
                        return true;
                    }
                }
            }

            // Tree shaking has a bug related to ModuleExportName::Str
            ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(NamedExport {
                src: Some(..),
                specifiers,
                ..
            })) => {
                for s in specifiers {
                    if let ExportSpecifier::Named(es) = s
                        && (matches!(es.orig, ModuleExportName::Str(..))
                            || matches!(es.exported, Some(ModuleExportName::Str(..))))
                    {
                        return true;
                    }
                }
            }

            _ => {}
        }
    }

    let mut visitor = ShouldSkip::default();
    m.visit_with(&mut visitor);
    if visitor.skip {
        return true;
    }

    for item in m.body.iter() {
        if item.is_module_decl() {
            return false;
        }
    }

    true
}

#[derive(Default)]
struct ShouldSkip {
    skip: bool,
}

impl Visit for ShouldSkip {
    fn visit_await_expr(&mut self, n: &AwaitExpr) {
        // __turbopack_wasm_module__ is not analyzable because __turbopack_wasm_module__
        // is injected global.
        if let Expr::Call(CallExpr {
            callee: Callee::Expr(expr),
            ..
        }) = &*n.arg
            && expr.is_ident_ref_to("__turbopack_wasm_module__")
        {
            self.skip = true;
            return;
        }

        n.visit_children_with(self);
    }

    fn visit_expr(&mut self, n: &Expr) {
        if self.skip {
            return;
        }

        n.visit_children_with(self);
    }

    fn visit_stmt(&mut self, n: &Stmt) {
        if self.skip {
            return;
        }

        n.visit_children_with(self);
    }

    noop_visit_type!();
}
