use std::sync::Arc;

use anyhow::{Ok, Result};
use rustc_hash::FxHashSet;
use swc_core::{
    base::try_with_handler,
    common::{GLOBALS, Mark, SourceMap, SyntaxContext, comments::Comments, sync::Lrc},
    ecma::{ast::*, atoms::atom},
};
use turbo_rcstr::{RcStr, rcstr};

use crate::{
    SpecifiedModuleType,
    analyzer::{
        Bump, BumpVec, ConstantNumber, ConstantValue, ImportMap, JsValue, ObjectPart,
        WellKnownObjectKind, is_unresolved,
    },
    references::constant_value::parse_single_expr_lit,
    utils::unparen,
};

/// A context used for assembling the evaluation graph.
#[derive(Debug)]
pub struct EvalContext {
    /// Should be the same [`Mark`] used by [`swc_core::ecma::transforms::base::resolver`].
    pub(crate) unresolved_mark: Mark,
    /// Should be the same [`Mark`] used by [`swc_core::ecma::transforms::base::resolver`].
    pub(crate) top_level_mark: Mark,
    pub(crate) imports: ImportMap,
    pub(crate) force_free_values: Arc<FxHashSet<Id>>,
}

impl EvalContext {
    /// Produce a new [`EvalContext`] from a [`Program`].
    ///
    /// If you wish to support `webpackIgnore` or `turbopackIgnore` comments, you must pass those
    /// in, since the AST does not include comments by default.
    ///
    /// You should use the same `unresolved_mark` and `top_level_mark` [Mark] values for this
    /// context that you passed to [`swc_core::ecma::transforms::base::resolver`].
    pub fn new(
        module: Option<&Program>,
        unresolved_mark: Mark,
        top_level_mark: Mark,
        force_free_values: Arc<FxHashSet<Id>>,
        comments: Option<&dyn Comments>,
    ) -> Self {
        Self {
            unresolved_mark,
            top_level_mark,
            imports: module.map_or(ImportMap::default(), |m| {
                ImportMap::analyze(unresolved_mark, m, comments)
            }),
            force_free_values,
        }
    }

    pub fn is_esm(&self, specified_type: SpecifiedModuleType) -> bool {
        self.imports.is_esm(specified_type)
    }

