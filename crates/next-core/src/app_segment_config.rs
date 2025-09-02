use std::{borrow::Cow, future::Future};

use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use swc_core::{
    common::{GLOBALS, Span, Spanned, source_map::SmallPos},
    ecma::ast::{
        ClassExpr, Decl, ExportSpecifier, Expr, FnExpr, ModuleDecl, ModuleExportName, ModuleItem,
        Program,
    },
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    NonLocalValue, ResolvedVc, TryJoinIterExt, ValueDefault, Vc, trace::TraceRawVcs,
    util::WrapFuture,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    file_source::FileSource,
    ident::AssetIdent,
    issue::{
        Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, OptionIssueSource,
        OptionStyledString, StyledString,
    },
    source::Source,
};
use turbopack_ecmascript::{
    EcmascriptInputTransforms, EcmascriptModuleAssetType,
    analyzer::{ConstantNumber, ConstantValue, JsValue, ObjectPart, graph::EvalContext},
    parse::{ParseResult, parse},
};

use crate::{
    app_structure::AppPageLoaderTree,
    next_config::RouteHas,
    next_manifests::MiddlewareMatcher,
    util::{MiddlewareMatcherKind, NextRuntime},
};

#[derive(
    Default, PartialEq, Eq, Clone, Copy, Debug, TraceRawVcs, Serialize, Deserialize, NonLocalValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum NextSegmentDynamic {
    #[default]
    Auto,
    ForceDynamic,
    Error,
    ForceStatic,
}

#[derive(
    Default, PartialEq, Eq, Clone, Copy, Debug, TraceRawVcs, Serialize, Deserialize, NonLocalValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum NextSegmentFetchCache {
    #[default]
    Auto,
    DefaultCache,
    OnlyCache,
    ForceCache,
    DefaultNoStore,
    OnlyNoStore,
    ForceNoStore,
}

#[derive(
    Default, PartialEq, Eq, Clone, Copy, Debug, TraceRawVcs, Serialize, Deserialize, NonLocalValue,
)]
pub enum NextRevalidate {
    #[default]
    Never,
    ForceCache,
    Frequency {
        seconds: u32,
    },
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Default, Clone)]
pub struct NextSegmentConfig {
    pub dynamic: Option<NextSegmentDynamic>,
    pub dynamic_params: Option<bool>,
    pub revalidate: Option<NextRevalidate>,
    pub fetch_cache: Option<NextSegmentFetchCache>,
    pub runtime: Option<NextRuntime>,
    pub preferred_region: Option<Vec<RcStr>>,
    pub experimental_ppr: Option<bool>,
    /// Whether these metadata exports are defined in the source file.
    pub generate_image_metadata: bool,
    pub generate_sitemaps: bool,

    pub middleware_matcher: Option<Vec<MiddlewareMatcherKind>>,
}

#[turbo_tasks::value_impl]
impl ValueDefault for NextSegmentConfig {
    #[turbo_tasks::function]
    pub fn value_default() -> Vc<Self> {
        NextSegmentConfig::default().cell()
    }
}

impl NextSegmentConfig {
    /// Applies the parent config to this config, setting any unset values to
    /// the parent's values.
    pub fn apply_parent_config(&mut self, parent: &Self) {
        let NextSegmentConfig {
            dynamic,
            dynamic_params,
            revalidate,
            fetch_cache,
            runtime,
            preferred_region,
            experimental_ppr,
            ..
        } = self;
        *dynamic = dynamic.or(parent.dynamic);
        *dynamic_params = dynamic_params.or(parent.dynamic_params);
        *revalidate = revalidate.or(parent.revalidate);
        *fetch_cache = fetch_cache.or(parent.fetch_cache);
        *runtime = runtime.or(parent.runtime);
        *preferred_region = preferred_region.take().or(parent.preferred_region.clone());
        *experimental_ppr = experimental_ppr.or(parent.experimental_ppr);
    }

