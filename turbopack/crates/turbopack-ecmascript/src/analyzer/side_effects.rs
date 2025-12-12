//! Side effect analysis for JavaScript/TypeScript programs.
//!
//! This module provides functionality to determine if a javascript script/module has side effects
//! during module evaluation. This is useful for tree-shaking and dead code elimination.
//!
//! ## What are side effects?
//!
//! A side effect is any observable behavior that occurs when code is executed:
//! - Function calls (unless marked with `/*#__PURE__*/` or otherwise known to be pure)
//! - Constructor calls (unless marked with `/*#__PURE__*/`or otherwise known to be pure )
//! - Assignments to variables or properties
//! - Property mutations
//! - Update expressions (`++`, `--`)
//! - Delete expressions
//!
//! ## Conservative Analysis
//!
//! This analyzer is intentionally conservative. When in doubt, it assumes code
//! has side effects. This is safe for tree-shaking purposes as it prevents
//! incorrectly removing code that might be needed, and can simply be improved over time.
//!
//! ## Future Enhancement: Local Variable Mutation Tracking
//!
//! Currently, all assignments, updates, and property mutations are treated as side effects.
//! However, mutations to locally-scoped variables that never escape the module evaluation scope
//! could be considered side-effect free. This would handle common patterns like:
//!
//! ```javascript
//! // Currently marked as having side effects, but could be pure:
//! const config = {};
//! config['a'] = 'a';
//! config['b'] = 'b';
//! export default config;
//! ```
//!
//! A special case to consider would be CJS exports `module.exports ={}` and `export.foo = ` could
//! be considered non-effecful just like `ESM` exports.  If we do that we should also consider
//! changing how `require` is handled, currently it is considered to be effectful

use phf::{phf_map, phf_set};
use swc_core::{
    common::{Mark, comments::Comments},
    ecma::{
        ast::*,
        visit::{Visit, VisitWith, noop_visit_type},
    },
};
use turbopack_core::module::ModuleSideEffects;

use crate::utils::unparen;

/// Macro to check if side effects have been detected and return early if so.
/// This makes the early-return pattern more explicit and reduces boilerplate.
macro_rules! check_side_effects {
    ($self:expr) => {
        if $self.has_side_effects {
            return;
        }
    };
}

/// Known pure built-in functions organized by object (e.g., Math, Object, Array).
///
/// These are JavaScript built-in functions that are known to be side-effect free.
/// This list is conservative and only includes functions that:
/// 1. Don't modify global state
/// 2. Don't perform I/O
/// 3. Are deterministic (given the same inputs, produce the same outputs)
///
/// Note: Some of these can throw exceptions, but for tree-shaking purposes,
/// we consider them pure as they don't have observable side effects beyond exceptions.
static KNOWN_PURE_FUNCTIONS: phf::Map<&'static str, phf::Set<&'static str>> = phf_map! {
    "Math" => phf_set! {
        "abs", "acos", "acosh", "asin", "asinh", "atan", "atan2", "atanh", "cbrt", "ceil",
        "clz32", "cos", "cosh", "exp", "expm1", "floor", "fround", "hypot", "imul", "log",
        "log10", "log1p", "log2", "max", "min", "pow", "round", "sign", "sin", "sinh",
        "sqrt", "tan", "tanh", "trunc",
    },
    // String static methods
    "String" => phf_set! {
        "fromCharCode", "fromCodePoint", "raw",
    },
    // Number static methods
    "Number" => phf_set! {
        "isFinite", "isInteger", "isNaN", "isSafeInteger", "parseFloat", "parseInt",
    },
    // Object static methods (read-only operations)
    "Object" => phf_set! {
        "keys", "values", "entries", "hasOwn", "getOwnPropertyNames", "getOwnPropertySymbols",
        "getOwnPropertyDescriptor", "getOwnPropertyDescriptors", "getPrototypeOf", "is",
        "isExtensible", "isFrozen", "isSealed",
    },
    // Array static methods
    "Array" => phf_set! {
        "isArray", "from", "of",
    },
};

/// Known pure global functions that can be called directly (not as methods).
///
/// These are global functions that are side-effect free when called.
/// Structured as phf::Set for O(1) lookup.
static KNOWN_PURE_GLOBAL_FUNCTIONS: phf::Set<&'static str> = phf_set! {
    "String",
    "Number",
    "Symbol",
    "Boolean",
    "isNaN",
    "isFinite",
    "parseInt",
    "parseFloat",
    "decodeURI",
    "decodeURIComponent",
};

/// Known pure constructors.
///
/// These constructors create new objects without side effects (no global state modification).
/// They are safe to eliminate if their result is unused.
static KNOWN_PURE_CONSTRUCTORS: phf::Set<&'static str> = phf_set! {
    // Built-in collections
    "Set",
    "Map",
    "WeakSet",
    "WeakMap",
    // Regular expressions
    "RegExp",
    // Data structures
    "Array",
    "Object",
    // Typed arrays
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Uint16Array",
    "Int32Array",
    "Uint32Array",
    "Float32Array",
    "Float64Array",
    "BigInt64Array",
    "BigUint64Array",
    // Other built-ins
    "Date",
    "Error",
    "TypeError",
    "RangeError",
    "SyntaxError",
    "ReferenceError",
    "URIError",
    "EvalError",
    "Promise",
    "ArrayBuffer",
    "DataView",
    "URL",
    "URLSearchParams",
    // Boxes
    "String",
    "Number",
    "Symbol",
    "Boolean",
};

// For prototype methods we are not saying that these functions are always side effect free but
// rather that we can safely reason about their side effects when called on literal expressions.
// We do however assume that these functions are not monkey patched.

/// Known pure prototype methods for string literals.
///
/// These methods don't mutate the string (strings are immutable) and don't have side effects.
static KNOWN_PURE_STRING_PROTOTYPE_METHODS: phf::Set<&'static str> = phf_set! {
    // Case conversion
    "toLowerCase",
    "toUpperCase",
    "toLocaleLowerCase",
    "toLocaleUpperCase",
    "charAt",
    "charCodeAt",
    "codePointAt",
    "slice",
    "substring",
    "substr",
    "indexOf",
    "lastIndexOf",
    "includes",
    "startsWith",
    "endsWith",
    "search",
    "match",
    "matchAll",
    "trim",
    "trimStart",
    "trimEnd",
    "trimLeft",
    "trimRight",
    "repeat",
    "padStart",
    "padEnd",
    "concat",
    "split",
    "replace",
    "replaceAll",
    "normalize",
    "localeCompare",
    "isWellFormed",
    "toString",
    "valueOf",
};

/// Known pure prototype methods for array literals.
static KNOWN_PURE_ARRAY_PROTOTYPE_METHODS: phf::Set<&'static str> = phf_set! {
    // Non-mutating iteration
    "map",
    "filter",
    "reduce",
    "reduceRight",
    "find",
    "findIndex",
    "findLast",
    "findLastIndex",
    "some",
    "every",
    "flat",
    "flatMap",
    // Access methods
    "at",
    "slice",
    "concat",
    "includes",
    "indexOf",
    "lastIndexOf",
    "join",
    // Conversion
    "toLocaleString",
    "toReversed",
    "toSorted",
    "toSpliced",
    "with",
};

static KNOWN_PURE_OBJECT_PROTOTYPE_METHODS: phf::Set<&'static str> = phf_set! {
    "hasOwnProperty",
    "propertyIsEnumerable",
    "toString",
    "valueOf",
};

/// Known pure prototype methods for number literals.
static KNOWN_PURE_NUMBER_PROTOTYPE_METHODS: phf::Set<&'static str> = phf_set! {
    "toExponential", "toFixed", "toPrecision", "toLocaleString",
};

/// Known pure prototype methods for RegExp literals.
///
/// Note: While `test()` and `exec()` mutate `lastIndex` on regexes with global/sticky flags,
/// for literal regexes this is safe because:
/// 1. Literals create fresh objects each time
/// 2. The mutation is local to that object
/// 3. The mutated state doesn't escape the expression
///
/// However, to be conservative for tree-shaking, we exclude these methods.
static KNOWN_PURE_REGEXP_PROTOTYPE_METHODS: phf::Set<&'static str> = phf_set! {
    "test", "exec",
};

