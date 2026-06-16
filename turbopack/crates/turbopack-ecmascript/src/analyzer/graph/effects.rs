use bumpalo::boxed::Box as BumpBox;
use swc_core::{atoms::Atom, common::Span, ecma::visit::fields::*};
use turbo_rcstr::RcStr;
use turbopack_core::resolve::ExportUsage;

use crate::{
    analyzer::{Bump, BumpVec, JsValue},
    utils::AstPathRange,
};

#[derive(Debug)]
pub struct EffectsBlock<'a> {
    pub effects: BumpBox<'a, [Effect<'a>]>,
    pub range: AstPathRange,
}

impl EffectsBlock<'_> {
    pub fn is_empty(&self) -> bool {
        self.effects.is_empty()
    }
}

#[derive(Debug)]
pub enum ConditionalKind<'a> {
    /// The blocks of an `if` statement without an `else` block.
    If { then: EffectsBlock<'a> },
    /// The blocks of an `if ... else` or `if { ... return ... } ...` statement.
    IfElse {
        then: EffectsBlock<'a>,
        r#else: EffectsBlock<'a>,
    },
    /// The blocks of an `if ... else` statement.
    Else { r#else: EffectsBlock<'a> },
    /// The blocks of an `if { ... return ... } else { ... } ...` or `if { ... }
    /// else { ... return ... } ...` statement.
    IfElseMultiple {
        then: BumpBox<'a, [EffectsBlock<'a>]>,
        r#else: BumpBox<'a, [EffectsBlock<'a>]>,
    },
    /// The expressions on the right side of the `?:` operator.
    Ternary {
        then: EffectsBlock<'a>,
        r#else: EffectsBlock<'a>,
    },
    /// The expression on the right side of the `&&` operator.
    And { expr: EffectsBlock<'a> },
    /// The expression on the right side of the `||` operator.
    Or { expr: EffectsBlock<'a> },
    /// The expression on the right side of the `??` operator.
    NullishCoalescing { expr: EffectsBlock<'a> },
    /// The expression on the right side of a labeled statement.
    Labeled { body: EffectsBlock<'a> },
}

impl<'a> ConditionalKind<'a> {
    /// Normalizes all contained values.
    pub fn normalize(&mut self, arena: &'a Bump) {
        match self {
            ConditionalKind::If { then: block }
            | ConditionalKind::Else { r#else: block }
            | ConditionalKind::And { expr: block, .. }
            | ConditionalKind::Or { expr: block, .. }
            | ConditionalKind::NullishCoalescing { expr: block, .. } => {
                for effect in block.effects.iter_mut() {
                    effect.normalize(arena);
                }
            }
            ConditionalKind::IfElse { then, r#else, .. }
            | ConditionalKind::Ternary { then, r#else, .. } => {
                for effect in then.effects.iter_mut() {
                    effect.normalize(arena);
                }
                for effect in r#else.effects.iter_mut() {
                    effect.normalize(arena);
                }
            }
            ConditionalKind::IfElseMultiple { then, r#else, .. } => {
                for block in then.iter_mut().chain(r#else.iter_mut()) {
                    for effect in block.effects.iter_mut() {
                        effect.normalize(arena);
                    }
                }
            }
            ConditionalKind::Labeled { body } => {
                for effect in body.effects.iter_mut() {
                    effect.normalize(arena);
                }
            }
        }
    }
}

#[derive(Debug)]
pub enum EffectArg<'a> {
    Value(JsValue<'a>),
    Closure(JsValue<'a>, BumpBox<'a, EffectsBlock<'a>>),
    Spread,
}

impl<'a> EffectArg<'a> {
    /// Normalizes all contained values.
    pub fn normalize(&mut self, arena: &'a Bump) {
        match self {
            EffectArg::Value(value) => value.normalize(arena),
            EffectArg::Closure(value, effects) => {
                value.normalize(arena);
                for effect in effects.effects.iter_mut() {
                    effect.normalize(arena);
                }
            }
            EffectArg::Spread => {}
        }
    }
}

#[derive(Debug)]
pub enum Effect<'a> {
    /// Some condition which affects which effects might be executed. If the
    /// condition evaluates to some compile-time constant, we can use that
    /// to determine which effects are executed and remove the others.
    Conditional {
        condition: BumpBox<'a, JsValue<'a>>,
        kind: BumpBox<'a, ConditionalKind<'a>>,
        /// The ast path to the condition.
        ast_path: BumpBox<'a, [AstParentKind]>,
        span: Span,
    },
    /// A function call or a new call of a function.
    Call {
        func: BumpBox<'a, JsValue<'a>>,
        args: BumpVec<'a, EffectArg<'a>>,
        ast_path: BumpBox<'a, [AstParentKind]>,
        span: Span,
        in_try: bool,
        new: bool,
    },
    /// A function call or a new call of a property of an object.
    MemberCall {
        obj: BumpBox<'a, JsValue<'a>>,
        prop: BumpBox<'a, JsValue<'a>>,
        args: BumpVec<'a, EffectArg<'a>>,
        ast_path: BumpBox<'a, [AstParentKind]>,
        span: Span,
        in_try: bool,
        new: bool,
    },
    /// A property access.
    Member {
        obj: BumpBox<'a, JsValue<'a>>,
        prop: BumpBox<'a, JsValue<'a>>,
        ast_path: BumpBox<'a, [AstParentKind]>,
        span: Span,
    },
    /// A reference to an imported binding.
    ImportedBinding {
        esm_reference_index: usize,
        export: Option<RcStr>,
        ast_path: BumpBox<'a, [AstParentKind]>,
        span: Span,
    },
    /// A reference to a free var access.
    FreeVar {
        var: Atom,
        ast_path: BumpBox<'a, [AstParentKind]>,
        span: Span,
    },
    /// A typeof expression
    TypeOf {
        arg: BumpBox<'a, JsValue<'a>>,
        ast_path: BumpBox<'a, [AstParentKind]>,
        span: Span,
    },
    // TODO ImportMeta should be replaced with Member
    /// A reference to `import.meta`.
    ImportMeta {
        ast_path: BumpBox<'a, [AstParentKind]>,
        span: Span,
    },
    /// A dynamic import() call, potentially with export usage extracted from
    /// usage patterns. Export usage is detected from these patterns:
    ///
    /// - `const { a, b } = await import('./lib')` (destructured await)
    /// - `(await import('./lib')).a` (member access on await)
    /// - `import('./lib').then(({ a, b }) => {})` (arrow .then() callback)
    /// - `import('./lib').then(function({ a, b }) {})` (function .then() callback)
    /// - `import(/* webpackExports: ["a"] */ './lib')` (magic comment)
    /// - `import(/* turbopackExports: ["a"] */ './lib')` (magic comment)
    DynamicImport {
        args: BumpVec<'a, EffectArg<'a>>,
        ast_path: BumpBox<'a, [AstParentKind]>,
        span: Span,
        in_try: bool,
        /// The export usage extracted from the usage pattern.
        export_usage: ExportUsage,
    },
    /// Unreachable code, e.g. after a `return` statement.
    Unreachable {
        start_ast_path: BumpBox<'a, [AstParentKind]>,
    },
}

impl<'a> Effect<'a> {
    /// Normalizes all contained values.
    pub fn normalize(&mut self, arena: &'a Bump) {
        match self {
            Effect::Conditional {
                condition, kind, ..
            } => {
                condition.normalize(arena);
                kind.normalize(arena);
            }
            Effect::Call { func, args, .. } => {
                func.normalize(arena);
                for arg in args.iter_mut() {
                    arg.normalize(arena);
                }
            }
            Effect::MemberCall {
                obj, prop, args, ..
            } => {
                obj.normalize(arena);
                prop.normalize(arena);
                for arg in args.iter_mut() {
                    arg.normalize(arena);
                }
            }
            Effect::Member { obj, prop, .. } => {
                obj.normalize(arena);
                prop.normalize(arena);
            }
            Effect::DynamicImport { args, .. } => {
                for arg in args.iter_mut() {
                    arg.normalize(arena);
                }
            }
            Effect::ImportedBinding { .. } => {}
            Effect::TypeOf { arg, .. } => {
                arg.normalize(arena);
            }
            Effect::FreeVar { .. } => {}
            Effect::ImportMeta { .. } => {}
            Effect::Unreachable { .. } => {}
        }
    }
}

#[derive(Debug)]
pub enum AssignmentScope {
    /// assigned in the root scope
    ModuleEval,
    /// assigned in a function scopes
    Function,
}

/// Tracks the locations where this was assigned to:
/// This is used to track the _liveness_ of exports.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum AssignmentScopes {
    /// assigned only in the root scope
    AllInModuleEvalScope,
    /// assigned in any set of function scopes
    AllInFunctionScopes,
    /// assigned in both module and function scopes
    Mixed,
}
impl AssignmentScopes {
    pub fn new(initial: AssignmentScope) -> Self {
        match initial {
            AssignmentScope::ModuleEval => AssignmentScopes::AllInModuleEvalScope,
            AssignmentScope::Function => AssignmentScopes::AllInFunctionScopes,
        }
    }

    pub fn merge(self, other: AssignmentScope) -> Self {
        // If the other assignment kind is the same as the current one, return the current one.
        if self == Self::new(other) {
            self
        } else {
            AssignmentScopes::Mixed
        }
    }
}
