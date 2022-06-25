use std::{collections::HashMap, iter, mem::replace, sync::Arc};

use swc_atoms::js_word;
use swc_common::{Mark, Span, Spanned, SyntaxContext};
use swc_ecmascript::{
    ast::*,
    utils::ident::IdentLike,
    visit::{Visit, VisitWith},
};

use crate::{
    analyzer::{is_unresolved, FreeVarKind},
    utils::unparen,
};

use super::{ConstantNumber, ConstantValue, ImportMap, JsValue, ObjectPart};

#[derive(Debug, Clone)]
pub enum Effect {
    Call {
        func: JsValue,
        args: Vec<JsValue>,
        span: Span,
    },
    MemberCall {
        obj: JsValue,
        prop: JsValue,
        args: Vec<JsValue>,
        span: Span,
    },
}

impl Effect {
    pub fn normalize(&mut self) {
        match self {
            Effect::Call {
                func,
                args,
                span: _,
            } => {
                func.normalize();
                for arg in args.iter_mut() {
                    arg.normalize();
                }
            }
            Effect::MemberCall {
                obj,
                prop,
                args,
                span: _,
            } => {
                obj.normalize();
                prop.normalize();
                for arg in args.iter_mut() {
                    arg.normalize();
                }
            }
        }
    }
}

#[derive(Debug)]
pub struct VarGraph {
    pub values: HashMap<Id, JsValue>,

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
pub fn create_graph(m: &Program, eval_context: &EvalContext) -> VarGraph {
    let mut graph = VarGraph {
        values: Default::default(),
        effects: Default::default(),
    };

    m.visit_with(&mut Analyzer {
        data: &mut graph,
        eval_context,
        var_decl_kind: Default::default(),
        current_value: Default::default(),
        cur_fn_return_values: Default::default(),
    });

    graph.normalize();

    graph
}

pub struct EvalContext {
    unresolved_mark: Mark,
    imports: ImportMap,
}

impl EvalContext {
    pub fn new(module: &Program, unresolved_mark: Mark) -> Self {
        Self {
            unresolved_mark,
            imports: ImportMap::analyze(module),
        }
    }

