use relay_compiler_common::SourceLocationKey;
use relay_compiler_intern::string_key::StringKey;
use std::borrow::Borrow;
use std::path::PathBuf;
use std::str::FromStr;

use relay_compiler::{create_path_for_artifact, ProjectConfig};
use serde::Deserialize;
use swc_atoms::{js_word, JsWord};
use swc_common::{FileName, Span};
use swc_ecmascript::ast::*;
use swc_ecmascript::utils::{quote_ident, ExprFactory};
use swc_ecmascript::visit::{Fold, FoldWith};

#[derive(Copy, Clone, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RelayLanguageConfig {
    Typescript,
    Flow,
}

struct Relay {
    file_name: FileName,
    relay_config_for_tests: Option<ProjectConfig>,
}

fn pull_first_operation_name_from_tpl(tpl: &TaggedTpl) -> Option<&str> {
    tpl.tpl
        .quasis
        .iter()
        .filter_map(|quasis| {
            let split_content = quasis.raw.value.split(" ").collect::<Vec<&str>>();

            let operation = split_content
                .chunks(2)
                .filter_map(|slice| {
                    if slice.len() == 1 {
                        return None;
                    }

                    let word = slice[0];
                    let next_word = slice[1];

                    if word == "query"
                        || word == "subscription"
                        || word == "mutation"
                        || word == "fragment"
                    {
                        return Some(next_word);
                    }

                    None
                })
                .next();

            return operation;
        })
        .next()
}

fn build_require_expr_from_path(path: String) -> Expr {
    Expr::Call(CallExpr {
        span: Default::default(),
        callee: quote_ident!("require").as_callee(),
        args: vec![Lit::Str(Str {
            span: Default::default(),
            value: JsWord::from(path),
            has_escape: false,
            kind: Default::default(),
        })
        .as_arg()],
        type_args: None,
    })
}

impl Fold for Relay {
    fn fold_expr(&mut self, expr: Expr) -> Expr {
        let expr = expr.fold_children_with(self);

        match &expr {
            Expr::TaggedTpl(tpl) => {
                if let Some(built_expr) = self.build_call_expr_from_tpl(tpl) {
                    built_expr
                } else {
                    expr
                }
            }
            _ => expr,
        }
    }
}

// This is copied from https://github.com/facebook/relay/blob/main/compiler/crates/relay-compiler/src/build_project/generate_artifacts.rs#L251
// until the Relay team exposes it for external use.
fn path_for_artifact(project_config: &ProjectConfig, definition_name: &str) -> PathBuf {
    let source_file_location_key = SourceLocationKey::Standalone {
        // TODO: Figure out why passing in the actual path here causes the requires to be an
        // absolute path.
        path: "NA".parse().unwrap(),
    };
    let filename = if let Some(filename_for_artifact) = &project_config.filename_for_artifact {
        filename_for_artifact(source_file_location_key, definition_name.parse().unwrap())
    } else {
        match &project_config.typegen_config.language {
            relay_config::TypegenLanguage::Flow => format!("{}.graphql.js", definition_name),
            relay_config::TypegenLanguage::TypeScript => format!("{}.graphql.ts", definition_name),
        }
    };
    create_path_for_artifact(project_config, source_file_location_key, filename)
}

impl Relay {
    fn build_require_path(&mut self, operation_name: &str) -> PathBuf {
        match &self.relay_config_for_tests {
            Some(config) => path_for_artifact(config, operation_name),
            _ => {
                let config =
                    relay_compiler::config::Config::search(&std::env::current_dir().unwrap())
                        .unwrap();

                let project_config = &config.projects[&StringKey::from_str("default").unwrap()];

                path_for_artifact(project_config, operation_name)
            }
        }
    }

    fn build_call_expr_from_tpl(&mut self, tpl: &TaggedTpl) -> Option<Expr> {
        if let Expr::Ident(ident) = &*tpl.tag {
            if &*ident.sym != "graphql" {
                return None;
            }
        }

        let operation_name = pull_first_operation_name_from_tpl(tpl);

        if let Some(operation_name) = operation_name {
            let final_path = self.build_require_path(operation_name);

            return Some(build_require_expr_from_path(
                final_path.display().to_string(),
            ));
        }

        None
    }
}

pub fn relay(file_name: FileName) -> impl Fold {
    Relay {
        file_name,
        relay_config_for_tests: None,
    }
}

pub fn test_relay(file_name: FileName, relay_config_for_tests: ProjectConfig) -> impl Fold {
    Relay {
        file_name,
        relay_config_for_tests: Some(relay_config_for_tests),
    }
}
