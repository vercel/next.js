use anyhow::Result;
use turbo_tasks::{Value, Vc};
use turbopack_binding::{
    turbo::tasks_fs::{FileSystemEntryType, FileSystemPath},
    turbopack::{
        core::{
            issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
            reference_type::{CommonJsReferenceSubType, ReferenceType},
            resolve::{parse::Request, pattern::Pattern, resolve},
        },
        node::transforms::webpack::WebpackLoaderItem,
        turbopack::{
            module_options::{LoaderRuleItem, OptionWebpackRules, WebpackRules},
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
    project_root: Vc<FileSystemPath>,
    webpack_rules: Option<Vc<WebpackRules>>,
) -> Result<Vc<OptionWebpackRules>> {
    let has_babel_config = {
        let mut has_babel_config = false;
        for filename in BABEL_CONFIG_FILES {
            let filetype = *project_root.join(filename.to_string()).get_type().await?;
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
                        title: StyledString::Text(
                            "Unable to resolve babel-loader, but a babel config is present"
                                .to_owned(),
                        )
                        .cell(),
                        description: StyledString::Text(
                            "Make sure babel-loader is installed via your package manager."
                                .to_owned(),
                        )
                        .cell(),
                        severity: IssueSeverity::Fatal.cell(),
                    }
                    .cell()
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
                    rule.loaders = Vc::cell(loaders);
                } else {
                    rules.insert(
                        pattern.to_string(),
                        LoaderRuleItem {
                            loaders: Vc::cell(vec![loader]),
                            rename_as: Some("*".to_string()),
                        },
                    );
                }
                has_changed = true;
            }
        }

        if has_changed {
            return Ok(Vc::cell(Some(Vc::cell(rules))));
        }
    }
    Ok(Vc::cell(webpack_rules))
}

#[turbo_tasks::function]
pub async fn is_babel_loader_available(project_path: Vc<FileSystemPath>) -> Result<Vc<bool>> {
    let result = resolve(
        project_path,
        Value::new(ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined)),
        Request::parse(Value::new(Pattern::Constant(
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
    let assets = result.primary_sources().await?;
    Ok(Vc::cell(!assets.is_empty()))
}

#[turbo_tasks::value]
struct BabelIssue {
    path: Vc<FileSystemPath>,
    title: Vc<StyledString>,
    description: Vc<StyledString>,
    severity: Vc<IssueSeverity>,
}

#[turbo_tasks::value_impl]
impl Issue for BabelIssue {
    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Transform.into()
    }

    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        self.severity
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.path
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        self.title
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.description))
    }
}
