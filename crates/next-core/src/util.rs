use std::{borrow::Cow, fmt::Display, str::FromStr};

use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use next_taskless::{expand_next_js_template, expand_next_js_template_no_imports};
use serde::{Deserialize, de::DeserializeOwned};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, NonLocalValue, Vc, fxindexset, trace::TraceRawVcs, turbobail};
use turbo_tasks_fs::{File, FileContent, FileJsonContent, FileSystem, FileSystemPath, rope::Rope};
use turbopack::module_options::RuleCondition;
use turbopack_core::{
    asset::AssetContent,
    compile_time_info::{
        CompileTimeDefineValue, CompileTimeDefines, DefinableNameSegment, FreeVarReference,
        FreeVarReferences,
    },
    condition::ContextCondition,
    issue::IssueSeverity,
    source::Source,
    virtual_source::VirtualSource,
};

use crate::{
    embed_js::next_js_fs, next_config::NextConfig, next_import_map::get_next_package,
    next_manifests::ProxyMatcher, next_shared::webpack_rules::WebpackLoaderBuiltinCondition,
};

const NEXT_TEMPLATE_PATH: &str = "dist/esm/build/templates";

/// As opposed to [`EnvMap`], this map allows for `None` values, which means that the variables
/// should be replace with undefined.
#[turbo_tasks::value(transparent)]
pub struct OptionEnvMap(
    #[turbo_tasks(trace_ignore)]
    #[bincode(with = "turbo_bincode::indexmap")]
    FxIndexMap<RcStr, Option<RcStr>>,
);

pub fn defines(define_env: &FxIndexMap<RcStr, Option<RcStr>>) -> CompileTimeDefines {
    let mut defines = FxIndexMap::default();

    for (k, v) in define_env {
        defines
            .entry(
                k.split('.')
                    .map(|s| DefinableNameSegment::Name(s.into()))
                    .collect::<Vec<_>>(),
            )
            .or_insert_with(|| {
                if let Some(v) = v {
                    let val = serde_json::Value::from_str(v);
                    match val {
                        Ok(v) => v.into(),
                        _ => CompileTimeDefineValue::Evaluate(v.clone()),
                    }
                } else {
                    CompileTimeDefineValue::Undefined
                }
            });
    }

    CompileTimeDefines(defines)
}

