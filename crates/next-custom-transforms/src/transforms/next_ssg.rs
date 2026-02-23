use std::{cell::RefCell, mem::take, rc::Rc};

use easy_error::{Error, bail};
use rustc_hash::FxHashSet;
use swc_core::{
    atoms::{Atom, atom},
    common::{
        DUMMY_SP,
        errors::HANDLER,
        pass::{Repeat, Repeated},
    },
    ecma::{
        ast::*,
        visit::{VisitMut, VisitMutWith, noop_visit_mut_type, visit_mut_pass},
    },
};

static SSG_EXPORTS: &[&str; 3] = &["getStaticProps", "getStaticPaths", "getServerSideProps"];

/// Note: This paths requires running `resolver` **before** running this.
pub fn next_ssg(eliminated_packages: Rc<RefCell<FxHashSet<Atom>>>) -> impl Pass {
    visit_mut_pass(Repeat::new(NextSsg {
        state: State {
            eliminated_packages,
            ..Default::default()
        },
        in_lhs_of_var: false,
    }))
}

/// State of the transforms. Shared by the analyzer and the transform.
#[derive(Debug, Default)]
struct State {
    /// Identifiers referenced by non-data function codes.
    ///
    /// Cleared before running each pass, because we drop ast nodes between the
    /// passes.
    refs_from_other: FxHashSet<Id>,

    /// Identifiers referenced by data functions or derivatives.
    ///
    /// Preserved between runs, because we should remember derivatives of data
    /// functions as the data function itself is already removed.
    refs_from_data_fn: FxHashSet<Id>,

    cur_declaring: FxHashSet<Id>,

    is_prerenderer: bool,
    is_server_props: bool,
    done: bool,

    should_run_again: bool,

    /// Track the import packages which are eliminated in the
    /// `getServerSideProps`
    pub eliminated_packages: Rc<RefCell<FxHashSet<Atom>>>,
}

impl State {
    #[allow(clippy::wrong_self_convention)]
    fn is_data_identifier(&mut self, i: &Ident) -> Result<bool, Error> {
        if SSG_EXPORTS.contains(&&*i.sym) {
            if &*i.sym == "getServerSideProps" {
                if self.is_prerenderer {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(
                                i.span,
                                "You can not use getStaticProps or getStaticPaths with \
                                 getServerSideProps. To use SSG, please remove getServerSideProps",
                            )
                            .emit()
                    });
                    bail!("both ssg and ssr functions present");
                }

                self.is_server_props = true;
            } else {
                if self.is_server_props {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(
                                i.span,
                                "You can not use getStaticProps or getStaticPaths with \
                                 getServerSideProps. To use SSG, please remove getServerSideProps",
                            )
                            .emit()
                    });
                    bail!("both ssg and ssr functions present");
                }

                self.is_prerenderer = true;
            }

            Ok(true)
        } else {
            Ok(false)
        }
    }
}

struct Analyzer<'a> {
    state: &'a mut State,
    in_lhs_of_var: bool,
    in_data_fn: bool,
}

impl Analyzer<'_> {
    fn add_ref(&mut self, id: Id) {
        tracing::trace!("add_ref({}{:?}, data = {})", id.0, id.1, self.in_data_fn);
        if self.in_data_fn {
            self.state.refs_from_data_fn.insert(id);
        } else {
            if self.state.cur_declaring.contains(&id) {
                return;
            }

            self.state.refs_from_other.insert(id);
        }
    }
}

