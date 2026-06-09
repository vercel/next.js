use std::{
    iter,
    mem::{replace, take},
};

use bumpalo::boxed::Box as BumpBox;
use smallvec::SmallVec;
use swc_core::{
    common::{Span, Spanned, SyntaxContext, pass::AstNodePath},
    ecma::{
        ast::*,
        atoms::atom,
        utils::contains_ident_ref,
        visit::{fields::*, *},
    },
};
use turbo_rcstr::{RcStr, rcstr};
use turbopack_core::resolve::ExportUsage;

use crate::{
    AnalyzeMode,
    analyzer::{
        Bump, BumpVec, ConstantValue, JsValue, WellKnownFunctionKind,
        graph::{ConditionalKind, Effect, EffectArg, EffectsBlock, EvalContext, VarGraph},
        is_unresolved_id,
    },
    code_gen::CodeGen,
    references::esm::EsmModuleItem,
    utils::{AstPathRange, unparen},
};

enum EarlyReturn<'a> {
    Always {
        prev_effects: Vec<Effect<'a>>,
        start_ast_path: Vec<AstParentKind>,
    },
    Conditional {
        prev_effects: Vec<Effect<'a>>,
        start_ast_path: Vec<AstParentKind>,

        condition: BumpBox<'a, JsValue<'a>>,
        then: Option<Box<EffectsBlock<'a>>>,
        r#else: Option<Box<EffectsBlock<'a>>>,
        /// The ast path to the condition.
        condition_ast_path: Vec<AstParentKind>,
        span: Span,

        early_return_condition_value: bool,
    },
}

pub fn as_parent_path_skip(
    ast_path: &AstNodePath<AstParentNodeRef<'_>>,
    skip: usize,
) -> Vec<AstParentKind> {
    let kinds = ast_path.kinds();
    kinds[..kinds.len() - skip].to_vec()
}

pub(super) struct Analyzer<'arena, 'eval> {
    pub(super) arena: &'arena Bump,

    pub(super) analyze_mode: AnalyzeMode,

    pub(super) data: VarGraph<'arena>,
    pub(super) state: analyzer_state::AnalyzerState<'arena>,

    pub(super) effects: Vec<Effect<'arena>>,
    /// Effects collected from hoisted declarations. See https://developer.mozilla.org/en-US/docs/Glossary/Hoisting
    /// Tracked separately so we can preserve effects from hoisted declarations even when we don't
    /// collect effects from the declaring context.
    pub(super) hoisted_effects: Vec<Effect<'arena>>,

    // Some unconditional codegens, usually for ESM items.
    pub(super) code_gens: Vec<CodeGen>,

    /// Whether we may codegen `let` and `const` or if we should fallback to var (at the cost of
    /// slightly less correct circular import errors) for EsmModuleItem
    pub(super) supports_block_scoping: bool,

    pub(super) eval_context: &'eval EvalContext,
}

trait FunctionLike {
    fn is_async(&self) -> bool {
        false
    }
    fn is_generator(&self) -> bool {
        false
    }
    fn span(&self) -> Span;
    fn binds_this(&self) -> bool {
        true
    }
}

impl FunctionLike for Function {
    fn is_async(&self) -> bool {
        self.is_async
    }
    fn is_generator(&self) -> bool {
        self.is_generator
    }
    fn span(&self) -> Span {
        self.span
    }
}
impl FunctionLike for ArrowExpr {
    fn is_async(&self) -> bool {
        self.is_async
    }
    fn is_generator(&self) -> bool {
        self.is_generator
    }
    fn span(&self) -> Span {
        self.span
    }
    fn binds_this(&self) -> bool {
        false
    }
}

impl FunctionLike for Constructor {
    fn span(&self) -> Span {
        self.span
    }
}
impl FunctionLike for GetterProp {
    fn span(&self) -> Span {
        self.span
    }
}
impl FunctionLike for SetterProp {
    fn span(&self) -> Span {
        self.span
    }
}

#[derive(PartialEq, Eq, Debug, Copy, Clone)]
enum LexicalContext {
    // In the root of a function scope
    Function { id: u32, binds_this: bool },
    // A placeholder for identify anonymous blocks
    // If we have Block->Block then we are in an anonymous block
    // If we have Function->Block or ControlFlow->Block then we are just in a function root
    Block,
    // In some kind of control flow
    ControlFlow { is_try: bool },

    // Class bodies do rebind `this` and are in many ways like a function
    ClassBody,
}

mod analyzer_state {
    use super::*;

