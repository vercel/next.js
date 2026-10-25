mod jsx_source_spans;

use std::{
    fmt::Debug,
    hash::Hash,
    sync::{Arc, Mutex},
};

use anyhow::{Result, bail};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use swc_core::{
    atoms::{Atom, atom},
    base::SwcComments,
    common::{Mark, SourceMap, comments::Comments},
    ecma::{
        ast::{
            ArrowExpr, ArrowFunctionBody, Expr, ExprStmt, Function, Id, ImportDecl, Lit,
            ModuleDecl, ModuleItem, Pass, Program, Stmt,
        },
        preset_env::{self, Feature, FeatureOrModule, Targets},
        transforms::{
            base::{
                assumptions::Assumptions,
                helpers::{HELPERS, HelperData, Helpers},
            },
            react::react,
            typescript::{Config, TsxConfig, tsx, typescript},
        },
        utils::IsDirective,
        visit::{Visit, VisitWith},
    },
    quote,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    environment::Environment,
    issue::{Issue, IssueSeverity, IssueSource, IssueStage, StyledString},
    source::Source,
};

use crate::runtime_functions::{TURBOPACK_MODULE, TURBOPACK_REFRESH};

/// Additional options for SWC's preset-env, beyond the browserslist-derived
/// targets that are already provided by the `Environment`.
///
/// These correspond to the fields documented at
/// <https://swc.rs/docs/configuration/supported-browsers>.
#[turbo_tasks::value(shared)]
#[derive(Default, Clone, Debug)]
pub struct PresetEnvConfig {
    /// Polyfill injection mode (`"usage"` or `"entry"`), matching Babel's
    /// `useBuiltIns`.
    pub mode: Option<RcStr>,
    /// The core-js version string (e.g. `"3.38"`).
    pub core_js: Option<RcStr>,
    /// Core-js modules or SWC transform passes to skip.
    pub skip: Option<Vec<RcStr>>,
    /// Core-js modules or SWC transform passes to always include.
    pub include: Option<Vec<RcStr>>,
    /// Core-js modules or SWC transform passes to always exclude.
    pub exclude: Option<Vec<RcStr>>,
    /// Enable shipped TC39 proposals.
    pub shipped_proposals: Option<bool>,
    /// Force all transforms regardless of targets.
    pub force_all_transforms: Option<bool>,
    /// Enable debug output.
    pub debug: Option<bool>,
    /// Enable loose mode for transforms.
    pub loose: Option<bool>,
}

#[turbo_tasks::value]
#[derive(Debug, Clone, Hash)]
pub enum EcmascriptInputTransform {
    Plugin(ResolvedVc<TransformPlugin>),
    PresetEnv(ResolvedVc<Environment>, ResolvedVc<PresetEnvConfig>),
    React {
        development: bool,
        refresh: bool,
        // swc.jsc.transform.react.importSource
        import_source: ResolvedVc<Option<RcStr>>,
        // swc.jsc.transform.react.runtime,
        runtime: ResolvedVc<Option<RcStr>>,
        /// Per-parse observation only for private Browser source coverage.
        capture_browser_jsx_imports: bool,
    },
    // These options are subset of swc_core::ecma::transforms::typescript::Config, but
    // it doesn't derive `Copy` so repeating values in here
    TypeScript {
        use_define_for_class_fields: bool,
        verbatim_module_syntax: bool,
        /// Only private Browser source coverage .tsx rules set this.
        preserve_jsx_imports: bool,
    },
    Decorators {
        is_legacy: bool,
        is_ecma: bool,
        emit_decorators_metadata: bool,
        use_define_for_class_fields: bool,
    },
    ReactCompilerRust {
        options: ReactCompilerTransformOptions,
        target: ReactCompilerTarget,
    },
}

#[turbo_tasks::value(shared, operation)]
#[derive(Default, Debug, Clone, Copy, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReactCompilerTransformOptions {
    #[serde(default)]
    pub compilation_mode: ReactCompilerCompilationMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enable_preserve_existing_memoization_guarantees: Option<bool>,
}

#[turbo_tasks::value(shared, operation)]
#[derive(Default, Debug, Clone, Copy, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReactCompilerCompilationMode {
    #[default]
    Infer,
    Annotation,
    All,
}