/// Emits warnings or errors when inlining frequently changing Vercel system env vars
pub fn free_var_references_with_vercel_system_env_warnings(
    defines: CompileTimeDefines,
    severity: IssueSeverity,
) -> FreeVarReferences {
    // List of system env vars:
    //   not available as NEXT_PUBLIC_* anyway:
    //      CI
    //      VERCEL
    //      VERCEL_SKEW_PROTECTION_ENABLED
    //      VERCEL_AUTOMATION_BYPASS_SECRET
    //      VERCEL_GIT_PROVIDER
    //      VERCEL_GIT_REPO_SLUG
    //      VERCEL_GIT_REPO_OWNER
    //      VERCEL_GIT_REPO_ID
    //      VERCEL_OIDC_TOKEN
    //
    //   constant:
    //      VERCEL_PROJECT_PRODUCTION_URL
    //      VERCEL_REGION
    //      VERCEL_PROJECT_ID
    //
    //   suboptimal (changes production main branch VS preview branches):
    //      VERCEL_ENV
    //      VERCEL_TARGET_ENV
    //
    //   bad (changes per branch):
    //      VERCEL_BRANCH_URL
    //      VERCEL_GIT_COMMIT_REF
    //      VERCEL_GIT_PULL_REQUEST_ID
    //
    //   catastrophic (changes per commit):
    //      NEXT_DEPLOYMENT_ID
    //      VERCEL_URL
    //      VERCEL_DEPLOYMENT_ID
    //      VERCEL_GIT_COMMIT_SHA
    //      VERCEL_GIT_COMMIT_MESSAGE
    //      VERCEL_GIT_COMMIT_AUTHOR_LOGIN
    //      VERCEL_GIT_COMMIT_AUTHOR_NAME
    //      VERCEL_GIT_PREVIOUS_SHA

    let entries = defines
        .0
        .into_iter()
        .map(|(k, value)| (k, FreeVarReference::Value(value)));

    fn wrap_report_next_public_usage(
        public_env_var: &str,
        inner: Option<Box<FreeVarReference>>,
        severity: IssueSeverity,
    ) -> FreeVarReference {
        let message = match public_env_var {
            "NEXT_PUBLIC_NEXT_DEPLOYMENT_ID" | "NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID" => {
                rcstr!(
                    "The deployment id is being inlined.\nThis variable changes frequently, \
                     causing slower deploy times and worse browser client-side caching. Use \
                     `process.env.NEXT_DEPLOYMENT_ID` instead to access the same value without \
                     inlining, for faster deploy times and better browser client-side caching."
                )
            }
            "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA" => {
                rcstr!(
                    "The commit hash is being inlined.\nThis variable changes frequently, causing \
                     slower deploy times and worse browser client-side caching. Consider using \
                     `process.env.NEXT_DEPLOYMENT_ID` to identify a deployment. Alternatively, \
                     use `process.env.VERCEL_GIT_COMMIT_SHA` in server side code and for browser \
                     code, remove it."
                )
            }
            "NEXT_PUBLIC_VERCEL_BRANCH_URL" | "NEXT_PUBLIC_VERCEL_URL" => format!(
                "The deployment url system environment variable is being inlined.\nThis variable \
                 changes frequently, causing slower deploy times and worse browser client-side \
                 caching. For server-side code, replace with `process.env.{}` and for browser \
                 code, read `location.host` instead.",
                public_env_var.strip_prefix("NEXT_PUBLIC_").unwrap(),
            )
            .into(),
            _ => format!(
                "A system environment variable is being inlined.\nThis variable changes \
                 frequently, causing slower deploy times and worse browser client-side caching. \
                 For server-side code, replace with `process.env.{}` and for browser code, try to \
                 remove it.",
                public_env_var.strip_prefix("NEXT_PUBLIC_").unwrap(),
            )
            .into(),
        };
        FreeVarReference::ReportUsage {
            message,
            severity,
            inner,
        }
    }

    let mut list = fxindexset!(
        "NEXT_PUBLIC_NEXT_DEPLOYMENT_ID",
        "NEXT_PUBLIC_VERCEL_BRANCH_URL",
        "NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID",
        "NEXT_PUBLIC_VERCEL_GIT_COMMIT_AUTHOR_LOGIN",
        "NEXT_PUBLIC_VERCEL_GIT_COMMIT_AUTHOR_NAME",
        "NEXT_PUBLIC_VERCEL_GIT_COMMIT_MESSAGE",
        "NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF",
        "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
        "NEXT_PUBLIC_VERCEL_GIT_PREVIOUS_SHA",
        "NEXT_PUBLIC_VERCEL_GIT_PULL_REQUEST_ID",
        "NEXT_PUBLIC_VERCEL_URL",
    );

    let mut entries: FxIndexMap<_, _> = entries
        .map(|(k, value)| {
            let value = if let &[
                DefinableNameSegment::Name(a),
                DefinableNameSegment::Name(b),
                DefinableNameSegment::Name(public_env_var),
            ] = &&*k
                && a == "process"
                && b == "env"
                && list.swap_remove(&**public_env_var)
            {
                wrap_report_next_public_usage(public_env_var, Some(Box::new(value)), severity)
            } else {
                value
            };
            (k, value)
        })
        .collect();

    // For the remaining ones, still add a warning, but without replacement
    for public_env_var in list {
        entries.insert(
            vec![
                rcstr!("process").into(),
                rcstr!("env").into(),
                DefinableNameSegment::Name(public_env_var.into()),
            ],
            wrap_report_next_public_usage(public_env_var, None, severity),
        );
    }

    FreeVarReferences(entries)
}

#[turbo_tasks::task_input]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, TraceRawVcs, Encode, Decode)]
pub enum PathType {
    PagesPage,
    PagesApi,
    Data,
}

/// Converts a filename within the server root into a next pathname.
#[turbo_tasks::function]
pub async fn pathname_for_path(
    server_root: FileSystemPath,
    server_path: FileSystemPath,
    path_ty: PathType,
) -> Result<Vc<RcStr>> {
    let server_path_value = server_path.clone();
    let path = if let Some(path) = server_root.get_path_to(&server_path_value) {
        path
    } else {
        turbobail!("server_path ({server_path}) is not in server_root ({server_root})");
    };
    let path = match (path_ty, path) {
        // "/" is special-cased to "/index" for data routes.
        (PathType::Data, "") => rcstr!("/index"),
        // `get_path_to` always strips the leading `/` from the path, so we need to add
        // it back here.
        (_, path) => format!("/{path}").into(),
    };

    Ok(Vc::cell(path))
}

