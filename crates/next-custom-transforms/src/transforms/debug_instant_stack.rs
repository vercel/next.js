use regex::Regex;
use swc_core::{
    common::{Span, Spanned},
    ecma::{
        ast::*,
        visit::{VisitMut, visit_mut_pass},
    },
    quote,
};

#[derive(Debug)]
pub struct DebugInstantStack {
    page_or_layout: Regex,
}

impl DebugInstantStack {
    pub fn new<I, S>(page_extensions: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
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
        visit_mut_pass(DebugInstantStackPass {
            filepath,
            instant_export_span: None,
            page_or_layout: self.page_or_layout.clone(),
        })
    }
}

struct DebugInstantStackPass {
    filepath: String,
    instant_export_span: Option<Span>,
    page_or_layout: Regex,
}

/// Given an export specifier, returns `Some((exported_name, local_name))` if
/// the exported name is `instant`.
fn get_instant_specifier_names(specifier: &ExportSpecifier) -> Option<(&Ident, &Ident)> {
    match specifier {
        // `export { orig as instant }`
        ExportSpecifier::Named(ExportNamedSpecifier {
            exported: Some(ModuleExportName::Ident(exported)),
            orig: ModuleExportName::Ident(orig),
            ..
        }) if exported.sym == "instant" => Some((exported, orig)),
        // `export { instant }`
        ExportSpecifier::Named(ExportNamedSpecifier {
            exported: None,
            orig: ModuleExportName::Ident(orig),
            ..
        }) if orig.sym == "instant" => Some((orig, orig)),
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

impl VisitMut for DebugInstantStackPass {
    fn visit_mut_module_items(&mut self, items: &mut Vec<ModuleItem>) {
        if !self.page_or_layout.is_match(&self.filepath) {
            return;
        }

        for item in items.iter() {
            match item {
                // `export const instant = ...`
                ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export_decl)) => {
                    if let Decl::Var(var_decl) = &export_decl.decl {
                        for decl in &var_decl.decls {
                            if let Pat::Ident(ident) = &decl.name
                                && ident.id.sym == "instant"
                                && let Some(init) = &decl.init
                            {
                                self.instant_export_span = Some(init.span());
                            }
                        }
                    }
                }
                // `export { instant }` or `export { x as instant }`
                // with or without `from '...'`
                ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(named)) => {
                    for specifier in &named.specifiers {
                        if let Some((_exported, orig)) = get_instant_specifier_names(specifier) {
                            if named.src.is_some() {
                                // Re-export: `export { instant } from './config'`
                                // Point at the export specifier itself
                                self.instant_export_span = Some(specifier.span());
                            } else {
                                // Local named export: try to find the variable's initializer
                                let local_name = &orig.sym;
                                if let Some(init_span) = find_var_init_span(items, local_name) {
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
            // TODO: Change React to deserialize errors with a zero-length message
            // instead of using a fallback message ("no message was provided").
            // We're working around this by using a message that is empty
            // after trimming but isn't to JavaScript before trimming (' '.length === 1).
            let mut new_error = quote!("new Error(' ')" as Expr);
            if let Expr::New(new_expr) = &mut new_error {
                new_expr.span = source_span;
            }

            let mut cons = quote!(
                "function instant() {
                    const error = $new_error
                    error.name = 'Instant Validation'
                    return error
                }" as Expr,
                new_error: Expr = new_error,
            );

            // Patch source_span onto the Function
            // for sourcemap mapping back to the instant config value
            if let Expr::Fn(f) = &mut cons {
                f.function.span = source_span;
            }

            let export = quote!(
                "export const __debugCreateInstantConfigStack =
                    process.env.NODE_ENV !== 'production' ? $cons : null"
                    as ModuleItem,
                cons: Expr = cons,
            );

            items.push(export);
        }
    }
}