impl ReactCompilerCompilationMode {
    pub fn as_str(self) -> &'static str {
        match self {
            ReactCompilerCompilationMode::Infer => "infer",
            ReactCompilerCompilationMode::Annotation => "annotation",
            ReactCompilerCompilationMode::All => "all",
        }
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionReactCompilerTransformOptions(Option<ReactCompilerTransformOptions>);

#[turbo_tasks::value(shared, operation)]
#[derive(Default, Debug, Clone, Copy, Hash, Serialize, Deserialize)]
pub enum ReactCompilerTarget {
    #[default]
    #[serde(rename = "19")]
    React19,
    #[serde(rename = "18")]
    React18,
}

impl ReactCompilerTarget {
    pub fn as_str(self) -> &'static str {
        match self {
            ReactCompilerTarget::React19 => "19",
            ReactCompilerTarget::React18 => "18",
        }
    }
}

/// The CustomTransformer trait allows you to implement your own custom SWC
/// transformer to run over all ECMAScript files imported in the graph.
#[async_trait]
pub trait CustomTransformer: Debug {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()>;
}

/// A wrapper around a TransformPlugin instance, allowing it to operate with
/// the turbo_task caching requirements.
#[turbo_tasks::value(transparent, serialization = "skip", eq = "manual", cell = "new")]
#[derive(Debug)]
pub struct TransformPlugin(#[turbo_tasks(unsafe_ignore)] Box<dyn CustomTransformer + Send + Sync>);

#[async_trait]
impl CustomTransformer for TransformPlugin {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        self.0.transform(program, ctx).await
    }
}

#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone, Hash)]
pub struct EcmascriptInputTransforms(Vec<EcmascriptInputTransform>);

#[turbo_tasks::value_impl]
impl EcmascriptInputTransforms {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Vec::new())
    }

    #[turbo_tasks::function]
    pub async fn extend(self: Vc<Self>, other: Vc<EcmascriptInputTransforms>) -> Result<Vc<Self>> {
        let mut transforms = self.owned().await?;
        transforms.extend(other.owned().await?);
        Ok(Vc::cell(transforms))
    }
}

/// An import introduced by the actual React transform in one owned parse.
/// Binding IDs are retained only until native import code generation; no source
/// location or emitted name is manufactured from these facts.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BrowserJsxImport {
    pub(crate) request: String,
    pub(crate) bindings: Vec<Id>,
}

impl BrowserJsxImport {
    pub(crate) fn from_import(import: &ImportDecl) -> Self {
        Self {
            request: import.src.value.to_string_lossy().into_owned(),
            bindings: import
                .specifiers
                .iter()
                .map(|specifier| specifier.local().to_id())
                .collect(),
        }
    }

    pub(crate) fn capture(program: &Program) -> Vec<Self> {
        let Program::Module(module) = program else {
            return Vec::new();
        };
        module
            .body
            .iter()
            .filter_map(|item| match item {
                ModuleItem::ModuleDecl(ModuleDecl::Import(import)) => {
                    Some(Self::from_import(import))
                }
                _ => None,
            })
            .collect()
    }

    pub(crate) fn inserted(before: &[Self], program: &Program) -> Vec<Self> {
        Self::capture(program)
            .into_iter()
            .filter(|import| {
                !import.bindings.is_empty()
                    && import
                        .bindings
                        .iter()
                        .all(|binding| before.iter().all(|prior| !prior.bindings.contains(binding)))
            })
            .collect()
    }
}

pub struct TransformContext<'a> {
    pub comments: &'a SwcComments,
    pub top_level_mark: Mark,
    pub unresolved_mark: Mark,
    pub source_map: &'a Arc<SourceMap>,
    pub file_path_str: &'a str,
    pub file_name_str: &'a str,
    pub file_name_hash: u128,
    pub query_str: RcStr,
    pub file_path: FileSystemPath,
    pub source: ResolvedVc<Box<dyn Source>>,
    /// Original source text; used by transforms that need the raw text (e.g.
    /// `swc_ecma_react_compiler`).
    pub source_text: &'a str,
    /// The value of `process.env.NODE_ENV` for this compilation
    /// (e.g. `"development"` or `"production"`).
    pub node_env: RcStr,
    /// Owned by this parse, populated only around its opted-in React transform.
    pub browser_jsx_imports: Option<&'a Mutex<Vec<BrowserJsxImport>>>,
}