impl VisitMut for Analyzer<'_> {
    // This is important for reducing binary sizes.
    noop_visit_mut_type!();

    fn visit_mut_binding_ident(&mut self, i: &mut BindingIdent) {
        if !self.in_lhs_of_var || self.in_data_fn {
            self.add_ref(i.id.to_id());
        }
    }

    fn visit_mut_export_named_specifier(&mut self, s: &mut ExportNamedSpecifier) {
        if let ModuleExportName::Ident(id) = &s.orig {
            if !SSG_EXPORTS.contains(&&*id.sym) {
                self.add_ref(id.to_id());
            }
        }
    }

    fn visit_mut_export_decl(&mut self, s: &mut ExportDecl) {
        if let Decl::Var(d) = &s.decl {
            if d.decls.is_empty() {
                return;
            }

            for decl in &d.decls {
                if let Pat::Ident(id) = &decl.name {
                    if !SSG_EXPORTS.contains(&&*id.id.sym) {
                        self.add_ref(id.to_id());
                    }
                }
            }
        }

        s.visit_mut_children_with(self)
    }

    fn visit_mut_expr(&mut self, e: &mut Expr) {
        e.visit_mut_children_with(self);

        if let Expr::Ident(i) = &e {
            self.add_ref(i.to_id());
        }
    }

    fn visit_mut_jsx_element(&mut self, jsx: &mut JSXElement) {
        fn get_leftmost_id_member_expr(e: &JSXMemberExpr) -> Id {
            match &e.obj {
                JSXObject::Ident(i) => i.to_id(),
                JSXObject::JSXMemberExpr(e) => get_leftmost_id_member_expr(e),
            }
        }

        match &jsx.opening.name {
            JSXElementName::Ident(i) => {
                self.add_ref(i.to_id());
            }
            JSXElementName::JSXMemberExpr(e) => {
                self.add_ref(get_leftmost_id_member_expr(e));
            }
            _ => {}
        }

        jsx.visit_mut_children_with(self);
    }

    fn visit_mut_fn_decl(&mut self, f: &mut FnDecl) {
        let old_in_data = self.in_data_fn;

        self.state.cur_declaring.insert(f.ident.to_id());

        if let Ok(is_data_identifier) = self.state.is_data_identifier(&f.ident) {
            self.in_data_fn |= is_data_identifier;
        } else {
            return;
        }
        tracing::trace!(
            "ssg: Handling `{}{:?}`; in_data_fn = {:?}",
            f.ident.sym,
            f.ident.ctxt,
            self.in_data_fn
        );

        f.visit_mut_children_with(self);

        self.state.cur_declaring.remove(&f.ident.to_id());

        self.in_data_fn = old_in_data;
    }

    fn visit_mut_fn_expr(&mut self, f: &mut FnExpr) {
        f.visit_mut_children_with(self);

        if let Some(id) = &f.ident {
            self.add_ref(id.to_id());
        }
    }

    /// Drops [ExportDecl] if all specifiers are removed.
    fn visit_mut_module_item(&mut self, s: &mut ModuleItem) {
        match s {
            ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(e)) if !e.specifiers.is_empty() => {
                e.visit_mut_with(self);

                if e.specifiers.is_empty() {
                    *s = ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                    return;
                }

                return;
            }
            _ => {}
        };

        // Visit children to ensure that all references is added to the scope.
        s.visit_mut_children_with(self);

        if let ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(e)) = &s {
            match &e.decl {
                Decl::Fn(f) => {
                    // Drop getStaticProps.
                    if let Ok(is_data_identifier) = self.state.is_data_identifier(&f.ident) {
                        if is_data_identifier {
                            *s = ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                        }
                    }
                }

                Decl::Var(d) => {
                    if d.decls.is_empty() {
                        *s = ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                    }
                }
                _ => {}
            }
        }
    }

    fn visit_mut_named_export(&mut self, n: &mut NamedExport) {
        if n.src.is_some() {
            n.specifiers.visit_mut_with(self);
        }
    }

    fn visit_mut_prop(&mut self, p: &mut Prop) {
        p.visit_mut_children_with(self);

        if let Prop::Shorthand(i) = &p {
            self.add_ref(i.to_id());
        }
    }

    fn visit_mut_var_declarator(&mut self, v: &mut VarDeclarator) {
        let old_in_data = self.in_data_fn;

        if let Pat::Ident(name) = &v.name {
            if let Ok(is_data_identifier) = self.state.is_data_identifier(&name.id) {
                if is_data_identifier {
                    self.in_data_fn = true;
                }
            } else {
                return;
            }
        }

        let old_in_lhs_of_var = self.in_lhs_of_var;

        self.in_lhs_of_var = true;
        v.name.visit_mut_with(self);

        self.in_lhs_of_var = false;
        v.init.visit_mut_with(self);

        self.in_lhs_of_var = old_in_lhs_of_var;

        self.in_data_fn = old_in_data;
    }
}

/// Actual implementation of the transform.
struct NextSsg {
    pub state: State,
    in_lhs_of_var: bool,
}

impl NextSsg {
    fn should_remove(&self, id: Id) -> bool {
        self.state.refs_from_data_fn.contains(&id) && !self.state.refs_from_other.contains(&id)
    }

    /// Mark identifiers in `n` as a candidate for removal.
    fn mark_as_candidate<N>(&mut self, n: &mut N)
    where
        N: for<'aa> VisitMutWith<Analyzer<'aa>>,
    {
        tracing::debug!("mark_as_candidate");

        // Analyzer never change `in_data_fn` to false, so all identifiers in `n` will
        // be marked as referenced from a data function.
        let mut v = Analyzer {
            state: &mut self.state,
            in_lhs_of_var: false,
            in_data_fn: true,
        };

        n.visit_mut_with(&mut v);
        self.state.should_run_again = true;
    }
}

