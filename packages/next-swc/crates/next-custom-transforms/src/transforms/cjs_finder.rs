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
    ignore_module: bool,
    ignore_exports: bool,
}

impl CjsFinder {
    /// If the given pattern contains `module` as a parameter, we don't need to
    /// recurse into it because `module` is shadowed.
    fn adjust_state<'a, I>(&mut self, iter: I)
    where
        I: Iterator<Item = &'a Pat>,
    {
        iter.for_each(|p| {
            if let Pat::Ident(i) = p {
                if &*i.id.sym == "module" {
                    self.ignore_module = true;
                }
                if &*i.id.sym == "exports" {
                    self.ignore_exports = true;
                }
            }
        })
    }
}

/// This visitor implementation supports typescript, because the api of `swc`
/// does not support changing configuration based on content of the file.
impl Visit for CjsFinder {
    fn visit_arrow_expr(&mut self, n: &ArrowExpr) {
        let old_ignore_module = self.ignore_module;
        let old_ignore_exports = self.ignore_exports;

        self.adjust_state(n.params.iter());

        n.visit_children_with(self);

        self.ignore_module = old_ignore_module;
        self.ignore_exports = old_ignore_exports;
    }

    // Detect `Object.defineProperty(exports, "__esModule", ...)`
    // Note that `Object.defineProperty(module.exports, ...)` will be handled by
    // `visit_member_expr`.
    fn visit_call_expr(&mut self, e: &CallExpr) {
        if !self.ignore_exports {
            if let Callee::Expr(expr) = &e.callee {
                if let Expr::Member(member_expr) = &**expr {
                    if let (Expr::Ident(obj), MemberProp::Ident(prop)) =
                        (&*member_expr.obj, &member_expr.prop)
                    {
                        if &*obj.sym == "Object" && &*prop.sym == "defineProperty" {
                            if let Some(ExprOrSpread { expr: expr0, .. }) = e.args.first() {
                                if let Expr::Ident(arg0) = &**expr0 {
                                    if &*arg0.sym == "exports" {
                                        if let Some(ExprOrSpread { expr: expr1, .. }) =
                                            e.args.get(1)
                                        {
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
        }

        e.callee.visit_with(self);
    }

    fn visit_class_method(&mut self, n: &ClassMethod) {
        let old_ignore_module = self.ignore_module;
        let old_ignore_exports = self.ignore_exports;

        self.adjust_state(n.function.params.iter().map(|v| &v.pat));

        n.visit_children_with(self);

        self.ignore_module = old_ignore_module;
        self.ignore_exports = old_ignore_exports;
    }

    fn visit_function(&mut self, n: &Function) {
        let old_ignore_module = self.ignore_module;
        let old_ignore_exports = self.ignore_exports;

        self.adjust_state(n.params.iter().map(|v| &v.pat));

        n.visit_children_with(self);

        self.ignore_module = old_ignore_module;
        self.ignore_exports = old_ignore_exports;
    }

    fn visit_member_expr(&mut self, e: &MemberExpr) {
        if let Expr::Ident(obj) = &*e.obj {
            if let MemberProp::Ident(prop) = &e.prop {
                // Detect `module.exports` and `exports.__esModule`
                if (!self.ignore_module && &*obj.sym == "module" && &*prop.sym == "exports")
                    || (!self.ignore_exports && &*obj.sym == "exports")
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
        let old_ignore_module = self.ignore_module;
        let old_ignore_exports = self.ignore_exports;

        self.adjust_state(n.function.params.iter().map(|v| &v.pat));

        n.visit_children_with(self);

        self.ignore_module = old_ignore_module;
        self.ignore_exports = old_ignore_exports;
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