/// Use actual JSX use and the same native directive parser as JSX lowering.
/// The strip-only null counterpart cannot reserve an unrelated source binding.
fn browser_coverage_tsx_config(
    program: &Program,
    source_map: &Arc<SourceMap>,
    comments: &SwcComments,
    top_level_mark: Mark,
) -> Option<TsxConfig> {
    use swc_core::{
        common::Spanned,
        ecma::{codegen::to_code, transforms::react::JsxDirectives},
    };

    #[derive(Default)]
    struct JsxUse {
        any: bool,
        fragment: bool,
    }
    impl Visit for JsxUse {
        fn visit_jsx_element(&mut self, element: &swc_core::ecma::ast::JSXElement) {
            self.any = true;
            element.visit_children_with(self);
        }
        fn visit_jsx_fragment(&mut self, fragment: &swc_core::ecma::ast::JSXFragment) {
            self.any = true;
            self.fragment = true;
            fragment.visit_children_with(self);
        }
    }
    let mut used = JsxUse::default();
    program.visit_with(&mut used);
    if !used.any {
        return None;
    }
    let Program::Module(module) = program else {
        return None;
    };
    let span = if module.shebang.is_some() {
        module.span.with_lo(
            module
                .body
                .first()
                .map_or(module.span.lo, |item| item.span_lo()),
        )
    } else {
        module.span
    };
    let directives = comments.with_leading(span.lo, |comments| {
        JsxDirectives::from_comments(source_map, span, comments, top_level_mark)
    });
    Some(TsxConfig {
        pragma: directives
            .pragma
            .as_deref()
            .map(|expression| to_code(&**expression).into()),
        pragma_frag: if used.fragment {
            directives
                .pragma_frag
                .as_deref()
                .map(|expression| to_code(&**expression).into())
        } else {
            // SWC explicitly accepts literal null as a nonbinding pragma. This
            // only controls import-use analysis; actual JSX lowering still sees
            // the original source, comments, runtime and fragment settings.
            Some("null".into())
        },
    })
}

