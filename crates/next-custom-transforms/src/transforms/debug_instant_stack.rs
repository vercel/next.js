use swc_core::{
    common::{Span, Spanned},
    ecma::{
        ast::*,
        visit::{fold_pass, Fold},
    },
    quote,
};

pub fn debug_instant_stack() -> impl Pass {
    fold_pass(DebugInstantStack {
        instant_export_span: None,
    })
}

struct DebugInstantStack {
    instant_export_span: Option<Span>,
}

impl Fold for DebugInstantStack {
    fn fold_module_items(&mut self, items: Vec<ModuleItem>) -> Vec<ModuleItem> {
        // Scan for `export const unstable_instant = ...`
        for item in &items {
            if let ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export_decl)) = item {
                if let Decl::Var(var_decl) = &export_decl.decl {
                    for decl in &var_decl.decls {
                        if let Pat::Ident(ident) = &decl.name {
                            if ident.id.sym == "unstable_instant" {
                                if let Some(init) = &decl.init {
                                    self.instant_export_span = Some(init.span());
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some(source_span) = self.instant_export_span {
            let mut new_items = items;

            // Build new Error() with source_span for sourcemapping
            let new_error = Expr::New(NewExpr {
                span: source_span,
                callee: Box::new(Expr::Ident(Ident {
                    sym: "Error".into(),
                    span: source_span,
                    ..Default::default()
                })),
                args: Some(vec![]),
                ..Default::default()
            });

            // (function unstable_instant() { ... })()
            // The stackTraceLimit mostly works around app-page
            // sourcemapping being broken and thus
            // not ignore-listing Next.js module evaluation frames.
            // We'd still want to ignore-list the module evaluation frame of
            // `const __debugInstantStack = ...`
            // so that we can get rid of manually limiting the stackTraceLimit.
            // This really is only fine because Next.js controls how the page is loaded.
            let mut cons = quote!(
                "(function unstable_instant() {
                    const previousStackTraceLimit = Error.stackTraceLimit
                    Error.stackTraceLimit = 1
                    const error = $new_error
                    Error.stackTraceLimit = previousStackTraceLimit
                    error.name = 'Instant Config'
                    return error
                })()" as Expr,
                new_error: Expr = new_error,
            );

            // Patch source_span onto the IIFE CallExpr and inner Function
            // for sourcemap mapping back to the unstable_instant config value
            if let Expr::Call(call) = &mut cons {
                call.span = source_span;
                if let Callee::Expr(e) = &mut call.callee {
                    if let Expr::Paren(p) = e.as_mut() {
                        if let Expr::Fn(f) = p.expr.as_mut() {
                            f.function.span = source_span;
                        }
                    }
                }
            }

            let export = quote!(
                "export const __debugInstantStack =
                    process.env.NODE_ENV !== 'production' ? $cons : undefined"
                    as ModuleItem,
                cons: Expr = cons,
            );

            new_items.push(export);
            new_items
        } else {
            items
        }
    }
}
