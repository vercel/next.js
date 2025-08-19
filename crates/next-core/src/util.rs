use std::{fmt::Display, future::Future, str::FromStr};

use anyhow::{Result, bail};
use next_taskless::expand_next_js_template;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use swc_core::{
    common::{GLOBALS, Spanned, source_map::SmallPos},
    ecma::ast::{Expr, Lit, Program},
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ResolvedVc, TaskInput, ValueDefault, Vc, trace::TraceRawVcs,
    util::WrapFuture,
};
use turbo_tasks_fs::{
    self, File, FileContent, FileSystem, FileSystemPath, json::parse_json_rope_with_source_context,
    rope::Rope,
};
use turbopack::module_options::RuleCondition;
use turbopack_core::{
    asset::AssetContent,
    compile_time_info::{CompileTimeDefineValue, CompileTimeDefines, DefinableNameSegment},
    condition::ContextCondition,
    issue::{
        Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, OptionIssueSource,
        OptionStyledString, StyledString,
    },
    module::Module,
    source::Source,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::{
    EcmascriptParsable,
    analyzer::{ConstantValue, JsValue, ObjectPart},
    parse::ParseResult,
};

use crate::{
    embed_js::next_js_fs,
    next_config::{NextConfig, RouteHas},
    next_import_map::get_next_package,
    next_manifests::MiddlewareMatcher,
    next_shared::webpack_rules::WebpackLoaderBuiltinCondition,
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

pub fn app_middleware_function_name(page: impl Display) -> String {
    format!("app{page}")
}
pub fn pages_middleware_function_name(page: impl Display) -> String {
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

#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub enum MiddlewareMatcherKind {
    Str(String),
    Matcher(MiddlewareMatcher),
}

#[turbo_tasks::value]
#[derive(Default, Clone)]
pub struct NextSourceConfig {
    pub runtime: NextRuntime,

    /// Middleware router matchers
    pub matcher: Option<Vec<MiddlewareMatcherKind>>,

    pub regions: Option<Vec<RcStr>>,
}

#[turbo_tasks::value_impl]
impl ValueDefault for NextSourceConfig {
    #[turbo_tasks::function]
    pub fn value_default() -> Vc<Self> {
        NextSourceConfig::default().cell()
    }
}

/// An issue that occurred while parsing the page config.
#[turbo_tasks::value(shared)]
pub struct NextSourceConfigParsingIssue {
    source: IssueSource,
    detail: ResolvedVc<StyledString>,
}

#[turbo_tasks::value_impl]
impl NextSourceConfigParsingIssue {
    #[turbo_tasks::function]
    pub fn new(source: IssueSource, detail: ResolvedVc<StyledString>) -> Vc<Self> {
        Self { source, detail }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Issue for NextSourceConfigParsingIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(rcstr!(
            "Next.js can't recognize the exported `config` field in route"
        ))
        .cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Parse.into()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.source.file_path()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(
                "The exported configuration object in a source file need to have a very specific \
                 format from which some properties can be statically parsed at compiled-time."
                    .into(),
            )
            .resolved_cell(),
        ))
    }

    #[turbo_tasks::function]
    fn detail(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.detail))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(Some(self.source))
    }
}

async fn emit_invalid_config_warning(
    source: IssueSource,
    detail: &str,
    value: &JsValue,
) -> Result<()> {
    let (explainer, hints) = value.explain(2, 0);
    NextSourceConfigParsingIssue::new(
        source,
        StyledString::Text(format!("{detail} Got {explainer}.{hints}").into()).cell(),
    )
    .to_resolved()
    .await?
    .emit();
    Ok(())
}

