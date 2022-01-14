use std::borrow::Borrow;
use std::path::PathBuf;

use pathdiff::diff_paths;
use serde::Deserialize;
use swc_atoms::{js_word, JsWord};
use swc_common::FileName::Real;
use swc_common::{FileName, Span};
use swc_ecmascript::ast::*;
use swc_ecmascript::visit::{Fold, FoldWith};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RelayLanguageConfig {
    Typescript,
    Flow,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Config {
    pub artifact_directory: Option<PathBuf>,
    pub language: RelayLanguageConfig,
}

impl Config {
    fn file_extension(&mut self) -> &'static str {
        match self.language {
            RelayLanguageConfig::Typescript => "ts",
            RelayLanguageConfig::Flow => "js",
        }
    }
}

struct Relay {
    config: Config,
    file_name: FileName,
}

fn pull_first_operation_name_from_tpl(tpl: &TaggedTpl) -> Option<String> {
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

                    if word == "query" || word == "subscription" || word == "mutation" {
                        return Some(String::from(next_word));
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
        callee: ExprOrSuper::Expr(Box::new(Expr::Ident(Ident::new(
            js_word!("require"),
            Span::default(),
        )))),
        args: vec![ExprOrSpread {
            spread: None,
            expr: Box::new(Expr::Lit(Lit::Str(Str {
                span: Default::default(),
                value: JsWord::from(path),
                has_escape: false,
                kind: Default::default(),
            }))),
        }],
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

impl Relay {
    fn build_call_expr_from_tpl(&mut self, tpl: &TaggedTpl) -> Option<Expr> {
        if let Expr::Ident(ident) = tpl.tag.borrow() {
            if ident.sym.borrow() != "graphql" {
                return None;
            }
        }

        let operation_name = pull_first_operation_name_from_tpl(tpl);

        if let (Some(operation_name), Real(source_path_buf)) =
            (operation_name, self.file_name.borrow())
        {
            let path_to_source_dir = source_path_buf.parent().unwrap();
            let generated_file_name = format!(
                "{}.graphql.{}",
                operation_name,
                self.config.file_extension()
            );

            let fully_qualified_require_path = match &self.config.artifact_directory {
                Some(artifact_directory) => std::env::current_dir()
                    .unwrap()
                    .join(artifact_directory)
                    .join(generated_file_name),
                _ => path_to_source_dir
                    .join("__generated__")
                    .join(generated_file_name),
            };

            let mut require_path = String::from(
                diff_paths(fully_qualified_require_path, path_to_source_dir)
                    .unwrap()
                    .to_str()
                    .unwrap(),
            );

            if !require_path.starts_with(".") {
                require_path = format!("./{}", require_path);
            }

            return Some(build_require_expr_from_path(require_path));
        }

        None
    }
}

pub fn relay(config: Config, file_name: FileName) -> impl Fold {
    Relay { config, file_name }
}
