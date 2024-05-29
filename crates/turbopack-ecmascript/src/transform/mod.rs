use std::{fmt::Debug, hash::Hash, sync::Arc};

use anyhow::Result;
use async_trait::async_trait;
use swc_core::{
    atoms::JsWord,
    base::SwcComments,
    common::{chain, collections::AHashMap, comments::Comments, util::take::Take, Mark, SourceMap},
    ecma::{
        ast::{Module, ModuleItem, Program, Script},
        preset_env::{self, Targets},
        transforms::{
            base::{feature::FeatureFlag, helpers::inject_helpers, Assumptions},
            optimization::inline_globals2,
            react::react,
        },
        visit::{FoldWith, VisitMutWith},
    },
    quote,
};
use turbo_tasks::{ValueDefault, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    environment::Environment,
    issue::{Issue, IssueSeverity, IssueStage, StyledString},
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, PartialOrd, Ord, Hash)]
pub enum EcmascriptInputTransform {
    CommonJs,
    Plugin(Vc<TransformPlugin>),
    PresetEnv(Vc<Environment>),
    React {
        #[serde(default)]
        development: bool,
        #[serde(default)]
        refresh: bool,
        // swc.jsc.transform.react.importSource
        import_source: Vc<Option<String>>,
        // swc.jsc.transform.react.runtime,
        runtime: Vc<Option<String>>,
    },
    GlobalTypeofs {
        window_value: String,
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

#[turbo_tasks::value(transparent)]
pub struct OptionTransformPlugin(Option<Vc<TransformPlugin>>);

#[turbo_tasks::value_impl]
impl ValueDefault for OptionTransformPlugin {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Vc::cell(None)
    }
}

#[async_trait]
impl CustomTransformer for TransformPlugin {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        self.0.transform(program, ctx).await
    }
}

#[turbo_tasks::value(transparent, serialization = "auto_for_input")]
#[derive(Debug, Clone, PartialOrd, Ord, Hash)]
pub struct EcmascriptInputTransforms(Vec<EcmascriptInputTransform>);

#[turbo_tasks::value_impl]
impl EcmascriptInputTransforms {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Vec::new())
    }

    #[turbo_tasks::function]
    pub async fn extend(self: Vc<Self>, other: Vc<EcmascriptInputTransforms>) -> Result<Vc<Self>> {
        let mut transforms = self.await?.clone_value();
        transforms.extend(other.await?.clone_value());
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
    pub file_path: Vc<FileSystemPath>,
}

impl EcmascriptInputTransform {
    pub async fn apply(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let &TransformContext {
            comments,
            source_map,
            top_level_mark,
            unresolved_mark,
            ..
        } = ctx;
        match self {
            EcmascriptInputTransform::GlobalTypeofs { window_value } => {
                let mut typeofs: AHashMap<JsWord, JsWord> = Default::default();
                typeofs.insert("window".into(), JsWord::from(&**window_value));

                program.visit_mut_with(&mut inline_globals2(
                    Default::default(),
                    Default::default(),
                    Default::default(),
                    Arc::new(typeofs),
                ));
            }
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
                            ))
                        }
                    }
                } else {
                    Runtime::Automatic
                };

                let config = Options {
                    runtime: Some(runtime),
                    development: Some(*development),
                    import_source: import_source.await?.clone_value(),
                    refresh: if *refresh {
                        Some(swc_core::ecma::transforms::react::RefreshOptions {
                            refresh_reg: "__turbopack_refresh__.register".to_string(),
                            refresh_sig: "__turbopack_refresh__.signature".to_string(),
                            ..Default::default()
                        })
                    } else {
                        None
                    },
                    ..Default::default()
                };

                // Explicit type annotation to ensure that we don't duplicate transforms in the
                // final binary
                program.visit_mut_with(&mut react::<&dyn Comments>(
                    source_map.clone(),
                    Some(&comments),
                    config,
                    top_level_mark,
                    unresolved_mark,
                ));

                if *refresh {
                    let stmt = quote!(
                        // AMP / No-JS mode does not inject these helpers
                        "\nif (typeof globalThis.$RefreshHelpers$ === 'object' && \
                         globalThis.$RefreshHelpers !== null) { \
                         __turbopack_refresh__.registerExports(module, \
                         globalThis.$RefreshHelpers$); }\n" as Stmt
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
            }
            EcmascriptInputTransform::CommonJs => {
                // Explicit type annotation to ensure that we don't duplicate transforms in the
                // final binary
                program.visit_mut_with(&mut swc_core::ecma::transforms::module::common_js::<
                    &dyn Comments,
                >(
                    unresolved_mark,
                    swc_core::ecma::transforms::module::util::Config {
                        allow_top_level_this: true,
                        import_interop: Some(
                            swc_core::ecma::transforms::module::util::ImportInterop::Swc,
                        ),
                        ..Default::default()
                    },
                    swc_core::ecma::transforms::base::feature::FeatureFlag::all(),
                    Some(&comments),
                ));
            }
            EcmascriptInputTransform::PresetEnv(env) => {
                let versions = env.runtime_versions().await?;
                let config = swc_core::ecma::preset_env::Config {
                    targets: Some(Targets::Versions(*versions)),
                    mode: None, // Don't insert core-js polyfills
                    ..Default::default()
                };

                let module_program = std::mem::replace(program, Program::Module(Module::dummy()));

                let module_program = if let Program::Script(Script {
                    span,
                    mut body,
                    shebang,
                }) = module_program
                {
                    Program::Module(Module {
                        span,
                        body: body.drain(..).map(ModuleItem::Stmt).collect(),
                        shebang,
                    })
                } else {
                    module_program
                };

                // Explicit type annotation to ensure that we don't duplicate transforms in the
                // final binary
                *program = module_program.fold_with(&mut chain!(
                    preset_env::preset_env::<&'_ dyn Comments>(
                        top_level_mark,
                        Some(&comments),
                        config,
                        Assumptions::default(),
                        &mut FeatureFlag::empty(),
                    ),
                    inject_helpers(unresolved_mark),
                ));
            }
            EcmascriptInputTransform::TypeScript {
                // TODO(WEB-1213)
                use_define_for_class_fields: _use_define_for_class_fields,
            } => {
                use swc_core::ecma::transforms::typescript::typescript;
                let config = Default::default();
                program.visit_mut_with(&mut typescript(config, unresolved_mark));
            }
            EcmascriptInputTransform::Decorators {
                is_legacy,
                is_ecma: _,
                emit_decorators_metadata,
                // TODO(WEB-1213)
                use_define_for_class_fields: _use_define_for_class_fields,
            } => {
                use swc_core::ecma::transforms::proposal::decorators::{decorators, Config};
                let config = Config {
                    legacy: *is_legacy,
                    emit_metadata: *emit_decorators_metadata,
                    ..Default::default()
                };

                let p = std::mem::replace(program, Program::Module(Module::dummy()));
                *program = p.fold_with(&mut chain!(
                    decorators(config),
                    inject_helpers(unresolved_mark)
                ));
            }
            EcmascriptInputTransform::Plugin(transform) => {
                transform.await?.transform(program, ctx).await?
            }
        }
        Ok(())
    }
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

#[turbo_tasks::value(shared)]
pub struct UnsupportedServerActionIssue {
    pub file_path: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl Issue for UnsupportedServerActionIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Error.into()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(
            "Server actions (\"use server\") are not yet supported in Turbopack".into(),
        )
        .cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.file_path
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Transform.cell()
    }
}
