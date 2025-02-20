use std::{
    iter,
    mem::{replace, take},
};

use rustc_hash::FxHashMap;
use swc_core::{
    atoms::Atom,
    common::{comments::Comments, pass::AstNodePath, Mark, Span, Spanned, SyntaxContext, GLOBALS},
    ecma::{
        ast::*,
        atoms::js_word,
        utils::contains_ident_ref,
        visit::{fields::*, *},
    },
};
use turbo_rcstr::RcStr;
use turbo_tasks::ResolvedVc;
use turbopack_core::source::Source;

use super::{
    is_unresolved_id, ConstantNumber, ConstantValue, ImportMap, JsValue, ObjectPart,
    WellKnownFunctionKind,
};
use crate::{
    analyzer::{is_unresolved, WellKnownObjectKind},
    utils::{unparen, AstPathRange},
    SpecifiedModuleType,
};

#[derive(Debug, Clone)]
pub struct EffectsBlock {
    pub effects: Vec<Effect>,
    pub range: AstPathRange,
}

impl EffectsBlock {
    pub fn is_empty(&self) -> bool {
        self.effects.is_empty()
    }
}

#[derive(Debug, Clone)]
pub enum ConditionalKind {
    /// The blocks of an `if` statement without an `else` block.
    If { then: Box<EffectsBlock> },
    /// The blocks of an `if ... else` or `if { ... return ... } ...` statement.
    IfElse {
        then: Box<EffectsBlock>,
        r#else: Box<EffectsBlock>,
    },
    /// The blocks of an `if ... else` statement.
    Else { r#else: Box<EffectsBlock> },
    /// The blocks of an `if { ... return ... } else { ... } ...` or `if { ... }
    /// else { ... return ... } ...` statement.
    IfElseMultiple {
        then: Vec<Box<EffectsBlock>>,
        r#else: Vec<Box<EffectsBlock>>,
    },
    /// The expressions on the right side of the `?:` operator.
    Ternary {
        then: Box<EffectsBlock>,
        r#else: Box<EffectsBlock>,
    },
    /// The expression on the right side of the `&&` operator.
    And { expr: Box<EffectsBlock> },
    /// The expression on the right side of the `||` operator.
    Or { expr: Box<EffectsBlock> },
    /// The expression on the right side of the `??` operator.
    NullishCoalescing { expr: Box<EffectsBlock> },
}

impl ConditionalKind {
    /// Normalizes all contained values.
    pub fn normalize(&mut self) {
        match self {
            ConditionalKind::If { then: block }
            | ConditionalKind::Else { r#else: block }
            | ConditionalKind::And { expr: block, .. }
            | ConditionalKind::Or { expr: block, .. }
            | ConditionalKind::NullishCoalescing { expr: block, .. } => {
                for effect in &mut block.effects {
                    effect.normalize();
                }
            }
            ConditionalKind::IfElse { then, r#else, .. }
            | ConditionalKind::Ternary { then, r#else, .. } => {
                for effect in &mut then.effects {
                    effect.normalize();
                }
                for effect in &mut r#else.effects {
                    effect.normalize();
                }
            }
            ConditionalKind::IfElseMultiple { then, r#else, .. } => {
                for block in then.iter_mut().chain(r#else.iter_mut()) {
                    for effect in &mut block.effects {
                        effect.normalize();
                    }
                }
            }
        }
    }
}

#[derive(Debug, Clone)]
pub enum EffectArg {
    Value(JsValue),
    Closure(JsValue, Box<EffectsBlock>),
    Spread,
}

impl EffectArg {
    /// Normalizes all contained values.
    pub fn normalize(&mut self) {
        match self {
            EffectArg::Value(value) => value.normalize(),
            EffectArg::Closure(value, effects) => {
                value.normalize();
                for effect in &mut effects.effects {
                    effect.normalize();
                }
            }
            EffectArg::Spread => {}
        }
    }
}

#[derive(Debug, Clone)]
pub enum Effect {
    /// Some condition which affects which effects might be executed. If the
    /// condition evaluates to some compile-time constant, we can use that
    /// to determine which effects are executed and remove the others.
    Conditional {
        condition: Box<JsValue>,
        kind: Box<ConditionalKind>,
        /// The ast path to the condition.
        ast_path: Vec<AstParentKind>,
        span: Span,
        in_try: bool,
    },
    /// A function call or a new call of a function.
    Call {
        func: Box<JsValue>,
        args: Vec<EffectArg>,
        ast_path: Vec<AstParentKind>,
        span: Span,
        in_try: bool,
        new: bool,
    },
    /// A function call or a new call of a property of an object.
    MemberCall {
        obj: Box<JsValue>,
        prop: Box<JsValue>,
        args: Vec<EffectArg>,
        ast_path: Vec<AstParentKind>,
        span: Span,
        in_try: bool,
        new: bool,
    },
    /// A property access.
    Member {
        obj: Box<JsValue>,
        prop: Box<JsValue>,
        ast_path: Vec<AstParentKind>,
        span: Span,
        in_try: bool,
    },
    /// A reference to an imported binding.
    ImportedBinding {
        esm_reference_index: usize,
        export: Option<RcStr>,
        ast_path: Vec<AstParentKind>,
        span: Span,
        in_try: bool,
    },
    /// A reference to a free var access.
    FreeVar {
        var: Box<JsValue>,
        ast_path: Vec<AstParentKind>,
        span: Span,
        in_try: bool,
    },
    /// A typeof expression
    TypeOf {
        arg: Box<JsValue>,
        ast_path: Vec<AstParentKind>,
        span: Span,
    },
    // TODO ImportMeta should be replaced with Member
    /// A reference to `import.meta`.
    ImportMeta {
        ast_path: Vec<AstParentKind>,
        span: Span,
        in_try: bool,
    },
    /// Unreachable code, e.g. after a `return` statement.
    Unreachable { start_ast_path: Vec<AstParentKind> },
}

impl Effect {
    /// Normalizes all contained values.
    pub fn normalize(&mut self) {
        match self {
            Effect::Conditional {
                condition, kind, ..
            } => {
                condition.normalize();
                kind.normalize();
            }
            Effect::Call { func, args, .. } => {
                func.normalize();
                for arg in args.iter_mut() {
                    arg.normalize();
                }
            }
            Effect::MemberCall {
                obj, prop, args, ..
            } => {
                obj.normalize();
                prop.normalize();
                for arg in args.iter_mut() {
                    arg.normalize();
                }
            }
            Effect::Member { obj, prop, .. } => {
                obj.normalize();
                prop.normalize();
            }
            Effect::FreeVar { var, .. } => {
                var.normalize();
            }
            Effect::ImportedBinding { .. } => {}
            Effect::TypeOf { arg, .. } => {
                arg.normalize();
            }
            Effect::ImportMeta { .. } => {}
            Effect::Unreachable { .. } => {}
        }
    }
}

#[derive(Debug)]
pub struct VarGraph {
    pub values: FxHashMap<Id, JsValue>,
    /// Map FreeVar names to their Id to facilitate lookups into [values]
    pub free_var_ids: FxHashMap<Atom, Id>,

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
        free_var_ids: Default::default(),
        effects: Default::default(),
    };

    m.visit_with_ast_path(
        &mut Analyzer {
            data: &mut graph,
            eval_context,
            effects: Default::default(),
            hoisted_effects: Default::default(),
            early_return_stack: Default::default(),
            var_decl_kind: Default::default(),
            current_value: Default::default(),
            cur_fn_return_values: Default::default(),
            cur_fn_ident: Default::default(),
        },
        &mut Default::default(),
    );

    graph.normalize();