impl EcmascriptInputTransform {
    pub async fn apply(
        &self,
        program: &mut Program,
        ctx: &TransformContext<'_>,
        helpers: HelperData,
    ) -> Result<HelperData> {
        let &TransformContext {
            comments,
            source_map,
            top_level_mark,
            unresolved_mark,
            ..
        } = ctx;

        Ok(match self {
            EcmascriptInputTransform::React {
                development,
                refresh,
                import_source,
                runtime,
                capture_browser_jsx_imports,
            } => {
                use swc_core::ecma::transforms::react::{Options, Runtime};
                let runtime = if let Some(runtime) = &*runtime.await? {
                    match runtime.as_str() {
                        "classic" => Runtime::Classic,
                        "automatic" => Runtime::Automatic,
                        _ => {
                            bail!(
                                "Invalid value for swc.jsc.transform.react.runtime: {}",
                                runtime
                            );
                        }
                    }
                } else {
                    Runtime::Automatic
                };

                let jsx_props_spans = matches!(runtime, Runtime::Automatic)
                    .then(|| jsx_source_spans::JsxPropsSourceSpans::capture(program));
                let config = Options {
                    runtime: Some(runtime),
                    development: Some(*development),
                    import_source: import_source.await?.as_deref().map(Atom::from),
                    refresh: if *refresh {
                        debug_assert_eq!(TURBOPACK_REFRESH.full, "__turbopack_context__.k");
                        Some(swc_core::ecma::transforms::react::RefreshOptions {
                            refresh_reg: atom!("__turbopack_context__.k.register"),
                            refresh_sig: atom!("__turbopack_context__.k.signature"),
                            ..Default::default()
                        })
                    } else {
                        None
                    },
                    ..Default::default()
                };

                let before_imports =
                    (*capture_browser_jsx_imports).then(|| BrowserJsxImport::capture(program));

                // Explicit type annotation to ensure that we don't duplicate transforms in the
                // final binary
                let helpers = apply_transform(
                    program,
                    helpers,
                    react::<&dyn Comments>(
                        source_map.clone(),
                        Some(&comments),
                        config,
                        top_level_mark,
                        unresolved_mark,
                    ),
                );

                if let (Some(before), Some(imports)) = (before_imports, ctx.browser_jsx_imports) {
                    imports
                        .lock()
                        .expect("owned Browser JSX import collector")
                        .extend(BrowserJsxImport::inserted(&before, program));
                }

                if let Some(spans) = jsx_props_spans {
                    spans.restore(program);
                }

                if *refresh {
                    debug_assert_eq!(TURBOPACK_REFRESH.full, "__turbopack_context__.k");
                    debug_assert_eq!(TURBOPACK_MODULE.full, "__turbopack_context__.m");
                    let stmt = quote!(
                        // No-JS mode does not inject these helpers
                        "if (typeof globalThis.$RefreshHelpers$ === 'object' && \
                         globalThis.$RefreshHelpers !== null) { \
                         __turbopack_context__.k.registerExports(__turbopack_context__.m, \
                         globalThis.$RefreshHelpers$); }" as Stmt
                    );

                    match program {
                        Program::Module(module) => {
                            module.body.push(ModuleItem::Stmt(stmt));
                        }
                        Program::Script(script) => {
                            script.body.push(stmt);
                        }
                    }
                }

                helpers
            }
            EcmascriptInputTransform::PresetEnv(env, preset_env_config) => {
                let versions = env.runtime_versions().await?;
                let extra = preset_env_config.await?;

                let mode = match extra.mode.as_deref() {
                    Some("usage") => Some(preset_env::Mode::Usage),
                    Some("entry") => Some(preset_env::Mode::Entry),
                    _ => None,
                };

                let core_js = extra.core_js.as_ref().and_then(|v| {
                    let parts: Vec<&str> = v.split('.').collect();
                    Some(preset_env::Version {
                        major: parts.first()?.parse().ok()?,
                        minor: parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0),
                        patch: parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0),
                    })
                });

                let skip = extra
                    .skip
                    .as_ref()
                    .map(|v| v.iter().map(|s| Atom::from(s.as_str())).collect())
                    .unwrap_or_default();

                let parse_feature_or_module = |s: &str| -> FeatureOrModule {
                    if let Ok(feature) = s.parse::<Feature>() {
                        FeatureOrModule::Feature(feature)
                    } else {
                        FeatureOrModule::CoreJsModule(s.to_string())
                    }
                };

                let include: Vec<FeatureOrModule> = extra
                    .include
                    .as_ref()
                    .map(|v| v.iter().map(|s| parse_feature_or_module(s)).collect())
                    .unwrap_or_default();

                // Disable some ancient ES3 transforms; ReservedWords breaks resolving of
                // some ident references.
                let mut exclude: Vec<FeatureOrModule> = vec![
                    FeatureOrModule::Feature(Feature::ReservedWords),
                    FeatureOrModule::Feature(Feature::MemberExpressionLiterals),
                    FeatureOrModule::Feature(Feature::PropertyLiterals),
                ];
                if let Some(user_exclude) = &extra.exclude {
                    for s in user_exclude {
                        exclude.push(parse_feature_or_module(s));
                    }
                }

                let config = swc_core::ecma::preset_env::EnvConfig::from(
                    swc_core::ecma::preset_env::Config {
                        targets: Some(Targets::Versions(*versions)),
                        mode,
                        core_js,
                        skip,
                        include,
                        exclude,
                        shipped_proposals: extra.shipped_proposals.unwrap_or(false),
                        force_all_transforms: extra.force_all_transforms.unwrap_or(false),
                        debug: extra.debug.unwrap_or(false),
                        loose: extra.loose.unwrap_or(false),
                        ..Default::default()
                    },
                );

                // Explicit type annotation to ensure that we don't duplicate transforms in the
                // final binary
                apply_transform(
                    program,
                    helpers,
                    preset_env::transform_from_env::<&'_ dyn Comments>(
                        unresolved_mark,
                        Some(&comments),
                        config,
                        Assumptions::default(),
                    ),
                )
            }
            EcmascriptInputTransform::TypeScript {
                // TODO(WEB-1213)
                use_define_for_class_fields: _use_define_for_class_fields,
                verbatim_module_syntax,
                preserve_jsx_imports,
            } => {
                let config = Config {
                    verbatim_module_syntax: *verbatim_module_syntax,
                    ..Default::default()
                };
                let tsx_config = if *preserve_jsx_imports {
                    browser_coverage_tsx_config(program, source_map, comments, top_level_mark)
                } else {
                    None
                };
                if let Some(tsx_config) = tsx_config {
                    // Directive selection above already accounts for real JSX
                    // use. Do not let TSX reserve an unused default counterpart.
                    // Original comments remain intact for actual React lowering.
                    apply_transform(
                        program,
                        helpers,
                        tsx(
                            source_map.clone(),
                            config,
                            tsx_config,
                            swc_core::common::comments::NoopComments,
                            unresolved_mark,
                            top_level_mark,
                        ),
                    )
                } else {
                    apply_transform(
                        program,
                        helpers,
                        typescript(config, unresolved_mark, top_level_mark),
                    )
                }
            }
            EcmascriptInputTransform::Decorators {
                is_legacy,
                is_ecma: _,
                emit_decorators_metadata,
                // TODO(WEB-1213)
                use_define_for_class_fields: _use_define_for_class_fields,
            } => {
                use swc_core::ecma::transforms::proposal::decorators::{Config, decorators};
                let config = Config {
                    legacy: *is_legacy,
                    emit_metadata: *emit_decorators_metadata,
                    ..Default::default()
                };

                apply_transform(program, helpers, decorators(config))
            }
            EcmascriptInputTransform::ReactCompilerRust { options, target } => {
                apply_rust_react_compiler(program, ctx, helpers, *options, *target).await?
            }
            EcmascriptInputTransform::Plugin(transform) => {
                // We cannot pass helpers to plugins, so we return them as is
                transform.await?.transform(program, ctx).await?;
                helpers
            }
        })
    }
}

