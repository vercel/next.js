use std::{collections::BTreeSet, str::FromStr};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::rcstr;
use turbo_tasks::{NonLocalValue, ResolvedVc, TaskInput, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::WebpackLoadersOptions;
use turbopack_core::resolve::{ExternalTraced, ExternalType, options::ImportMapping};

use self::{babel::maybe_add_babel_loader, sass::maybe_add_sass_loader};
use crate::next_config::NextConfig;

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
    Serialize,
    Deserialize,
    TaskInput,
    TraceRawVcs,
    NonLocalValue,
)]
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
    fn as_str(self) -> &'static str {
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

pub async fn webpack_loader_options(
    project_path: FileSystemPath,
    next_config: Vc<NextConfig>,
    foreign: bool,
    loader_conditions: BTreeSet<WebpackLoaderBuiltinCondition>,
) -> Result<Option<ResolvedVc<WebpackLoadersOptions>>> {
    let rules = *next_config
        .webpack_rules(loader_conditions, project_path.clone())
        .await?;
    let rules = *maybe_add_sass_loader(next_config.sass_config(), rules.map(|v| *v)).await?;
    let rules = if foreign {
        rules
    } else {
        *maybe_add_babel_loader(project_path.clone(), rules.map(|v| *v)).await?
    };

    let conditions = next_config.webpack_conditions().to_resolved().await?;
    Ok(if let Some(rules) = rules {
        Some(
            WebpackLoadersOptions {
                rules,
                conditions,
                loader_runner_package: Some(loader_runner_package_mapping().to_resolved().await?),
            }
            .resolved_cell(),
        )
    } else {
        None
    })
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
