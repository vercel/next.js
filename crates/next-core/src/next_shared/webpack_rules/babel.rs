use std::{collections::BTreeSet, sync::LazyLock};

use anyhow::{Context, Result};
use async_trait::async_trait;
use regex::Regex;
use serde::{Deserialize, Serialize};
use turbo_esregex::EsRegex;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{self, FileContent, FileSystemEntryType, FileSystemPath, to_sys_path};
use turbopack::module_options::{ConditionItem, LoaderRuleItem};
use turbopack_core::{
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    reference_type::{CommonJsReferenceSubType, ReferenceType},
    resolve::{node::node_cjs_resolve_options, parse::Request, pattern::Pattern, resolve},
    source::Source,
};
use turbopack_ecmascript::transform::{ReactCompilerCompilationMode, ReactCompilerTarget};
use turbopack_node::transforms::webpack::WebpackLoaderItem;

use crate::{
    next_config::{NextConfig, ReactCompilerOptions},
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
const NEXT_JS_BABEL_LOADER: RcStr = rcstr!("next/dist/build/babel/loader");

const BABEL_PLUGIN_REACT_COMPILER: RcStr = rcstr!("babel-plugin-react-compiler");
const BABEL_PLUGIN_REACT_COMPILER_PACKAGE_JSON: RcStr =
    rcstr!("babel-plugin-react-compiler/package.json");

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
    let use_rust_react_compiler = next_config.rust_react_compiler().await?.is_some();

    // bail early: no babel config, no react-compiler, or Rust React Compiler is active (babel has
    // nothing to do).
    if babel_config_path.is_none()
        && (react_compiler_options.is_none()
            || use_rust_react_compiler
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
        && !use_rust_react_compiler
        && let Some(babel_plugin_path) =
            resolve_babel_plugin_react_compiler(next_config, project_path).await?
    {
        let react_compiler_options = react_compiler_options.await?;

        let mut react_compiler_options_with_target: ReactCompilerOptions =
            (*react_compiler_options).clone();
        if let Some(target) = detect_react_compiler_target(project_path).await? {
            react_compiler_options_with_target.target = Some(target);
        }

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
            base: &react_compiler_options_with_target,
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
                        query: None,
                        content_type: None,
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
                        query: None,
                        content_type: None,
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
                loader: NEXT_JS_BABEL_LOADER,
                options: loader_options,
            }]),
            rename_as: Some(rcstr!("*")),
            condition: Some(ConditionItem::All(loader_conditions.into())),
            module_type: None,
        },
    )])
}

pub async fn detect_react_compiler_target(
    project_path: &FileSystemPath,
) -> Result<Option<ReactCompilerTarget>> {
    #[derive(Deserialize)]
    struct ReactPackageVersion {
        version: Option<String>,
    }

    let react_pkg_result = resolve(
        project_path.clone(),
        ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined),
        Request::parse(Pattern::Constant(rcstr!("react/package.json"))),
        node_cjs_resolve_options(project_path.root().owned().await?),
    );

    let Some(source) = react_pkg_result.await?.first_source() else {
        return Ok(None);
    };

    let ident = source.ident().await?;
    let path = &ident.path;
    let FileContent::Content(file) = &*path.read().await? else {
        return Ok(None);
    };

    let pkg: ReactPackageVersion = match serde_json::from_reader(file.read()) {
        Ok(pkg) => pkg,
        Err(e) => {
            ReactPackageJsonParseIssue {
                file_path: path.clone(),
                error: e.to_string().into(),
            }
            .resolved_cell()
            .emit();
            return Ok(None);
        }
    };

    let major = pkg
        .version
        .as_deref()
        .and_then(|v| v.split('.').next())
        .and_then(|s| s.parse::<u32>().ok());

    match major {
        Some(18) => Ok(Some(ReactCompilerTarget::React18)),
        _ => Ok(None),
    }
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
        Request::parse(Pattern::Constant(BABEL_PLUGIN_REACT_COMPILER_PACKAGE_JSON)),
        node_cjs_resolve_options(project_path.root().owned().await?),
    );
    let Some(source) = babel_plugin_result.await?.first_source() else {
        BabelPluginReactCompilerResolutionIssue {
            failed_resolution: BABEL_PLUGIN_REACT_COMPILER,
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
            .get_relative_path_to(&source.ident().await?.path.parent())
            .context("failed to resolve relative path for react compiler plugin")?,
    ))
}

#[turbo_tasks::value]
struct BabelPluginReactCompilerResolutionIssue {
    failed_resolution: RcStr,
    config_file_path: FileSystemPath,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for BabelPluginReactCompilerResolutionIssue {
    fn stage(&self) -> IssueStage {
        IssueStage::Transform
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.config_file_path.clone())
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Line(vec![
            StyledString::Text(rcstr!("Failed to resolve package ")),
            StyledString::Code(self.failed_resolution.clone()),
            StyledString::Text(rcstr!(" while attempting to resolve React Compiler")),
        ]))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Line(vec![
            StyledString::Text(rcstr!("React compiler is enabled in ")),
            StyledString::Code(self.config_file_path.path.clone()),
            StyledString::Text(rcstr!(
                ". We attempted to resolve React Compiler relative to the "
            )),
            StyledString::Code(rcstr!("next")),
            StyledString::Text(rcstr!(" package. Is ")),
            StyledString::Code(BABEL_PLUGIN_REACT_COMPILER),
            StyledString::Text(rcstr!(" installed in your ")),
            StyledString::Code(rcstr!("node_modules")),
            StyledString::Text(rcstr!(" directory?")),
        ])))
    }
}

#[turbo_tasks::value]
struct ReactPackageJsonParseIssue {
    file_path: FileSystemPath,
    error: RcStr,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for ReactPackageJsonParseIssue {
    fn stage(&self) -> IssueStage {
        IssueStage::Transform
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.file_path.clone())
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Line(vec![
            StyledString::Text(rcstr!("Failed to parse ")),
            StyledString::Code(rcstr!("react/package.json")),
        ]))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Line(vec![
            StyledString::Text(rcstr!(
                "Could not determine the React version for React Compiler target detection: "
            )),
            StyledString::Text(self.error.clone()),
        ])))
    }
}
