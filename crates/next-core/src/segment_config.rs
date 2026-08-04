use std::borrow::Cow;

use anyhow::{Result, bail};
use async_trait::async_trait;
use bincode::{Decode, Encode};
use serde::Deserialize;
use serde_json::Value;
use swc_core::{
    common::{DUMMY_SP, GLOBALS, Span, Spanned, source_map::SmallPos},
    ecma::{
        ast::{
            ClassExpr, Decl, ExportSpecifier, Expr, ExprStmt, FnExpr, Lit, ModuleDecl,
            ModuleExportName, ModuleItem, Program, Stmt, Str, TsAsExpr, TsConstAssertion,
            TsSatisfiesExpr, TsTypeAssertion,
        },
        utils::IsDirective,
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
    issue::{Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, StyledString},
    source::Source,
};
use turbopack_ecmascript::{
    EcmascriptInputTransforms, EcmascriptModuleAssetType,
    analyzer::{
        Bump, ConstantNumber, ConstantValue, JsValue, ObjectPart, ThreadLocal, graph::EvalContext,
    },
    parse::{ParseResult, parse},
};

use crate::{
    app_structure::AppPageLoaderTree,
    next_config::RouteHas,
    next_manifests::ProxyMatcher,
    util::{MiddlewareMatcherKind, NextRuntime},
};

#[derive(
    Default,
    PartialEq,
    Eq,
    Clone,
    Copy,
    Debug,
    TraceRawVcs,
    Deserialize,
    NonLocalValue,
    Encode,
    Decode,
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
    Default,
    PartialEq,
    Eq,
    Clone,
    Copy,
    Debug,
    TraceRawVcs,
    Deserialize,
    NonLocalValue,
    Encode,
    Decode,
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
    Default, PartialEq, Eq, Clone, Copy, Debug, TraceRawVcs, NonLocalValue, Encode, Decode,
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
    #[bincode(with_serde)]
    pub generate_static_params: Option<Span>,
    #[turbo_tasks(trace_ignore)]
    #[bincode(with_serde)]
    pub instant: Option<Span>,
    #[turbo_tasks(trace_ignore)]
    #[bincode(with_serde)]
    pub prefetch: Option<Span>,
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
                (Some(a), Some(b)) if *a != *b => {
                    bail!(
                        "Sibling segment configs have conflicting values for {}",
                        name
                    )
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

#[cfg(not(feature = "sync"))]
#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for NextSegmentConfigParsingIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Line(vec![
            StyledString::Text(
                format!(
                    "Next.js can't recognize the exported `{}` field in route. ",
                    self.key,
                )
                .into(),
            ),
            StyledString::Text(self.error.clone()),
        ]))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Parse
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(turbo_tasks::read!(self.ident)?.path.clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(rcstr!(
            "The exported configuration object in a source file needs to have a very specific \
             format from which some properties can be statically parsed at compiled-time."
        ))))
    }

    async fn detail(&self) -> Result<Option<StyledString>> {
        match self.detail {
            Some(d) => Ok(Some((*turbo_tasks::read!(d)?).clone())),
            None => Ok(None),
        }
    }

    fn documentation_link(&self) -> RcStr {
        rcstr!("https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config")
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.source)
    }
}

#[cfg(feature = "sync")]
#[turbo_tasks::value_impl]
impl Issue for NextSegmentConfigParsingIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Line(vec![
            StyledString::Text(
                format!(
                    "Next.js can't recognize the exported `{}` field in route. ",
                    self.key,
                )
                .into(),
            ),
            StyledString::Text(self.error.clone()),
        ]))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Parse
    }

    fn file_path(&self) -> Result<FileSystemPath> {
        Ok(turbo_tasks::read!(self.ident)?.path.clone())
    }

    fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(rcstr!(
            "The exported configuration object in a source file needs to have a very specific \
             format from which some properties can be statically parsed at compiled-time."
        ))))
    }

    fn detail(&self) -> Result<Option<StyledString>> {
        match self.detail {
            Some(d) => Ok(Some((*turbo_tasks::read!(d)?).clone())),
            None => Ok(None),
        }
    }

    fn documentation_link(&self) -> RcStr {
        rcstr!("https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config")
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.source)
    }
}