    graph
}

/// A context used for assembling the evaluation graph.
#[derive(Debug)]
pub struct EvalContext {
    pub(crate) unresolved_mark: Mark,
    pub(crate) top_level_mark: Mark,
    pub(crate) imports: ImportMap,
}

impl EvalContext {
    /// Produce a new [EvalContext] from a [Program]. If you wish to support
    /// webpackIgnore or turbopackIgnore comments, you must pass those in,
    /// since the AST does not include comments by default.
    pub fn new(
        module: &Program,
        unresolved_mark: Mark,
        top_level_mark: Mark,
        comments: Option<&dyn Comments>,
        source: Option<ResolvedVc<Box<dyn Source>>>,
    ) -> Self {
        Self {
            unresolved_mark,
            top_level_mark,
            imports: ImportMap::analyze(module, source, comments),
        }
    }

    pub fn is_esm(&self, specified_type: SpecifiedModuleType) -> bool {
        self.imports.is_esm(specified_type)
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

    fn eval_member_prop(&self, prop: &MemberProp) -> Option<JsValue> {
        match prop {
            MemberProp::Ident(ident) => Some(ident.sym.clone().into()),
            MemberProp::Computed(ComputedPropName { expr, .. }) => Some(self.eval(expr)),
            MemberProp::PrivateName(_) => None,
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
                        None => return JsValue::unknown_empty(true, ""),
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

    fn eval_ident(&self, i: &Ident) -> JsValue {
        let id = i.to_id();
        if let Some(imported) = self.imports.get_import(&id) {
            return imported;
        }
        if is_unresolved(i, self.unresolved_mark) {
            JsValue::FreeVar(i.sym.clone())
        } else {
            JsValue::Variable(id)
        }
    }

    pub fn eval(&self, e: &Expr) -> JsValue {
        debug_assert!(
            GLOBALS.is_set(),
            "Eval requires globals from its parsed result"
        );
        match e {
            Expr::Paren(e) => self.eval(&e.expr),
            Expr::Lit(e) => JsValue::Constant(e.clone().into()),
            Expr::Ident(i) => self.eval_ident(i),

            Expr::Unary(UnaryExpr {
                op: op!("!"), arg, ..
            }) => {
                let arg = self.eval(arg);

                JsValue::logical_not(Box::new(arg))
            }

            Expr::Unary(UnaryExpr {
                op: op!("typeof"),
                arg,
                ..
            }) => {
                let arg = self.eval(arg);

                JsValue::type_of(Box::new(arg))
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
                op: op!("&&"),
                left,
                right,
                ..
            }) => JsValue::logical_and(vec![self.eval(left), self.eval(right)]),

            Expr::Bin(BinExpr {
                op: op!("||"),
                left,
                right,
                ..
            }) => JsValue::logical_or(vec![self.eval(left), self.eval(right)]),

            Expr::Bin(BinExpr {
                op: op!("??"),
                left,
                right,
                ..
            }) => JsValue::nullish_coalescing(vec![self.eval(left), self.eval(right)]),

            Expr::Bin(BinExpr {
                op: op!("=="),
                left,
                right,
                ..
            }) => JsValue::equal(Box::new(self.eval(left)), Box::new(self.eval(right))),

            Expr::Bin(BinExpr {
                op: op!("!="),
                left,
                right,
                ..
            }) => JsValue::not_equal(Box::new(self.eval(left)), Box::new(self.eval(right))),

            Expr::Bin(BinExpr {
                op: op!("==="),
                left,
                right,
                ..
            }) => JsValue::strict_equal(Box::new(self.eval(left)), Box::new(self.eval(right))),

            Expr::Bin(BinExpr {
                op: op!("!=="),
                left,
                right,
                ..
            }) => JsValue::strict_not_equal(Box::new(self.eval(left)), Box::new(self.eval(right))),

            &Expr::Cond(CondExpr {
                box ref cons,
                box ref alt,
                box ref test,
                ..
            }) => {
                let test = self.eval(test);
                if let Some(truthy) = test.is_truthy() {
                    if truthy {
                        self.eval(cons)
                    } else {
                        self.eval(alt)
                    }
                } else {
                    JsValue::tenary(
                        Box::new(test),
                        Box::new(self.eval(cons)),
                        Box::new(self.eval(alt)),
                    )
                }
            }

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
                    JsValue::unknown_empty(true, "tagged template literal is not supported yet")
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

            Expr::Await(AwaitExpr { arg, .. }) => self.eval(arg),

            Expr::Seq(e) => {
                let mut seq = e.exprs.iter().map(|e| self.eval(e)).peekable();
                let mut side_effects = false;
                let mut last = seq.next().unwrap();
                for e in seq {
                    side_effects |= last.has_side_effects();
                    last = e;
                }
                if side_effects {
                    last.make_unknown(true, "sequence with side effects");
                }
                last
            }

            Expr::Member(MemberExpr {
                obj,
                prop: MemberProp::Ident(prop),
                ..
            }) => {
                let obj = self.eval(obj);
                JsValue::member(Box::new(obj), Box::new(prop.sym.clone().into()))
            }

            Expr::Member(MemberExpr {
                obj,
                prop: MemberProp::Computed(computed),
                ..
            }) => {
                let obj = self.eval(obj);
                let prop = self.eval(&computed.expr);
                JsValue::member(Box::new(obj), Box::new(prop))
            }

            Expr::New(NewExpr {
                callee: box callee,
                args,
                ..
            }) => {
                // We currently do not handle spreads.
                if args.iter().flatten().any(|arg| arg.spread.is_some()) {
                    return JsValue::unknown_empty(true, "spread in new calls is not supported");
                }

                let args: Vec<_> = args
                    .iter()
                    .flatten()
                    .map(|arg| self.eval(&arg.expr))
                    .collect();
                let callee = Box::new(self.eval(callee));

                JsValue::new(callee, args)
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
                        "spread in function calls is not supported",
                    );
                }

                let args = args.iter().map(|arg| self.eval(&arg.expr)).collect();
                if let Expr::Member(MemberExpr { obj, prop, .. }) = unparen(callee) {
                    let obj = Box::new(self.eval(obj));
                    let prop = Box::new(match prop {
                        // TODO avoid clone
                        MemberProp::Ident(i) => i.sym.clone().into(),
                        MemberProp::PrivateName(_) => {
                            return JsValue::unknown_empty(
                                false,
                                "private names in function calls is not supported",
                            );
                        }
                        MemberProp::Computed(ComputedPropName { expr, .. }) => self.eval(expr),
                    });
                    JsValue::member_call(obj, prop, args)
                } else {
                    let callee = Box::new(self.eval(callee));

                    JsValue::call(callee, args)
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
                        "spread in function calls is not supported",
                    );
                }

                let args = args.iter().map(|arg| self.eval(&arg.expr)).collect();

                JsValue::super_call(args)
            }

            Expr::Call(CallExpr {
                callee: Callee::Import(_),
                args,
                ..
            }) => {
                // We currently do not handle spreads.
                if args.iter().any(|arg| arg.spread.is_some()) {
                    return JsValue::unknown_empty(true, "spread in import() is not supported");
                }
                let args = args.iter().map(|arg| self.eval(&arg.expr)).collect();

                let callee = Box::new(JsValue::FreeVar(js_word!("import")));

                JsValue::call(callee, args)
            }

            Expr::Array(arr) => {
                if arr.elems.iter().flatten().any(|v| v.spread.is_some()) {
                    return JsValue::unknown_empty(true, "spread is not supported");
                }

                let arr = arr
                    .elems
                    .iter()
                    .map(|e| match e {
                        Some(e) => self.eval(&e.expr),
                        _ => JsValue::FreeVar(js_word!("undefined")),
                    })
                    .collect();
                JsValue::array(arr)
            }

            Expr::Object(obj) => JsValue::object(
                obj.props
                    .iter()
                    .map(|prop| match prop {
                        PropOrSpread::Spread(SpreadElement { expr, .. }) => {
                            ObjectPart::Spread(self.eval(expr))
                        }
                        PropOrSpread::Prop(box Prop::KeyValue(KeyValueProp { key, box value })) => {
                            ObjectPart::KeyValue(self.eval_prop_name(key), self.eval(value))
                        }
                        PropOrSpread::Prop(box Prop::Shorthand(ident)) => ObjectPart::KeyValue(
                            ident.sym.clone().into(),
                            self.eval(&Expr::Ident(ident.clone())),
                        ),
                        _ => ObjectPart::Spread(JsValue::unknown_empty(
                            true,
                            "unsupported object part",
                        )),
                    })
                    .collect(),
            ),

            Expr::MetaProp(MetaPropExpr {
                kind: MetaPropKind::ImportMeta,
                ..
            }) => JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta),

