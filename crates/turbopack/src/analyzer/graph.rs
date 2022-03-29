use std::{collections::HashMap, iter};

use swc_atoms::js_word;
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

impl Effect {
    pub fn normalize(&mut self) {
        match self {
            Effect::Call {
                func,
                this,
                args,
                span,
            } => {
                func.normalize();
                this.normalize();
                for arg in args.iter_mut() {
                    arg.normalize();
                }
            }
        }
    }
}

#[derive(Debug)]
pub struct VarGraph {
    pub(crate) values: HashMap<Id, JsValue>,

    pub effects: Vec<Effect>,
}

impl VarGraph {
    pub fn normalize(&mut self) {
        for value in self.values.values_mut() {
            value.normalize();
        }
        for effect in self.effects.iter_mut() {
            effect.normalize();
        }
    }
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
        current_value: None,
    });

    graph.normalize();

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
                        None => return JsValue::Unknown(None, ""),
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
                    match &*i.sym {
                        "require" => return JsValue::FreeVar(FreeVarKind::Require),
                        "__dirname" => return JsValue::FreeVar(FreeVarKind::Dirname),
                        _ => JsValue::FreeVar(FreeVarKind::Other(i.sym.clone())),
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
                    (JsValue::Add(l), r) => {
                        JsValue::Add(l.into_iter().chain(iter::once(r)).collect())
                    }
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
                } else {
                    return JsValue::Unknown(None, "tagged template literal is not supported yet");
                }
            }

            Expr::Fn(..) | Expr::Arrow(..) => {
                return JsValue::Unknown(None, "function expressions are not yet supported")
            }
            Expr::New(..) => return JsValue::Unknown(None, "new expression are not supported"),

            Expr::Seq(e) => {
                if let Some(e) = e.exprs.last() {
                    return self.eval(e);
                } else {
                    unreachable!()
                }
            }

            Expr::Member(MemberExpr {
                obj,
                prop: MemberProp::Ident(prop),
                ..
            }) => {
                let obj = self.eval(&obj);
                return JsValue::Member(
                    box obj,
                    box JsValue::Constant(Lit::Str(prop.sym.clone().into())),
                );
            }

            Expr::Member(MemberExpr {
                obj,
                prop: MemberProp::Computed(computed),
                ..
            }) => {
                let obj = self.eval(&obj);
                let prop = self.eval(&computed.expr);
                return JsValue::Member(box obj, box prop);
            }

            Expr::Call(CallExpr {
                callee: Callee::Expr(callee),
                args,
                ..
            }) => {
                // We currently do not handle spreads.
                if args.iter().any(|arg| arg.spread.is_some()) {
                    return JsValue::Unknown(None, "spread in function calls is not supported");
                }
                let args = args.iter().map(|arg| self.eval(&arg.expr)).collect();

                let callee = box self.eval(&callee);

                return JsValue::Call(callee, args);
            }

            Expr::Call(CallExpr {
                callee: Callee::Import(_),
                args,
                ..
            }) => {
                // We currently do not handle spreads.
                if args.iter().any(|arg| arg.spread.is_some()) {
                    return JsValue::Unknown(None, "spread in import() is not supported");
                }
                let args = args.iter().map(|arg| self.eval(&arg.expr)).collect();

                let callee = box JsValue::FreeVar(FreeVarKind::Import);

                return JsValue::Call(callee, args);
            }

            Expr::Array(arr) => {
                if arr.elems.iter().flatten().any(|v| v.spread.is_some()) {
                    return JsValue::Unknown(None, "spread is not supported");
                }

                let arr = arr
                    .elems
                    .iter()
                    .map(|e| match e {
                        Some(e) => self.eval(&e.expr),
                        _ => JsValue::FreeVar(FreeVarKind::Other(js_word!("undefined"))),
                    })
                    .collect();
                return JsValue::Array(arr);
            }

            _ => JsValue::Unknown(None, "unsupported expression"),
        }
    }
}

struct Analyzer<'a> {
    data: &'a mut VarGraph,

    eval_context: &'a EvalContext,

    var_decl_kind: Option<VarDeclKind>,

    current_value: Option<JsValue>,
}

