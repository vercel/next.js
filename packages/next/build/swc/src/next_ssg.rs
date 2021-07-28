use fxhash::FxHashSet;
use swc_common::DUMMY_SP;
use swc_ecmascript::ast::*;
use swc_ecmascript::utils::find_ids;
use swc_ecmascript::utils::ident::IdentLike;
use swc_ecmascript::visit::{FoldWith, Node, VisitWith};
use swc_ecmascript::{
    utils::Id,
    visit::{noop_fold_type, noop_visit_type, Fold, Visit},
};

/// Note: This paths requires runnning `resolver` **before** running this.
pub(crate) fn next_ssg_transform() -> impl Fold {
    NextSsg {
        state: Default::default(),
    }
}

/// Only modifies subset of `state`.
struct BindingColelctor<'a> {
    state: &'a mut State,
}

impl BindingColelctor<'_> {
    fn add(&mut self, i: &Ident) {
        self.state.referenced_ids.insert(i.to_id());
    }
}

impl Visit for BindingColelctor<'_> {
    // This is important for reducing binary sizes.
    noop_visit_type!();

    fn visit_binding_ident(&mut self, i: &BindingIdent, _: &dyn Node) {
        self.add(&i.id);
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
    fn is_data_identifier(&self, i: &Ident) -> bool {}
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

            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(e)) => {
                match &e.decl {
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
}

/// `VisitMut` is faster than [Fold], but we use [Fold] because it's much easier to read.
impl Fold for NextSsg {
    // This is important for reducing binary sizes.
    noop_fold_type!();

    fn fold_module(&mut self, mut m: Module) -> Module {
        {
            // Fill the list of references.
            let mut v = BindingColelctor {
                state: &mut self.state,
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

        let p = m.fold_children_with(self);
    }

    // Note: We don't implement fold_script because next.js doesn't use it.
}
