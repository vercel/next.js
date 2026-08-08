use std::{fmt::Debug, hash::Hash, sync::Arc};

use anyhow::{Result, bail};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use swc_core::{
    atoms::{Atom, atom},
    base::SwcComments,
    common::{Mark, SourceMap, comments::Comments},
    ecma::{
        ast::{ExprStmt, ModuleItem, Pass, Program, Stmt},
        preset_env::{self, Feature, FeatureOrModule, Targets},
        transforms::{
            base::{
                assumptions::Assumptions,
                helpers::{HELPERS, HelperData, Helpers},
            },
            react::react,
            typescript::{Config, typescript},
        },
        utils::IsDirective,
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
    },
    // These options are subset of swc_core::ecma::transforms::typescript::Config, but
    // it doesn't derive `Copy` so repeating values in here
    TypeScript {
        use_define_for_class_fields: bool,
        verbatim_module_syntax: bool,
    },
    Decorators {
        is_legacy: bool,
        is_ecma: bool,
        emit_decorators_metadata: bool,
        use_define_for_class_fields: bool,
    },
    ReactCompilerRust {
        compilation_mode: ReactCompilerCompilationMode,
        target: ReactCompilerTarget,
    },
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
pub struct OptionReactCompilerCompilationMode(Option<ReactCompilerCompilationMode>);

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
pub struct TransformPlugin(#[turbo_tasks(trace_ignore)] Box<dyn CustomTransformer + Send + Sync>);

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
            } => {
                let config = Config {
                    verbatim_module_syntax: *verbatim_module_syntax,
                    ..Default::default()
                };
                apply_transform(
                    program,
                    helpers,
                    typescript(config, unresolved_mark, top_level_mark),
                )
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
            EcmascriptInputTransform::ReactCompilerRust {
                compilation_mode,
                target,
            } => {
                apply_rust_react_compiler(program, ctx, helpers, *compilation_mode, *target).await?
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

async fn apply_rust_react_compiler(
    program: &mut Program,
    ctx: &TransformContext<'_>,
    helpers: HelperData,
    compilation_mode: ReactCompilerCompilationMode,
    target: ReactCompilerTarget,
) -> Result<HelperData> {
    let Program::Module(_) = program else {
        return Ok(helpers);
    };

    let single_threaded_comments =
        crate::swc_comments::swc_comments_to_single_threaded(ctx.comments);
    let result = swc_ecma_react_compiler::transform(
        program,
        swc_ecma_react_compiler::SourceType::from_program(program),
        ctx.source_text,
        Some(&single_threaded_comments),
        react_compiler_options(ctx, compilation_mode, target),
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
    ctx: &TransformContext<'_>,
    compilation_mode: ReactCompilerCompilationMode,
    target: ReactCompilerTarget,
) -> react_compiler::entrypoint::plugin_options::PluginOptions {
    use react_compiler::entrypoint::plugin_options::{CompilerTarget, PluginOptions};

    PluginOptions {
        should_compile: true,
        enable_reanimated: false,
        is_dev: ctx.node_env != "production",
        filename: Some(ctx.file_name_str.to_string()),
        compilation_mode: compilation_mode.as_str().to_string(),
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
    }
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
