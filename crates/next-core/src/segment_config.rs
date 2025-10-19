use std::{borrow::Cow, future::Future};

use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use swc_core::{
    common::{DUMMY_SP, GLOBALS, Span, Spanned, source_map::SmallPos},
    ecma::{
        ast::{
            ClassExpr, Decl, ExportSpecifier, Expr, ExprStmt, FnExpr, Lit, ModuleDecl,
            ModuleExportName, ModuleItem, Program, Stmt, Str, TsSatisfiesExpr,
        },
        utils::IsDirective,
    },
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    NonLocalValue, ResolvedVc, TaskInput, TryJoinIterExt, ValueDefault, Vc, trace::TraceRawVcs,
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
    next_manifests::ProxyMatcher,
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
    pub middleware_matcher: Option<Vec<MiddlewareMatcherKind>>,

    /// Whether these exports are defined in the source file.
    pub generate_image_metadata: bool,
    pub generate_sitemaps: bool,
    #[turbo_tasks(trace_ignore)]
    pub generate_static_params: Option<Span>,
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
            ..
        } = self;
        *dynamic = dynamic.or(parent.dynamic);
        *dynamic_params = dynamic_params.or(parent.dynamic_params);
        *revalidate = revalidate.or(parent.revalidate);
        *fetch_cache = fetch_cache.or(parent.fetch_cache);
        *runtime = runtime.or(parent.runtime);
        *preferred_region = preferred_region.take().or(parent.preferred_region.clone());
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
            "preferredRegion",
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
    detail: Option<ResolvedVc<StyledString>>,
    source: IssueSource,
    severity: IssueSeverity,
}

