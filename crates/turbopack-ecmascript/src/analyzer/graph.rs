use std::{collections::HashMap, iter, mem::replace, sync::Arc};

use swc_core::{
    common::{pass::AstNodePath, Mark, Span, Spanned, SyntaxContext},
    ecma::{
        ast::*,
        atoms::js_word,
        visit::{fields::*, VisitAstPath, VisitWithPath, *},
    },
};

use super::{ConstantNumber, ConstantValue, ImportMap, JsValue, ObjectPart, WellKnownFunctionKind};
use crate::{
    analyzer::{is_unresolved, FreeVarKind},
    utils::unparen,
};

#[derive(Debug, Clone)]
pub enum Effect {
    Call {
        func: JsValue,
        args: Vec<JsValue>,
        ast_path: Vec<AstParentKind>,
        span: Span,
    },
    MemberCall {
        obj: JsValue,
        prop: JsValue,
        args: Vec<JsValue>,
        ast_path: Vec<AstParentKind>,
        span: Span,
    },
    Member {
        obj: JsValue,
        prop: JsValue,
        ast_path: Vec<AstParentKind>,
        span: Span,
    },
    ImportedBinding {
        esm_reference_index: usize,
        export: Option<String>,
        ast_path: Vec<AstParentKind>,
        span: Span,
    },
}

