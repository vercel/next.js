// Lifted from https://github.com/vercel/next.js/blob/f7fecf00cb40c2f784387ff8ccc5e213b8bdd9ca/packages/next-swc/crates/core/src/next_ssg.rs

use std::{cell::RefCell, mem::take, rc::Rc};

use easy_error::{bail, Error};
use fxhash::FxHashSet;
use swc_core::{
    common::{
        errors::HANDLER,
        pass::{Repeat, Repeated},
        DUMMY_SP,
    },
    ecma::{
        ast::*,
        visit::{noop_fold_type, Fold, FoldWith},
    },
};

static SSG_EXPORTS: &[&str; 3] = &["getStaticProps", "getStaticPaths", "getServerSideProps"];

/// Note: This paths requires running `resolver` **before** running this.
pub fn next_ssg(eliminated_packages: Rc<RefCell<FxHashSet<String>>>) -> impl Fold {
    Repeat::new(NextSsg {
        state: State {
            eliminated_packages,
            ..Default::default()
        },
        in_lhs_of_var: false,
    })
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
    pub eliminated_packages: Rc<RefCell<FxHashSet<String>>>,
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

impl Fold for Analyzer<'_> {
    // This is important for reducing binary sizes.
    noop_fold_type!();

    fn fold_binding_ident(&mut self, i: BindingIdent) -> BindingIdent {
        if !self.in_lhs_of_var || self.in_data_fn {
            self.add_ref(i.id.to_id());
        }

        i
    }

    fn fold_export_named_specifier(&mut self, s: ExportNamedSpecifier) -> ExportNamedSpecifier {
        if let ModuleExportName::Ident(id) = &s.orig {
            if !SSG_EXPORTS.contains(&&*id.sym) {
                self.add_ref(id.to_id());
            }
        }

        s
    }

    fn fold_export_decl(&mut self, s: ExportDecl) -> ExportDecl {
        if let Decl::Var(d) = &s.decl {
            if d.decls.is_empty() {
                return s;
            }

            if let Pat::Ident(id) = &d.decls[0].name {
                if !SSG_EXPORTS.contains(&&*id.id.sym) {
                    self.add_ref(id.to_id());
                }
            }
        }

        s.fold_children_with(self)
    }

    fn fold_expr(&mut self, e: Expr) -> Expr {
        let e = e.fold_children_with(self);

        if let Expr::Ident(i) = &e {
            self.add_ref(i.to_id());
        }

        e
    }

    fn fold_jsx_element(&mut self, jsx: JSXElement) -> JSXElement {
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

        jsx.fold_children_with(self)
    }

    fn fold_fn_decl(&mut self, f: FnDecl) -> FnDecl {
        let old_in_data = self.in_data_fn;

        self.state.cur_declaring.insert(f.ident.to_id());

        if let Ok(is_data_identifier) = self.state.is_data_identifier(&f.ident) {
            self.in_data_fn |= is_data_identifier;
        } else {
            return f;
        }
        tracing::trace!(
            "ssg: Handling `{}{:?}`; in_data_fn = {:?}",
            f.ident.sym,
            f.ident.span.ctxt,
            self.in_data_fn
        );

        let f = f.fold_children_with(self);

        self.state.cur_declaring.remove(&f.ident.to_id());

        self.in_data_fn = old_in_data;

        f
    }

    fn fold_fn_expr(&mut self, f: FnExpr) -> FnExpr {
        let f = f.fold_children_with(self);

        if let Some(id) = &f.ident {
            self.add_ref(id.to_id());
        }

        f
    }

    /// Drops [ExportDecl] if all specifiers are removed.
    fn fold_module_item(&mut self, s: ModuleItem) -> ModuleItem {
        match s {
            ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(e)) if !e.specifiers.is_empty() => {
                let e = e.fold_with(self);

                if e.specifiers.is_empty() {
                    return ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                }

                return ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(e));
            }
            _ => {}
        };

        // Visit children to ensure that all references is added to the scope.
        let s = s.fold_children_with(self);

        if let ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(e)) = &s {
            match &e.decl {
                Decl::Fn(f) => {
                    // Drop getStaticProps.
                    if let Ok(is_data_identifier) = self.state.is_data_identifier(&f.ident) {
                        if is_data_identifier {
                            return ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                        }
                    } else {
                        return s;
                    }
                }

                Decl::Var(d) => {
                    if d.decls.is_empty() {
                        return ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                    }
                }
                _ => {}
            }
        }

        s
    }

    fn fold_named_export(&mut self, mut n: NamedExport) -> NamedExport {
        if n.src.is_some() {
            n.specifiers = n.specifiers.fold_with(self);
        }

        n
    }

    fn fold_prop(&mut self, p: Prop) -> Prop {
        let p = p.fold_children_with(self);

        if let Prop::Shorthand(i) = &p {
            self.add_ref(i.to_id());
        }

        p
    }

    fn fold_var_declarator(&mut self, mut v: VarDeclarator) -> VarDeclarator {
        let old_in_data = self.in_data_fn;

        if let Pat::Ident(name) = &v.name {
            if let Ok(is_data_identifier) = self.state.is_data_identifier(&name.id) {
                if is_data_identifier {
                    self.in_data_fn = true;
                }
            } else {
                return v;
            }
        }

        let old_in_lhs_of_var = self.in_lhs_of_var;

        self.in_lhs_of_var = true;
        v.name = v.name.fold_with(self);

        self.in_lhs_of_var = false;
        v.init = v.init.fold_with(self);

        self.in_lhs_of_var = old_in_lhs_of_var;

        self.in_data_fn = old_in_data;

        v
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
    fn mark_as_candidate<N>(&mut self, n: N) -> N
    where
        N: for<'aa> FoldWith<Analyzer<'aa>>,
    {
        tracing::debug!("mark_as_candidate");

        // Analyzer never change `in_data_fn` to false, so all identifiers in `n` will
        // be marked as referenced from a data function.
        let mut v = Analyzer {
            state: &mut self.state,
            in_lhs_of_var: false,
            in_data_fn: true,
        };

        let n = n.fold_with(&mut v);
        self.state.should_run_again = true;
        n
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

/// `VisitMut` is faster than [Fold], but we use [Fold] because it's much easier
/// to read.
///
/// Note: We don't implement `fold_script` because next.js doesn't use it.
impl Fold for NextSsg {
    // This is important for reducing binary sizes.
    noop_fold_type!();

    fn fold_import_decl(&mut self, mut i: ImportDecl) -> ImportDecl {
        // Imports for side effects.
        if i.specifiers.is_empty() {
            return i;
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
                        && import_src.starts_with(|c: char| c.is_ascii_lowercase() || c == '@')
                    {
                        self.state
                            .eliminated_packages
                            .borrow_mut()
                            .insert(import_src.to_string());
                    }
                    tracing::trace!(
                        "Dropping import `{}{:?}` because it should be removed",
                        local.sym,
                        local.span.ctxt
                    );

                    self.state.should_run_again = true;
                    false
                } else {
                    true
                }
            }
        });

        i
    }

    fn fold_module(&mut self, mut m: Module) -> Module {
        tracing::info!("ssg: Start");
        {
            // Fill the state.
            let mut v = Analyzer {
                state: &mut self.state,
                in_lhs_of_var: false,
                in_data_fn: false,
            };
            m = m.fold_with(&mut v);
        }

        // TODO: Use better detection logic
        // if !self.state.is_prerenderer && !self.state.is_server_props {
        //     return m;
        // }

        m.fold_children_with(self)
    }

    fn fold_module_item(&mut self, i: ModuleItem) -> ModuleItem {
        if let ModuleItem::ModuleDecl(ModuleDecl::Import(i)) = i {
            let is_for_side_effect = i.specifiers.is_empty();
            let i = i.fold_with(self);

            if !is_for_side_effect && i.specifiers.is_empty() {
                return ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
            }

            return ModuleItem::ModuleDecl(ModuleDecl::Import(i));
        }

        let i = i.fold_children_with(self);

        match &i {
            ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(e)) if e.specifiers.is_empty() => {
                return ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }))
            }
            _ => {}
        }

        i
    }

    fn fold_module_items(&mut self, mut items: Vec<ModuleItem>) -> Vec<ModuleItem> {
        items = items.fold_children_with(self);

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
                        Ident::new(
                            if self.state.is_prerenderer {
                                "__N_SSG".into()
                            } else {
                                "__N_SSP".into()
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
                for item in take(&mut items) {
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
                                    declare: Default::default(),
                                    decls: vec![var],
                                })),
                            })))
                        }
                    }

                    new.push(item);
                }

                return new;
            }
        }

        items
    }

    fn fold_named_export(&mut self, mut n: NamedExport) -> NamedExport {
        n.specifiers = n.specifiers.fold_with(self);

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

        n
    }

    /// This methods returns [Pat::Invalid] if the pattern should be removed.
    fn fold_pat(&mut self, mut p: Pat) -> Pat {
        p = p.fold_children_with(self);

        if self.in_lhs_of_var {
            match &mut p {
                Pat::Ident(name) => {
                    if self.should_remove(name.id.to_id()) {
                        self.state.should_run_again = true;
                        tracing::trace!(
                            "Dropping var `{}{:?}` because it should be removed",
                            name.id.sym,
                            name.id.span.ctxt
                        );

                        return Pat::Invalid(Invalid { span: DUMMY_SP });
                    }
                }
                Pat::Array(arr) => {
                    if !arr.elems.is_empty() {
                        arr.elems.retain(|e| !matches!(e, Some(Pat::Invalid(..))));

                        if arr.elems.is_empty() {
                            return Pat::Invalid(Invalid { span: DUMMY_SP });
                        }
                    }
                }
                Pat::Object(obj) => {
                    if !obj.props.is_empty() {
                        obj.props = take(&mut obj.props)
                            .into_iter()
                            .filter_map(|prop| match prop {
                                ObjectPatProp::KeyValue(prop) => {
                                    if prop.value.is_invalid() {
                                        None
                                    } else {
                                        Some(ObjectPatProp::KeyValue(prop))
                                    }
                                }
                                ObjectPatProp::Assign(prop) => {
                                    if self.should_remove(prop.key.to_id()) {
                                        self.mark_as_candidate(prop.value);

                                        None
                                    } else {
                                        Some(ObjectPatProp::Assign(prop))
                                    }
                                }
                                ObjectPatProp::Rest(prop) => {
                                    if prop.arg.is_invalid() {
                                        None
                                    } else {
                                        Some(ObjectPatProp::Rest(prop))
                                    }
                                }
                            })
                            .collect();

                        if obj.props.is_empty() {
                            return Pat::Invalid(Invalid { span: DUMMY_SP });
                        }
                    }
                }
                Pat::Rest(rest) => {
                    if rest.arg.is_invalid() {
                        return Pat::Invalid(Invalid { span: DUMMY_SP });
                    }
                }
                _ => {}
            }
        }

        p
    }

    #[allow(clippy::single_match)]
    fn fold_stmt(&mut self, mut s: Stmt) -> Stmt {
        match s {
            Stmt::Decl(Decl::Fn(f)) => {
                if self.should_remove(f.ident.to_id()) {
                    self.mark_as_candidate(f.function);
                    return Stmt::Empty(EmptyStmt { span: DUMMY_SP });
                }

                s = Stmt::Decl(Decl::Fn(f));
            }
            _ => {}
        }

        let s = s.fold_children_with(self);
        match s {
            Stmt::Decl(Decl::Var(v)) if v.decls.is_empty() => {
                return Stmt::Empty(EmptyStmt { span: DUMMY_SP });
            }
            _ => {}
        }

        s
    }

    /// This method make `name` of [VarDeclarator] to [Pat::Invalid] if it
    /// should be removed.
    fn fold_var_declarator(&mut self, mut d: VarDeclarator) -> VarDeclarator {
        let old = self.in_lhs_of_var;
        self.in_lhs_of_var = true;
        let name = d.name.fold_with(self);

        self.in_lhs_of_var = false;
        if name.is_invalid() {
            d.init = self.mark_as_candidate(d.init);
        }
        let init = d.init.fold_with(self);
        self.in_lhs_of_var = old;

        VarDeclarator { name, init, ..d }
    }

    fn fold_var_declarators(&mut self, mut decls: Vec<VarDeclarator>) -> Vec<VarDeclarator> {
        decls = decls.fold_children_with(self);
        decls.retain(|d| !d.name.is_invalid());

        decls
    }
}
