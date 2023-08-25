use serde::Deserialize;
use turbopack_binding::swc::core::{
    common::{FileName, DUMMY_SP},
    ecma::{
        ast::*,
        utils::{private_ident, quote_str},
        visit::Fold,
    },
};

#[derive(Clone, Debug, Deserialize)]
pub struct Config {
    pub names: Vec<String>,
}

pub fn optimize_barrel(filename: FileName, config: Config) -> impl Fold {
    OptimizeBarrel {
        filepath: filename.to_string(),
        names: config.names,
    }
}

#[derive(Debug, Default)]
struct OptimizeBarrel {
    filepath: String,
    names: Vec<String>,
}

impl Fold for OptimizeBarrel {
    fn fold_module_items(&mut self, items: Vec<ModuleItem>) -> Vec<ModuleItem> {
        // One pre-pass to find all the local idents that we are referencing.
        let mut local_idents = vec![];
        for item in &items {
            if let ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(export_named)) = item {
                if export_named.src.is_none() {
                    for spec in &export_named.specifiers {
                        if let ExportSpecifier::Named(s) = spec {
                            let str_name;
                            if let Some(name) = &s.exported {
                                str_name = match &name {
                                    ModuleExportName::Ident(n) => n.sym.to_string(),
                                    ModuleExportName::Str(n) => n.value.to_string(),
                                };
                            } else {
                                str_name = match &s.orig {
                                    ModuleExportName::Ident(n) => n.sym.to_string(),
                                    ModuleExportName::Str(n) => n.value.to_string(),
                                };
                            }

                            // If the exported name needs to be kept, track the local ident.
                            if self.names.contains(&str_name) {
                                if let ModuleExportName::Ident(i) = &s.orig {
                                    local_idents.push(i.sym.clone());
                                }
                            }
                        }
                    }
                }
            }
        }

        // The second pass to rebuild the module items.
        let mut new_items = vec![];