impl Effect {
    pub fn normalize(&mut self) {
        match self {
            Effect::Call {
                func,
                args,
                ast_path: _,
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
                ast_path: _,
                span: _,
            } => {
                obj.normalize();
                prop.normalize();
                for arg in args.iter_mut() {
                    arg.normalize();
                }
            }
            Effect::Member {
                obj,
                prop,
                ast_path: _,
                span: _,
            } => {
                obj.normalize();
                prop.normalize();
            }
            Effect::ImportedBinding {
                esm_reference_index: _,
                export: _,
                ast_path: _,
                span: _,
            } => {}
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

    m.visit_with_path(
        &mut Analyzer {
            data: &mut graph,
            eval_context,
            var_decl_kind: Default::default(),
            current_value: Default::default(),
            cur_fn_return_values: Default::default(),
        },
        &mut Default::default(),
    );

    graph.normalize();

    graph
}

pub struct EvalContext {
    pub(crate) unresolved_mark: Mark,
    pub(crate) imports: ImportMap,
}

impl EvalContext {
    pub fn new(module: &Program, unresolved_mark: Mark) -> Self {
        Self {
            unresolved_mark,
            imports: ImportMap::analyze(module),
        }
    }

    pub fn is_esm(&self) -> bool {
        self.imports.is_esm()
    }

    fn eval_prop_name(&self, prop: &PropName) -> JsValue {
        match prop {
            PropName::Ident(ident) => ident.sym.clone().into(),
            PropName::Str(str) => str.value.clone().into(),
            PropName::Num(num) => num.value.into(),
            PropName::Computed(ComputedPropName { expr, .. }) => self.eval(expr),
            PropName::BigInt(bigint) => (*bigint.value.clone()).into(),
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

                values.push(self.eval(e));
            }
        }

        if values.len() == 1 {
            return values.into_iter().next().unwrap();
        }

        JsValue::concat(values)
    }

    pub fn eval(&self, e: &Expr) -> JsValue {
        match e {
            Expr::Lit(e) => JsValue::Constant(e.clone().into()),
            Expr::Ident(i) => {
                let id = i.to_id();
                if let Some(imported) = self.imports.get_import(&id) {
                    return imported;
                }
                if is_unresolved(i, self.unresolved_mark) {
                    match &*i.sym {
                        "require" => JsValue::FreeVar(FreeVarKind::Require),
                        "define" => JsValue::FreeVar(FreeVarKind::Define),
                        "__dirname" => JsValue::FreeVar(FreeVarKind::Dirname),
                        "__filename" => JsValue::FreeVar(FreeVarKind::Filename),
                        "process" => JsValue::FreeVar(FreeVarKind::NodeProcess),
                        "Object" => JsValue::FreeVar(FreeVarKind::Object),
                        _ => JsValue::FreeVar(FreeVarKind::Other(i.sym.clone())),
                    }
                } else {
                    JsValue::Variable(id)
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

                match (l, r) {
                    (JsValue::Add(c, l), r) => JsValue::Add(
                        c + r.total_nodes(),
                        l.into_iter().chain(iter::once(r)).collect(),
                    ),
                    (l, r) => JsValue::add(vec![l, r]),
                }
            }

            Expr::Bin(BinExpr {
                op: op!("||") | op!("??"),
                left,
                right,
                ..
            }) => JsValue::alternatives(vec![self.eval(left), self.eval(right)]),

            &Expr::Cond(CondExpr {
                box ref cons,
                box ref alt,
                ..
            }) => JsValue::alternatives(vec![self.eval(cons), self.eval(alt)]),

            Expr::Tpl(e) => self.eval_tpl(e, false),

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
                    && is_unresolved(tag_obj, self.unresolved_mark)
                {
                    self.eval_tpl(tpl, true)
                } else {
                    JsValue::Unknown(None, "tagged template literal is not supported yet")
                }
            }

            Expr::Fn(expr) => {
                if let Some(ident) = &expr.ident {
                    JsValue::Variable(ident.to_id())
                } else {
                    JsValue::Variable((
                        format!("*anonymous function {}*", expr.function.span.lo.0).into(),
                        SyntaxContext::empty(),
                    ))
                }
            }
            Expr::Arrow(expr) => JsValue::Variable((
                format!("*arrow function {}*", expr.span.lo.0).into(),
                SyntaxContext::empty(),
            )),
            Expr::New(..) => JsValue::Unknown(None, "new expression are not supported"),

            Expr::Seq(e) => {
                if let Some(e) = e.exprs.last() {
                    self.eval(e)
                } else {
                    unreachable!()
                }
            }

            Expr::Member(MemberExpr {
                obj,
                prop: MemberProp::Ident(prop),
                ..
            }) => {
                let obj = self.eval(obj);
                JsValue::member(box obj, box prop.sym.clone().into())
            }

            Expr::Member(MemberExpr {
                obj,
                prop: MemberProp::Computed(computed),
                ..
            }) => {
                let obj = self.eval(obj);
                let prop = self.eval(&computed.expr);
                JsValue::member(box obj, box prop)
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
                    let obj = box self.eval(obj);
                    let prop = box match prop {
                        // TODO avoid clone
                        MemberProp::Ident(i) => i.sym.clone().into(),
                        MemberProp::PrivateName(_) => {
                            return JsValue::Unknown(
                                None,
                                "private names in function calls is not supported",
                            );
                        }
                        MemberProp::Computed(ComputedPropName { expr, .. }) => self.eval(expr),
                    };
                    JsValue::member_call(obj, prop, args)
                } else {
                    let callee = box self.eval(callee);

                    JsValue::call(callee, args)
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

                JsValue::call(callee, args)
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
                JsValue::array(arr)
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

pub fn as_parent_path(ast_path: &AstNodePath<AstParentNodeRef<'_>>) -> Vec<AstParentKind> {
    ast_path.iter().map(|n| n.kind()).collect()
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

    fn check_iife<'ast: 'r, 'r>(
        &mut self,
        n: &'ast CallExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) -> bool {
        fn unparen<'ast: 'r, 'r, T>(
            expr: &'ast Expr,
            ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
            f: impl FnOnce(&'ast Expr, &mut AstNodePath<AstParentNodeRef<'r>>) -> T,
        ) -> T {
            if let Some(inner_expr) = expr.as_paren() {
                ast_path.with(AstParentNodeRef::Expr(expr, ExprField::Paren), |ast_path| {
                    ast_path.with(
                        AstParentNodeRef::ParenExpr(inner_expr, ParenExprField::Expr),
                        |ast_path| unparen(&inner_expr.expr, ast_path, f),
                    )
                })
            } else {
                f(expr, ast_path)
            }
        }

        if n.args.iter().any(|arg| arg.spread.is_some()) {
            return false;
        }
        if ast_path.with(
            AstParentNodeRef::CallExpr(n, CallExprField::Callee),
            |ast_path| {
                if let Some(expr) = n.callee.as_expr() {
                    ast_path.with(
                        AstParentNodeRef::Callee(&n.callee, CalleeField::Expr),
                        |ast_path| {
                            unparen(expr, ast_path, |expr, ast_path| match expr {
                                Expr::Fn(fn_expr @ FnExpr { function, ident }) => {
                                    ast_path.with(
                                        AstParentNodeRef::Expr(expr, ExprField::Fn),
                                        |ast_path| {
                                            ast_path.with(
                                                AstParentNodeRef::FnExpr(
                                                    fn_expr,
                                                    FnExprField::Ident,
                                                ),
                                                |ast_path| {
                                                    self.visit_opt_ident(ident.as_ref(), ast_path);
                                                },
                                            );
                                            ast_path.with(
                                                AstParentNodeRef::FnExpr(
                                                    fn_expr,
                                                    FnExprField::Function,
                                                ),
                                                |ast_path| {
                                                    self.handle_iife_function(
                                                        function, ast_path, &n.args,
                                                    );
                                                },
                                            );
                                        },
                                    );
                                    true
                                }
                                Expr::Arrow(arrow_expr) => {
                                    ast_path.with(
                                        AstParentNodeRef::Expr(expr, ExprField::Arrow),
                                        |ast_path| {
                                            let args = &n.args;
                                            self.handle_iife_arrow(arrow_expr, args, ast_path);
                                        },
                                    );
                                    true
                                }
                                _ => false,
                            })
                        },
                    )
                } else {
                    false
                }
            },
        ) {
            ast_path.with(
                AstParentNodeRef::CallExpr(n, CallExprField::Args(usize::MAX)),
                |ast_path| {
                    self.visit_expr_or_spreads(&n.args, ast_path);
                },
            );
            true
        } else {
            false
        }
    }

    fn handle_iife_arrow<'ast: 'r, 'r>(
        &mut self,
        arrow_expr: &'ast ArrowExpr,
        args: &[ExprOrSpread],
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let ArrowExpr {
            params,
            body,
            is_async: _,
            is_generator: _,
            return_type,
            span: _,
            type_params,
        } = arrow_expr;
        let mut iter = args.iter();
        for (i, param) in params.iter().enumerate() {
            ast_path.with(
                AstParentNodeRef::ArrowExpr(arrow_expr, ArrowExprField::Params(i)),
                |ast_path| {
                    if let Some(arg) = iter.next() {
                        self.current_value = Some(self.eval_context.eval(&arg.expr));
                        self.visit_pat(param, ast_path);
                        self.current_value = None;
                    } else {
                        self.visit_pat(param, ast_path);
                    }
                },
            );
        }
        ast_path.with(
            AstParentNodeRef::ArrowExpr(arrow_expr, ArrowExprField::Body),
            |ast_path| {
                self.visit_block_stmt_or_expr(body, ast_path);
            },
        );
        ast_path.with(
            AstParentNodeRef::ArrowExpr(arrow_expr, ArrowExprField::ReturnType),
            |ast_path| {
                self.visit_opt_ts_type_ann(return_type.as_ref(), ast_path);
            },
        );
        ast_path.with(
            AstParentNodeRef::ArrowExpr(arrow_expr, ArrowExprField::TypeParams),
            |ast_path| {
                self.visit_opt_ts_type_param_decl(type_params.as_ref(), ast_path);
            },
        );
    }

    fn handle_iife_function<'ast: 'r, 'r>(
        &mut self,
        function: &'ast Function,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
        args: &[ExprOrSpread],
    ) {
        let mut iter = args.iter();
        let Function {
            body,
            decorators,
            is_async: _,
            is_generator: _,
            params,
            return_type,
            span: _,
            type_params,
        } = function;
        for (i, param) in params.iter().enumerate() {
            ast_path.with(
                AstParentNodeRef::Function(function, FunctionField::Params(i)),
                |ast_path| {
                    if let Some(arg) = iter.next() {
                        self.current_value = Some(self.eval_context.eval(&arg.expr));
                        self.visit_param(param, ast_path);
                        self.current_value = None;
                    } else {
                        self.visit_param(param, ast_path);
                    }
                },
            );
        }
        ast_path.with(
            AstParentNodeRef::Function(function, FunctionField::Body),
            |ast_path| {
                self.visit_opt_block_stmt(body.as_ref(), ast_path);
            },
        );
        ast_path.with(
            AstParentNodeRef::Function(function, FunctionField::Decorators(usize::MAX)),
            |ast_path| {
                self.visit_decorators(decorators, ast_path);
            },
        );
        ast_path.with(
            AstParentNodeRef::Function(function, FunctionField::ReturnType),
            |ast_path| {
                self.visit_opt_ts_type_ann(return_type.as_ref(), ast_path);
            },
        );
        ast_path.with(
            AstParentNodeRef::Function(function, FunctionField::TypeParams),
            |ast_path| {
                self.visit_opt_ts_type_param_decl(type_params.as_ref(), ast_path);
            },
        );
    }

    fn check_call_expr_for_effects<'ast: 'r, 'r>(
        &mut self,
        n: &'ast CallExpr,
        ast_path: &AstNodePath<AstParentNodeRef<'r>>,
    ) {
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
                    ast_path: as_parent_path(ast_path),
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
                            self.eval_context.eval(expr)
                        }
                    };
                    self.data.effects.push(Effect::MemberCall {
                        obj: obj_value,
                        prop: prop_value,
                        args,
                        ast_path: as_parent_path(ast_path),
                        span: n.span(),
                    });
                } else {
                    let fn_value = self.eval_context.eval(expr);
                    self.data.effects.push(Effect::Call {
                        func: fn_value,
                        args,
                        ast_path: as_parent_path(ast_path),
                        span: n.span(),
                    });
                }
            }
            _ => {}
        }
    }

    fn check_member_expr_for_effects<'ast: 'r, 'r>(
        &mut self,
        member_expr: &'ast MemberExpr,
        ast_path: &AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let obj_value = self.eval_context.eval(&member_expr.obj);
        let prop_value = match &member_expr.prop {
            // TODO avoid clone
            MemberProp::Ident(i) => i.sym.clone().into(),
            MemberProp::PrivateName(_) => {
                return;
            }
            MemberProp::Computed(ComputedPropName { expr, .. }) => self.eval_context.eval(expr),
        };
        self.data.effects.push(Effect::Member {
            obj: obj_value,
            prop: prop_value,
            ast_path: as_parent_path(ast_path),
            span: member_expr.span(),
        });
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

