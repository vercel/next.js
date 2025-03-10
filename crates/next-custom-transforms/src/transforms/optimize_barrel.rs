use std::collections::HashMap;

use serde::Deserialize;
use swc_core::{
    atoms::{atom, Atom},
    common::DUMMY_SP,
    ecma::{
        ast::*,
        utils::private_ident,
        visit::{fold_pass, Fold},
    },
};

#[derive(Clone, Debug, Deserialize)]
pub struct Config {
    pub wildcard: bool,
}

pub fn optimize_barrel(config: Config) -> impl Pass {
    fold_pass(OptimizeBarrel {
        wildcard: config.wildcard,
    })
}

#[derive(Debug, Default)]
struct OptimizeBarrel {
    wildcard: bool,
}

impl Fold for OptimizeBarrel {
    fn fold_module_items(&mut self, items: Vec<ModuleItem>) -> Vec<ModuleItem> {
        // One pre-pass to find all the local idents that we are referencing, so we can
        // handle the case of `import foo from 'a'; export { foo };` correctly.

        // Map of "local ident" -> ("source module", "orig ident")
        let mut local_idents = HashMap::new();
        for item in &items {
            if let ModuleItem::ModuleDecl(ModuleDecl::Import(import_decl)) = item {
                for spec in &import_decl.specifiers {
                    let src = import_decl.src.value.clone();
                    match spec {
                        ImportSpecifier::Named(s) => {
                            local_idents.insert(
                                s.local.sym.clone(),
                                (
                                    src.clone(),
                                    match &s.imported {
                                        Some(n) => match &n {
                                            ModuleExportName::Ident(n) => n.sym.clone(),
                                            ModuleExportName::Str(n) => n.value.clone(),
                                        },
                                        None => s.local.sym.clone(),
                                    },
                                ),
                            );
                        }
                        ImportSpecifier::Namespace(s) => {
                            local_idents.insert(s.local.sym.clone(), (src.clone(), atom!("*")));
                        }
                        ImportSpecifier::Default(s) => {
                            local_idents
                                .insert(s.local.sym.clone(), (src.clone(), atom!("default")));
                        }
                    }
                }
            }
        }

        // The second pass to rebuild the module items.
        let mut new_items = vec![];

        // Exported meta information.
        let mut export_map = vec![];
        let mut export_wildcards = vec![];

        // We only apply this optimization to barrel files. Here we consider
        // a barrel file to be a file that only exports from other modules.

        // Besides that, lit expressions are allowed as well ("use client", etc.).
        let mut allowed_directives = true;
        let mut directives = vec![];

        let mut is_barrel = true;
        for item in &items {
            match item {
                ModuleItem::ModuleDecl(decl) => {
                    allowed_directives = false;
                    match decl {
                        ModuleDecl::Import(_) => {}
                        // export { foo } from './foo';
                        ModuleDecl::ExportNamed(export_named) => {
                            for spec in &export_named.specifiers {
                                match spec {
                                    ExportSpecifier::Namespace(s) => {
                                        let name_str = match &s.name {
                                            ModuleExportName::Ident(n) => n.sym.clone(),
                                            ModuleExportName::Str(n) => n.value.clone(),
                                        };
                                        if let Some(src) = &export_named.src {
                                            export_map.push((
                                                name_str.clone(),
                                                src.value.clone(),
                                                atom!("*"),
                                            ));
                                        } else if self.wildcard {
                                            export_map.push((
                                                name_str.clone(),
                                                Atom::default(),
                                                atom!("*"),
                                            ));
                                        } else {
                                            is_barrel = false;
                                            break;
                                        }
                                    }
                                    ExportSpecifier::Named(s) => {
                                        let orig_str = match &s.orig {
                                            ModuleExportName::Ident(n) => n.sym.clone(),
                                            ModuleExportName::Str(n) => n.value.clone(),
                                        };
                                        let name_str = match &s.exported {
                                            Some(n) => match &n {
                                                ModuleExportName::Ident(n) => n.sym.clone(),
                                                ModuleExportName::Str(n) => n.value.clone(),
                                            },
                                            None => orig_str.clone(),
                                        };

                                        if let Some(src) = &export_named.src {
                                            export_map.push((
                                                name_str.clone(),
                                                src.value.clone(),
                                                orig_str.clone(),
                                            ));
                                        } else if let Some((src, orig)) =
                                            local_idents.get(&orig_str)
                                        {
                                            export_map.push((
                                                name_str.clone(),
                                                src.clone(),
                                                orig.clone(),
                                            ));
                                        } else if self.wildcard {
                                            export_map.push((
                                                name_str.clone(),
                                                Atom::default(),
                                                orig_str.clone(),
                                            ));
                                        } else {
                                            is_barrel = false;
                                            break;
                                        }
                                    }
                                    _ => {
                                        if !self.wildcard {
                                            is_barrel = false;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        ModuleDecl::ExportAll(export_all) => {
                            export_wildcards.push(export_all.src.value.to_string());
                        }
                        ModuleDecl::ExportDecl(export_decl) => {
                            // Export declarations are not allowed in barrel files.
                            if !self.wildcard {
                                is_barrel = false;
                                break;
                            }

                            match &export_decl.decl {
                                Decl::Class(class) => {
                                    export_map.push((
                                        class.ident.sym.clone(),
                                        Atom::default(),
                                        Atom::default(),
                                    ));
                                }
                                Decl::Fn(func) => {
                                    export_map.push((
                                        func.ident.sym.clone(),
                                        Atom::default(),
                                        Atom::default(),
                                    ));
                                }
                                Decl::Var(var) => {
                                    let ids = collect_idents_in_var_decls(&var.decls);
                                    for id in ids {
                                        export_map.push((id, Atom::default(), Atom::default()));
                                    }
                                }
                                _ => {}
                            }
                        }
                        _ => {
                            if !self.wildcard {
                                // Other expressions are not allowed in barrel files.
                                is_barrel = false;
                                break;
                            }
                        }
                    }
                }
                ModuleItem::Stmt(stmt) => match stmt {
                    Stmt::Expr(expr) => match &*expr.expr {
                        Expr::Lit(l) => {
                            if let Lit::Str(s) = l {
                                if allowed_directives && s.value.starts_with("use ") {
                                    directives.push(s.value.to_string());
                                }
                            } else {
                                allowed_directives = false;
                            }
                        }
                        _ => {
                            allowed_directives = false;
                            if !self.wildcard {
                                is_barrel = false;
                                break;
                            }
                        }
                    },
                    _ => {
                        allowed_directives = false;
                        if !self.wildcard {
                            is_barrel = false;
                            break;
                        }
                    }
                },
            }
        }

        // If the file is not a barrel file, we export nothing.
        if !is_barrel {
            new_items = vec![];
        } else {
            // Otherwise we export the meta information.
            new_items.push(ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                span: DUMMY_SP,
                decl: Decl::Var(Box::new(VarDecl {
                    span: DUMMY_SP,
                    kind: VarDeclKind::Const,
                    decls: vec![VarDeclarator {
                        span: DUMMY_SP,
                        name: Pat::Ident(BindingIdent {
                            id: private_ident!("__next_private_export_map__"),
                            type_ann: None,
                        }),
                        init: Some(Box::new(Expr::Lit(Lit::Str(Str {
                            span: DUMMY_SP,
                            value: serde_json::to_string(&export_map).unwrap().into(),
                            raw: None,
                        })))),
                        definite: false,
                    }],
                    ..Default::default()
                })),
            })));

            // Push "export *" statements for each wildcard export.
            for src in export_wildcards {
                new_items.push(ModuleItem::ModuleDecl(ModuleDecl::ExportAll(ExportAll {
                    span: DUMMY_SP,
                    src: Box::new(Str {
                        span: DUMMY_SP,
                        value: format!("__barrel_optimize__?names=__PLACEHOLDER__!=!{src}").into(),
                        raw: None,
                    }),
                    with: None,
                    type_only: false,
                })));
            }

            // Push directives.
            if !directives.is_empty() {
                new_items.push(ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                    span: DUMMY_SP,
                    decl: Decl::Var(Box::new(VarDecl {
                        span: DUMMY_SP,
                        kind: VarDeclKind::Const,
                        decls: vec![VarDeclarator {
                            span: DUMMY_SP,
                            name: Pat::Ident(BindingIdent {
                                id: private_ident!("__next_private_directive_list__"),
                                type_ann: None,
                            }),
                            init: Some(Box::new(Expr::Lit(Lit::Str(Str {
                                span: DUMMY_SP,
                                value: serde_json::to_string(&directives).unwrap().into(),
                                raw: None,
                            })))),
                            definite: false,
                        }],
                        ..Default::default()
                    })),
                })));
            }
        }

