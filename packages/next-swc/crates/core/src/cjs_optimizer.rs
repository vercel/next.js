use rustc_hash::FxHashMap;
use turbopack_binding::swc::core::{
    common::SyntaxContext,
    ecma::{
        ast::{
            CallExpr, Callee, Expr, Id, Lit, MemberExpr, MemberProp, Module, Pat, Script,
            VarDeclarator,
        },
        atoms::Atom,
        utils::IdentRenamer,
        visit::{
            as_folder, noop_visit_mut_type, noop_visit_type, Fold, Visit, VisitMut, VisitMutWith,
            VisitWith,
        },
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

    rename_map: FxHashMap<Id, Id>,
}

impl VisitMut for Optimizer {
    noop_visit_mut_type!();

    fn visit_mut_member_expr(&mut self, n: &mut MemberExpr) {
        n.visit_mut_children_with(self);

        if let MemberProp::Ident(prop) = &n.prop {
            if let Expr::Ident(obj) = &*n.obj {
                if let Some(module_specifier) = self.data.imports.get(&obj.to_id()) {}
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
        n.visit_mut_children_with(&mut IdentRenamer::new(&self.data.rename_map));
    }

    fn visit_mut_script(&mut self, n: &mut Script) {
        n.visit_mut_children_with(self);
        n.visit_mut_children_with(&mut IdentRenamer::new(&self.data.rename_map));
    }
}
