use std::{collections::BTreeSet, str::FromStr};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, OperationValue, ResolvedVc, TaskInput, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::{
    WebpackLoaderBuiltinConditionSet, WebpackLoaderBuiltinConditionSetMatch, WebpackLoadersOptions,
};
use turbopack_core::{
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    resolve::{ExternalTraced, ExternalType, options::ImportMapping},
};

use crate::{
    next_config::NextConfig,
    next_shared::webpack_rules::{
        babel::{detect_likely_babel_loader, get_babel_loader_rules},
        sass::{detect_likely_sass_loader, get_sass_loader_rules},
    },
};

pub(crate) mod babel;
pub(crate) mod sass;

/// Built-in conditions provided by the Next.js Turbopack integration for configuring webpack
/// loaders. These can be used in the `next.config.js` `turbopack.rules` section.
///
/// These are different from than the user-configurable "conditions" field.
//
// Note: If you add a field here, make sure to also add it in:
// - The typescript definition in `packages/next/src/server/config-shared.ts`
// - The zod schema in `packages/next/src/server/config-schema.ts`
//
// Note: Sets of conditions could be stored more efficiently as a bitset, but it's probably not used
// in enough places for it to matter.
#[derive(
    Copy,
    Clone,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Deserialize,
    Serialize,
    TaskInput,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum WebpackLoaderBuiltinCondition {
    /// Treated as always-present.
    Default,
    /// Client-side code.
    Browser,
    /// Code in `node_modules` that should typically not be modified by webpack loaders.
    Foreign,

    // These are provided by NextMode:
    Development,
    Production,

    // These are provided by NextRuntime:
    /// Server code on the Node.js runtime.
    Node,
    /// Server code on the edge runtime.
    EdgeLight,
}

impl WebpackLoaderBuiltinCondition {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Browser => "browser",
            Self::Foreign => "foreign",
            Self::Development => "development",
            Self::Production => "production",
            Self::Node => "node",
            Self::EdgeLight => "edge-light",
        }
    }
}

impl FromStr for WebpackLoaderBuiltinCondition {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "default" => Ok(Self::Default),
            "browser" => Ok(Self::Browser),
            "foreign" => Ok(Self::Foreign),
            "development" => Ok(Self::Development),
            "production" => Ok(Self::Production),
            "node" => Ok(Self::Node),
            "edge-light" => Ok(Self::EdgeLight),
            _ => Err(()),
        }
    }
}

impl PartialEq<WebpackLoaderBuiltinCondition> for &str {
    fn eq(&self, other: &WebpackLoaderBuiltinCondition) -> bool {
        *self == other.as_str()
    }
}

#[turbo_tasks::value]
struct NextWebpackLoaderBuiltinConditionSet(BTreeSet<WebpackLoaderBuiltinCondition>);

#[turbo_tasks::value_impl]
impl NextWebpackLoaderBuiltinConditionSet {
    #[turbo_tasks::function]
    fn new(
        conditions: BTreeSet<WebpackLoaderBuiltinCondition>,
    ) -> Vc<Box<dyn WebpackLoaderBuiltinConditionSet>> {
        Vc::upcast::<Box<dyn WebpackLoaderBuiltinConditionSet>>(
            NextWebpackLoaderBuiltinConditionSet(conditions).cell(),
        )
    }
}