impl VisitAstPath for Analyzer<'_> {
    fn visit_assign_expr<'ast: 'r, 'r>(
        &mut self,
        n: &'ast AssignExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        ast_path.with(
            AstParentNodeRef::AssignExpr(n, AssignExprField::Left),
            |ast_path| match &n.left {
                PatOrExpr::Expr(expr) => {
                    ast_path.with(
                        AstParentNodeRef::PatOrExpr(&n.left, PatOrExprField::Expr),
                        |ast_path| {
                            self.visit_expr(expr, ast_path);
                        },
                    );
                }
                PatOrExpr::Pat(pat) => {
                    ast_path.with(
                        AstParentNodeRef::PatOrExpr(&n.left, PatOrExprField::Pat),
                        |ast_path| {
                            self.current_value = Some(self.eval_context.eval(&n.right));
                            self.visit_pat(pat, ast_path);
                            self.current_value = None;
                        },
                    );
                }
            },
        );
        ast_path.with(
            AstParentNodeRef::AssignExpr(n, AssignExprField::Right),
            |ast_path| {
                self.visit_expr(&n.right, ast_path);
            },
        );
    }

    fn visit_call_expr<'ast: 'r, 'r>(
        &mut self,
        n: &'ast CallExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        // We handle `define(function (require) {})` here.
        if let Callee::Expr(callee) = &n.callee {
            if n.args.len() == 1 {
                if let Some(require_var_id) = extract_var_from_umd_factory(callee, &n.args) {
                    self.add_value(
                        require_var_id,
                        JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
                    );
                }
            }
        }

        // special behavior of IIFEs
        if !self.check_iife(n, ast_path) {
            self.check_call_expr_for_effects(n, ast_path);
            n.visit_children_with_path(self, ast_path);
        }
    }

    fn visit_member_expr<'ast: 'r, 'r>(
        &mut self,
        member_expr: &'ast MemberExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.check_member_expr_for_effects(member_expr, ast_path);
        member_expr.visit_children_with_path(self, ast_path);
    }

    fn visit_expr<'ast: 'r, 'r>(
        &mut self,
        n: &'ast Expr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let old = self.var_decl_kind;
        self.var_decl_kind = None;
        n.visit_children_with_path(self, ast_path);
        self.var_decl_kind = old;
    }

    fn visit_params<'ast: 'r, 'r>(
        &mut self,
        n: &'ast [Param],
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let value = self.current_value.take();
        for (index, p) in n.iter().enumerate() {
            self.current_value = Some(JsValue::Argument(index));
            p.visit_children_with_path(self, ast_path);
        }
        self.current_value = value;
    }

    fn visit_param<'ast: 'r, 'r>(
        &mut self,
        n: &'ast Param,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let old = self.var_decl_kind;
        let Param {
            decorators,
            pat,
            span: _,
        } = n;
        self.var_decl_kind = None;
        let value = self.current_value.take();
        ast_path.with(
            AstParentNodeRef::Param(n, ParamField::Decorators(usize::MAX)),
            |ast_path| {
                self.visit_decorators(decorators, ast_path);
            },
        );
        self.current_value = value;
        ast_path.with(AstParentNodeRef::Param(n, ParamField::Pat), |ast_path| {
            self.visit_pat(pat, ast_path);
        });
        self.current_value = None;
        self.var_decl_kind = old;
    }

    fn visit_fn_decl<'ast: 'r, 'r>(
        &mut self,
        decl: &'ast FnDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let old = replace(&mut self.cur_fn_return_values, Some(vec![]));
        decl.visit_children_with_path(self, ast_path);
        let return_value = self.take_return_values();

        self.add_value(decl.ident.to_id(), JsValue::function(return_value));

        self.cur_fn_return_values = old;
    }

    fn visit_fn_expr<'ast: 'r, 'r>(
        &mut self,
        expr: &'ast FnExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let old = replace(&mut self.cur_fn_return_values, Some(vec![]));
        expr.visit_children_with_path(self, ast_path);
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

    fn visit_arrow_expr<'ast: 'r, 'r>(
        &mut self,
        expr: &'ast ArrowExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let value = match &expr.body {
            BlockStmtOrExpr::BlockStmt(_block) => {
                let old = replace(&mut self.cur_fn_return_values, Some(vec![]));
                expr.visit_children_with_path(self, ast_path);
                let return_value = self.take_return_values();

                self.cur_fn_return_values = old;
                JsValue::function(return_value)
            }
            BlockStmtOrExpr::Expr(inner_expr) => {
                expr.visit_children_with_path(self, ast_path);
                let return_value = self.eval_context.eval(inner_expr);

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

    fn visit_class_decl<'ast: 'r, 'r>(
        &mut self,
        decl: &'ast ClassDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.add_value_from_expr(
            decl.ident.to_id(),
            // TODO avoid clone
            &Expr::Class(ClassExpr {
                ident: Some(decl.ident.clone()),
                class: decl.class.clone(),
            }),
        );
        decl.visit_children_with_path(self, ast_path);
    }

    fn visit_var_decl<'ast: 'r, 'r>(
        &mut self,
        n: &'ast VarDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let old = self.var_decl_kind;
        self.var_decl_kind = Some(n.kind);
        n.visit_children_with_path(self, ast_path);
        self.var_decl_kind = old;
    }

    fn visit_var_declarator<'ast: 'r, 'r>(
        &mut self,
        n: &'ast VarDeclarator,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if self.var_decl_kind.is_some() {
            if let Some(init) = &n.init {
                self.current_value = Some(self.eval_context.eval(init));
            }
        }
        ast_path.with(
            AstParentNodeRef::VarDeclarator(n, VarDeclaratorField::Name),
            |ast_path| {
                self.visit_pat(&n.name, ast_path);
            },
        );
        self.current_value = None;
        ast_path.with(
            AstParentNodeRef::VarDeclarator(n, VarDeclaratorField::Init),
            |ast_path| {
                self.visit_opt_expr(n.init.as_ref(), ast_path);
            },
        );
    }

    fn visit_pat<'ast: 'r, 'r>(
        &mut self,
        pat: &'ast Pat,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
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
                match &value {
                    Some(JsValue::Array(_, value)) => {
                        ast_path.with(AstParentNodeRef::Pat(pat, PatField::Array), |ast_path| {
                            for (idx, elem) in arr.elems.iter().enumerate() {
                                self.current_value = value.get(idx).cloned();
                                ast_path.with(
                                    AstParentNodeRef::ArrayPat(arr, ArrayPatField::Elems(idx)),
                                    |ast_path| {
                                        elem.visit_with_path(self, ast_path);
                                    },
                                );
                            }
                        });

                        // We should not call visit_children_with
                        return;
                    }

                    Some(value) => {
                        ast_path.with(AstParentNodeRef::Pat(pat, PatField::Array), |ast_path| {
                            for (idx, elem) in arr.elems.iter().enumerate() {
                                self.current_value = Some(JsValue::member(
                                    box value.clone(),
                                    box JsValue::Constant(ConstantValue::Num(ConstantNumber(
                                        idx as f64,
                                    ))),
                                ));
                                ast_path.with(
                                    AstParentNodeRef::ArrayPat(arr, ArrayPatField::Elems(idx)),
                                    |ast_path| {
                                        elem.visit_with_path(self, ast_path);
                                    },
                                );
                            }
                        });
                        // We should not call visit_children_with
                        return;
                    }

                    None => {}
                }
            }

            Pat::Object(obj) => {
                match &value {
                    Some(current_value) => {
                        self.visit_pat_with_value(pat, obj, current_value, ast_path);
                        // We should not call visit_children_with
                        return;
                    }

                    None => {}
                }
            }

            _ => {}
        }
        pat.visit_children_with_path(self, ast_path);
    }

    fn visit_return_stmt<'ast: 'r, 'r>(
        &mut self,
        stmt: &'ast ReturnStmt,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        stmt.visit_children_with_path(self, ast_path);

        if let Some(values) = &mut self.cur_fn_return_values {
            let return_value = stmt
                .arg
                .as_deref()
                .map(|e| self.eval_context.eval(e))
                .unwrap_or(JsValue::FreeVar(FreeVarKind::Other(js_word!("undefined"))));

            values.push(return_value);
        }
    }

    fn visit_ident<'ast: 'r, 'r>(
        &mut self,
        ident: &'ast Ident,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if let Some((esm_reference_index, export)) =
            self.eval_context.imports.get_binding(&ident.to_id())
        {
            self.data.effects.push(Effect::ImportedBinding {
                esm_reference_index,
                export,
                ast_path: as_parent_path(ast_path),
                span: ident.span(),
            })
        }
    }
}

