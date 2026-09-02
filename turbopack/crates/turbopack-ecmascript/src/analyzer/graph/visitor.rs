use std::{
    iter,
    mem::{replace, take},
};

use bumpalo::boxed::Box as BumpBox;
use rustc_hash::FxHashMap;
use smallvec::SmallVec;
use swc_core::{
    common::{BytePos, Span, Spanned, SyntaxContext, pass::AstNodePath},
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
        Bump, BumpVec, ConstantValue, ImportMap, JsValue, WellKnownFunctionKind,
        cjs_ast::{
            as_exports_define_property, as_module_exports_object_literal,
            define_property_sets_es_module, is_exports_object, is_global, is_module_exports_chain,
        },
        graph::{ConditionalKind, Effect, EffectArg, EffectsBlock, EvalContext, VarGraph},
        is_unresolved_id,
    },
    chunk::CjsStaticExports,
    code_gen::CodeGen,
    references::{
        AstPath,
        cjs::{CjsExportsDropCodeGen, DroppableCjsExportAssignment},
        esm::EsmModuleItem,
    },
    utils::{AstPathRange, extract_name_from_member_prop, extract_names_from_object_pat, unparen},
};

enum EarlyReturn<'a> {
    Always {
        prev_effects: BumpVec<'a, Effect<'a>>,
        start_ast_path: BumpBox<'a, [AstParentKind]>,
    },
    Conditional {
        prev_effects: BumpVec<'a, Effect<'a>>,
        start_ast_path: BumpBox<'a, [AstParentKind]>,

        condition: BumpBox<'a, JsValue<'a>>,
        then: Option<EffectsBlock<'a>>,
        r#else: Option<EffectsBlock<'a>>,
        /// The ast path to the condition.
        condition_ast_path: BumpBox<'a, [AstParentKind]>,
        span: Span,

        early_return_condition_value: bool,
    },
}

/// Builds an arena-allocated boxed slice of the ast path, skipping the last `skip` entries.
pub fn as_parent_path_skip_in<'a>(
    arena: &'a Bump,
    ast_path: &AstNodePath<AstParentNodeRef<'_>>,
    skip: usize,
) -> BumpBox<'a, [AstParentKind]> {
    let kinds = ast_path.kinds();
    let kinds = &kinds[..kinds.len() - skip];
    let mut path = BumpVec::with_capacity_in(arena, kinds.len());
    path.extend_from_slice(arena, kinds);
    path.into_boxed_slice()
}

pub(super) struct Analyzer<'arena, 'eval> {
    pub(super) arena: &'arena Bump,

    pub(super) analyze_mode: AnalyzeMode,

    pub(super) data: VarGraph<'arena>,
    pub(super) state: analyzer_state::AnalyzerState<'arena>,

    pub(super) effects: BumpVec<'arena, Effect<'arena>>,
    /// Effects collected from hoisted declarations. See https://developer.mozilla.org/en-US/docs/Glossary/Hoisting
    /// Tracked separately so we can preserve effects from hoisted declarations even when we don't
    /// collect effects from the declaring context.
    pub(super) hoisted_effects: BumpVec<'arena, Effect<'arena>>,

    // Some unconditional codegens, usually for ESM items.
    pub(super) code_gens: Vec<CodeGen>,

    /// Whether we may codegen `let` and `const` or if we should fallback to var (at the cost of
    /// slightly less correct circular import errors) for EsmModuleItem
    pub(super) supports_block_scoping: bool,

    pub(super) eval_context: &'eval EvalContext,
}

/// Collects a static CommonJS module's droppable named exports during the main
/// analyzer walk. Any `exports` / `module` use that isn't a recognized
/// `exports.NAME = …` write taints the module by dropping the collector,
/// leaving the module opaque.
#[derive(Default)]
struct CjsExportsCollector {
    /// Recognized `exports.NAME = …` writes, each removable if `NAME` is unused.
    writes: Vec<DroppableCjsExportAssignment>,
    /// Writes to an exports object a literal discarded, removable whatever the usage.
    dead_writes: Vec<DroppableCjsExportAssignment>,
    /// Whether the `exports.__esModule = true` interop marker is set.
    has_es_module: bool,
    /// Whether a `module.exports = { … }` literal has replaced the exports object.
    exports_object_replaced: bool,
    /// Whether the module body contains a top-level `return`, which skips every
    /// write that follows it.
    has_top_level_return: bool,
    /// Whether any export is defined with `Object.defineProperty`.
    has_define_property_export: bool,
}