            _ => JsValue::unknown_empty(true, "unsupported expression"),
        }
    }
}

enum EarlyReturn {
    Always {
        prev_effects: Vec<Effect>,
        start_ast_path: Vec<AstParentKind>,
    },
    Conditional {
        prev_effects: Vec<Effect>,
        start_ast_path: Vec<AstParentKind>,

        condition: Box<JsValue>,
        then: Option<Box<EffectsBlock>>,
        r#else: Option<Box<EffectsBlock>>,
        /// The ast path to the condition.
        condition_ast_path: Vec<AstParentKind>,
        span: Span,
        in_try: bool,

        early_return_condition_value: bool,
    },
}

pub fn as_parent_path_skip(
    ast_path: &AstNodePath<AstParentNodeRef<'_>>,
    skip: usize,
) -> Vec<AstParentKind> {
    ast_path
        .iter()
        .take(ast_path.len() - skip)
        .map(|n| n.kind())
        .collect()
}

struct Analyzer<'a> {
    data: &'a mut VarGraph,

    effects: Vec<Effect>,
    hoisted_effects: Vec<Effect>,
    early_return_stack: Vec<EarlyReturn>,

    eval_context: &'a EvalContext,

    var_decl_kind: Option<VarDeclKind>,

    /// Used for patterns
    current_value: Option<JsValue>,

    /// Return values of the current function.
    ///
    /// This is configured to [Some] by function handlers and filled by the
    /// return statement handler.
    cur_fn_return_values: Option<Vec<JsValue>>,

    cur_fn_ident: u32,
}

pub fn as_parent_path(ast_path: &AstNodePath<AstParentNodeRef<'_>>) -> Vec<AstParentKind> {
    ast_path.iter().map(|n| n.kind()).collect()
}

pub fn as_parent_path_with(
    ast_path: &AstNodePath<AstParentNodeRef<'_>>,
    additional: AstParentKind,
) -> Vec<AstParentKind> {
    ast_path
        .iter()
        .map(|n| n.kind())
        .chain([additional])
        .collect()
}

pub fn is_in_try(ast_path: &AstNodePath<AstParentNodeRef<'_>>) -> bool {
    ast_path
        .iter()
        .rev()
        .find_map(|ast_ref| match ast_ref.kind() {
            AstParentKind::ArrowExpr(ArrowExprField::Body) => Some(false),
            AstParentKind::Function(FunctionField::Body) => Some(false),
            AstParentKind::TryStmt(TryStmtField::Block) => Some(true),
            _ => None,
        })
        .unwrap_or(false)
}

enum CallOrNewExpr<'ast> {
    Call(&'ast CallExpr),
    New(&'ast NewExpr),
}
impl CallOrNewExpr<'_> {
    fn as_call(&self) -> Option<&CallExpr> {
        match *self {
            CallOrNewExpr::Call(n) => Some(n),
            CallOrNewExpr::New(_) => None,
        }
    }
    fn as_new(&self) -> Option<&NewExpr> {
        match *self {
            CallOrNewExpr::Call(_) => None,
            CallOrNewExpr::New(n) => Some(n),
        }
    }
}