impl<'a> Analyzer<'a> {
    fn visit_pat_with_value<'ast: 'r, 'r>(
        &mut self,
        pat: &'ast Pat,
        obj: &'ast ObjectPat,
        current_value: &JsValue,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        ast_path.with(AstParentNodeRef::Pat(pat, PatField::Object), |ast_path| {
            for (i, prop) in obj.props.iter().enumerate() {
                ast_path.with(
                    AstParentNodeRef::ObjectPat(obj, ObjectPatField::Props(i)),
                    |ast_path| match prop {
                        ObjectPatProp::KeyValue(kv) => {
                            ast_path.with(
                                AstParentNodeRef::ObjectPatProp(prop, ObjectPatPropField::KeyValue),
                                |ast_path| {
                                    let KeyValuePatProp { key, value } = kv;
                                    let key_value = self.eval_context.eval_prop_name(key);
                                    ast_path.with(
                                        AstParentNodeRef::KeyValuePatProp(
                                            kv,
                                            KeyValuePatPropField::Key,
                                        ),
                                        |ast_path| {
                                            key.visit_with_path(self, ast_path);
                                        },
                                    );
                                    self.current_value = Some(JsValue::member(
                                        box current_value.clone(),
                                        box key_value,
                                    ));
                                    ast_path.with(
                                        AstParentNodeRef::KeyValuePatProp(
                                            kv,
                                            KeyValuePatPropField::Value,
                                        ),
                                        |ast_path| {
                                            value.visit_with_path(self, ast_path);
                                        },
                                    );
                                },
                            );
                        }
                        ObjectPatProp::Assign(assign) => {
                            ast_path.with(
                                AstParentNodeRef::ObjectPatProp(prop, ObjectPatPropField::Assign),
                                |ast_path| {
                                    let AssignPatProp { key, value, .. } = assign;
                                    let key_value = key.sym.clone().into();
                                    ast_path.with(
                                        AstParentNodeRef::AssignPatProp(
                                            assign,
                                            AssignPatPropField::Key,
                                        ),
                                        |ast_path| {
                                            key.visit_with_path(self, ast_path);
                                        },
                                    );
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
                                    ast_path.with(
                                        AstParentNodeRef::AssignPatProp(
                                            assign,
                                            AssignPatPropField::Value,
                                        ),
                                        |ast_path| {
                                            value.visit_with_path(self, ast_path);
                                        },
                                    );
                                },
                            );
                        }

                        _ => prop.visit_with_path(self, ast_path),
                    },
                );
            }
        });
    }
}