        // We only apply this optimization to barrel files. Here we consider
        // a barrel file to be a file that only exports from other modules.
        // Besides that, lit expressions are allowed as well ("use client", etc.).
        let mut is_barrel = true;
        for item in &items {
            match item {
                ModuleItem::ModuleDecl(decl) => {
                    match decl {
                        // export { foo } from './foo';
                        ModuleDecl::ExportNamed(export_named) => {
                            for spec in &export_named.specifiers {
                                match spec {
                                    ExportSpecifier::Namespace(s) => {
                                        let name_str = match &s.name {
                                            ModuleExportName::Ident(n) => n.sym.to_string(),
                                            ModuleExportName::Str(n) => n.value.to_string(),
                                        };
                                        if self.names.contains(&name_str) {
                                            new_items.push(item.clone());
                                        }
                                    }
                                    ExportSpecifier::Named(s) => {
                                        if let Some(name) = &s.exported {
                                            let name_str = match &name {
                                                ModuleExportName::Ident(n) => n.sym.to_string(),
                                                ModuleExportName::Str(n) => n.value.to_string(),
                                            };

                                            if self.names.contains(&name_str) {
                                                new_items.push(ModuleItem::ModuleDecl(
                                                    ModuleDecl::ExportNamed(NamedExport {
                                                        span: DUMMY_SP,
                                                        specifiers: vec![ExportSpecifier::Named(
                                                            ExportNamedSpecifier {
                                                                span: DUMMY_SP,
                                                                orig: s.orig.clone(),
                                                                exported: Some(
                                                                    ModuleExportName::Ident(
                                                                        Ident::new(
                                                                            name_str.into(),
                                                                            DUMMY_SP,
                                                                        ),
                                                                    ),
                                                                ),
                                                                is_type_only: false,
                                                            },
                                                        )],
                                                        src: export_named.src.clone(),
                                                        type_only: false,
                                                        asserts: None,
                                                    }),
                                                ));
                                            }
                                        } else {
                                            let name_str = match &s.orig {
                                                ModuleExportName::Ident(n) => n.sym.to_string(),
                                                ModuleExportName::Str(n) => n.value.to_string(),
                                            };

                                            if self.names.contains(&name_str) {
                                                new_items.push(ModuleItem::ModuleDecl(
                                                    ModuleDecl::ExportNamed(NamedExport {
                                                        span: DUMMY_SP,
                                                        specifiers: vec![ExportSpecifier::Named(
                                                            ExportNamedSpecifier {
                                                                span: DUMMY_SP,
                                                                orig: s.orig.clone(),
                                                                exported: None,
                                                                is_type_only: false,
                                                            },
                                                        )],
                                                        src: export_named.src.clone(),
                                                        type_only: false,
                                                        asserts: None,
                                                    }),
                                                ));
                                            }
                                        }
                                    }
                                    _ => {
                                        is_barrel = false;
                                        break;
                                    }
                                }
                            }
                        }
                        // Keep import statements that create the local idents we need.
                        ModuleDecl::Import(import_decl) => {
                            for spec in &import_decl.specifiers {
                                match spec {
                                    ImportSpecifier::Named(s) => {
                                        if local_idents.contains(&s.local.sym) {
                                            new_items.push(ModuleItem::ModuleDecl(
                                                ModuleDecl::Import(ImportDecl {
                                                    span: DUMMY_SP,
                                                    specifiers: vec![ImportSpecifier::Named(
                                                        ImportNamedSpecifier {
                                                            span: DUMMY_SP,
                                                            local: s.local.clone(),
                                                            imported: s.imported.clone(),
                                                            is_type_only: false,
                                                        },
                                                    )],
                                                    src: import_decl.src.clone(),
                                                    type_only: false,
                                                    asserts: None,
                                                }),
                                            ));
                                        }
                                    }
                                    ImportSpecifier::Default(s) => {
                                        if local_idents.contains(&s.local.sym) {
                                            new_items.push(ModuleItem::ModuleDecl(
                                                ModuleDecl::Import(ImportDecl {
                                                    span: DUMMY_SP,
                                                    specifiers: vec![ImportSpecifier::Default(
                                                        ImportDefaultSpecifier {
                                                            span: DUMMY_SP,
                                                            local: s.local.clone(),
                                                        },
                                                    )],
                                                    src: import_decl.src.clone(),
                                                    type_only: false,
                                                    asserts: None,
                                                }),
                                            ));
                                        }
                                    }
                                    ImportSpecifier::Namespace(s) => {
                                        if local_idents.contains(&s.local.sym) {
                                            new_items.push(ModuleItem::ModuleDecl(
                                                ModuleDecl::Import(ImportDecl {
                                                    span: DUMMY_SP,
                                                    specifiers: vec![ImportSpecifier::Namespace(
                                                        ImportStarAsSpecifier {
                                                            span: DUMMY_SP,
                                                            local: s.local.clone(),
                                                        },
                                                    )],
                                                    src: import_decl.src.clone(),
                                                    type_only: false,
                                                    asserts: None,
                                                }),
                                            ));
                                        }
                                    }
                                }
                            }
                        }
                        _ => {
                            // Export expressions are not allowed in barrel files.
                            is_barrel = false;
                            break;
                        }
                    }
                }
                ModuleItem::Stmt(stmt) => match stmt {
                    Stmt::Expr(expr) => match &*expr.expr {
                        Expr::Lit(_) => {
                            new_items.push(item.clone());
                        }
                        _ => {
                            is_barrel = false;
                            break;
                        }
                    },
                    _ => {
                        is_barrel = false;
                        break;
                    }
                },
            }
        }

        // If the file is not a barrel file, we need to create a new module that
        // re-exports from the original file.
        // This is to avoid creating multiple instances of the original module.
        if !is_barrel {
            new_items = vec![ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(
                NamedExport {
                    span: DUMMY_SP,
                    specifiers: self
                        .names
                        .iter()
                        .map(|name| {
                            ExportSpecifier::Named(ExportNamedSpecifier {
                                span: DUMMY_SP,
                                orig: ModuleExportName::Ident(private_ident!(name.clone())),
                                exported: None,
                                is_type_only: false,
                            })
                        })
                        .collect(),
                    src: Some(Box::new(quote_str!(self.filepath.to_string()))),
                    type_only: false,
                    asserts: None,
                },
            ))];
        }

        new_items
    }
}
