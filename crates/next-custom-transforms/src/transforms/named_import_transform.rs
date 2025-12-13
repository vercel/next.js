use std::collections::HashSet;

use serde::Deserialize;
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::*,
        visit::{visit_mut_pass, VisitMut},
    },
};

#[derive(Clone, Debug, Deserialize)]
pub struct Config {
    pub packages: Vec<String>,
}

pub fn named_import_transform(config: Config) -> impl Pass + VisitMut {
    visit_mut_pass(NamedImportTransform {
        packages: config.packages,
    })
}

#[derive(Debug, Default)]
struct NamedImportTransform {
    packages: Vec<String>,
}

impl VisitMut for NamedImportTransform {
    fn visit_mut_import_decl(&mut self, decl: &mut ImportDecl) {
        // Match named imports and check if it's included in the packages
        let src_value = &decl.src.value;

        if self
            .packages
            .iter()
            .any(|p| src_value.as_str() == Some(&**p))
        {
            let mut specifier_names = HashSet::new();

            // Skip the transform if the default or namespace import is present
            let mut skip_transform = false;

            for specifier in &decl.specifiers {
                match specifier {
                    ImportSpecifier::Named(specifier) => {
                        // Add the import name as string to the set
                        specifier_names.insert(specifier.imported.as_ref().map_or_else(
                            || specifier.local.sym.clone(),
                            |i| i.atom().into_owned(),
                        ));
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
                let mut names = specifier_names
                    .iter()
                    .map(|n| n.as_str())
                    .collect::<Vec<_>>();
                // Sort the names to make sure the order is consistent
                names.sort();

                let new_src = format!(
                    "__barrel_optimize__?names={}!=!{}",
                    names.join(","),
                    src_value.to_string_lossy()
                );

                *decl.src = Str {
                    span: DUMMY_SP,
                    value: new_src.into(),
                    raw: None,
                };
            }
        }
    }
}
