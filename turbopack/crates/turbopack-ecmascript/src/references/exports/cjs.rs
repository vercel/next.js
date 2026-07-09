//! Static analysis of a CommonJS module's named exports.
//!
//! This determines which names a module assigns to its `exports` object so that,
//! for the safe subset, individual exports can be tree-shaken. It is
//! intentionally minimal and deny-by-default: a CommonJS `exports` object is
//! live and mutable, so a wrong answer is unsound, not merely suboptimal.
//!
//! Recognition is strictly per top-level statement — mirroring exactly what the
//! splitter can lift — and its result doubles as the splitter's input: the
//! analysis returns a per-statement [export map](CommonJsExportsAnalysis::exports) that
//! `DepGraph::init` executes, so the safety gate and the splitter cannot
//! disagree about what a statement exports.

use rustc_hash::FxHashMap;
use swc_core::{
    atoms::Atom,
    common::Mark,
    ecma::{
        ast::*,
        visit::{Visit, VisitWith, noop_visit_type},
    },
};
use turbo_rcstr::RcStr;
use turbo_tasks::FxIndexSet;

use crate::{
    analyzer::side_effects::{is_global, is_module_dot_exports},
    utils::unparen,
};

/// The statically-determined named exports of a CommonJS module, produced by
/// [`analyze_cjs_exports`].
#[derive(Debug, Default)]
pub struct CommonJsExportsAnalysis {
    /// Statically known export names, in source order.
    pub names: FxIndexSet<RcStr>,
    /// Whether the transpiled-ESM `__esModule` marker is set.
    pub has_es_module: bool,
    /// Whether the module touches `exports` / `module` outside the recognized
    /// safe forms. When set, `names` may be incomplete and callers must treat
    /// the module as opaque CommonJS.
    pub is_unsafe: bool,
    /// The tree shaker's per-statement export map, keyed by top-level statement
    /// index: which statements are export writes (replaced by synthesized
    /// bindings) or the `__esModule` marker (dropped; the facade re-emits it).
    /// Cleared when `is_unsafe` is set.
    pub(crate) exports: FxHashMap<usize, CjsExportFormat>,
}

/// A single recognized top-level write to the module's exports object.
#[derive(Debug)]
pub(crate) enum CjsExportFormat {
    /// `exports.NAME = …` / `module.exports.NAME = …`.
    Named(Atom),
    /// The `exports.__esModule = true` / `module.exports.__esModule = true`
    /// interop marker.
    EsModuleMarker,
    /// `module.exports = { … }`, decomposed into `(export_name, value_expr)`
    /// pairs in source order.
    ObjectLiteral(Vec<(Atom, Expr)>),
    /// Targets the exports object, but in an unsupported way. Never stored in
    /// the map; it marks the whole module unsafe instead.
    Unsafe,
}