// Adapted from https://github.com/vercel/next.js/blob/canary/packages/next/src/shared/lib/router/utils/get-asset-path-from-route.ts
// TODO(alexkirsz) There's no need to create an intermediate string here (and
// below), we should instead return an `impl Display`.
pub fn get_asset_prefix_from_pathname(pathname: &str) -> String {
    if pathname == "/" {
        "/index".to_string()
    } else if pathname == "/index" || pathname.starts_with("/index/") {
        format!("/index{pathname}")
    } else {
        pathname.to_string()
    }
}

// Adapted from https://github.com/vercel/next.js/blob/canary/packages/next/src/shared/lib/router/utils/get-asset-path-from-route.ts
pub fn get_asset_path_from_pathname(pathname: &str, ext: &str) -> String {
    format!("{}{}", get_asset_prefix_from_pathname(pathname), ext)
}

#[turbo_tasks::function]
pub async fn get_transpiled_packages(
    next_config: Vc<NextConfig>,
    project_path: FileSystemPath,
) -> Result<Vc<Vec<RcStr>>> {
    let mut transpile_packages: Vec<RcStr> = next_config.transpile_packages().owned().await?;

    let default_transpiled_packages: Vec<RcStr> = load_next_js_json_file(
        project_path,
        rcstr!("dist/lib/default-transpiled-packages.json"),
    )
    .await?;

    transpile_packages.extend(default_transpiled_packages.iter().cloned());

    Ok(Vc::cell(transpile_packages))
}

pub async fn foreign_code_context_condition(
    next_config: Vc<NextConfig>,
    project_path: FileSystemPath,
) -> Result<ContextCondition> {
    let transpiled_packages = get_transpiled_packages(next_config, project_path.clone()).await?;

    // The next template files are allowed to import the user's code via import
    // mapping, and imports must use the project-level [ResolveOptions] instead
    // of the `node_modules` specific resolve options (the template files are
    // technically node module files).
    let not_next_template_dir = ContextCondition::not(ContextCondition::InPath(
        get_next_package(project_path.clone())
            .await?
            .join(NEXT_TEMPLATE_PATH)?,
    ));

    let result = ContextCondition::all(vec![
        ContextCondition::InNodeModules,
        not_next_template_dir,
        ContextCondition::not(ContextCondition::any(
            transpiled_packages
                .iter()
                .map(|package| ContextCondition::InDirectory(format!("node_modules/{package}")))
                .collect(),
        )),
    ]);
    Ok(result)
}

/// Determines if the module is an internal asset (i.e overlay, fallback) coming from the embedded
/// FS, don't apply user defined transforms.
//
// TODO: Turbopack specific embed fs paths should be handled by internals of Turbopack itself and
// user config should not try to leak this. However, currently we apply few transform options
// subject to Next.js's configuration even if it's embedded assets.
pub async fn internal_assets_conditions() -> Result<ContextCondition> {
    Ok(ContextCondition::any(vec![
        ContextCondition::InPath(next_js_fs().root().owned().await?),
        ContextCondition::InPath(
            turbopack_ecmascript_runtime::embed_fs()
                .root()
                .owned()
                .await?,
        ),
        ContextCondition::InPath(turbopack_node::embed_js::embed_fs().root().owned().await?),
    ]))
}

pub fn app_function_name(page: impl Display) -> String {
    format!("app{page}")
}
pub fn pages_function_name(page: impl Display) -> String {
    format!("pages{page}")
}

#[turbo_tasks::task_input]
#[derive(
    Default,
    PartialEq,
    Eq,
    Clone,
    Copy,
    Debug,
    TraceRawVcs,
    Deserialize,
    Hash,
    PartialOrd,
    Ord,
    Encode,
    Decode,
)]
#[serde(rename_all = "lowercase")]
pub enum NextRuntime {
    #[default]
    NodeJs,
    #[serde(alias = "experimental-edge")]
    Edge,
}