    /// Contains fields of `Analyzer` that should only be modified using helper methods. These are
    /// intentionally private to the rest of the `Analyzer` implementation.
    #[derive(Default)]
    pub struct AnalyzerState<'a> {
        pat_value: Option<JsValue<'a>>,
        /// Return values of the current function.
        ///
        /// This is configured to [Some] by function handlers and filled by the
        /// return statement handler.
        cur_fn_return_values: Option<Vec<JsValue<'a>>>,
        /// Stack of early returns for control flow analysis.
        early_return_stack: Vec<EarlyReturn<'a>>,
        lexical_stack: Vec<LexicalContext>,
        var_decl_kind: Option<VarDeclKind>,
    }

    impl<'a> Analyzer<'a, '_> {
        /// Returns true if we are in a function. False if we are in the root scope.
        pub(super) fn is_in_fn(&self) -> bool {
            self.state
                .lexical_stack
                .iter()
                .any(|b| matches!(b, LexicalContext::Function { .. }))
        }

        pub(super) fn is_in_try(&self) -> bool {
            self.state
                .lexical_stack
                .iter()
                .rev()
                .take_while(|b| !matches!(b, LexicalContext::Function { .. }))
                .any(|b| *b == LexicalContext::ControlFlow { is_try: true })
        }

        /// Returns true if we are currently in a block scope that isn't at the root of a function
        /// or a module.
        pub(super) fn is_in_nested_block_scope(&self) -> bool {
            match &self.state.lexical_stack[self.state.lexical_stack.len().saturating_sub(2)..] {
                [LexicalContext::Block]
                | [LexicalContext::Function { .. }, LexicalContext::Block] => false,
                [] => {
                    unreachable!()
                }

                _ => true,
            }
        }

        pub(super) fn cur_lexical_context(&self) -> LexicalContext {
            *self.state.lexical_stack.last().unwrap()
        }

        /// Returns the identifier of the current function.
        /// must be called only if `is_in_fn` is true
        pub(super) fn cur_fn_ident(&self) -> u32 {
            *self
                .state
                .lexical_stack
                .iter()
                .rev()
                .filter_map(|b| {
                    if let LexicalContext::Function { id, .. } = b {
                        Some(id)
                    } else {
                        None
                    }
                })
                .next()
                .expect("not in a function")
        }

        /// Returns true if `this` is bound in any active scope
        pub(super) fn is_this_bound(&self) -> bool {
            self.state.lexical_stack.iter().rev().any(|b| {
                matches!(
                    b,
                    LexicalContext::Function {
                        id: _,
                        binds_this: true
                    } | LexicalContext::ClassBody
                )
            })
        }

        /// Adds a return value to the current function.
        /// Panics if we are not in a function scope
        pub(super) fn add_return_value(&mut self, value: JsValue<'a>) {
            self.state
                .cur_fn_return_values
                .as_mut()
                .expect("not in a function")
                .push(value);
        }

        /// The RHS (or some part of it) of an pattern or assignment (e.g. `PatAssignTarget`,
        /// `SimpleAssignTarget`, function arguments, etc.), read by the individual parts of LHS
        /// (target).
        ///
        /// Consumes the value, setting it to `None`, and returning the previous value. This avoids
        /// extra clones.
        pub(super) fn take_pat_value(&mut self) -> Option<JsValue<'a>> {
            self.state.pat_value.take()
        }

        // Runs `func` (usually something that visits children) with the given
        // [`Analyzer::take_pat_value`], restoring the value back to the previous value (usually
        // `None`) afterwards.
        pub(super) fn with_pat_value<T>(
            &mut self,
            value: Option<JsValue<'a>>,
            func: impl FnOnce(&mut Self) -> T,
        ) -> T {
            let prev_value = replace(&mut self.state.pat_value, value);
            let out = func(self);
            self.state.pat_value = prev_value;
            out
        }

        /// Runs `func` with the given variable declaration kind, restoring the previous kind
        /// afterwards.
        pub(super) fn with_decl_kind<T>(
            &mut self,
            kind: Option<VarDeclKind>,
            func: impl FnOnce(&mut Self) -> T,
        ) -> T {
            let prev_kind = replace(&mut self.state.var_decl_kind, kind);
            let out = func(self);
            self.state.var_decl_kind = prev_kind;
            out
        }

        /// Returns the current variable declaration kind.
        pub(super) fn var_decl_kind(&self) -> Option<VarDeclKind> {
            self.state.var_decl_kind
        }

        /// Runs `func` with the current function identifier and return values initialized for the
        /// block.
        pub(super) fn enter_fn(
            &mut self,
            function: &impl FunctionLike,
            visitor: impl FnOnce(&mut Self),
        ) -> JsValue<'a> {
            let arena = self.arena;
            let fn_id = function.span().lo.0;
            let prev_return_values = self.state.cur_fn_return_values.replace(vec![]);

            self.with_block(
                LexicalContext::Function {
                    id: fn_id,
                    binds_this: function.binds_this(),
                },
                |this| visitor(this),
            );
            let return_values = self.state.cur_fn_return_values.take().unwrap();
            self.state.cur_fn_return_values = prev_return_values;

            JsValue::function(
                arena,
                fn_id,
                function.is_async(),
                function.is_generator(),
                match return_values.len() {
                    0 => JsValue::Constant(ConstantValue::Undefined),
                    1 => return_values.into_iter().next().unwrap(),
                    _ => JsValue::alternatives(BumpVec::from_iter_in(arena, return_values)),
                },
            )
        }

        /// Helper to access the early_return_stack mutably (for push operations)
        pub(super) fn early_return_stack_mut(&mut self) -> &mut Vec<EarlyReturn<'a>> {
            &mut self.state.early_return_stack
        }

        /// Records an unconditional early return (return, throw, or finally block that always
        /// returns). Takes ownership of current effects and pushes them onto the early return
        /// stack.
        pub(super) fn add_early_return_always(
            &mut self,
            ast_path: &AstNodePath<AstParentNodeRef<'_>>,
        ) {
            let early_return = EarlyReturn::Always {
                prev_effects: take(&mut self.effects),
                start_ast_path: as_parent_path(ast_path),
            };
            self.early_return_stack_mut().push(early_return);
        }

        /// Runs `func` with a fresh early return stack, restoring the previous stack afterwards.
        /// Returns the result of `func` and whether the block always returns (from
        /// `end_early_return_block`).
        pub(super) fn enter_control_flow<T>(
            &mut self,
            func: impl FnOnce(&mut Self) -> T,
        ) -> (T, bool) {
            self.enter_block(LexicalContext::ControlFlow { is_try: false }, |this| {
                func(this)
            })
        }
        /// Runs `func` with a fresh early return stack, restoring the previous stack afterwards.
        /// Returns the result of `func` and whether the block always returns (from
        /// `end_early_return_block`).
        pub(super) fn enter_try<T>(&mut self, func: impl FnOnce(&mut Self) -> T) -> (T, bool) {
            self.enter_block(LexicalContext::ControlFlow { is_try: true }, |this| {
                func(this)
            })
        }

        /// Runs `func` with a fresh early return stack, restoring the previous stack afterwards.
        /// Returns the result of `func` and whether the block always returns (from
        /// `end_early_return_block`).
        pub(super) fn enter_block<T>(
            &mut self,
            block_kind: LexicalContext,
            func: impl FnOnce(&mut Self) -> T,
        ) -> (T, bool) {
            let prev_early_return_stack = take(&mut self.state.early_return_stack);
            let result = self.with_block(block_kind, func);
            let always_returns = self.end_early_return_block();
            self.state.early_return_stack = prev_early_return_stack;
            (result, always_returns)
        }

        /// Pushes a block onto the stack without performing early return logic.
        pub(super) fn with_block<T>(
            &mut self,
            block_kind: LexicalContext,
            func: impl FnOnce(&mut Self) -> T,
        ) -> T {
            self.state.lexical_stack.push(block_kind);
            let result = func(self);
            let old = self.state.lexical_stack.pop();
            debug_assert_eq!(old, Some(block_kind));
            result
        }

        /// Ends a conditional block. All early returns are integrated into the
        /// effects. Returns true if the whole block always early returns.
        fn end_early_return_block(&mut self) -> bool {
            let mut always_returns = false;
            while let Some(early_return) = self.state.early_return_stack.pop() {
                match early_return {
                    EarlyReturn::Always {
                        prev_effects,
                        start_ast_path,
                    } => {
                        self.effects = prev_effects;
                        if self.analyze_mode.is_code_gen() {
                            self.effects.push(Effect::Unreachable { start_ast_path });
                        }
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
                        })
                    }
                }
            }
            always_returns
        }
    }
}

pub fn as_parent_path(ast_path: &AstNodePath<AstParentNodeRef<'_>>) -> Vec<AstParentKind> {
    ast_path.kinds().to_vec()
}

