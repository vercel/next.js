use rustc_hash::FxHashMap;
use swc_core::{
    common::{
        BytePos, DUMMY_SP, Mark, Span, Spanned, SyntaxContext,
        comments::{Comment, CommentKind, Comments},
        source_map::PURE_SP,
        util::take::Take,
    },
    ecma::{
        ast::*,
        utils::{prepend_stmt, private_ident, quote_ident, quote_str},
        visit::{VisitMut, VisitMutWith, noop_visit_mut_type, visit_mut_pass},
    },
    quote,
};

pub fn track_dynamic_imports<C: Comments>(
    unresolved_mark: Mark,
    comments: C,
) -> impl VisitMut + Pass {
    visit_mut_pass(ImportReplacer::new(unresolved_mark, comments))
}

struct ImportReplacer<C: Comments> {
    comments: C,
    unresolved_ctxt: SyntaxContext,
    has_dynamic_import: bool,
    wrapper_function_local_ident: Ident,
    /// Maps import call span lo → export names extracted from destructuring
    import_export_names: FxHashMap<BytePos, Vec<String>>,
}

impl<C: Comments> ImportReplacer<C> {
    pub fn new(unresolved_mark: Mark, comments: C) -> Self {
        ImportReplacer {
            comments,
            unresolved_ctxt: SyntaxContext::empty().apply_mark(unresolved_mark),
            has_dynamic_import: false,
            wrapper_function_local_ident: private_ident!("$$trackDynamicImport__"),
            import_export_names: Default::default(),
        }
    }
}

/// Try to find an `await import(...)` CallExpr inside an expression,
/// unwrapping parentheses. Returns the span of the import call only if
/// `await` is present — without await, the destructuring targets the
/// Promise, not the module namespace.
fn find_awaited_import_call_span(expr: &Expr) -> Option<Span> {
    let mut current: &Expr = expr;
    let mut seen_await = false;
    loop {
        match current {
            Expr::Call(CallExpr {
                callee: Callee::Import(_),
                span,
                ..
            }) if seen_await => {
                break Some(*span);
            }
            Expr::Await(AwaitExpr { arg, .. }) => {
                seen_await = true;
                current = arg;
            }
            Expr::Paren(ParenExpr { expr, .. }) => {
                current = expr;
            }
            _ => break None,
        }
    }
}

/// Extract export names from an ObjectPattern (destructuring pattern).
/// Returns `Some(names)` for recognized patterns, `None` for patterns
/// that can't be statically analyzed (rest elements, computed keys).
fn extract_export_names_from_pat(pat: &ObjectPat) -> Option<Vec<String>> {
    let mut names = Vec::new();
    for prop in &pat.props {
        match prop {
            ObjectPatProp::KeyValue(KeyValuePatProp { key, .. }) => match key {
                PropName::Ident(ident) => names.push(ident.sym.to_string()),
                PropName::Str(s) => names.push(s.value.to_string_lossy().into_owned()),
                // Computed keys can't be statically analyzed
                _ => return None,
            },
            ObjectPatProp::Assign(AssignPatProp { key, .. }) => {
                names.push(key.sym.to_string());
            }
            // Rest elements mean all exports are potentially used
            ObjectPatProp::Rest(_) => return None,
        }
    }
    Some(names)
}

impl<C: Comments> VisitMut for ImportReplacer<C> {
    noop_visit_mut_type!();

    fn visit_mut_program(&mut self, program: &mut Program) {
        program.visit_mut_children_with(self);
        // if we wrapped a dynamic import while visiting the children, we need to import the wrapper

        if self.has_dynamic_import {
            let import_args = MakeNamedImportArgs {
                original_ident: quote_ident!("trackDynamicImport").into(),
                local_ident: self.wrapper_function_local_ident.clone(),
                source: "private-next-rsc-track-dynamic-import",
                unresolved_ctxt: self.unresolved_ctxt,
            };
            match program {
                Program::Module(module) => {
                    prepend_stmt(&mut module.body, make_named_import_esm(import_args));
                }
                Program::Script(script) => {
                    // CJS modules can still use `import()`. for CJS, we have to inject the helper
                    // using `require` instead of `import` to avoid accidentally turning them
                    // into ESM modules.
                    prepend_stmt(&mut script.body, make_named_import_cjs(import_args));
                }
            }
        }
    }