impl Repeated for NextSsg {
    fn changed(&self) -> bool {
        self.state.should_run_again
    }

    fn reset(&mut self) {
        self.state.refs_from_other.clear();
        self.state.cur_declaring.clear();
        self.state.should_run_again = false;
    }
}

/// Note: We don't implement `visit_mut_script` because next.js doesn't use it.
impl VisitMut for NextSsg {
    // This is important for reducing binary sizes.
    noop_visit_mut_type!();

    fn visit_mut_import_decl(&mut self, i: &mut ImportDecl) {
        // Imports for side effects.
        if i.specifiers.is_empty() {
            return;
        }

        let import_src = &i.src.value;

        i.specifiers.retain(|s| match s {
            ImportSpecifier::Named(ImportNamedSpecifier { local, .. })
            | ImportSpecifier::Default(ImportDefaultSpecifier { local, .. })
            | ImportSpecifier::Namespace(ImportStarAsSpecifier { local, .. }) => {
                if self.should_remove(local.to_id()) {
                    if self.state.is_server_props
                        // filter out non-packages import
                        // third part packages must start with `a-z` or `@`
                        && import_src.as_str().unwrap_or_default().starts_with(|c: char| c.is_ascii_lowercase() || c == '@')
                    {
                        self.state
                            .eliminated_packages
                            .borrow_mut()
                            .insert(import_src.clone().to_atom_lossy().into_owned());
                    }
                    tracing::trace!(
                        "Dropping import `{}{:?}` because it should be removed",
                        local.sym,
                        local.ctxt
                    );

                    self.state.should_run_again = true;
                    false
                } else {
                    true
                }
            }
        });
    }

    fn visit_mut_module(&mut self, m: &mut Module) {
        tracing::info!("ssg: Start");
        {
            // Fill the state.
            let mut v = Analyzer {
                state: &mut self.state,
                in_lhs_of_var: false,
                in_data_fn: false,
            };
            m.visit_mut_with(&mut v);
        }

        // TODO: Use better detection logic
        // if !self.state.is_prerenderer && !self.state.is_server_props {
        //     return m;
        // }

        m.visit_mut_children_with(self)
    }