    pub(super) fn eval_prop_name<'a>(&self, arena: &'a Bump, prop: &PropName) -> JsValue<'a> {
        match prop {
            PropName::Ident(ident) => ident.sym.clone().into(),
            PropName::Str(str) => str.value.clone().to_atom_lossy().into_owned().into(),
            PropName::Num(num) => num.value.into(),
            PropName::Computed(ComputedPropName { expr, .. }) => self.eval(arena, expr),
            PropName::BigInt(bigint) => (*bigint.value.clone()).into(),
        }
    }

    pub(super) fn eval_member_prop<'a>(
        &self,
        arena: &'a Bump,
        prop: &MemberProp,
    ) -> Option<JsValue<'a>> {
        match prop {
            MemberProp::Ident(ident) => Some(ident.sym.clone().into()),
            MemberProp::Computed(ComputedPropName { expr, .. }) => Some(self.eval(arena, expr)),
            MemberProp::PrivateName(_) => None,
        }
    }

    fn eval_tpl<'a>(&self, arena: &'a Bump, e: &Tpl, raw: bool) -> JsValue<'a> {
        debug_assert!(e.quasis.len() == e.exprs.len() + 1);

        let mut values = vec![];

        for idx in 0..(e.quasis.len() + e.exprs.len()) {
            if idx.is_multiple_of(2) {
                let idx = idx / 2;
                let e = &e.quasis[idx];
                if raw {
                    // Ignore empty strings quasis, happens frequently with e.g. after the
                    // placeholder in `something${v}`.
                    if !e.raw.is_empty() {
                        values.push(JsValue::from(e.raw.clone()));
                    }
                } else {
                    match &e.cooked {
                        Some(v) => {
                            if !v.is_empty() {
                                values.push(JsValue::from(v.clone().to_atom_lossy().into_owned()));
                            }
                        }
                        // This is actually unreachable
                        None => return JsValue::unknown_empty(true, rcstr!("")),
                    }
                }
            } else {
                let idx = idx / 2;
                let e = &e.exprs[idx];

                values.push(self.eval(arena, e));
            }
        }

        match values.len() {
            0 => JsValue::Constant(ConstantValue::Str(rcstr!("").into())),
            1 => values.into_iter().next().unwrap(),
            _ => JsValue::concat(BumpVec::from_iter_in(arena, values)),
        }
    }

    pub(super) fn eval_ident<'a>(&self, arena: &'a Bump, i: &Ident) -> JsValue<'a> {
        let id = i.to_id();
        if let Some(imported) = self.imports.get_import(arena, &id) {
            return imported;
        }
        if is_unresolved(i, self.unresolved_mark) || self.force_free_values.contains(&id) {
            // These are special globals that we shouldn't consider to be free variables and we can
            // model their values mostly useful for truthy/falsy checks.
            match i.sym.as_str() {
                "undefined" => JsValue::Constant(ConstantValue::Undefined),
                "NaN" => JsValue::Constant(ConstantValue::Num(f64::NAN.into())),
                "Infinity" => JsValue::Constant(ConstantValue::Num(f64::INFINITY.into())),
                _ => JsValue::FreeVar(i.sym.clone()),
            }
        } else {
            JsValue::Variable(id)
        }
    }

    pub fn eval<'a>(&self, arena: &'a Bump, e: &Expr) -> JsValue<'a> {
        debug_assert!(
            GLOBALS.is_set(),
            "Eval requires globals from its parsed result"
        );
        match e {
            Expr::Paren(e) => self.eval(arena, &e.expr),
            Expr::Lit(e) => JsValue::Constant(e.clone().into()),
            Expr::Ident(i) => self.eval_ident(arena, i),

            Expr::Unary(UnaryExpr {
                op: op!("void"),
                // Only treat literals as constant undefined, allowing arbitrary values inside here
                // would mean that they can have sideeffects, and `JsValue::Constant` can't model
                // that.
                arg: box Expr::Lit(_),
                ..
            }) => JsValue::Constant(ConstantValue::Undefined),

            Expr::Unary(UnaryExpr {
                op: op!(unary, "-"),
                arg: box Expr::Lit(Lit::Num(n)),
                ..
            }) => JsValue::Constant(ConstantValue::Num(ConstantNumber(-n.value))),

            Expr::Unary(UnaryExpr {
                op: op!("!"), arg, ..
            }) => {
                let arg = self.eval(arena, arg);

                JsValue::logical_not(arena, arg)
            }

            Expr::Unary(UnaryExpr {
                op: op!("typeof"),
                arg,
                ..
            }) => {
                let arg = self.eval(arena, arg);

                JsValue::type_of(arena, arg)
            }

            Expr::Bin(BinExpr {
                op: op!(bin, "+"),
                left,
                right,
                ..
            }) => {
                let l = self.eval(arena, left);
                let r = self.eval(arena, right);

                match (l, r) {
                    (JsValue::Add(c, mut l), r) => {
                        let total = c + r.total_nodes();
                        l.push(arena, r);
                        JsValue::Add(total, l)
                    }
                    (l, r) => JsValue::add(BumpVec::from_iter_in(arena, [l, r])),
                }
            }

            Expr::Bin(BinExpr {
                op: op!("&&"),
                left,
                right,
                ..
            }) => JsValue::logical_and(BumpVec::from_iter_in(
                arena,
                [self.eval(arena, left), self.eval(arena, right)],
            )),

            Expr::Bin(BinExpr {
                op: op!("||"),
                left,
                right,
                ..
            }) => JsValue::logical_or(BumpVec::from_iter_in(
                arena,
                [self.eval(arena, left), self.eval(arena, right)],
            )),

            Expr::Bin(BinExpr {
                op: op!("??"),
                left,
                right,
                ..
            }) => JsValue::nullish_coalescing(BumpVec::from_iter_in(
                arena,
                [self.eval(arena, left), self.eval(arena, right)],
            )),

            Expr::Bin(BinExpr {
                op: op!("=="),
                left,
                right,
                ..
            }) => JsValue::equal(arena, self.eval(arena, left), self.eval(arena, right)),

            Expr::Bin(BinExpr {
                op: op!("!="),
                left,
                right,
                ..
            }) => JsValue::not_equal(arena, self.eval(arena, left), self.eval(arena, right)),

            Expr::Bin(BinExpr {
                op: op!("==="),
                left,
                right,
                ..
            }) => JsValue::strict_equal(arena, self.eval(arena, left), self.eval(arena, right)),

            Expr::Bin(BinExpr {
                op: op!("!=="),
                left,
                right,
                ..
            }) => JsValue::strict_not_equal(arena, self.eval(arena, left), self.eval(arena, right)),

            &Expr::Cond(CondExpr {
                box ref cons,
                box ref alt,
                box ref test,
                ..
            }) => {
                let test = self.eval(arena, test);
                if let Some(truthy) = test.is_truthy() {
                    if truthy {
                        self.eval(arena, cons)
                    } else {
                        self.eval(arena, alt)
                    }
                } else {
                    JsValue::tenary(arena, test, self.eval(arena, cons), self.eval(arena, alt))
                }
            }

            Expr::Tpl(e) => self.eval_tpl(arena, e, false),

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
                    self.eval_tpl(arena, tpl, true)
                } else {
                    JsValue::unknown_empty(
                        true,
                        rcstr!("tagged template literal is not supported yet"),
                    )
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

            Expr::Await(AwaitExpr { arg, .. }) => JsValue::awaited(arena, self.eval(arena, arg)),

            Expr::Seq(e) => {
                let mut seq = e.exprs.iter().map(|e| self.eval(arena, e)).peekable();
                let mut side_effects = false;
                let mut last = seq.next().unwrap();
                for e in seq {
                    side_effects |= last.has_side_effects();
                    last = e;
                }
                if side_effects {
                    last.make_unknown(true, rcstr!("sequence with side effects"));
                }
                last
            }

            Expr::Member(MemberExpr {
                obj,
                prop: MemberProp::Ident(prop),
                ..
            }) => {
                let obj = self.eval(arena, obj);
                JsValue::member(arena, obj, prop.sym.clone().into())
            }

            Expr::Member(MemberExpr {
                obj,
                prop: MemberProp::Computed(computed),
                ..
            }) => {
                let obj = self.eval(arena, obj);
                let prop = self.eval(arena, &computed.expr);
                JsValue::member(arena, obj, prop)
            }

            Expr::New(NewExpr {
                callee: box callee,
                args,
                ..
            }) => {
                let args = args.as_deref().unwrap_or(&[]);
                // We currently do not handle spreads.
                if args.iter().any(|arg| arg.spread.is_some()) {
                    return JsValue::unknown_empty(
                        true,
                        rcstr!("spread in new calls is not supported"),
                    );
                }

                JsValue::new_from_iter(
                    arena,
                    self.eval(arena, callee),
                    args.iter().map(|arg| self.eval(arena, &arg.expr)),
                )
            }

            Expr::Call(CallExpr {
                callee: Callee::Expr(box callee),
                args,
                ..
            }) => {
                // We currently do not handle spreads.
                if args.iter().any(|arg| arg.spread.is_some()) {
                    return JsValue::unknown_empty(
                        true,
                        rcstr!("spread in function calls is not supported"),
                    );
                }

                if let Expr::Member(MemberExpr { obj, prop, .. }) = unparen(callee) {
                    let prop = match prop {
                        MemberProp::Ident(i) => i.sym.clone().into(),
                        MemberProp::PrivateName(_) => {
                            return JsValue::unknown_empty(
                                false,
                                rcstr!("private names in function calls is not supported"),
                            );
                        }
                        MemberProp::Computed(ComputedPropName { expr, .. }) => {
                            self.eval(arena, expr)
                        }
                    };
                    let obj = self.eval(arena, obj);
                    JsValue::member_call_from_iter(
                        arena,
                        obj,
                        prop,
                        args.iter().map(|arg| self.eval(arena, &arg.expr)),
                    )
                } else {
                    JsValue::call_from_iter(
                        arena,
                        self.eval(arena, callee),
                        args.iter().map(|arg| self.eval(arena, &arg.expr)),
                    )
                }
            }

            Expr::Call(CallExpr {
                callee: Callee::Super(_),
                args,
                ..
            }) => {
                // We currently do not handle spreads.
                if args.iter().any(|arg| arg.spread.is_some()) {
                    return JsValue::unknown_empty(
                        true,
                        rcstr!("spread in function calls is not supported"),
                    );
                }

                let args = bumpalo::collections::Vec::from_iter_in(
                    args.iter().map(|arg| self.eval(arena, &arg.expr)),
                    arena,
                )
                .into_boxed_slice();

                JsValue::super_call(args)
            }

            Expr::Call(CallExpr {
                callee: Callee::Import(_),
                args,
                ..
            }) => {
                // We currently do not handle spreads.
                if args.iter().any(|arg| arg.spread.is_some()) {
                    return JsValue::unknown_empty(
                        true,
                        rcstr!("spread in import() is not supported"),
                    );
                }
                JsValue::call_from_iter(
                    arena,
                    JsValue::FreeVar(atom!("import")),
                    args.iter().map(|arg| self.eval(arena, &arg.expr)),
                )
            }

            Expr::Array(arr) => {
                if arr.elems.iter().flatten().any(|v| v.spread.is_some()) {
                    return JsValue::unknown_empty(true, rcstr!("spread is not supported"));
                }

                let arr = BumpVec::from_iter_in(
                    arena,
                    arr.elems.iter().map(|e| match e {
                        Some(e) => self.eval(arena, &e.expr),
                        _ => JsValue::Constant(ConstantValue::Undefined),
                    }),
                );
                JsValue::array(arr)
            }

            Expr::Object(obj) => JsValue::object(BumpVec::from_iter_in(
                arena,
                obj.props.iter().map(|prop| match prop {
                    PropOrSpread::Spread(SpreadElement { expr, .. }) => {
                        ObjectPart::Spread(self.eval(arena, expr))
                    }
                    PropOrSpread::Prop(box Prop::KeyValue(KeyValueProp { key, box value })) => {
                        ObjectPart::KeyValue(
                            self.eval_prop_name(arena, key),
                            self.eval(arena, value),
                        )
                    }
                    PropOrSpread::Prop(box Prop::Shorthand(ident)) => ObjectPart::KeyValue(
                        ident.sym.clone().into(),
                        self.eval(arena, &Expr::Ident(ident.clone())),
                    ),
                    _ => ObjectPart::Spread(JsValue::unknown_empty(
                        true,
                        rcstr!("unsupported object part"),
                    )),
                }),
            )),

            Expr::MetaProp(MetaPropExpr {
                kind: MetaPropKind::ImportMeta,
                ..
            }) => JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta),

            Expr::Assign(AssignExpr { op, .. }) => match op {
                // TODO: `self.eval(arena, right)` would be the value, but we need to handle the
                // side effect of that expression
                AssignOp::Assign => JsValue::unknown_empty(true, rcstr!("assignment expression")),
                _ => JsValue::unknown_empty(true, rcstr!("compound assignment expression")),
            },

            _ => JsValue::unknown_empty(true, rcstr!("unsupported expression")),
        }
    }

    pub fn eval_single_expr_lit<'a>(arena: &'a Bump, expr_lit: &RcStr) -> Result<JsValue<'a>> {
        let cm = Lrc::new(SourceMap::default());

        let js_value = try_with_handler(cm, Default::default(), |_| {
            GLOBALS.set(&Default::default(), || {
                let expr = parse_single_expr_lit(expr_lit);
                let eval_context =
                    EvalContext::new(None, Mark::new(), Mark::new(), Default::default(), None);

                Ok(eval_context.eval(arena, &expr))
            })
        })
        .map_err(|e| e.to_pretty_error())?;

        Ok(js_value)
    }
}