    fn eval_prop_name(&self, prop: &PropName) -> JsValue {
        match prop {
            PropName::Ident(ident) => ident.sym.clone().into(),
            PropName::Str(str) => str.value.clone().into(),
            PropName::Num(num) => num.value.clone().into(),
            PropName::Computed(ComputedPropName { expr, .. }) => self.eval(expr),
            PropName::BigInt(bigint) => bigint.value.clone().into(),
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

        return JsValue::concat(values);
    }

    pub fn eval(&self, e: &Expr) -> JsValue {
        match e {
            Expr::Lit(e) => return JsValue::Constant(e.clone().into()),
            Expr::Ident(i) => {
                let id = i.to_id();
                if let Some(imported) = self.imports.get_import(&id) {
                    return imported;
                }
                if is_unresolved(&i, self.unresolved_mark) {
                    match &*i.sym {
                        "require" => return JsValue::FreeVar(FreeVarKind::Require),
                        "__dirname" => return JsValue::FreeVar(FreeVarKind::Dirname),
                        "__filename" => return JsValue::FreeVar(FreeVarKind::Filename),
                        "process" => return JsValue::FreeVar(FreeVarKind::NodeProcess),
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
                    (JsValue::Add(c, l), r) => JsValue::Add(
                        c + r.total_nodes(),
                        l.into_iter().chain(iter::once(r)).collect(),
                    ),
                    (l, r) => JsValue::add(vec![l, r]),
                };
            }

            Expr::Bin(BinExpr {
                op: op!("||") | op!("??"),
                left,
                right,
                ..
            }) => JsValue::Alternatives(2, vec![self.eval(left), self.eval(right)]),

            &Expr::Cond(CondExpr {
                box ref cons,
                box ref alt,
                ..
            }) => JsValue::Alternatives(2, vec![self.eval(cons), self.eval(alt)]),

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
                    && is_unresolved(&tag_obj, self.unresolved_mark)
                {
                    return self.eval_tpl(tpl, true);
                } else {
                    return JsValue::Unknown(None, "tagged template literal is not supported yet");
                }
            }

            Expr::Fn(expr) => {
                if let Some(ident) = &expr.ident {
                    return JsValue::Variable(ident.to_id());
                } else {
                    return JsValue::Variable((
                        format!("*anonymous function {}*", expr.function.span.lo.0).into(),
                        SyntaxContext::empty(),
                    ));
                }
            }
            Expr::Arrow(expr) => {
                return JsValue::Variable((
                    format!("*arrow function {}*", expr.span.lo.0).into(),
                    SyntaxContext::empty(),
                ));
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
                return JsValue::member(box obj, box prop.sym.clone().into());
            }

            Expr::Member(MemberExpr {
                obj,
                prop: MemberProp::Computed(computed),
                ..
            }) => {
                let obj = self.eval(&obj);
                let prop = self.eval(&computed.expr);
                return JsValue::member(box obj, box prop);
            }

            Expr::Call(CallExpr {
                callee: Callee::Expr(box callee),
                args,
                ..
            }) => {
                // We currently do not handle spreads.
                if args.iter().any(|arg| arg.spread.is_some()) {
                    return JsValue::Unknown(None, "spread in function calls is not supported");
                }
                let args = args.iter().map(|arg| self.eval(&arg.expr)).collect();
                if let Expr::Member(MemberExpr { obj, prop, .. }) = unparen(callee) {
                    let obj = box self.eval(&obj);
                    let prop = box match prop {
                        // TODO avoid clone
                        MemberProp::Ident(i) => i.sym.clone().into(),
                        MemberProp::PrivateName(_) => {
                            return JsValue::Unknown(
                                None,
                                "private names in function calls is not supported",
                            );
                        }
                        MemberProp::Computed(ComputedPropName { expr, .. }) => self.eval(&expr),
                    };
                    return JsValue::member_call(obj, prop, args);
                } else {
                    let callee = box self.eval(&callee);

                    return JsValue::call(callee, args);
                }
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

                return JsValue::call(callee, args);
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
                return JsValue::array(arr);
            }

            Expr::Object(obj) => {
                return JsValue::object(
                    obj.props
                        .iter()
                        .map(|prop| match prop {
                            PropOrSpread::Spread(SpreadElement { expr, .. }) => {
                                ObjectPart::Spread(self.eval(expr))
                            }
                            PropOrSpread::Prop(box Prop::KeyValue(KeyValueProp {
                                key,
                                box value,
                            })) => ObjectPart::KeyValue(self.eval_prop_name(key), self.eval(value)),
                            PropOrSpread::Prop(box Prop::Shorthand(ident)) => ObjectPart::KeyValue(
                                ident.sym.clone().into(),
                                self.eval(&Expr::Ident(ident.clone())),
                            ),
                            _ => ObjectPart::Spread(JsValue::Unknown(
                                None,
                                "unsupported object part",
                            )),
                        })
                        .collect(),
                )
            }

            _ => JsValue::Unknown(None, "unsupported expression"),
        }
    }
}

struct Analyzer<'a> {
    data: &'a mut VarGraph,

    eval_context: &'a EvalContext,

    var_decl_kind: Option<VarDeclKind>,

    /// Used for patterns
    current_value: Option<JsValue>,