    /// Applies a config from a parallel route to this config, returning an
    /// error if there are conflicting values.
    pub fn apply_parallel_config(&mut self, parallel_config: &Self) -> Result<()> {
        fn merge_parallel<T: PartialEq + Clone>(
            a: &mut Option<T>,
            b: &Option<T>,
            name: &str,
        ) -> Result<()> {
            match (a.as_ref(), b) {
                (Some(a), Some(b)) => {
                    if *a != *b {
                        bail!(
                            "Sibling segment configs have conflicting values for {}",
                            name
                        )
                    }
                }
                (None, Some(b)) => {
                    *a = Some(b.clone());
                }
                _ => {}
            }
            Ok(())
        }
        let Self {
            dynamic,
            dynamic_params,
            revalidate,
            fetch_cache,
            runtime,
            preferred_region,
            experimental_ppr,
            ..
        } = self;
        merge_parallel(dynamic, &parallel_config.dynamic, "dynamic")?;
        merge_parallel(
            dynamic_params,
            &parallel_config.dynamic_params,
            "dynamicParams",
        )?;
        merge_parallel(revalidate, &parallel_config.revalidate, "revalidate")?;
        merge_parallel(fetch_cache, &parallel_config.fetch_cache, "fetchCache")?;
        merge_parallel(runtime, &parallel_config.runtime, "runtime")?;
        merge_parallel(
            preferred_region,
            &parallel_config.preferred_region,
            "referredRegion",
        )?;
        merge_parallel(
            experimental_ppr,
            &parallel_config.experimental_ppr,
            "experimental_ppr",
        )?;
        Ok(())
    }
}

/// An issue that occurred while parsing the app segment config.
#[turbo_tasks::value(shared)]
pub struct NextSegmentConfigParsingIssue {
    ident: ResolvedVc<AssetIdent>,
    key: RcStr,
    error: RcStr,
    detail: ResolvedVc<StyledString>,
    source: IssueSource,
}

#[turbo_tasks::value_impl]
impl NextSegmentConfigParsingIssue {
    #[turbo_tasks::function]
    pub fn new(
        ident: ResolvedVc<AssetIdent>,
        key: RcStr,
        error: RcStr,
        detail: ResolvedVc<StyledString>,
        source: IssueSource,
    ) -> Vc<Self> {
        Self {
            ident,
            key,
            error,
            detail,
            source,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Issue for NextSegmentConfigParsingIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        Ok(StyledString::Line(vec![
            StyledString::Text(
                format!(
                    "Next.js can't recognize the exported `{}` field in route. ",
                    self.key
                )
                .into(),
            ),
            // TODO include route here
            StyledString::Text(self.error.clone()),
        ])
        .cell())
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Parse.into()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.ident.path()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(rcstr!(
                "The exported configuration object in a source file needs to have a very specific \
                 format from which some properties can be statically parsed at compiled-time."
            ))
            .resolved_cell(),
        ))
    }

    #[turbo_tasks::function]
    fn detail(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.detail))
    }

    #[turbo_tasks::function]
    fn documentation_link(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!(
            "https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config"
        ))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(Some(self.source))
    }
}

#[derive(
    PartialEq,
    Eq,
    Clone,
    Copy,
    Debug,
    Hash,
    TaskInput,
    TraceRawVcs,
    Serialize,
    Deserialize,
    NonLocalValue,
)]
enum ConfigType {
    App,
    Pages,
    Middleware,
}