/// Recognized safe forms, as top-level expression statements only:
/// - `exports.NAME = …` / `module.exports.NAME = …` with a plain identifier name
/// - a single `module.exports = { … }` object-literal reassignment
/// - the `__esModule` interop marker as an assignment (`exports.__esModule = true` /
///   `module.exports.__esModule = true`); the transpiled-ESM `Object.defineProperty(exports,
///   "__esModule", …)` form is not yet recognized and bails
///
/// Anything else touching `exports` / `module` — aliasing, escapes, computed
/// keys, top-level `this`, or an export write in any other position (nested in
/// a function, behind `if`, inside another expression) — sets `is_unsafe`. The
/// positional rule matters for soundness: the splitter can only lift top-level
/// statement writes, and a write it can't lift would land on a part's exports
/// object at runtime, invisible to the facade.
pub fn analyze_cjs_exports(program: &Program, unresolved_mark: Mark) -> CommonJsExportsAnalysis {
    let mut analysis = CommonJsExportsAnalysis::default();
    let mut visitor = ExportsTaintVisitor {
        unresolved_mark,
        fn_depth: 0,
        tainted: false,
    };
    // `module.exports = { … }` must be the module's only export write: a later
    // reset, or mixing it with named writes / the `__esModule` marker, is
    // unsafe.
    let mut module_exports_object_seen = false;
    let mut named_export_write_seen = false;

    let statements: Vec<Option<&Stmt>> = match program {
        Program::Script(script) => script.body.iter().map(Some).collect(),
        Program::Module(module) => module.body.iter().map(ModuleItem::as_stmt).collect(),
    };

    for (index, stmt) in statements.into_iter().enumerate() {
        if analysis.is_unsafe || visitor.tainted {
            break;
        }
        let Some(stmt) = stmt else {
            continue;
        };
        let Stmt::Expr(ExprStmt { expr, .. }) = stmt else {
            stmt.visit_with(&mut visitor);
            continue;
        };
        // `unparen` returns only a sequence expression's final operand, so a
        // top-level comma expression like `exports.a = 1, exports.b = 2` would be
        // mis-read as a single write, silently dropping the earlier operands (and
        // any side effects they carry). The splitter can't lift them either — bail.
        if matches!(strip_parens(expr), Expr::Seq(_)) {
            analysis.is_unsafe = true;
            break;
        }
        match unparen(expr) {
            Expr::Assign(assign) => {
                let format = if assign.op == AssignOp::Assign
                    && let AssignTarget::Simple(SimpleAssignTarget::Member(member)) = &assign.left
                {
                    if is_module_dot_exports(member, unresolved_mark) {
                        // `module.exports = { … }`;
                        match unparen(&assign.right) {
                            // `module.exports = { a: 1, b: 2 }`
                            Expr::Object(obj) => Some(decompose_exports_object(obj)),
                            // `module.exports = require("./x")` / `= foo`
                            _ => None,
                        }
                    } else if !is_exports_object(&member.obj, unresolved_mark) {
                        // A write to some other object, e.g. `foo.bar = 1`.
                        None
                    } else if let MemberProp::Ident(name) = &member.prop {
                        if name.sym.as_ref() != "__esModule" {
                            // `exports.foo = …` / `module.exports.foo = …`
                            Some(CjsExportFormat::Named(name.sym.clone()))
                        } else if matches!(unparen(&assign.right), Expr::Lit(Lit::Bool(b)) if b.value)
                        {
                            // Only the literal `true` is the interop marker:
                            // `exports.__esModule = true`.
                            Some(CjsExportFormat::EsModuleMarker)
                        } else {
                            // `exports.__esModule = 0` / `= someVar`.
                            Some(CjsExportFormat::Unsafe)
                        }
                    } else {
                        // A computed / non-identifier export key,
                        // e.g. `exports[key] = …`.
                        Some(CjsExportFormat::Unsafe)
                    }
                } else {
                    None
                };
                // the following match does two things: (a) it determines if this
                // export statement is safe or not based on prior export statements
                // that have been visited and (b) it inserts this export statement
                // into `analysis.exports`.
                match format {
                    Some(CjsExportFormat::Named(name)) => {
                        if module_exports_object_seen {
                            analysis.is_unsafe = true;
                            continue;
                        }
                        named_export_write_seen = true;
                        // A second top-level write to the same name would synthesize
                        // a duplicate `const __TURBOPACK_cjs_export__NAME` binding and
                        // `export … as NAME` (invalid JS) — bail.
                        if !analysis.names.insert(RcStr::from(&*name)) {
                            analysis.is_unsafe = true;
                            continue;
                        }
                        // The RHS may still leak the exports object
                        // (`exports.a = [exports]`); the write's own target is
                        // the recognized form itself.
                        assign.right.visit_with(&mut visitor);
                        analysis.exports.insert(index, CjsExportFormat::Named(name));
                    }
                    Some(CjsExportFormat::EsModuleMarker) => {
                        if module_exports_object_seen {
                            analysis.is_unsafe = true;
                            continue;
                        }
                        analysis.has_es_module = true;
                        analysis
                            .exports
                            .insert(index, CjsExportFormat::EsModuleMarker);
                    }
                    Some(CjsExportFormat::ObjectLiteral(pairs)) => {
                        if module_exports_object_seen
                            || named_export_write_seen
                            || analysis.has_es_module
                        {
                            analysis.is_unsafe = true;
                            continue;
                        }
                        module_exports_object_seen = true;
                        for (name, value) in &pairs {
                            analysis.names.insert(RcStr::from(&**name));
                            value.visit_with(&mut visitor);
                        }
                        analysis
                            .exports
                            .insert(index, CjsExportFormat::ObjectLiteral(pairs));
                    }
                    Some(CjsExportFormat::Unsafe) => {
                        analysis.is_unsafe = true;
                    }
                    None => stmt.visit_with(&mut visitor),
                }
            }
            // Any other top-level expression — including
            // `Object.defineProperty(exports, …)`, whose `exports` reference
            // trips the taint visitor and bails the module. Recognizing the
            // `Object.defineProperty(exports, "__esModule", { value: true })`
            // transpiled-ESM marker is deferred to a follow-up.
            _ => stmt.visit_with(&mut visitor),
        }
    }

    analysis.is_unsafe |= visitor.tainted;
    if analysis.is_unsafe {
        analysis.exports.clear();
    }
    analysis
}

