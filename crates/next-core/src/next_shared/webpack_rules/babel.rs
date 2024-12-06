use anyhow::Result;
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbo_tasks_fs::{self, FileSystemEntryType, FileSystemPath};
use turbopack::module_options::{LoaderRuleItem, OptionWebpackRules, WebpackRules};
use turbopack_core::{
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    reference_type::{CommonJsReferenceSubType, ReferenceType},
    resolve::{node::node_cjs_resolve_options, parse::Request, pattern::Pattern, resolve},
};
use turbopack_node::transforms::webpack::WebpackLoaderItem;

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
    webpack_rules: Option<ResolvedVc<WebpackRules>>,
) -> Result<Vc<OptionWebpackRules>> {
    let has_babel_config = {
        let mut has_babel_config = false;
        for &filename in BABEL_CONFIG_FILES {
            let filetype = *project_root.join(filename.into()).get_type().await?;
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
                        path: project_root.to_resolved().await?,
                        title: StyledString::Text(
                            "Unable to resolve babel-loader, but a babel config is present".into(),
                        )
                        .resolved_cell(),
                        description: StyledString::Text(
                            "Make sure babel-loader is installed via your package manager.".into(),
                        )
                        .resolved_cell(),
                        severity: IssueSeverity::Fatal.resolved_cell(),
                    }
                    .cell()
                    .emit();

                    has_emitted_babel_resolve_issue = true;
                }

                let loader = WebpackLoaderItem {
                    loader: "babel-loader".into(),
                    options: Default::default(),
                };
                if let Some(rule) = rule {
                    let mut loaders = rule.loaders.await?.clone_value();
                    loaders.push(loader);
                    rule.loaders = ResolvedVc::cell(loaders);
                } else {
                    rules.insert(
                        pattern.into(),
                        LoaderRuleItem {
                            loaders: ResolvedVc::cell(vec![loader]),
                            rename_as: Some("*".into()),
                        },
                    );
                }
                has_changed = true;
            }
        }

        if has_changed {
            return Ok(Vc::cell(Some(ResolvedVc::cell(rules))));
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
            "babel-loader/package.json".into(),
        ))),
        node_cjs_resolve_options(project_path),
    );
    let assets = result.primary_sources().await?;
    Ok(Vc::cell(!assets.is_empty()))
}

#[turbo_tasks::value]
struct BabelIssue {
    path: ResolvedVc<FileSystemPath>,
    title: ResolvedVc<StyledString>,
    description: ResolvedVc<StyledString>,
    severity: ResolvedVc<IssueSeverity>,
}

#[turbo_tasks::value_impl]
impl Issue for BabelIssue {
    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Transform.into()
    }

    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        *self.severity
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.path
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        *self.title
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.description))
    }
}