#[turbo_tasks::value]
struct ReactCompilerIssue {
    source: IssueSource,
    message: RcStr,
    severity: IssueSeverity,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for ReactCompilerIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    async fn file_path(&self) -> anyhow::Result<FileSystemPath> {
        self.source.file_path().await
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.source)
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Transform
    }

    async fn title(&self) -> anyhow::Result<StyledString> {
        Ok(StyledString::Text(rcstr!("React Compiler")))
    }

    async fn description(&self) -> anyhow::Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(self.message.clone())))
    }
}

// Keep this in sync with React Compiler's annotation-mode opt-ins. Next.js does not configure
// `dynamic_gating`, so only the standard `use memo` and legacy `use forget` directives enable a
// function.
fn has_react_compiler_opt_in_directive(statements: &[Stmt]) -> bool {
    for statement in statements {
        if !statement.directive_continue() {
            break;
        }

        let Stmt::Expr(expression) = statement else {
            continue;
        };
        let Expr::Lit(Lit::Str(value)) = &*expression.expr else {
            continue;
        };
        if value
            .value
            .as_str()
            .is_some_and(|value| matches!(value, "use memo" | "use forget"))
        {
            return true;
        }
    }

    false
}

#[derive(Default)]
struct ReactCompilerAnnotationFinder {
    found: bool,
}

impl Visit for ReactCompilerAnnotationFinder {
    fn visit_arrow_expr(&mut self, node: &ArrowExpr) {
        if self.found {
            return;
        }
        if let ArrowFunctionBody::FunctionBody(body) = &*node.body
            && has_react_compiler_opt_in_directive(&body.stmts)
        {
            self.found = true;
            return;
        }

        node.visit_children_with(self);
    }

    fn visit_function(&mut self, node: &Function) {
        if self.found {
            return;
        }
        if node
            .body
            .as_ref()
            .is_some_and(|body| has_react_compiler_opt_in_directive(&body.stmts))
        {
            self.found = true;
            return;
        }

        node.visit_children_with(self);
    }
}

fn has_react_compiler_annotation(program: &Program) -> bool {
    let mut finder = ReactCompilerAnnotationFinder::default();
    finder.visit_program(program);
    finder.found
}

fn should_run_rust_react_compiler(
    program: &Program,
    compilation_mode: ReactCompilerCompilationMode,
) -> bool {
    match compilation_mode {
        ReactCompilerCompilationMode::Infer => {
            swc_ecma_react_compiler::fast_check::is_required(program)
        }
        ReactCompilerCompilationMode::Annotation => has_react_compiler_annotation(program),
        ReactCompilerCompilationMode::All => true,
    }
}

async fn apply_rust_react_compiler(
    program: &mut Program,
    ctx: &TransformContext<'_>,
    helpers: HelperData,
    options: ReactCompilerTransformOptions,
    target: ReactCompilerTarget,
) -> Result<HelperData> {
    let Program::Module(_) = program else {
        return Ok(helpers);
    };

    // Avoid invoking the compiler when the selected mode cannot change this module. These checks
    // run on the SWC AST we already parsed, before converting it to the compiler AST. `All` mode
    // remains unconditional because every function is eligible.
    if !should_run_rust_react_compiler(program, options.compilation_mode) {
        return Ok(helpers);
    }

    let single_threaded_comments =
        crate::swc_comments::swc_comments_to_single_threaded(ctx.comments);
    let result = swc_ecma_react_compiler::transform(
        program,
        swc_ecma_react_compiler::SourceType::from_program(program),
        ctx.source_text,
        Some(&single_threaded_comments),
        react_compiler_options(ctx.node_env.as_str(), ctx.file_name_str, options, target),
    );

    // TODO: Emit these diagnostics with an Info level once there's a way of adjusting log levels in
    //       general. By default React Compiler is silent, as de-opts align closely with feedback
    //       from tools like React's lint rules.

    if let Some(compiled_program) = result.program {
        *program = compiled_program;

        // TODO(react-compiler-swc): The Rust React Compiler emits every identifier with
        // `SyntaxContext::empty()` in `convert_ast_reverse.rs`.
        //
        // Remove this once `swc_ecma_react_compiler`
        // preserves/assigns contexts on the converted AST.
        program.mutate(swc_core::ecma::transforms::base::resolver(
            ctx.unresolved_mark,
            ctx.top_level_mark,
            true,
        ));
    }

    Ok(helpers)
}

