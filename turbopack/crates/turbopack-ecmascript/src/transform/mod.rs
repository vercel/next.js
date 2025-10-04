use std::{fmt::Debug, hash::Hash, sync::Arc};

use anyhow::Result;
use async_trait::async_trait;
use swc_core::{
    atoms::{Atom, atom},
    base::SwcComments,
    common::{Mark, SourceMap, comments::Comments},
    ecma::{
        ast::{ExprStmt, ModuleItem, Pass, Program, Stmt},
        preset_env::{self, Targets},
        transforms::{
            base::{
                assumptions::Assumptions,
                helpers::{HELPERS, HelperData, Helpers},
            },
            react::react,
        },
        utils::IsDirective,
    },
    quote,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{environment::Environment, source::Source};

use crate::runtime_functions::{TURBOPACK_MODULE, TURBOPACK_REFRESH};

#[turbo_tasks::value]
#[derive(Debug, Clone, Hash)]
pub enum EcmascriptInputTransform {
    Plugin(ResolvedVc<TransformPlugin>),
    PresetEnv(ResolvedVc<Environment>),
    React {
        #[serde(default)]
        development: bool,
        #[serde(default)]
        refresh: bool,
        // swc.jsc.transform.react.importSource
        import_source: ResolvedVc<Option<RcStr>>,
        // swc.jsc.transform.react.runtime,
        runtime: ResolvedVc<Option<RcStr>>,
    },
    // These options are subset of swc_core::ecma::transforms::typescript::Config, but
    // it doesn't derive `Copy` so repeating values in here
    TypeScript {
        #[serde(default)]
        use_define_for_class_fields: bool,
    },
    Decorators {
        #[serde(default)]
        is_legacy: bool,
        #[serde(default)]
        is_ecma: bool,
        #[serde(default)]
        emit_decorators_metadata: bool,
        #[serde(default)]
        use_define_for_class_fields: bool,
    },
}

/// The CustomTransformer trait allows you to implement your own custom SWC
/// transformer to run over all ECMAScript files imported in the graph.
#[async_trait]
pub trait CustomTransformer: Debug {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()>;
}

/// A wrapper around a TransformPlugin instance, allowing it to operate with
/// the turbo_task caching requirements.
#[turbo_tasks::value(
    transparent,
    serialization = "none",
    eq = "manual",
    into = "new",
    cell = "new"
)]
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
                            return Err(anyhow::anyhow!(
                                "Invalid value for swc.jsc.transform.react.runtime: {}",
                                runtime
                            ));
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
            EcmascriptInputTransform::PresetEnv(env) => {
                let versions = env.runtime_versions().await?;
                let config = swc_core::ecma::preset_env::EnvConfig::from(
                    swc_core::ecma::preset_env::Config {
                        targets: Some(Targets::Versions(*versions)),
                        mode: None, // Don't insert core-js polyfills
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
            } => {
                use swc_core::ecma::transforms::typescript::typescript;
                let config = Default::default();
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
            EcmascriptInputTransform::Plugin(transform) => {
                // We cannot pass helpers to plugins, so we return them as is
                transform.await?.transform(program, ctx).await?;
                helpers
            }
        })
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
