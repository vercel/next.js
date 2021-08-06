use fxhash::FxHashSet;
use std::mem::take;
use swc_common::pass::{Repeat, Repeated};
use swc_common::DUMMY_SP;
use swc_ecmascript::ast::*;
use swc_ecmascript::utils::ident::IdentLike;
use swc_ecmascript::visit::FoldWith;
use swc_ecmascript::{
    utils::Id,
    visit::{noop_fold_type, Fold},
};

/// Note: This paths requires runnning `resolver` **before** running this.
pub fn next_ssg() -> impl Fold {
    Repeat::new(NextSsg {
        state: Default::default(),
        in_lhs_of_var: false,
    })
}

/// State of the transforms. Shared by the anayzer and the tranform.
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
}

impl State {
    fn is_data_identifier(&mut self, i: &Ident) -> bool {
        let ssg_exports = &[
            "getStaticProps",
            "getStaticPaths",
            "getServerSideProps",
            "unstable_getStaticProps",
            "unstable_getStaticPaths",
            "unstable_getServerProps",
            "unstable_getServerSideProps",
        ];

        if ssg_exports.contains(&&*i.sym) {
            if &*i.sym == "" {
                if self.is_prerenderer {
                    panic!(
                        "You can not use getStaticProps or getStaticPaths with \
                         getServerSideProps. To use SSG, please remove getServerSideProps"
                    )
                }

                self.is_server_props = true;
            } else {
                if self.is_server_props {
                    panic!(
                        "You can not use getStaticProps or getStaticPaths with \
                         getServerSideProps. To use SSG, please remove getServerSideProps"
                    )
                }

                self.is_prerenderer = true;
            }

            true
        } else {
            false
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
        log::trace!("add_ref({}{:?}, data = {})", id.0, id.1, self.in_data_fn);
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
        self.add_ref(s.orig.to_id());

        s
    }

    fn fold_expr(&mut self, e: Expr) -> Expr {
        let e = e.fold_children_with(self);

        match &e {
            Expr::Ident(i) => {
                self.add_ref(i.to_id());
            }
            _ => {}
        }

        e
    }

    fn fold_fn_decl(&mut self, f: FnDecl) -> FnDecl {
        let old_in_data = self.in_data_fn;

        self.state.cur_declaring.insert(f.ident.to_id());

        self.in_data_fn |= self.state.is_data_identifier(&f.ident);
        log::trace!(
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

    fn fold_member_expr(&mut self, mut e: MemberExpr) -> MemberExpr {
        e.obj = e.obj.fold_with(self);

        if e.computed {
            e.prop = e.prop.fold_with(self);
        }

        e
    }

    /// Drops [ExportDecl] if all speicifers are removed.
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

        match &s {
            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(e)) => match &e.decl {
                Decl::Fn(f) => {
                    // Drop getStaticProps.
                    if self.state.is_data_identifier(&f.ident) {
                        return ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                    }
                }

                Decl::Var(d) => {
                    if d.decls.is_empty() {
                        return ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                    }
                }
                _ => {}
            },

            _ => {}
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

        match &p {
            Prop::Shorthand(i) => {
                self.add_ref(i.to_id());
            }
            _ => {}
        }

        p
    }

    fn fold_var_declarator(&mut self, mut v: VarDeclarator) -> VarDeclarator {
        let old_in_data = self.in_data_fn;

        match &v.name {
            Pat::Ident(name) => {
                if self.state.is_data_identifier(&name.id) {
                    self.in_data_fn = true;
                }
            }
            _ => {}
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
    state: State,
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
        log::debug!("mark_as_candidate");

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

        i.specifiers.retain(|s| match s {
            ImportSpecifier::Named(ImportNamedSpecifier { local, .. })
            | ImportSpecifier::Default(ImportDefaultSpecifier { local, .. })
            | ImportSpecifier::Namespace(ImportStarAsSpecifier { local, .. }) => {
                if self.should_remove(local.to_id()) {
                    log::trace!(
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
        log::info!("ssg: Start");
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
        match i {
            ModuleItem::ModuleDecl(ModuleDecl::Import(i)) => {
                let is_for_side_effect = i.specifiers.is_empty();
                let i = i.fold_with(self);

                if !is_for_side_effect && i.specifiers.is_empty() {
                    return ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                }

                return ModuleItem::ModuleDecl(ModuleDecl::Import(i));
            }
            _ => {}
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
        items.retain(|s| match s {
            ModuleItem::Stmt(Stmt::Empty(..)) => false,
            _ => true,
        });

        if !self.state.done && !self.state.should_run_again {
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
                    match &item {
                        ModuleItem::ModuleDecl(
                            ModuleDecl::ExportNamed(..)
                            | ModuleDecl::ExportDecl(..)
                            | ModuleDecl::ExportDefaultDecl(..)
                            | ModuleDecl::ExportDefaultExpr(..),
                        ) => {
                            if let Some(var) = var.take() {
                                new.push(ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(
                                    ExportDecl {
                                        span: DUMMY_SP,
                                        decl: Decl::Var(VarDecl {
                                            span: DUMMY_SP,
                                            kind: VarDeclKind::Var,
                                            declare: Default::default(),
                                            decls: vec![var],
                                        }),
                                    },
                                )))
                            }
                        }

                        _ => {}
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
                ExportSpecifier::Namespace(ExportNamespaceSpecifier { name: exported, .. })
                | ExportSpecifier::Default(ExportDefaultSpecifier { exported, .. })
                | ExportSpecifier::Named(ExportNamedSpecifier {
                    exported: Some(exported),
                    ..
                }) => !self.state.is_data_identifier(&exported),
                ExportSpecifier::Named(s) => !self.state.is_data_identifier(&s.orig),
            };

            if !preserve {
                log::trace!("Dropping a export specifier because it's a data identifier");

                match s {
                    ExportSpecifier::Named(ExportNamedSpecifier { orig, .. }) => {
                        self.state.should_run_again = true;
                        self.state.refs_from_data_fn.insert(orig.to_id());
                    }
                    _ => {}
                }
            }

            preserve
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
                        log::trace!(
                            "Dropping var `{}{:?}` because it should be removed",
                            name.id.sym,
                            name.id.span.ctxt
                        );

                        return Pat::Invalid(Invalid { span: DUMMY_SP });
                    }
                }
                Pat::Array(arr) => {
                    if !arr.elems.is_empty() {
                        arr.elems.retain(|e| match e {
                            Some(Pat::Invalid(..)) => return false,
                            _ => true,
                        });

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
