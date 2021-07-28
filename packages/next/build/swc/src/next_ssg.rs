use fxhash::FxHashSet;
use swc_common::pass::{Repeat, Repeated};
use swc_common::DUMMY_SP;
use swc_ecmascript::ast::*;
use swc_ecmascript::utils::ident::IdentLike;
use swc_ecmascript::utils::{find_ids, prepend};
use swc_ecmascript::visit::{FoldWith, Node, VisitWith};
use swc_ecmascript::{
    utils::Id,
    visit::{noop_fold_type, noop_visit_type, Fold, Visit},
};

/// Note: This paths requires runnning `resolver` **before** running this.
pub(crate) fn next_ssg() -> impl Fold {
    Repeat::new(NextSsg {
        state: Default::default(),
        should_run_again: false,
        in_lhs_of_var: false,
    })
}

/// Only modifies subset of `state`.
struct UsageColelctor<'a> {
    state: &'a mut State,
    in_lhs_of_var: bool,
}

impl UsageColelctor<'_> {
    fn add(&mut self, i: &Ident) {
        self.state.referenced_ids.insert(i.to_id());
    }
}

impl Visit for UsageColelctor<'_> {
    // This is important for reducing binary sizes.
    noop_visit_type!();

    fn visit_binding_ident(&mut self, i: &BindingIdent, _: &dyn Node) {
        if !self.in_lhs_of_var {
            self.add(&i.id);
        }
    }

    fn visit_export_named_specifier(&mut self, s: &ExportNamedSpecifier, _: &dyn Node) {
        self.add(&s.orig);
    }

    fn visit_expr(&mut self, e: &Expr, _: &dyn Node) {
        e.visit_children_with(self);

        match e {
            Expr::Ident(i) => {
                self.add(&i);
            }
            _ => {}
        }
    }

    fn visit_member_expr(&mut self, e: &MemberExpr, _: &dyn Node) {
        e.obj.visit_with(e, self);

        if e.computed {
            e.prop.visit_with(e, self);
        }
    }

    fn visit_prop(&mut self, p: &Prop, _: &dyn Node) {
        p.visit_children_with(self);

        match p {
            Prop::Shorthand(i) => {
                self.add(&i);
            }
            _ => {}
        }
    }

    fn visit_var_declarator(&mut self, v: &VarDeclarator, _: &dyn Node) {
        let old = self.in_lhs_of_var;

        self.in_lhs_of_var = true;
        v.name.visit_with(v, self);

        self.in_lhs_of_var = false;
        v.init.visit_with(v, self);

        self.in_lhs_of_var = old;
    }
}

/// State of the transforms. Shared by the anayzer and the tranform.
#[derive(Debug, Default)]
struct State {
    referenced_ids: FxHashSet<Id>,

    refs: FxHashSet<Id>,
    is_prerenderer: bool,
    is_server_props: bool,
    done: bool,
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
                    panic!("You can not use getStaticProps or getStaticPaths with getServerSideProps. To use SSG, please remove getServerSideProps")
                }

                self.is_server_props = true;
            } else {
                if self.is_server_props {
                    panic!("You can not use getStaticProps or getStaticPaths with getServerSideProps. To use SSG, please remove getServerSideProps")
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
}

impl Analyzer<'_> {
    fn add_ref(&mut self, id: Id) {
        if self.state.referenced_ids.contains(&id) {
            self.state.refs.insert(id);
        }
    }
}

impl Fold for Analyzer<'_> {
    // This is important for reducing binary sizes.
    noop_fold_type!();

    fn fold_fn_decl(&mut self, f: FnDecl) -> FnDecl {
        let f = f.fold_children_with(self);

        self.add_ref(f.ident.to_id());

        f
    }

    fn fold_fn_expr(&mut self, f: FnExpr) -> FnExpr {
        let f = f.fold_children_with(self);

        if let Some(id) = &f.ident {
            self.add_ref(id.to_id());
        }

        f
    }

    fn fold_import_default_specifier(
        &mut self,
        s: ImportDefaultSpecifier,
    ) -> ImportDefaultSpecifier {
        self.add_ref(s.local.to_id());

        s
    }

    fn fold_import_named_specifier(&mut self, s: ImportNamedSpecifier) -> ImportNamedSpecifier {
        self.add_ref(s.local.to_id());

        s
    }

    fn fold_import_star_as_specifier(&mut self, s: ImportStarAsSpecifier) -> ImportStarAsSpecifier {
        self.add_ref(s.local.to_id());

        s
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

            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(mut e)) => {
                match &mut e.decl {
                    Decl::Fn(d) => {
                        if self.state.is_data_identifier(&d.ident) {
                            return ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                        }
                    }
                    Decl::Var(d) => {
                        d.decls.retain(|d| match &d.name {
                            Pat::Ident(name) => !self.state.is_data_identifier(&name.id),
                            _ => true,
                        });

                        if d.decls.is_empty() {
                            return ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                        }
                    }
                    _ => {}
                }

                return ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(e.fold_with(self)));
            }

            _ => {}
        }

        s.fold_children_with(self)
    }

    fn fold_named_export(&mut self, mut n: NamedExport) -> NamedExport {
        n.specifiers.retain(|s| match s {
            ExportSpecifier::Namespace(ExportNamespaceSpecifier { name: exported, .. })
            | ExportSpecifier::Default(ExportDefaultSpecifier { exported, .. })
            | ExportSpecifier::Named(ExportNamedSpecifier {
                exported: Some(exported),
                ..
            }) => !self.state.is_data_identifier(&exported),
            ExportSpecifier::Named(s) => !self.state.is_data_identifier(&s.orig),
        });

        n
    }

    fn fold_var_declarator(&mut self, decl: VarDeclarator) -> VarDeclarator {
        let decl = decl.fold_children_with(self);

        let ids: Vec<Id> = find_ids(&decl.name);

        for id in ids {
            self.add_ref(id)
        }

        decl
    }
}

