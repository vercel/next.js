use regex::Regex;
use swc_core::{
    common::{Span, Spanned},
    ecma::{
        ast::*,
        visit::{Visit, VisitMut, VisitWith, visit_mut_pass},
    },
    quote,
};

// When Cache Components is enabled, an empty generateStaticParams is an error,
// detected at runtime in buildAppStaticPaths. The throw there is framework
// code, so it has no user frame to point at. For an app page (or
// layout/default) that exports generateStaticParams, this transform emits a
// factory whose error is anchored at the user's code, which the runtime throws
// when it sees an empty result. The anchor is the most specific of: the `return
// []` literal when statically detectable, the declaration, or the export
// statement.
#[derive(Debug)]
pub struct EmptyGenerateStaticParams {
    page_or_layout: Regex,
}

impl EmptyGenerateStaticParams {
    pub fn new<I, S>(page_extensions: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        // `route` handlers can also export generateStaticParams, but an empty
        // result is only an error for app pages (PPR), so they are excluded.
        let mut result = String::from(r"[\\/](page|layout|default)\.");
        let mut iter = page_extensions.into_iter();
        if let Some(first) = iter.next() {
            result.push('(');
            result.push_str(&regex::escape(first.as_ref()));
            for ext in iter {
                result.push('|');
                result.push_str(&regex::escape(ext.as_ref()));
            }
            result.push(')');
        } else {
            result.push_str("(ts|js)x?");
        }
        result.push('$');
        Self {
            page_or_layout: Regex::new(&result).unwrap(),
        }
    }

    pub fn get_pass(&self, filepath: String) -> impl Pass + use<> {
        visit_mut_pass(EmptyGenerateStaticParamsPass {
            filepath,
            page_or_layout: self.page_or_layout.clone(),
        })
    }
}

struct EmptyGenerateStaticParamsPass {
    filepath: String,
    page_or_layout: Regex,
}

// Counts a function's own return statements (not descending into nested
// functions, whose returns aren't this function's) and remembers the span of an
// empty array literal return.
#[derive(Default)]
struct ReturnCollector {
    count: usize,
    empty_array_span: Option<Span>,
}

impl Visit for ReturnCollector {
    fn visit_return_stmt(&mut self, return_statement: &ReturnStmt) {
        self.count += 1;
        if let Some(argument) = &return_statement.arg
            && let Expr::Array(array) = &**argument
            && array.elems.is_empty()
        {
            self.empty_array_span = Some(array.span());
        }
    }

    fn visit_arrow_expr(&mut self, _: &ArrowExpr) {}
    fn visit_function(&mut self, _: &Function) {}
}

// Anchors at the `return []` literal only when it is the body's sole return, so
// an empty result can only have come from it. With other returns present we
// can't tell which produced the empty result, so this returns None and the
// caller falls back to the declaration.
fn find_error_anchor_in_body(body: &BlockStmt) -> Option<Span> {
    let mut returns = ReturnCollector::default();
    body.visit_with(&mut returns);
    if returns.count == 1 {
        return returns.empty_array_span;
    }
    None
}

// Finds the empty array literal anchor within an initializer expression, when
// it is unambiguously the only return. Returns None for a computed result; the
// caller falls back to the initializer itself.
fn find_error_anchor_in_initializer(initializer: &Expr) -> Option<Span> {
    match initializer {
        Expr::Arrow(arrow) => match &*arrow.body {
            BlockStmtOrExpr::BlockStmt(body) => find_error_anchor_in_body(body),
            BlockStmtOrExpr::Expr(expr) => match &**expr {
                Expr::Array(array) if array.elems.is_empty() => Some(array.span()),
                _ => None,
            },
        },
        Expr::Fn(function_expression) => function_expression
            .function
            .body
            .as_ref()
            .and_then(find_error_anchor_in_body),
        _ => None,
    }
}

