use turbopack_binding::swc::core::ecma::{
    ast::*,
    visit::{Visit, VisitWith},
};

pub fn contains_cjs(m: &Module) -> bool {
    let mut v = CjsFinder::default();
    m.visit_with(&mut v);
    v.found && !v.is_esm
}

#[derive(Copy, Clone, Default)]
struct CjsFinder {
    found: bool,
    is_esm: bool,
}

impl CjsFinder {
    /// If the given pattern contains `module` as a parameter, we don't need to
    /// recurse into it because `module` is shadowed.
    fn contains_module_param<'a, I>(&self, mut iter: I) -> bool
    where
        I: Iterator<Item = &'a Pat>,
    {
        iter.any(|p| {
            if let Pat::Ident(i) = p {
                &*i.id.sym == "module"
            } else {
                false
            }
        })
    }
}

/// This visitor implementation supports typescript, because the api of `swc`
/// does not support changing configuration based on content of the file.
impl Visit for CjsFinder {
    fn visit_arrow_expr(&mut self, n: &ArrowExpr) {
        if self.contains_module_param(n.params.iter()) {
            return;
        }

        n.visit_children_with(self);
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

    fn visit_class_method(&mut self, n: &ClassMethod) {
        if self.contains_module_param(n.function.params.iter().map(|v| &v.pat)) {
            return;
        }

        n.visit_children_with(self);
    }

    fn visit_function(&mut self, n: &Function) {
        if self.contains_module_param(n.params.iter().map(|v| &v.pat)) {
            return;
        }

        n.visit_children_with(self);
    }

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

    fn visit_method_prop(&mut self, n: &MethodProp) {
        if self.contains_module_param(n.function.params.iter().map(|v| &v.pat)) {
            return;
        }

        n.visit_children_with(self);
    }

    fn visit_module_decl(&mut self, n: &ModuleDecl) {
        match n {
            ModuleDecl::Import(_) => {}
            _ => {
                self.is_esm = true;
            }
        }
    }
}