    /// Return values of the current function.
    ///
    /// This is configured to [Some] by function handlers and filled by the
    /// return statement handler.
    cur_fn_return_values: Option<Vec<JsValue>>,
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
                    args,
                    span: n.span(),
                });
            }
            Callee::Expr(box expr) => {
                if let Expr::Member(MemberExpr { obj, prop, .. }) = unparen(expr) {
                    let obj_value = self.eval_context.eval(obj);
                    let prop_value = match prop {
                        // TODO avoid clone
                        MemberProp::Ident(i) => i.sym.clone().into(),
                        MemberProp::PrivateName(_) => {
                            return;
                        }
                        MemberProp::Computed(ComputedPropName { expr, .. }) => {
                            self.eval_context.eval(&expr)
                        }
                    };
                    self.data.effects.push(Effect::MemberCall {
                        obj: obj_value,
                        prop: prop_value,
                        args,
                        span: n.span(),
                    });
                } else {
                    let fn_value = self.eval_context.eval(expr);
                    self.data.effects.push(Effect::Call {
                        func: fn_value,
                        args,
                        span: n.span(),
                    });
                }
            }
            _ => {}
        }
    }

    fn take_return_values(&mut self) -> Box<JsValue> {
        let values = self.cur_fn_return_values.take().unwrap();

        match values.len() {
            0 => box JsValue::FreeVar(FreeVarKind::Other(js_word!("undefined"))),
            1 => box values.into_iter().next().unwrap(),
            _ => box JsValue::alternatives(values),
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

    fn visit_params(&mut self, n: &[Param]) {
        let value = self.current_value.take();
        for (index, p) in n.iter().enumerate() {
            self.current_value = Some(JsValue::Argument(index));
            p.visit_children_with(self);
        }
        self.current_value = value;
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
        let old = replace(&mut self.cur_fn_return_values, Some(vec![]));
        decl.visit_children_with(self);
        let return_value = self.take_return_values();

        self.add_value(decl.ident.to_id(), JsValue::function(return_value));

        self.cur_fn_return_values = old;
    }

    fn visit_fn_expr(&mut self, expr: &FnExpr) {
        let old = replace(&mut self.cur_fn_return_values, Some(vec![]));
        expr.visit_children_with(self);
        let return_value = self.take_return_values();

        if let Some(ident) = &expr.ident {
            self.add_value(ident.to_id(), JsValue::function(return_value));
        } else {
            self.add_value(
                (
                    format!("*anonymous function {}*", expr.function.span.lo.0).into(),
                    SyntaxContext::empty(),
                ),
                JsValue::function(return_value),
            );
        }

        self.cur_fn_return_values = old;
    }

    fn visit_arrow_expr(&mut self, expr: &ArrowExpr) {
        let value = match &expr.body {
            BlockStmtOrExpr::BlockStmt(block) => {
                let old = replace(&mut self.cur_fn_return_values, Some(vec![]));
                expr.visit_children_with(self);
                let return_value = self.take_return_values();

                self.cur_fn_return_values = old;
                JsValue::function(return_value)
            }
            BlockStmtOrExpr::Expr(inner_expr) => {
                expr.visit_children_with(self);
                let return_value = self.eval_context.eval(&*inner_expr);

                JsValue::function(box return_value)
            }
        };
        self.add_value(
            (
                format!("*arrow function {}*", expr.span.lo.0).into(),
                SyntaxContext::empty(),
            ),
            value,
        );
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
                            Some(Arc::new(JsValue::Variable(i.to_id()))),
                            "pattern without value",
                        )
                    }),
                );
            }

            Pat::Array(arr) => {
                //

                match &value {
                    Some(JsValue::Array(_, value)) => {
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
                            self.current_value = Some(JsValue::member(
                                box value.clone(),
                                box JsValue::Constant(ConstantValue::Num(ConstantNumber(
                                    idx as f64,
                                ))),
                            ));
                            elem.visit_with(self);
                        }
                        // We should not call visit_children_with
                        return;
                    }

                    None => {}
                }
            }

            Pat::Object(obj) => {
                match &value {
                    Some(current_value) => {
                        for prop in obj.props.iter() {
                            match prop {
                                ObjectPatProp::KeyValue(KeyValuePatProp { key, value }) => {
                                    let key_value = self.eval_context.eval_prop_name(key);
                                    key.visit_with(self);
                                    self.current_value = Some(JsValue::member(
                                        box current_value.clone(),
                                        box key_value,
                                    ));
                                    value.visit_with(self);
                                }
                                ObjectPatProp::Assign(AssignPatProp { key, value, .. }) => {
                                    let key_value = key.sym.clone().into();
                                    key.visit_with(self);
                                    self.add_value(
                                        key.to_id(),
                                        if let Some(box value) = value {
                                            let value = self.eval_context.eval(value);
                                            JsValue::alternatives(vec![
                                                JsValue::member(
                                                    box current_value.clone(),
                                                    box key_value,
                                                ),
                                                value,
                                            ])
                                        } else {
                                            JsValue::member(
                                                box current_value.clone(),
                                                box key_value,
                                            )
                                        },
                                    );
                                    value.visit_with(self);
                                }
                                _ => prop.visit_with(self),
                            }
                        }
                        // We should not call visit_children_with
                        return;
                    }

                    None => {}
                }
            }

            _ => {}
        }
        pat.visit_children_with(self);
    }

    fn visit_return_stmt(&mut self, stmt: &ReturnStmt) {
        stmt.visit_children_with(self);

        if let Some(values) = &mut self.cur_fn_return_values {
            let return_value = stmt
                .arg
                .as_deref()
                .map(|e| self.eval_context.eval(e))
                .unwrap_or(JsValue::FreeVar(FreeVarKind::Other(js_word!("undefined"))));

            values.push(return_value);
        }
    }
}