/// Analyzes a program to determine if it contains side effects at the top level.
pub fn compute_module_evaluation_side_effects(
    program: &Program,
    comments: &dyn Comments,
    unresolved_mark: Mark,
) -> ModuleSideEffects {
    let mut visitor = SideEffectVisitor::new(comments, unresolved_mark);
    program.visit_with(&mut visitor);
    if visitor.has_side_effects {
        ModuleSideEffects::SideEffectful
    } else if visitor.has_imports {
        ModuleSideEffects::ModuleEvaluationIsSideEffectFree
    } else {
        ModuleSideEffects::SideEffectFree
    }
}

struct SideEffectVisitor<'a> {
    comments: &'a dyn Comments,
    unresolved_mark: Mark,
    has_side_effects: bool,
    will_invoke_fn_exprs: bool,
    has_imports: bool,
}

impl<'a> SideEffectVisitor<'a> {
    fn new(comments: &'a dyn Comments, unresolved_mark: Mark) -> Self {
        Self {
            comments,
            unresolved_mark,
            has_side_effects: false,
            will_invoke_fn_exprs: false,
            has_imports: false,
        }
    }

    /// Mark that we've found a side effect and stop further analysis.
    fn mark_side_effect(&mut self) {
        self.has_side_effects = true;
    }

    /// Temporarily set `will_invoke_fn_exprs` to the given value, execute the closure,
    /// then restore the original value.
    ///
    /// This is useful when analyzing code that may invoke function expressions passed as
    /// arguments (e.g., callbacks to pure functions like `array.map(fn)`).
    fn with_will_invoke_fn_exprs<F>(&mut self, value: bool, f: F)
    where
        F: FnOnce(&mut Self),
    {
        let old_value = self.will_invoke_fn_exprs;
        self.will_invoke_fn_exprs = value;
        f(self);
        self.will_invoke_fn_exprs = old_value;
    }

    /// Check if a span has a `/*#__PURE__*/` or `/*@__PURE__*/` annotation.
    fn is_pure_annotated(&self, span: swc_core::common::Span) -> bool {
        self.comments.has_flag(span.lo, "PURE")
    }

    /// Check if a callee expression is a known pure built-in function.
    ///
    /// This checks if the callee matches patterns like `Math.abs`, `Object.keys`, etc.
    fn is_known_pure_builtin(&self, callee: &Callee) -> bool {
        match callee {
            Callee::Expr(expr) => self.is_known_pure_builtin_function(expr),
            _ => false,
        }
    }
    /// Returns true if this call is to `import()` or `require()`.
    /// This is conservative since we don't resolve aliases and also because we don't support things
    /// like `require.context` or `import.meta` apis
    fn is_require_or_import(&self, callee: &Callee) -> bool {
        match callee {
            Callee::Expr(expr) => {
                let expr = unparen(expr);
                if let Expr::Ident(ident) = expr {
                    ident.ctxt.outer() == self.unresolved_mark && ident.sym.as_ref() == "require"
                } else {
                    false
                }
            }

            Callee::Import(_) => true,
            _ => false,
        }
    }
    /// Check if an expression is a known pure built-in function.
    ///
    /// This checks for:
    /// - Member expressions like `Math.abs`, `Object.keys`, etc.
    /// - Global function identifiers like `isNaN`, `parseInt`, etc.
    /// - Literal receiver methods like `"hello".toLowerCase()`, `[1,2,3].map()`, etc.
    ///
    /// Only returns true if the base identifier is in the global scope (unresolved).
    /// If it's shadowed by a local variable, we cannot assume it's the built-in.
    fn is_known_pure_builtin_function(&self, expr: &Expr) -> bool {
        match expr {
            Expr::Member(member) => {
                let receiver = unparen(&member.obj);
                match (receiver, &member.prop) {
                    // Handle global object methods like Math.abs, Object.keys, etc.
                    (Expr::Ident(obj), MemberProp::Ident(prop)) => {
                        // Only consider it pure if the base identifier is unresolved (global
                        // scope). Check if the identifier's context matches
                        // the unresolved mark.
                        if obj.ctxt.outer() != self.unresolved_mark {
                            // The identifier is in a local scope, might be shadowed
                            return false;
                        }

                        // O(1) lookup: check if the object has the method in our known pure
                        // functions
                        KNOWN_PURE_FUNCTIONS
                            .get(obj.sym.as_ref())
                            .map(|methods| methods.contains(prop.sym.as_ref()))
                            .unwrap_or(false)
                    }
                    // Handle literal receiver methods like "hello".toLowerCase(), [1,2,3].map(),
                    // etc.
                    (Expr::Lit(lit), MemberProp::Ident(prop)) => {
                        let method_name = prop.sym.as_ref();
                        match lit {
                            Lit::Str(_) => {
                                KNOWN_PURE_STRING_PROTOTYPE_METHODS.contains(method_name)
                                    || KNOWN_PURE_OBJECT_PROTOTYPE_METHODS.contains(method_name)
                            }
                            Lit::Num(_) => {
                                KNOWN_PURE_NUMBER_PROTOTYPE_METHODS.contains(method_name)
                                    || KNOWN_PURE_OBJECT_PROTOTYPE_METHODS.contains(method_name)
                            }
                            Lit::Bool(_) => {
                                KNOWN_PURE_OBJECT_PROTOTYPE_METHODS.contains(method_name)
                            }
                            Lit::Regex(_) => {
                                KNOWN_PURE_REGEXP_PROTOTYPE_METHODS.contains(method_name)
                                    || KNOWN_PURE_OBJECT_PROTOTYPE_METHODS.contains(method_name)
                            }
                            _ => false,
                        }
                    }
                    // Handle array literal methods like [1,2,3].map()
                    // Note: We don't check array elements here - that's handled in visit_expr
                    (Expr::Array(_), MemberProp::Ident(prop)) => {
                        let method_name = prop.sym.as_ref();
                        KNOWN_PURE_ARRAY_PROTOTYPE_METHODS.contains(method_name)
                            || KNOWN_PURE_OBJECT_PROTOTYPE_METHODS.contains(method_name)
                    }
                    (Expr::Object(_), MemberProp::Ident(prop)) => {
                        KNOWN_PURE_OBJECT_PROTOTYPE_METHODS.contains(prop.sym.as_ref())
                    }
                    _ => false,
                }
            }
            Expr::Ident(ident) => {
                // Check for global pure functions like isNaN, parseInt, etc.
                // Only consider it pure if the identifier is unresolved (global scope).
                if ident.ctxt.outer() != self.unresolved_mark {
                    return false;
                }

                // O(1) lookup in the global functions set
                KNOWN_PURE_GLOBAL_FUNCTIONS.contains(ident.sym.as_ref())
            }
            _ => false,
        }
    }

    /// Check if an expression is a known pure constructor.
    ///
    /// These are built-in constructors that create new objects without side effects.
    /// Only returns true if the identifier is in the global scope (unresolved).
    /// If it's shadowed by a local variable, we cannot assume it's the built-in constructor.
    fn is_known_pure_constructor(&self, expr: &Expr) -> bool {
        match expr {
            Expr::Ident(ident) => {
                // Only consider it pure if the identifier is unresolved (global scope).
                // Check if the identifier's context matches the unresolved mark.
                if ident.ctxt.outer() != self.unresolved_mark {
                    return false;
                }

                // O(1) lookup in the constructors set
                KNOWN_PURE_CONSTRUCTORS.contains(ident.sym.as_ref())
            }
            _ => false,
        }
    }
}

impl<'a> Visit for SideEffectVisitor<'a> {
    noop_visit_type!();
    // If we've already found side effects, skip further visitation
    fn visit_program(&mut self, program: &Program) {
        check_side_effects!(self);
        program.visit_children_with(self);
    }

    fn visit_module(&mut self, module: &Module) {
        check_side_effects!(self);

        // Only check top-level module items
        for item in &module.body {
            check_side_effects!(self);
            item.visit_with(self);
        }
    }

    fn visit_script(&mut self, script: &Script) {
        check_side_effects!(self);

        // Only check top-level statements
        for stmt in &script.body {
            check_side_effects!(self);
            stmt.visit_with(self);
        }
    }