impl Analyzer<'_> {
    fn add_value(&mut self, id: Id, value: JsValue) {
        if is_unresolved_id(&id, self.eval_context.unresolved_mark) {
            self.data.free_var_ids.insert(id.0.clone(), id.clone());
        }

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

    fn add_effect(&mut self, effect: Effect) {
        self.effects.push(effect);
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
                let mut ast_path =
                    ast_path.with_guard(AstParentNodeRef::Expr(expr, ExprField::Paren));
                let mut ast_path = ast_path.with_guard(AstParentNodeRef::ParenExpr(
                    inner_expr,
                    ParenExprField::Expr,
                ));
                unparen(&inner_expr.expr, &mut ast_path, f)
            } else {
                f(expr, ast_path)
            }
        }

        if n.args.iter().any(|arg| arg.spread.is_some()) {
            return false;
        }

        let Some(expr) = n.callee.as_expr() else {
            return false;
        };

        let fn_expr = {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::CallExpr(n, CallExprField::Callee));
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::Callee(&n.callee, CalleeField::Expr));
            unparen(expr, &mut ast_path, |expr, ast_path| match expr {
                Expr::Fn(fn_expr @ FnExpr { function, ident }) => {
                    let mut ast_path =
                        ast_path.with_guard(AstParentNodeRef::Expr(expr, ExprField::Fn));
                    {
                        let mut ast_path = ast_path
                            .with_guard(AstParentNodeRef::FnExpr(fn_expr, FnExprField::Ident));
                        self.visit_opt_ident(ident, &mut ast_path);

                        // We cannot analyze recursive IIFE
                        if let Some(ident) = ident {
                            if contains_ident_ref(&function.body, &ident.to_id()) {
                                return false;
                            }
                        }
                    }

                    {
                        let mut ast_path = ast_path
                            .with_guard(AstParentNodeRef::FnExpr(fn_expr, FnExprField::Function));
                        self.handle_iife_function(function, &mut ast_path, &n.args);
                    }

                    true
                }

                Expr::Arrow(arrow_expr) => {
                    let mut ast_path =
                        ast_path.with_guard(AstParentNodeRef::Expr(expr, ExprField::Arrow));
                    let args = &n.args;
                    self.handle_iife_arrow(arrow_expr, args, &mut ast_path);
                    true
                }
                _ => false,
            })
        };

        if !fn_expr {
            return false;
        }

        let mut ast_path = ast_path.with_guard(AstParentNodeRef::CallExpr(
            n,
            CallExprField::Args(usize::MAX),
        ));

        self.visit_expr_or_spreads(&n.args, &mut ast_path);

        true
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
            ctxt: _,
        } = arrow_expr;
        let mut iter = args.iter();
        for (i, param) in params.iter().enumerate() {
            let mut ast_path = ast_path.with_guard(AstParentNodeRef::ArrowExpr(
                arrow_expr,
                ArrowExprField::Params(i),
            ));
            if let Some(arg) = iter.next() {
                self.current_value = Some(self.eval_context.eval(&arg.expr));
                self.visit_pat(param, &mut ast_path);
                self.current_value = None;
            } else {
                self.visit_pat(param, &mut ast_path);
            }
        }
        {
            let mut ast_path = ast_path.with_guard(AstParentNodeRef::ArrowExpr(
                arrow_expr,
                ArrowExprField::Body,
            ));
            self.visit_block_stmt_or_expr(body, &mut ast_path);
        }

        {
            let mut ast_path = ast_path.with_guard(AstParentNodeRef::ArrowExpr(
                arrow_expr,
                ArrowExprField::ReturnType,
            ));
            self.visit_opt_ts_type_ann(return_type, &mut ast_path);
        }

        {
            let mut ast_path = ast_path.with_guard(AstParentNodeRef::ArrowExpr(
                arrow_expr,
                ArrowExprField::TypeParams,
            ));
            self.visit_opt_ts_type_param_decl(type_params, &mut ast_path);
        }
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
            ctxt: _,
        } = function;
        for (i, param) in params.iter().enumerate() {
            let mut ast_path = ast_path.with_guard(AstParentNodeRef::Function(
                function,
                FunctionField::Params(i),
            ));
            if let Some(arg) = iter.next() {
                self.current_value = Some(self.eval_context.eval(&arg.expr));
                self.visit_param(param, &mut ast_path);
                self.current_value = None;
            } else {
                self.visit_param(param, &mut ast_path);
            }
        }

        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::Function(function, FunctionField::Body));

            self.visit_opt_block_stmt(body, &mut ast_path);
        }

        {
            let mut ast_path = ast_path.with_guard(AstParentNodeRef::Function(
                function,
                FunctionField::Decorators(usize::MAX),
            ));

            self.visit_decorators(decorators, &mut ast_path);
        }

        {
            let mut ast_path = ast_path.with_guard(AstParentNodeRef::Function(
                function,
                FunctionField::ReturnType,
            ));

            self.visit_opt_ts_type_ann(return_type, &mut ast_path);
        }

        {
            let mut ast_path = ast_path.with_guard(AstParentNodeRef::Function(
                function,
                FunctionField::TypeParams,
            ));

            self.visit_opt_ts_type_param_decl(type_params, &mut ast_path);
        }
    }

    fn check_call_expr_for_effects<'ast: 'r, 'n, 'r>(
        &mut self,
        callee: &'n Callee,
        args: impl Iterator<Item = &'ast ExprOrSpread>,
        span: Span,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
        n: CallOrNewExpr<'ast>,
    ) {
        let new = n.as_new().is_some();
        let args = args
            .enumerate()
            .map(|(i, arg)| {
                let mut ast_path = ast_path.with_guard(match n {
                    CallOrNewExpr::Call(n) => AstParentNodeRef::CallExpr(n, CallExprField::Args(i)),
                    CallOrNewExpr::New(n) => AstParentNodeRef::NewExpr(n, NewExprField::Args(i)),
                });
                if arg.spread.is_none() {
                    let value = self.eval_context.eval(&arg.expr);

                    let block_path = match &*arg.expr {
                        Expr::Fn(FnExpr { .. }) => {
                            let mut path = as_parent_path(&ast_path);
                            path.push(AstParentKind::ExprOrSpread(ExprOrSpreadField::Expr));
                            path.push(AstParentKind::Expr(ExprField::Fn));
                            path.push(AstParentKind::FnExpr(FnExprField::Function));
                            path.push(AstParentKind::Function(FunctionField::Body));
                            Some(path)
                        }
                        Expr::Arrow(ArrowExpr {
                            body: box BlockStmtOrExpr::BlockStmt(_),
                            ..
                        }) => {
                            let mut path = as_parent_path(&ast_path);
                            path.push(AstParentKind::ExprOrSpread(ExprOrSpreadField::Expr));
                            path.push(AstParentKind::Expr(ExprField::Arrow));
                            path.push(AstParentKind::ArrowExpr(ArrowExprField::Body));
                            path.push(AstParentKind::BlockStmtOrExpr(
                                BlockStmtOrExprField::BlockStmt,
                            ));
                            Some(path)
                        }
                        Expr::Arrow(ArrowExpr {
                            body: box BlockStmtOrExpr::Expr(_),
                            ..
                        }) => {
                            let mut path = as_parent_path(&ast_path);
                            path.push(AstParentKind::ExprOrSpread(ExprOrSpreadField::Expr));
                            path.push(AstParentKind::Expr(ExprField::Arrow));
                            path.push(AstParentKind::ArrowExpr(ArrowExprField::Body));
                            path.push(AstParentKind::BlockStmtOrExpr(BlockStmtOrExprField::Expr));
                            Some(path)
                        }
                        _ => None,
                    };
                    if let Some(path) = block_path {
                        let old_effects = take(&mut self.effects);
                        arg.visit_with_ast_path(self, &mut ast_path);
                        let effects = replace(&mut self.effects, old_effects);
                        EffectArg::Closure(
                            value,
                            Box::new(EffectsBlock {
                                effects,
                                range: AstPathRange::Exact(path),
                            }),
                        )
                    } else {
                        arg.visit_with_ast_path(self, &mut ast_path);
                        EffectArg::Value(value)
                    }
                } else {
                    arg.visit_with_ast_path(self, &mut ast_path);
                    EffectArg::Spread
                }
            })
            .collect();

        match callee {
            Callee::Import(_) => {
                self.add_effect(Effect::Call {
                    func: Box::new(JsValue::FreeVar(js_word!("import"))),
                    args,
                    ast_path: as_parent_path(ast_path),
                    span,
                    in_try: is_in_try(ast_path),
                    new,
                });
            }
            Callee::Expr(box expr) => {
                if let Expr::Member(MemberExpr { obj, prop, .. }) = unparen(expr) {
                    let obj_value = Box::new(self.eval_context.eval(obj));
                    let prop_value = match prop {
                        // TODO avoid clone
                        MemberProp::Ident(i) => Box::new(i.sym.clone().into()),
                        MemberProp::PrivateName(_) => {
                            return;
                        }
                        MemberProp::Computed(ComputedPropName { expr, .. }) => {
                            Box::new(self.eval_context.eval(expr))
                        }
                    };
                    self.add_effect(Effect::MemberCall {
                        obj: obj_value,
                        prop: prop_value,
                        args,
                        ast_path: as_parent_path(ast_path),
                        span,
                        in_try: is_in_try(ast_path),
                        new,
                    });
                } else {
                    let fn_value = Box::new(self.eval_context.eval(expr));
                    self.add_effect(Effect::Call {
                        func: fn_value,
                        args,
                        ast_path: as_parent_path(ast_path),
                        span,
                        in_try: is_in_try(ast_path),
                        new,
                    });
                }
            }
            Callee::Super(_) => self.add_effect(Effect::Call {
                func: Box::new(
                    self.eval_context
                        // Unwrap because `new super(..)` isn't valid anyway
                        .eval(&Expr::Call(n.as_call().unwrap().clone())),
                ),
                args,
                ast_path: as_parent_path(ast_path),
                span,
                in_try: is_in_try(ast_path),
                new,
            }),
        }
    }

    fn check_member_expr_for_effects<'ast: 'r, 'r>(
        &mut self,
        member_expr: &'ast MemberExpr,
        ast_path: &AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let obj_value = Box::new(self.eval_context.eval(&member_expr.obj));
        let prop_value = match &member_expr.prop {
            // TODO avoid clone
            MemberProp::Ident(i) => Box::new(i.sym.clone().into()),
            MemberProp::PrivateName(_) => {
                return;
            }
            MemberProp::Computed(ComputedPropName { expr, .. }) => {
                Box::new(self.eval_context.eval(expr))
            }
        };
        self.add_effect(Effect::Member {
            obj: obj_value,
            prop: prop_value,
            ast_path: as_parent_path(ast_path),
            span: member_expr.span(),
            in_try: is_in_try(ast_path),
        });
    }

    fn take_return_values(&mut self) -> Box<JsValue> {
        let values = self.cur_fn_return_values.take().unwrap();

        Box::new(match values.len() {
            0 => JsValue::FreeVar(js_word!("undefined")),
            1 => values.into_iter().next().unwrap(),
            _ => JsValue::alternatives(values),
        })
    }

    /// Ends a conditional block. All early returns are integrated into the
    /// effects. Returns true if the whole block always early returns.
    fn end_early_return_block(&mut self) -> bool {
        let mut always_returns = false;
        while let Some(early_return) = self.early_return_stack.pop() {
            match early_return {
                EarlyReturn::Always {
                    prev_effects,
                    start_ast_path,
                } => {
                    self.effects = prev_effects;
                    self.effects.push(Effect::Unreachable { start_ast_path });
                    always_returns = true;
                }
                EarlyReturn::Conditional {
                    prev_effects,
                    start_ast_path,
                    condition,
                    then,
                    r#else,
                    condition_ast_path,
                    span,
                    in_try,
                    early_return_condition_value,
                } => {
                    let block = Box::new(EffectsBlock {
                        effects: take(&mut self.effects),
                        range: AstPathRange::StartAfter(start_ast_path),
                    });
                    self.effects = prev_effects;
                    let kind = match (then, r#else, early_return_condition_value) {
                        (None, None, false) => ConditionalKind::If { then: block },
                        (None, None, true) => ConditionalKind::IfElseMultiple {
                            then: vec![block],
                            r#else: vec![],
                        },
                        (Some(then), None, false) => ConditionalKind::IfElseMultiple {
                            then: vec![then, block],
                            r#else: vec![],
                        },
                        (Some(then), None, true) => ConditionalKind::IfElse {
                            then,
                            r#else: block,
                        },
                        (Some(then), Some(r#else), false) => ConditionalKind::IfElseMultiple {
                            then: vec![then, block],
                            r#else: vec![r#else],
                        },
                        (Some(then), Some(r#else), true) => ConditionalKind::IfElseMultiple {
                            then: vec![then],
                            r#else: vec![r#else, block],
                        },
                        (None, Some(r#else), false) => ConditionalKind::IfElse {
                            then: block,
                            r#else,
                        },
                        (None, Some(r#else), true) => ConditionalKind::IfElseMultiple {
                            then: vec![],
                            r#else: vec![r#else, block],
                        },
                    };
                    self.effects.push(Effect::Conditional {
                        condition,
                        kind: Box::new(kind),
                        ast_path: condition_ast_path,
                        span,
                        in_try,
                    })
                }
            }
        }
        always_returns
    }
}

impl VisitAstPath for Analyzer<'_> {
    fn visit_assign_expr<'ast: 'r, 'r>(
        &mut self,
        n: &'ast AssignExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::AssignExpr(n, AssignExprField::Left));

            match n.op {
                AssignOp::Assign => {
                    self.current_value = Some(self.eval_context.eval(&n.right));
                    n.left.visit_children_with_ast_path(self, &mut ast_path);
                    self.current_value = None;
                }

                _ => {
                    if let Some(key) = n.left.as_ident() {
                        let value = match n.op {
                            AssignOp::AndAssign | AssignOp::OrAssign | AssignOp::NullishAssign => {
                                let right = self.eval_context.eval(&n.right);
                                // We can handle the right value as alternative to the existing
                                // value
                                Some(right)
                            }
                            AssignOp::AddAssign => {
                                let left = self.eval_context.eval(&Expr::Ident(key.clone().into()));

                                let right = self.eval_context.eval(&n.right);

                                Some(JsValue::add(vec![left, right]))
                            }
                            _ => Some(JsValue::unknown_empty(true, "unsupported assign operation")),
                        };
                        if let Some(value) = value {
                            // We should visit this to handle `+=` like
                            //
                            // clientComponentLoadTimes += performance.now() - startTime

                            self.current_value = Some(value);
                            n.left.visit_children_with_ast_path(self, &mut ast_path);
                            self.current_value = None;
                        }
                    }

                    if n.left.as_ident().is_none() {
                        n.left.visit_children_with_ast_path(self, &mut ast_path);
                    }
                }
            }
        }

        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::AssignExpr(n, AssignExprField::Right));
            self.visit_expr(&n.right, &mut ast_path);
        }
    }

    fn visit_update_expr<'ast: 'r, 'r>(
        &mut self,
        n: &'ast UpdateExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if let Some(key) = n.arg.as_ident() {
            self.add_value(
                key.to_id(),
                JsValue::unknown_empty(true, "updated with update expression"),
            );
        }

        let mut ast_path =
            ast_path.with_guard(AstParentNodeRef::UpdateExpr(n, UpdateExprField::Arg));
        self.visit_expr(&n.arg, &mut ast_path);
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
                        JsValue::unknown_if(
                            self.eval_context
                                .imports
                                .get_attributes(n.callee.span())
                                .ignore,
                            JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
                            true,
                            "ignored require",
                        ),
                    );
                }
            }
        }

        if self.check_iife(n, ast_path) {
            return;
        }

        // special behavior of IIFEs
        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::CallExpr(n, CallExprField::Callee));
            n.callee.visit_with_ast_path(self, &mut ast_path);
        }

        self.check_call_expr_for_effects(
            &n.callee,
            n.args.iter(),
            n.span(),
            ast_path,
            CallOrNewExpr::Call(n),
        );
    }

    fn visit_new_expr<'ast: 'r, 'r>(
        &mut self,
        n: &'ast NewExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::NewExpr(n, NewExprField::Callee));
            n.callee.visit_with_ast_path(self, &mut ast_path);
        }

        self.check_call_expr_for_effects(
            &Callee::Expr(n.callee.clone()),
            n.args.iter().flatten(),
            n.span(),
            ast_path,
            CallOrNewExpr::New(n),
        );
    }

    fn visit_member_expr<'ast: 'r, 'r>(
        &mut self,
        member_expr: &'ast MemberExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.check_member_expr_for_effects(member_expr, ast_path);
        member_expr.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_expr<'ast: 'r, 'r>(
        &mut self,
        n: &'ast Expr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let old = self.var_decl_kind;
        self.var_decl_kind = None;
        n.visit_children_with_ast_path(self, ast_path);
        self.var_decl_kind = old;
    }

    fn visit_params<'ast: 'r, 'r>(
        &mut self,
        n: &'ast [Param],
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let value = self.current_value.take();
        for (index, p) in n.iter().enumerate() {
            self.current_value = Some(JsValue::Argument(self.cur_fn_ident, index));
            let mut ast_path = ast_path.with_index_guard(index);
            p.visit_with_ast_path(self, &mut ast_path);
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
        {
            let mut ast_path = ast_path.with_guard(AstParentNodeRef::Param(
                n,
                ParamField::Decorators(usize::MAX),
            ));
            self.visit_decorators(decorators, &mut ast_path);
        }
        self.current_value = value;
        {
            let mut ast_path = ast_path.with_guard(AstParentNodeRef::Param(n, ParamField::Pat));
            self.visit_pat(pat, &mut ast_path);
        }
        self.current_value = None;
        self.var_decl_kind = old;
    }

    fn visit_fn_decl<'ast: 'r, 'r>(
        &mut self,
        decl: &'ast FnDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let old = replace(
            &mut self.cur_fn_return_values,
            Some(get_fn_init_return_vals(decl.function.body.as_ref())),
        );
        let old_ident = self.cur_fn_ident;
        self.cur_fn_ident = decl.function.span.lo.0;
        decl.visit_children_with_ast_path(self, ast_path);
        let return_value = self.take_return_values();
        self.hoisted_effects.append(&mut self.effects);

        self.add_value(
            decl.ident.to_id(),
            JsValue::function(self.cur_fn_ident, return_value),
        );

        self.cur_fn_ident = old_ident;
        self.cur_fn_return_values = old;
    }

    fn visit_fn_expr<'ast: 'r, 'r>(
        &mut self,
        expr: &'ast FnExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let old = replace(
            &mut self.cur_fn_return_values,
            Some(get_fn_init_return_vals(expr.function.body.as_ref())),
        );
        let old_ident = self.cur_fn_ident;
        self.cur_fn_ident = expr.function.span.lo.0;
        expr.visit_children_with_ast_path(self, ast_path);
        let return_value = self.take_return_values();

        if let Some(ident) = &expr.ident {
            self.add_value(
                ident.to_id(),
                JsValue::function(self.cur_fn_ident, return_value),
            );
        } else {
            self.add_value(
                (
                    format!("*anonymous function {}*", expr.function.span.lo.0).into(),
                    SyntaxContext::empty(),
                ),
                JsValue::function(self.cur_fn_ident, return_value),
            );
        }

        self.cur_fn_ident = old_ident;
        self.cur_fn_return_values = old;
    }

    fn visit_arrow_expr<'ast: 'r, 'r>(
        &mut self,
        expr: &'ast ArrowExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let old_return_values = replace(
            &mut self.cur_fn_return_values,
            expr.body
                .as_block_stmt()
                .map(|block| get_fn_init_return_vals(Some(block))),
        );
        let old_ident = self.cur_fn_ident;
        self.cur_fn_ident = expr.span.lo.0;

        let value = self.current_value.take();
        for (index, p) in expr.params.iter().enumerate() {
            self.current_value = Some(JsValue::Argument(self.cur_fn_ident, index));
            let mut ast_path = ast_path.with_guard(AstParentNodeRef::ArrowExpr(
                expr,
                ArrowExprField::Params(index),
            ));
            p.visit_with_ast_path(self, &mut ast_path);
        }
        self.current_value = value;

        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::ArrowExpr(expr, ArrowExprField::Body));
            expr.body.visit_with_ast_path(self, &mut ast_path);
        }

        let return_value = match &*expr.body {
            BlockStmtOrExpr::BlockStmt(_) => self.take_return_values(),
            BlockStmtOrExpr::Expr(inner_expr) => Box::new(self.eval_context.eval(inner_expr)),
        };

        self.add_value(
            (
                format!("*arrow function {}*", expr.span.lo.0).into(),
                SyntaxContext::empty(),
            ),
            JsValue::function(self.cur_fn_ident, return_value),
        );

        self.cur_fn_ident = old_ident;
        self.cur_fn_return_values = old_return_values;
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
        decl.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_var_decl<'ast: 'r, 'r>(
        &mut self,
        n: &'ast VarDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let old = self.var_decl_kind;
        self.var_decl_kind = Some(n.kind);
        n.visit_children_with_ast_path(self, ast_path);
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
        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::VarDeclarator(n, VarDeclaratorField::Name));

            self.visit_pat(&n.name, &mut ast_path);
        }
        self.current_value = None;
        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::VarDeclarator(n, VarDeclaratorField::Init));

            self.visit_opt_expr(&n.init, &mut ast_path);
        }
    }

    fn visit_for_of_stmt<'ast: 'r, 'r>(
        &mut self,
        n: &'ast ForOfStmt,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::ForOfStmt(n, ForOfStmtField::Right));
            self.current_value = None;
            self.visit_expr(&n.right, &mut ast_path);
        }

        let array = self.eval_context.eval(&n.right);

        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::ForOfStmt(n, ForOfStmtField::Left));
            self.current_value = Some(JsValue::iterated(Box::new(array)));
            self.visit_for_head(&n.left, &mut ast_path);
        }

        let mut ast_path =
            ast_path.with_guard(AstParentNodeRef::ForOfStmt(n, ForOfStmtField::Body));

        self.visit_stmt(&n.body, &mut ast_path);
    }

    fn visit_simple_assign_target<'ast: 'r, 'r>(
        &mut self,
        n: &'ast SimpleAssignTarget,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        let value = self.current_value.take();
        if let SimpleAssignTarget::Ident(i) = n {
            n.visit_children_with_ast_path(self, ast_path);

            self.add_value(
                i.to_id(),
                value.unwrap_or_else(|| {
                    JsValue::unknown(JsValue::Variable(i.to_id()), false, "pattern without value")
                }),
            );
            return;
        }

        n.visit_children_with_ast_path(self, ast_path);
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
                        JsValue::unknown(
                            JsValue::Variable(i.to_id()),
                            false,
                            "pattern without value",
                        )
                    }),
                );
            }

            Pat::Array(arr) => {
                match &value {
                    Some(JsValue::Array { items, .. }) => {
                        let mut ast_path =
                            ast_path.with_guard(AstParentNodeRef::Pat(pat, PatField::Array));
                        for (idx, elem) in arr.elems.iter().enumerate() {
                            self.current_value = items.get(idx).cloned();
                            let mut ast_path = ast_path.with_guard(AstParentNodeRef::ArrayPat(
                                arr,
                                ArrayPatField::Elems(idx),
                            ));
                            elem.visit_with_ast_path(self, &mut ast_path);
                        }

                        // We should not call visit_children_with
                        return;
                    }

                    Some(value) => {
                        let mut ast_path =
                            ast_path.with_guard(AstParentNodeRef::Pat(pat, PatField::Array));
                        for (idx, elem) in arr.elems.iter().enumerate() {
                            self.current_value = Some(JsValue::member(
                                Box::new(value.clone()),
                                Box::new(JsValue::Constant(ConstantValue::Num(ConstantNumber(
                                    idx as f64,
                                )))),
                            ));
                            let mut ast_path = ast_path.with_guard(AstParentNodeRef::ArrayPat(
                                arr,
                                ArrayPatField::Elems(idx),
                            ));
                            elem.visit_with_ast_path(self, &mut ast_path);
                        }
                        // We should not call visit_children_with
                        return;
                    }

                    None => {}
                }
            }

            Pat::Object(obj) => {
                let value =
                    value.unwrap_or_else(|| JsValue::unknown_empty(false, "pattern without value"));

                self.visit_pat_with_value(pat, obj, value, ast_path);

                // We should not call visit_children_with
                return;
            }

            _ => {}
        }
        pat.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_return_stmt<'ast: 'r, 'r>(
        &mut self,
        stmt: &'ast ReturnStmt,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        stmt.visit_children_with_ast_path(self, ast_path);

        if let Some(values) = &mut self.cur_fn_return_values {
            let return_value = stmt
                .arg
                .as_deref()
                .map(|e| self.eval_context.eval(e))
                .unwrap_or(JsValue::FreeVar(js_word!("undefined")));

            values.push(return_value);
        }

        self.early_return_stack.push(EarlyReturn::Always {
            prev_effects: take(&mut self.effects),
            start_ast_path: as_parent_path(ast_path),
        });
    }

    fn visit_ident<'ast: 'r, 'r>(
        &mut self,
        ident: &'ast Ident,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if !(matches!(
            ast_path.last(),
            Some(AstParentNodeRef::Expr(_, ExprField::Ident))
                | Some(AstParentNodeRef::Prop(_, PropField::Shorthand))
        ) || matches!(
            ast_path.get(ast_path.len() - 2),
            Some(AstParentNodeRef::SimpleAssignTarget(
                _,
                SimpleAssignTargetField::Ident,
            ))
        )) {
            return;
        }

        if let Some((esm_reference_index, export)) =
            self.eval_context.imports.get_binding(&ident.to_id())
        {
            if export.is_none()
                && !self
                    .eval_context
                    .imports
                    .should_import_all(esm_reference_index)
            {
                // export.is_none() checks for a namespace import.

                // Note: This is optimization that can be applied if we don't need to
                // import all bindings
                if let Some(AstParentNodeRef::MemberExpr(member, MemberExprField::Obj)) =
                    ast_path.get(ast_path.len() - 2)
                {
                    // Skip if it's on the LHS of assignment
                    let is_lhs = matches!(
                        ast_path.get(ast_path.len() - 3),
                        Some(AstParentNodeRef::SimpleAssignTarget(
                            _,
                            SimpleAssignTargetField::Member
                        ))
                    );

                    if !is_lhs {
                        if let Some(prop) = self.eval_context.eval_member_prop(&member.prop) {
                            if let Some(prop_str) = prop.as_str() {
                                // a namespace member access like
                                // `import * as ns from "..."; ns.exportName`
                                self.add_effect(Effect::ImportedBinding {
                                    esm_reference_index,
                                    export: Some(prop_str.into()),
                                    ast_path: as_parent_path_skip(ast_path, 1),
                                    span: member.span(),
                                    in_try: is_in_try(ast_path),
                                });
                                return;
                            }
                        }
                    }
                }
            }

            self.add_effect(Effect::ImportedBinding {
                esm_reference_index,
                export,
                ast_path: as_parent_path(ast_path),
                span: ident.span(),
                in_try: is_in_try(ast_path),
            })
        } else if is_unresolved(ident, self.eval_context.unresolved_mark) {
            self.add_effect(Effect::FreeVar {
                var: Box::new(JsValue::FreeVar(ident.sym.clone())),
                ast_path: as_parent_path(ast_path),
                span: ident.span(),
                in_try: is_in_try(ast_path),
            })
        }
    }

    fn visit_meta_prop_expr<'ast: 'r, 'r>(
        &mut self,
        expr: &'ast MetaPropExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if expr.kind == MetaPropKind::ImportMeta {
            // MetaPropExpr also covers `new.target`. Only consider `import.meta`
            // an effect.
            self.add_effect(Effect::ImportMeta {
                span: expr.span,
                ast_path: as_parent_path(ast_path),
                in_try: is_in_try(ast_path),
            })
        }
    }

    fn visit_program<'ast: 'r, 'r>(
        &mut self,
        program: &'ast Program,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.effects = take(&mut self.data.effects);
        program.visit_children_with_ast_path(self, ast_path);
        self.end_early_return_block();
        self.effects.append(&mut self.hoisted_effects);
        self.data.effects = take(&mut self.effects);
    }

    fn visit_cond_expr<'ast: 'r, 'r>(
        &mut self,
        expr: &'ast CondExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::CondExpr(expr, CondExprField::Test));
            expr.test.visit_with_ast_path(self, &mut ast_path);
        }

        let prev_effects = take(&mut self.effects);
        let then = {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::CondExpr(expr, CondExprField::Cons));
            expr.cons.visit_with_ast_path(self, &mut ast_path);
            Box::new(EffectsBlock {
                effects: take(&mut self.effects),
                range: AstPathRange::Exact(as_parent_path(&ast_path)),
            })
        };
        let r#else = {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::CondExpr(expr, CondExprField::Alt));
            expr.alt.visit_with_ast_path(self, &mut ast_path);
            Box::new(EffectsBlock {
                effects: take(&mut self.effects),
                range: AstPathRange::Exact(as_parent_path(&ast_path)),
            })
        };
        self.effects = prev_effects;

        self.add_conditional_effect(
            &expr.test,
            ast_path,
            AstParentKind::CondExpr(CondExprField::Test),
            expr.span(),
            ConditionalKind::Ternary { then, r#else },
        );
    }

    fn visit_if_stmt<'ast: 'r, 'r>(
        &mut self,
        stmt: &'ast IfStmt,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::IfStmt(stmt, IfStmtField::Test));
            stmt.test.visit_with_ast_path(self, &mut ast_path);
        }
        let prev_effects = take(&mut self.effects);
        let prev_early_return_stack = take(&mut self.early_return_stack);
        let then_returning;
        let then = {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::IfStmt(stmt, IfStmtField::Cons));
            stmt.cons.visit_with_ast_path(self, &mut ast_path);
            then_returning = self.end_early_return_block();
            Box::new(EffectsBlock {
                effects: take(&mut self.effects),
                range: AstPathRange::Exact(as_parent_path(&ast_path)),
            })
        };
        let mut else_returning = false;
        let r#else = stmt.alt.as_ref().map(|alt| {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::IfStmt(stmt, IfStmtField::Alt));
            alt.visit_with_ast_path(self, &mut ast_path);
            else_returning = self.end_early_return_block();
            Box::new(EffectsBlock {
                effects: take(&mut self.effects),
                range: AstPathRange::Exact(as_parent_path(&ast_path)),
            })
        });
        self.early_return_stack = prev_early_return_stack;
        self.effects = prev_effects;
        self.add_conditional_if_effect_with_early_return(
            &stmt.test,
            ast_path,
            AstParentKind::IfStmt(IfStmtField::Test),
            stmt.span(),
            (!then.is_empty()).then_some(then),
            r#else.and_then(|block| (!block.is_empty()).then_some(block)),
            then_returning,
            else_returning,
        );
    }

    fn visit_try_stmt<'ast: 'r, 'r>(
        &mut self,
        stmt: &'ast TryStmt,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        let prev_effects = take(&mut self.effects);
        let prev_early_return_stack = take(&mut self.early_return_stack);
        let mut block = {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::TryStmt(stmt, TryStmtField::Block));
            stmt.block.visit_with_ast_path(self, &mut ast_path);
            self.end_early_return_block();
            take(&mut self.effects)
        };
        let mut handler = if let Some(handler) = stmt.handler.as_ref() {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::TryStmt(stmt, TryStmtField::Handler));
            handler.visit_with_ast_path(self, &mut ast_path);
            self.end_early_return_block();
            take(&mut self.effects)
        } else {
            vec![]
        };
        self.early_return_stack = prev_early_return_stack;
        self.effects = prev_effects;
        self.effects.append(&mut block);
        self.effects.append(&mut handler);
        if let Some(finalizer) = stmt.finalizer.as_ref() {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::TryStmt(stmt, TryStmtField::Finalizer));
            finalizer.visit_with_ast_path(self, &mut ast_path);
        };
    }

    fn visit_switch_case<'ast: 'r, 'r>(
        &mut self,
        case: &'ast SwitchCase,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        let prev_effects = take(&mut self.effects);
        let prev_early_return_stack = take(&mut self.early_return_stack);
        case.visit_children_with_ast_path(self, ast_path);
        self.end_early_return_block();
        let mut effects = take(&mut self.effects);
        self.early_return_stack = prev_early_return_stack;
        self.effects = prev_effects;
        self.effects.append(&mut effects);
    }

    fn visit_block_stmt<'ast: 'r, 'r>(
        &mut self,
        n: &'ast BlockStmt,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        let block_type = if ast_path.len() < 2 {
            Some(false)
        } else if matches!(
            &ast_path[ast_path.len() - 2..],
            [
                AstParentNodeRef::IfStmt(_, IfStmtField::Cons),
                AstParentNodeRef::Stmt(_, StmtField::Block)
            ] | [
                AstParentNodeRef::IfStmt(_, IfStmtField::Alt),
                AstParentNodeRef::Stmt(_, StmtField::Block)
            ] | [_, AstParentNodeRef::TryStmt(_, TryStmtField::Block,)]
                | [
                    AstParentNodeRef::TryStmt(_, TryStmtField::Handler),
                    AstParentNodeRef::CatchClause(_, CatchClauseField::Body)
                ]
        ) {
            None
        } else if matches!(
            &ast_path[ast_path.len() - 2..],
            [_, AstParentNodeRef::Function(_, FunctionField::Body)]
                | [
                    AstParentNodeRef::ArrowExpr(_, ArrowExprField::Body),
                    AstParentNodeRef::BlockStmtOrExpr(_, BlockStmtOrExprField::BlockStmt)
                ]
                | [_, AstParentNodeRef::GetterProp(_, GetterPropField::Body)]
                | [_, AstParentNodeRef::SetterProp(_, SetterPropField::Body)]
                | [_, AstParentNodeRef::Constructor(_, ConstructorField::Body)]
        ) {
            Some(true)
        } else {
            Some(false)
        };
        match block_type {
            Some(true) => {
                let early_return_stack = take(&mut self.early_return_stack);
                let mut effects = take(&mut self.effects);
                let hoisted_effects = take(&mut self.hoisted_effects);
                n.visit_children_with_ast_path(self, ast_path);
                self.end_early_return_block();
                self.effects.append(&mut self.hoisted_effects);
                effects.append(&mut self.effects);
                self.hoisted_effects = hoisted_effects;
                self.effects = effects;
                self.early_return_stack = early_return_stack;
            }
            Some(false) => {
                n.visit_children_with_ast_path(self, ast_path);
                if self.end_early_return_block() {
                    self.early_return_stack.push(EarlyReturn::Always {
                        prev_effects: take(&mut self.effects),
                        start_ast_path: as_parent_path(ast_path),
                    });
                }
            }
            None => {
                n.visit_children_with_ast_path(self, ast_path);
            }
        }
    }

    fn visit_unary_expr<'ast: 'r, 'r>(
        &mut self,
        n: &'ast UnaryExpr,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        if n.op == UnaryOp::TypeOf {
            let arg_value = Box::new(self.eval_context.eval(&n.arg));
            self.add_effect(Effect::TypeOf {
                arg: arg_value,
                ast_path: as_parent_path(ast_path),
                span: n.span(),
            });
        }

        n.visit_children_with_ast_path(self, ast_path);
    }
}