/// Decomposes a `module.exports = { … }` object literal into export
/// `(name, value)` pairs. Any property that can't be statically decomposed makes
/// the whole export [`CjsExportFormat::Unsafe`]: eg. spreads, getters/setters, and
/// duplicate keys.
fn decompose_exports_object(obj: &ObjectLit) -> CjsExportFormat {
    let mut pairs: Vec<(Atom, Expr)> = Vec::with_capacity(obj.props.len());
    let mut seen: FxIndexSet<Atom> = FxIndexSet::default();
    for prop in &obj.props {
        let PropOrSpread::Prop(prop) = prop else {
            return CjsExportFormat::Unsafe;
        };
        let (name, value): (Atom, Expr) = match &**prop {
            Prop::Shorthand(ident) => (ident.sym.clone(), Expr::Ident(ident.clone())),
            Prop::KeyValue(kv) => {
                let PropName::Ident(key) = &kv.key else {
                    return CjsExportFormat::Unsafe;
                };
                (key.sym.clone(), (*kv.value).clone())
            }
            Prop::Method(m) => {
                let PropName::Ident(key) = &m.key else {
                    return CjsExportFormat::Unsafe;
                };
                (
                    key.sym.clone(),
                    Expr::Fn(FnExpr {
                        ident: None,
                        function: m.function.clone(),
                    }),
                )
            }
            // Getters/setters make member access effectful; `Prop::Assign`
            // (`{ a = 1 }`) is only valid in patterns, not object literals.
            Prop::Getter(_) | Prop::Setter(_) | Prop::Assign(_) => {
                return CjsExportFormat::Unsafe;
            }
        };
        if !seen.insert(name.clone()) {
            return CjsExportFormat::Unsafe;
        }
        pairs.push((name, value));
    }
    CjsExportFormat::ObjectLiteral(pairs)
}

/// Strips only parentheses — unlike [`unparen`], it keeps a sequence expression
/// intact so a top-level comma expression can be detected and rejected.
fn strip_parens(expr: &Expr) -> &Expr {
    match expr {
        Expr::Paren(paren) => strip_parens(&paren.expr),
        _ => expr,
    }
}

/// Whether `expr` is the real (unshadowed) `exports` or `module.exports`.
fn is_exports_object(expr: &Expr, unresolved_mark: Mark) -> bool {
    match unparen(expr) {
        Expr::Ident(o) => is_global(o, "exports", unresolved_mark),
        Expr::Member(inner) => is_module_dot_exports(inner, unresolved_mark),
        _ => false,
    }
}