    // Module declarations (imports/exports) need special handling
    fn visit_module_decl(&mut self, decl: &ModuleDecl) {
        check_side_effects!(self);

        match decl {
            // Import statements may have side effects, which could require full graph analysis
            // Record that to decide if we can upgrade ModuleEvaluationIsSideEffectFree to
            // SideEffectFree
            ModuleDecl::Import(_) => {
                self.has_imports = true;
            }

            // Export declarations need to check their contents
            ModuleDecl::ExportDecl(export_decl) => {
                // Check the declaration being exported
                match &export_decl.decl {
                    Decl::Fn(_) => {
                        // function declarations are pure
                    }
                    Decl::Class(class_decl) => {
                        // Class declarations can have side effects in static blocks, extends or
                        // static property initializers.
                        class_decl.visit_with(self);
                    }
                    Decl::Var(var_decl) => {
                        // Variable declarations need their initializers checked
                        var_decl.visit_with(self);
                    }
                    _ => {
                        // Other declarations should be checked
                        export_decl.decl.visit_with(self);
                    }
                }
            }

            ModuleDecl::ExportDefaultDecl(export_default_decl) => {
                // Check the default export
                match &export_default_decl.decl {
                    DefaultDecl::Class(cls) => {
                        // Class expressions can have side effects in extends clause and static
                        // members
                        cls.visit_with(self);
                    }
                    DefaultDecl::Fn(_) => {
                        // function declarations are pure
                    }
                    DefaultDecl::TsInterfaceDecl(_) => {
                        // TypeScript interface declarations are pure
                    }
                }
            }

            ModuleDecl::ExportDefaultExpr(export_default_expr) => {
                // Check the expression being exported
                export_default_expr.expr.visit_with(self);
            }

            // Re-exports have no side effects
            ModuleDecl::ExportNamed(e) => {
                if e.src.is_some() {
                    // reexports are also imports
                    self.has_imports = true;
                }
            }
            ModuleDecl::ExportAll(_) => {
                // reexports are also imports
                self.has_imports = true;
            }

            // TypeScript-specific exports
            ModuleDecl::TsExportAssignment(_) | ModuleDecl::TsNamespaceExport(_) => {}
            ModuleDecl::TsImportEquals(e) => {
                // The RHS of a ts import equals expression is typically an identifier but it might
                // also be a require!
                match &e.module_ref {
                    TsModuleRef::TsEntityName(_) => {}
                    TsModuleRef::TsExternalModuleRef(_) => {
                        // This is a `import x = require('y')` call
                        self.has_imports = true
                    }
                }
            }
        }
    }

    // Statement-level detection
    fn visit_stmt(&mut self, stmt: &Stmt) {
        check_side_effects!(self);

        match stmt {
            // Expression statements need checking
            Stmt::Expr(expr_stmt) => {
                expr_stmt.visit_with(self);
            }
            // Variable declarations need checking (initializers might have side effects)
            Stmt::Decl(Decl::Var(var_decl)) => {
                var_decl.visit_with(self);
            }
            // Function declarations are side-effect free
            Stmt::Decl(Decl::Fn(_)) => {
                // Function declarations don't execute, so no side effects
            }
            // Class declarations can have side effects in extends clause and static members
            Stmt::Decl(Decl::Class(class_decl)) => {
                class_decl.visit_with(self);
            }
            // Other declarations
            Stmt::Decl(decl) => {
                decl.visit_with(self);
            }
            // For other statement types, be conservative
            _ => {
                // Most other statement types (if, for, while, etc.) at top level
                // would be unusual and potentially have side effects
                self.mark_side_effect();
            }
        }
    }

    fn visit_var_declarator(&mut self, var_decl: &VarDeclarator) {
        check_side_effects!(self);

        // Check the pattern (for default values in destructuring)
        var_decl.name.visit_with(self);

        // Check the initializer
        if let Some(init) = &var_decl.init {
            init.visit_with(self);
        }
    }

    // Expression-level detection
    fn visit_expr(&mut self, expr: &Expr) {
        check_side_effects!(self);

        match expr {
            // Pure expressions
            Expr::Lit(_) => {
                // Literals are always pure
            }
            Expr::Ident(_) => {
                // Reading identifiers is pure
            }
            Expr::Arrow(_) | Expr::Fn(_) => {
                // Function expressions are pure (don't execute until called)
                if self.will_invoke_fn_exprs {
                    // assume that any nested function expressions will not be invoked.
                    self.with_will_invoke_fn_exprs(false, |this| {
                        expr.visit_children_with(this);
                    });
                }
            }
            Expr::Class(class_expr) => {
                // Class expressions can have side effects in extends clause and static members
                class_expr.class.visit_with(self);
            }
            Expr::Array(arr) => {
                // Arrays are pure if their elements are pure
                for elem in arr.elems.iter().flatten() {
                    elem.visit_with(self);
                }
            }
            Expr::Object(obj) => {
                // Objects are pure if their property names and initializers
                for prop in &obj.props {
                    prop.visit_with(self);
                }
            }
            Expr::Unary(unary) => {
                // Most unary operations are pure, but delete is not
                if unary.op == UnaryOp::Delete {
                    // TODO: allow deletes to module level variables or properties defined on module
                    // level variables
                    self.mark_side_effect();
                } else {
                    unary.arg.visit_with(self);
                }
            }
            Expr::Bin(bin) => {
                // Binary operations are pure if operands are pure
                bin.left.visit_with(self);
                bin.right.visit_with(self);
            }
            Expr::Cond(cond) => {
                // Conditional is pure if all parts are pure
                cond.test.visit_with(self);
                cond.cons.visit_with(self);
                cond.alt.visit_with(self);
            }
            Expr::Member(member) => {
                // Member access is pure - just reading a property doesn't cause side effects.
                // While getters *could* have side effects, in practice:
                // 1. Most code doesn't use getters with side effects (rare pattern)
                // 2. Webpack and rolldown treat member access as pure
                // 3. Being too conservative here would mark too much code as impure
                //
                // We check the object and property for side effects (e.g., computed properties)
                member.obj.visit_with(self);
                member.prop.visit_with(self);
            }
            Expr::Paren(paren) => {
                // Parenthesized expressions inherit purity from inner expr
                paren.expr.visit_with(self);
            }
            Expr::Tpl(tpl) => {
                // Template literals are pure if expressions are pure
                for expr in &tpl.exprs {
                    expr.visit_with(self);
                }
            }

            // Impure expressions (conservative)
            Expr::Call(call) => {
                // Check for /*#__PURE__*/ annotation or for a well known function
                if self.is_pure_annotated(call.span) || self.is_known_pure_builtin(&call.callee) {
                    // For known pure builtins, we need to check both:
                    // 1. The receiver (e.g., the array in [foo(), 2, 3].map(...))
                    // 2. The arguments

                    // Check the receiver
                    call.callee.visit_with(self);

                    // Check all arguments
                    // Assume that any function expressions in the arguments will be invoked.
                    self.with_will_invoke_fn_exprs(true, |this| {
                        call.args.visit_children_with(this);
                    });
                } else if self.is_require_or_import(&call.callee) {
                    self.has_imports = true;
                    // It would be weird to have a side effect in a require(...) statement, but not
                    // impossible.
                    call.args.visit_children_with(self);
                } else {
                    // Unmarked calls are considered to have side effects
                    self.mark_side_effect();
                }
            }
            Expr::New(new) => {
                // Check for /*#__PURE__*/ annotation or known pure constructor
                if self.is_pure_annotated(new.span) || self.is_known_pure_constructor(&new.callee) {
                    // Pure constructor, but still need to check arguments
                    self.with_will_invoke_fn_exprs(true, |this| {
                        new.args.visit_children_with(this);
                    });
                } else {
                    // Unknown constructor calls are considered to have side effects
                    self.mark_side_effect();
                }
            }
            Expr::Assign(_) => {
                // Assignments have side effects
                // TODO: allow assignments to module level variables
                self.mark_side_effect();
            }
            Expr::Update(_) => {
                // Updates (++, --) have side effects
                // TODO: allow updates to module level variables
                self.mark_side_effect();
            }
            Expr::Await(e) => {
                e.arg.visit_with(self);
            }
            Expr::Yield(e) => {
                e.arg.visit_with(self);
            }
            Expr::TaggedTpl(tagged_tpl) => {
                // Tagged template literals are function calls
                // But some are known to be pure, like String.raw
                if self.is_known_pure_builtin_function(&tagged_tpl.tag) {
                    for arg in &tagged_tpl.tpl.exprs {
                        arg.visit_with(self);
                    }
                } else {
                    self.mark_side_effect();
                }
            }
            Expr::OptChain(opt_chain) => {
                // Optional chaining can be pure if it's just member access
                // But if it's an optional call, it has side effects
                opt_chain.base.visit_with(self);
            }
            Expr::Seq(seq) => {
                // Sequence expressions - check each expression
                seq.exprs.visit_children_with(self);
            }
            Expr::SuperProp(super_prop) => {
                // Super property access is pure (reading from parent class)
                // Check if the property expression has side effects
                super_prop.prop.visit_with(self);
            }
            Expr::MetaProp(_) => {
                // Meta properties like import.meta and new.target are pure
                // They just read metadata, don't cause side effects
            }
            Expr::JSXMember(_) | Expr::JSXNamespacedName(_) | Expr::JSXEmpty(_) => {
                // JSX member expressions and names are pure (they're just identifiers)
            }
            Expr::JSXElement(_) | Expr::JSXFragment(_) => {
                // JSX elements compile to function calls (React.createElement, etc.)
                // These are side effect free but we don't technically know at this point that it is
                // react (could be solid or qwik or millionjs).  In any case it doesn't matter too
                // much since it is weird to construct jsx at the module scope.
                self.mark_side_effect();
            }
            Expr::PrivateName(_) => {
                // Private names are pure (just identifiers)
            }

            // Be conservative for other expression types and just assume they are effectful
            _ => {
                self.mark_side_effect();
            }
        }
    }