impl Analyzer<'_> {
    fn add_conditional_if_effect_with_early_return(
        &mut self,
        test: &Expr,
        ast_path: &AstNodePath<AstParentNodeRef<'_>>,
        condition_ast_kind: AstParentKind,
        span: Span,
        then: Option<Box<EffectsBlock>>,
        r#else: Option<Box<EffectsBlock>>,
        early_return_when_true: bool,
        early_return_when_false: bool,
    ) {
        if then.is_none() && r#else.is_none() && !early_return_when_false && !early_return_when_true
        {
            return;
        }
        let condition = Box::new(self.eval_context.eval(test));
        if condition.is_unknown() {
            if let Some(mut then) = then {
                self.effects.append(&mut then.effects);
            }
            if let Some(mut r#else) = r#else {
                self.effects.append(&mut r#else.effects);
            }
            return;
        }
        match (early_return_when_true, early_return_when_false) {
            (true, false) => {
                self.early_return_stack.push(EarlyReturn::Conditional {
                    prev_effects: take(&mut self.effects),
                    start_ast_path: as_parent_path(ast_path),
                    condition,
                    then,
                    r#else,
                    condition_ast_path: as_parent_path_with(ast_path, condition_ast_kind),
                    span,
                    in_try: is_in_try(ast_path),
                    early_return_condition_value: true,
                });
            }
            (false, true) => {
                self.early_return_stack.push(EarlyReturn::Conditional {
                    prev_effects: take(&mut self.effects),
                    start_ast_path: as_parent_path(ast_path),
                    condition,
                    then,
                    r#else,
                    condition_ast_path: as_parent_path_with(ast_path, condition_ast_kind),
                    span,
                    in_try: is_in_try(ast_path),
                    early_return_condition_value: false,
                });
            }
            (false, false) | (true, true) => {
                let kind = match (then, r#else) {
                    (Some(then), Some(r#else)) => ConditionalKind::IfElse { then, r#else },
                    (Some(then), None) => ConditionalKind::If { then },
                    (None, Some(r#else)) => ConditionalKind::Else { r#else },
                    (None, None) => unreachable!(),
                };
                self.add_effect(Effect::Conditional {
                    condition,
                    kind: Box::new(kind),
                    ast_path: as_parent_path_with(ast_path, condition_ast_kind),
                    span,
                    in_try: is_in_try(ast_path),
                });
                if early_return_when_false && early_return_when_true {
                    self.early_return_stack.push(EarlyReturn::Always {
                        prev_effects: take(&mut self.effects),
                        start_ast_path: as_parent_path(ast_path),
                    });
                }
            }
        }
    }

    fn add_conditional_effect(
        &mut self,
        test: &Expr,
        ast_path: &AstNodePath<AstParentNodeRef<'_>>,
        ast_kind: AstParentKind,
        span: Span,
        mut cond_kind: ConditionalKind,
    ) {
        let condition = Box::new(self.eval_context.eval(test));
        if condition.is_unknown() {
            match &mut cond_kind {
                ConditionalKind::If { then } => {
                    self.effects.append(&mut then.effects);
                }
                ConditionalKind::Else { r#else } => {
                    self.effects.append(&mut r#else.effects);
                }
                ConditionalKind::IfElse { then, r#else }
                | ConditionalKind::Ternary { then, r#else } => {
                    self.effects.append(&mut then.effects);
                    self.effects.append(&mut r#else.effects);
                }
                ConditionalKind::IfElseMultiple { then, r#else } => {
                    for block in then {
                        self.effects.append(&mut block.effects);
                    }
                    for block in r#else {
                        self.effects.append(&mut block.effects);
                    }
                }
                ConditionalKind::And { expr }
                | ConditionalKind::Or { expr }
                | ConditionalKind::NullishCoalescing { expr } => {
                    self.effects.append(&mut expr.effects);
                }
            }
        } else {
            self.add_effect(Effect::Conditional {
                condition,
                kind: Box::new(cond_kind),
                ast_path: as_parent_path_with(ast_path, ast_kind),
                span,
                in_try: is_in_try(ast_path),
            });
        }
    }

    fn visit_pat_with_value<'ast: 'r, 'r>(
        &mut self,
        pat: &'ast Pat,
        obj: &'ast ObjectPat,
        current_value: JsValue,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let mut ast_path = ast_path.with_guard(AstParentNodeRef::Pat(pat, PatField::Object));
        for (i, prop) in obj.props.iter().enumerate() {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::ObjectPat(obj, ObjectPatField::Props(i)));
            match prop {
                ObjectPatProp::KeyValue(kv) => {
                    let mut ast_path = ast_path.with_guard(AstParentNodeRef::ObjectPatProp(
                        prop,
                        ObjectPatPropField::KeyValue,
                    ));
                    let KeyValuePatProp { key, value } = kv;
                    let key_value = self.eval_context.eval_prop_name(key);
                    {
                        let mut ast_path = ast_path.with_guard(AstParentNodeRef::KeyValuePatProp(
                            kv,
                            KeyValuePatPropField::Key,
                        ));
                        key.visit_with_ast_path(self, &mut ast_path);
                    }
                    self.current_value = Some(JsValue::member(
                        Box::new(current_value.clone()),
                        Box::new(key_value),
                    ));
                    {
                        let mut ast_path = ast_path.with_guard(AstParentNodeRef::KeyValuePatProp(
                            kv,
                            KeyValuePatPropField::Value,
                        ));
                        value.visit_with_ast_path(self, &mut ast_path);
                    }
                }
                ObjectPatProp::Assign(assign) => {
                    let mut ast_path = ast_path.with_guard(AstParentNodeRef::ObjectPatProp(
                        prop,
                        ObjectPatPropField::Assign,
                    ));
                    let AssignPatProp { key, value, .. } = assign;
                    let key_value = key.sym.clone().into();
                    {
                        let mut ast_path = ast_path.with_guard(AstParentNodeRef::AssignPatProp(
                            assign,
                            AssignPatPropField::Key,
                        ));
                        key.visit_with_ast_path(self, &mut ast_path);
                    }
                    self.add_value(
                        key.to_id(),
                        if let Some(box value) = value {
                            let value = self.eval_context.eval(value);
                            JsValue::alternatives(vec![
                                JsValue::member(
                                    Box::new(current_value.clone()),
                                    Box::new(key_value),
                                ),
                                value,
                            ])
                        } else {
                            JsValue::member(Box::new(current_value.clone()), Box::new(key_value))
                        },
                    );
                    {
                        let mut ast_path = ast_path.with_guard(AstParentNodeRef::AssignPatProp(
                            assign,
                            AssignPatPropField::Value,
                        ));
                        value.visit_with_ast_path(self, &mut ast_path);
                    }
                }

                _ => prop.visit_with_ast_path(self, &mut ast_path),
            }
        }
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

fn get_fn_init_return_vals(fn_body_stmts: Option<&BlockStmt>) -> Vec<JsValue> {
    let has_final_return_val = match fn_body_stmts {
        Some(fn_body_stmts) => {
            matches!(
                fn_body_stmts.stmts.last(),
                Some(Stmt::Return(ReturnStmt { arg: Some(_), .. }))
            )
        }
        None => false,
    };

    if has_final_return_val {
        vec![]
    } else {
        vec![JsValue::Constant(ConstantValue::Undefined)]
    }
}