/// Flags any reference to the real `exports` / `module` bindings, and any
/// top-level `this` (which aliases `exports`). Recognized export writes never
/// reach this visitor; everything else in the module does — including export
/// writes in unliftable positions, whose `exports` root lands here.
struct ExportsTaintVisitor {
    unresolved_mark: Mark,
    /// Function nesting depth; `0` is module top level, where `this` aliases
    /// `exports`.
    fn_depth: u32,
    tainted: bool,
}

impl Visit for ExportsTaintVisitor {
    noop_visit_type!();

    fn visit_stmt(&mut self, n: &Stmt) {
        if self.tainted {
            return;
        }
        n.visit_children_with(self);
    }

    fn visit_expr(&mut self, n: &Expr) {
        if self.tainted {
            return;
        }
        n.visit_children_with(self);
    }

    fn visit_function(&mut self, n: &Function) {
        self.fn_depth += 1;
        n.visit_children_with(self);
        self.fn_depth -= 1;
    }

    fn visit_arrow_expr(&mut self, n: &ArrowExpr) {
        self.fn_depth += 1;
        n.visit_children_with(self);
        self.fn_depth -= 1;
    }

    fn visit_constructor(&mut self, n: &Constructor) {
        self.fn_depth += 1;
        n.visit_children_with(self);
        self.fn_depth -= 1;
    }

    fn visit_this_expr(&mut self, _: &ThisExpr) {
        if self.fn_depth == 0 {
            self.tainted = true;
        }
    }