        new_items
    }
}

fn collect_idents_in_array_pat(elems: &[Option<Pat>]) -> Vec<Atom> {
    let mut ids = Vec::new();

    for elem in elems.iter().flatten() {
        match elem {
            Pat::Ident(ident) => {
                ids.push(ident.sym.clone());
            }
            Pat::Array(array) => {
                ids.extend(collect_idents_in_array_pat(&array.elems));
            }
            Pat::Object(object) => {
                ids.extend(collect_idents_in_object_pat(&object.props));
            }
            Pat::Rest(rest) => {
                if let Pat::Ident(ident) = &*rest.arg {
                    ids.push(ident.sym.clone());
                }
            }
            _ => {}
        }
    }

    ids
}

fn collect_idents_in_object_pat(props: &[ObjectPatProp]) -> Vec<Atom> {
    let mut ids = Vec::new();

    for prop in props {
        match prop {
            ObjectPatProp::KeyValue(KeyValuePatProp { key, value }) => {
                if let PropName::Ident(ident) = key {
                    ids.push(ident.sym.clone());
                }

                match &**value {
                    Pat::Ident(ident) => {
                        ids.push(ident.sym.clone());
                    }
                    Pat::Array(array) => {
                        ids.extend(collect_idents_in_array_pat(&array.elems));
                    }
                    Pat::Object(object) => {
                        ids.extend(collect_idents_in_object_pat(&object.props));
                    }
                    _ => {}
                }
            }
            ObjectPatProp::Assign(AssignPatProp { key, .. }) => {
                ids.push(key.sym.clone());
            }
            ObjectPatProp::Rest(RestPat { arg, .. }) => {
                if let Pat::Ident(ident) = &**arg {
                    ids.push(ident.sym.clone());
                }
            }
        }
    }

    ids
}

fn collect_idents_in_var_decls(decls: &[VarDeclarator]) -> Vec<Atom> {
    let mut ids = Vec::new();

    for decl in decls {
        match &decl.name {
            Pat::Ident(ident) => {
                ids.push(ident.sym.clone());
            }
            Pat::Array(array) => {
                ids.extend(collect_idents_in_array_pat(&array.elems));
            }
            Pat::Object(object) => {
                ids.extend(collect_idents_in_object_pat(&object.props));
            }
            _ => {}
        }
    }

    ids
}