    fn visit_opt_chain_base(&mut self, base: &OptChainBase) {
        check_side_effects!(self);

        match base {
            OptChainBase::Member(member) => {
                member.visit_with(self);
            }
            OptChainBase::Call(_opt_call) => {
                // Optional calls are still calls, so impure
                // We could maybe support some of these `(foo_enabled? undefined :
                // [])?.map(...)` but this seems pretty theoretical
                self.mark_side_effect();
            }
        }
    }

    fn visit_prop_or_spread(&mut self, prop: &PropOrSpread) {
        check_side_effects!(self);

        match prop {
            PropOrSpread::Spread(spread) => {
                spread.expr.visit_with(self);
            }
            PropOrSpread::Prop(prop) => {
                prop.visit_with(self);
            }
        }
    }

    fn visit_prop(&mut self, prop: &Prop) {
        check_side_effects!(self);

        match prop {
            Prop::KeyValue(kv) => {
                kv.key.visit_with(self);
                kv.value.visit_with(self);
            }
            Prop::Getter(getter) => {
                getter.key.visit_with(self);
                // Body is not executed at definition time
            }
            Prop::Setter(setter) => {
                setter.key.visit_with(self);
                // Body is not executed at definition time
            }
            Prop::Method(method) => {
                method.key.visit_with(self);
                // Body is not executed at definition time
            }
            Prop::Shorthand(_) => {
                // Shorthand properties are pure
            }
            Prop::Assign(_) => {
                // Assignment properties (used in object rest/spread patterns)
                // are side-effect free at definition
            }
        }
    }

    fn visit_prop_name(&mut self, prop_name: &PropName) {
        check_side_effects!(self);

        match prop_name {
            PropName::Computed(computed) => {
                // Computed property names need evaluation
                computed.expr.visit_with(self);
            }
            _ => {
                // Other property names are pure
            }
        }
    }

    fn visit_class(&mut self, class: &Class) {
        check_side_effects!(self);

        // Check decorators - they execute at definition time
        for decorator in &class.decorators {
            decorator.visit_with(self);
        }

        // Check the extends clause - this is evaluated at definition time
        if let Some(super_class) = &class.super_class {
            super_class.visit_with(self);
        }

        // Check class body for static members
        for member in &class.body {
            member.visit_with(self);
        }
    }

    fn visit_class_member(&mut self, member: &ClassMember) {
        check_side_effects!(self);

        match member {
            // Static blocks execute at class definition time
            ClassMember::StaticBlock(block) => {
                // Static blocks may have side effects because they execute immediately
                // Check the statements in the block
                for stmt in &block.body.stmts {
                    stmt.visit_with(self);
                }
            }
            // Check static properties - they execute at definition time
            ClassMember::ClassProp(class_prop) if class_prop.is_static => {
                // Check decorators - they execute at definition time
                for decorator in &class_prop.decorators {
                    decorator.visit_with(self);
                }
                // Check the property key (for computed properties)
                class_prop.key.visit_with(self);
                // Check the initializer - static property initializers execute at definition time
                if let Some(value) = &class_prop.value {
                    value.visit_with(self);
                }
            }
            // Check computed property keys for all members
            ClassMember::Method(method) => {
                // Check decorators - they execute at definition time
                for decorator in &method.function.decorators {
                    decorator.visit_with(self);
                }
                method.key.visit_with(self);
                // Method bodies don't execute at definition time
            }
            ClassMember::Constructor(constructor) => {
                constructor.key.visit_with(self);
                // Constructor body doesn't execute at definition time
            }
            ClassMember::PrivateMethod(private_method) => {
                // Check decorators - they execute at definition time
                for decorator in &private_method.function.decorators {
                    decorator.visit_with(self);
                }
                private_method.key.visit_with(self);
                // Method bodies don't execute at definition time
            }
            ClassMember::ClassProp(class_prop) => {
                // Check decorators - they execute at definition time
                for decorator in &class_prop.decorators {
                    decorator.visit_with(self);
                }
                // For non-static properties, only check the key
                class_prop.key.visit_with(self);
                // Instance property initializers don't execute at definition time
            }
            ClassMember::PrivateProp(private_prop) => {
                // Check decorators - they execute at definition time
                for decorator in &private_prop.decorators {
                    decorator.visit_with(self);
                }
                private_prop.key.visit_with(self);
                // Instance property initializers don't execute at definition time
            }
            ClassMember::AutoAccessor(auto_accessor) if auto_accessor.is_static => {
                // Check decorators - they execute at definition time
                for decorator in &auto_accessor.decorators {
                    decorator.visit_with(self);
                }
                // Static auto accessors execute at definition time
                auto_accessor.key.visit_with(self);
                if let Some(value) = &auto_accessor.value {
                    value.visit_with(self);
                }
            }
            ClassMember::AutoAccessor(auto_accessor) => {
                // Check decorators - they execute at definition time
                for decorator in &auto_accessor.decorators {
                    decorator.visit_with(self);
                }
                // Non-static auto accessors only check the key
                auto_accessor.key.visit_with(self);
            }
            ClassMember::Empty(_) => {
                // Empty members are pure
            }
            ClassMember::TsIndexSignature(_) => {
                // TypeScript index signatures are pure
            }
        }
    }

    fn visit_decorator(&mut self, _decorator: &Decorator) {
        if self.has_side_effects {
            return;
        }

        // Decorators always have side effects because they are function calls
        // that execute at class/member definition time, even if they're just
        // identifier references (e.g., @decorator is equivalent to calling decorator())
        self.mark_side_effect();
    }