#[turbo_tasks::task_input]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, TraceRawVcs, Encode, Decode)]
pub enum ParseSegmentMode {
    Base,
    // Disallows "use client + generateStatic" and ignores/warns about `export const config`
    App,
    // Disallows config = { runtime: "edge" }
    Proxy,
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
    let ident = turbo_tasks::read!(source.ident())?;
    let path = &ident.path;

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

    let result = &*turbo_tasks::read!(parse(
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
        // node_env is not used here: EcmascriptInputTransforms::empty() means no
        // transforms are applied, so TransformContext::node_env is never accessed.
        rcstr!("development"),
        false,
        false,
    ))?;

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

    // Arena for the `JsValue`s produced while evaluating config expressions;
    // freed when this function returns.
    let arena = ThreadLocal::new();
    // The async build drives the config-parsing future through `WrapFuture` so swc
    // `GLOBALS` are set on every poll; the sync build has no await points, so it runs
    // the same body inline inside a single `GLOBALS.set` scope (and `parse` is a plain
    // closure rather than an `async` one).
    #[cfg(not(feature = "sync"))]
    let config = turbo_tasks::read!(WrapFuture::new(
        async {
            let mut config = NextSegmentConfig::default();

            let mut parse = async |ident, init, span| {
                turbo_tasks::read!(parse_config_value(
                    source,
                    mode,
                    &mut config,
                    eval_context,
                    &arena,
                    ident,
                    init,
                    span,
                ))
            };

            for item in &module_ast.body {
                match item {
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(decl)) => match &decl.decl {
                        Decl::Class(decl) => turbo_tasks::read!(parse(
                            Cow::Borrowed(decl.ident.sym.as_str()),
                            Some(Cow::Owned(Expr::Class(ClassExpr {
                                ident: None,
                                class: decl.class.clone(),
                            }))),
                            decl.span(),
                        ))?,
                        Decl::Fn(decl) => turbo_tasks::read!(parse(
                            Cow::Borrowed(decl.ident.sym.as_str()),
                            Some(Cow::Owned(Expr::Fn(FnExpr {
                                ident: None,
                                function: decl.function.clone(),
                            }))),
                            decl.span(),
                        ))?,
                        Decl::Var(decl) => {
                            for decl in &decl.decls {
                                let Some(ident) = decl.name.as_ident() else {
                                    continue;
                                };

                                let key = &ident.id.sym;

                                turbo_tasks::read!(parse(
                                    Cow::Borrowed(key.as_str()),
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
                                ))?;
                            }
                        }
                        _ => continue,
                    },
                    ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(named)) => {
                        for specifier in &named.specifiers {
                            if let ExportSpecifier::Named(named) = specifier {
                                turbo_tasks::read!(parse(
                                    match named.exported.as_ref().unwrap_or(&named.orig) {
                                        ModuleExportName::Ident(ident) => {
                                            Cow::Borrowed(ident.sym.as_str())
                                        }
                                        ModuleExportName::Str(s) => s.value.to_string_lossy(),
                                    },
                                    None,
                                    specifier.span(),
                                ))?;
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
    ))?;
    #[cfg(feature = "sync")]
    let config = GLOBALS.set(globals, || {
        let mut config = NextSegmentConfig::default();

        let mut parse = |ident, init, span| {
            turbo_tasks::read!(parse_config_value(
                source,
                mode,
                &mut config,
                eval_context,
                &arena,
                ident,
                init,
                span,
            ))
        };

        for item in &module_ast.body {
            match item {
                ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(decl)) => match &decl.decl {
                    Decl::Class(decl) => turbo_tasks::read!(parse(
                        Cow::Borrowed(decl.ident.sym.as_str()),
                        Some(Cow::Owned(Expr::Class(ClassExpr {
                            ident: None,
                            class: decl.class.clone(),
                        }))),
                        decl.span(),
                    ))?,
                    Decl::Fn(decl) => turbo_tasks::read!(parse(
                        Cow::Borrowed(decl.ident.sym.as_str()),
                        Some(Cow::Owned(Expr::Fn(FnExpr {
                            ident: None,
                            function: decl.function.clone(),
                        }))),
                        decl.span(),
                    ))?,
                    Decl::Var(decl) => {
                        for decl in &decl.decls {
                            let Some(ident) = decl.name.as_ident() else {
                                continue;
                            };

                            let key = &ident.id.sym;

                            turbo_tasks::read!(parse(
                                Cow::Borrowed(key.as_str()),
                                Some(
                                    decl.init
                                        .as_deref()
                                        .map(Cow::Borrowed)
                                        .unwrap_or_else(|| Cow::Owned(*Expr::undefined(DUMMY_SP)),),
                                ),
                                // The config object can span hundreds of lines. Don't
                                // highlight the whole thing
                                if key == "config" {
                                    ident.id.span
                                } else {
                                    decl.span()
                                },
                            ))?;
                        }
                    }
                    _ => continue,
                },
                ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(named)) => {
                    for specifier in &named.specifiers {
                        if let ExportSpecifier::Named(named) = specifier {
                            turbo_tasks::read!(parse(
                                match named.exported.as_ref().unwrap_or(&named.orig) {
                                    ModuleExportName::Ident(ident) => {
                                        Cow::Borrowed(ident.sym.as_str())
                                    }
                                    ModuleExportName::Str(s) => s.value.to_string_lossy(),
                                },
                                None,
                                specifier.span(),
                            ))?;
                        }
                    }
                }
                _ => {
                    continue;
                }
            }
        }
        anyhow::Ok(config)
    })?;

    let is_client_entry = module_ast
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
        });

