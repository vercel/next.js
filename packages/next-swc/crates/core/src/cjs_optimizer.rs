use rustc_hash::FxHashMap;
use turbopack_binding::swc::core::{
    common::SyntaxContext,
    ecma::{
        ast::{CallExpr, Callee, Expr, Id, Lit, Module, Pat, Script, VarDeclarator},
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

struct Analyzer<'a> {
    data: &'a mut Data,
    config: &'a Config,
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

    fn visit_mut_module(&mut self, n: &mut Module) {
        n.visit_with(&mut Analyzer {
            data: &mut self.data,
            config: &self.config,
            unresolved_ctxt: self.unresolved_ctxt,
        });

        n.visit_mut_children_with(&mut IdentRenamer::new(&self.data.rename_map));
    }

    fn visit_mut_script(&mut self, n: &mut Script) {
        n.visit_with(&mut Analyzer {
            data: &mut self.data,
            config: &self.config,
            unresolved_ctxt: self.unresolved_ctxt,
        });

        n.visit_mut_children_with(&mut IdentRenamer::new(&self.data.rename_map));
    }
}

impl Visit for Analyzer<'_> {
    noop_visit_type!();

    fn visit_var_declarator(&mut self, n: &VarDeclarator) {
        n.visit_children_with(self);

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
}