    fn visit_mut_var_declarator(&mut self, decl: &mut VarDeclarator) {
        // Detect: const { x, y } = await import('...')
        // Collect export names BEFORE visiting children, because visit_mut_expr
        // (triggered by visit_mut_children_with) will wrap the import and look up
        // the names from the map.
        //
        // Only extract names when `await` is present — without await, the
        // destructuring targets the Promise, not the module namespace.
        if let Some(init) = &decl.init
            && let Some(import_span) = find_awaited_import_call_span(init)
            && let Pat::Object(obj_pat) = &decl.name
            && let Some(names) = extract_export_names_from_pat(obj_pat)
        {
            self.import_export_names.insert(import_span.lo, names);
        }

        decl.visit_mut_children_with(self);
    }

    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        expr.visit_mut_children_with(self);

        // before: `import(...)`
        // after:  `$$trackDynamicImport__(import(...))`

        if let Expr::Call(
            call_expr @ CallExpr {
                callee: Callee::Import(_),
                ..
            },
        ) = expr
        {
            self.has_dynamic_import = true;

            // Add /* webpackExports: [...] */ comment if we detected destructuring
            if let Some(names) = self.import_export_names.remove(&call_expr.span.lo)
                && let Some(first_arg) = call_expr.args.first()
            {
                let comment_text = if names.is_empty() {
                    " webpackExports: [] ".to_string()
                } else {
                    let names_json: Vec<String> =
                        names.iter().map(|n| format!("\"{}\"", n)).collect();
                    format!(" webpackExports: [{}] ", names_json.join(", "))
                };
                self.comments.add_leading(
                    first_arg.span_lo(),
                    Comment {
                        span: DUMMY_SP,
                        kind: CommentKind::Block,
                        text: comment_text.into(),
                    },
                );
            }

            let replacement_expr = quote!(
                "$wrapper_fn($expr)" as Expr,
                wrapper_fn = self.wrapper_function_local_ident.clone(),
                expr: Expr = expr.take()
            )
            .with_span(PURE_SP);
            *expr = replacement_expr
        }
    }
}

struct MakeNamedImportArgs<'a> {
    original_ident: Ident,
    local_ident: Ident,
    source: &'a str,
    unresolved_ctxt: SyntaxContext,
}

fn make_named_import_esm(args: MakeNamedImportArgs) -> ModuleItem {
    let MakeNamedImportArgs {
        original_ident,
        local_ident,
        source,
        ..
    } = args;
    let mut item = quote!(
        "import { $original_ident as $local_ident } from 'dummy'" as ModuleItem,
        original_ident = original_ident,
        local_ident = local_ident,
    );
    // the import source cannot be parametrized in `quote!()`, so patch it manually
    let decl = item.as_mut_module_decl().unwrap().as_mut_import().unwrap();
    *decl.src = source.into();
    item
}

fn make_named_import_cjs(args: MakeNamedImportArgs) -> Stmt {
    let MakeNamedImportArgs {
        original_ident,
        local_ident,
        source,
        unresolved_ctxt,
    } = args;
    quote!(
        "const { [$original_name]: $local_ident } = $require($source)" as Stmt,
        original_name: Expr = quote_str!(original_ident.sym).into(),
        local_ident = local_ident,
        source: Expr = quote_str!(source).into(),
        // the builtin `require` is considered an unresolved identifier.
        // we have to match that, or it won't be recognized as
        // a proper `require()` call.
        require = quote_ident!(unresolved_ctxt, "require")
    )
}