fn react_compiler_options(
    node_env: &str,
    file_name: &str,
    options: ReactCompilerTransformOptions,
    target: ReactCompilerTarget,
) -> react_compiler::entrypoint::plugin_options::PluginOptions {
    use react_compiler::entrypoint::plugin_options::{CompilerTarget, PluginOptions};

    let mut plugin_options = PluginOptions {
        should_compile: true,
        enable_reanimated: false,
        is_dev: node_env != "production",
        filename: Some(file_name.to_string()),
        compilation_mode: options.compilation_mode.as_str().to_string(),
        panic_threshold: "none".to_string(),
        target: CompilerTarget::Version(target.as_str().to_string()),
        gating: None,
        dynamic_gating: None,
        no_emit: false,
        output_mode: None,
        eslint_suppression_rules: None,
        flow_suppressions: false,
        ignore_use_no_forget: false,
        custom_opt_out_directives: None,
        environment: Default::default(),
        source_code: None,
        profiling: false,
        debug: false,
    };
    if let Some(enable_preserve_existing_memoization_guarantees) =
        options.enable_preserve_existing_memoization_guarantees
    {
        plugin_options
            .environment
            .enable_preserve_existing_memoization_guarantees =
            enable_preserve_existing_memoization_guarantees;
    }

    plugin_options
}

fn apply_transform(program: &mut Program, helpers: HelperData, op: impl Pass) -> HelperData {
    let helpers = Helpers::from_data(helpers);
    HELPERS.set(&helpers, || {
        program.mutate(op);
    });
    helpers.data()
}

pub fn remove_shebang(program: &mut Program) {
    match program {
        Program::Module(m) => {
            m.shebang = None;
        }
        Program::Script(s) => {
            s.shebang = None;
        }
    }
}

pub fn remove_directives(program: &mut Program) {
    match program {
        Program::Module(module) => {
            let directive_count = module
                .body
                .iter()
                .take_while(|i| match i {
                    ModuleItem::Stmt(stmt) => stmt.directive_continue(),
                    ModuleItem::ModuleDecl(_) => false,
                })
                .take_while(|i| match i {
                    ModuleItem::Stmt(stmt) => match stmt {
                        Stmt::Expr(ExprStmt { expr, .. }) => expr
                            .as_lit()
                            .and_then(|lit| lit.as_str())
                            .and_then(|str| str.raw.as_ref())
                            .is_some_and(|raw| {
                                raw.starts_with("\"use ") || raw.starts_with("'use ")
                            }),
                        _ => false,
                    },
                    ModuleItem::ModuleDecl(_) => false,
                })
                .count();
            module.body.drain(0..directive_count);
        }
        Program::Script(script) => {
            let directive_count = script
                .body
                .iter()
                .take_while(|stmt| stmt.directive_continue())
                .take_while(|stmt| match stmt {
                    Stmt::Expr(ExprStmt { expr, .. }) => expr
                        .as_lit()
                        .and_then(|lit| lit.as_str())
                        .and_then(|str| str.raw.as_ref())
                        .is_some_and(|raw| raw.starts_with("\"use ") || raw.starts_with("'use ")),
                    _ => false,
                })
                .count();
            script.body.drain(0..directive_count);
        }
    }
}

#[cfg(test)]
mod react_compiler_tests {
    use swc_core::{
        common::{DUMMY_SP, FileName, GLOBALS, SourceMap},
        ecma::{
            ast::{EsVersion, Module},
            parser::{Syntax, TsSyntax, parse_file_as_program},
        },
    };

    use super::*;

    #[test]
    fn preserves_default_environment_without_explicit_option() {
        let options = react_compiler_options(
            "production",
            "input.js",
            ReactCompilerTransformOptions::default(),
            ReactCompilerTarget::React19,
        );

        assert!(
            options
                .environment
                .enable_preserve_existing_memoization_guarantees
        );
    }

    #[test]
    fn forwards_explicit_memoization_preservation_option() {
        let options = react_compiler_options(
            "production",
            "input.js",
            ReactCompilerTransformOptions {
                compilation_mode: ReactCompilerCompilationMode::Infer,
                enable_preserve_existing_memoization_guarantees: Some(false),
            },
            ReactCompilerTarget::React19,
        );

        assert!(
            !options
                .environment
                .enable_preserve_existing_memoization_guarantees
        );
    }