impl NextRuntime {
    /// Returns conditions that can be used in the Next.js config's turbopack "rules" section for
    /// defining webpack loader configuration.
    pub fn webpack_loader_conditions(&self) -> impl Iterator<Item = WebpackLoaderBuiltinCondition> {
        match self {
            NextRuntime::NodeJs => [WebpackLoaderBuiltinCondition::Node],
            NextRuntime::Edge => [WebpackLoaderBuiltinCondition::EdgeLight],
        }
        .into_iter()
    }

    /// Returns conditions used by `ResolveOptionsContext`.
    pub fn custom_resolve_conditions(&self) -> impl Iterator<Item = RcStr> {
        match self {
            NextRuntime::NodeJs => [rcstr!("node")],
            NextRuntime::Edge => [rcstr!("edge-light")],
        }
        .into_iter()
    }
}

#[derive(PartialEq, Eq, Clone, Debug, TraceRawVcs, NonLocalValue, Encode, Decode)]
pub enum MiddlewareMatcherKind {
    Str(String),
    Matcher(ProxyMatcher),
}

/// Loads a next.js template, replaces `replacements` and `injections` and makes
/// sure there are none left over.
pub async fn load_next_js_template<'b>(
    template_path: &'b str,
    project_path: FileSystemPath,
    replacements: impl IntoIterator<Item = (&'b str, &'b str)>,
    injections: impl IntoIterator<Item = (&'b str, &'b str)>,
    imports: impl IntoIterator<Item = (&'b str, Option<&'b str>)>,
) -> Result<Vc<Box<dyn Source>>> {
    let template_path = virtual_next_js_template_path(project_path.clone(), template_path).await?;

    let content = file_content_rope(template_path.read()).await?;
    let content = content.to_str()?;

    let package_root = get_next_package(project_path).await?;

    let content = expand_next_js_template(
        &content,
        &template_path.path,
        &package_root.path,
        replacements,
        injections,
        imports,
    )?;

    let file = File::from(content);
    let source = VirtualSource::new(
        template_path,
        AssetContent::file(FileContent::Content(file).cell()),
    );

    Ok(Vc::upcast(source))
}

/// Loads a next.js template but does **not** require that any relative imports are present
/// or rewritten. This is intended for small internal templates that do not have their own
/// imports but still use template variables/injections.
pub async fn load_next_js_template_no_imports(
    template_path: &str,
    project_path: FileSystemPath,
    replacements: &[(&str, &str)],
    injections: &[(&str, &str)],
    imports: &[(&str, Option<&str>)],
) -> Result<Vc<Box<dyn Source>>> {
    let template_path = virtual_next_js_template_path(project_path.clone(), template_path).await?;

    let content = file_content_rope(template_path.read()).await?;
    let content = content.to_str()?;

    let package_root = get_next_package(project_path).await?;

    let content = expand_next_js_template_no_imports(
        &content,
        &template_path.path,
        &package_root.path,
        replacements.iter().copied(),
        injections.iter().copied(),
        imports.iter().copied(),
    )?;

    let file = File::from(content);
    let source = VirtualSource::new(
        template_path,
        AssetContent::file(FileContent::Content(file).cell()),
    );

    Ok(Vc::upcast(source))
}

#[turbo_tasks::function]
pub async fn file_content_rope(content: Vc<FileContent>) -> Result<Vc<Rope>> {
    let content = &*content.await?;

    let FileContent::Content(file) = content else {
        bail!("Expected file content for file");
    };

    Ok(file.content().to_owned().cell())
}

async fn virtual_next_js_template_path(
    project_path: FileSystemPath,
    file: &str,
) -> Result<FileSystemPath> {
    debug_assert!(!file.contains('/'));
    get_next_package(project_path)
        .await?
        .join(&format!("{NEXT_TEMPLATE_PATH}/{file}"))
}

pub async fn load_next_js_json_file<T: DeserializeOwned>(
    project_path: FileSystemPath,
    sub_path: RcStr,
) -> Result<T> {
    let file_path = get_next_package(project_path.clone())
        .await?
        .join(&sub_path)?;

    let content = &*file_path.read().await?;

    match content.parse_json_ref() {
        FileJsonContent::Unparsable(e) => bail!("File is not valid JSON: {e}"),
        FileJsonContent::NotFound => turbobail!("File not found: {file_path:?}",),
        FileJsonContent::Content(value) => Ok(serde_json::from_value(value)?),
    }
}

