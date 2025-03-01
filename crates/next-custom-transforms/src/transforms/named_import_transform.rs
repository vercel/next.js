use std::collections::HashSet;

use serde::Deserialize;
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::*,
        visit::{fold_pass, Fold},
    },
};

#[derive(Clone, Debug, Deserialize)]
pub struct Config {
    pub packages: Vec<String>,
}

pub fn named_import_transform(config: Config) -> impl Pass {
    fold_pass(NamedImportTransform {
        packages: config.packages,
    })
}

#[derive(Debug, Default)]
struct NamedImportTransform {
    packages: Vec<String>,
}

/// TODO: Implement this as a [Pass] instead of a full visitor ([Fold])
impl Fold for NamedImportTransform {
    fn fold_import_decl(&mut self, decl: ImportDecl) -> ImportDecl {
        // Match named imports and check if it's included in the packages
        let src_value = decl.src.value.clone();

        if self.packages.iter().any(|p| src_value == *p) {
            let mut specifier_names = HashSet::new();

            // Skip the transform if the default or namespace import is present
            let mut skip_transform = false;

            for specifier in &decl.specifiers {
                match specifier {
                    ImportSpecifier::Named(specifier) => {
                        // Add the import name as string to the set
                        if let Some(imported) = &specifier.imported {
                            match imported {
                                ModuleExportName::Ident(ident) => {
                                    specifier_names.insert(ident.sym.to_string());
                                }
                                ModuleExportName::Str(str_) => {
                                    specifier_names.insert(str_.value.to_string());
                                }
                            }
                        } else {
                            specifier_names.insert(specifier.local.sym.to_string());
                        }
                    }
                    ImportSpecifier::Default(_) => {
                        skip_transform = true;
                        break;
                    }
                    ImportSpecifier::Namespace(_) => {
                        skip_transform = true;
                        break;
                    }
                }
            }

            if !skip_transform {
                let mut names = specifier_names.into_iter().collect::<Vec<_>>();
                // Sort the names to make sure the order is consistent
                names.sort();

                let new_src = format!(
                    "__barrel_optimize__?names={}!=!{}",
                    names.join(","),
                    src_value
                );

                // Create a new import declaration, keep everything the same except the source
                let mut new_decl = decl.clone();
                new_decl.src = Box::new(Str {
                    span: DUMMY_SP,
                    value: new_src.into(),
                    raw: None,
                });

                return new_decl;
            }
        }

        decl
    }
}