    if mode == ParseSegmentMode::App && is_client_entry {
        if let Some(span) = config.generate_static_params {
            turbo_tasks::read!(invalid_config(
                source,
                "generateStaticParams",
                span,
                rcstr!(
                    "App pages cannot use both \"use client\" and export function \
                     \"generateStaticParams()\"."
                ),
                None,
                IssueSeverity::Error,
            ))?;
        }

        if let Some(span) = config.instant {
            turbo_tasks::read!(invalid_config(
                source,
                "instant",
                span,
                rcstr!(
                    "\"instant\" is a route segment config and can only be used when the segment \
                     is a Server Component module. Remove the \"use client\" directive to use \
                     this API."
                ),
                None,
                IssueSeverity::Error,
            ))?;
        }

        if let Some(span) = config.prefetch {
            turbo_tasks::read!(invalid_config(
                source,
                "prefetch",
                span,
                rcstr!(
                    "\"prefetch\" is a route segment config and can only be used when the segment \
                     is a Server Component module. Remove the \"use client\" directive to use \
                     this API."
                ),
                None,
                IssueSeverity::Error,
            ))?;
        }
    }

    Ok(config.cell())
}

turbo_tasks::dual_fn! {
fn invalid_config(
    source: ResolvedVc<Box<dyn Source>>,
    key: &str,
    span: Span,
    error: RcStr,
    value: Option<&JsValue<'_>>,
    severity: IssueSeverity,
) -> Result<()> {
    let detail = if let Some(value) = value {
        let (explainer, hints) = value.explain(2, 0);
        Some(*StyledString::Text(format!("Got {explainer}.{hints}").into()).resolved_cell())
    } else {
        None
    };

    turbo_tasks::read!(NextSegmentConfigParsingIssue::new(
        source.ident(),
        key.into(),
        error,
        detail,
        IssueSource::from_swc_offsets(source, span.lo.to_u32(), span.hi.to_u32()),
        severity,
    )
    .to_resolved())
    ?
    .emit();
    Ok(())
}
}

