use std::{collections::HashMap, iter, sync::Arc};

use swc_atoms::{js_word, JsWord};
use swc_common::{collections::AHashSet, Mark, DUMMY_SP};
use swc_ecmascript::{
    ast::*,
    utils::ident::IdentLike,
    visit::{Visit, VisitWith},
};

use crate::analyzer::{is_unresolved, FreeVarKind};

use super::{ImportMap, JsValue};

#[derive(Debug)]
pub struct VarGraph {
    top_level_mark: Mark,
    pub(crate) values: HashMap<Id, JsValue>,
    imports: ImportMap,

    deps_except_esm: Vec<JsValue>,
}

#[derive(Default)]
pub struct ModuleInfo {
    pub(crate) all_bindings: Arc<AHashSet<Id>>,
}

/// You should use same [Mark] for this function and
/// [swc_ecma_transforms_base::resolver::resolver_with_mark]
pub fn create_graph(m: &Module, top_level_mark: Mark, module_info: &ModuleInfo) -> VarGraph {
    let mut graph = VarGraph {
        top_level_mark,
        values: Default::default(),
        imports: ImportMap::analyze(m),
        deps_except_esm: Default::default(),
    };

    m.visit_with(&mut Analyzer {
        data: &mut graph,
        module_info,
        var_decl_kind: Default::default(),
    });

    graph
}

pub(crate) fn expr_to_js_value(e: &Expr) -> JsValue {
    // TODO Implement helper to convert an expr to a JsValue without any context info
    JsValue::Constant(Lit::Str(Str {
        span: DUMMY_SP,
        value: js_word!(""),
        has_escape: Default::default(),
        kind: Default::default(),
    }))
}

struct Analyzer<'a> {
    data: &'a mut VarGraph,

    module_info: &'a ModuleInfo,

    var_decl_kind: Option<VarDeclKind>,
}