    fn visit_pat(&mut self, pat: &Pat) {
        check_side_effects!(self);

        match pat {
            // Object patterns with default values need checking
            Pat::Object(object_pat) => {
                for prop in &object_pat.props {
                    match prop {
                        ObjectPatProp::KeyValue(kv) => {
                            // Check the key (for computed properties)
                            kv.key.visit_with(self);
                            // Recursively check the value pattern
                            kv.value.visit_with(self);
                        }
                        ObjectPatProp::Assign(assign) => {
                            // Check the default value if present
                            if let Some(value) = &assign.value {
                                value.visit_with(self);
                            }
                        }
                        ObjectPatProp::Rest(rest) => {
                            // Rest patterns are pure, but check the nested pattern
                            rest.arg.visit_with(self);
                        }
                    }
                }
            }
            // Array patterns with default values need checking
            Pat::Array(array_pat) => {
                for elem in array_pat.elems.iter().flatten() {
                    elem.visit_with(self);
                }
            }
            // Assignment patterns (destructuring with defaults) need checking
            Pat::Assign(assign_pat) => {
                // Check the default value - this is evaluated if the value is undefined
                assign_pat.right.visit_with(self);
                // Also check the left side pattern
                assign_pat.left.visit_with(self);
            }
            // Other patterns are pure
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use swc_core::{
        common::{FileName, GLOBALS, Mark, SourceMap, comments::SingleThreadedComments, sync::Lrc},
        ecma::{
            ast::EsVersion,
            parser::{EsSyntax, Syntax, parse_file_as_program},
            transforms::base::resolver,
            visit::VisitMutWith,
        },
    };

    use super::*;

    /// Helper function to parse JavaScript code from a string and run the resolver
    fn parse_and_check_for_side_effects(code: &str, expected: ModuleSideEffects) {
        GLOBALS.set(&Default::default(), || {
            let cm = Lrc::new(SourceMap::default());
            let fm = cm.new_source_file(Lrc::new(FileName::Anon), code.to_string());

            let comments = SingleThreadedComments::default();
            let mut errors = vec![];

            let mut program = parse_file_as_program(
                &fm,
                Syntax::Es(EsSyntax {
                    jsx: true,
                    decorators: true,
                    ..Default::default()
                }),
                EsVersion::latest(),
                Some(&comments),
                &mut errors,
            )
            .expect("Failed to parse");

            // Run the resolver to mark unresolved identifiers
            let unresolved_mark = Mark::new();
            let top_level_mark = Mark::new();
            program.visit_mut_with(&mut resolver(unresolved_mark, top_level_mark, false));

            let actual =
                compute_module_evaluation_side_effects(&program, &comments, unresolved_mark);

            let msg = match expected {
                ModuleSideEffects::ModuleEvaluationIsSideEffectFree => {
                    "Expected code to have no local side effects"
                }
                ModuleSideEffects::SideEffectFree => "Expected code to be side effect free",
                ModuleSideEffects::SideEffectful => "Expected code to have side effects",
            };
            assert_eq!(actual, expected, "{}:\n{}", msg, code);
        })
    }

    /// Generate a test that asserts the given code has the expected side effect status
    macro_rules! assert_side_effects {
        ($name:ident, $code:expr, $expected:expr) => {
            #[test]
            fn $name() {
                parse_and_check_for_side_effects($code, $expected);
            }
        };
    }

    macro_rules! side_effects {
        ($name:ident, $code:expr) => {
            assert_side_effects!($name, $code, ModuleSideEffects::SideEffectful);
        };
    }

    macro_rules! no_side_effects {
        ($name:ident, $code:expr) => {
            assert_side_effects!($name, $code, ModuleSideEffects::SideEffectFree);
        };
    }
    macro_rules! module_evaluation_is_side_effect_free {
        ($name:ident, $code:expr) => {
            assert_side_effects!(
                $name,
                $code,
                ModuleSideEffects::ModuleEvaluationIsSideEffectFree
            );
        };
    }

    mod basic_tests {
        use super::*;

        no_side_effects!(test_empty_program, "");

        no_side_effects!(test_simple_const_declaration, "const x = 5;");

        no_side_effects!(test_simple_let_declaration, "let y = 'string';");

        no_side_effects!(test_array_literal, "const arr = [1, 2, 3];");

        no_side_effects!(test_object_literal, "const obj = { a: 1, b: 2 };");

        no_side_effects!(test_function_declaration, "function foo() { return 1; }");

        no_side_effects!(
            test_function_expression,
            "const foo = function() { return 1; };"
        );

        no_side_effects!(test_arrow_function, "const foo = () => 1;");
    }

    mod side_effects_tests {
        use super::*;

        side_effects!(test_console_log, "console.log('hello');");

        side_effects!(test_function_call, "foo();");

        side_effects!(test_method_call, "obj.method();");

        side_effects!(test_assignment, "x = 5;");

        side_effects!(test_member_assignment, "obj.prop = 5;");

        side_effects!(test_constructor_call, "new SideEffect();");

        side_effects!(test_update_expression, "x++;");
    }

    mod pure_expressions_tests {
        use super::*;

        no_side_effects!(test_binary_expression, "const x = 1 + 2;");

        no_side_effects!(test_unary_expression, "const x = -5;");

        no_side_effects!(test_conditional_expression, "const x = true ? 1 : 2;");

        no_side_effects!(test_template_literal, "const x = `hello ${world}`;");

        no_side_effects!(test_nested_object, "const obj = { a: { b: { c: 1 } } };");

        no_side_effects!(test_nested_array, "const arr = [[1, 2], [3, 4]];");
    }

    mod import_export_tests {
        use super::*;

        module_evaluation_is_side_effect_free!(test_import_statement, "import x from 'y';");
        module_evaluation_is_side_effect_free!(test_require_statement, "const x = require('y');");

        no_side_effects!(test_export_statement, "export default 5;");

        no_side_effects!(test_export_const, "export const x = 5;");

        side_effects!(
            test_export_const_with_side_effect,
            "export const x = foo();"
        );
    }

    mod mixed_cases_tests {
        use super::*;

        side_effects!(test_call_in_initializer, "const x = foo();");

        side_effects!(test_call_in_array, "const arr = [1, foo(), 3];");

        side_effects!(test_call_in_object, "const obj = { a: foo() };");

        no_side_effects!(
            test_multiple_declarations_pure,
            "const x = 1;\nconst y = 2;\nconst z = 3;"
        );

        side_effects!(
            test_multiple_declarations_with_side_effect,
            "const x = 1;\nfoo();\nconst z = 3;"
        );

        no_side_effects!(test_class_declaration, "class Foo {}");

        no_side_effects!(
            test_class_with_methods,
            "class Foo { method() { return 1; } }"
        );
    }

    mod pure_annotations_tests {
        use super::*;

        no_side_effects!(test_pure_annotation_function_call, "/*#__PURE__*/ foo();");

        no_side_effects!(test_pure_annotation_with_at, "/*@__PURE__*/ foo();");

        no_side_effects!(test_pure_annotation_constructor, "/*#__PURE__*/ new Foo();");

        no_side_effects!(
            test_pure_annotation_in_variable,
            "const x = /*#__PURE__*/ foo();"
        );

        no_side_effects!(
            test_pure_annotation_with_pure_args,
            "/*#__PURE__*/ foo(1, 2, 3);"
        );

        // Even with PURE annotation, impure arguments make it impure
        side_effects!(
            test_pure_annotation_with_impure_args,
            "/*#__PURE__*/ foo(bar());"
        );

        // Without annotation, calls are impure
        side_effects!(test_without_pure_annotation, "foo();");

        no_side_effects!(
            test_pure_nested_in_object,
            "const obj = { x: /*#__PURE__*/ foo() };"
        );

        no_side_effects!(test_pure_in_array, "const arr = [/*#__PURE__*/ foo()];");

        no_side_effects!(
            test_multiple_pure_calls,
            "const x = /*#__PURE__*/ foo();\nconst y = /*#__PURE__*/ bar();"
        );

        side_effects!(
            test_mixed_pure_and_impure,
            "const x = /*#__PURE__*/ foo();\nbar();\nconst z = /*#__PURE__*/ baz();"
        );
    }

    mod known_pure_builtins_tests {
        use super::*;

        no_side_effects!(test_math_abs, "const x = Math.abs(-5);");

        no_side_effects!(test_math_floor, "const x = Math.floor(3.14);");

        no_side_effects!(test_math_max, "const x = Math.max(1, 2, 3);");

        no_side_effects!(test_object_keys, "const keys = Object.keys(obj);");

        no_side_effects!(test_object_values, "const values = Object.values(obj);");

        no_side_effects!(test_object_entries, "const entries = Object.entries(obj);");

        no_side_effects!(test_array_is_array, "const result = Array.isArray([]);");

        no_side_effects!(
            test_string_from_char_code,
            "const char = String.fromCharCode(65);"
        );

        no_side_effects!(test_number_is_nan, "const result = Number.isNaN(x);");

        no_side_effects!(
            test_multiple_math_calls,
            "const x = Math.abs(-5);\nconst y = Math.floor(3.14);\nconst z = Math.max(x, y);"
        );

        // Even pure builtins become impure if arguments are impure
        side_effects!(
            test_pure_builtin_with_impure_arg,
            "const x = Math.abs(foo());"
        );

        no_side_effects!(
            test_pure_builtin_in_expression,
            "const x = Math.abs(-5) + Math.floor(3.14);"
        );

        side_effects!(
            test_mixed_builtin_and_impure,
            "const x = Math.abs(-5);\nfoo();\nconst z = Object.keys({});"
        );

        // Accessing unknown Math properties is not in our list
        side_effects!(test_unknown_math_property, "const x = Math.random();");

        // Object.assign is NOT pure (it mutates)
        side_effects!(test_object_assign, "Object.assign(target, source);");

        no_side_effects!(test_array_from, "const arr = Array.from(iterable);");

        no_side_effects!(test_global_is_nan, "const result = isNaN(value);");

        no_side_effects!(test_global_is_finite, "const result = isFinite(value);");

        no_side_effects!(test_global_parse_int, "const num = parseInt('42', 10);");

        no_side_effects!(test_global_parse_float, "const num = parseFloat('3.14');");

        no_side_effects!(
            test_global_decode_uri,
            "const decoded = decodeURI(encoded);"
        );

        no_side_effects!(
            test_global_decode_uri_component,
            "const decoded = decodeURIComponent(encoded);"
        );

        // String() as a function (not constructor) is pure
        no_side_effects!(
            test_global_string_constructor_as_function,
            "const str = String(123);"
        );

        // Number() as a function (not constructor) is pure
        no_side_effects!(
            test_global_number_constructor_as_function,
            "const num = Number('123');"
        );

        // Boolean() as a function (not constructor) is pure
        no_side_effects!(
            test_global_boolean_constructor_as_function,
            "const bool = Boolean(value);"
        );

        // Symbol() as a function is pure
        no_side_effects!(
            test_global_symbol_constructor_as_function,
            "const sym = Symbol('description');"
        );

        // Global pure function with impure argument is impure
        side_effects!(
            test_global_pure_with_impure_arg,
            "const result = isNaN(foo());"
        );

        // isNaN shadowed at top level
        side_effects!(
            test_shadowed_global_is_nan,
            r#"
            const isNaN = () => sideEffect();
            const result = isNaN(value);
            "#
        );
    }

    mod edge_cases_tests {
        use super::*;

        no_side_effects!(test_computed_property, "const obj = { [key]: value };");

        side_effects!(
            test_computed_property_with_call,
            "const obj = { [foo()]: value };"
        );

        no_side_effects!(test_spread_in_array, "const arr = [...other];");

        no_side_effects!(test_spread_in_object, "const obj = { ...other };");

        no_side_effects!(test_destructuring_assignment, "const { a, b } = obj;");

        no_side_effects!(test_array_destructuring, "const [a, b] = arr;");

        no_side_effects!(test_nested_ternary, "const x = a ? (b ? 1 : 2) : 3;");

        no_side_effects!(test_logical_and, "const x = a && b;");

        no_side_effects!(test_logical_or, "const x = a || b;");

        no_side_effects!(test_nullish_coalescing, "const x = a ?? b;");

        no_side_effects!(test_typeof_operator, "const x = typeof y;");

        no_side_effects!(test_void_operator, "const x = void 0;");

        // delete is impure (modifies object)
        side_effects!(test_delete_expression, "delete obj.prop;");

        no_side_effects!(test_sequence_expression_pure, "const x = (1, 2, 3);");

        side_effects!(test_sequence_expression_impure, "const x = (foo(), 2, 3);");

        no_side_effects!(test_arrow_with_block, "const foo = () => { return 1; };");

        no_side_effects!(
            test_class_with_constructor,
            "class Foo { constructor() { this.x = 1; } }"
        );

        no_side_effects!(test_class_extends, "class Foo extends Bar {}");

        no_side_effects!(test_async_function, "async function foo() { return 1; }");

        no_side_effects!(test_generator_function, "function* foo() { yield 1; }");

        // Tagged templates are function calls, so impure by default
        side_effects!(test_tagged_template, "const x = tag`hello`;");

        // String.raw is known to be pure
        no_side_effects!(
            test_tagged_template_string_raw,
            "const x = String.raw`hello ${world}`;"
        );

        no_side_effects!(test_regex_literal, "const re = /pattern/g;");

        no_side_effects!(test_bigint_literal, "const big = 123n;");

        no_side_effects!(test_optional_chaining_pure, "const x = obj?.prop;");

        // Optional chaining with a call is still a call
        side_effects!(test_optional_chaining_call, "const x = obj?.method();");

        no_side_effects!(
            test_multiple_exports_pure,
            "export const a = 1;\nexport const b = 2;\nexport const c = 3;"
        );

        no_side_effects!(test_export_function, "export function foo() { return 1; }");

        no_side_effects!(test_export_class, "export class Foo {}");

        module_evaluation_is_side_effect_free!(test_reexport, "export { foo } from 'bar';");

        // import() is a function-like expression, we allow it
        module_evaluation_is_side_effect_free!(
            test_dynamic_import,
            "const mod = import('./module');"
        );

        module_evaluation_is_side_effect_free!(
            test_dynamic_import_with_await,
            "const mod = await import('./module');"
        );

        no_side_effects!(test_export_default_expression, "export default 1 + 2;");

        side_effects!(
            test_export_default_expression_with_side_effect,
            "export default foo();"
        );

        no_side_effects!(
            test_export_default_function,
            "export default function() { return 1; }"
        );

        no_side_effects!(test_export_default_class, "export default class Foo {}");

        no_side_effects!(
            test_export_named_with_pure_builtin,
            "export const result = Math.abs(-5);"
        );

        side_effects!(
            test_multiple_exports_mixed,
            "export const a = 1;\nexport const b = foo();\nexport const c = 3;"
        );
    }

    mod pure_constructors_tests {
        use super::*;

        no_side_effects!(test_new_set, "const s = new Set();");

        no_side_effects!(test_new_map, "const m = new Map();");

        no_side_effects!(test_new_weakset, "const ws = new WeakSet();");

        no_side_effects!(test_new_weakmap, "const wm = new WeakMap();");

        no_side_effects!(test_new_regexp, "const re = new RegExp('pattern');");

        no_side_effects!(test_new_date, "const d = new Date();");

        no_side_effects!(test_new_error, "const e = new Error('message');");

        no_side_effects!(test_new_promise, "const p = new Promise(() => {});");
        side_effects!(
            test_new_promise_effectful,
            "const p = new Promise(() => {console.log('hello')});"
        );

        no_side_effects!(test_new_array, "const arr = new Array(10);");

        no_side_effects!(test_new_object, "const obj = new Object();");

        no_side_effects!(test_new_typed_array, "const arr = new Uint8Array(10);");

        no_side_effects!(test_new_url, "const url = new URL('https://example.com');");

        no_side_effects!(
            test_new_url_search_params,
            "const params = new URLSearchParams();"
        );

        // Pure constructor with impure arguments is impure
        side_effects!(
            test_pure_constructor_with_impure_args,
            "const s = new Set([foo()]);"
        );

        no_side_effects!(
            test_multiple_pure_constructors,
            "const s = new Set();\nconst m = new Map();\nconst re = new RegExp('test');"
        );

        // Unknown constructors are impure
        side_effects!(
            test_unknown_constructor,
            "const custom = new CustomClass();"
        );

        side_effects!(
            test_mixed_constructors,
            "const s = new Set();\nconst custom = new CustomClass();\nconst m = new Map();"
        );
    }

    mod shadowing_detection_tests {
        use super::*;

        // Math is shadowed by a local variable, so Math.abs is not the built-in
        side_effects!(
            test_shadowed_math,
            r#"
            const Math = { abs: () => console.log('side effect') };
            const result = Math.abs(-5);
            "#
        );

        // Object is shadowed at top level, so Object.keys is not the built-in
        side_effects!(
            test_shadowed_object,
            r#"
            const Object = { keys: () => sideEffect() };
            const result = Object.keys({});
            "#
        );

        // Array is shadowed at top level by a local class
        side_effects!(
            test_shadowed_array_constructor,
            r#"
            const Array = class { constructor() { sideEffect(); } };
            const arr = new Array();
            "#
        );

        // Set is shadowed at top level
        side_effects!(
            test_shadowed_set_constructor,
            r#"
            const Set = class { constructor() { sideEffect(); } };
            const s = new Set();
            "#
        );

        // Map is shadowed in a block scope
        side_effects!(
            test_shadowed_map_constructor,
            r#"
            {
                const Map = class { constructor() { sideEffect(); } };
                const m = new Map();
            }
            "#
        );

        // Math is NOT shadowed here, so Math.abs is the built-in
        no_side_effects!(
            test_global_math_not_shadowed,
            r#"
            const result = Math.abs(-5);
            "#
        );

        // Object is NOT shadowed, so Object.keys is the built-in
        no_side_effects!(
            test_global_object_not_shadowed,
            r#"
            const keys = Object.keys({ a: 1, b: 2 });
            "#
        );

        // Array is NOT shadowed, so new Array() is the built-in
        no_side_effects!(
            test_global_array_constructor_not_shadowed,
            r#"
            const arr = new Array(1, 2, 3);
            "#
        );

        // If Math is imported (has a non-empty ctxt), it's not the global
        side_effects!(
            test_shadowed_by_import,
            r#"
            import { Math } from './custom-math';
            const result = Math.abs(-5);
            "#
        );

        // Math is shadowed in a block scope at top level
        side_effects!(
            test_nested_scope_shadowing,
            r#"
            {
                const Math = { floor: () => sideEffect() };
                const result = Math.floor(4.5);
            }
            "#
        );

        // This test shows that function declarations are pure at top level
        // even if they have shadowed parameters. The side effect only occurs
        // if the function is actually called.
        no_side_effects!(
            test_parameter_shadowing,
            r#"
            function test(RegExp) {
                return new RegExp('test');
            }
            "#
        );

        // Number is shadowed by a var declaration
        side_effects!(
            test_shadowing_with_var,
            r#"
            var Number = { isNaN: () => sideEffect() };
            const check = Number.isNaN(123);
            "#
        );

        // RegExp is NOT shadowed, constructor is pure
        no_side_effects!(
            test_global_regexp_not_shadowed,
            r#"
            const re = new RegExp('[a-z]+');
            "#
        );
    }

    mod literal_receiver_methods_tests {
        use super::*;

        // String literal methods
        no_side_effects!(
            test_string_literal_to_lower_case,
            r#"const result = "HELLO".toLowerCase();"#
        );

        no_side_effects!(
            test_string_literal_to_upper_case,
            r#"const result = "hello".toUpperCase();"#
        );

        no_side_effects!(
            test_string_literal_slice,
            r#"const result = "hello world".slice(0, 5);"#
        );

        no_side_effects!(
            test_string_literal_split,
            r#"const result = "a,b,c".split(',');"#
        );

        no_side_effects!(
            test_string_literal_trim,
            r#"const result = "  hello  ".trim();"#
        );

        no_side_effects!(
            test_string_literal_replace,
            r#"const result = "hello".replace('h', 'H');"#
        );

        no_side_effects!(
            test_string_literal_includes,
            r#"const result = "hello world".includes('world');"#
        );

        // Array literal methods
        no_side_effects!(
            test_array_literal_map,
            r#"const result = [1, 2, 3].map(x => x * 2);"#
        );
        side_effects!(
            test_array_literal_map_with_effectful_callback,
            r#"const result = [1, 2, 3].map(x => {globalThis.something.push(x)});"#
        );

        // Number literal methods - need parentheses for number literals
        no_side_effects!(
            test_number_literal_to_fixed,
            r#"const result = (3.14159).toFixed(2);"#
        );

        no_side_effects!(
            test_number_literal_to_string,
            r#"const result = (42).toString();"#
        );

        no_side_effects!(
            test_number_literal_to_exponential,
            r#"const result = (123.456).toExponential(2);"#
        );

        // Boolean literal methods
        no_side_effects!(
            test_boolean_literal_to_string,
            r#"const result = true.toString();"#
        );

        no_side_effects!(
            test_boolean_literal_value_of,
            r#"const result = false.valueOf();"#
        );

        // RegExp literal methods
        no_side_effects!(
            test_regexp_literal_to_string,
            r#"const result = /[a-z]+/.toString();"#
        );

        // Note: test() and exec() technically modify flags on the regex, but that is fine when
        // called on a literal.
        no_side_effects!(
            test_regexp_literal_test,
            r#"const result = /[a-z]+/g.test("hello");"#
        );

        no_side_effects!(
            test_regexp_literal_exec,
            r#"const result = /(\d+)/g.exec("test123");"#
        );

        // Array literal with impure elements - the array construction itself has side effects
        // because foo() is called when creating the array
        side_effects!(
            test_array_literal_with_impure_elements,
            r#"const result = [foo(), 2, 3].map(x => x * 2);"#
        );

        // Array literal with callback that would have side effects when called
        // However, callbacks are just function definitions at module load time
        // They don't execute until runtime, so this is side-effect free at load time
        no_side_effects!(
            test_array_literal_map_with_callback,
            r#"const result = [1, 2, 3].map(x => x * 2);"#
        );
    }

    mod class_expression_side_effects_tests {
        use super::*;

        // Class with no extends and no static members is pure
        no_side_effects!(test_class_no_extends_no_static, "class Foo {}");

        // Class with pure extends is pure
        no_side_effects!(test_class_pure_extends, "class Foo extends Bar {}");

        // Class with function call in extends clause has side effects
        side_effects!(
            test_class_extends_with_call,
            "class Foo extends someMixinFunction() {}"
        );

        // Class with complex expression in extends clause has side effects
        side_effects!(
            test_class_extends_with_complex_expr,
            "class Foo extends (Bar || Baz()) {}"
        );

        // Class with static property initializer that calls function has side effects
        side_effects!(
            test_class_static_property_with_call,
            r#"
        class Foo {
            static foo = someFunction();
        }
        "#
        );

        // Class with static property with pure initializer is pure
        no_side_effects!(
            test_class_static_property_pure,
            r#"
        class Foo {
            static foo = 42;
        }
        "#
        );

        // Class with static property with array literal is pure
        no_side_effects!(
            test_class_static_property_array_literal,
            r#"
        class Foo {
            static foo = [1, 2, 3];
        }
        "#
        );

        // Class with static block has side effects
        side_effects!(
            test_class_static_block,
            r#"
        class Foo {
            static {
                console.log("hello");
            }
        }
        "#
        );

        no_side_effects!(
            test_class_static_block_empty,
            r#"
        class Foo {
            static {}
        }
        "#
        );

        // Class with instance property is pure (doesn't execute at definition time)
        no_side_effects!(
            test_class_instance_property_with_call,
            r#"
        class Foo {
            foo = someFunction();
        }
        "#
        );

        // Class with constructor is pure (doesn't execute at definition time)
        no_side_effects!(
            test_class_constructor_with_side_effects,
            r#"
        class Foo {
            constructor() {
                console.log("constructor");
            }
        }
        "#
        );

        // Class with method is pure (doesn't execute at definition time)
        no_side_effects!(
            test_class_method,
            r#"
        class Foo {
            method() {
                console.log("method");
            }
        }
        "#
        );

        // Class expression with side effects in extends
        side_effects!(
            test_class_expr_extends_with_call,
            "const Foo = class extends getMixin() {};"
        );

        // Class expression with static property calling function
        side_effects!(
            test_class_expr_static_with_call,
            r#"
        const Foo = class {
            static prop = initValue();
        };
        "#
        );

        // Class expression with pure static property
        no_side_effects!(
            test_class_expr_static_pure,
            r#"
        const Foo = class {
            static prop = "hello";
        };
        "#
        );

        // Export class with side effects
        side_effects!(
            test_export_class_with_side_effects,
            r#"
        export class Foo extends getMixin() {
            static prop = init();
        }
        "#
        );

        // Export default class with side effects
        side_effects!(
            test_export_default_class_with_side_effects,
            r#"
        export default class Foo {
            static { console.log("init"); }
        }
        "#
        );

        // Export class without side effects
        no_side_effects!(
            test_export_class_no_side_effects,
            r#"
        export class Foo {
            method() {
                console.log("method");
            }
        }
        "#
        );

        // Multiple static properties, some pure, some not
        side_effects!(
            test_class_mixed_static_properties,
            r#"
        class Foo {
            static a = 1;
            static b = impureCall();
            static c = 3;
        }
        "#
        );

        // Class with pure static property using known pure built-in
        no_side_effects!(
            test_class_static_property_pure_builtin,
            r#"
        class Foo {
            static value = Math.abs(-5);
        }
        "#
        );

        // Class with computed property name that has side effects
        side_effects!(
            test_class_computed_property_with_call,
            r#"
        class Foo {
            [computeName()]() {
                return 42;
            }
        }
        "#
        );

        // Class with pure computed property name
        no_side_effects!(
            test_class_computed_property_pure,
            r#"
        class Foo {
            ['method']() {
                return 42;
            }
        }
        "#
        );
    }

    mod complex_variable_declarations_tests {
        use super::*;

        // Simple destructuring without defaults is pure
        no_side_effects!(test_destructure_simple, "const { foo } = obj;");

        // Destructuring with function call in default value has side effects
        side_effects!(
            test_destructure_default_with_call,
            "const { foo = someFunction() } = obj;"
        );

        // Destructuring with pure default value is pure
        no_side_effects!(test_destructure_default_pure, "const { foo = 42 } = obj;");

        // Destructuring with array literal default is pure
        no_side_effects!(
            test_destructure_default_array_literal,
            "const { foo = ['hello'] } = obj;"
        );

        // Destructuring with object literal default is pure
        no_side_effects!(
            test_destructure_default_object_literal,
            "const { foo = { bar: 'baz' } } = obj;"
        );

        // Nested destructuring with default that has side effect
        side_effects!(
            test_destructure_nested_with_call,
            "const { a: { b = sideEffect() } } = obj;"
        );

        // Array destructuring with default that has side effect
        side_effects!(
            test_array_destructure_default_with_call,
            "const [a, b = getDefault()] = arr;"
        );

        // Array destructuring with pure default
        no_side_effects!(
            test_array_destructure_default_pure,
            "const [a, b = 10] = arr;"
        );

        // Multiple variables, one with side effect in default
        side_effects!(
            test_multiple_destructure_mixed,
            "const { foo = 1, bar = compute() } = obj;"
        );

        // Rest pattern is pure
        no_side_effects!(test_destructure_rest_pure, "const { foo, ...rest } = obj;");

        // Complex destructuring with multiple levels
        side_effects!(
            test_destructure_complex_with_side_effect,
            r#"
        const {
            a,
            b: { c = sideEffect() },
            d = [1, 2, 3]
        } = obj;
        "#
        );

        // Complex destructuring all pure
        no_side_effects!(
            test_destructure_complex_pure,
            r#"
        const {
            a,
            b: { c = 5 },
            d = [1, 2, 3]
        } = obj;
        "#
        );

        // Destructuring in export with side effect
        side_effects!(
            test_export_destructure_with_side_effect,
            "export const { foo = init() } = obj;"
        );

        // Destructuring in export without side effect
        no_side_effects!(
            test_export_destructure_pure,
            "export const { foo = 42 } = obj;"
        );

        // Default value with known pure built-in
        no_side_effects!(
            test_destructure_default_pure_builtin,
            "const { foo = Math.abs(-5) } = obj;"
        );

        // Default value with pure annotation
        no_side_effects!(
            test_destructure_default_pure_annotation,
            "const { foo = /*#__PURE__*/ compute() } = obj;"
        );
    }

    mod decorator_side_effects_tests {
        use super::*;

        // Class decorator has side effects (executes at definition time)
        side_effects!(
            test_class_decorator,
            r#"
        @decorator
        class Foo {}
        "#
        );

        // Method decorator has side effects
        side_effects!(
            test_method_decorator,
            r#"
        class Foo {
            @decorator
            method() {}
        }
        "#
        );

        // Property decorator has side effects
        side_effects!(
            test_property_decorator,
            r#"
        class Foo {
            @decorator
            prop = 1;
        }
        "#
        );

        // Multiple decorators
        side_effects!(
            test_multiple_decorators,
            r#"
        @decorator1
        @decorator2
        class Foo {
            @propDecorator
            prop = 1;

            @methodDecorator
            method() {}
        }
        "#
        );

        // Decorator with arguments
        side_effects!(
            test_decorator_with_args,
            r#"
        @decorator(config())
        class Foo {}
        "#
        );
    }

    mod additional_edge_cases_tests {
        use super::*;

        // Super property access is pure
        no_side_effects!(
            test_super_property_pure,
            r#"
        class Foo extends Bar {
            method() {
                return super.parentMethod;
            }
        }
        "#
        );

        // Super method call has side effects (but only when invoked, not at definition)
        no_side_effects!(
            test_super_call_in_method,
            r#"
        class Foo extends Bar {
            method() {
                return super.parentMethod();
            }
        }
        "#
        );

        // import.meta is pure
        no_side_effects!(test_import_meta, "const url = import.meta.url;");

        // new.target is pure (only valid inside functions/constructors)
        no_side_effects!(
            test_new_target,
            r#"
        function Foo() {
            console.log(new.target);
        }
        "#
        );

        // JSX element has side effects (compiles to function calls)
        side_effects!(test_jsx_element, "const el = <div>Hello</div>;");

        // JSX fragment has side effects
        side_effects!(test_jsx_fragment, "const el = <>Hello</>;");

        // Private field access is pure
        no_side_effects!(
            test_private_field_access,
            r#"
        class Foo {
            #privateField = 42;
            method() {
                return this.#privateField;
            }
        }
        "#
        );

        // Computed super property with side effect
        no_side_effects!(
            test_super_computed_property_pure,
            r#"
        class Foo extends Bar {
            method() {
                return super['prop'];
            }
        }
        "#
        );

        // Static block with only pure statements is pure
        no_side_effects!(
            test_static_block_pure_content,
            r#"
        class Foo {
            static {
                const x = 1;
                const y = 2;
            }
        }
        "#
        );

        // Static block with side effect
        side_effects!(
            test_static_block_with_side_effect_inside,
            r#"
        class Foo {
            static {
                sideEffect();
            }
        }
        "#
        );

        // This binding is pure
        no_side_effects!(
            test_this_expression,
            r#"
        class Foo {
            method() {
                return this;
            }
        }
        "#
        );

        // Spread in call arguments (with pure expression)
        no_side_effects!(
            test_spread_pure_in_call,
            "const result = Math.max(...[1, 2, 3]);"
        );

        // Spread in call arguments (with side effect)
        side_effects!(
            test_spread_with_side_effect,
            "const result = Math.max(...getArray());"
        );

        // Complex super expression
        no_side_effects!(
            test_super_complex_access,
            r#"
        class Foo extends Bar {
            static method() {
                return super.parentMethod;
            }
        }
        "#
        );

        // Getter/setter definitions are pure
        no_side_effects!(
            test_getter_definition,
            r#"
        const obj = {
            get foo() {
                return this._foo;
            }
        };
        "#
        );

        // Async function declaration is pure
        no_side_effects!(
            test_async_function_declaration,
            r#"
        async function foo() {
            return await something;
        }
        "#
        );

        // Generator function declaration is pure
        no_side_effects!(
            test_generator_declaration,
            r#"
        function* foo() {
            yield 1;
            yield 2;
        }
        "#
        );

        // Async generator is pure
        no_side_effects!(
            test_async_generator,
            r#"
        async function* foo() {
            yield await something;
        }
        "#
        );

        // Using declaration (TC39 proposal) - if supported
        // This would need to be handled if the parser supports it

        // Nullish coalescing with side effects in right operand
        side_effects!(
            test_nullish_coalescing_with_side_effect,
            "const x = a ?? sideEffect();"
        );

        // Logical OR with side effects
        side_effects!(
            test_logical_or_with_side_effect,
            "const x = a || sideEffect();"
        );

        // Logical AND with side effects
        side_effects!(
            test_logical_and_with_side_effect,
            "const x = a && sideEffect();"
        );
    }

    mod common_js_modules_tests {
        use super::*;

        side_effects!(test_common_js_exports, "exports.foo = 'a'");
        side_effects!(test_common_js_exports_module, "module.exports.foo = 'a'");
        side_effects!(test_common_js_exports_assignment, "module.exports = {}");
    }
}