turbo_tasks::dual_fn! {
fn parse_config_value(
    source: ResolvedVc<Box<dyn Source>>,
    mode: ParseSegmentMode,
    config: &mut NextSegmentConfig,
    eval_context: &EvalContext,
    arena: &ThreadLocal<Bump>,
    key: Cow<'_, str>,
    init: Option<Cow<'_, Expr>>,
    span: Span,
) -> Result<()> {
    let get_value = || {
        let init = init.as_deref();
        // Unwrap typecasts such as `export const config = { .. } satisfies ProxyConfig`, usually
        // this is already transpiled away, but we are looking at the original source here.
        let init = match init {
            Some(Expr::TsAs(TsAsExpr { expr, .. }))
            | Some(Expr::TsTypeAssertion(TsTypeAssertion { expr, .. }))
            | Some(Expr::TsConstAssertion(TsConstAssertion { expr, .. }))
            | Some(Expr::TsSatisfies(TsSatisfiesExpr { expr, .. })) => Some(&**expr),
            _ => init,
        };
        init.map(|init| eval_context.eval(arena.get_or_default(), init))
            .map(|v| {
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

    match &*key {
        "config" => {
            let Some(value) = get_value() else {
                return turbo_tasks::read!(invalid_config(
                    source,
                    "config",
                    span,
                    rcstr!("It mustn't be reexported."),
                    None,
                    IssueSeverity::Error,
                ))
                ;
            };

            if mode == ParseSegmentMode::App {
                return turbo_tasks::read!(invalid_config(
                    source,
                    "config",
                    span,
                    rcstr!(
                        "Page config in `config` is deprecated and ignored, use individual \
                         exports instead."
                    ),
                    Some(&value),
                    IssueSeverity::Warning,
                ))
                ;
            }

            let JsValue::Object { parts, .. } = &value else {
                return turbo_tasks::read!(invalid_config(
                    source,
                    "config",
                    span,
                    rcstr!("It needs to be a static object."),
                    Some(&value),
                    IssueSeverity::Error,
                ))
                ;
            };

            for part in parts {
                let ObjectPart::KeyValue(key, value) = part else {
                    return turbo_tasks::read!(invalid_config(
                        source,
                        "config",
                        span,
                        rcstr!("It contains unsupported spread."),
                        Some(&value),
                        IssueSeverity::Error,
                    ))
                    ;
                };

                let Some(key) = key.as_str() else {
                    return turbo_tasks::read!(invalid_config(
                        source,
                        "config",
                        span,
                        rcstr!("It must only contain string keys."),
                        Some(value),
                        IssueSeverity::Error,
                    ))
                    ;
                };

                if matches!(value, JsValue::Constant(ConstantValue::Undefined)) {
                    continue;
                }
                match key {
                    "runtime" => {
                        let Some(val) = value.as_str() else {
                            return turbo_tasks::read!(invalid_config(
                                source,
                                "config",
                                span,
                                rcstr!("`runtime` needs to be a static string."),
                                Some(value),
                                IssueSeverity::Error,
                            ))
                            ;
                        };

                        let runtime = match serde_json::from_value(Value::String(val.to_string())) {
                            Ok(runtime) => Some(runtime),
                            Err(err) => {
                                return turbo_tasks::read!(invalid_config(
                                    source,
                                    "config",
                                    span,
                                    format!("`runtime` has an invalid value: {err}.").into(),
                                    Some(value),
                                    IssueSeverity::Error,
                                ))
                                ;
                            }
                        };

                        if mode == ParseSegmentMode::Proxy && runtime == Some(NextRuntime::Edge) {
                            turbo_tasks::read!(invalid_config(
                                source,
                                "config",
                                span,
                                rcstr!("Proxy does not support Edge runtime."),
                                Some(value),
                                IssueSeverity::Error,
                            ))
                            ?;
                            continue;
                        }

                        config.runtime = runtime
                    }
                    "matcher" => {
                        config.middleware_matcher =
                            turbo_tasks::read!(parse_route_matcher_from_js_value(source, span, value))?;
                    }
                    "regions" => {
                        config.preferred_region = turbo_tasks::read!(parse_static_string_or_array_from_js_value(
                            source, span, "config", "regions", value,
                        ))
                        ?;
                    }
                    _ => {
                        // Ignore,
                    }
                }
            }
        }
        "dynamic" => {
            let Some(value) = get_value() else {
                return turbo_tasks::read!(invalid_config(
                    source,
                    "dynamic",
                    span,
                    rcstr!("It mustn't be reexported."),
                    None,
                    IssueSeverity::Error,
                ))
                ;
            };
            if matches!(value, JsValue::Constant(ConstantValue::Undefined)) {
                return Ok(());
            }
            let Some(val) = value.as_str() else {
                return turbo_tasks::read!(invalid_config(
                    source,
                    "dynamic",
                    span,
                    rcstr!("It needs to be a static string."),
                    Some(&value),
                    IssueSeverity::Error,
                ))
                ;
            };

            config.dynamic = match serde_json::from_value(Value::String(val.to_string())) {
                Ok(dynamic) => Some(dynamic),
                Err(err) => {
                    return turbo_tasks::read!(invalid_config(
                        source,
                        "dynamic",
                        span,
                        format!("It has an invalid value: {err}.").into(),
                        Some(&value),
                        IssueSeverity::Error,
                    ))
                    ;
                }
            };
        }
        "dynamicParams" => {
            let Some(value) = get_value() else {
                return turbo_tasks::read!(invalid_config(
                    source,
                    "dynamicParams",
                    span,
                    rcstr!("It mustn't be reexported."),
                    None,
                    IssueSeverity::Error,
                ))
                ;
            };
            if matches!(value, JsValue::Constant(ConstantValue::Undefined)) {
                return Ok(());
            }
            let Some(val) = value.as_bool() else {
                return turbo_tasks::read!(invalid_config(
                    source,
                    "dynamicParams",
                    span,
                    rcstr!("It needs to be a static boolean."),
                    Some(&value),
                    IssueSeverity::Error,
                ))
                ;
            };

            config.dynamic_params = Some(val);
        }
        "revalidate" => {
            let Some(value) = get_value() else {
                return turbo_tasks::read!(invalid_config(
                    source,
                    "revalidate",
                    span,
                    rcstr!("It mustn't be reexported."),
                    None,
                    IssueSeverity::Error,
                ))
                ;
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
                return turbo_tasks::read!(invalid_config(
                    source,
                    "fetchCache",
                    span,
                    rcstr!("It mustn't be reexported."),
                    None,
                    IssueSeverity::Error,
                ))
                ;
            };
            if matches!(value, JsValue::Constant(ConstantValue::Undefined)) {
                return Ok(());
            }
            let Some(val) = value.as_str() else {
                return turbo_tasks::read!(invalid_config(
                    source,
                    "fetchCache",
                    span,
                    rcstr!("It needs to be a static string."),
                    Some(&value),
                    IssueSeverity::Error,
                ))
                ;
            };

            config.fetch_cache = match serde_json::from_value(Value::String(val.to_string())) {
                Ok(fetch_cache) => Some(fetch_cache),
                Err(err) => {
                    return turbo_tasks::read!(invalid_config(
                        source,
                        "fetchCache",
                        span,
                        format!("It has an invalid value: {err}.").into(),
                        Some(&value),
                        IssueSeverity::Error,
                    ))
                    ;
                }
            };
        }
        "runtime" => {
            let Some(value) = get_value() else {
                return turbo_tasks::read!(invalid_config(
                    source,
                    "runtime",
                    span,
                    rcstr!("It mustn't be reexported."),
                    None,
                    IssueSeverity::Error,
                ))
                ;
            };
            if matches!(value, JsValue::Constant(ConstantValue::Undefined)) {
                return Ok(());
            }
            let Some(val) = value.as_str() else {
                return turbo_tasks::read!(invalid_config(
                    source,
                    "runtime",
                    span,
                    rcstr!("It needs to be a static string."),
                    Some(&value),
                    IssueSeverity::Error,
                ))
                ;
            };

            config.runtime = match serde_json::from_value(Value::String(val.to_string())) {
                Ok(runtime) => Some(runtime),
                Err(err) => {
                    return turbo_tasks::read!(invalid_config(
                        source,
                        "runtime",
                        span,
                        format!("It has an invalid value: {err}.").into(),
                        Some(&value),
                        IssueSeverity::Error,
                    ))
                    ;
                }
            };
        }
        "preferredRegion" => {
            let Some(value) = get_value() else {
                return turbo_tasks::read!(invalid_config(
                    source,
                    "preferredRegion",
                    span,
                    rcstr!("It mustn't be reexported."),
                    None,
                    IssueSeverity::Error,
                ))
                ;
            };
            if matches!(value, JsValue::Constant(ConstantValue::Undefined)) {
                return Ok(());
            }

            if let Some(preferred_region) = turbo_tasks::read!(parse_static_string_or_array_from_js_value(
                source,
                span,
                "preferredRegion",
                "preferredRegion",
                &value,
            ))
            ?
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
        "instant" => {
            config.instant = Some(span);
        }
        "prefetch" => {
            config.prefetch = Some(span);
        }
        _ => {}
    }

    Ok(())
}
}

turbo_tasks::dual_fn! {
fn parse_static_string_or_array_from_js_value(
    source: ResolvedVc<Box<dyn Source>>,
    span: Span,
    key: &str,
    sub_key: &str,
    value: &JsValue<'_>,
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
                    turbo_tasks::read!(invalid_config(
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
                    ))
                    ?;
                }
            }
            Some(result)
        }
        _ => {
            turbo_tasks::read!(invalid_config(
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
            ))
            ?;
            return Ok(None);
        }
    })
}
}