fn extract_var_from_umd_factory(callee: &Expr, args: &[ExprOrSpread]) -> Option<Id> {
    match unparen(callee) {
        Expr::Ident(Ident { sym, .. }) => {
            if &**sym == "define" {
                if let Expr::Fn(FnExpr { function, .. }) = &*args[0].expr {
                    let params = &*function.params;
                    if params.len() == 1 {
                        if let Pat::Ident(param) = &params[0].pat {
                            if &*param.id.sym == "require" {
                                return Some(param.to_id());
                            }
                        }
                    }
                }
            }
        }

        // umd may use (function (factory){
        //   // Somewhere, define(['require', 'exports'], factory)
        // }(function (require, exports){}))
        //
        // In all module system which has `require`, `require` in the factory function can be
        // treated as a well-known require.
        Expr::Fn(FnExpr { function, .. }) => {
            let params = &*function.params;
            if params.len() == 1 {
                if let Some(FnExpr { function, .. }) =
                    args.first().and_then(|arg| arg.expr.as_fn_expr())
                {
                    let params = &*function.params;
                    if !params.is_empty() {
                        if let Pat::Ident(param) = &params[0].pat {
                            if &*param.id.sym == "require" {
                                return Some(param.to_id());
                            }
                        }
                    }
                }
            }
        }

        _ => {}
    }

    None
}
