use std::sync::LazyLock;

use anyhow::{Context, Result};
use regex::Regex;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::{self, FileSystemEntryType, FileSystemPath, to_sys_path};
use turbopack::module_options::{ConditionItem, LoaderRuleItem};
use turbopack_node::transforms::webpack::WebpackLoaderItem;

use crate::next_shared::webpack_rules::WebpackLoaderBuiltinCondition;

// https://babeljs.io/docs/config-files
// TODO: Also support a `babel` key in a package.json file
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

static BABEL_LOADER_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(^|/)@?babel[-/]loader($|/|\.)").unwrap());

/// The forked version of babel-loader that we should use for automatic configuration. This version
/// is always available, as it's installed as part of next.js.
const NEXT_JS_BABEL_LOADER: &str = "next/dist/build/babel/loader";

pub async fn detect_likely_babel_loader(
    webpack_rules: &[(RcStr, LoaderRuleItem)],
) -> Result<Option<RcStr>> {
    for (glob, rule) in webpack_rules {
        if rule
            .loaders
            .await?
            .iter()
            .any(|item| BABEL_LOADER_RE.is_match(&item.loader))
        {
            return Ok(Some(glob.clone()));
        }
    }
    Ok(None)
}

/// If the user has a babel configuration file (see list above) alongside their `next.config.js`
/// configuration, automatically add `babel-loader` as a webpack loader for each eligible file type
/// if it doesn't already exist.
pub async fn get_babel_loader_rules(
    project_root: FileSystemPath,
) -> Result<Vec<(RcStr, LoaderRuleItem)>> {
    let mut babel_config_path = None;
    for &filename in BABEL_CONFIG_FILES {
        let path = project_root.join(filename)?;
        let filetype = *path.get_type().await?;
        if matches!(filetype, FileSystemEntryType::File) {
            babel_config_path = Some(path);
            break;
        }
    }
    let Some(babel_config_path) = babel_config_path else {
        return Ok(Vec::new());
    };

    // - See `packages/next/src/build/babel/loader/types.d.ts` for all the configuration options.
    // - See `packages/next/src/build/get-babel-loader-config.ts` for how we use this in webpack.
    let mut loader_options = serde_json::Map::new();

    // `transformMode: default` (what the webpack implementation does) would run all of the
    // Next.js-specific transforms as babel transforms. Because we always have to pay the cost
    // of parsing with SWC after the webpack loader runs, we want to keep running those
    // transforms using SWC, so use `standalone` instead.
    loader_options.insert("transformMode".to_owned(), "standalone".into());

    loader_options.insert(
        "cwd".to_owned(),
        to_sys_path_str(project_root).await?.into(),
    );
    loader_options.insert(
        "configFile".to_owned(),
        to_sys_path_str(babel_config_path).await?.into(),
    );

    Ok(vec![(
        rcstr!("*.{js,jsx,ts,tsx,cjs,mjs,mts,cts}"),
        LoaderRuleItem {
            loaders: ResolvedVc::cell(vec![WebpackLoaderItem {
                loader: rcstr!(NEXT_JS_BABEL_LOADER),
                options: loader_options,
            }]),
            rename_as: Some(rcstr!("*")),
            condition: Some(ConditionItem::Not(Box::new(ConditionItem::Builtin(
                RcStr::from(WebpackLoaderBuiltinCondition::Foreign.as_str()),
            )))),
        },
    )])
}

/// A system path that can be passed to the webpack loader
async fn to_sys_path_str(path: FileSystemPath) -> Result<String> {
    let sys_path = to_sys_path(path)
        .await?
        .context("path should use a DiskFileSystem")?;
    Ok(sys_path
        .to_str()
        .with_context(|| format!("{sys_path:?} is not valid utf-8"))?
        .to_owned())
}