/// The removable writes, the always-removable ones, and whether the `__esModule`
/// interop marker is set.
type CjsExportDrops = (
    Vec<DroppableCjsExportAssignment>,
    Vec<DroppableCjsExportAssignment>,
    bool,
);

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
        cjs_exports: Option<CjsExportsCollector>,
        cjs_export_target: bool,
        cjs_export_value: bool,
        /// Tracked `const x = require(...)` namespace bindings
        require_bindings: Option<FxHashMap<Id, BytePos>>,
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
            self.this_binding_depth() > 0
        }

        pub(super) fn this_binding_depth(&self) -> usize {
            self.state
                .lexical_stack
                .iter()
                .filter(|b| {
                    matches!(
                        b,
                        LexicalContext::Function {
                            id: _,
                            binds_this: true
                        } | LexicalContext::ClassBody
                    )
                })
                .count()
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

        pub(super) fn with_cjs_export_target<T>(&mut self, func: impl FnOnce(&mut Self) -> T) -> T {
            let prev = replace(&mut self.state.cjs_export_target, true);
            let out = func(self);
            self.state.cjs_export_target = prev;
            out
        }

        pub(super) fn in_cjs_export_target(&self) -> bool {
            self.state.cjs_export_target
        }

        /// Runs `func` (the right-hand side of a recognized `exports.NAME = …` write) with
        /// the `cjs_export_value` flag set, so a first-level `this` inside an exported
        /// function value can be recognized as aliasing `exports`.
        pub(super) fn with_cjs_export_value<T>(&mut self, func: impl FnOnce(&mut Self) -> T) -> T {
            let prev = replace(&mut self.state.cjs_export_value, true);
            let out = func(self);
            self.state.cjs_export_value = prev;
            out
        }

        pub(super) fn in_cjs_export_value(&self) -> bool {
            self.state.cjs_export_value
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
                start_ast_path: as_parent_path_in(self.arena, ast_path),
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
                            self.effects
                                .push(self.arena, Effect::Unreachable { start_ast_path });
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
                        let block = EffectsBlock {
                            effects: take(&mut self.effects).into_boxed_slice(),
                            range: AstPathRange::StartAfter(start_ast_path.to_vec()),
                        };
                        self.effects = prev_effects;
                        let kind = match (then, r#else, early_return_condition_value) {
                            (None, None, false) => ConditionalKind::If { then: block },
                            (None, None, true) => ConditionalKind::IfElseMultiple {
                                then: bumpalo::collections::Vec::from_iter_in([block], self.arena)
                                    .into_boxed_slice(),
                                r#else: bumpalo::collections::Vec::new_in(self.arena)
                                    .into_boxed_slice(),
                            },
                            (Some(then), None, false) => ConditionalKind::IfElseMultiple {
                                then: bumpalo::collections::Vec::from_iter_in(
                                    [then, block],
                                    self.arena,
                                )
                                .into_boxed_slice(),
                                r#else: bumpalo::collections::Vec::new_in(self.arena)
                                    .into_boxed_slice(),
                            },
                            (Some(then), None, true) => ConditionalKind::IfElse {
                                then,
                                r#else: block,
                            },
                            (Some(then), Some(r#else), false) => ConditionalKind::IfElseMultiple {
                                then: bumpalo::collections::Vec::from_iter_in(
                                    [then, block],
                                    self.arena,
                                )
                                .into_boxed_slice(),
                                r#else: bumpalo::collections::Vec::from_iter_in(
                                    [r#else],
                                    self.arena,
                                )
                                .into_boxed_slice(),
                            },
                            (Some(then), Some(r#else), true) => ConditionalKind::IfElseMultiple {
                                then: bumpalo::collections::Vec::from_iter_in([then], self.arena)
                                    .into_boxed_slice(),
                                r#else: bumpalo::collections::Vec::from_iter_in(
                                    [r#else, block],
                                    self.arena,
                                )
                                .into_boxed_slice(),
                            },
                            (None, Some(r#else), false) => ConditionalKind::IfElse {
                                then: block,
                                r#else,
                            },
                            (None, Some(r#else), true) => ConditionalKind::IfElseMultiple {
                                then: bumpalo::collections::Vec::new_in(self.arena)
                                    .into_boxed_slice(),
                                r#else: bumpalo::collections::Vec::from_iter_in(
                                    [r#else, block],
                                    self.arena,
                                )
                                .into_boxed_slice(),
                            },
                        };
                        self.effects.push(
                            self.arena,
                            Effect::Conditional {
                                condition,
                                kind: BumpBox::new_in(kind, self.arena),
                                ast_path: condition_ast_path,
                                span,
                            },
                        )
                    }
                }
            }
            always_returns
        }

        pub(in crate::analyzer::graph) fn enable_cjs_exports(&mut self) {
            self.state.cjs_exports = Some(CjsExportsCollector::default());
        }

        /// Enables `require("…")` export-usage narrowing and seed it
        /// with information collected by the `ImportMap` visitor.
        pub(in crate::analyzer::graph) fn enable_require_usage(&mut self, imports: &ImportMap) {
            let cjs_imports = imports.cjs_imports();
            self.data.require_usage = cjs_imports.resolved.clone();
            // Seed each namespace binding as `Evaluation`; a binding that's never
            // read keeps that (only the target's side effects matter), while a
            // member read upgrades it to `PartialNamespaceObject` below.
            for span in cjs_imports.bindings.values() {
                self.data
                    .require_usage
                    .insert(*span, ExportUsage::Evaluation);
            }
            self.state.require_bindings = Some(cjs_imports.bindings.clone());
        }

        pub(super) fn is_tracked_require_binding(&self, id: &Id) -> bool {
            self.state
                .require_bindings
                .as_ref()
                .is_some_and(|b| b.contains_key(id))
        }

        /// Records a tracked `const x = require(...)` is used.
        pub(super) fn record_require_usage(&mut self, id: &Id, member: Option<RcStr>) {
            let Some(span) = self
                .state
                .require_bindings
                .as_ref()
                .and_then(|b| b.get(id).copied())
            else {
                return;
            };
            let Some(usage) = self.data.require_usage.get_mut(&span) else {
                return;
            };
            match member {
                Some(name) => match usage {
                    ExportUsage::PartialNamespaceObject(names) => {
                        if !names.contains(&name) {
                            names.push(name);
                        }
                    }
                    // First member read of an otherwise-unused binding.
                    ExportUsage::Evaluation => {
                        let mut names = SmallVec::new();
                        names.push(name);
                        *usage = ExportUsage::PartialNamespaceObject(names);
                    }
                    // Already escaped to the whole namespace.
                    _ => {}
                },
                None => *usage = ExportUsage::All,
            }
        }

        /// If this is `export const x = require(...)`, mark the whole of `x` as
        /// observable.
        pub(super) fn escape_exported_require_bindings(&mut self, node: &ExportDecl) {
            if self.state.require_bindings.is_none() {
                return;
            }
            let Decl::Var(var) = &node.decl else {
                return;
            };
            for d in &var.decls {
                if let Pat::Ident(binding) = &d.name {
                    let span = self
                        .state
                        .require_bindings
                        .as_ref()
                        .and_then(|b| b.get(&binding.id.to_id()).copied());
                    if let Some(span) = span
                        && let Some(usage) = self.data.require_usage.get_mut(&span)
                    {
                        *usage = ExportUsage::All;
                    }
                }
            }
        }

        pub(super) fn cjs_exports_enabled(&self) -> bool {
            self.state.cjs_exports.is_some()
        }

        pub(super) fn taint_cjs_exports(&mut self) {
            self.state.cjs_exports = None;
        }

        pub(super) fn cjs_exports_object_replaced(&self) -> bool {
            self.state
                .cjs_exports
                .as_ref()
                .is_some_and(|c| c.exports_object_replaced)
        }

        pub(super) fn replace_cjs_exports_object(&mut self) {
            if let Some(c) = &mut self.state.cjs_exports {
                c.dead_writes.append(&mut c.writes);
                c.has_es_module = false;
                c.exports_object_replaced = true;
            }
        }

        /// Records the `exports.__esModule = true` interop marker.
        pub(super) fn set_cjs_has_es_module(&mut self) {
            if let Some(c) = &mut self.state.cjs_exports {
                c.has_es_module = true;
            }
        }

        /// Records a `return` in the module body, which exits the module early.
        pub(super) fn set_cjs_has_top_level_return(&mut self) {
            if let Some(c) = &mut self.state.cjs_exports {
                c.has_top_level_return = true;
            }
        }

        /// Records that an export is defined with `Object.defineProperty`.
        pub(super) fn set_cjs_has_define_property_export(&mut self) {
            if let Some(c) = &mut self.state.cjs_exports {
                c.has_define_property_export = true;
            }
        }

        pub(super) fn record_cjs_export(&mut self, name: RcStr, path: AstPath) {
            self.push_cjs_export(DroppableCjsExportAssignment::Write { name, path });
        }

        pub(super) fn record_dead_cjs_write(&mut self, name: RcStr, path: AstPath) {
            if let Some(c) = &mut self.state.cjs_exports {
                c.dead_writes
                    .push(DroppableCjsExportAssignment::Write { name, path });
            }
        }

        /// Records the named exports of a `module.exports = { … }` object literal. They
        /// share `path` (the assignment); the code-gen removes each unused property.
        pub(super) fn record_cjs_object_literal_exports(
            &mut self,
            names: Vec<RcStr>,
            path: AstPath,
        ) {
            self.push_cjs_export(DroppableCjsExportAssignment::ObjectLiteral { names, path });
        }

        fn push_cjs_export(&mut self, drop: DroppableCjsExportAssignment) {
            if let Some(c) = &mut self.state.cjs_exports {
                c.writes.push(drop);
            }
        }

        /// Returns the removable and always-removable writes and the `__esModule` flag,
        /// plus the static-exports for scope hoisting.
        pub(super) fn cjs_exports_analysis(
            &mut self,
        ) -> (Option<CjsExportDrops>, Option<CjsStaticExports>) {
            let Some(c) = self.state.cjs_exports.take() else {
                return (None, None);
            };
            // A top-level `return` skips the writes after it, and would abandon the rest
            // of a merged factory. An `Object.defineProperty` export keeps its value in
            // the descriptor, which the merge has no local to bind it to.
            let static_exports =
                (!c.has_top_level_return && !c.has_define_property_export).then(|| {
                    CjsStaticExports {
                        export_names: c
                            .writes
                            .iter()
                            .flat_map(|w| match w {
                                DroppableCjsExportAssignment::Write { name, .. } => {
                                    std::slice::from_ref(name)
                                }
                                DroppableCjsExportAssignment::ObjectLiteral { names, .. } => {
                                    names.as_slice()
                                }
                            })
                            .cloned()
                            .collect(),
                        has_es_module: c.has_es_module,
                    }
                });
            // Dropping an unused write stays sound regardless of the `return`, but
            // `__esModule` may be set after it, so it can't be claimed.
            let has_es_module = c.has_es_module && !c.has_top_level_return;
            let drops = (!c.writes.is_empty() || !c.dead_writes.is_empty()).then_some((
                c.writes,
                c.dead_writes,
                has_es_module,
            ));
            (drops, static_exports)
        }

        /// Whether `target` is a static named CommonJS export write —
        /// eg. `exports.NAME` / `module.exports.NAME`, or a top-level `this.NAME`
        /// (free top-level `this` aliases `module.exports` in CommonJS).
        pub(super) fn is_named_cjs_export_target(&self, target: &AssignTarget) -> bool {
            let AssignTarget::Simple(SimpleAssignTarget::Member(member)) = target else {
                return false;
            };
            if !matches!(member.prop, MemberProp::Ident(_)) {
                return false;
            }
            is_exports_object(&member.obj, self.eval_context.unresolved_mark)
                || (matches!(&*member.obj, Expr::This(_))
                    && !self.is_in_fn()
                    && !self.is_in_nested_block_scope())
        }
    }
}

