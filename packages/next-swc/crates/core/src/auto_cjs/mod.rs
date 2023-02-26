use next_binding::swc::core::{
    ecma::ast::*,
    ecma::visit::{Visit, VisitWith},
};

pub(crate) fn contains_cjs(m: &Module) -> bool {
    let mut v = CjsFinder::default();
    m.visit_with(&mut v);
    v.found
}

#[derive(Copy, Clone, Default)]
struct CjsFinder {
    found: bool,
}

/// This visitor implementation supports typescript, because the api of `swc`
/// does not support changing configuration based on content of the file.
impl Visit for CjsFinder {
    fn visit_member_expr(&mut self, e: &MemberExpr) {
        if let Expr::Ident(obj) = &*e.obj {
            if let MemberProp::Ident(prop) = &e.prop {
                // Detect `module.exports` and `exports.__esModule`
                if &*obj.sym == "module" && &*prop.sym == "exports" {
                    self.found = true;
                    return;
                } else if &*obj.sym == "exports" && &*prop.sym == "__esModule" {
                    self.found = true;
                    return;
                }
            }
        }

        e.obj.visit_with(self);
        e.prop.visit_with(self);
    }

    // Detect `Object.defineProperty(exports, "__esModule", ...)`
    // Note that `Object.defineProperty(module.exports, ...)` will be handled by
    // `visit_member_expr`.
    fn visit_call_expr(&mut self, e: &CallExpr) {
        if let Callee::Expr(expr) = &e.callee {
            if let Expr::Member(member_expr) = &**expr {
                if let (Expr::Ident(obj), MemberProp::Ident(prop)) =
                    (&*member_expr.obj, &member_expr.prop)
                {
                    if &*obj.sym == "Object" && &*prop.sym == "defineProperty" {
                        if let Expr::Ident(arg1) = &*e.args[0].expr {
                            if &*arg1.sym == "exports" {
                                if let Expr::Lit(Lit::Str(arg2)) = &*e.args[1].expr {
                                    if &*arg2.value == "__esModule" {
                                        self.found = true;
                                        return;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        e.callee.visit_with(self);
    }
}
