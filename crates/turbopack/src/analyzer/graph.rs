use std::{collections::HashMap, iter};

use swc_common::{collections::AHashSet, Mark, Span, Spanned};
use swc_ecmascript::{
    ast::*,
    utils::{collect_decls, ident::IdentLike},
    visit::{Visit, VisitWith},
};

use crate::analyzer::{is_unresolved, FreeVarKind};

use super::{ImportMap, JsValue};

#[derive(Debug)]
pub enum Effect {
    Call {
        func: JsValue,
        this: JsValue,
        args: Vec<JsValue>,
        span: Span,
    },
}

#[derive(Debug)]
pub struct VarGraph {
    pub(crate) values: HashMap<Id, JsValue>,

    pub effects: Vec<Effect>,
}

/// You should use same [Mark] for this function and
/// [swc_ecma_transforms_base::resolver::resolver_with_mark]
pub fn create_graph(m: &Module, eval_context: &EvalContext) -> VarGraph {
    let mut graph = VarGraph {
        values: Default::default(),
        effects: Default::default(),
    };

    m.visit_with(&mut Analyzer {
        data: &mut graph,
        eval_context,
        var_decl_kind: Default::default(),
    });

    graph
}

pub struct EvalContext {
    bindings: AHashSet<Id>,
    top_level_mark: Mark,
    imports: ImportMap,
}

impl EvalContext {
    pub fn new(module: &Module, top_level_mark: Mark) -> Self {
        Self {
            top_level_mark,
            bindings: collect_decls(module),
            imports: ImportMap::analyze(module),
        }
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

    pub fn eval(&self, e: &Expr) -> JsValue {
        match e {
            Expr::Lit(e @ Lit::Str(..) | e @ Lit::Num(..) | e @ Lit::Bool(..)) => {
                return JsValue::Constant(e.clone())
            }
            Expr::Ident(i) => {
                let id = i.to_id();
                if let Some(imported) = self.imports.get_import(&id) {
                    return imported;
                }
                if is_unresolved(&i, &self.bindings, self.top_level_mark) {
                    if &*i.sym == "require" {
                        return JsValue::FreeVar(FreeVarKind::Require);
                    }

                    // TODO(kdy1): Consider using Arc
                    if &*i.sym == "__dirname" {
                        // This is __dirname injected by node.js
                        return JsValue::FreeVar(FreeVarKind::Dirname);
                    } else {
                        return JsValue::FreeVar(FreeVarKind::Other(i.sym.clone()));
                    }
                } else {
                    return JsValue::Variable(id);
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
                    && is_unresolved(&tag_obj, &self.bindings, self.top_level_mark)
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
                    && is_unresolved(&e_obj_obj, &self.bindings, self.top_level_mark)
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
}

struct Analyzer<'a> {
    data: &'a mut VarGraph,

    eval_context: &'a EvalContext,

    var_decl_kind: Option<VarDeclKind>,
}

impl Analyzer<'_> {
    fn add_value(&mut self, id: Id, value: &Expr) {
        let value = self.eval_context.eval(value);

        if let Some(prev) = self.data.values.get_mut(&id) {
            prev.add_alt(value);
        } else {
            self.data.values.insert(id, value);
        }
        // TODO(kdy1): We may need to report an error for this.
        // Variables declared with `var` are hoisted, but using undefined as its
        // value does not seem like a good idea.
    }

    fn check_iife(&mut self, n: &CallExpr) -> bool {
        fn unparen(expr: &Expr) -> &Expr {
            if let Some(expr) = expr.as_paren() {
                return unparen(&expr.expr);
            }
            expr
        }

        if n.args.iter().any(|arg| arg.spread.is_some()) {
            return false;
        }
        if let Some(expr) = n.callee.as_expr() {
            match unparen(&expr) {
                Expr::Fn(FnExpr { function, .. }) => {
                    let params = &function.params;
                    if !params.iter().all(|param| param.pat.is_ident()) {
                        return false;
                    }
                    let mut iter = params.iter();
                    for (id, arg) in n.args.iter().map_while(|arg| {
                        iter.next()
                            .map(|param| (param.pat.as_ident().unwrap().to_id(), arg))
                    }) {
                        self.add_value(id, &arg.expr);
                    }
                    true
                }
                Expr::Arrow(ArrowExpr { params, .. }) => {
                    if !params.iter().all(|param| param.is_ident()) {
                        return false;
                    }
                    let mut iter = params.iter();
                    for (id, arg) in n.args.iter().map_while(|arg| {
                        iter.next()
                            .map(|param| (param.as_ident().unwrap().to_id(), arg))
                    }) {
                        self.add_value(id, &arg.expr);
                    }
                    true
                }
                _ => false,
            }
        } else {
            false
        }
    }

    fn check_call_expr_for_effects(&mut self, n: &CallExpr) {
        let args = if n.args.iter().any(|arg| arg.spread.is_some()) {
            vec![JsValue::Unknown]
        } else {
            n.args
                .iter()
                .map(|arg| self.eval_context.eval(&arg.expr))
                .collect()
        };
        match &n.callee {
            Callee::Import(_) => {
                self.data.effects.push(Effect::Call {
                    func: JsValue::FreeVar(FreeVarKind::Import),
                    // TODO should be undefined instead
                    this: JsValue::Unknown,
                    args,
                    span: n.span(),
                });
            }
            Callee::Expr(box expr @ Expr::Member(MemberExpr { obj, .. })) => {
                let this_value = self.eval_context.eval(obj);
                let fn_value = self.eval_context.eval(expr);
                self.data.effects.push(Effect::Call {
                    func: fn_value,
                    this: this_value,
                    args,
                    span: n.span(),
                });
            }
            Callee::Expr(box expr) => {
                let fn_value = self.eval_context.eval(expr);
                self.data.effects.push(Effect::Call {
                    func: fn_value,
                    // TODO should be undefined instead
                    this: JsValue::Unknown,
                    args,
                    span: n.span(),
                });
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
        // special behavior of IIFEs
        if !self.check_iife(n) {
            self.check_call_expr_for_effects(n);
        }

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

    fn visit_fn_decl(&mut self, decl: &FnDecl) {
        self.add_value(
            decl.ident.to_id(),
            // TODO avoid clone
            &Expr::Fn(FnExpr {
                ident: Some(decl.ident.clone()),
                function: decl.function.clone(),
            }),
        );
        decl.visit_children_with(self);
    }

    fn visit_fn_expr(&mut self, expr: &FnExpr) {
        if let Some(ident) = &expr.ident {
            // TODO avoid clone
            self.add_value(ident.to_id(), &Expr::Fn(expr.clone()));
        }
        expr.visit_children_with(self);
    }

    fn visit_class_decl(&mut self, decl: &ClassDecl) {
        self.add_value(
            decl.ident.to_id(),
            // TODO avoid clone
            &Expr::Class(ClassExpr {
                ident: Some(decl.ident.clone()),
                class: decl.class.clone(),
            }),
        );
        decl.visit_children_with(self);
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