/// Actual implementation of the transform.
struct NextSsg {
    state: State,
    should_run_again: bool,
    in_lhs_of_var: bool,
}

impl NextSsg {
    fn should_remove(&self, id: Id) -> bool {
        self.state.refs.contains(&id) && !self.state.referenced_ids.contains(&id)
    }
}

impl Repeated for NextSsg {
    fn changed(&self) -> bool {
        self.should_run_again
    }

    fn reset(&mut self) {
        self.should_run_again = false;
    }
}

/// `VisitMut` is faster than [Fold], but we use [Fold] because it's much easier to read.
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
                    self.should_run_again = true;
                    false
                } else {
                    true
                }
            }
        });

        i
    }

    fn fold_module(&mut self, mut m: Module) -> Module {
        {
            // Fill the list of references.
            let mut v = UsageColelctor {
                state: &mut self.state,
                in_lhs_of_var: false,
            };
            m.visit_with(&Invalid { span: DUMMY_SP }, &mut v);
        }

        {
            // Fill the state.
            let mut v = Analyzer {
                state: &mut self.state,
            };
            m = m.fold_with(&mut v);
        }

        if !self.state.is_prerenderer && !self.state.is_server_props {
            return m;
        }

        m.fold_children_with(self)
    }

    fn fold_module_item(&mut self, i: ModuleItem) -> ModuleItem {
        match i {
            ModuleItem::ModuleDecl(ModuleDecl::Import(i)) => {
                let is_for_side_effect = i.specifiers.is_empty();
                let i = i.fold_children_with(self);

                if !is_for_side_effect && i.specifiers.is_empty() {
                    return ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                }

                return ModuleItem::ModuleDecl(ModuleDecl::Import(i));
            }
            _ => {}
        }

        i.fold_children_with(self)
    }

    fn fold_module_items(&mut self, mut items: Vec<ModuleItem>) -> Vec<ModuleItem> {
        items = items.fold_children_with(self);

        // Drop nodes.
        items.retain(|s| match s {
            ModuleItem::Stmt(Stmt::Empty(..)) => false,
            _ => true,
        });

        if !self.state.done {
            self.state.done = true;

            if items.iter().any(|s| s.is_module_decl()) {
                let var = VarDeclarator {
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
                };
                prepend(
                    &mut items,
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                        span: DUMMY_SP,
                        decl: Decl::Var(VarDecl {
                            span: DUMMY_SP,
                            kind: VarDeclKind::Var,
                            declare: Default::default(),
                            decls: vec![var],
                        }),
                    })),
                );
            }
        }

        items
    }

    /// This methods returns [Pat::Invalid] if the pattern should be removed.
    fn fold_pat(&mut self, mut p: Pat) -> Pat {
        p = p.fold_children_with(self);

        if self.in_lhs_of_var {
            match &mut p {
                Pat::Ident(name) => {
                    if self.should_remove(name.id.to_id()) {
                        self.should_run_again = true;
                        return Pat::Invalid(Invalid { span: DUMMY_SP });
                    }
                }
                Pat::Array(arr) => {
                    arr.elems.retain(|e| match e {
                        Some(Pat::Invalid(..)) => return false,
                        _ => true,
                    });

                    if arr.elems.is_empty() {
                        return Pat::Invalid(Invalid { span: DUMMY_SP });
                    }
                }
                Pat::Object(obj) => {
                    obj.props.retain(|prop| match prop {
                        ObjectPatProp::KeyValue(prop) => !prop.value.is_invalid(),
                        ObjectPatProp::Assign(..) => true,
                        ObjectPatProp::Rest(prop) => !prop.arg.is_invalid(),
                    });
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

    fn fold_stmt(&mut self, s: Stmt) -> Stmt {
        match &s {
            Stmt::Decl(Decl::Fn(f)) => {
                if self.should_remove(f.ident.to_id()) {
                    self.should_run_again = true;
                    return Stmt::Empty(EmptyStmt { span: DUMMY_SP });
                }
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

    /// This method make `name` of [VarDeclarator] to [Pat::Invalid] if it should be removed.
    fn fold_var_declarator(&mut self, d: VarDeclarator) -> VarDeclarator {
        let old = self.in_lhs_of_var;
        self.in_lhs_of_var = true;
        let name = d.name.fold_with(self);

        self.in_lhs_of_var = false;
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