async fn parse_route_matcher_from_js_value(
    source: IssueSource,
    value: &JsValue,
) -> Result<Option<Vec<MiddlewareMatcherKind>>> {
    let parse_matcher_kind_matcher = |value: &JsValue| {
        let mut route_has = vec![];
        if let JsValue::Array { items, .. } = value {
            for item in items {
                if let JsValue::Object { parts, .. } = item {
                    let mut route_type = None;
                    let mut route_key = None;
                    let mut route_value = None;

                    for matcher_part in parts {
                        if let ObjectPart::KeyValue(part_key, part_value) = matcher_part {
                            match part_key.as_str() {
                                Some("type") => {
                                    route_type = part_value.as_str().map(|v| v.to_string())
                                }
                                Some("key") => {
                                    route_key = part_value.as_str().map(|v| v.to_string())
                                }
                                Some("value") => {
                                    route_value = part_value.as_str().map(|v| v.to_string())
                                }
                                _ => {}
                            }
                        }
                    }
                    let r = match route_type.as_deref() {
                        Some("header") => route_key.map(|route_key| RouteHas::Header {
                            key: route_key.into(),
                            value: route_value.map(From::from),
                        }),
                        Some("cookie") => route_key.map(|route_key| RouteHas::Cookie {
                            key: route_key.into(),
                            value: route_value.map(From::from),
                        }),
                        Some("query") => route_key.map(|route_key| RouteHas::Query {
                            key: route_key.into(),
                            value: route_value.map(From::from),
                        }),
                        Some("host") => route_value.map(|route_value| RouteHas::Host {
                            value: route_value.into(),
                        }),
                        _ => None,
                    };

                    if let Some(r) = r {
                        route_has.push(r);
                    }
                }
            }
        }

        route_has
    };

    let mut matchers = vec![];

    match value {
        JsValue::Constant(matcher) => {
            if let Some(matcher) = matcher.as_str() {
                matchers.push(MiddlewareMatcherKind::Str(matcher.to_string()));
            } else {
                emit_invalid_config_warning(
                    source,
                    "The matcher property must be a string or array of strings",
                    value,
                )
                .await?;
            }
        }
        JsValue::Array { items, .. } => {
            for item in items {
                if let Some(matcher) = item.as_str() {
                    matchers.push(MiddlewareMatcherKind::Str(matcher.to_string()));
                } else if let JsValue::Object { parts, .. } = item {
                    let mut matcher = MiddlewareMatcher::default();
                    for matcher_part in parts {
                        if let ObjectPart::KeyValue(key, value) = matcher_part {
                            match key.as_str() {
                                Some("source") => {
                                    if let Some(value) = value.as_str() {
                                        matcher.original_source = value.into();
                                    }
                                }
                                Some("locale") => {
                                    matcher.locale = value.as_bool().unwrap_or_default();
                                }
                                Some("missing") => {
                                    matcher.missing = Some(parse_matcher_kind_matcher(value))
                                }
                                Some("has") => {
                                    matcher.has = Some(parse_matcher_kind_matcher(value))
                                }
                                _ => {
                                    //noop
                                }
                            }
                        }
                    }

                    matchers.push(MiddlewareMatcherKind::Matcher(matcher));
                } else {
                    emit_invalid_config_warning(
                        source,
                        "The matcher property must be a string or array of strings",
                        value,
                    )
                    .await?;
                }
            }
        }
        _ => {
            emit_invalid_config_warning(
                source,
                "The matcher property must be a string or array of strings",
                value,
            )
            .await?
        }
    }

    Ok(if matchers.is_empty() {
        None
    } else {
        Some(matchers)
    })
}

#[turbo_tasks::function]
pub async fn parse_config_from_source(
    source: ResolvedVc<Box<dyn Source>>,
    module: ResolvedVc<Box<dyn Module>>,
    default_runtime: NextRuntime,
) -> Result<Vc<NextSourceConfig>> {
    if let Some(ecmascript_asset) = ResolvedVc::try_sidecast::<Box<dyn EcmascriptParsable>>(module)
        && let ParseResult::Ok {
            program: Program::Module(module_ast),
            globals,
            eval_context,
            ..
        } = &*ecmascript_asset.parse_original().await?
    {
        for item in &module_ast.body {
            if let Some(decl) = item
                .as_module_decl()
                .and_then(|mod_decl| mod_decl.as_export_decl())
                .and_then(|export_decl| export_decl.decl.as_var())
            {
                for decl in &decl.decls {
                    let decl_ident = decl.name.as_ident();

                    // Check if there is exported config object `export const config = {...}`
                    // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
                    if let Some(ident) = decl_ident
                        && ident.sym == "config"
                    {
                        if let Some(init) = decl.init.as_ref() {
                            return WrapFuture::new(
                                async {
                                    let value = eval_context.eval(init);
                                    Ok(parse_config_from_js_value(
                                        IssueSource::from_swc_offsets(
                                            source,
                                            init.span_lo().to_u32(),
                                            init.span_hi().to_u32(),
                                        ),
                                        &value,
                                        default_runtime,
                                    )
                                    .await?
                                    .cell())
                                },
                                |f, ctx| GLOBALS.set(globals, || f.poll(ctx)),
                            )
                            .await;
                        } else {
                            NextSourceConfigParsingIssue::new(
                                IssueSource::from_swc_offsets(
                                    source,
                                    ident.span_lo().to_u32(),
                                    ident.span_hi().to_u32(),
                                ),
                                StyledString::Text(rcstr!(
                                    "The exported config object must contain an variable \
                                     initializer."
                                ))
                                .cell(),
                            )
                            .to_resolved()
                            .await?
                            .emit();
                        }
                    }
                    // Or, check if there is segment runtime option
                    // https://nextjs.org/docs/app/building-your-application/rendering/edge-and-nodejs-runtimes#segment-runtime-Option
                    else if let Some(ident) = decl_ident
                        && ident.sym == "runtime"
                    {
                        let runtime_value_issue = NextSourceConfigParsingIssue::new(
                            IssueSource::from_swc_offsets(
                                source,
                                ident.span_lo().to_u32(),
                                ident.span_hi().to_u32(),
                            ),
                            StyledString::Text(rcstr!(
                                "The runtime property must be either \"nodejs\" or \"edge\"."
                            ))
                            .cell(),
                        )
                        .to_resolved()
                        .await?;
                        if let Some(init) = decl.init.as_ref() {
                            // skipping eval and directly read the expr's value, as we know it
                            // should be a const string
                            if let Expr::Lit(Lit::Str(str_value)) = &**init {
                                let mut config = NextSourceConfig::default();

                                let runtime = &str_value.value;
                                match runtime.as_str() {
                                    "edge" | "experimental-edge" => {
                                        config.runtime = NextRuntime::Edge;
                                    }
                                    "nodejs" => {
                                        config.runtime = NextRuntime::NodeJs;
                                    }
                                    _ => {
                                        runtime_value_issue.emit();
                                    }
                                }

                                return Ok(config.cell());
                            } else {
                                runtime_value_issue.emit();
                            }
                        } else {
                            NextSourceConfigParsingIssue::new(
                                IssueSource::from_swc_offsets(
                                    source,
                                    ident.span_lo().to_u32(),
                                    ident.span_hi().to_u32(),
                                ),
                                StyledString::Text(rcstr!(
                                    "The exported segment runtime option must contain an variable \
                                     initializer."
                                ))
                                .cell(),
                            )
                            .to_resolved()
                            .await?
                            .emit();
                        }
                    }
                }
            }
        }
    }
    let config = NextSourceConfig {
        runtime: default_runtime,
        ..Default::default()
    };

    Ok(config.cell())
}

