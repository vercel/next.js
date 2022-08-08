use swc_ecmascript::{
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
                if &*obj.sym == "module" && &*prop.sym == "exports" {
                    self.found = true;
                    return;
                }
            }
        }

        e.obj.visit_with(self);
        e.prop.visit_with(self);
    }

    fn visit_str(&mut self, s: &Str) {
        if s.value.contains("__esModule") {
            self.found = true;
        }
    }
}