pub fn as_parent_path(ast_path: &AstNodePath<AstParentNodeRef<'_>>) -> Vec<AstParentKind> {
    ast_path.kinds().to_vec()
}

/// Like [`as_parent_path`], but freezes the path into an arena-allocated boxed slice.
pub fn as_parent_path_in<'a>(
    arena: &'a Bump,
    ast_path: &AstNodePath<AstParentNodeRef<'_>>,
) -> BumpBox<'a, [AstParentKind]> {
    let mut path = BumpVec::with_capacity_in(arena, ast_path.kinds().len());
    path.extend_from_slice(arena, ast_path.kinds());
    path.into_boxed_slice()
}

/// Like [`as_parent_path_with`], but freezes the path into an arena-allocated boxed slice.
pub fn as_parent_path_with_in<'a>(
    arena: &'a Bump,
    ast_path: &AstNodePath<AstParentNodeRef<'_>>,
    additional: AstParentKind,
) -> BumpBox<'a, [AstParentKind]> {
    let kinds = ast_path.kinds();
    let mut path = BumpVec::with_capacity_in(arena, kinds.len() + 1);
    path.extend_from_slice(arena, kinds);
    path.push(arena, additional);
    path.into_boxed_slice()
}

/// Whether the node at `ast_path` is a whole statement, so its value goes nowhere:
/// true for `module.exports = {};` and `(module.exports = {});`, false for
/// `var x = module.exports = {}` or `f(module.exports = {})`.
fn is_expression_statement(ast_path: &AstNodePath<AstParentNodeRef<'_>>) -> bool {
    for node_ref in ast_path.iter().rev() {
        match node_ref {
            // The `Expr` wrapper of the node itself, and of a parenthesized one.
            AstParentNodeRef::Expr(..) | AstParentNodeRef::ParenExpr(_, ParenExprField::Expr) => {}
            AstParentNodeRef::ExprStmt(_, ExprStmtField::Expr) => return true,
            _ => return false,
        }
    }
    false
}

