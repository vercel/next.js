use std::{fmt::Display, str::FromStr};

use anyhow::{Result, bail};
use next_taskless::expand_next_js_template;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, NonLocalValue, TaskInput, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::{
    self, File, FileContent, FileSystem, FileSystemPath, json::parse_json_rope_with_source_context,
    rope::Rope,
};
use turbopack::module_options::RuleCondition;
use turbopack_core::{
    asset::AssetContent,
    compile_time_info::{CompileTimeDefineValue, CompileTimeDefines, DefinableNameSegment},
    condition::ContextCondition,
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
pub struct OptionEnvMap(#[turbo_tasks(trace_ignore)] FxIndexMap<RcStr, Option<RcStr>>);

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

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, TaskInput, Serialize, Deserialize, TraceRawVcs,
)]
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
        bail!(
            "server_path ({}) is not in server_root ({})",
            server_path.value_to_string().await?,
            server_root.value_to_string().await?
        )
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

    let default_transpiled_packages: Vec<RcStr> = load_next_js_templateon(
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
        ContextCondition::InDirectory("node_modules".to_string()),
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

#[derive(
    Default,
    PartialEq,
    Eq,
    Clone,
    Copy,
    Debug,
    TraceRawVcs,
    Serialize,
    Deserialize,
    Hash,
    PartialOrd,
    Ord,
    TaskInput,
    NonLocalValue,
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

#[derive(PartialEq, Eq, Clone, Debug, TraceRawVcs, Serialize, Deserialize, NonLocalValue)]
pub enum MiddlewareMatcherKind {
    Str(String),
    Matcher(ProxyMatcher),
}

/// Loads a next.js template, replaces `replacements` and `injections` and makes
/// sure there are none left over.
pub async fn load_next_js_template(
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

    let content = expand_next_js_template(
        &content,
        &template_path.path,
        &package_root.path,
        replacements.iter().copied(),
        injections.iter().copied(),
        imports.iter().copied(),
    )?;

    let file = File::from(content);

    let source = VirtualSource::new(template_path, AssetContent::file(file.into()));

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

pub async fn load_next_js_templateon<T: DeserializeOwned>(
    project_path: FileSystemPath,
    path: RcStr,
) -> Result<T> {
    let file_path = get_next_package(project_path.clone()).await?.join(&path)?;

    let content = &*file_path.read().await?;

    let FileContent::Content(file) = content else {
        bail!(
            "Expected file content at {}",
            file_path.value_to_string().await?
        );
    };

    let result: T = parse_json_rope_with_source_context(file.content())?;

    Ok(result)
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