    fn visit_ident(&mut self, i: &Ident) {
        if is_global(i, "exports", self.unresolved_mark)
            || is_global(i, "module", self.unresolved_mark)
        {
            self.tainted = true;
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

    /// Parse `code`, run the resolver, and return the CommonJS export analysis.
    fn analyze_cjs(code: &str) -> CommonJsExportsAnalysis {
        GLOBALS.set(&Default::default(), || {
            let cm = Lrc::new(SourceMap::default());
            let fm = cm.new_source_file(Lrc::new(FileName::Anon), code.to_string());
            let comments = SingleThreadedComments::default();
            let mut errors = vec![];
            let mut program = parse_file_as_program(
                &fm,
                Syntax::Es(EsSyntax::default()),
                EsVersion::latest(),
                Some(&comments),
                &mut errors,
            )
            .expect("Failed to parse");
            let unresolved_mark = Mark::new();
            let top_level_mark = Mark::new();
            program.visit_mut_with(&mut resolver(unresolved_mark, top_level_mark, false));
            analyze_cjs_exports(&program, unresolved_mark)
        })
    }

    /// Sorted export names of an analyzable CommonJS module (panics if it's unsafe).
    fn sorted_names(code: &str) -> Vec<String> {
        let analysis = analyze_cjs(code);
        assert!(
            !analysis.is_unsafe,
            "expected analyzable (safe) CJS exports"
        );
        let mut names: Vec<String> = analysis.names.iter().map(|n| n.to_string()).collect();
        names.sort();
        names
    }

    #[test]
    fn test_named_exports() {
        assert_eq!(
            sorted_names("exports.foo = 1; exports.bar = 2;"),
            ["bar", "foo"]
        );
    }

    #[test]
    fn test_module_exports_member() {
        assert_eq!(
            sorted_names("module.exports.foo = 1; module.exports.bar = 2;"),
            ["bar", "foo"]
        );
    }

    #[test]
    fn test_mixed_exports_and_module_exports() {
        assert_eq!(
            sorted_names("exports.foo = 1; module.exports.bar = 2;"),
            ["bar", "foo"]
        );
    }

    #[test]
    fn test_parenthesized_export_write() {
        assert_eq!(sorted_names("(exports.foo = 1);"), ["foo"]);
    }

    #[test]
    fn test_es_module_marker() {
        let analysis = analyze_cjs("exports.__esModule = true; exports.foo = 1;");
        assert!(!analysis.is_unsafe);
        assert!(analysis.has_es_module);
        assert_eq!(
            analysis
                .names
                .iter()
                .map(|n| n.to_string())
                .collect::<Vec<_>>(),
            ["foo"]
        );
    }

    #[test]
    fn test_plan_is_keyed_by_statement_index() {
        let analysis = analyze_cjs("exports.__esModule = true; const x = 1; exports.foo = x;");
        assert!(!analysis.is_unsafe);
        assert!(matches!(
            analysis.exports.get(&0),
            Some(CjsExportFormat::EsModuleMarker)
        ));
        assert!(!analysis.exports.contains_key(&1));
        assert!(
            matches!(analysis.exports.get(&2), Some(CjsExportFormat::Named(name)) if name.as_ref() == "foo")
        );
    }

    // --- Pattern 1: `module.exports = { … }` object literal ---

    #[test]
    fn test_module_exports_object_literal() {
        let analysis = analyze_cjs("module.exports = { a: 1, b: 2 };");
        assert!(!analysis.is_unsafe);
        assert!(!analysis.has_es_module);
        let names: Vec<String> = analysis.names.iter().map(|n| n.to_string()).collect();
        assert_eq!(names, ["a", "b"]);
    }

    #[test]
    fn test_module_exports_object_shorthand_keyword_and_method() {
        // Shorthand, keyword key, and a method — all plain-identifier keys.
        assert_eq!(
            sorted_names("const b = 1; module.exports = { a: 1, b, default: 4, m() {} };"),
            ["a", "b", "default", "m"]
        );
    }

    #[test]
    fn test_module_exports_object_preserves_order() {
        // Names are recorded in source order (not sorted).
        let analysis = analyze_cjs("module.exports = { z: 1, a: 2, m: 3 };");
        assert!(!analysis.is_unsafe);
        let names: Vec<String> = analysis.names.iter().map(|n| n.to_string()).collect();
        assert_eq!(names, ["z", "a", "m"]);
    }

    #[test]
    fn test_unsafe_object_literal_spread() {
        assert!(analyze_cjs("module.exports = { ...other, a: 1 };").is_unsafe);
    }

    #[test]
    fn test_unsafe_object_literal_computed_key() {
        assert!(analyze_cjs("module.exports = { [key]: 1 };").is_unsafe);
    }

    #[test]
    fn test_unsafe_object_literal_numeric_key() {
        assert!(analyze_cjs("module.exports = { 0: 1 };").is_unsafe);
    }

    #[test]
    fn test_unsafe_object_literal_string_key() {
        // Quoted keys bail, whether or not the string is a valid identifier:
        // the synthesized export binding requires a plain identifier name.
        assert!(analyze_cjs("module.exports = { 'a-b': 1 };").is_unsafe);
        assert!(analyze_cjs("module.exports = { 'c': 1 };").is_unsafe);
    }

    #[test]
    fn test_unsafe_object_literal_getter() {
        assert!(analyze_cjs("module.exports = { get a() { return 1; } };").is_unsafe);
    }

    #[test]
    fn test_unsafe_object_literal_duplicate_key() {
        assert!(analyze_cjs("module.exports = { a: 1, a: 2 };").is_unsafe);
    }

    #[test]
    fn test_unsafe_object_literal_value_escapes_exports() {
        assert!(analyze_cjs("module.exports = { a: exports };").is_unsafe);
    }

    #[test]
    fn test_unsafe_multiple_module_exports_objects() {
        assert!(analyze_cjs("module.exports = { a: 1 }; module.exports = { b: 2 };").is_unsafe);
    }

    #[test]
    fn test_unsafe_object_literal_mixed_with_named_write() {
        assert!(analyze_cjs("module.exports = { a: 1 }; exports.b = 2;").is_unsafe);
        assert!(analyze_cjs("exports.b = 2; module.exports = { a: 1 };").is_unsafe);
    }

    #[test]
    fn test_unsafe_exports_alias_object() {
        // `exports = { … }` (not `module.exports`) is just an alias write.
        assert!(analyze_cjs("exports = { a: 1 };").is_unsafe);
    }

    // --- Pattern 2: `__esModule` interop marker ---

    #[test]
    fn test_es_module_marker_assignment() {
        let analysis =
            analyze_cjs("exports.__esModule = true; exports.default = 1; exports.foo = 2;");
        assert!(!analysis.is_unsafe);
        assert!(analysis.has_es_module);
        let names: Vec<String> = analysis.names.iter().map(|n| n.to_string()).collect();
        assert_eq!(names, ["default", "foo"]);
    }

    #[test]
    fn test_module_exports_dot_es_module_marker() {
        let analysis = analyze_cjs("module.exports.__esModule = true; module.exports.foo = 1;");
        assert!(!analysis.is_unsafe);
        assert!(analysis.has_es_module);
        assert_eq!(
            analysis
                .names
                .iter()
                .map(|n| n.to_string())
                .collect::<Vec<_>>(),
            ["foo"]
        );
    }

    // --- unsafe cases (`is_unsafe` is set) ---

    #[test]
    fn test_unsafe_define_property_marker_deferred() {
        // Recognizing the transpiled-ESM `Object.defineProperty(exports,
        // "__esModule", …)` marker is deferred to a follow-up; today the
        // `exports` reference in the call trips the taint visitor and bails.
        assert!(
            analyze_cjs("Object.defineProperty(exports, \"__esModule\", { value: true });")
                .is_unsafe
        );
    }

    #[test]
    fn test_unsafe_es_module_non_true_value() {
        assert!(analyze_cjs("exports.__esModule = 0;").is_unsafe);
    }

    #[test]
    fn test_unsafe_string_key() {
        assert!(analyze_cjs("exports['foo'] = 1;").is_unsafe);
    }

    #[test]
    fn test_unsafe_alias() {
        assert!(analyze_cjs("const e = exports; e.foo = 1;").is_unsafe);
    }

    #[test]
    fn test_unsafe_computed_key() {
        assert!(analyze_cjs("exports[key] = 1;").is_unsafe);
    }

    #[test]
    fn test_unsafe_escape_arg() {
        assert!(analyze_cjs("exports.foo = 1; register(exports);").is_unsafe);
    }

    #[test]
    fn test_unsafe_top_level_this() {
        assert!(analyze_cjs("this.foo = 1;").is_unsafe);
    }

    #[test]
    fn test_unsafe_reassign_require() {
        assert!(analyze_cjs("module.exports = require('./x');").is_unsafe);
    }

    #[test]
    fn test_unsafe_read_back() {
        assert!(analyze_cjs("exports.foo = 1; const x = exports.foo;").is_unsafe);
    }

    #[test]
    fn test_unsafe_duplicate_named_write() {
        // Two top-level writes to the same name would synthesize duplicate
        // `const __TURBOPACK_cjs_export__foo` bindings / `export … as foo` entries.
        assert!(analyze_cjs("exports.foo = 1; exports.foo = 2;").is_unsafe);
        // ...including when the two writes use the different `exports` forms.
        assert!(analyze_cjs("exports.foo = 1; module.exports.foo = 2;").is_unsafe);
    }

    // Export writes in positions the splitter cannot lift must bail: the write
    // would survive inside a part and target that part's exports object,
    // invisible to the synthesized facade.

    #[test]
    fn test_unsafe_export_write_nested_in_function() {
        assert!(analyze_cjs("function setup() { exports.helper = 1; } setup();").is_unsafe);
    }

    #[test]
    fn test_unsafe_export_write_behind_if() {
        assert!(analyze_cjs("if (cond) exports.a = 1;").is_unsafe);
    }

    #[test]
    fn test_unsafe_chained_export_write() {
        assert!(analyze_cjs("exports.a = exports.b = 1;").is_unsafe);
    }

    #[test]
    fn test_unsafe_export_write_in_sequence_expr() {
        assert!(analyze_cjs("exports.a = 1, exports.b = 2;").is_unsafe);
    }
}