#[turbo_tasks::value_impl]
impl WebpackLoaderBuiltinConditionSet for NextWebpackLoaderBuiltinConditionSet {
    fn match_condition(&self, condition: &str) -> WebpackLoaderBuiltinConditionSetMatch {
        match WebpackLoaderBuiltinCondition::from_str(condition) {
            Ok(cond) => {
                if self.0.contains(&cond) {
                    WebpackLoaderBuiltinConditionSetMatch::Matched
                } else {
                    WebpackLoaderBuiltinConditionSetMatch::Unmatched
                }
            }
            Err(_) => WebpackLoaderBuiltinConditionSetMatch::Invalid,
        }
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionWebpackLoadersOptions(Option<ResolvedVc<WebpackLoadersOptions>>);

#[turbo_tasks::function]
pub async fn webpack_loader_options(
    project_path: FileSystemPath,
    next_config: Vc<NextConfig>,
    builtin_conditions: BTreeSet<WebpackLoaderBuiltinCondition>,
) -> Result<Vc<OptionWebpackLoadersOptions>> {
    let mut rules = next_config
        .webpack_rules(project_path.clone())
        .owned()
        .await?;

    let config_file_path = async || project_path.join(&next_config.await?.config_file_name);

    let use_builtin_sass = next_config
        .experimental_turbopack_use_builtin_sass()
        .await?;
    if use_builtin_sass.unwrap_or(true) {
        if use_builtin_sass.is_none()
            && let Some(glob) = detect_likely_sass_loader(&rules).await?
        {
            ManuallyConfiguredBuiltinLoaderIssue {
                glob,
                loader: rcstr!("sass-loader"),
                config_key: rcstr!("experimental.turbopackUseBuiltinSass"),
                config_file_path: config_file_path().await?,
            }
            .resolved_cell()
            .emit()
        }
        rules.append(&mut get_sass_loader_rules(next_config.sass_config()).await?);
    }

    // TODO: Enable this warning after babel configuration is fixed
    // (https://github.com/vercel/next.js/pull/82676) and the react-compiler logic is moved into
    // here. React-compiler is currently configured in JS before it gets to us, which could trigger
    // false-positives.
    let use_builtin_babel = next_config
        .experimental_turbopack_use_builtin_babel()
        .await?;
    if !builtin_conditions.contains(&WebpackLoaderBuiltinCondition::Foreign)
        && use_builtin_babel.unwrap_or(true)
    {
        if use_builtin_babel.is_none()
            && let Some(glob) = detect_likely_babel_loader(&rules).await?
        {
            let _ = glob;
            // TODO: Enable this warning after babel configuration is fixed
            // (https://github.com/vercel/next.js/pull/82676) and the react-compiler logic is moved into
            // here. React-compiler is currently configured in JS before it gets to us, which could
            // trigger false-positives.
            /*
            ManuallyConfiguredBuiltinLoaderIssue {
                glob,
                loader: rcstr!("babel-loader"),
                disable_builtin_config_key: rcstr!("experimental.turbopackUseBuiltinBabel"),
                config_file_path: config_file_path().await?,
            }
            .resolved_cell()
            .emit()
            */
        }
        rules.append(&mut get_babel_loader_rules(project_path.clone()).await?);
    }

    if rules.is_empty() {
        return Ok(Vc::cell(None));
    }

    let conditions = next_config.webpack_conditions().to_resolved().await?;
    Ok(Vc::cell(Some(
        WebpackLoadersOptions {
            rules: ResolvedVc::cell(rules),
            conditions,
            loader_runner_package: Some(loader_runner_package_mapping().to_resolved().await?),
            builtin_conditions: NextWebpackLoaderBuiltinConditionSet::new(builtin_conditions)
                .to_resolved()
                .await?,
        }
        .resolved_cell(),
    )))
}

#[turbo_tasks::function]
fn loader_runner_package_mapping() -> Result<Vc<ImportMapping>> {
    Ok(ImportMapping::Alternatives(vec![
        ImportMapping::External(
            Some(rcstr!("next/dist/compiled/loader-runner")),
            ExternalType::CommonJs,
            ExternalTraced::Untraced,
        )
        .resolved_cell(),
    ])
    .cell())
}

#[turbo_tasks::value]
struct ManuallyConfiguredBuiltinLoaderIssue {
    glob: RcStr,
    loader: RcStr,
    config_key: RcStr,
    config_file_path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl Issue for ManuallyConfiguredBuiltinLoaderIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.config_file_path.clone().cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Config.cell()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Line(vec![
            StyledString::Text(rcstr!("Identified a likely manual configuration of ")),
            StyledString::Code(self.loader.clone()),
            StyledString::Text(rcstr!(" for paths matching ")),
            StyledString::Code(self.glob.clone()),
        ])
        .cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Stack(vec![
                StyledString::Text(rcstr!(
                    "Next.js includes a built-in version of this loader that is configured \
                     automatically. You may not need to configure this."
                )),
                StyledString::Line(vec![
                    StyledString::Text(rcstr!("You can silence this warning by setting ")),
                    StyledString::Code(self.config_key.clone()),
                    StyledString::Text(rcstr!(" in ")),
                    StyledString::Text(self.config_file_path.path.clone()),
                    StyledString::Text(rcstr!(" to ")),
                    StyledString::Code(rcstr!("true")),
                    StyledString::Text(rcstr!(" (to silence this warning) or ")),
                    StyledString::Code(rcstr!("false")),
                    StyledString::Text(rcstr!(" (to disable the default built-in loader)")),
                ]),
            ])
            .resolved_cell(),
        ))
    }
}