    fn parse_program(source: &str) -> Program {
        GLOBALS.set(&Default::default(), || {
            let cm = SourceMap::default();
            let fm = cm.new_source_file(
                FileName::Custom("test.tsx".into()).into(),
                source.to_owned(),
            );
            let mut errors = Vec::new();
            let program = parse_file_as_program(
                &fm,
                Syntax::Typescript(TsSyntax {
                    tsx: true,
                    ..Default::default()
                }),
                EsVersion::EsNext,
                None,
                &mut errors,
            )
            .expect("test fixture should parse");
            assert!(errors.is_empty(), "test fixture should not recover errors");
            program
        })
    }

    #[test]
    fn compilation_modes_use_their_respective_fast_checks() {
        let program = Program::Module(Module {
            span: DUMMY_SP,
            body: Vec::new(),
            shebang: None,
        });

        for mode in [
            ReactCompilerCompilationMode::Infer,
            ReactCompilerCompilationMode::Annotation,
        ] {
            assert!(!should_run_rust_react_compiler(&program, mode));
        }
        assert!(should_run_rust_react_compiler(
            &program,
            ReactCompilerCompilationMode::All,
        ));
    }

    #[test]
    fn infer_mode_uses_upstream_conservative_fast_check() {
        for source in [
            "const Button = React.forwardRef((props, ref) => <button ref={ref} />);",
            "function useCounter() { return React.useState(0); }",
            "function helper() { 'use memo'; return 1; }",
        ] {
            assert!(should_run_rust_react_compiler(
                &parse_program(source),
                ReactCompilerCompilationMode::Infer
            ));
        }

        for source in [
            "export const answer = 42;",
            "const user = getUser();",
            "function helper() { log(); 'use memo'; }",
        ] {
            assert!(!should_run_rust_react_compiler(
                &parse_program(source),
                ReactCompilerCompilationMode::Infer
            ));
        }
    }

    #[test]
    fn annotation_mode_only_runs_for_function_opt_in_directives() {
        for source in [
            "function helper() { 'use memo'; return 1; }",
            "const helper = () => { 'use forget'; return 1; };",
            "function outer() { function inner() { 'use memo'; return 1; } }",
        ] {
            assert!(should_run_rust_react_compiler(
                &parse_program(source),
                ReactCompilerCompilationMode::Annotation,
            ));
        }

        for source in [
            "function Component() { return <div />; }",
            "function useCounter() { return useState(0); }",
            "function helper() { log(); 'use memo'; }",
            "'use memo'; export const answer = 42;",
            "function helper() { 'use memo if(featureFlag)'; return 1; }",
            "function helper() { 'use no memo'; return 1; }",
        ] {
            assert!(!should_run_rust_react_compiler(
                &parse_program(source),
                ReactCompilerCompilationMode::Annotation,
            ));
        }
    }

    #[test]
    fn all_mode_remains_unconditional() {
        for source in [
            "export const answer = 42;",
            "function helper() { return 1; }",
        ] {
            assert!(should_run_rust_react_compiler(
                &parse_program(source),
                ReactCompilerCompilationMode::All,
            ));
        }
    }
}

#[cfg(test)]
mod browser_coverage_tsx_tests {
    use std::sync::Arc;

    use swc_core::{
        base::SwcComments,
        common::{FileName, GLOBALS, Globals, Mark, SourceMap},
        ecma::{
            ast::{EsVersion, ImportSpecifier, ModuleDecl, ModuleItem, Program},
            parser::{Syntax, TsSyntax, parse_file_as_program},
            transforms::{
                base::resolver,
                typescript::{Config, tsx, typescript},
            },
        },
    };

    use super::browser_coverage_tsx_config;