pub async fn load_next_js_jsonc_file<T: DeserializeOwned>(
    project_path: FileSystemPath,
    sub_path: RcStr,
) -> Result<T> {
    let file_path = get_next_package(project_path.clone())
        .await?
        .join(&sub_path)?;

    let content = &*file_path.read().await?;

    match content.parse_json_with_comments_ref() {
        FileJsonContent::Unparsable(e) => turbobail!("File is not valid JSON: {e}"),
        FileJsonContent::NotFound => turbobail!("File not found: {file_path}",),
        FileJsonContent::Content(value) => Ok(serde_json::from_value(value)?),
    }
}

pub fn styles_rule_condition() -> RuleCondition {
    RuleCondition::any(vec![
        RuleCondition::all(vec![
            RuleCondition::ResourcePathEndsWith(".css".into()),
            RuleCondition::not(RuleCondition::ResourcePathEndsWith(".module.css".into())),
        ]),
        RuleCondition::all(vec![
            RuleCondition::ResourcePathEndsWith(".sass".into()),
            RuleCondition::not(RuleCondition::ResourcePathEndsWith(".module.sass".into())),
        ]),
        RuleCondition::all(vec![
            RuleCondition::ResourcePathEndsWith(".scss".into()),
            RuleCondition::not(RuleCondition::ResourcePathEndsWith(".module.scss".into())),
        ]),
        RuleCondition::all(vec![
            RuleCondition::ContentTypeStartsWith("text/css".into()),
            RuleCondition::not(RuleCondition::ContentTypeStartsWith(
                "text/css+module".into(),
            )),
        ]),
        RuleCondition::all(vec![
            RuleCondition::ContentTypeStartsWith("text/sass".into()),
            RuleCondition::not(RuleCondition::ContentTypeStartsWith(
                "text/sass+module".into(),
            )),
        ]),
        RuleCondition::all(vec![
            RuleCondition::ContentTypeStartsWith("text/scss".into()),
            RuleCondition::not(RuleCondition::ContentTypeStartsWith(
                "text/scss+module".into(),
            )),
        ]),
    ])
}
pub fn module_styles_rule_condition() -> RuleCondition {
    RuleCondition::any(vec![
        RuleCondition::ResourcePathEndsWith(".module.css".into()),
        RuleCondition::ResourcePathEndsWith(".module.scss".into()),
        RuleCondition::ResourcePathEndsWith(".module.sass".into()),
        RuleCondition::ContentTypeStartsWith("text/css+module".into()),
        RuleCondition::ContentTypeStartsWith("text/sass+module".into()),
        RuleCondition::ContentTypeStartsWith("text/scss+module".into()),
    ])
}

/// Returns the list of global variables that should be forwarded from the main
/// context to web workers. These are Next.js-specific globals that need to be
/// available in worker contexts.
pub fn worker_forwarded_globals() -> Vec<RcStr> {
    vec![
        rcstr!("NEXT_DEPLOYMENT_ID"),
        rcstr!("NEXT_CLIENT_ASSET_SUFFIX"),
    ]
}

/// The globs defined in the next.config.mjs are relative to the project root.
/// The glob walker in turbopack is somewhat naive so we handle relative path directives first so
/// traversal doesn't need to consider them and can just traverse 'down' the tree.
/// The main alternative is to merge glob evaluation with directory traversal which is what the npm
/// `glob` package does, but this would be a substantial rewrite.
pub fn relativize_glob<'a>(
    glob: &'a str,
    relative_to: &FileSystemPath,
) -> Result<(&'a str, FileSystemPath)> {
    let mut relative_to = Cow::Borrowed(relative_to);
    let mut processed_glob = glob;
    loop {
        if let Some(stripped) = processed_glob.strip_prefix("../") {
            if relative_to.path.is_empty() {
                bail!(
                    "glob '{glob}' is invalid, it has a prefix that navigates out of the project \
                     root"
                );
            }
            relative_to = Cow::Owned(relative_to.parent());
            processed_glob = stripped;
        } else if let Some(stripped) = processed_glob.strip_prefix("./") {
            processed_glob = stripped;
        } else {
            break;
        }
    }
    Ok((processed_glob, relative_to.into_owned()))
}

#[cfg(test)]
mod tests {
    use turbo_tasks::ResolvedVc;
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{FileSystemPath, NullFileSystem};

    use super::*;