impl Analyzer<'_> {
    fn add_value(&mut self, id: Id, value: JsValue) {
        if let Some(prev) = self.data.values.get_mut(&id) {
            prev.add_alt(value);
        } else {
            self.data.values.insert(id, value);
        }
        // TODO(kdy1): We may need to report an error for this.
        // Variables declared with `var` are hoisted, but using undefined as its
        // value does not seem like a good idea.
    }

    fn add_value_from_expr(&mut self, id: Id, value: &Expr) {
        let value = self.eval_context.eval(value);

        self.add_value(id, value);
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
                Expr::Fn(FnExpr {
                    function:
                        Function {
                            body,
                            decorators,
                            is_async: _,
                            is_generator: _,
                            params,
                            return_type,
                            span: _,
                            type_params,
                        },
                    ident,
                }) => {
                    let mut iter = n.args.iter();
                    for param in params {
                        if let Some(arg) = iter.next() {
                            self.current_value = Some(self.eval_context.eval(&arg.expr));
                            self.visit_param(param);
                            self.current_value = None;
                        } else {
                            self.visit_param(param);
                        }
                    }
                    if let Some(ident) = ident {
                        self.visit_ident(ident);
                    }

                    self.visit_opt_block_stmt(body.as_ref());
                    self.visit_decorators(decorators);
                    self.visit_opt_ts_type_ann(return_type.as_ref());
                    self.visit_opt_ts_type_param_decl(type_params.as_ref());
                    self.visit_expr_or_spreads(&n.args);
                    true
                }
                Expr::Arrow(ArrowExpr {
                    params,
                    body,
                    is_async: _,
                    is_generator: _,
                    return_type,
                    span: _,
                    type_params,
                }) => {
                    let mut iter = n.args.iter();
                    for param in params {
                        if let Some(arg) = iter.next() {
                            self.current_value = Some(self.eval_context.eval(&arg.expr));
                            self.visit_pat(param);
                            self.current_value = None;
                        } else {
                            self.visit_pat(param);
                        }
                    }
                    self.visit_block_stmt_or_expr(body);
                    self.visit_opt_ts_type_ann(return_type.as_ref());
                    self.visit_opt_ts_type_param_decl(type_params.as_ref());
                    self.visit_expr_or_spreads(&n.args);
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
            vec![JsValue::Unknown(
                None,
                "spread in calls is not supported yet",
            )]
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
                    this: JsValue::Unknown(None, "this is not analysed yet"),
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
                    this: JsValue::Unknown(None, "this is not analysed yet"),
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
        match &n.left {
            PatOrExpr::Expr(expr) => {
                self.visit_expr(expr);
            }
            PatOrExpr::Pat(pat) => {
                self.current_value = Some(self.eval_context.eval(&n.right));
                self.visit_pat(pat);
                self.current_value = None;
            }
        }
        self.visit_expr(&n.right);
    }

    fn visit_call_expr(&mut self, n: &CallExpr) {
        // special behavior of IIFEs
        if !self.check_iife(n) {
            self.check_call_expr_for_effects(n);
            n.visit_children_with(self);
        }
    }

    fn visit_expr(&mut self, n: &Expr) {
        let old = self.var_decl_kind;
        self.var_decl_kind = None;
        n.visit_children_with(self);
        self.var_decl_kind = old;
    }

    fn visit_param(&mut self, n: &Param) {
        let old = self.var_decl_kind;
        let Param {
            decorators,
            pat,
            span: _,
        } = n;
        self.var_decl_kind = None;
        let value = self.current_value.take();
        self.visit_decorators(decorators);
        self.current_value = value;
        self.visit_pat(pat);
        self.current_value = None;
        self.var_decl_kind = old;
    }

    fn visit_fn_decl(&mut self, decl: &FnDecl) {
        self.add_value_from_expr(
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
            self.add_value_from_expr(ident.to_id(), &Expr::Fn(expr.clone()));
        }
        expr.visit_children_with(self);
    }

    fn visit_class_decl(&mut self, decl: &ClassDecl) {
        self.add_value_from_expr(
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
        if self.var_decl_kind.is_some() {
            if let Some(init) = &n.init {
                self.current_value = Some(self.eval_context.eval(init));
            }
        }
        self.visit_pat(&n.name);
        self.current_value = None;
        if let Some(init) = &n.init {
            self.visit_expr(init);
        }
    }

    fn visit_pat(&mut self, pat: &Pat) {
        let value = self.current_value.take();
        match pat {
            Pat::Ident(i) => {
                self.add_value(
                    i.to_id(),
                    value.unwrap_or_else(|| {
                        JsValue::Unknown(
                            Some(box JsValue::Variable(i.to_id())),
                            "pattern without value",
                        )
                    }),
                );
            }

            Pat::Array(arr) => {
                //

                match &value {
                    Some(JsValue::Array(value)) => {
                        //
                        for (idx, elem) in arr.elems.iter().enumerate() {
                            self.current_value = value.get(idx).cloned();
                            elem.visit_with(self);
                        }

                        // We should not call visit_children_with
                        return;
                    }

                    Some(value) => {
                        for (idx, elem) in arr.elems.iter().enumerate() {
                            self.current_value = Some(JsValue::Member(
                                box value.clone(),
                                box JsValue::Constant(Lit::Num(idx.into())),
                            ));
                            elem.visit_with(self);
                        }
                    }

                    None => {}
                }
            }

            _ => {}
        }
        pat.visit_children_with(self);
    }
}
