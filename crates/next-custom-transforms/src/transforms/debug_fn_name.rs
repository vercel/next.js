use std::fmt::Write;

use swc_core::{
    atoms::Atom,
    common::{util::take::Take, DUMMY_SP},
    ecma::{
        ast::{
            CallExpr, Callee, ExportDefaultDecl, ExportDefaultExpr, Expr, FnDecl, FnExpr,
            KeyValueProp, MemberProp, ObjectLit, Pass, PropOrSpread, VarDeclarator,
        },
        utils::ExprFactory,
        visit::{visit_mut_pass, VisitMut, VisitMutWith},
    },
};

pub fn debug_fn_name() -> impl VisitMut + Pass {
    visit_mut_pass(DebugFnName::default())
}

#[derive(Default)]
struct DebugFnName {
    path: String,
    in_target: bool,
    in_var_target: bool,
    in_default_export: bool,
}

impl VisitMut for DebugFnName {
    fn visit_mut_call_expr(&mut self, n: &mut CallExpr) {
        if self.in_var_target || (self.path.is_empty() && !self.in_default_export) {
            n.visit_mut_children_with(self);
            return;
        }

        if let Some(target) = is_target_callee(&n.callee) {
            let old_in_target = self.in_target;
            self.in_target = true;
            let orig_len = self.path.len();
            if !self.path.is_empty() {
                self.path.push('.');
            }
            self.path.push_str(&target);

            n.visit_mut_children_with(self);

            self.path.truncate(orig_len);
            self.in_target = old_in_target;
        } else {
            n.visit_mut_children_with(self);
        }
    }

    fn visit_mut_export_default_expr(&mut self, n: &mut ExportDefaultExpr) {
        let old_in_default_export = self.in_default_export;
        self.in_default_export = true;

        n.visit_mut_children_with(self);

        self.in_default_export = old_in_default_export;
    }

    fn visit_mut_export_default_decl(&mut self, n: &mut ExportDefaultDecl) {
        let old_in_default_export = self.in_default_export;
        self.in_default_export = true;

        n.visit_mut_children_with(self);

        self.in_default_export = old_in_default_export;
    }

    fn visit_mut_expr(&mut self, n: &mut Expr) {
        n.visit_mut_children_with(self);

        if self.in_target {
            match n {
                Expr::Arrow(..) | Expr::Fn(FnExpr { ident: None, .. }) => {
                    //   useLayoutEffect(() => ...);
                    //
                    // becomes
                    //
                    //
                    //  useLayoutEffect({'MyComponent.useLayoutEffect': () =>
                    // ...}['MyComponent.useLayoutEffect']);

                    let orig = n.take();
                    let key = Atom::from(&*self.path);

                    *n = Expr::Object(ObjectLit {
                        span: DUMMY_SP,
                        props: vec![PropOrSpread::Prop(Box::new(
                            swc_core::ecma::ast::Prop::KeyValue(KeyValueProp {
                                key: swc_core::ecma::ast::PropName::Str(key.clone().into()),
                                value: Box::new(orig),
                            }),
                        ))],
                    })
                    .computed_member(key)
                    .into();
                }

                _ => {}
            }
        }
    }

    fn visit_mut_fn_decl(&mut self, n: &mut FnDecl) {
        let orig_len = self.path.len();
        if !self.path.is_empty() {
            self.path.push('.');
        }
        self.path.push_str(n.ident.sym.as_str());

        n.visit_mut_children_with(self);

        self.path.truncate(orig_len);
    }

    fn visit_mut_fn_expr(&mut self, n: &mut FnExpr) {
        if let Some(ident) = &n.ident {
            let orig_len = self.path.len();
            if !self.path.is_empty() {
                self.path.push('.');
            }
            self.path.push_str(ident.sym.as_str());

            n.visit_mut_children_with(self);

            self.path.truncate(orig_len);
            return;
        }

        n.visit_mut_children_with(self);
    }

    fn visit_mut_var_declarator(&mut self, n: &mut VarDeclarator) {
        if let Some(Expr::Call(call)) = n.init.as_deref() {
            let name = is_target_callee(&call.callee).and_then(|target| {
                let name = n.name.as_ident()?;

                Some((name.sym.clone(), target))
            });

            if let Some((name, target)) = name {
                let old_in_var_target = self.in_var_target;
                self.in_var_target = true;

                let old_in_target = self.in_target;
                self.in_target = true;
                let orig_len = self.path.len();
                if !self.path.is_empty() {
                    self.path.push('.');
                }
                let _ = write!(self.path, "{target}[{name}]");

                n.visit_mut_children_with(self);

                self.path.truncate(orig_len);
                self.in_target = old_in_target;
                self.in_var_target = old_in_var_target;
                return;
            }
        }

        if let Some(Expr::Arrow(..) | Expr::Fn(FnExpr { ident: None, .. }) | Expr::Call(..)) =
            n.init.as_deref()
        {
            let name = n.name.as_ident();

            if let Some(name) = name {
                let orig_len = self.path.len();
                if !self.path.is_empty() {
                    self.path.push('.');
                }
                self.path.push_str(name.sym.as_str());

                n.visit_mut_children_with(self);

                self.path.truncate(orig_len);
                return;
            }
        }

        n.visit_mut_children_with(self);
    }
}

fn is_target_callee(e: &Callee) -> Option<Atom> {
    match e {
        Callee::Expr(e) => match &**e {
            Expr::Ident(i) => {
                if i.sym.starts_with("use") {
                    Some(i.sym.clone())
                } else {
                    None
                }
            }
            Expr::Member(me) => match &me.prop {
                MemberProp::Ident(i) => {
                    if i.sym.starts_with("use") {
                        Some(i.sym.clone())
                    } else {
                        None
                    }
                }
                _ => None,
            },
            _ => None,
        },
        _ => None,
    }
}
