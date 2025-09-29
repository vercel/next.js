use std::{collections::BTreeSet, sync::LazyLock};

use anyhow::{Context, Result};
use regex::Regex;
use serde::Serialize;
use turbo_esregex::EsRegex;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{self, FileSystemEntryType, FileSystemPath, to_sys_path};
use turbopack::module_options::{ConditionItem, LoaderRuleItem};
use turbopack_core::{
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    reference_type::{CommonJsReferenceSubType, ReferenceType},
    resolve::{node::node_cjs_resolve_options, parse::Request, pattern::Pattern, resolve},
    source::Source,
};
use turbopack_node::transforms::webpack::WebpackLoaderItem;

use crate::{
    next_config::{NextConfig, ReactCompilerCompilationMode, ReactCompilerOptions},
    next_import_map::try_get_next_package,
    next_shared::webpack_rules::{
        ManuallyConfiguredBuiltinLoaderIssue, WebpackLoaderBuiltinCondition,
    },
};

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

const BABEL_PLUGIN_REACT_COMPILER: &str = "babel-plugin-react-compiler";
const BABEL_PLUGIN_REACT_COMPILER_PACKAGE_JSON: &str = "babel-plugin-react-compiler/package.json";

/// Detect manually-configured babel loaders. This is used to generate a warning, suggesting using
/// the built-in babel support.
async fn detect_likely_babel_loader(
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
    project_path: &FileSystemPath,
    next_config: Vc<NextConfig>,
    builtin_conditions: &BTreeSet<WebpackLoaderBuiltinCondition>,
    user_webpack_rules: &[(RcStr, LoaderRuleItem)],
) -> Result<Vec<(RcStr, LoaderRuleItem)>> {
    // We never run babel over foreign code, under the assumption that `node_modules` code should
    // not require any transforms that SWC does not provide. If somebody really needs this, they can
    // manually configure a babel loader.
    if builtin_conditions.contains(&WebpackLoaderBuiltinCondition::Foreign) {
        return Ok(Vec::new());
    }

    let use_builtin_babel = next_config
        .experimental_turbopack_use_builtin_babel()
        .await?;

    if use_builtin_babel.is_none()
        && let Some(glob) = detect_likely_babel_loader(user_webpack_rules).await?
    {
        ManuallyConfiguredBuiltinLoaderIssue {
            glob,
            loader: rcstr!("babel-loader"),
            config_key: rcstr!("experimental.turbopackUseBuiltinBabel"),
            config_file_path: next_config
                .config_file_path(project_path.clone())
                .owned()
                .await?,
        }
        .resolved_cell()
        .emit()
    }

    let mut babel_config_path = None;
    if use_builtin_babel.unwrap_or(true) {
        for &filename in BABEL_CONFIG_FILES {
            let path = project_path.join(filename)?;
            let filetype = *path.get_type().await?;
            if matches!(filetype, FileSystemEntryType::File) {
                babel_config_path = Some(path);
                break;
            }
        }
    }

    let react_compiler_options = next_config.react_compiler_options().await?;

    // if there's no babel config and react-compiler shouldn't be enabled, bail out early
    if babel_config_path.is_none()
        && (react_compiler_options.is_none()
            || !builtin_conditions.contains(&WebpackLoaderBuiltinCondition::Browser))
    {
        return Ok(Vec::new());
    }

    // - See `packages/next/src/build/babel/loader/types.d.ts` for all the configuration options.
    // - See `packages/next/src/build/get-babel-loader-config.ts` for how we use this in webpack.
    let serde_json::Value::Object(mut loader_options) = serde_json::json!({
        // `transformMode: default` (what the webpack implementation does) would run all of the
        // Next.js-specific transforms as babel transforms. Because we always have to pay the cost
        // of parsing with SWC after the webpack loader runs, we want to keep running those
        // transforms using SWC, so use `standalone` instead.
        "transformMode": "standalone",
        "cwd": to_sys_path_str(project_path.clone()).await?,
        "isServer": !builtin_conditions.contains(&WebpackLoaderBuiltinCondition::Browser),
    }) else {
        unreachable!("is an object")
    };

    if let Some(babel_config_path) = &babel_config_path {
        loader_options.insert(
            "configFile".to_owned(),
            to_sys_path_str(babel_config_path.clone()).await?.into(),
        );
    }

    let mut loader_conditions = Vec::new();
    if let Some(react_compiler_options) = react_compiler_options.as_ref()
        && let Some(babel_plugin_path) =
            resolve_babel_plugin_react_compiler(next_config, project_path).await?
    {
        let react_compiler_options = react_compiler_options.await?;

        // we don't want to accept user-supplied `environment` options, but we do want to pass
        // `enableNameAnonymousFunctions` down to the babel plugin based on dev/prod.
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct EnvironmentOptions {
            enable_name_anonymous_functions: bool,
        }

        #[derive(Serialize)]
        struct ResolvedOptions<'a> {
            #[serde(flatten)]
            base: &'a ReactCompilerOptions,
            environment: EnvironmentOptions,
        }

        let resolved_options = ResolvedOptions {
            base: &react_compiler_options,
            environment: EnvironmentOptions {
                enable_name_anonymous_functions: builtin_conditions
                    .contains(&WebpackLoaderBuiltinCondition::Development),
            },
        };
        let react_compiler_plugins =
            serde_json::Value::Array(vec![serde_json::Value::Array(vec![
                serde_json::Value::String(babel_plugin_path.into_owned()),
                serde_json::to_value(resolved_options)
                    .expect("react compiler options JSON serialization should never fail"),
            ])]);

        loader_options.insert("reactCompilerPlugins".to_owned(), react_compiler_plugins);

        if babel_config_path.is_none() {
            // We're only running react-compiler, so add some extra conditions to limit when babel
            // runs for performance reasons
            //
            // NOTE: we already bail out at the earlier if `foreign` condition is set or if
            // `browser` is not set.
            match react_compiler_options.compilation_mode {
                ReactCompilerCompilationMode::Annotation => {
                    loader_conditions.push(ConditionItem::Base {
                        path: None,
                        content: Some(
                            EsRegex::new(r#"['"]use memo['"]"#, "")
                                .expect("valid const regex")
                                .resolved_cell(),
                        ),
                    });
                }
                ReactCompilerCompilationMode::Infer => {
                    loader_conditions.push(ConditionItem::Base {
                        path: None,
                        // Matches declaration or useXXX or </ (closing jsx) or /> (self closing
                        // jsx)
                        content: Some(
                            EsRegex::new(r#"['"]use memo['"]|\Wuse[A-Z]|<\/|\/>"#, "")
                                .expect("valid const regex")
                                .resolved_cell(),
                        ),
                    });
                }
                ReactCompilerCompilationMode::All => {}
            }
        }
    }

    Ok(vec![(
        rcstr!("*.{js,jsx,ts,tsx,cjs,mjs,mts,cts}"),
        LoaderRuleItem {
            loaders: ResolvedVc::cell(vec![WebpackLoaderItem {
                loader: rcstr!(NEXT_JS_BABEL_LOADER),
                options: loader_options,
            }]),
            rename_as: Some(rcstr!("*")),
            condition: Some(ConditionItem::All(loader_conditions.into())),
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

/// Resolve `babel-plugin-react-compiler` relative to `next`. This matches the behavior of the
/// webpack implementation, which resolves the Babel plugin from within `next`. The Babel plugin is
/// an optional peer dependency of `next`.
///
/// The returned path is relative to `project_path`. `project_path` should be the value given to
/// `babel-loader` using the `cwd` option.
pub async fn resolve_babel_plugin_react_compiler(
    next_config: Vc<NextConfig>,
    project_path: &FileSystemPath,
) -> Result<Option<RcStr>> {
    let Some(next_package) = &*try_get_next_package(project_path.clone()).await? else {
        BabelPluginReactCompilerResolutionIssue {
            failed_resolution: rcstr!("next"),
            config_file_path: next_config
                .config_file_path(project_path.clone())
                .owned()
                .await?,
        }
        .resolved_cell()
        .emit();
        return Ok(None);
    };

    let babel_plugin_result = resolve(
        next_package.clone(),
        ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined),
        Request::parse(Pattern::Constant(rcstr!(
            BABEL_PLUGIN_REACT_COMPILER_PACKAGE_JSON
        ))),
        node_cjs_resolve_options(project_path.root().owned().await?),
    );
    let Some(source) = &*babel_plugin_result.first_source().await? else {
        BabelPluginReactCompilerResolutionIssue {
            failed_resolution: rcstr!(BABEL_PLUGIN_REACT_COMPILER),
            config_file_path: next_config
                .config_file_path(project_path.clone())
                .owned()
                .await?,
        }
        .resolved_cell()
        .emit();
        return Ok(None);
    };

    Ok(Some(
        // the relative path should only ever fail to resolve when the `fs` is different, which
        // should only happen due to eventual consistency.
        project_path
            .get_relative_path_to(&source.ident().path().await?.parent())
            .context("failed to resolve relative path for react compiler plugin")?,
    ))
}

#[turbo_tasks::value]
struct BabelPluginReactCompilerResolutionIssue {
    failed_resolution: RcStr,
    config_file_path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl Issue for BabelPluginReactCompilerResolutionIssue {
    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Transform.into()
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.config_file_path.clone().cell()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Line(vec![
            StyledString::Text(rcstr!("Failed to resolve package ")),
            StyledString::Code(self.failed_resolution.clone()),
            StyledString::Text(rcstr!(" while attempting to resolve React Compiler")),
        ])
        .cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Line(vec![
                StyledString::Text(rcstr!("React compiler is enabled in ")),
                StyledString::Code(self.config_file_path.path.clone()),
                StyledString::Text(rcstr!(
                    ". We attempted to resolve React Compiler relative to the "
                )),
                StyledString::Code(rcstr!("next")),
                StyledString::Text(rcstr!(" package. Is ")),
                StyledString::Code(rcstr!(BABEL_PLUGIN_REACT_COMPILER)),
                StyledString::Text(rcstr!(" installed in your ")),
                StyledString::Code(rcstr!("node_modules")),
                StyledString::Text(rcstr!(" directory?")),
            ])
            .resolved_cell(),
        ))
    }
}