#[turbo_tasks::function]
pub async fn parse_segment_config_from_source(
    source: ResolvedVc<Box<dyn Source>>,
    is_config_obj_deprecated: bool,
) -> Result<Vc<NextSegmentConfig>> {
    let path = source.ident().path().await?;

    // Don't try parsing if it's not a javascript file, otherwise it will emit an
    // issue causing the build to "fail".
    if path.path.ends_with(".d.ts")
        || !(path.path.ends_with(".js")
            || path.path.ends_with(".jsx")
            || path.path.ends_with(".ts")
            || path.path.ends_with(".tsx"))
    {
        return Ok(Default::default());
    }

    let result = &*parse(
        *source,
        if path.path.ends_with(".ts") {
            EcmascriptModuleAssetType::Typescript {
                tsx: false,
                analyze_types: false,
            }
        } else if path.path.ends_with(".tsx") {
            EcmascriptModuleAssetType::Typescript {
                tsx: true,
                analyze_types: false,
            }
        } else {
            EcmascriptModuleAssetType::Ecmascript
        },
        EcmascriptInputTransforms::empty(),
    )
    .await?;

    let ParseResult::Ok {
        program: Program::Module(module_ast),
        eval_context,
        globals,
        ..
    } = result
    else {
        return Ok(Default::default());
    };

    let config = WrapFuture::new(
        async {
            let mut config = NextSegmentConfig::default();

            let mut parse = async |ident, init, span| {
                parse_config_value(
                    source,
                    is_config_obj_deprecated,
                    &mut config,
                    eval_context,
                    ident,
                    init,
                    span,
                )
                .await
            };

            for item in &module_ast.body {
                match item {
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(decl)) => match &decl.decl {
                        Decl::Class(decl) => {
                            parse(
                                &decl.ident.sym,
                                Some(Cow::Owned(Expr::Class(ClassExpr {
                                    ident: None,
                                    class: decl.class.clone(),
                                }))),
                                decl.span(),
                            )
                            .await?
                        }
                        Decl::Fn(decl) => {
                            parse(
                                &decl.ident.sym,
                                Some(Cow::Owned(Expr::Fn(FnExpr {
                                    ident: None,
                                    function: decl.function.clone(),
                                }))),
                                decl.span(),
                            )
                            .await?
                        }
                        Decl::Var(decl) => {
                            for decl in &decl.decls {
                                let Some(ident) = decl.name.as_ident() else {
                                    continue;
                                };

                                parse(
                                    &ident.id.sym,
                                    decl.init.as_deref().map(Cow::Borrowed),
                                    decl.span(),
                                )
                                .await?;
                            }
                        }
                        _ => continue,
                    },
                    ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(named)) => {
                        for specifier in &named.specifiers {
                            if let ExportSpecifier::Named(named) = specifier {
                                parse(
                                    match named.exported.as_ref().unwrap_or(&named.orig) {
                                        ModuleExportName::Ident(ident) => &ident.sym,
                                        ModuleExportName::Str(s) => &*s.value,
                                    },
                                    None,
                                    specifier.span(),
                                )
                                .await?;
                            }
                        }
                    }
                    _ => {
                        continue;
                    }
                }
            }
            anyhow::Ok(config)
        },
        |f, ctx| GLOBALS.set(globals, || f.poll(ctx)),
    )
    .await?;

    Ok(config.cell())
}

async fn invalid_config(
    source: ResolvedVc<Box<dyn Source>>,
    key: &str,
    span: Span,
    error: RcStr,
    value: &JsValue,
) -> Result<()> {
    let (explainer, hints) = value.explain(2, 0);
    let detail = StyledString::Text(format!("Got {explainer}.{hints}").into()).resolved_cell();

    NextSegmentConfigParsingIssue::new(
        source.ident(),
        key.into(),
        error,
        *detail,
        IssueSource::from_swc_offsets(source, span.lo.to_u32(), span.hi.to_u32()),
    )
    .to_resolved()
    .await?
    .emit();
    Ok(())
}

