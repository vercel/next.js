use std::fmt::format;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use pathdiff::diff_paths;
use serde::Deserialize;
use swc_atoms::{js_word, JsWord};
use swc_common::collections::AHashSet;
use swc_common::FileName::Real;
use swc_common::{FileName, SourceFile, Span, DUMMY_SP};
use swc_ecmascript::ast::*;
use swc_ecmascript::utils::ident::IdentLike;
use swc_ecmascript::utils::Id;
use swc_ecmascript::visit::{noop_fold_type, Fold, FoldWith};

#[derive(Clone, Debug, Deserialize)]
pub enum RelayLanguageConfig {
    TypeScript,
    Flow,
    JavaScript,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Config {
    pub artifact_directory: Option<PathBuf>,
    pub language: RelayLanguageConfig,
}

impl Config {
    fn default() -> Self {
        Self {
            artifact_directory: None,
            language: RelayLanguageConfig::JavaScript,
        }
    }

    fn file_extension(&mut self) -> &'static str {
        match self.language {
            RelayLanguageConfig::TypeScript => "ts",
            RelayLanguageConfig::Flow => "js",
            RelayLanguageConfig::JavaScript => "js",
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct Options {
    #[serde(default)]
    pub exclude: Vec<JsWord>,
}

struct Relay {
    config: Config,
    file_name: FileName,
}

fn pull_first_operation_name_from_tpl(tpl: TaggedTpl) -> Option<String> {
    tpl.tpl
        .quasis
        .into_iter()
        .filter_map(|quasis| {
            let template_string_content = String::from(quasis.raw.value.to_string());
            let split_content = template_string_content.split(" ").collect::<Vec<&str>>();

            let operation = split_content
                .chunks(2)
                .filter_map(|slice| {
                    if slice.len() == 1 {
                        return None;
                    }

                    let word = slice[0];
                    let next_word = slice[1];

                    if word == "query" {
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
    noop_fold_type!();

    fn fold_expr(&mut self, n: Expr) -> Expr {
        if let Expr::TaggedTpl(tpl) = n.clone() {
            let operation_name = pull_first_operation_name_from_tpl(tpl);

            if let (Some(operation_name), Real(source_path_buf)) =
                (operation_name, self.file_name.clone())
            {
                let path_to_source_dir = source_path_buf.parent().unwrap();
                let generated_file_name = format!(
                    "{}.graphql.{}",
                    operation_name,
                    self.config.file_extension().clone()
                );

                let fully_qualified_require_path = match self.config.artifact_directory.clone() {
                    Some(artifact_directory) => std::env::current_dir()
                        .unwrap()
                        .join(artifact_directory)
                        .join(generated_file_name),
                    _ => path_to_source_dir
                        .clone()
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

                return build_require_expr_from_path(require_path);
            }
        }

        n
    }
}

pub fn relay(config: Config, file_name: FileName) -> impl Fold {
    println!("NOW IM HERE THO");
    Relay { config, file_name }
}