/// Returns the [`MemberExpr`] where the current node is the object:
/// `<node>.<prop>` or `<node>[<expr>]`.
fn member_access_parent<'r>(
    ast_path: &AstNodePath<AstParentNodeRef<'r>>,
) -> Option<&'r MemberExpr> {
    match ast_path.len().checked_sub(2).and_then(|i| ast_path.get(i)) {
        Some(AstParentNodeRef::MemberExpr(member, MemberExprField::Obj)) => Some(*member),
        _ => None,
    }
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
        self.effects.push(self.arena, effect);
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

    /// Visits a call/new argument, guarding it as a CJS export target when `guard`
    /// is set so a bare `exports` / `module` reference there doesn't taint.
    fn visit_arg_maybe_cjs_export_target<'ast: 'r, 'r>(
        &mut self,
        guard: bool,
        arg: &'ast ExprOrSpread,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if guard {
            self.with_cjs_export_target(|this| arg.visit_with_ast_path(this, ast_path));
        } else {
            arg.visit_with_ast_path(self, ast_path);
        }
    }

    fn check_call_expr_for_effects<'ast: 'r, 'n, 'r>(
        &mut self,
        callee: &'n Callee,
        args: impl Iterator<Item = &'ast ExprOrSpread>,
        span: Span,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
        n: CallOrNewExpr<'ast>,
        // Index of the `exports` export-target arg to guard from tainting; other
        // args (incl. descriptor getter/value bodies) taint normally.
        cjs_export_target_arg: Option<usize>,
    ) {
        let new = n.as_new().is_some();
        let args = BumpVec::from_iter_in(
            self.arena,
            args.enumerate().map(|(i, arg)| {
                let guard_cjs_export_target = cjs_export_target_arg == Some(i);
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
                            body: BlockStmtOrExpr::BlockStmt(_),
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
                            body: BlockStmtOrExpr::Expr(_),
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
                        self.visit_arg_maybe_cjs_export_target(
                            guard_cjs_export_target,
                            arg,
                            &mut ast_path,
                        );
                        let effects = replace(&mut self.effects, old_effects);
                        EffectArg::Closure(
                            value,
                            BumpBox::new_in(
                                EffectsBlock {
                                    effects: effects.into_boxed_slice(),
                                    range: AstPathRange::Exact(path),
                                },
                                self.arena,
                            ),
                        )
                    } else {
                        self.visit_arg_maybe_cjs_export_target(
                            guard_cjs_export_target,
                            arg,
                            &mut ast_path,
                        );
                        EffectArg::Value(value)
                    }
                } else {
                    self.visit_arg_maybe_cjs_export_target(
                        guard_cjs_export_target,
                        arg,
                        &mut ast_path,
                    );
                    EffectArg::Spread
                }
            }),
        );

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
                    ast_path: as_parent_path_in(self.arena, ast_path),
                    span,
                    in_try: self.is_in_try(),
                    export_usage,
                });
            }
            Callee::Expr(expr) => {
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
                        ast_path: as_parent_path_in(self.arena, ast_path),
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
                        ast_path: as_parent_path_in(self.arena, ast_path),
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
                ast_path: as_parent_path_in(self.arena, ast_path),
                span,
                in_try: self.is_in_try(),
                new,
            }),
        }
    }

    fn add_esm_module_item(&mut self, ast_path: &AstNodePath<AstParentNodeRef<'_>>) {
        if self.analyze_mode.is_code_gen() {
            self.code_gens.push(
                EsmModuleItem::new(as_parent_path(ast_path).into(), self.supports_block_scoping)
                    .into(),
            );
        }
    }

    /// Records a top-level `exports.NAME = …` write (or the `__esModule = true` marker)
    /// so an unused export can be dropped. Forms we can't drop safely are left in place.
    fn maybe_recognize_cjs_export(
        &mut self,
        n: &AssignExpr,
        ast_path: &AstNodePath<AstParentNodeRef<'_>>,
    ) {
        if n.op != AssignOp::Assign {
            return;
        }
        // Only top-level writes can be dropped.
        if self.is_in_fn() || self.is_in_nested_block_scope() {
            self.taint_cjs_exports();
            return;
        }
        let AssignTarget::Simple(SimpleAssignTarget::Member(member)) = &n.left else {
            return;
        };
        // After a replacement only `module.exports` still reaches the exports object.
        let dead = self.cjs_exports_object_replaced()
            && !is_module_exports_chain(&member.obj, self.eval_context.unresolved_mark);
        let MemberProp::Ident(name) = &member.prop else {
            return;
        };

        // Transpilers use this to signal that this is transpiled esm.
        // Which in turn changes the behavior of default exports. such that `import foo from
        // 'transpiled-esm-cjs'` gets the `default` export instead of the namespace
        if !dead && name.sym.as_ref() == "__esModule" {
            // Only a literal `true` is the interop marker.
            if matches!(unparen(&n.right), Expr::Lit(Lit::Bool(b)) if b.value) {
                self.set_cjs_has_es_module();
            }
            return;
        }

        // The RHS isn't inspected; the code-gen keeps it as `<value>`.
        let name = RcStr::from(name.sym.as_str());
        let path = as_parent_path(ast_path).into();
        if dead {
            self.record_dead_cjs_write(name, path);
        } else {
            self.record_cjs_export(name, path);
        }
    }

    /// Records a top-level `Object.defineProperty(exports, "NAME", …)` export so
    /// an unused one can be dropped; the `__esModule` marker sets the interop flag.
    fn recognize_cjs_define_property(
        &mut self,
        name: &str,
        n: &CallExpr,
        ast_path: &AstNodePath<AstParentNodeRef<'_>>,
    ) {
        // Only top-level defines can be dropped.
        if self.is_in_fn() || self.is_in_nested_block_scope() {
            self.taint_cjs_exports();
            return;
        }
        // Catches `var Self = Object.defineProperty(exports, …)`: the call returns exports.
        if !is_expression_statement(ast_path) {
            self.taint_cjs_exports();
            return;
        }
        let dead = self.cjs_exports_object_replaced()
            && !n.args.first().is_some_and(|target| {
                is_module_exports_chain(&target.expr, self.eval_context.unresolved_mark)
            });
        if !dead && name == "__esModule" {
            if define_property_sets_es_module(n) {
                self.set_cjs_has_es_module();
            }
            return;
        }
        let (name, path) = (RcStr::from(name), as_parent_path(ast_path).into());
        if dead {
            self.record_dead_cjs_write(name, path);
        } else {
            self.set_cjs_has_define_property_export();
            self.record_cjs_export(name, path);
        }
    }

    /// Records the droppable named exports of a top-level `module.exports = { … }`
    /// literal. A spread or computed key taints; `__esModule: true` sets the flag.
    fn recognize_cjs_object_exports(
        &mut self,
        n: &AssignExpr,
        ast_path: &AstNodePath<AstParentNodeRef<'_>>,
    ) {
        // Only a top-level assignment defines the module's exports.
        if self.is_in_fn() || self.is_in_nested_block_scope() {
            self.taint_cjs_exports();
            return;
        }
        let Some(obj) = as_module_exports_object_literal(n, self.eval_context.unresolved_mark)
        else {
            return;
        };
        // Catches `var Self = module.exports = { … }`: the alias reads exports back.
        if !is_expression_statement(ast_path) {
            self.taint_cjs_exports();
            return;
        }
        // A statement-position assignment definitely runs.
        self.replace_cjs_exports_object();
        let mut names = Vec::new();
        for prop in &obj.props {
            // A spread makes the export set unknowable.
            let PropOrSpread::Prop(prop) = prop else {
                self.taint_cjs_exports();
                return;
            };
            // Only a data property has an eager value (preserved by the code-gen);
            // getters/setters/methods have none and are removed outright.
            let value = match &**prop {
                Prop::KeyValue(kv) => Some(&*kv.value),
                _ => None,
            };
            let name = match &**prop {
                Prop::Shorthand(id) => RcStr::from(id.sym.as_str()),
                Prop::KeyValue(KeyValueProp { key, .. })
                | Prop::Getter(GetterProp { key, .. })
                | Prop::Setter(SetterProp { key, .. })
                | Prop::Method(MethodProp { key, .. }) => match key {
                    PropName::Ident(i) => RcStr::from(i.sym.as_str()),
                    PropName::Str(s) => RcStr::from(s.value.to_string_lossy().into_owned()),
                    // computed / numeric / bigint key → unknowable
                    _ => {
                        self.taint_cjs_exports();
                        return;
                    }
                },
                Prop::Assign(_) => continue, // should never happen for a literal
            };
            // `__esModule: true` is the interop marker, not a droppable export.
            if &*name == "__esModule" {
                if let Some(Expr::Lit(Lit::Bool(b))) = value.map(unparen)
                    && b.value
                {
                    self.set_cjs_has_es_module();
                }
                continue;
            }
            names.push(name);
        }
        if !names.is_empty() {
            self.record_cjs_object_literal_exports(names, as_parent_path(ast_path).into());
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
        // A CommonJS named-export write target: record it (to drop the export if unused)
        // and visit the target inside a `cjs_export_target` scope so `exports` / `module`
        // don't taint the module (see `visit_ident`).
        let is_cjs_export = self.cjs_exports_enabled() && self.is_named_cjs_export_target(&n.left);
        // `module.exports = { a, b, c }` — a whole-exports object literal whose
        // properties are the module's named exports.
        let is_cjs_object_export = !is_cjs_export
            && self.cjs_exports_enabled()
            && as_module_exports_object_literal(n, self.eval_context.unresolved_mark).is_some();
        if is_cjs_export {
            self.maybe_recognize_cjs_export(n, ast_path);
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::AssignExpr(n, AssignExprField::Left));
            self.with_cjs_export_target(|this| {
                n.left.visit_children_with_ast_path(this, &mut ast_path)
            });
        } else if is_cjs_object_export {
            self.recognize_cjs_object_exports(n, ast_path);
            // Visit the `module.exports` target under the export-target guard so the
            // `module` read doesn't taint the module.
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::AssignExpr(n, AssignExprField::Left));
            self.with_cjs_export_target(|this| {
                n.left.visit_children_with_ast_path(this, &mut ast_path)
            });
        } else {
            // LHS.
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
            // A function assigned directly to a CommonJS export can see `exports` as
            // `this`; likewise for functions inside a `module.exports = { … }` literal.
            if (is_cjs_export && matches!(&*n.right, Expr::Fn(_))) || is_cjs_object_export {
                self.with_cjs_export_value(|this| this.visit_expr(&n.right, &mut ast_path));
            } else {
                self.visit_expr(&n.right, &mut ast_path);
            }
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
        // `Object.defineProperty(exports, …)` is a CommonJS export write; recognize
        // it so unused entries drop (its `exports` argument is guarded below).
        let is_cjs_define_property = if self.cjs_exports_enabled()
            && let Some((name, _)) =
                as_exports_define_property(n, self.eval_context.unresolved_mark)
        {
            self.recognize_cjs_define_property(&name, n, ast_path);
            true
        } else {
            false
        };

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

        // Visit a recognized descriptor as an export value so a top-level `this` taints.
        let cjs_export_target_arg = if is_cjs_define_property {
            Some(0)
        } else {
            None
        };
        if is_cjs_define_property {
            self.with_cjs_export_value(|this| {
                this.check_call_expr_for_effects(
                    &n.callee,
                    n.args.iter(),
                    n.span(),
                    ast_path,
                    CallOrNewExpr::Call(n),
                    cjs_export_target_arg,
                );
            });
        } else {
            self.check_call_expr_for_effects(
                &n.callee,
                n.args.iter(),
                n.span(),
                ast_path,
                CallOrNewExpr::Call(n),
                cjs_export_target_arg,
            );
        }
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
            None,
        );
    }

    fn visit_member_expr<'ast: 'r, 'r>(
        &mut self,
        member_expr: &'ast MemberExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let obj_value = BumpBox::new_in(
            self.eval_context.eval(self.arena, &member_expr.obj),
            self.arena,
        );
        let prop_value = match &member_expr.prop {
            // TODO avoid clone
            MemberProp::Ident(i) => Some(BumpBox::new_in(i.sym.clone().into(), self.arena)),
            MemberProp::PrivateName(_) => None,
            MemberProp::Computed(ComputedPropName { expr, .. }) => Some(BumpBox::new_in(
                self.eval_context.eval(self.arena, expr),
                self.arena,
            )),
        };
        if let Some(prop_value) = prop_value {
            self.add_effect(Effect::Member {
                obj: obj_value,
                prop: prop_value,
                ast_path: as_parent_path_in(self.arena, ast_path),
                span: member_expr.span(),
            });
        }

        member_expr.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_bin_expr<'ast: 'r, 'r>(
        &mut self,
        bin_expr: &'ast BinExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if bin_expr.op == BinaryOp::In {
            let left_value = BumpBox::new_in(
                self.eval_context.eval(self.arena, &bin_expr.left),
                self.arena,
            );
            let right_value = BumpBox::new_in(
                self.eval_context.eval(self.arena, &bin_expr.right),
                self.arena,
            );
            self.add_effect(Effect::In {
                left: left_value,
                right: right_value,
                ast_path: as_parent_path_in(self.arena, ast_path),
                span: bin_expr.span(),
            });
        }

        bin_expr.visit_children_with_ast_path(self, ast_path);
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
        self.hoisted_effects
            .extend(self.arena, take(&mut self.effects));

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

            Pat::Assign(assign) => {
                let mut value = value.unwrap_or_else(|| {
                    JsValue::unknown_empty(false, rcstr!("pattern without value"))
                });
                value.add_alt(
                    self.arena,
                    self.eval_context.eval(self.arena, &assign.right),
                );
                self.with_pat_value(Some(value), |this| {
                    pat.visit_children_with_ast_path(this, ast_path);
                });
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
        } else {
            self.set_cjs_has_top_level_return();
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

        // An `exports` / `module` reference outside a recognized export write target is a
        // read or alias, which makes the exports opaque.
        if self.cjs_exports_enabled() && !self.in_cjs_export_target() {
            let unresolved_mark = self.eval_context.unresolved_mark;
            if is_global(ident, "exports", unresolved_mark)
                || is_global(ident, "module", unresolved_mark)
            {
                self.taint_cjs_exports();
            }
        }

        let id = ident.to_id();

        // How a `const x = require(...)` binding is consumed: a static member read
        // `x.foo` observes that export; anything else observes the whole namespace.
        if self.is_tracked_require_binding(&id) {
            match member_access_parent(ast_path)
                .and_then(|m| extract_name_from_member_prop(&m.prop))
            {
                Some(names) => {
                    for name in names {
                        self.record_require_usage(&id, Some(name));
                    }
                }
                None => self.record_require_usage(&id, None),
            }
        }

        // Attempt to add import effects.
        if let Some((esm_reference_index, export)) = self.eval_context.imports.get_binding(&id) {
            // Optimization: Look for a MemberExpr to see if we only access a few members from the
            // module, add those specific effects instead of depending on the entire module.
            //
            // export.is_none() checks for a namespace import (*).
            if export.is_none()
                && !self
                    .eval_context
                    .imports
                    .should_import_all(esm_reference_index)
                && let Some(member) = member_access_parent(ast_path)
                && let Some(prop) = self.eval_context.eval_member_prop(self.arena, &member.prop)
                && let Some(prop_str) = prop.as_str()
            {
                // a namespace member access like
                // `import * as ns from "..."; ns.exportName`
                self.add_effect(Effect::ImportedBinding {
                    esm_reference_index,
                    export: Some(prop_str.into()),
                    // point to the MemberExpression instead
                    ast_path: as_parent_path_skip_in(self.arena, ast_path, 1),
                    span: member.span(),
                });
            } else {
                self.add_effect(Effect::ImportedBinding {
                    esm_reference_index,
                    export: export.map(|e| RcStr::from(e.as_str())),
                    ast_path: as_parent_path_in(self.arena, ast_path),
                    span: ident.span(),
                })
            }
            return;
        }

        // If this identifier is free, produce an effect so we can potentially replace it later.
        if self.analyze_mode.is_code_gen()
            && let JsValue::FreeVar(var) = self.eval_context.eval_id(self.arena, ident.to_id())
        {
            // TODO(lukesandberg): we should consider filtering effects here, e.g. there is no
            // benefit in an Effect for `window` or `Math`
            self.add_effect(Effect::FreeVar {
                var,
                ast_path: as_parent_path_in(self.arena, ast_path),
                span: ident.span(),
            })
        }
    }

    fn visit_this_expr<'ast: 'r, 'r>(
        &mut self,
        node: &'ast ThisExpr,
        ast_path: &mut swc_core::ecma::visit::AstNodePath<'r>,
    ) {
        if !self.analyze_mode.is_code_gen() {
            return;
        }

        if !self.is_this_bound() {
            // 'this' is free; in CommonJS a top-level `this` aliases `exports`.
            self.add_effect(Effect::FreeVar {
                var: atom!("this"),
                ast_path: as_parent_path_in(self.arena, ast_path),
                span: node.span(),
            });
            if !self.in_cjs_export_target() {
                self.taint_cjs_exports();
            }
        } else if self.in_cjs_export_value() && self.this_binding_depth() == 1 {
            /*
            `this` at the top level of an exported function value may be `exports` when the
            function is called as a method of the exports (`require(m).fn()`), so the
            exports escape — bail out.

            there are other cases where `this` can escape, for example:

            // module A
            function use_this() {
                if (this.bar === undefined) throw new Error();
            }

            exports.foo = use_this

            exports.bar = ''

            // module B
            const a = require("a")

            a.use_this();

            This is a known correctness issue with CJS tree-shaking that
            we share with Webpack.
            */
            self.taint_cjs_exports();
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
                ast_path: as_parent_path_in(self.arena, ast_path),
            })
        }
    }

    fn visit_program<'ast: 'r, 'r>(
        &mut self,
        program: &'ast Program,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.effects = BumpVec::from_iter_in(self.arena, take(&mut self.data.effects));
        self.enter_block(LexicalContext::Block, |this| {
            program.visit_children_with_ast_path(this, ast_path);
        });
        self.effects
            .extend(self.arena, take(&mut self.hoisted_effects));
        self.data.effects = take(&mut self.effects).into_iter().collect();

        // Emit the CommonJS unused-export drop code-gen, if any, and surface the
        // static-exports for scope hoisting.
        let (drops, cjs_static_exports) = self.cjs_exports_analysis();
        if let Some((drops, dead_writes, has_es_module)) = drops {
            self.code_gens
                .push(CjsExportsDropCodeGen::new(drops, dead_writes, has_es_module).into());
        }
        self.data.cjs_static_exports = cjs_static_exports;

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
            EffectsBlock {
                effects: take(&mut self.effects).into_boxed_slice(),
                range: AstPathRange::Exact(as_parent_path(&ast_path)),
            }
        };
        let r#else = {
            let mut ast_path =
                ast_path.with_guard(AstParentNodeRef::CondExpr(expr, CondExprField::Alt));
            expr.alt.visit_with_ast_path(self, &mut ast_path);
            EffectsBlock {
                effects: take(&mut self.effects).into_boxed_slice(),
                range: AstPathRange::Exact(as_parent_path(&ast_path)),
            }
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

            EffectsBlock {
                effects: take(&mut self.effects).into_boxed_slice(),
                range: AstPathRange::Exact(as_parent_path(&ast_path)),
            }
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

            EffectsBlock {
                effects: take(&mut self.effects).into_boxed_slice(),
                range: AstPathRange::Exact(as_parent_path(&ast_path)),
            }
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
            BumpVec::new()
        };
        self.effects = prev_effects;
        self.effects.extend(self.arena, take(&mut block));
        self.effects.extend(self.arena, take(&mut handler));
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
        self.effects.extend(self.arena, take(&mut effects));
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
                self.effects
                    .extend(self.arena, take(&mut self.hoisted_effects));
                effects.extend(self.arena, take(&mut self.effects));
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
                ast_path: as_parent_path_in(self.arena, ast_path),
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

        prev_effects.push(
            self.arena,
            Effect::Conditional {
                condition: BumpBox::new_in(
                    JsValue::unknown_empty(true, rcstr!("labeled statement")),
                    self.arena,
                ),
                kind: BumpBox::new_in(
                    ConditionalKind::Labeled {
                        body: EffectsBlock {
                            effects: effects.into_boxed_slice(),
                            range: AstPathRange::Exact(as_parent_path_with(
                                ast_path,
                                AstParentKind::LabeledStmt(LabeledStmtField::Body),
                            )),
                        },
                    },
                    self.arena,
                ),
                ast_path: as_parent_path_in(self.arena, ast_path),
                span: stmt.span,
            },
        );

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
        self.escape_exported_require_bindings(node);
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
        then: Option<EffectsBlock<'a>>,
        r#else: Option<EffectsBlock<'a>>,
        early_return_when_true: bool,
        early_return_when_false: bool,
    ) {
        if then.is_none() && r#else.is_none() && !early_return_when_false && !early_return_when_true
        {
            return;
        }
        let condition = BumpBox::new_in(self.eval_context.eval(self.arena, test), self.arena);
        if condition.is_unknown() {
            if let Some(then) = then {
                self.effects.extend(self.arena, BumpVec::from(then.effects));
            }
            if let Some(r#else) = r#else {
                self.effects
                    .extend(self.arena, BumpVec::from(r#else.effects));
            }
            return;
        }
        match (early_return_when_true, early_return_when_false) {
            (true, false) => {
                let early_return = EarlyReturn::Conditional {
                    prev_effects: take(&mut self.effects),
                    start_ast_path: as_parent_path_in(self.arena, ast_path),
                    condition,
                    then,
                    r#else,
                    condition_ast_path: as_parent_path_with_in(
                        self.arena,
                        ast_path,
                        condition_ast_kind,
                    ),
                    span,
                    early_return_condition_value: true,
                };
                self.early_return_stack_mut().push(early_return);
            }
            (false, true) => {
                let early_return = EarlyReturn::Conditional {
                    prev_effects: take(&mut self.effects),
                    start_ast_path: as_parent_path_in(self.arena, ast_path),
                    condition,
                    then,
                    r#else,
                    condition_ast_path: as_parent_path_with_in(
                        self.arena,
                        ast_path,
                        condition_ast_kind,
                    ),
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
                    kind: BumpBox::new_in(kind, self.arena),
                    ast_path: as_parent_path_with_in(self.arena, ast_path, condition_ast_kind),
                    span,
                });
                if early_return_when_false && early_return_when_true {
                    let early_return = EarlyReturn::Always {
                        prev_effects: take(&mut self.effects),
                        start_ast_path: as_parent_path_in(self.arena, ast_path),
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
        cond_kind: ConditionalKind<'a>,
    ) {
        let condition = BumpBox::new_in(self.eval_context.eval(self.arena, test), self.arena);
        if condition.is_unknown() {
            match cond_kind {
                ConditionalKind::If { then } => {
                    self.effects.extend(self.arena, BumpVec::from(then.effects));
                }
                ConditionalKind::Else { r#else } => {
                    self.effects
                        .extend(self.arena, BumpVec::from(r#else.effects));
                }
                ConditionalKind::IfElse { then, r#else }
                | ConditionalKind::Ternary { then, r#else } => {
                    self.effects.extend(self.arena, BumpVec::from(then.effects));
                    self.effects
                        .extend(self.arena, BumpVec::from(r#else.effects));
                }
                ConditionalKind::IfElseMultiple { then, r#else } => {
                    for block in BumpVec::from(then) {
                        self.effects
                            .extend(self.arena, BumpVec::from(block.effects));
                    }
                    for block in BumpVec::from(r#else) {
                        self.effects
                            .extend(self.arena, BumpVec::from(block.effects));
                    }
                }
                ConditionalKind::And { expr }
                | ConditionalKind::Or { expr }
                | ConditionalKind::NullishCoalescing { expr } => {
                    self.effects.extend(self.arena, BumpVec::from(expr.effects));
                }
                ConditionalKind::Labeled { body } => {
                    self.effects.extend(self.arena, BumpVec::from(body.effects));
                }
            }
        } else {
            self.add_effect(Effect::Conditional {
                condition,
                kind: BumpBox::new_in(cond_kind, self.arena),
                ast_path: as_parent_path_with_in(self.arena, ast_path, ast_kind),
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

                    self.add_effect(Effect::DestructuredMember {
                        obj: BumpBox::new_in(pat_value.clone_in(self.arena), self.arena),
                        prop: BumpBox::new_in(key_value.clone_in(self.arena), self.arena),
                        span: key.span(),
                    });

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
                    let key_value = JsValue::from(key.sym.clone());
                    {
                        let mut ast_path = ast_path.with_guard(AstParentNodeRef::AssignPatProp(
                            assign,
                            AssignPatPropField::Key,
                        ));
                        key.visit_with_ast_path(self, &mut ast_path);
                    }

                    self.add_effect(Effect::DestructuredMember {
                        obj: BumpBox::new_in(pat_value.clone_in(self.arena), self.arena),
                        prop: BumpBox::new_in(key_value.clone_in(self.arena), self.arena),
                        span: key.span(),
                    });

                    self.add_value(
                        key.to_id(),
                        if let Some(value) = value {
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
