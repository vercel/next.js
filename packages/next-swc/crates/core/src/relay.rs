use once_cell::sync::Lazy;
use pathdiff::diff_paths;
use regex::Regex;
use relay_compiler::compiler_state::{SourceSet, SourceSetName};
use relay_compiler::{create_path_for_artifact, FileCategorizer, FileGroup, ProjectConfig};
use relay_compiler_common::SourceLocationKey;
use serde::Deserialize;
use std::borrow::Cow;
use std::path::{Path, PathBuf};
use swc_atoms::JsWord;
use swc_common::errors::HANDLER;
use swc_common::FileName;
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

fn pull_first_operation_name_from_tpl(tpl: &TaggedTpl) -> Option<String> {
    tpl.tpl.quasis.iter().find_map(|quasis| {
        static OPERATION_REGEX: Lazy<Regex> =
            Lazy::new(|| Regex::new(r"(fragment|mutation|query|subscription) (\w+)").unwrap());

        let capture_group = OPERATION_REGEX.captures_iter(&quasis.raw.value).next();

        match capture_group {
            None => None,
            Some(capture_group) => Some(capture_group[2].to_string()),
        }
    })
}

fn build_require_expr_from_path(path: &str) -> Expr {
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

#[derive(Debug)]
enum BuildRequirePathError<'a> {
    FileNameNotReal,
    MultipleSourceSetsFound {
        source_set_names: Vec<SourceSetName>,
        path: &'a PathBuf,
    },
    ProjectNotFoundForSourceSet {
        source_set_name: SourceSetName,
    },
    FileNotASourceFile,
    CouldNotCategorize {
        err: Cow<'static, str>,
        path: String,
    },
}

// This is copied from https://github.com/facebook/relay/blob/main/compiler/crates/relay-compiler/src/build_project/generate_artifacts.rs#L251
// until the Relay team exposes it for external use.
fn path_for_artifact(
    root_dir: &Path,
    source_path: &Path,
    project_config: &ProjectConfig,
    definition_name: &str,
) -> PathBuf {
    let source_file_location_key = SourceLocationKey::Standalone {
        path: source_path.to_str().unwrap().parse().unwrap(),
    };
    let filename = if let Some(filename_for_artifact) = &project_config.filename_for_artifact {
        filename_for_artifact(source_file_location_key, definition_name.parse().unwrap())
    } else {
        match &project_config.typegen_config.language {
            relay_config::TypegenLanguage::Flow => format!("{}.graphql.js", definition_name),
            relay_config::TypegenLanguage::TypeScript => {
                format!("{}.graphql.ts", definition_name)
            }
        }
    };

    let output_path = create_path_for_artifact(project_config, source_file_location_key, filename);

    if project_config.output.is_some() {
        let absolute_output_path = root_dir.join(&output_path);

        let diffed_path =
            diff_paths(&absolute_output_path, &source_path.parent().unwrap()).unwrap();

        return diffed_path;
    }

    output_path
}
impl Relay {
    fn build_require_path(
        &mut self,
        operation_name: &str,
    ) -> Result<PathBuf, BuildRequirePathError> {
        match &self.relay_config_for_tests {
            Some(config) => match &self.file_name {
                FileName::Real(real_file_path) => Ok(path_for_artifact(
                    &std::env::current_dir().unwrap(),
                    &real_file_path,
                    config,
                    operation_name,
                )),
                _ => Err(BuildRequirePathError::FileNameNotReal),
            },
            _ => {
                let config =
                    relay_compiler::config::Config::search(&std::env::current_dir().unwrap())
                        .unwrap();

                let categorizer = FileCategorizer::from_config(&config);

                match &self.file_name {
                    FileName::Real(real_file_name) => {
                        // Make sure we have a path which is relative to the config.
                        // Otherwise, categorize won't be able to recognize that
                        // the absolute source path is a child of a source set.
                        let diffed_path = diff_paths(real_file_name, &config.root_dir).unwrap();

                        let group = categorizer.categorize(diffed_path.as_path());

                        match group {
                            Ok(group) => match group {
                                FileGroup::Source { source_set } => match source_set {
                                    SourceSet::SourceSetName(source_set_name) => {
                                        let project_config: Option<&ProjectConfig> =
                                            config.projects.get(&source_set_name);

                                        match project_config {
                                            None => Err(BuildRequirePathError::ProjectNotFoundForSourceSet { source_set_name }),
                                            Some(project_config) => {
                                                Ok(path_for_artifact(&config.root_dir,real_file_name, &project_config, operation_name))
                                            }
                                        }
                                    }
                                    SourceSet::SourceSetNames(source_set_names) => {
                                        Err(BuildRequirePathError::MultipleSourceSetsFound {
                                            source_set_names,
                                            path: real_file_name,
                                        })
                                    }
                                },
                                _ => Err(BuildRequirePathError::FileNotASourceFile),
                            },
                            Err(err) => Err(BuildRequirePathError::CouldNotCategorize {
                                err,
                                path: real_file_name.display().to_string(),
                            }),
                        }
                    }
                    _ => Err(BuildRequirePathError::FileNameNotReal),
                }
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

        match operation_name {
            None => None,
            Some(operation_name) => match self.build_require_path(operation_name.as_str()) {
                Ok(final_path) => Some(build_require_expr_from_path(final_path.to_str().unwrap())),
                Err(err) => {
                    let base_error = "Could not transform GraphQL template to a Relay import.";
                    let error_message = match err {
                        BuildRequirePathError::FileNameNotReal => "Source file was not a real \
                                                                   file. This is likely a bug and \
                                                                   should be reported to Next.js"
                            .to_string(),
                        BuildRequirePathError::MultipleSourceSetsFound {
                            source_set_names,
                            path,
                        } => {
                            format!(
                                "Multiple source sets were found for file: {}. Found source sets: \
                                 [{}]. We could not determine the project config to use for the \
                                 source file. Please consider narrowing down your source sets.",
                                path.to_str().unwrap(),
                                source_set_names
                                    .iter()
                                    .map(|name| name.lookup())
                                    .collect::<Vec<&str>>()
                                    .join(", ")
                            )
                        }
                        BuildRequirePathError::ProjectNotFoundForSourceSet { source_set_name } => {
                            format!(
                                "Project could not be found for the source set: {}",
                                source_set_name
                            )
                        }
                        BuildRequirePathError::FileNotASourceFile => {
                            "This file was not considered a source file by the Relay Compiler. \
                             This is likely a bug and should be reported to Next.JS"
                                .to_string()
                        }
                        BuildRequirePathError::CouldNotCategorize { path, err } => {
                            format!(
                                "Relay was unable to categorize the file at: {}. The underlying \
                                 error is: {}. \nThis is likely a bug and should be reported to \
                                 Next.JS",
                                path, err
                            )
                        }
                    };

                    HANDLER.with(|handler| {
                        handler.span_err(
                            tpl.span,
                            format!("{} {}", base_error, error_message).as_str(),
                        );
                    });

                    None
                }
            },
        }
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
