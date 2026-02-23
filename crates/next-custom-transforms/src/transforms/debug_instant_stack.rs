use swc_core::{
    common::{Span, Spanned},
    ecma::{
        ast::*,
        visit::{Fold, fold_pass},
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

/// Given an export specifier, returns `Some((exported_name, local_name))` if
/// the exported name is `unstable_instant`.
fn get_instant_specifier_names(specifier: &ExportSpecifier) -> Option<(&Ident, &Ident)> {
    match specifier {
        // `export { orig as unstable_instant }`
        ExportSpecifier::Named(ExportNamedSpecifier {
            exported: Some(ModuleExportName::Ident(exported)),
            orig: ModuleExportName::Ident(orig),
            ..
        }) if exported.sym == "unstable_instant" => Some((exported, orig)),
        // `export { unstable_instant }`
        ExportSpecifier::Named(ExportNamedSpecifier {
            exported: None,
            orig: ModuleExportName::Ident(orig),
            ..
        }) if orig.sym == "unstable_instant" => Some((orig, orig)),
        _ => None,
    }
}

/// Find the initializer span of a variable declaration with the given name.
fn find_var_init_span(items: &[ModuleItem], local_name: &str) -> Option<Span> {
    for item in items {
        let decl = match item {
            ModuleItem::Stmt(Stmt::Decl(Decl::Var(var_decl))) => var_decl,
            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export_decl)) => {
                if let Decl::Var(var_decl) = &export_decl.decl {
                    var_decl
                } else {
                    continue;
                }
            }
            _ => continue,
        };
        for d in &decl.decls {
            if let Pat::Ident(ident) = &d.name
                && ident.id.sym == local_name
                && let Some(init) = &d.init
            {
                return Some(init.span());
            }
        }
    }
    None
}

impl Fold for DebugInstantStack {
    fn fold_module_items(&mut self, items: Vec<ModuleItem>) -> Vec<ModuleItem> {
        for item in &items {
            match item {
                // `export const unstable_instant = ...`
                ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export_decl)) => {
                    if let Decl::Var(var_decl) = &export_decl.decl {
                        for decl in &var_decl.decls {
                            if let Pat::Ident(ident) = &decl.name
                                && ident.id.sym == "unstable_instant"
                                && let Some(init) = &decl.init
                            {
                                self.instant_export_span = Some(init.span());
                            }
                        }
                    }
                }
                // `export { unstable_instant }` or `export { x as unstable_instant }`
                // with or without `from '...'`
                ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(named)) => {
                    for specifier in &named.specifiers {
                        if let Some((_exported, orig)) = get_instant_specifier_names(specifier) {
                            if named.src.is_some() {
                                // Re-export: `export { unstable_instant } from './config'`
                                // Point at the export specifier itself
                                self.instant_export_span = Some(specifier.span());
                            } else {
                                // Local named export: try to find the variable's initializer
                                let local_name = &orig.sym;
                                if let Some(init_span) = find_var_init_span(&items, local_name) {
                                    self.instant_export_span = Some(init_span);
                                } else {
                                    // Fallback to the export specifier span
                                    self.instant_export_span = Some(specifier.span());
                                }
                            }
                        }
                    }
                }
                _ => {}
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