async fn parse_config_value(
    source: ResolvedVc<Box<dyn Source>>,
    is_config_obj_deprecated: bool,
    config: &mut NextSegmentConfig,
    eval_context: &EvalContext,
    key: &str,
    init: Option<Cow<'_, Expr>>,
    span: Span,
) -> Result<()> {
    let get_value = || {
        init.map(|init| eval_context.eval(&init))
            .unwrap_or(JsValue::Constant(ConstantValue::Undefined))
    };

    match key {
        "config" => {
            let value = get_value();

            if is_config_obj_deprecated {
                return invalid_config(
                    source,
                    "config",
                    span,
                    rcstr!("Page config in `config` is deprecated."),
                    &value,
                )
                .await;
            }

            let JsValue::Object { parts, .. } = &value else {
                return invalid_config(
                    source,
                    "config",
                    span,
                    rcstr!("It needs to be a static object."),
                    &value,
                )
                .await;
            };

            for part in parts {
                let ObjectPart::KeyValue(key, val) = part else {
                    return invalid_config(
                        source,
                        "config",
                        span,
                        rcstr!("It contains unsupported spread."),
                        &value,
                    )
                    .await;
                };

                let Some(key) = key.as_str() else {
                    return invalid_config(
                        source,
                        "config",
                        span,
                        rcstr!("It must only contain string keys."),
                        &value,
                    )
                    .await;
                };

                match key {
                    "runtime" => {
                        let Some(val) = val.as_str() else {
                            return invalid_config(
                                source,
                                "config.runtime",
                                span,
                                rcstr!("It needs to be a static string."),
                                &value,
                            )
                            .await;
                        };

                        config.runtime =
                            match serde_json::from_value(Value::String(val.to_string())) {
                                Ok(runtime) => Some(runtime),
                                Err(err) => {
                                    return invalid_config(
                                        source,
                                        "config.runtime",
                                        span,
                                        format!("It has an invalid value: {err}.").into(),
                                        &value,
                                    )
                                    .await;
                                }
                            };
                    }
                    "matcher" => {
                        config.middleware_matcher =
                            parse_route_matcher_from_js_value(source, span, val).await?;
                    }
                    "regions" => {
                        config.preferred_region = match val {
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
                                    if let Some(str) = item.as_str() {
                                        regions.push(str.to_string().into());
                                    } else {
                                        invalid_config(
                                            source,
                                            "config.regions",
                                            span,
                                            rcstr!(
                                                "Values of the array need to be static strings."
                                            ),
                                            item,
                                        )
                                        .await?;
                                    }
                                }
                                Some(regions)
                            }
                            _ => {
                                invalid_config(
                                    source,
                                    "config.regions",
                                    span,
                                    rcstr!(
                                        "It needs to be a static string or array of static \
                                         strings."
                                    ),
                                    &value,
                                )
                                .await?;
                                None
                            }
                        };
                    }
                    _ => {
                        // Ignore,
                    }
                }
            }
        }
        "dynamic" => {
            let value = get_value();
            let Some(val) = value.as_str() else {
                return invalid_config(
                    source,
                    "dynamic",
                    span,
                    rcstr!("It needs to be a static string."),
                    &value,
                )
                .await;
            };

            config.dynamic = match serde_json::from_value(Value::String(val.to_string())) {
                Ok(dynamic) => Some(dynamic),
                Err(err) => {
                    return invalid_config(
                        source,
                        "dynamic",
                        span,
                        format!("It has an invalid value: {err}.").into(),
                        &value,
                    )
                    .await;
                }
            };
        }
        "dynamicParams" => {
            let value = get_value();

            let Some(val) = value.as_bool() else {
                return invalid_config(
                    source,
                    "dynamicParams",
                    span,
                    rcstr!("It needs to be a static boolean."),
                    &value,
                )
                .await;
            };

            config.dynamic_params = Some(val);
        }
        "revalidate" => {
            let value = get_value();

            match value {
                JsValue::Constant(ConstantValue::Num(ConstantNumber(val))) if val >= 0.0 => {
                    config.revalidate = Some(NextRevalidate::Frequency {
                        seconds: val as u32,
                    });
                }
                JsValue::Constant(ConstantValue::False) => {
                    config.revalidate = Some(NextRevalidate::Never);
                }
                JsValue::Constant(ConstantValue::Str(str)) if str.as_str() == "force-cache" => {
                    config.revalidate = Some(NextRevalidate::ForceCache);
                }
                _ => {
                    //noop; revalidate validation occurs in runtime at
                    //https://github.com/vercel/next.js/blob/cd46c221d2b7f796f963d2b81eea1e405023db23/packages/next/src/server/lib/patch-fetch.ts#L20
                }
            }
        }
        "fetchCache" => {
            let value = get_value();

            let Some(val) = value.as_str() else {
                return invalid_config(
                    source,
                    "fetchCache",
                    span,
                    rcstr!("It needs to be a static string."),
                    &value,
                )
                .await;
            };

            config.fetch_cache = match serde_json::from_value(Value::String(val.to_string())) {
                Ok(fetch_cache) => Some(fetch_cache),
                Err(err) => {
                    return invalid_config(
                        source,
                        "fetchCache",
                        span,
                        format!("It has an invalid value: {err}.").into(),
                        &value,
                    )
                    .await;
                }
            };
        }
        "runtime" => {
            let value = get_value();

            let Some(val) = value.as_str() else {
                return invalid_config(
                    source,
                    "runtime",
                    span,
                    rcstr!("It needs to be a static string."),
                    &value,
                )
                .await;
            };

            config.runtime = match serde_json::from_value(Value::String(val.to_string())) {
                Ok(runtime) => Some(runtime),
                Err(err) => {
                    return invalid_config(
                        source,
                        "runtime",
                        span,
                        format!("It has an invalid value: {err}.").into(),
                        &value,
                    )
                    .await;
                }
            };
        }
        "preferredRegion" => {
            let value = get_value();

            let preferred_region = match value {
                // Single value is turned into a single-element Vec.
                JsValue::Constant(ConstantValue::Str(str)) => vec![str.to_string().into()],
                // Array of strings is turned into a Vec. If one of the values in not a String it
                // will error.
                JsValue::Array { items, .. } => {
                    let mut regions = Vec::new();
                    for item in items {
                        if let Some(str) = item.as_str() {
                            regions.push(str.to_string().into());
                        } else {
                            return invalid_config(
                                source,
                                "preferredRegion",
                                span,
                                rcstr!("Values of the array need to be static strings."),
                                &item,
                            )
                            .await;
                        }
                    }
                    regions
                }
                _ => {
                    return invalid_config(
                        source,
                        "preferredRegion",
                        span,
                        rcstr!("It needs to be a static string or array of static strings."),
                        &value,
                    )
                    .await;
                }
            };

            config.preferred_region = Some(preferred_region);
        }
        // Match exported generateImageMetadata function and generateSitemaps function, and pass
        // them to config.
        "generateImageMetadata" => {
            config.generate_image_metadata = true;
        }
        "generateSitemaps" => {
            config.generate_sitemaps = true;
        }
        "experimental_ppr" => {
            let value = get_value();
            let Some(val) = value.as_bool() else {
                return invalid_config(
                    source,
                    "experimental_ppr",
                    span,
                    rcstr!("`experimental_ppr` needs to be a static boolean."),
                    &value,
                )
                .await;
            };

            config.experimental_ppr = Some(val);
        }
        _ => {}
    }

    Ok(())
}