/// Extracts export names from usage patterns on a dynamic import.
///
/// Supports two patterns:
/// 1. Destructuring: `const { cat, dog } = await import('./lib')` → `PartialNamespaceObject(["cat",
///    "dog"])`
/// 2. Member access: `(await import('./lib')).cat` → `PartialNamespaceObject(["cat"])`
///
/// For `const {} = await import('./lib')`, returns `Evaluation`.
/// For `const mod = await import('./lib')` or non-recognized patterns, returns `All`.
/// For patterns with rest elements or computed keys, returns `All` (conservative).
fn extract_dynamic_import_export_usage(
    ast_path: &AstNodePath<AstParentNodeRef<'_>>,
) -> ExportUsage {
    // Walk up the AST path from the import() call to find usage patterns that
    // reveal which exports are needed. Supported patterns:
    //
    // 1. Destructured await:     const { a, b } = await import('./lib')
    // 2. Member access on await: (await import('./lib')).a
    // 3. Arrow .then() callback: import('./lib').then(({ a, b }) => {})
    // 4. Function .then() callback: import('./lib').then(function({ a, b }) {})
    //
    // Only allow Expr wrappers, AwaitExpr, ParenExpr, and Callee as intermediate
    // nodes to ensure the import result flows directly into the usage site.
    let mut seen_await = false;
    let mut seen_then = false;
    let names = 'outer: {
        for node_ref in ast_path.iter().rev() {
            match node_ref {
                // Only extract names when `await` is present — without await, the
                // destructuring targets the Promise, not the module namespace.
                AstParentNodeRef::VarDeclarator(decl, VarDeclaratorField::Init) if seen_await => {
                    break 'outer extract_names_from_object_pat(&decl.name);
                }
                // Member access: (await import('./lib')).someExport
                // Only valid after AwaitExpr — without await, it's a Promise method
                AstParentNodeRef::MemberExpr(member, MemberExprField::Obj) if seen_await => {
                    break 'outer extract_name_from_member_prop(&member.prop);
                }
                // Promise .then() pattern: import('./lib').then(({ name }) => {})
                // Without await, check if this is a .then() call and extract from callback
                AstParentNodeRef::MemberExpr(member, MemberExprField::Obj) => {
                    if matches!(&member.prop, MemberProp::Ident(ident) if &*ident.sym == "then") {
                        seen_then = true;
                        continue;
                    }
                    break 'outer None;
                }
                // After seeing .then MemberExpr, the next CallExpr is the .then() call
                // — extract destructured parameter names from the first callback argument
                AstParentNodeRef::CallExpr(call, CallExprField::Callee) if seen_then => {
                    break 'outer extract_names_from_then_callback(call);
                }
                AstParentNodeRef::AwaitExpr(_, AwaitExprField::Arg) => {
                    seen_await = true;
                    continue;
                }
                // Allowed intermediate nodes
                AstParentNodeRef::Expr(..)
                | AstParentNodeRef::ParenExpr(_, ParenExprField::Expr)
                | AstParentNodeRef::Callee(_, CalleeField::Expr) => continue,
                // Any other node means the import is nested in something else
                _ => break 'outer None,
            }
        }
        None
    };
    match names {
        Some(names) if names.is_empty() => ExportUsage::Evaluation,
        Some(names) => ExportUsage::PartialNamespaceObject(names),
        None => ExportUsage::All,
    }
}

/// Extract export names from the first argument of a `.then()` callback.
/// Supports both arrow functions and function expressions with destructured
/// first parameters.
fn extract_names_from_then_callback(call: &CallExpr) -> Option<SmallVec<[RcStr; 1]>> {
    let first_arg = call.args.first()?;
    if first_arg.spread.is_some() {
        return None;
    }
    match &*first_arg.expr {
        // Arrow function: import('./lib').then(({ name }) => {})
        Expr::Arrow(arrow) => {
            let first_param = arrow.params.first()?;
            extract_names_from_object_pat(first_param)
        }
        // Function expression: import('./lib').then(function({ name }) {})
        Expr::Fn(fn_expr) => {
            let first_param = fn_expr.function.params.first()?;
            extract_names_from_object_pat(&first_param.pat)
        }
        _ => None,
    }
}

fn extract_name_from_member_prop(prop: &MemberProp) -> Option<SmallVec<[RcStr; 1]>> {
    match prop {
        MemberProp::Ident(ident) => Some(SmallVec::from_buf([ident.sym.as_str().into()])),
        MemberProp::Computed(ComputedPropName {
            expr: box Expr::Lit(Lit::Str(s)),
            ..
        }) => s.value.as_str().map(|v| SmallVec::from_buf([v.into()])),
        _ => None,
    }
}

fn extract_names_from_object_pat(pat: &Pat) -> Option<SmallVec<[RcStr; 1]>> {
    let Pat::Object(obj_pat) = pat else {
        return None;
    };
    let mut names = SmallVec::new();
    for prop in &obj_pat.props {
        match prop {
            ObjectPatProp::KeyValue(kv) => match &kv.key {
                PropName::Ident(ident) => names.push(ident.sym.as_str().into()),
                PropName::Str(s) => names.push(s.value.as_str()?.into()),
                _ => return None, // computed key, can't determine statically
            },
            ObjectPatProp::Assign(assign) => {
                names.push(assign.key.sym.as_str().into());
            }
            ObjectPatProp::Rest(_) => return None, // rest pattern means all exports needed
        }
    }
    Some(names)
}

pub fn as_parent_path_with(
    ast_path: &AstNodePath<AstParentNodeRef<'_>>,
    additional: AstParentKind,
) -> Vec<AstParentKind> {
    let kinds = ast_path.kinds();
    let mut path = Vec::with_capacity(kinds.len() + 1);
    path.extend_from_slice(kinds);
    path.push(additional);
    path
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

impl<'a> Analyzer<'a, '_> {
    fn add_value(&mut self, id: Id, value: JsValue<'a>) {
        if is_unresolved_id(&id, self.eval_context.unresolved_mark) {
            self.data.free_var_ids.insert(id.0.clone(), id.clone());
        }

        if let Some(prev) = self.data.values.get_mut(&id) {
            prev.add_alt(self.arena, value);
        } else {
            self.data.values.insert(id, value);
        }
        // TODO(kdy1): We may need to report an error for this.
        // Variables declared with `var` are hoisted, but using undefined as its
        // value does not seem like a good idea.
    }

    fn add_value_from_expr(&mut self, id: Id, value: &Expr) {
        let value = self.eval_context.eval(self.arena, value);

        self.add_value(id, value);
    }

    fn add_effect(&mut self, effect: Effect<'a>) {
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
                        if let Some(ident) = ident
                            && contains_ident_ref(&function.body, ident)
                        {
                            return false;
                        }
                    }

                    {
                        let mut ast_path = ast_path
                            .with_guard(AstParentNodeRef::FnExpr(fn_expr, FnExprField::Function));
                        // We don't handle the value of the function here, though we could to better
                        // model the value of this 'call'
                        self.enter_fn(&**function, |this| {
                            this.handle_iife_function(function, &mut ast_path, &n.args);
                        });
                    }

                    true
                }

                Expr::Arrow(arrow_expr) => {
                    let mut ast_path =
                        ast_path.with_guard(AstParentNodeRef::Expr(expr, ExprField::Arrow));
                    let args = &n.args;
                    // We don't handle the value of the function here, though we could to better
                    // model the value of this 'call'
                    self.enter_fn(arrow_expr, |this| {
                        this.handle_iife_arrow(arrow_expr, args, &mut ast_path);
                    });
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
            let pat_value = iter
                .next()
                .map(|arg| self.eval_context.eval(self.arena, &arg.expr));
            self.with_pat_value(pat_value, |this| this.visit_pat(param, &mut ast_path));
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
                self.with_pat_value(
                    Some(self.eval_context.eval(self.arena, &arg.expr)),
                    |this| this.visit_param(param, &mut ast_path),
                );
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
                    let value = self.eval_context.eval(self.arena, &arg.expr);

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
                // Prefer webpackExports/turbopackExports comment (authoritative when present)
                let attrs = self.eval_context.imports.get_attributes(span);
                let export_usage = if let Some(names) = &attrs.export_names {
                    if names.is_empty() {
                        ExportUsage::Evaluation
                    } else {
                        ExportUsage::PartialNamespaceObject(names.clone())
                    }
                } else {
                    // Fall back to AST path walking (works when import is not wrapped)
                    extract_dynamic_import_export_usage(ast_path)
                };
                self.add_effect(Effect::DynamicImport {
                    args,
                    ast_path: as_parent_path(ast_path),
                    span,
                    in_try: self.is_in_try(),
                    export_usage,
                });
            }
            Callee::Expr(box expr) => {
                if let Expr::Member(MemberExpr { obj, prop, .. }) = unparen(expr) {
                    let obj_value =
                        BumpBox::new_in(self.eval_context.eval(self.arena, obj), self.arena);
                    let prop_value = match prop {
                        // TODO avoid clone
                        MemberProp::Ident(i) => BumpBox::new_in(i.sym.clone().into(), self.arena),
                        MemberProp::PrivateName(_) => BumpBox::new_in(
                            JsValue::unknown_empty(
                                false,
                                rcstr!("private names in member expressions are not supported"),
                            ),
                            self.arena,
                        ),
                        MemberProp::Computed(ComputedPropName { expr, .. }) => {
                            BumpBox::new_in(self.eval_context.eval(self.arena, expr), self.arena)
                        }
                    };
                    self.add_effect(Effect::MemberCall {
                        obj: obj_value,
                        prop: prop_value,
                        args,
                        ast_path: as_parent_path(ast_path),
                        span,
                        in_try: self.is_in_try(),
                        new,
                    });
                } else {
                    let fn_value =
                        BumpBox::new_in(self.eval_context.eval(self.arena, expr), self.arena);
                    self.add_effect(Effect::Call {
                        func: fn_value,
                        args,
                        ast_path: as_parent_path(ast_path),
                        span,
                        in_try: self.is_in_try(),
                        new,
                    });
                }
            }
            Callee::Super(_) => self.add_effect(Effect::Call {
                func: BumpBox::new_in(
                    self.eval_context
                        // Unwrap because `new super(..)` isn't valid anyway
                        .eval(self.arena, &Expr::Call(n.as_call().unwrap().clone())),
                    self.arena,
                ),
                args,
                ast_path: as_parent_path(ast_path),
                span,
                in_try: self.is_in_try(),
                new,
            }),
        }
    }

    fn check_member_expr_for_effects<'ast: 'r, 'r>(
        &mut self,
        member_expr: &'ast MemberExpr,
        ast_path: &AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if !self.analyze_mode.is_code_gen() {
            return;
        }

        let obj_value = BumpBox::new_in(
            self.eval_context.eval(self.arena, &member_expr.obj),
            self.arena,
        );
        let prop_value = match &member_expr.prop {
            // TODO avoid clone
            MemberProp::Ident(i) => BumpBox::new_in(i.sym.clone().into(), self.arena),
            MemberProp::PrivateName(_) => {
                return;
            }
            MemberProp::Computed(ComputedPropName { expr, .. }) => {
                BumpBox::new_in(self.eval_context.eval(self.arena, expr), self.arena)
            }
        };
        self.add_effect(Effect::Member {
            obj: obj_value,
            prop: prop_value,
            ast_path: as_parent_path(ast_path),
            span: member_expr.span(),
        });
    }

    fn add_esm_module_item(&mut self, ast_path: &AstNodePath<AstParentNodeRef<'_>>) {
        if self.analyze_mode.is_code_gen() {
            self.code_gens.push(
                EsmModuleItem::new(as_parent_path(ast_path).into(), self.supports_block_scoping)
                    .into(),
            );
        }
    }
}

