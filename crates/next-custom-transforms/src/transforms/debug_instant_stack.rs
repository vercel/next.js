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

            // TODO: Change React to deserialize errors with a zero-length message
            // instead of using a fallback message ("no message was provided").
            // We're working around this by using a message that is empty
            // after trimming but isn't to JavaScript before trimming (' '.length === 1).
            let mut new_error = quote!("new Error(' ')" as Expr);
            if let Expr::New(new_expr) = &mut new_error {
                new_expr.span = source_span;
            }

            let mut cons = quote!(
                "function unstable_instant() {
                    const error = $new_error
                    error.name = 'Instant Validation'
                    return error
                }" as Expr,
                new_error: Expr = new_error,
            );

            // Patch source_span onto the Function
            // for sourcemap mapping back to the unstable_instant config value
            if let Expr::Fn(f) = &mut cons {
                f.function.span = source_span;
            }

            let export = quote!(
                "export const __debugCreateInstantConfigStack =
                    process.env.NODE_ENV !== 'production' ? $cons : null"
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
