use rustc_hash::FxHashMap;
use turbopack_binding::swc::core::{
    common::{SyntaxContext, DUMMY_SP},
    ecma::{
        ast::{
            CallExpr, Callee, Decl, Expr, Id, Ident, Lit, MemberProp, Module, ModuleItem, Pat,
            Script, Stmt, VarDecl, VarDeclKind, VarDeclarator,
        },
        atoms::{Atom, JsWord},
        utils::{prepend_stmts, private_ident, ExprFactory, IdentRenamer},
        visit::{as_folder, noop_visit_mut_type, Fold, VisitMut, VisitMutWith},
    },
};

pub fn cjs_optimizer(config: Config, unresolved_ctxt: SyntaxContext) -> impl Fold + VisitMut {
    as_folder(Optimizer {
        data: Data::default(),
        config,
        unresolved_ctxt,
    })
}

#[derive(Debug)]
pub struct Config {}

struct Optimizer {
    data: Data,
    config: Config,
    unresolved_ctxt: SyntaxContext,
}

#[derive(Debug, Default)]
struct Data {
    /// List of `require` calls
    ///
    ///  `(identifier): (module_specifier)`
    imports: FxHashMap<Id, Atom>,

    /// `(module_specifier, property): (identifier)`
    replaced: FxHashMap<(Atom, JsWord), Id>,

    extra_stmts: Vec<Stmt>,

    rename_map: FxHashMap<Id, Id>,
}

impl VisitMut for Optimizer {
    noop_visit_mut_type!();

    fn visit_mut_expr(&mut self, e: &mut Expr) {
        e.visit_mut_children_with(self);

        if let Expr::Member(n) = e {
            if let MemberProp::Ident(prop) = &n.prop {
                if let Expr::Ident(obj) = &*n.obj {
                    if let Some(module_specifier) = self.data.imports.get(&obj.to_id()) {
                        let new_id = self
                            .data
                            .replaced
                            .entry((module_specifier.clone(), prop.sym.clone()))
                            .or_insert_with(|| private_ident!(prop.sym.clone()).to_id())
                            .clone();

                        // TODO: Adjust module specifier
                        let var = VarDeclarator {
                            span: DUMMY_SP,
                            name: Pat::Ident(new_id.clone().into()),
                            init: Some(Box::new(Expr::Call(CallExpr {
                                span: DUMMY_SP,
                                callee: Ident::new(
                                    "require".into(),
                                    DUMMY_SP.with_ctxt(self.unresolved_ctxt),
                                )
                                .as_callee(),
                                args: vec![
                                    Expr::Lit(Lit::Str(module_specifier.clone().into())).as_arg()
                                ],
                                type_args: None,
                            }))),
                            definite: false,
                        };

                        self.data
                            .extra_stmts
                            .push(Stmt::Decl(Decl::Var(Box::new(VarDecl {
                                span: DUMMY_SP,
                                kind: VarDeclKind::Const,
                                declare: false,
                                decls: vec![var],
                            }))));

                        *e = Expr::Ident(new_id.into());
                    }
                }
            }
        }
    }

    fn visit_mut_var_declarator(&mut self, n: &mut VarDeclarator) {
        n.visit_mut_children_with(self);

        // Find `require('foo')`
        if let Some(Expr::Call(CallExpr {
            callee: Callee::Expr(callee),
            args,
            ..
        })) = n.init.as_deref()
        {
            if let Expr::Ident(ident) = &**callee {
                if ident.span.ctxt == self.unresolved_ctxt && ident.sym == *"require" {
                    if let Some(arg) = args.get(0) {
                        if let Expr::Lit(Lit::Str(v)) = &*arg.expr {
                            // TODO: Config

                            if let Pat::Ident(name) = &n.name {
                                self.data
                                    .imports
                                    .insert(name.to_id(), v.value.clone().into());
                            }
                        }
                    }
                }
            }
        }
    }

    fn visit_mut_module(&mut self, n: &mut Module) {
        n.visit_mut_children_with(self);

        prepend_stmts(
            &mut n.body,
            self.data.extra_stmts.drain(..).map(ModuleItem::Stmt),
        );

        n.visit_mut_children_with(&mut IdentRenamer::new(&self.data.rename_map));
    }

    fn visit_mut_script(&mut self, n: &mut Script) {
        n.visit_mut_children_with(self);

        prepend_stmts(&mut n.body, self.data.extra_stmts.drain(..));

        n.visit_mut_children_with(&mut IdentRenamer::new(&self.data.rename_map));
    }
}