async fn parse_route_matcher_from_js_value(
    source: ResolvedVc<Box<dyn Source>>,
    span: Span,
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
        JsValue::Constant(ConstantValue::Str(matcher)) => {
            matchers.push(MiddlewareMatcherKind::Str(matcher.to_string()));
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
                    invalid_config(
                        source,
                        "config.matcher",
                        span,
                        rcstr!("Values of the array need to be static strings"),
                        value,
                    )
                    .await?;
                }
            }
        }
        _ => {
            invalid_config(
                source,
                "config.matcher",
                span,
                rcstr!("It needs to be a static string or array of static strings"),
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
pub async fn parse_segment_config_from_loader_tree(
    loader_tree: Vc<AppPageLoaderTree>,
) -> Result<Vc<NextSegmentConfig>> {
    let loader_tree = &*loader_tree.await?;

    Ok(parse_segment_config_from_loader_tree_internal(loader_tree)
        .await?
        .cell())
}

async fn parse_segment_config_from_loader_tree_internal(
    loader_tree: &AppPageLoaderTree,
) -> Result<NextSegmentConfig> {
    let mut config = NextSegmentConfig::default();

    let parallel_configs = loader_tree
        .parallel_routes
        .values()
        .map(|loader_tree| async move {
            Box::pin(parse_segment_config_from_loader_tree_internal(loader_tree)).await
        })
        .try_join()
        .await?;

    for tree in parallel_configs {
        config.apply_parallel_config(&tree)?;
    }

    let modules = &loader_tree.modules;
    for path in [
        modules.page.clone(),
        modules.default.clone(),
        modules.layout.clone(),
    ]
    .into_iter()
    .flatten()
    {
        let source = Vc::upcast(FileSource::new(path.clone()));
        config.apply_parent_config(&*parse_segment_config_from_source(source, true).await?);
    }

    Ok(config)
}