impl VisitAstPath for Analyzer<'_, '_> {
    fn visit_import_decl<'ast: 'r, 'r>(
        &mut self,
        import: &'ast ImportDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        import.visit_children_with_ast_path(self, ast_path);
        if import.type_only {
            return;
        }
        self.add_esm_module_item(ast_path);
    }

    fn visit_import_specifier<'ast: 'r, 'r>(
        &mut self,
        _import_specifier: &'ast ImportSpecifier,
        _ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        // Skip these nodes entirely: We gather imports in a separate pass
    }

    fn visit_assign_expr<'ast: 'r, 'r>(
        &mut self,
        n: &'ast AssignExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        // LHS
        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::AssignExpr(n, AssignExprField::Left));

            let pat_value = match (n.op, n.left.as_ident()) {
                (AssignOp::Assign, _) => self.eval_context.eval(self.arena, &n.right),
                (AssignOp::AndAssign | AssignOp::OrAssign | AssignOp::NullishAssign, Some(_)) => {
                    // We can handle the right value as alternative to the existing value
                    self.eval_context.eval(self.arena, &n.right)
                }
                (AssignOp::AddAssign, Some(key)) => {
                    let left = self
                        .eval_context
                        .eval(self.arena, &Expr::Ident(key.clone().into()));
                    let right = self.eval_context.eval(self.arena, &n.right);
                    JsValue::add(BumpVec::from_iter_in(self.arena, [left, right]))
                }
                _ => JsValue::unknown_empty(true, rcstr!("unsupported assign operation")),
            };
            self.with_pat_value(Some(pat_value), |this| {
                n.left.visit_children_with_ast_path(this, &mut ast_path)
            });
        }

        // RHS
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
                JsValue::unknown_empty(true, rcstr!("updated with update expression")),
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
        if let Callee::Expr(callee) = &n.callee
            && n.args.len() == 1
            && let Some(require_var_id) = extract_var_from_umd_factory(callee, &n.args)
        {
            self.add_value(
                require_var_id,
                JsValue::unknown_if(
                    self.eval_context
                        .imports
                        .get_attributes(n.callee.span())
                        .ignore,
                    JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
                    true,
                    rcstr!("ignored require"),
                ),
            );
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
        self.with_decl_kind(None, |this| {
            n.visit_children_with_ast_path(this, ast_path);
        });
    }

    fn visit_params<'ast: 'r, 'r>(
        &mut self,
        n: &'ast [Param],
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let cur_fn_ident = self.cur_fn_ident();
        for (index, p) in n.iter().enumerate() {
            self.with_pat_value(Some(JsValue::Argument(cur_fn_ident, index)), |this| {
                let mut ast_path = ast_path.with_index_guard(index);
                p.visit_with_ast_path(this, &mut ast_path);
            });
        }
    }

    fn visit_param<'ast: 'r, 'r>(
        &mut self,
        n: &'ast Param,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let Param {
            decorators,
            pat,
            span: _,
        } = n;
        self.with_decl_kind(None, |this| {
            // Decorators don't have access to the parameter values, so omit them
            this.with_pat_value(None, |this| {
                let mut ast_path = ast_path.with_guard(AstParentNodeRef::Param(
                    n,
                    ParamField::Decorators(usize::MAX),
                ));
                this.visit_decorators(decorators, &mut ast_path);
            });
            {
                let mut ast_path = ast_path.with_guard(AstParentNodeRef::Param(n, ParamField::Pat));
                this.visit_pat(pat, &mut ast_path);
            }
        });
    }

    fn visit_fn_decl<'ast: 'r, 'r>(
        &mut self,
        decl: &'ast FnDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let fn_value = self.enter_fn(&*decl.function, |this| {
            decl.visit_children_with_ast_path(this, ast_path);
        });

        // Take all effects produced by the function and move them to hoisted effects since
        // function declarations are hoisted.
        // This accounts for the fact that even with `if (true) { return f} function f() {} ` `f` is
        // hoisted earlier of the condition. so we still need to process effects for it.
        // TODO(lukesandberg): shouldn't this just be the effects associated with the function.
        self.hoisted_effects.append(&mut self.effects);

        self.add_value(decl.ident.to_id(), fn_value);
    }

    fn visit_fn_expr<'ast: 'r, 'r>(
        &mut self,
        expr: &'ast FnExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let fn_value = self.enter_fn(&*expr.function, |this| {
            expr.visit_children_with_ast_path(this, ast_path);
        });
        if let Some(ident) = &expr.ident {
            self.add_value(ident.to_id(), fn_value);
        } else {
            self.add_value(
                (
                    format!("*anonymous function {}*", expr.function.span.lo.0).into(),
                    SyntaxContext::empty(),
                ),
                fn_value,
            );
        }
    }

    fn visit_arrow_expr<'ast: 'r, 'r>(
        &mut self,
        expr: &'ast ArrowExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let fn_value = self.enter_fn(expr, |this| {
            let fn_id = this.cur_fn_ident();
            for (index, p) in expr.params.iter().enumerate() {
                this.with_pat_value(Some(JsValue::Argument(fn_id, index)), |this| {
                    let mut ast_path = ast_path.with_guard(AstParentNodeRef::ArrowExpr(
                        expr,
                        ArrowExprField::Params(index),
                    ));
                    p.visit_with_ast_path(this, &mut ast_path);
                });
            }

            {
                let mut ast_path =
                    ast_path.with_guard(AstParentNodeRef::ArrowExpr(expr, ArrowExprField::Body));
                expr.body.visit_with_ast_path(this, &mut ast_path);
                // If body is a single expression treat it as a Block with an return statement
                if let BlockStmtOrExpr::Expr(inner_expr) = &*expr.body {
                    let implicit_return_value = this.eval_context.eval(this.arena, inner_expr);
                    this.add_return_value(implicit_return_value);
                }
            }
        });
        self.add_value(
            (
                format!("*arrow function {}*", expr.span.lo.0).into(),
                SyntaxContext::empty(),
            ),
            fn_value,
        );
    }

    fn visit_class_decl<'ast: 'r, 'r>(
        &mut self,
        decl: &'ast ClassDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.add_value_from_expr(
            decl.ident.to_id(),
            &Expr::Class(ClassExpr {
                ident: Some(decl.ident.clone()),
                class: decl.class.clone(),
            }),
        );
        decl.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_class<'ast: 'r, 'r>(
        &mut self,
        node: &'ast Class,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.enter_block(LexicalContext::ClassBody, |this| {
            node.visit_children_with_ast_path(this, ast_path);
        });
    }

    fn visit_getter_prop<'ast: 'r, 'r>(
        &mut self,
        node: &'ast GetterProp,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.enter_fn(node, |this| {
            node.visit_children_with_ast_path(this, ast_path);
        });
    }

    fn visit_setter_prop<'ast: 'r, 'r>(
        &mut self,
        node: &'ast SetterProp,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.enter_fn(node, |this| {
            node.visit_children_with_ast_path(this, ast_path);
        });
    }

    fn visit_constructor<'ast: 'r, 'r>(
        &mut self,
        node: &'ast Constructor,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.enter_fn(node, |this| {
            node.visit_children_with_ast_path(this, ast_path);
        });
    }

    fn visit_class_method<'ast: 'r, 'r>(
        &mut self,
        node: &'ast ClassMethod,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.enter_fn(&*node.function, |this| {
            node.visit_children_with_ast_path(this, ast_path);
        });
    }

    fn visit_private_method<'ast: 'r, 'r>(
        &mut self,
        node: &'ast PrivateMethod,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.enter_fn(&*node.function, |this| {
            node.visit_children_with_ast_path(this, ast_path);
        });
    }

    fn visit_method_prop<'ast: 'r, 'r>(
        &mut self,
        node: &'ast MethodProp,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.enter_fn(&*node.function, |this| {
            node.visit_children_with_ast_path(this, ast_path);
        });
    }

    fn visit_var_decl<'ast: 'r, 'r>(
        &mut self,
        n: &'ast VarDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.with_decl_kind(Some(n.kind), |this| {
            n.visit_children_with_ast_path(this, ast_path);
        });
    }

    fn visit_var_declarator<'ast: 'r, 'r>(
        &mut self,
        n: &'ast VarDeclarator,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        // LHS
        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::VarDeclarator(n, VarDeclaratorField::Name));

            if let Some(var_decl_kind) = self.var_decl_kind()
                && let Some(init) = &n.init
            {
                // For case like
                //
                // if (shouldRun()) {
                //   var x = true;
                // }
                // if (x) {
                // }
                //
                // The variable `x` is undefined

                let should_include_undefined =
                    var_decl_kind == VarDeclKind::Var && self.is_in_nested_block_scope();
                let init_value = self.eval_context.eval(self.arena, init);
                let pat_value = Some(if should_include_undefined {
                    JsValue::alternatives(BumpVec::from_iter_in(
                        self.arena,
                        [init_value, JsValue::Constant(ConstantValue::Undefined)],
                    ))
                } else {
                    init_value
                });
                self.with_pat_value(pat_value, |this| {
                    this.visit_pat(&n.name, &mut ast_path);
                });
            } else {
                // Don't use `with_pat_value(None, ...)` here. A `VarDecl` can occur inside of a
                // `ForOfStmt` with no `init` field, but still have a `pat_value` set that we want
                // to inherit.
                self.visit_pat(&n.name, &mut ast_path);
            }
        }

        // RHS
        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::VarDeclarator(n, VarDeclaratorField::Init));

            self.visit_opt_expr(&n.init, &mut ast_path);
        }
    }

    fn visit_for_in_stmt<'ast: 'r, 'r>(
        &mut self,
        n: &'ast ForInStmt,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::ForInStmt(n, ForInStmtField::Right));
            n.right.visit_with_ast_path(self, &mut ast_path);
        }

        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::ForInStmt(n, ForInStmtField::Left));
            self.with_pat_value(
                // TODO this should really be
                // `Some(JsValue::iteratedKeys(Box::new(self.eval_context.eval(self.arena,
                // &n.right))))`
                Some(JsValue::unknown_empty(
                    false,
                    rcstr!("for-in variable currently not analyzed"),
                )),
                |this| {
                    n.left.visit_with_ast_path(this, &mut ast_path);
                },
            )
        }

        let mut ast_path =
            ast_path.with_guard(AstParentNodeRef::ForInStmt(n, ForInStmtField::Body));

        self.enter_control_flow(|this| {
            n.body.visit_with_ast_path(this, &mut ast_path);
        });
    }

    fn visit_for_of_stmt<'ast: 'r, 'r>(
        &mut self,
        n: &'ast ForOfStmt,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::ForOfStmt(n, ForOfStmtField::Right));
            n.right.visit_with_ast_path(self, &mut ast_path);
        }

        let iterable = self.eval_context.eval(self.arena, &n.right);

        // TODO n.await is ignored (async interables)
        self.with_pat_value(Some(JsValue::iterated(self.arena, iterable)), |this| {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::ForOfStmt(n, ForOfStmtField::Left));
            n.left.visit_with_ast_path(this, &mut ast_path);
        });

        let mut ast_path =
            ast_path.with_guard(AstParentNodeRef::ForOfStmt(n, ForOfStmtField::Body));

        self.enter_control_flow(|this| {
            n.body.visit_with_ast_path(this, &mut ast_path);
        });
    }

    fn visit_for_stmt<'ast: 'r, 'r>(
        &mut self,
        n: &'ast ForStmt,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::ForStmt(n, ForStmtField::Init));
            n.init.visit_with_ast_path(self, &mut ast_path);
        }
        self.enter_control_flow(|this| {
            {
                let mut ast_path =
                    ast_path.with_guard(AstParentNodeRef::ForStmt(n, ForStmtField::Test));
                n.test.visit_with_ast_path(this, &mut ast_path);
            }
            {
                let mut ast_path =
                    ast_path.with_guard(AstParentNodeRef::ForStmt(n, ForStmtField::Body));
                n.body.visit_with_ast_path(this, &mut ast_path);
            }
            {
                let mut ast_path =
                    ast_path.with_guard(AstParentNodeRef::ForStmt(n, ForStmtField::Update));
                n.update.visit_with_ast_path(this, &mut ast_path);
            }
        });
    }

    fn visit_while_stmt<'ast: 'r, 'r>(
        &mut self,
        n: &'ast WhileStmt,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        // Enter control flow for everything (test and body both repeat in loop iterations)
        self.enter_control_flow(|this| {
            {
                let mut ast_path =
                    ast_path.with_guard(AstParentNodeRef::WhileStmt(n, WhileStmtField::Test));
                n.test.visit_with_ast_path(this, &mut ast_path);
            }
            {
                let mut ast_path =
                    ast_path.with_guard(AstParentNodeRef::WhileStmt(n, WhileStmtField::Body));
                n.body.visit_with_ast_path(this, &mut ast_path);
            }
        });
    }

    fn visit_do_while_stmt<'ast: 'r, 'r>(
        &mut self,
        n: &'ast DoWhileStmt,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        // Enter control flow for everything (body and test both are part of loop iterations)
        self.enter_control_flow(|this| {
            {
                let mut ast_path =
                    ast_path.with_guard(AstParentNodeRef::DoWhileStmt(n, DoWhileStmtField::Body));
                n.body.visit_with_ast_path(this, &mut ast_path);
            }
            {
                let mut ast_path =
                    ast_path.with_guard(AstParentNodeRef::DoWhileStmt(n, DoWhileStmtField::Test));
                n.test.visit_with_ast_path(this, &mut ast_path);
            }
        });
    }

    fn visit_simple_assign_target<'ast: 'r, 'r>(
        &mut self,
        n: &'ast SimpleAssignTarget,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        let value = self.take_pat_value();
        if let SimpleAssignTarget::Ident(i) = n {
            n.visit_children_with_ast_path(self, ast_path);

            self.add_value(
                i.to_id(),
                value.unwrap_or_else(|| {
                    JsValue::unknown(
                        JsValue::Variable(i.to_id()),
                        false,
                        rcstr!("pattern without value"),
                    )
                }),
            );
            return;
        }

        n.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_assign_target_pat<'ast: 'r, 'r>(
        &mut self,
        pat: &'ast AssignTargetPat,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let value = self
            .take_pat_value()
            .unwrap_or_else(|| JsValue::unknown_empty(false, rcstr!("pattern without value")));
        match pat {
            AssignTargetPat::Array(arr) => {
                let mut ast_path = ast_path.with_guard(AstParentNodeRef::AssignTargetPat(
                    pat,
                    AssignTargetPatField::Array,
                ));
                self.handle_array_pat_with_value(arr, value, &mut ast_path);
            }
            AssignTargetPat::Object(obj) => {
                let mut ast_path = ast_path.with_guard(AstParentNodeRef::AssignTargetPat(
                    pat,
                    AssignTargetPatField::Object,
                ));
                self.handle_object_pat_with_value(obj, value, &mut ast_path);
            }
            AssignTargetPat::Invalid(_) => {}
        }
    }

    fn visit_pat<'ast: 'r, 'r>(
        &mut self,
        pat: &'ast Pat,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let value = self.take_pat_value();
        match pat {
            Pat::Ident(i) => {
                self.add_value(
                    i.to_id(),
                    value.unwrap_or_else(|| {
                        JsValue::unknown(
                            JsValue::Variable(i.to_id()),
                            false,
                            rcstr!("pattern without value"),
                        )
                    }),
                );
            }

            Pat::Array(arr) => {
                let mut ast_path = ast_path.with_guard(AstParentNodeRef::Pat(pat, PatField::Array));
                let value = value.unwrap_or_else(|| {
                    JsValue::unknown_empty(false, rcstr!("pattern without value"))
                });
                self.handle_array_pat_with_value(arr, value, &mut ast_path);
            }

            Pat::Object(obj) => {
                let mut ast_path =
                    ast_path.with_guard(AstParentNodeRef::Pat(pat, PatField::Object));
                let value = value.unwrap_or_else(|| {
                    JsValue::unknown_empty(false, rcstr!("pattern without value"))
                });
                self.handle_object_pat_with_value(obj, value, &mut ast_path);
            }

            _ => pat.visit_children_with_ast_path(self, ast_path),
        }
    }

    fn visit_return_stmt<'ast: 'r, 'r>(
        &mut self,
        stmt: &'ast ReturnStmt,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        stmt.visit_children_with_ast_path(self, ast_path);

        // Technically a top level return is illegal, but node supports it due to how module
        // wrapping works.
        if self.is_in_fn() {
            let return_value = stmt
                .arg
                .as_deref()
                .map(|e| self.eval_context.eval(self.arena, e))
                .unwrap_or(JsValue::Constant(ConstantValue::Undefined));

            self.add_return_value(return_value);
        }

        self.add_early_return_always(ast_path);
    }

    fn visit_ident<'ast: 'r, 'r>(
        &mut self,
        ident: &'ast Ident,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        // Note: `Ident` is (generally) only used for nodes referencing a variable, as it has scope
        // information. In other cases (e.g. object literals, properties of member expressions),
        // `IdentName` is used instead.

        // Note: The `Ident` children of `ImportSpecifier` are not visited because
        // `visit_import_specifier` bails out.

        // Attempt to add import effects.
        if let Some((esm_reference_index, export)) =
            self.eval_context.imports.get_binding(&ident.to_id())
        {
            // Optimization: Look for a MemberExpr to see if we only access a few members from the
            // module, add those specific effects instead of depending on the entire module.
            //
            // export.is_none() checks for a namespace import (*).
            if export.is_none()
                && !self
                    .eval_context
                    .imports
                    .should_import_all(esm_reference_index)
                && let Some(AstParentNodeRef::MemberExpr(member, MemberExprField::Obj)) =
                    ast_path.get(ast_path.len() - 2)
                && let Some(prop) = self.eval_context.eval_member_prop(self.arena, &member.prop)
                && let Some(prop_str) = prop.as_str()
            {
                // a namespace member access like
                // `import * as ns from "..."; ns.exportName`
                self.add_effect(Effect::ImportedBinding {
                    esm_reference_index,
                    export: Some(prop_str.into()),
                    // point to the MemberExpression instead
                    ast_path: as_parent_path_skip(ast_path, 1),
                    span: member.span(),
                });
            } else {
                self.add_effect(Effect::ImportedBinding {
                    esm_reference_index,
                    export: export.map(|e| RcStr::from(e.as_str())),
                    ast_path: as_parent_path(ast_path),
                    span: ident.span(),
                })
            }
            return;
        }

        // If this identifier is free, produce an effect so we can potentially replace it later.
        if self.analyze_mode.is_code_gen()
            && let JsValue::FreeVar(var) = self.eval_context.eval_ident(self.arena, ident)
        {
            // TODO(lukesandberg): we should consider filtering effects here, e.g. there is no
            // benefit in an Effect for `window` or `Math`
            self.add_effect(Effect::FreeVar {
                var,
                ast_path: as_parent_path(ast_path),
                span: ident.span(),
            })
        }
    }

    fn visit_this_expr<'ast: 'r, 'r>(
        &mut self,
        node: &'ast ThisExpr,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        if self.analyze_mode.is_code_gen() && !self.is_this_bound() {
            // Otherwise 'this' is free
            self.add_effect(Effect::FreeVar {
                var: atom!("this"),
                ast_path: as_parent_path(ast_path),
                span: node.span(),
            })
        }
    }

    fn visit_meta_prop_expr<'ast: 'r, 'r>(
        &mut self,
        expr: &'ast MetaPropExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if self.analyze_mode.is_code_gen() && expr.kind == MetaPropKind::ImportMeta {
            // MetaPropExpr also covers `new.target`. Only consider `import.meta`
            // an effect.
            self.add_effect(Effect::ImportMeta {
                span: expr.span,
                ast_path: as_parent_path(ast_path),
            })
        }
    }

    fn visit_program<'ast: 'r, 'r>(
        &mut self,
        program: &'ast Program,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.effects = take(&mut self.data.effects);
        self.enter_block(LexicalContext::Block, |this| {
            program.visit_children_with_ast_path(this, ast_path);
        });
        self.effects.append(&mut self.hoisted_effects);
        self.data.effects = take(&mut self.effects);
        self.data.code_gens = take(&mut self.code_gens);
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
        let then_returning;
        let then = {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::IfStmt(stmt, IfStmtField::Cons));
            then_returning = self
                .enter_control_flow(|this| {
                    stmt.cons.visit_with_ast_path(this, &mut ast_path);
                })
                .1;

            Box::new(EffectsBlock {
                effects: take(&mut self.effects),
                range: AstPathRange::Exact(as_parent_path(&ast_path)),
            })
        };
        let mut else_returning = false;
        let r#else = stmt.alt.as_ref().map(|alt| {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::IfStmt(stmt, IfStmtField::Alt));
            else_returning = self
                .enter_control_flow(|this| {
                    alt.visit_with_ast_path(this, &mut ast_path);
                })
                .1;

            Box::new(EffectsBlock {
                effects: take(&mut self.effects),
                range: AstPathRange::Exact(as_parent_path(&ast_path)),
            })
        });
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
        // TODO: if both try and catch return unconditionally, then so does the whole try statement
        let prev_effects = take(&mut self.effects);

        let mut block = {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::TryStmt(stmt, TryStmtField::Block));
            self.enter_try(|this| {
                stmt.block.visit_with_ast_path(this, &mut ast_path);
            });

            take(&mut self.effects)
        };
        let mut handler = if let Some(handler) = stmt.handler.as_ref() {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::TryStmt(stmt, TryStmtField::Handler));
            self.enter_control_flow(|this| {
                handler.visit_with_ast_path(this, &mut ast_path);
            });
            take(&mut self.effects)
        } else {
            vec![]
        };
        self.effects = prev_effects;
        self.effects.append(&mut block);
        self.effects.append(&mut handler);
        if let Some(finalizer) = stmt.finalizer.as_ref() {
            let finally_returns_unconditionally = {
                let mut ast_path =
                    ast_path.with_guard(AstParentNodeRef::TryStmt(stmt, TryStmtField::Finalizer));
                self.enter_control_flow(|this| {
                    finalizer.visit_with_ast_path(this, &mut ast_path);
                })
                .1
            };
            // If a finally block early returns the parent block does too.
            if finally_returns_unconditionally {
                self.add_early_return_always(ast_path);
            }
        };
    }

    fn visit_switch_case<'ast: 'r, 'r>(
        &mut self,
        case: &'ast SwitchCase,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        let prev_effects = take(&mut self.effects);
        self.enter_control_flow(|this| {
            case.visit_children_with_ast_path(this, ast_path);
        });
        let mut effects = take(&mut self.effects);
        self.effects = prev_effects;
        self.effects.append(&mut effects);
    }

    fn visit_block_stmt<'ast: 'r, 'r>(
        &mut self,
        n: &'ast BlockStmt,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        match self.cur_lexical_context() {
            LexicalContext::Function { .. } => {
                let mut effects = take(&mut self.effects);
                let hoisted_effects = take(&mut self.hoisted_effects);

                let (_, returns_unconditionally) =
                    self.enter_block(LexicalContext::Block, |this| {
                        n.visit_children_with_ast_path(this, ast_path);
                    });
                // By handling this logic here instead of in enter_fn, we naturally skip it
                // for arrow functions with single expression bodies, since they just don't hit this
                // path.
                if !returns_unconditionally {
                    self.add_return_value(JsValue::Constant(ConstantValue::Undefined));
                }
                self.effects.append(&mut self.hoisted_effects);
                effects.append(&mut self.effects);
                self.hoisted_effects = hoisted_effects;
                self.effects = effects;
            }
            LexicalContext::ControlFlow { .. } => {
                self.with_block(LexicalContext::Block, |this| {
                    n.visit_children_with_ast_path(this, ast_path)
                });
            }
            LexicalContext::Block => {
                // Handle anonymous block statement
                // e.g., enter a new control flow context and because it is 'unconditiona' we
                // need to propagate early returns
                let (_, returns_early) = self.enter_control_flow(|this| {
                    n.visit_children_with_ast_path(this, ast_path);
                });
                if returns_early {
                    self.add_early_return_always(ast_path);
                }
            }
            LexicalContext::ClassBody => {
                // this would be something like a `static` initialization block
                // there is no early return logic required here so just visit children
                n.visit_children_with_ast_path(self, ast_path);
            }
        }
    }

    fn visit_unary_expr<'ast: 'r, 'r>(
        &mut self,
        n: &'ast UnaryExpr,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        if n.op == UnaryOp::TypeOf && self.analyze_mode.is_code_gen() {
            let arg_value = BumpBox::new_in(self.eval_context.eval(self.arena, &n.arg), self.arena);

            self.add_effect(Effect::TypeOf {
                arg: arg_value,
                ast_path: as_parent_path(ast_path),
                span: n.span(),
            });
        }

        n.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_labeled_stmt<'ast: 'r, 'r>(
        &mut self,
        stmt: &'ast LabeledStmt,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let mut prev_effects = take(&mut self.effects);
        self.enter_control_flow(|this| {
            stmt.visit_children_with_ast_path(this, ast_path);
        });

        let effects = take(&mut self.effects);

        prev_effects.push(Effect::Conditional {
            condition: BumpBox::new_in(
                JsValue::unknown_empty(true, rcstr!("labeled statement")),
                self.arena,
            ),
            kind: Box::new(ConditionalKind::Labeled {
                body: Box::new(EffectsBlock {
                    effects,
                    range: AstPathRange::Exact(as_parent_path_with(
                        ast_path,
                        AstParentKind::LabeledStmt(LabeledStmtField::Body),
                    )),
                }),
            }),
            ast_path: as_parent_path(ast_path),
            span: stmt.span,
        });

        self.effects = prev_effects;
    }

    fn visit_export_all<'ast: 'r, 'r>(
        &mut self,
        export: &'ast ExportAll,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if export.type_only {
            return;
        }
        self.add_esm_module_item(ast_path);
        export.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_export_decl<'ast: 'r, 'r>(
        &mut self,
        node: &'ast ExportDecl,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        self.add_esm_module_item(ast_path);
        node.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_export_named_specifier<'ast: 'r, 'r>(
        &mut self,
        node: &'ast ExportNamedSpecifier,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        if node.is_type_only {
            return;
        }
        node.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_export_default_expr<'ast: 'r, 'r>(
        &mut self,
        export: &'ast ExportDefaultExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.add_esm_module_item(ast_path);
        export.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_export_default_decl<'ast: 'r, 'r>(
        &mut self,
        export: &'ast ExportDefaultDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.add_esm_module_item(ast_path);
        export.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_named_export<'ast: 'r, 'r>(
        &mut self,
        export: &'ast NamedExport,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if export.type_only {
            return;
        }
        self.add_esm_module_item(ast_path);
        export.visit_children_with_ast_path(self, ast_path);
    }
}