impl Analyzer<'_> {
    fn is_unresolved(&self, id: &Ident) -> bool {
        is_unresolved(id, &self.module_info.all_bindings, self.data.top_level_mark)
    }

    fn eval_tpl(&self, e: &Tpl, raw: bool) -> JsValue {
        debug_assert!(e.quasis.len() == e.exprs.len() + 1);

        let mut values = vec![];

        for idx in 0..(e.quasis.len() + e.exprs.len()) {
            if idx % 2 == 0 {
                let idx = idx / 2;
                let e = &e.quasis[idx];

                if raw {
                    values.push(JsValue::from(e.raw.clone()));
                } else {
                    match &e.cooked {
                        Some(v) => {
                            values.push(JsValue::from(v.clone()));
                        }
                        // This is actually unreachable
                        None => return JsValue::Unknown,
                    }
                }
            } else {
                let idx = idx / 2;
                let e = &e.exprs[idx];

                values.push(self.eval(&e));
            }
        }

        if values.len() == 1 {
            return values.into_iter().next().unwrap();
        }

        return JsValue::Concat(values);
    }

    fn eval(&self, e: &Expr) -> JsValue {
        match e {
            Expr::Lit(e @ Lit::Str(..) | e @ Lit::Num(..) | e @ Lit::Bool(..)) => {
                return JsValue::Constant(e.clone())
            }
            Expr::Ident(i) => {
                if self.is_require(i) {
                    return JsValue::FreeVar(FreeVarKind::Require);
                }

                // TODO(kdy1): Consider using Arc
                if &*i.sym == "__dirname" && self.is_unresolved(&i) {
                    // This is __dirname injected by node.js
                    return JsValue::FreeVar(FreeVarKind::Dirname);
                } else {
                    return JsValue::Variable(i.to_id());
                }
            }

            Expr::Bin(BinExpr {
                op: op!(bin, "+"),
                left,
                right,
                ..
            }) => {
                let l = self.eval(left);
                let r = self.eval(right);

                return match (l, r) {
                    (JsValue::Unknown, JsValue::Unknown) => JsValue::Unknown,
                    (JsValue::Add(l), JsValue::Add(r)) => {
                        JsValue::Add(l.into_iter().chain(r).collect())
                    }
                    (JsValue::Add(l), r) => {
                        JsValue::Add(l.into_iter().chain(iter::once(r)).collect())
                    }
                    (l, JsValue::Add(r)) => JsValue::Add(iter::once(l).chain(r).collect()),
                    (l, r) => JsValue::Add(vec![l, r]),
                };
            }

            Expr::Tpl(e) => return self.eval_tpl(e, false),

            Expr::TaggedTpl(TaggedTpl {
                tag:
                    box Expr::Member(MemberExpr {
                        obj: box Expr::Ident(tag_obj),
                        prop: MemberProp::Ident(tag_prop),
                        ..
                    }),
                tpl,
                ..
            }) => {
                if &*tag_obj.sym == "String"
                    && &*tag_prop.sym == "raw"
                    && self.is_unresolved(&tag_obj)
                {
                    return self.eval_tpl(tpl, true);
                }
            }

            Expr::Fn(..) | Expr::Arrow(..) | Expr::New(..) => return JsValue::Unknown,

            Expr::Seq(e) => {
                if let Some(e) = e.exprs.last() {
                    return self.eval(e);
                }
            }

            Expr::Member(MemberExpr {
                obj:
                    box Expr::Member(MemberExpr {
                        obj: box Expr::Ident(e_obj_obj),
                        prop: MemberProp::Ident(e_obj_prop),
                        ..
                    }),
                prop,
                ..
            }) => {
                if &*e_obj_obj.sym == "process"
                    && self.is_unresolved(&e_obj_obj)
                    && &*e_obj_prop.sym == "env"
                {
                    // TODO: Handle process.env['NODE_ENV']
                    match prop {
                        MemberProp::Ident(p) => {
                            return JsValue::FreeVar(FreeVarKind::ProcessEnv(p.sym.clone()));
                        }
                        _ => {}
                    }
                }
            }

            _ => {}
        }

        match e {
            Expr::Member(MemberExpr {
                obj,
                prop: MemberProp::Ident(prop),
                ..
            }) => {
                let obj = self.eval(&obj);
                return JsValue::Member(box obj, prop.sym.clone());
            }

            _ => {}
        }

        // Evaluate path.join()
        match e {
            Expr::Call(CallExpr {
                callee: Callee::Expr(callee),
                args,
                ..
            }) => {
                // We currently do not handle spreads.
                if args.iter().any(|arg| arg.spread.is_some()) {
                    return JsValue::Unknown;
                }
                let args = args.iter().map(|arg| self.eval(&arg.expr)).collect();

                let callee = box self.eval(&callee);

                return JsValue::Call(callee, args);
            }

            _ => {}
        }

        JsValue::Unknown
    }

    fn add_value(&mut self, id: Id, value: &Expr) {
        let value = self.eval(value);

        if let Some(prev) = self.data.values.get_mut(&id) {
            prev.add_alt(value);
        } else {
            self.data.values.insert(id, value);
        }
        // TODO(kdy1): We may need to report an error for this.
        // Variables declared with `var` are hoisted, but using undefined as its
        // value does not seem like a good idea.
    }

    /// Before visiting children, we check for `require` in arguments to iife.
    /// We then register a corresponding parameter as an alias of `require`.
    ///
    /// To be correct, this is not enough because the parameter can escape
    /// from a function, but we don't have a good way to detect this without
    /// looping. And more importantly, this is enough I think.
    fn add_require_alias_for_iife(&mut self, n: &CallExpr) {
        if n.args.iter().any(|a| a.spread.is_some()) {
            return;
        }

        match &n.callee {
            Callee::Expr(box Expr::Fn(f)) => {
                for (idx, arg) in n.args.iter().enumerate() {
                    if let Some(arg) = arg.expr.as_ident() {
                        if &*arg.sym == "require" && self.is_unresolved(&arg) {
                            if let Some(Param {
                                pat: Pat::Ident(param),
                                ..
                            }) = f.function.params.get(idx)
                            {
                                self.data.imports.add_require_alias(param.to_id());
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    fn is_require(&self, i: &Ident) -> bool {
        if &*i.sym == "require" && self.is_unresolved(i) {
            return true;
        }
        self.data.imports.aliases_of_require.contains(&i.to_id())
    }

    /// Checks for dynamic imports and `require` calls, including alias.
    fn check_call_expr_for_imports(&mut self, n: &CallExpr) {
        match &n.callee {
            Callee::Import(i) => {
                if let Some(first) = n.args.first() {
                    let v = self.eval(&first.expr);
                    self.data.deps_except_esm.push(v);
                }
            }
            Callee::Expr(box Expr::Ident(i)) => {
                // This is enough for checking aliased require calls.
                if self.is_require(i) {
                    if let Some(first) = n.args.first() {
                        let v = self.eval(&first.expr);
                        self.data.deps_except_esm.push(v);
                    }
                }
            }
            _ => {}
        }
    }
}

impl Visit for Analyzer<'_> {
    fn visit_assign_expr(&mut self, n: &AssignExpr) {
        n.visit_children_with(self);

        if let Some(left) = n.left.as_ident() {
            self.add_value(left.to_id(), &n.right);
        }
    }

    fn visit_call_expr(&mut self, n: &CallExpr) {
        self.add_require_alias_for_iife(n);

        self.check_call_expr_for_imports(n);

        n.visit_children_with(self);
    }

    fn visit_expr(&mut self, n: &Expr) {
        let old = self.var_decl_kind;
        self.var_decl_kind = None;
        n.visit_children_with(self);
        self.var_decl_kind = old;
    }

    fn visit_param(&mut self, n: &Param) {
        let old = self.var_decl_kind;
        self.var_decl_kind = None;
        n.visit_children_with(self);
        self.var_decl_kind = old;
    }

    fn visit_var_decl(&mut self, n: &VarDecl) {
        let old = self.var_decl_kind;
        self.var_decl_kind = Some(n.kind);
        n.visit_children_with(self);
        self.var_decl_kind = old;
    }

    fn visit_var_declarator(&mut self, n: &VarDeclarator) {
        n.visit_children_with(self);

        if self.var_decl_kind.is_some() {
            if let Some(init) = &n.init {
                match &n.name {
                    Pat::Ident(i) => {
                        self.add_value(i.to_id(), init);
                    }
                    _ => {}
                }
            }
        }
    }
}