#[turbo_tasks::value_impl]
impl NextSegmentConfigParsingIssue {
    #[turbo_tasks::function]
    pub fn new(
        ident: ResolvedVc<AssetIdent>,
        key: RcStr,
        error: RcStr,
        detail: Option<ResolvedVc<StyledString>>,
        source: IssueSource,
        severity: IssueSeverity,
    ) -> Vc<Self> {
        Self {
            ident,
            key,
            error,
            detail,
            source,
            severity,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Issue for NextSegmentConfigParsingIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        Ok(StyledString::Line(vec![
            StyledString::Text(
                format!(
                    "Next.js can't recognize the exported `{}` field in route. ",
                    self.key,
                )
                .into(),
            ),
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
        Vc::cell(self.detail)
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
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Hash,
    Serialize,
    Deserialize,
    TaskInput,
    NonLocalValue,
    TraceRawVcs,
)]
pub enum ParseSegmentMode {
    Base,
    // Disallows "use client + generateStatic" and ignores/warns about `export const config`
    App,
}

/// Parse the raw source code of a file to get the segment config local to that file.
///
/// See [the Next.js documentation for Route Segment
/// Configs](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config).
///
/// Pages router and middleware use this directly. App router uses
/// `parse_segment_config_from_loader_tree` instead, which aggregates configuration information
/// across multiple files.
///
/// ## A Note on Parsing the Raw Source Code
///
/// A better API would use `ModuleAssetContext::process` to convert the `Source` to a `Module`,
/// instead of parsing the raw source code. That would ensure that things like webpack loaders can
/// run before SWC tries to parse the file, e.g. to strip unsupported syntax using Babel. However,
/// because the config includes `runtime`, we can't know which context to use until after parsing
/// the file.
///
/// This could be solved with speculative parsing:
/// 1. Speculatively process files and extract route segment configs using the Node.js
///    `ModuleAssetContext` first. This is the common/happy codepath.
/// 2. If we get a config specifying `runtime = "edge"`, we should use the Edge runtime's
///    `ModuleAssetContext` and re-process the file(s), extracting the segment config again.
/// 3. If we failed to get a configuration (e.g. a parse error), we need speculatively process with
///    the Edge runtime and look for a `runtime = "edge"` configuration key. If that also fails,
///    then we should report any issues/errors from the first attempt using the Node.js context.
///
/// While a speculative parsing algorithm is straightforward, there are a few factors that make it
/// impractical to implement:
///
/// - The app router config is loaded across many different files (page, layout, or route handler,
///   including an arbitrary number of those files in parallel routes), and once we discover that
///   something specified edge runtime, we must restart that entire loop, so try/reparse logic can't
///   be cleanly encapsulated to an operation over a single file.
///
/// - There's a lot of tracking that needs to happen to later suppress `Issue` collectibles on
///   speculatively-executed `OperationVc`s.
///
/// - Most things default to the node.js runtime and can be overridden to edge runtime, but
///   middleware is an exception, so different codepaths have different defaults.
///
/// The `runtime` option is going to be deprecated, and we may eventually remove edge runtime
/// completely (in Next 18?), so it doesn't make sense to spend a ton of time improving logic around
/// that. In the future, doing this the right way with the `ModuleAssetContext` will be easy (there
/// will only be one, no speculative parsing is needed), and I think it's okay to use a hacky
/// solution for a couple years until that day comes.
///
/// ## What does webpack do?
///
/// The logic is in `packages/next/src/build/analysis/get-page-static-info.ts`, but it's very
/// similar to what we do here.
///
/// There are a couple of notable differences:
///
/// - The webpack implementation uses a regexp (`PARSE_PATTERN`) to skip parsing some files, but
///   this regexp is imperfect and may also suppress some lints that we have. The performance
///   benefit is small, so we're not currently doing this (but we could revisit that decision in the
///   future).
///
/// - The `parseModule` helper function swallows errors (!) returning a `null` ast value when
///   parsing fails. This seems bad, as it may lead to silently-ignored segment configs, so we don't
///   want to do this.
#[turbo_tasks::function]
pub async fn parse_segment_config_from_source(
    source: ResolvedVc<Box<dyn Source>>,
    mode: ParseSegmentMode,
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
        false,
        false,
    )
    .await?;

    let ParseResult::Ok {
        program: Program::Module(module_ast),
        eval_context,
        globals,
        ..
    } = result
    else {
        // The `parse` call has already emitted parse issues in case of `ParseResult::Unparsable`
        return Ok(Default::default());
    };

    let config = WrapFuture::new(
        async {
            let mut config = NextSegmentConfig::default();

            let mut parse = async |ident, init, span| {
                parse_config_value(source, mode, &mut config, eval_context, ident, init, span).await
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

                                let key = &ident.id.sym;

                                parse(
                                    key,
                                    Some(
                                        decl.init.as_deref().map(Cow::Borrowed).unwrap_or_else(
                                            || Cow::Owned(*Expr::undefined(DUMMY_SP)),
                                        ),
                                    ),
                                    // The config object can span hundreds of lines. Don't
                                    // highlight the whole thing
                                    if key == "config" {
                                        ident.id.span
                                    } else {
                                        decl.span()
                                    },
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

    if mode == ParseSegmentMode::App
        && let Some(span) = config.generate_static_params
        && module_ast
            .body
            .iter()
            .take_while(|i| match i {
                ModuleItem::Stmt(stmt) => stmt.directive_continue(),
                ModuleItem::ModuleDecl(_) => false,
            })
            .filter_map(|i| i.as_stmt())
            .any(|f| match f {
                Stmt::Expr(ExprStmt { expr, .. }) => match &**expr {
                    Expr::Lit(Lit::Str(Str { value, .. })) => value == "use client",
                    _ => false,
                },
                _ => false,
            })
    {
        invalid_config(
            source,
            "generateStaticParams",
            span,
            rcstr!(
                "App pages cannot use both \"use client\" and export function \
                 \"generateStaticParams()\"."
            ),
            None,
            IssueSeverity::Error,
        )
        .await?;
    }

    Ok(config.cell())
}

async fn invalid_config(
    source: ResolvedVc<Box<dyn Source>>,
    key: &str,
    span: Span,
    error: RcStr,
    value: Option<&JsValue>,
    severity: IssueSeverity,
) -> Result<()> {
    let detail = if let Some(value) = value {
        let (explainer, hints) = value.explain(2, 0);
        Some(*StyledString::Text(format!("Got {explainer}.{hints}").into()).resolved_cell())
    } else {
        None
    };

    NextSegmentConfigParsingIssue::new(
        source.ident(),
        key.into(),
        error,
        detail,
        IssueSource::from_swc_offsets(source, span.lo.to_u32(), span.hi.to_u32()),
        severity,
    )
    .to_resolved()
    .await?
    .emit();
    Ok(())
}

async fn parse_config_value(
    source: ResolvedVc<Box<dyn Source>>,
    mode: ParseSegmentMode,
    config: &mut NextSegmentConfig,
    eval_context: &EvalContext,
    key: &str,
    init: Option<Cow<'_, Expr>>,
    span: Span,
) -> Result<()> {
    let get_value = || {
        let init = init.as_deref();
        // Unwrap `export const config = { .. } satisfies ProxyConfig`, usually this is already
        // transpiled away, but we are looking at the original source here.
        let init = if let Some(Expr::TsSatisfies(TsSatisfiesExpr { expr, .. })) = init {
            Some(&**expr)
        } else {
            init
        };
        init.map(|init| eval_context.eval(init)).map(|v| {
            // Special case, as we don't call `link` here: assume that `undefined` is a free
            // variable.
            if let JsValue::FreeVar(name) = &v
                && name == "undefined"
            {
                JsValue::Constant(ConstantValue::Undefined)
            } else {
                v
            }
        })
    };

    match key {
        "config" => {
            let Some(value) = get_value() else {
                return invalid_config(
                    source,
                    "config",
                    span,
                    rcstr!("It mustn't be reexported."),
                    None,
                    IssueSeverity::Error,
                )
                .await;
            };

            if mode == ParseSegmentMode::App {
                return invalid_config(
                    source,
                    "config",
                    span,
                    rcstr!(
                        "Page config in `config` is deprecated and ignored, use individual \
                         exports instead."
                    ),
                    Some(&value),
                    IssueSeverity::Warning,
                )
                .await;
            }

            let JsValue::Object { parts, .. } = &value else {
                return invalid_config(
                    source,
                    "config",
                    span,
                    rcstr!("It needs to be a static object."),
                    Some(&value),
                    IssueSeverity::Error,
                )
                .await;
            };

            for part in parts {
                let ObjectPart::KeyValue(key, value) = part else {
                    return invalid_config(
                        source,
                        "config",
                        span,
                        rcstr!("It contains unsupported spread."),
                        Some(&value),
                        IssueSeverity::Error,
                    )
                    .await;
                };

                let Some(key) = key.as_str() else {
                    return invalid_config(
                        source,
                        "config",
                        span,
                        rcstr!("It must only contain string keys."),
                        Some(value),
                        IssueSeverity::Error,
                    )
                    .await;
                };

                if matches!(value, JsValue::Constant(ConstantValue::Undefined)) {
                    continue;
                }
                match key {
                    "runtime" => {
                        let Some(val) = value.as_str() else {
                            return invalid_config(
                                source,
                                "config",
                                span,
                                rcstr!("`runtime` needs to be a static string."),
                                Some(value),
                                IssueSeverity::Error,
                            )
                            .await;
                        };

                        config.runtime =
                            match serde_json::from_value(Value::String(val.to_string())) {
                                Ok(runtime) => Some(runtime),
                                Err(err) => {
                                    return invalid_config(
                                        source,
                                        "config",
                                        span,
                                        format!("`runtime` has an invalid value: {err}.").into(),
                                        Some(value),
                                        IssueSeverity::Error,
                                    )
                                    .await;
                                }
                            };
                    }
                    "matcher" => {
                        config.middleware_matcher =
                            parse_route_matcher_from_js_value(source, span, value).await?;
                    }
                    "regions" => {
                        config.preferred_region = parse_static_string_or_array_from_js_value(
                            source, span, "config", "regions", value,
                        )
                        .await?;
                    }
                    _ => {
                        // Ignore,
                    }
                }
            }
        }
        "dynamic" => {
            let Some(value) = get_value() else {
                return invalid_config(
                    source,
                    "dynamic",
                    span,
                    rcstr!("It mustn't be reexported."),
                    None,
                    IssueSeverity::Error,
                )
                .await;
            };
            if matches!(value, JsValue::Constant(ConstantValue::Undefined)) {
                return Ok(());
            }
            let Some(val) = value.as_str() else {
                return invalid_config(
                    source,
                    "dynamic",
                    span,
                    rcstr!("It needs to be a static string."),
                    Some(&value),
                    IssueSeverity::Error,
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
                        Some(&value),
                        IssueSeverity::Error,
                    )
                    .await;
                }
            };
        }
        "dynamicParams" => {
            let Some(value) = get_value() else {
                return invalid_config(
                    source,
                    "dynamicParams",
                    span,
                    rcstr!("It mustn't be reexported."),
                    None,
                    IssueSeverity::Error,
                )
                .await;
            };
            if matches!(value, JsValue::Constant(ConstantValue::Undefined)) {
                return Ok(());
            }
            let Some(val) = value.as_bool() else {
                return invalid_config(
                    source,
                    "dynamicParams",
                    span,
                    rcstr!("It needs to be a static boolean."),
                    Some(&value),
                    IssueSeverity::Error,
                )
                .await;
            };

            config.dynamic_params = Some(val);
        }
        "revalidate" => {
            let Some(value) = get_value() else {
                return invalid_config(
                    source,
                    "revalidate",
                    span,
                    rcstr!("It mustn't be reexported."),
                    None,
                    IssueSeverity::Error,
                )
                .await;
            };

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
            let Some(value) = get_value() else {
                return invalid_config(
                    source,
                    "fetchCache",
                    span,
                    rcstr!("It mustn't be reexported."),
                    None,
                    IssueSeverity::Error,
                )
                .await;
            };
            if matches!(value, JsValue::Constant(ConstantValue::Undefined)) {
                return Ok(());
            }
            let Some(val) = value.as_str() else {
                return invalid_config(
                    source,
                    "fetchCache",
                    span,
                    rcstr!("It needs to be a static string."),
                    Some(&value),
                    IssueSeverity::Error,
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
                        Some(&value),
                        IssueSeverity::Error,
                    )
                    .await;
                }
            };
        }
        "runtime" => {
            let Some(value) = get_value() else {
                return invalid_config(
                    source,
                    "runtime",
                    span,
                    rcstr!("It mustn't be reexported."),
                    None,
                    IssueSeverity::Error,
                )
                .await;
            };
            if matches!(value, JsValue::Constant(ConstantValue::Undefined)) {
                return Ok(());
            }
            let Some(val) = value.as_str() else {
                return invalid_config(
                    source,
                    "runtime",
                    span,
                    rcstr!("It needs to be a static string."),
                    Some(&value),
                    IssueSeverity::Error,
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
                        Some(&value),
                        IssueSeverity::Error,
                    )
                    .await;
                }
            };
        }
        "preferredRegion" => {
            let Some(value) = get_value() else {
                return invalid_config(
                    source,
                    "preferredRegion",
                    span,
                    rcstr!("It mustn't be reexported."),
                    None,
                    IssueSeverity::Error,
                )
                .await;
            };
            if matches!(value, JsValue::Constant(ConstantValue::Undefined)) {
                return Ok(());
            }

            if let Some(preferred_region) = parse_static_string_or_array_from_js_value(
                source,
                span,
                "preferredRegion",
                "preferredRegion",
                &value,
            )
            .await?
            {
                config.preferred_region = Some(preferred_region);
            }
        }
        "generateImageMetadata" => {
            config.generate_image_metadata = true;
        }
        "generateSitemaps" => {
            config.generate_sitemaps = true;
        }
        "generateStaticParams" => {
            config.generate_static_params = Some(span);
        }
        _ => {}
    }

    Ok(())
}

async fn parse_static_string_or_array_from_js_value(
    source: ResolvedVc<Box<dyn Source>>,
    span: Span,
    key: &str,
    sub_key: &str,
    value: &JsValue,
) -> Result<Option<Vec<RcStr>>> {
    Ok(match value {
        // Single value is turned into a single-element Vec.
        JsValue::Constant(ConstantValue::Str(str)) => Some(vec![str.to_string().into()]),
        // Array of strings is turned into a Vec. If one of the values in not a String it
        // will error.
        JsValue::Array { items, .. } => {
            let mut result = Vec::new();
            for (i, item) in items.iter().enumerate() {
                if let Some(str) = item.as_str() {
                    result.push(str.to_string().into());
                } else {
                    invalid_config(
                        source,
                        key,
                        span,
                        format!(
                            "Entry `{sub_key}[{i}]` needs to be a static string or array of \
                             static strings."
                        )
                        .into(),
                        Some(item),
                        IssueSeverity::Error,
                    )
                    .await?;
                }
            }
            Some(result)
        }
        _ => {
            invalid_config(
                source,
                key,
                span,
                if sub_key != key {
                    format!("`{sub_key}` needs to be a static string or array of static strings.")
                        .into()
                } else {
                    rcstr!("It needs to be a static string or array of static strings.")
                },
                Some(value),
                IssueSeverity::Error,
            )
            .await?;
            return Ok(None);
        }
    })
}

async fn parse_route_matcher_from_js_value(
    source: ResolvedVc<Box<dyn Source>>,
    span: Span,
    value: &JsValue,
) -> Result<Option<Vec<MiddlewareMatcherKind>>> {
    let parse_matcher_kind_matcher = async |value: &JsValue, sub_key: &str, matcher_idx: usize| {
        let mut route_has = vec![];
        if let JsValue::Array { items, .. } = value {
            for (i, item) in items.iter().enumerate() {
                if let JsValue::Object { parts, .. } = item {
                    let mut route_type = None;
                    let mut route_key = None;
                    let mut route_value = None;

                    for matcher_part in parts {
                        if let ObjectPart::KeyValue(part_key, part_value) = matcher_part {
                            match part_key.as_str() {
                                Some("type") => {
                                    if let Some(part_value) = part_value.as_str().filter(|v| {
                                        *v == "header"
                                            || *v == "cookie"
                                            || *v == "query"
                                            || *v == "host"
                                    }) {
                                        route_type = Some(part_value);
                                    } else {
                                        invalid_config(
                                            source,
                                            "config",
                                            span,
                                            format!(
                                                "`matcher[{matcher_idx}].{sub_key}[{i}].type` \
                                                 must be one of the strings: 'header', 'cookie', \
                                                 'query', 'host'"
                                            )
                                            .into(),
                                            Some(part_value),
                                            IssueSeverity::Error,
                                        )
                                        .await?;
                                    }
                                }
                                Some("key") => {
                                    if let Some(part_value) = part_value.as_str() {
                                        route_key = Some(part_value);
                                    } else {
                                        invalid_config(
                                            source,
                                            "config",
                                            span,
                                            format!(
                                                "`matcher[{matcher_idx}].{sub_key}[{i}].key` must \
                                                 be a string"
                                            )
                                            .into(),
                                            Some(part_value),
                                            IssueSeverity::Error,
                                        )
                                        .await?;
                                    }
                                }
                                Some("value") => {
                                    if let Some(part_value) = part_value.as_str() {
                                        route_value = Some(part_value);
                                    } else {
                                        invalid_config(
                                            source,
                                            "config",
                                            span,
                                            format!(
                                                "`matcher[{matcher_idx}].{sub_key}[{i}].value` \
                                                 must be a string"
                                            )
                                            .into(),
                                            Some(part_value),
                                            IssueSeverity::Error,
                                        )
                                        .await?;
                                    }
                                }
                                _ => {
                                    invalid_config(
                                        source,
                                        "config",
                                        span,
                                        format!(
                                            "Unexpected property in \
                                             `matcher[{matcher_idx}].{sub_key}[{i}]` object"
                                        )
                                        .into(),
                                        Some(part_key),
                                        IssueSeverity::Error,
                                    )
                                    .await?;
                                }
                            }
                        }
                    }
                    let r = match route_type {
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

        anyhow::Ok(route_has)
    };

    let mut matchers = vec![];

    match value {
        JsValue::Constant(ConstantValue::Str(matcher)) => {
            matchers.push(MiddlewareMatcherKind::Str(matcher.to_string()));
        }
        JsValue::Array { items, .. } => {
            for (i, item) in items.iter().enumerate() {
                if let Some(matcher) = item.as_str() {
                    matchers.push(MiddlewareMatcherKind::Str(matcher.to_string()));
                } else if let JsValue::Object { parts, .. } = item {
                    let mut matcher = ProxyMatcher::default();
                    let mut had_source = false;
                    for matcher_part in parts {
                        if let ObjectPart::KeyValue(key, value) = matcher_part {
                            match key.as_str() {
                                Some("source") => {
                                    if let Some(value) = value.as_str() {
                                        // TODO the actual validation would be:
                                        // - starts with /
                                        // - at most 4096 chars
                                        // - can be parsed with `path-to-regexp`
                                        had_source = true;
                                        matcher.original_source = value.into();
                                    } else {
                                        invalid_config(
                                            source,
                                            "config",
                                            span,
                                            format!(
                                                "`source` in `matcher[{i}]` object must be a \
                                                 string"
                                            )
                                            .into(),
                                            Some(value),
                                            IssueSeverity::Error,
                                        )
                                        .await?;
                                    }
                                }
                                Some("locale") => {
                                    if let Some(value) = value.as_bool()
                                        && !value
                                    {
                                        matcher.locale = false;
                                    } else if matches!(
                                        value,
                                        JsValue::Constant(ConstantValue::Undefined)
                                    ) {
                                        // ignore
                                    } else {
                                        invalid_config(
                                            source,
                                            "config",
                                            span,
                                            format!(
                                                "`locale` in `matcher[{i}]` object must be false \
                                                 or undefined"
                                            )
                                            .into(),
                                            Some(value),
                                            IssueSeverity::Error,
                                        )
                                        .await?;
                                    }
                                }
                                Some("missing") => {
                                    matcher.missing =
                                        Some(parse_matcher_kind_matcher(value, "missing", i).await?)
                                }
                                Some("has") => {
                                    matcher.has =
                                        Some(parse_matcher_kind_matcher(value, "has", i).await?)
                                }
                                Some("regexp") => {
                                    // ignored for now
                                }
                                _ => {
                                    invalid_config(
                                        source,
                                        "config",
                                        span,
                                        format!("Unexpected property in `matcher[{i}]` object")
                                            .into(),
                                        Some(key),
                                        IssueSeverity::Error,
                                    )
                                    .await?;
                                }
                            }
                        }
                    }
                    if !had_source {
                        invalid_config(
                            source,
                            "config",
                            span,
                            format!("Missing `source` in `matcher[{i}]` object").into(),
                            Some(value),
                            IssueSeverity::Error,
                        )
                        .await?;
                    }

                    matchers.push(MiddlewareMatcherKind::Matcher(matcher));
                } else {
                    invalid_config(
                        source,
                        "config",
                        span,
                        format!(
                            "Entry `matcher[{i}]` need to be static strings or static objects."
                        )
                        .into(),
                        Some(value),
                        IssueSeverity::Error,
                    )
                    .await?;
                }
            }
        }
        _ => {
            invalid_config(
                source,
                "config",
                span,
                rcstr!(
                    "`matcher` needs to be a static string or array of static strings or array of \
                     static objects."
                ),
                Some(value),
                IssueSeverity::Error,
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

/// A wrapper around [`parse_segment_config_from_source`] that merges route segment configuration
/// information from all relevant files (page, layout, parallel routes, etc).
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
        config.apply_parent_config(
            &*parse_segment_config_from_source(source, ParseSegmentMode::App).await?,
        );
    }

    Ok(config)
}