impl<'a> Analyzer<'a, '_> {
    fn add_conditional_if_effect_with_early_return(
        &mut self,
        test: &Expr,
        ast_path: &AstNodePath<AstParentNodeRef<'_>>,
        condition_ast_kind: AstParentKind,
        span: Span,
        then: Option<Box<EffectsBlock<'a>>>,
        r#else: Option<Box<EffectsBlock<'a>>>,
        early_return_when_true: bool,
        early_return_when_false: bool,
    ) {
        if then.is_none() && r#else.is_none() && !early_return_when_false && !early_return_when_true
        {
            return;
        }
        let condition = BumpBox::new_in(self.eval_context.eval(self.arena, test), self.arena);
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
                let early_return = EarlyReturn::Conditional {
                    prev_effects: take(&mut self.effects),
                    start_ast_path: as_parent_path(ast_path),
                    condition,
                    then,
                    r#else,
                    condition_ast_path: as_parent_path_with(ast_path, condition_ast_kind),
                    span,
                    early_return_condition_value: true,
                };
                self.early_return_stack_mut().push(early_return);
            }
            (false, true) => {
                let early_return = EarlyReturn::Conditional {
                    prev_effects: take(&mut self.effects),
                    start_ast_path: as_parent_path(ast_path),
                    condition,
                    then,
                    r#else,
                    condition_ast_path: as_parent_path_with(ast_path, condition_ast_kind),
                    span,
                    early_return_condition_value: false,
                };
                self.early_return_stack_mut().push(early_return);
            }
            (false, false) | (true, true) => {
                let kind = match (then, r#else) {
                    (Some(then), Some(r#else)) => ConditionalKind::IfElse { then, r#else },
                    (Some(then), None) => ConditionalKind::If { then },
                    (None, Some(r#else)) => ConditionalKind::Else { r#else },
                    (None, None) => {
                        // No effects, ignore
                        return;
                    }
                };
                self.add_effect(Effect::Conditional {
                    condition,
                    kind: Box::new(kind),
                    ast_path: as_parent_path_with(ast_path, condition_ast_kind),
                    span,
                });
                if early_return_when_false && early_return_when_true {
                    let early_return = EarlyReturn::Always {
                        prev_effects: take(&mut self.effects),
                        start_ast_path: as_parent_path(ast_path),
                    };
                    self.early_return_stack_mut().push(early_return);
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
        mut cond_kind: ConditionalKind<'a>,
    ) {
        let condition = BumpBox::new_in(self.eval_context.eval(self.arena, test), self.arena);
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
                ConditionalKind::Labeled { body } => {
                    self.effects.append(&mut body.effects);
                }
            }
        } else {
            self.add_effect(Effect::Conditional {
                condition,
                kind: Box::new(cond_kind),
                ast_path: as_parent_path_with(ast_path, ast_kind),
                span,
            });
        }
    }

    fn handle_array_pat_with_value<'ast: 'r, 'r>(
        &mut self,
        arr: &'ast ArrayPat,
        pat_value: JsValue<'a>,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        match pat_value {
            JsValue::Array { items, .. } => {
                for (idx, (elem_pat, value_item)) in arr
                    .elems
                    .iter()
                    // TODO: This does not handle inline spreads correctly
                    // e.g. `let [a,..b,c] = [1,2,3]`
                    .zip(
                        items
                            .into_iter()
                            .map(Some)
                            .chain(iter::repeat_with(|| None)),
                    )
                    .enumerate()
                {
                    self.with_pat_value(value_item, |this| {
                        let mut ast_path = ast_path
                            .with_guard(AstParentNodeRef::ArrayPat(arr, ArrayPatField::Elems(idx)));
                        elem_pat.visit_with_ast_path(this, &mut ast_path);
                    });
                }
            }
            value => {
                for (idx, elem) in arr.elems.iter().enumerate() {
                    let pat_value = Some(JsValue::member(
                        self.arena,
                        value.clone_in(self.arena),
                        JsValue::Constant(ConstantValue::Num((idx as f64).into())),
                    ));
                    self.with_pat_value(pat_value, |this| {
                        let mut ast_path = ast_path
                            .with_guard(AstParentNodeRef::ArrayPat(arr, ArrayPatField::Elems(idx)));
                        elem.visit_with_ast_path(this, &mut ast_path);
                    });
                }
            }
        }
    }

    fn handle_object_pat_with_value<'ast: 'r, 'r>(
        &mut self,
        obj: &'ast ObjectPat,
        pat_value: JsValue<'a>,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
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
                    let key_value = self.eval_context.eval_prop_name(self.arena, key);
                    {
                        let mut ast_path = ast_path.with_guard(AstParentNodeRef::KeyValuePatProp(
                            kv,
                            KeyValuePatPropField::Key,
                        ));
                        key.visit_with_ast_path(self, &mut ast_path);
                    }
                    let pat_value = Some(JsValue::member(
                        self.arena,
                        pat_value.clone_in(self.arena),
                        key_value,
                    ));
                    self.with_pat_value(pat_value, |this| {
                        let mut ast_path = ast_path.with_guard(AstParentNodeRef::KeyValuePatProp(
                            kv,
                            KeyValuePatPropField::Value,
                        ));
                        value.visit_with_ast_path(this, &mut ast_path);
                    });
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
                            let value = self.eval_context.eval(self.arena, value);
                            JsValue::alternatives(BumpVec::from_iter_in(
                                self.arena,
                                [
                                    JsValue::member(
                                        self.arena,
                                        pat_value.clone_in(self.arena),
                                        key_value,
                                    ),
                                    value,
                                ],
                            ))
                        } else {
                            JsValue::member(self.arena, pat_value.clone_in(self.arena), key_value)
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
            if &**sym == "define"
                && let Expr::Fn(FnExpr { function, .. }) = &*args[0].expr
            {
                let params = &*function.params;
                if params.len() == 1
                    && let Pat::Ident(param) = &params[0].pat
                    && &*param.id.sym == "require"
                {
                    return Some(param.to_id());
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
            if params.len() == 1
                && let Some(FnExpr { function, .. }) =
                    args.first().and_then(|arg| arg.expr.as_fn_expr())
            {
                let params = &*function.params;
                if !params.is_empty()
                    && let Pat::Ident(param) = &params[0].pat
                    && &*param.id.sym == "require"
                {
                    return Some(param.to_id());
                }
            }
        }

        _ => {}
    }

    None
}
