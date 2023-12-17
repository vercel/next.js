use turbopack_binding::swc::core::ecma::{
    ast::*,
    visit::{Visit, VisitWith},
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
                if (&*obj.sym == "module" && &*prop.sym == "exports")
                    || (&*obj.sym == "exports" && &*prop.sym == "__esModule")
                {
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
                        if let Some(ExprOrSpread { expr: expr0, .. }) = e.args.first() {
                            if let Expr::Ident(arg0) = &**expr0 {
                                if &*arg0.sym == "exports" {
                                    if let Some(ExprOrSpread { expr: expr1, .. }) = e.args.get(1) {
                                        if let Expr::Lit(Lit::Str(arg1)) = &**expr1 {
                                            if &*arg1.value == "__esModule" {
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
            }
        }

        e.callee.visit_with(self);
    }
}
