use swc_core::{
    atoms::Atom,
    common::{util::take::Take, DUMMY_SP},
    ecma::{
        ast::{
            CallExpr, Callee, Expr, FnDecl, FnExpr, KeyValueProp, MemberProp, ObjectLit,
            PropOrSpread,
        },
        utils::ExprFactory,
        visit::{as_folder, Fold, VisitMut, VisitMutWith},
    },
};

pub fn debug_fn_name() -> impl VisitMut + Fold {
    as_folder(DebugFnName::default())
}

#[derive(Default)]
struct DebugFnName {
    path: Vec<String>,
    in_target: bool,
}

impl VisitMut for DebugFnName {
    fn visit_mut_fn_decl(&mut self, n: &mut FnDecl) {
        let orig_len = self.path.len();
        self.path.push(n.ident.sym.to_string());

        n.visit_mut_children_with(self);

        self.path.truncate(orig_len);
    }

    fn visit_mut_call_expr(&mut self, n: &mut CallExpr) {
        if let Some(target) = is_target_callee(&n.callee) {
            let old_in_target = self.in_target;
            self.in_target = true;
            let orig_len = self.path.len();
            self.path.push(target.to_string());

            n.visit_mut_children_with(self);

            self.path.truncate(orig_len);
            self.in_target = old_in_target;
        } else {
            n.visit_mut_children_with(self);
        }
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
                    let key = Atom::from(format!("{}", self.path.join(".")));

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