    fn create_test_fs_path(path: &str) -> FileSystemPath {
        FileSystemPath {
            fs: ResolvedVc::upcast(NullFileSystem {}.resolved_cell()),
            path: path.into(),
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_relativize_glob_normal_patterns() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            // Test normal glob patterns without relative prefixes
            let base_path = create_test_fs_path("project/src");

            let (glob, path) = relativize_glob("*.js", &base_path).unwrap();
            assert_eq!(glob, "*.js");
            assert_eq!(path.path.as_str(), "project/src");

            let (glob, path) = relativize_glob("components/**/*.tsx", &base_path).unwrap();
            assert_eq!(glob, "components/**/*.tsx");
            assert_eq!(path.path.as_str(), "project/src");

            let (glob, path) = relativize_glob("lib/utils.ts", &base_path).unwrap();
            assert_eq!(glob, "lib/utils.ts");
            assert_eq!(path.path.as_str(), "project/src");
            Ok(())
        })
        .await
        .unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_relativize_glob_current_directory_prefix() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            let base_path = create_test_fs_path("project/src");

            // Single ./ prefix
            let (glob, path) = relativize_glob("./components/*.tsx", &base_path).unwrap();
            assert_eq!(glob, "components/*.tsx");
            assert_eq!(path.path.as_str(), "project/src");

            // Multiple ./ prefixes
            let (glob, path) = relativize_glob("././utils.js", &base_path).unwrap();
            assert_eq!(glob, "utils.js");
            assert_eq!(path.path.as_str(), "project/src");

            // ./ with complex glob
            let (glob, path) = relativize_glob("./lib/**/*.{js,ts}", &base_path).unwrap();
            assert_eq!(glob, "lib/**/*.{js,ts}");
            assert_eq!(path.path.as_str(), "project/src");
            Ok(())
        })
        .await
        .unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_relativize_glob_parent_directory_navigation() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            let base_path = create_test_fs_path("project/src/components");

            // Single ../ prefix
            let (glob, path) = relativize_glob("../utils/*.js", &base_path).unwrap();
            assert_eq!(glob, "utils/*.js");
            assert_eq!(path.path.as_str(), "project/src");

            // Multiple ../ prefixes
            let (glob, path) = relativize_glob("../../lib/*.ts", &base_path).unwrap();
            assert_eq!(glob, "lib/*.ts");
            assert_eq!(path.path.as_str(), "project");

            // Complex navigation with glob
            let (glob, path) = relativize_glob("../../../external/**/*.json", &base_path).unwrap();
            assert_eq!(glob, "external/**/*.json");
            assert_eq!(path.path.as_str(), "");
            Ok(())
        })
        .await
        .unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_relativize_glob_mixed_prefixes() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            let base_path = create_test_fs_path("project/src/components");

            // ../ followed by ./
            let (glob, path) = relativize_glob(".././utils/*.js", &base_path).unwrap();
            assert_eq!(glob, "utils/*.js");
            assert_eq!(path.path.as_str(), "project/src");

            // ./ followed by ../
            let (glob, path) = relativize_glob("./../lib/*.ts", &base_path).unwrap();
            assert_eq!(glob, "lib/*.ts");
            assert_eq!(path.path.as_str(), "project/src");

            // Multiple mixed prefixes
            let (glob, path) = relativize_glob("././../.././external/*.json", &base_path).unwrap();
            assert_eq!(glob, "external/*.json");
            assert_eq!(path.path.as_str(), "project");
            Ok(())
        })
        .await
        .unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_relativize_glob_error_navigation_out_of_root() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            // Test navigating out of project root with empty path
            let empty_path = create_test_fs_path("");
            let result = relativize_glob("../outside.js", &empty_path);
            assert!(result.is_err());
            assert!(
                result
                    .unwrap_err()
                    .to_string()
                    .contains("navigates out of the project root")
            );

            // Test navigating too far up from a shallow path
            let shallow_path = create_test_fs_path("project");
            let result = relativize_glob("../../outside.js", &shallow_path);
            assert!(result.is_err());
            assert!(
                result
                    .unwrap_err()
                    .to_string()
                    .contains("navigates out of the project root")
            );

            // Test multiple ../ that would go out of root
            let base_path = create_test_fs_path("a/b");
            let result = relativize_glob("../../../outside.js", &base_path);
            assert!(result.is_err());
            assert!(
                result
                    .unwrap_err()
                    .to_string()
                    .contains("navigates out of the project root")
            );
            Ok(())
        })
        .await
        .unwrap();
    }
}