    fn imports(source: &str, private_tsx: bool, verbatim_module_syntax: bool) -> Vec<String> {
        GLOBALS.set(&Globals::default(), || {
            let cm: Arc<SourceMap> = Default::default();
            let file = cm.new_source_file(
                FileName::Custom("input.tsx".into()).into(),
                source.to_owned(),
            );
            let comments = SwcComments::default();
            let mut errors = Vec::new();
            let mut program = parse_file_as_program(
                &file,
                Syntax::Typescript(TsSyntax {
                    tsx: true,
                    ..Default::default()
                }),
                EsVersion::EsNext,
                Some(&comments),
                &mut errors,
            )
            .expect("actual TypeScript fixture must parse");
            assert!(errors.is_empty());
            let unresolved = Mark::new();
            let top_level = Mark::new();
            program.mutate(resolver(unresolved, top_level, true));
            let config = Config {
                verbatim_module_syntax,
                ..Default::default()
            };
            let selected = private_tsx
                .then(|| browser_coverage_tsx_config(&program, &cm, &comments, top_level))
                .flatten();
            if let Some(selected) = selected {
                program.mutate(tsx(
                    cm,
                    config,
                    selected,
                    swc_core::common::comments::NoopComments,
                    unresolved,
                    top_level,
                ));
            } else {
                program.mutate(typescript(config, unresolved, top_level));
            }
            let Program::Module(module) = program else {
                panic!("actual module must retain its module identity");
            };
            module
                .body
                .iter()
                .filter_map(|item| match item {
                    ModuleItem::ModuleDecl(ModuleDecl::Import(import)) => Some(import),
                    _ => None,
                })
                .flat_map(|import| &import.specifiers)
                .map(|specifier| {
                    let local = match specifier {
                        ImportSpecifier::Default(value) => &value.local,
                        ImportSpecifier::Named(value) => &value.local,
                        ImportSpecifier::Namespace(value) => &value.local,
                    };
                    local.sym.to_string()
                })
                .collect()
        })
    }

    #[test]
    fn private_tsx_retains_actual_default_pragma_import_only() {
        let source = "import React from 'react'; import Unused from './unused';\nexport const \
                      render = () => <p/>";
        assert_eq!(imports(source, true, false), vec!["React"]);
        assert!(imports(source, false, false).is_empty());
    }

    #[test]
    fn private_tsx_never_retains_explicit_type_only_imports() {
        let source =
            "import type React from 'react';\nexport const render = (): React.ReactElement => <p/>";
        assert!(imports(source, true, false).is_empty());
        assert!(imports(source, true, true).is_empty());
    }

    #[test]
    fn private_tsx_source_pragmas_do_not_reserve_unrelated_react() {
        let source = "/** @jsxRuntime classic @jsx h @jsxFrag Frag */\nimport React from 'react'; \
                      import { h, Fragment as Frag } from './factory'; import Unused from \
                      './unused';\nexport const render = () => <><p/></>";
        assert_eq!(imports(source, true, false), vec!["h", "Frag"]);
    }

    #[test]
    fn private_tsx_qualified_source_pragmas_keep_their_actual_namespace() {
        let source = "/** @jsxRuntime classic @jsx Factory.create @jsxFrag Factory.Fragment \
                      */\nimport React from 'react'; import * as Factory from \
                      './factory';\nexport const render = () => <><p/></>";
        assert_eq!(imports(source, true, false), vec!["Factory"]);
    }

    #[test]
    fn private_tsx_without_jsx_uses_ordinary_typescript_import_semantics() {
        for directive in ["", "/** @jsxRuntime classic @jsx h @jsxFrag Frag */\n"] {
            let source = format!(
                "{directive}import React from 'react'; import {{ h, Fragment as Frag }} from \
                 './factory';\ntype E = React.ReactElement; export const value = 1"
            );
            assert!(imports(&source, true, false).is_empty());
        }
    }

    #[test]
    fn private_tsx_reserves_fragment_factory_only_for_actual_fragments() {
        let source = "/** @jsxRuntime classic @jsx h */\nimport React from 'react'; import { h, \
                      Fragment as Frag } from './factory';\nexport const render = () => <p/>";
        assert_eq!(imports(source, true, false), vec!["h"]);
        let source = source.replace("<p/>", "<><p/></>");
        assert_eq!(imports(&source, true, false), vec!["React", "h"]);
    }

    #[test]
    fn private_tsx_fragment_directive_only_reserves_used_factories() {
        let source = "/** @jsxRuntime classic @jsxFrag Frag */\nimport React from 'react'; import \
                      { h, Fragment as Frag } from './factory';\nexport const render = () => <p/>";
        assert_eq!(imports(source, true, false), vec!["React"]);
        let source = source.replace("<p/>", "<><p/></>");
        assert_eq!(imports(&source, true, false), vec!["React", "Frag"]);
    }

    #[test]
    fn private_tsx_keeps_actual_verbatim_option_instead_of_forcing_it() {
        let source = "import React from 'react'; import Unused from './unused';\nexport const \
                      render = () => <p/>";
        assert_eq!(imports(source, true, true), vec!["React", "Unused"]);
        assert_eq!(imports(source, true, false), vec!["React"]);
    }

    #[test]
    fn ordinary_typescript_keeps_existing_unused_import_semantics() {
        let source = "import React from 'react'; import Unused from './unused';\ntype Element = \
                      React.ReactElement; export const value = 1";
        assert!(imports(source, false, false).is_empty());
        assert_eq!(imports(source, false, true), vec!["React", "Unused"]);
    }
}
