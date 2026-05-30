use swc_core::{atoms::Atom, common::Span, ecma::visit::fields::*};
use turbo_rcstr::RcStr;
use turbopack_core::resolve::ExportUsage;

use crate::{analyzer::JsValue, utils::AstPathRange};

#[derive(Debug)]
pub struct EffectsBlock {
    pub effects: Vec<Effect>,
    pub range: AstPathRange,
}

impl EffectsBlock {
    pub fn is_empty(&self) -> bool {
        self.effects.is_empty()
    }
}

#[derive(Debug)]
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
    /// The expression on the right side of a labeled statement.
    Labeled { body: Box<EffectsBlock> },
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
            ConditionalKind::Labeled { body } => {
                for effect in &mut body.effects {
                    effect.normalize();
                }
            }
        }
    }
}

#[derive(Debug)]
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

#[derive(Debug)]
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
    },
    /// A reference to an imported binding.
    ImportedBinding {
        esm_reference_index: usize,
        export: Option<RcStr>,
        ast_path: Vec<AstParentKind>,
        span: Span,
    },
    /// A reference to a free var access.
    FreeVar {
        var: Atom,
        ast_path: Vec<AstParentKind>,
        span: Span,
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
        args: Vec<EffectArg>,
        ast_path: Vec<AstParentKind>,
        span: Span,
        in_try: bool,
        /// The export usage extracted from the usage pattern.
        export_usage: ExportUsage,
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
            Effect::DynamicImport { args, .. } => {
                for arg in args.iter_mut() {
                    arg.normalize();
                }
            }
            Effect::ImportedBinding { .. } => {}
            Effect::TypeOf { arg, .. } => {
                arg.normalize();
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