    fn visit_mut_module_item(&mut self, i: &mut ModuleItem) {
        if let ModuleItem::ModuleDecl(ModuleDecl::Import(decl)) = i {
            let is_for_side_effect = decl.specifiers.is_empty();
            decl.visit_mut_with(self);

            if !is_for_side_effect && decl.specifiers.is_empty() {
                *i = ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                return;
            }

            return;
        }

        i.visit_mut_children_with(self);

        match &i {
            ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(e)) if e.specifiers.is_empty() => {
                *i = ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
            }
            _ => {}
        }
    }

    fn visit_mut_module_items(&mut self, items: &mut Vec<ModuleItem>) {
        items.visit_mut_children_with(self);

        // Drop nodes.
        items.retain(|s| !matches!(s, ModuleItem::Stmt(Stmt::Empty(..))));

        if !self.state.done
            && !self.state.should_run_again
            && (self.state.is_prerenderer || self.state.is_server_props)
        {
            self.state.done = true;

            if items.iter().any(|s| s.is_module_decl()) {
                let mut var = Some(VarDeclarator {
                    span: DUMMY_SP,
                    name: Pat::Ident(
                        IdentName::new(
                            if self.state.is_prerenderer {
                                atom!("__N_SSG")
                            } else {
                                atom!("__N_SSP")
                            },
                            DUMMY_SP,
                        )
                        .into(),
                    ),
                    init: Some(Box::new(Expr::Lit(Lit::Bool(Bool {
                        span: DUMMY_SP,
                        value: true,
                    })))),
                    definite: Default::default(),
                });

                let mut new = Vec::with_capacity(items.len() + 1);
                for item in take(items) {
                    if let ModuleItem::ModuleDecl(
                        ModuleDecl::ExportNamed(..)
                        | ModuleDecl::ExportDecl(..)
                        | ModuleDecl::ExportDefaultDecl(..)
                        | ModuleDecl::ExportDefaultExpr(..),
                    ) = &item
                    {
                        if let Some(var) = var.take() {
                            new.push(ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                                span: DUMMY_SP,
                                decl: Decl::Var(Box::new(VarDecl {
                                    span: DUMMY_SP,
                                    kind: VarDeclKind::Var,
                                    decls: vec![var],
                                    ..Default::default()
                                })),
                            })))
                        }
                    }

                    new.push(item);
                }

                *items = new;
            }
        }
    }

    fn visit_mut_named_export(&mut self, n: &mut NamedExport) {
        n.specifiers.visit_mut_with(self);

        n.specifiers.retain(|s| {
            let preserve = match s {
                ExportSpecifier::Namespace(ExportNamespaceSpecifier {
                    name: ModuleExportName::Ident(exported),
                    ..
                })
                | ExportSpecifier::Default(ExportDefaultSpecifier { exported, .. })
                | ExportSpecifier::Named(ExportNamedSpecifier {
                    exported: Some(ModuleExportName::Ident(exported)),
                    ..
                }) => self
                    .state
                    .is_data_identifier(exported)
                    .map(|is_data_identifier| !is_data_identifier),
                ExportSpecifier::Named(ExportNamedSpecifier {
                    orig: ModuleExportName::Ident(orig),
                    ..
                }) => self
                    .state
                    .is_data_identifier(orig)
                    .map(|is_data_identifier| !is_data_identifier),

                _ => Ok(true),
            };

            match preserve {
                Ok(false) => {
                    tracing::trace!("Dropping a export specifier because it's a data identifier");

                    if let ExportSpecifier::Named(ExportNamedSpecifier {
                        orig: ModuleExportName::Ident(orig),
                        ..
                    }) = s
                    {
                        self.state.should_run_again = true;
                        self.state.refs_from_data_fn.insert(orig.to_id());
                    }

                    false
                }
                Ok(true) => true,
                Err(_) => false,
            }
        });
    }

    /// This methods returns [Pat::Invalid] if the pattern should be removed.
    fn visit_mut_pat(&mut self, p: &mut Pat) {
        p.visit_mut_children_with(self);

        if self.in_lhs_of_var {
            match p {
                Pat::Ident(name) => {
                    if self.should_remove(name.id.to_id()) {
                        self.state.should_run_again = true;
                        tracing::trace!(
                            "Dropping var `{}{:?}` because it should be removed",
                            name.id.sym,
                            name.id.ctxt
                        );

                        *p = Pat::Invalid(Invalid { span: DUMMY_SP });
                    }
                }
                Pat::Array(arr) => {
                    if !arr.elems.is_empty() {
                        arr.elems.retain(|e| !matches!(e, Some(Pat::Invalid(..))));

                        if arr.elems.is_empty() {
                            *p = Pat::Invalid(Invalid { span: DUMMY_SP });
                        }
                    }
                }
                Pat::Object(obj) => {
                    if !obj.props.is_empty() {
                        obj.props.retain_mut(|prop| match prop {
                            ObjectPatProp::KeyValue(prop) => !prop.value.is_invalid(),
                            ObjectPatProp::Assign(prop) => {
                                if self.should_remove(prop.key.to_id()) {
                                    self.mark_as_candidate(&mut prop.value);

                                    false
                                } else {
                                    true
                                }
                            }
                            ObjectPatProp::Rest(prop) => !prop.arg.is_invalid(),
                        });

                        if obj.props.is_empty() {
                            *p = Pat::Invalid(Invalid { span: DUMMY_SP });
                        }
                    }
                }
                Pat::Rest(rest) => {
                    if rest.arg.is_invalid() {
                        *p = Pat::Invalid(Invalid { span: DUMMY_SP });
                    }
                }
                _ => {}
            }
        }
    }

    #[allow(clippy::single_match)]
    fn visit_mut_stmt(&mut self, s: &mut Stmt) {
        if let Stmt::Decl(Decl::Fn(f)) = s {
            if self.should_remove(f.ident.to_id()) {
                self.mark_as_candidate(&mut f.function);
                *s = Stmt::Empty(EmptyStmt { span: DUMMY_SP });
                return;
            }
        }

        s.visit_mut_children_with(self);
        match s {
            Stmt::Decl(Decl::Var(v)) if v.decls.is_empty() => {
                *s = Stmt::Empty(EmptyStmt { span: DUMMY_SP });
            }
            _ => {}
        }
    }

    /// This method make `name` of [VarDeclarator] to [Pat::Invalid] if it
    /// should be removed.
    fn visit_mut_var_declarator(&mut self, d: &mut VarDeclarator) {
        let old = self.in_lhs_of_var;
        self.in_lhs_of_var = true;
        d.name.visit_mut_with(self);

        self.in_lhs_of_var = false;
        if d.name.is_invalid() {
            self.mark_as_candidate(&mut d.init);
        }
        d.init.visit_mut_with(self);
        self.in_lhs_of_var = old;
    }

    fn visit_mut_var_declarators(&mut self, decls: &mut Vec<VarDeclarator>) {
        decls.visit_mut_children_with(self);
        decls.retain(|d| !d.name.is_invalid());
    }
}