turbo_tasks::dual_fn! {
fn parse_route_matcher_from_js_value(
    source: ResolvedVc<Box<dyn Source>>,
    span: Span,
    value: &JsValue<'_>,
) -> Result<Option<Vec<MiddlewareMatcherKind>>> {
    // A dual-mode nested helper (a closure can't be `async` in the sync build; a
    // `dual_fn!` fn can't capture, so `source`/`span` become explicit params).
    turbo_tasks::dual_fn! {
    fn parse_matcher_kind_matcher(
        source: ResolvedVc<Box<dyn Source>>,
        span: Span,
        value: &JsValue<'_>,
        sub_key: &str,
        matcher_idx: usize,
    ) -> Result<Vec<RouteHas>> {
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
                                            turbo_tasks::read!(invalid_config(
                                                source,
                                                "config",
                                                span,
                                                format!(
                                                    "`matcher[{matcher_idx}].{sub_key}[{i}].type` \
                                                     must be one of the strings: 'header', \
                                                     'cookie', 'query', 'host'"
                                                )
                                                .into(),
                                                Some(part_value),
                                                IssueSeverity::Error,
                                            ))
                                            ?;
                                        }
                                    }
                                    Some("key") => {
                                        if let Some(part_value) = part_value.as_str() {
                                            route_key = Some(part_value);
                                        } else {
                                            turbo_tasks::read!(invalid_config(
                                                source,
                                                "config",
                                                span,
                                                format!(
                                                    "`matcher[{matcher_idx}].{sub_key}[{i}].key` \
                                                     must be a string"
                                                )
                                                .into(),
                                                Some(part_value),
                                                IssueSeverity::Error,
                                            ))
                                            ?;
                                        }
                                    }
                                    Some("value") => {
                                        if let Some(part_value) = part_value.as_str() {
                                            route_value = Some(part_value);
                                        } else {
                                            turbo_tasks::read!(invalid_config(
                                                source,
                                                "config",
                                                span,
                                                format!(
                                                    "`matcher[{matcher_idx}].{sub_key}[{i}].\
                                                     value` must be a string"
                                                )
                                                .into(),
                                                Some(part_value),
                                                IssueSeverity::Error,
                                            ))
                                            ?;
                                        }
                                    }
                                    _ => {
                                        turbo_tasks::read!(invalid_config(
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
                                        ))
                                        ?;
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
    }
    }

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
                                        turbo_tasks::read!(invalid_config(
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
                                        ))
                                        ?;
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
                                        turbo_tasks::read!(invalid_config(
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
                                        ))
                                        ?;
                                    }
                                }
                                Some("missing") => {
                                    matcher.missing =
                                        Some(turbo_tasks::read!(parse_matcher_kind_matcher(source, span, value, "missing", i))?)
                                }
                                Some("has") => {
                                    matcher.has =
                                        Some(turbo_tasks::read!(parse_matcher_kind_matcher(source, span, value, "has", i))?)
                                }
                                Some("regexp") => {
                                    // ignored for now
                                }
                                _ => {
                                    turbo_tasks::read!(invalid_config(
                                        source,
                                        "config",
                                        span,
                                        format!("Unexpected property in `matcher[{i}]` object")
                                            .into(),
                                        Some(key),
                                        IssueSeverity::Error,
                                    ))
                                    ?;
                                }
                            }
                        }
                    }
                    if !had_source {
                        turbo_tasks::read!(invalid_config(
                            source,
                            "config",
                            span,
                            format!("Missing `source` in `matcher[{i}]` object").into(),
                            Some(value),
                            IssueSeverity::Error,
                        ))
                        ?;
                    }

                    matchers.push(MiddlewareMatcherKind::Matcher(matcher));
                } else {
                    turbo_tasks::read!(invalid_config(
                        source,
                        "config",
                        span,
                        format!(
                            "Entry `matcher[{i}]` need to be static strings or static objects."
                        )
                        .into(),
                        Some(value),
                        IssueSeverity::Error,
                    ))
                    ?;
                }
            }
        }
        _ => {
            turbo_tasks::read!(invalid_config(
                source,
                "config",
                span,
                rcstr!(
                    "`matcher` needs to be a static string or array of static strings or array of \
                     static objects."
                ),
                Some(value),
                IssueSeverity::Error,
            ))
            ?
        }
    }

    Ok(if matchers.is_empty() {
        None
    } else {
        Some(matchers)
    })
}
}