async fn parse_config_from_js_value(
    source: IssueSource,
    value: &JsValue,
    default_runtime: NextRuntime,
) -> Result<NextSourceConfig> {
    let mut config = NextSourceConfig {
        runtime: default_runtime,
        ..Default::default()
    };

    if let JsValue::Object { parts, .. } = value {
        for part in parts {
            match part {
                ObjectPart::Spread(_) => {
                    emit_invalid_config_warning(
                        source,
                        "Spread properties are not supported in the config export.",
                        value,
                    )
                    .await?
                }
                ObjectPart::KeyValue(key, value) => {
                    if let Some(key) = key.as_str() {
                        match key {
                            "runtime" => {
                                if let JsValue::Constant(runtime) = value {
                                    if let Some(runtime) = runtime.as_str() {
                                        match runtime {
                                            "edge" | "experimental-edge" => {
                                                config.runtime = NextRuntime::Edge;
                                            }
                                            "nodejs" => {
                                                config.runtime = NextRuntime::NodeJs;
                                            }
                                            _ => {
                                                emit_invalid_config_warning(
                                                    source,
                                                    "The runtime property must be either \
                                                     \"nodejs\" or \"edge\".",
                                                    value,
                                                )
                                                .await?;
                                            }
                                        }
                                    }
                                } else {
                                    emit_invalid_config_warning(
                                        source,
                                        "The runtime property must be a constant string.",
                                        value,
                                    )
                                    .await?;
                                }
                            }
                            "matcher" => {
                                config.matcher =
                                    parse_route_matcher_from_js_value(source, value).await?;
                            }
                            "regions" => {
                                config.regions = match value {
                                    // Single value is turned into a single-element Vec.
                                    JsValue::Constant(ConstantValue::Str(str)) => {
                                        Some(vec![str.to_string().into()])
                                    }
                                    // Array of strings is turned into a Vec. If one of the values
                                    // in not a String it will
                                    // error.
                                    JsValue::Array { items, .. } => {
                                        let mut regions: Vec<RcStr> = Vec::new();
                                        for item in items {
                                            if let JsValue::Constant(ConstantValue::Str(str)) = item
                                            {
                                                regions.push(str.to_string().into());
                                            } else {
                                                emit_invalid_config_warning(
                                                    source,
                                                    "Values of the `config.regions` array need to \
                                                     static strings",
                                                    item,
                                                )
                                                .await?;
                                            }
                                        }
                                        Some(regions)
                                    }
                                    _ => {
                                        emit_invalid_config_warning(
                                            source,
                                            "`config.regions` needs to be a static string or \
                                             array of static strings",
                                            value,
                                        )
                                        .await?;
                                        None
                                    }
                                };
                            }
                            _ => {}
                        }
                    } else {
                        emit_invalid_config_warning(
                            source,
                            "The exported config object must not contain non-constant strings.",
                            key,
                        )
                        .await?;
                    }
                }
            }
        }
    } else {
        emit_invalid_config_warning(
            source,
            "The exported config object must be a valid object literal.",
            value,
        )
        .await?;
    }

    Ok(config)
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

    let package_root = &*get_next_package(project_path).await?;

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