// Finds the anchor for a declaration, if it declares `name` as a function or
// variable. Prefers the empty array literal and falls back to the declaration
// itself.
fn find_error_anchor_in_declaration(declaration: &Decl, name: &str) -> Option<Span> {
    match declaration {
        Decl::Fn(function) if function.ident.sym == *name => Some(
            function
                .function
                .body
                .as_ref()
                .and_then(find_error_anchor_in_body)
                .unwrap_or_else(|| function.function.span()),
        ),
        Decl::Var(variable) => {
            for declarator in &variable.decls {
                if let Pat::Ident(ident) = &declarator.name
                    && ident.id.sym == *name
                    && let Some(initializer) = &declarator.init
                {
                    return Some(
                        find_error_anchor_in_initializer(initializer)
                            .unwrap_or_else(|| initializer.span()),
                    );
                }
            }
            None
        }
        _ => None,
    }
}

// Finds the local identifier that an export specifier exposes as
// `generateStaticParams` (`export { generateStaticParams }` or `export { x as
// generateStaticParams }`).
fn find_generate_static_params_export(specifier: &ExportSpecifier) -> Option<&Ident> {
    match specifier {
        ExportSpecifier::Named(ExportNamedSpecifier {
            exported: Some(ModuleExportName::Ident(exported)),
            orig: ModuleExportName::Ident(local),
            ..
        }) if exported.sym == "generateStaticParams" => Some(local),
        ExportSpecifier::Named(ExportNamedSpecifier {
            exported: None,
            orig: ModuleExportName::Ident(local),
            ..
        }) if local.sym == "generateStaticParams" => Some(local),
        _ => None,
    }
}

// Finds the anchor for a local declaration named `name`, whether exported or
// not.
fn find_error_anchor_for_local_name(items: &[ModuleItem], name: &str) -> Option<Span> {
    for item in items {
        let declaration = match item {
            ModuleItem::Stmt(Stmt::Decl(declaration)) => declaration,
            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export)) => &export.decl,
            _ => continue,
        };
        if let Some(span) = find_error_anchor_in_declaration(declaration, name) {
            return Some(span);
        }
    }
    None
}

// Finds the span to anchor the error at, considering only exported
// `generateStaticParams`. Handles `export function`/`export const`, `export { x
// as generateStaticParams }`, and `export { ... } from '...'`.
fn find_error_anchor(items: &[ModuleItem]) -> Option<Span> {
    for item in items {
        match item {
            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export)) => {
                if let Some(span) =
                    find_error_anchor_in_declaration(&export.decl, "generateStaticParams")
                {
                    return Some(span);
                }
            }
            ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(named)) => {
                for specifier in &named.specifiers {
                    if let Some(local) = find_generate_static_params_export(specifier) {
                        // A re-export (`... from '...'`) declares the name in
                        // another module, so anchor at the export statement.
                        // Otherwise resolve the local declaration.
                        if named.src.is_some() {
                            return Some(specifier.span());
                        }
                        return Some(
                            find_error_anchor_for_local_name(items, &local.sym)
                                .unwrap_or_else(|| specifier.span()),
                        );
                    }
                }
            }
            _ => {}
        }
    }
    None
}

impl VisitMut for EmptyGenerateStaticParamsPass {
    fn visit_mut_module_items(&mut self, items: &mut Vec<ModuleItem>) {
        if !self.page_or_layout.is_match(&self.filepath) {
            return;
        }

        let Some(anchor) = find_error_anchor(items) else {
            return;
        };

        // `new Error(...)` spanned at the anchor so the stack maps back to the
        // user's code.
        let mut error = quote!(
            "new Error('When using Cache Components, all `generateStaticParams` \
                functions must return at least one result. This is to ensure \
                that we can perform build-time validation that there is no \
                other dynamic accesses that would cause a runtime error.\\n\\n\
                Learn more: \
                https://nextjs.org/docs/messages/empty-generate-static-params')"
                as Expr
        );
        if let Expr::New(new_expr) = &mut error {
            new_expr.span = anchor;
        }

        // The factory is named `generateStaticParams` so the frame reads as the
        // user's function, and its span is the anchor for the same reason.
        let mut factory = quote!(
            "function generateStaticParams() {
                return $error
            }" as Expr,
            error: Expr = error,
        );
        if let Expr::Fn(f) = &mut factory {
            f.function.span = anchor;
        }

        items.push(quote!(
            "export const __next_create_empty_gsp_error = $factory" as ModuleItem,
            factory: Expr = factory,
        ));
    }
}