/// A wrapper around [`parse_segment_config_from_source`] that merges route segment configuration
/// information from all relevant files (page, layout, parallel routes, etc).
#[turbo_tasks::function]
pub async fn parse_segment_config_from_loader_tree(
    loader_tree: Vc<AppPageLoaderTree>,
) -> Result<Vc<NextSegmentConfig>> {
    let loader_tree = &*turbo_tasks::read!(loader_tree)?;

    Ok(turbo_tasks::read!(parse_segment_config_from_loader_tree_internal(loader_tree))?.cell())
}

turbo_tasks::dual_fn! {
fn parse_segment_config_from_loader_tree_internal(
    loader_tree: &AppPageLoaderTree,
) -> Result<NextSegmentConfig> {
    let mut config = NextSegmentConfig::default();

    // Async recursion needs boxing + try_join fan-out; the sync build recurses on the
    // real stack (bounded tree depth) and collects sequentially.
    #[cfg(not(feature = "sync"))]
    let parallel_configs = turbo_tasks::read!(loader_tree
        .parallel_routes
        .values()
        .map(|loader_tree| async move {
            turbo_tasks::read!(Box::pin(parse_segment_config_from_loader_tree_internal(loader_tree)))
        })
        .try_join())
        ?;
    #[cfg(feature = "sync")]
    let parallel_configs = {
        let mut parallel_configs = Vec::new();
        for loader_tree in loader_tree.parallel_routes.values() {
            parallel_configs
                .push(parse_segment_config_from_loader_tree_internal(loader_tree)?);
        }
        parallel_configs
    };

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
            &*turbo_tasks::read!(parse_segment_config_from_source(source, ParseSegmentMode::App))?,
        );
    }

    Ok(config)
}
}
