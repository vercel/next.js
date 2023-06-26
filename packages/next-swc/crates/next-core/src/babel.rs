use anyhow::Result;
use turbo_tasks::{
    primitives::{BoolVc, StringVc},
    Value,
};
use turbopack_binding::{
    turbo::tasks_fs::{FileSystemEntryType, FileSystemPathVc},
    turbopack::{
        core::{
            issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc},
            resolve::{parse::RequestVc, pattern::Pattern, resolve},
        },
        node::transforms::webpack::{WebpackLoaderItem, WebpackLoaderItemsVc},
        turbopack::{
            module_options::{LoaderRuleItem, OptionWebpackRulesVc, WebpackRulesVc},
            resolve_options,
            resolve_options_context::ResolveOptionsContext,
        },
    },
};

const BABEL_CONFIG_FILES: &[&str] = &[
    ".babelrc",
    ".babelrc.json",
    ".babelrc.js",
    ".babelrc.mjs",
    ".babelrc.cjs",
    "babel.config.js",
    "babel.config.json",
    "babel.config.mjs",
    "babel.config.cjs",
];

/// If the user has a babel configuration file (see list above) alongside their
/// `next.config.js` configuration, automatically add `babel-loader` as a
/// webpack loader for each eligible file type if it doesn't already exist.
#[turbo_tasks::function]
pub async fn maybe_add_babel_loader(
    project_root: FileSystemPathVc,
    webpack_rules: Option<WebpackRulesVc>,
) -> Result<OptionWebpackRulesVc> {
    let has_babel_config = {
        let mut has_babel_config = false;
        for filename in BABEL_CONFIG_FILES {
            let filetype = *project_root.join(filename).get_type().await?;
            if matches!(filetype, FileSystemEntryType::File) {
                has_babel_config = true;
                break;
            }
        }
        has_babel_config
    };

    if has_babel_config {
        let mut rules = if let Some(webpack_rules) = webpack_rules {
            webpack_rules.await?.clone_value()
        } else {
            Default::default()
        };
        let mut has_emitted_babel_resolve_issue = false;
        let mut has_changed = false;
        for pattern in ["*.js", "*.jsx", "*.ts", "*.tsx", "*.cjs", "*.mjs"] {
            let rule = rules.get_mut(pattern);
            let has_babel_loader = if let Some(rule) = rule.as_ref() {
                rule.loaders
                    .await?
                    .iter()
                    .any(|c| c.loader == "babel-loader")
            } else {
                false
            };

            if !has_babel_loader {
                if !has_emitted_babel_resolve_issue
                    && !*is_babel_loader_available(project_root).await?
                {
                    BabelIssue {
                        path: project_root,
                        title: StringVc::cell(
                            "Unable to resolve babel-loader, but a babel config is present"
                                .to_owned(),
                        ),
                        description: StringVc::cell(
                            "Make sure babel-loader is installed via your package manager."
                                .to_owned(),
                        ),
                        severity: IssueSeverity::Fatal.cell(),
                    }
                    .cell()
                    .as_issue()
                    .emit();

                    has_emitted_babel_resolve_issue = true;
                }

                let loader = WebpackLoaderItem {
                    loader: "babel-loader".to_string(),
                    options: Default::default(),
                };
                if let Some(rule) = rule {
                    let mut loaders = rule.loaders.await?.clone_value();
                    loaders.push(loader);
                    rule.loaders = WebpackLoaderItemsVc::cell(loaders);
                } else {
                    rules.insert(
                        pattern.to_string(),
                        LoaderRuleItem {
                            loaders: WebpackLoaderItemsVc::cell(vec![loader]),
                            rename_as: Some("*".to_string()),
                        },
                    );
                }
                has_changed = true;
            }
        }

        if has_changed {
            return Ok(OptionWebpackRulesVc::cell(Some(WebpackRulesVc::cell(
                rules,
            ))));
        }
    }
    Ok(OptionWebpackRulesVc::cell(webpack_rules))
}

#[turbo_tasks::function]
pub async fn is_babel_loader_available(project_path: FileSystemPathVc) -> Result<BoolVc> {
    let result = resolve(
        project_path,
        RequestVc::parse(Value::new(Pattern::Constant(
            "babel-loader/package.json".to_string(),
        ))),
        resolve_options(
            project_path,
            ResolveOptionsContext {
                enable_node_modules: Some(project_path.root().resolve().await?),
                enable_node_native_modules: true,
                custom_conditions: vec!["development".to_string()],
                ..Default::default()
            }
            .cell(),
        ),
    );
    let assets = result.primary_assets().await?;
    Ok(BoolVc::cell(!assets.is_empty()))
}

#[turbo_tasks::value]
struct BabelIssue {
    path: FileSystemPathVc,
    title: StringVc,
    description: StringVc,
    severity: IssueSeverityVc,
}

#[turbo_tasks::value_impl]
impl Issue for BabelIssue {
    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("other".to_string())
    }

    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        self.severity
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        self.title
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.description
    }
}
