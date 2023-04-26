mod server_to_client_proxy;
mod util;

use std::{fmt::Debug, hash::Hash, path::PathBuf, sync::Arc};

use anyhow::Result;
use swc_core::{
    base::SwcComments,
    common::{chain, util::take::Take, FileName, Mark, SourceMap},
    ecma::{
        ast::{Module, ModuleItem, Program},
        atoms::JsWord,
        preset_env::{self, Targets},
        transforms::{
            base::{feature::FeatureFlag, helpers::inject_helpers, resolver, Assumptions},
            react::react,
        },
        visit::{FoldWith, VisitMutWith},
    },
    quote,
};
use turbo_tasks::primitives::{OptionStringVc, StringVc, StringsVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    environment::EnvironmentVc,
    issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc},
};

use self::{
    server_to_client_proxy::create_proxy_module,
    util::{is_client_module, is_server_module},
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, PartialOrd, Ord, Hash)]
pub enum EcmascriptInputTransform {
    ClientDirective(StringVc),
    ServerDirective(StringVc),
    CommonJs,
    Plugin(TransformPluginVc),
    PresetEnv(EnvironmentVc),
    React {
        #[serde(default)]
        refresh: bool,
        // swc.jsc.transform.react.importSource
        import_source: OptionStringVc,
        // swc.jsc.transform.react.runtime,
        runtime: OptionStringVc,
    },
    StyledComponents {
        display_name: bool,
        ssr: bool,
        file_name: bool,
        top_level_import_paths: StringsVc,
        meaningless_file_names: StringsVc,
        css_prop: bool,
        namespace: OptionStringVc,
    },
    StyledJsx,
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
pub trait CustomTransformer: Debug {
    fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Option<Program>;
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

impl CustomTransformer for TransformPlugin {
    fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Option<Program> {
        self.0.transform(program, ctx)
    }
}

#[turbo_tasks::value(transparent, serialization = "auto_for_input")]
#[derive(Debug, Clone, PartialOrd, Ord, Hash)]
pub struct EcmascriptInputTransforms(Vec<EcmascriptInputTransform>);

#[turbo_tasks::value_impl]
impl EcmascriptInputTransformsVc {
    #[turbo_tasks::function]
    pub fn empty() -> Self {
        EcmascriptInputTransformsVc::cell(Vec::new())
    }

    #[turbo_tasks::function]
    pub async fn extend(self, other: EcmascriptInputTransformsVc) -> Result<Self> {
        let mut transforms = self.await?.clone_value();
        transforms.extend(other.await?.clone_value());
        Ok(EcmascriptInputTransformsVc::cell(transforms))
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
    pub file_path: FileSystemPathVc,
}

impl EcmascriptInputTransform {
    pub async fn apply(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let &TransformContext {
            comments,
            source_map,
            top_level_mark,
            unresolved_mark,
            file_name_str,
            file_name_hash,
            file_path,
            ..
        } = ctx;
        match self {
            EcmascriptInputTransform::React {
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
                    development: Some(true),
                    import_source: import_source.await?.clone_value(),
                    refresh: if *refresh {
                        Some(swc_core::ecma::transforms::react::RefreshOptions {
                            ..Default::default()
                        })
                    } else {
                        None
                    },
                    ..Default::default()
                };

                program.visit_mut_with(&mut react(
                    source_map.clone(),
                    Some(comments.clone()),
                    config,
                    top_level_mark,
                    unresolved_mark,
                ));
            }
            EcmascriptInputTransform::CommonJs => {
                program.visit_mut_with(&mut swc_core::ecma::transforms::module::common_js(
                    unresolved_mark,
                    swc_core::ecma::transforms::module::util::Config {
                        allow_top_level_this: true,
                        import_interop: Some(
                            swc_core::ecma::transforms::module::util::ImportInterop::Swc,
                        ),
                        ..Default::default()
                    },
                    swc_core::ecma::transforms::base::feature::FeatureFlag::all(),
                    Some(comments.clone()),
                ));
            }
            EcmascriptInputTransform::PresetEnv(env) => {
                let versions = env.runtime_versions().await?;
                let config = swc_core::ecma::preset_env::Config {
                    targets: Some(Targets::Versions(*versions)),
                    mode: None, // Don't insert core-js polyfills
                    ..Default::default()
                };

                let module_program = unwrap_module_program(program);

                *program = module_program.fold_with(&mut chain!(
                    preset_env::preset_env(
                        top_level_mark,
                        Some(comments.clone()),
                        config,
                        Assumptions::default(),
                        &mut FeatureFlag::empty(),
                    ),
                    inject_helpers(unresolved_mark),
                ));
            }
            EcmascriptInputTransform::StyledComponents {
                display_name,
                ssr,
                file_name,
                top_level_import_paths,
                meaningless_file_names,
                css_prop,
                namespace,
            } => {
                let mut options = styled_components::Config {
                    display_name: *display_name,
                    ssr: *ssr,
                    file_name: *file_name,
                    css_prop: *css_prop,
                    ..Default::default()
                };

                if let Some(namespace) = &*namespace.await? {
                    options.namespace = namespace.clone();
                }

                let top_level_import_paths = &*top_level_import_paths.await?;
                if !top_level_import_paths.is_empty() {
                    options.top_level_import_paths = top_level_import_paths
                        .iter()
                        .map(|s| JsWord::from(s.clone()))
                        .collect();
                }
                let meaningless_file_names = &*meaningless_file_names.await?;
                if !meaningless_file_names.is_empty() {
                    options.meaningless_file_names = meaningless_file_names.clone();
                }

                program.visit_mut_with(&mut styled_components::styled_components(
                    FileName::Real(PathBuf::from(file_path.await?.path.clone())),
                    file_name_hash,
                    options,
                ));
            }
            EcmascriptInputTransform::StyledJsx => {
                // Modeled after https://github.com/swc-project/plugins/blob/ae735894cdb7e6cfd776626fe2bc580d3e80fed9/packages/styled-jsx/src/lib.rs
                let real_program = std::mem::replace(program, Program::Module(Module::dummy()));
                *program = real_program.fold_with(&mut styled_jsx::visitor::styled_jsx(
                    source_map.clone(),
                    // styled_jsx don't really use that in a relevant way
                    FileName::Anon,
                ));
            }
            EcmascriptInputTransform::TypeScript {
                use_define_for_class_fields,
            } => {
                use swc_core::ecma::transforms::typescript::{strip_with_config, Config};
                let config = Config {
                    use_define_for_class_fields: *use_define_for_class_fields,
                    ..Default::default()
                };
                program.visit_mut_with(&mut strip_with_config(config, top_level_mark));
            }
            EcmascriptInputTransform::Decorators {
                is_legacy,
                is_ecma: _,
                emit_decorators_metadata,
                use_define_for_class_fields,
            } => {
                use swc_core::ecma::transforms::proposal::decorators::{decorators, Config};
                let config = Config {
                    legacy: *is_legacy,
                    emit_metadata: *emit_decorators_metadata,
                    use_define_for_class_fields: *use_define_for_class_fields,
                };

                let p = std::mem::replace(program, Program::Module(Module::dummy()));
                *program = p.fold_with(&mut chain!(
                    decorators(config),
                    inject_helpers(unresolved_mark)
                ));
            }
            EcmascriptInputTransform::ClientDirective(transition_name) => {
                if is_client_module(program) {
                    let transition_name = &*transition_name.await?;
                    *program = create_proxy_module(transition_name, &format!("./{file_name_str}"));
                    program.visit_mut_with(&mut resolver(unresolved_mark, top_level_mark, false));
                }
            }
            EcmascriptInputTransform::ServerDirective(_transition_name) => {
                if is_server_module(program) {
                    let stmt = quote!(
                        "throw new Error('Server actions (\"use server\") are not yet supported in \
                         Turbopack');" as Stmt
                    );
                    match program {
                        Program::Module(m) => m.body = vec![ModuleItem::Stmt(stmt)],
                        Program::Script(s) => s.body = vec![stmt],
                    }
                    UnsupportedServerActionIssue { context: file_path }
                        .cell()
                        .as_issue()
                        .emit();
                }
            }
            EcmascriptInputTransform::Plugin(transform) => {
                if let Some(output) = transform.await?.transform(program, ctx) {
                    *program = output;
                }
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

fn unwrap_module_program(program: &mut Program) -> Program {
    match program {
        Program::Module(module) => Program::Module(module.take()),
        Program::Script(s) => Program::Module(Module {
            span: s.span,
            body: s
                .body
                .iter()
                .map(|stmt| ModuleItem::Stmt(stmt.clone()))
                .collect(),
            shebang: s.shebang.clone(),
        }),
    }
}

#[turbo_tasks::value(shared)]
pub struct UnsupportedServerActionIssue {
    pub context: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl Issue for UnsupportedServerActionIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        IssueSeverity::Error.into()
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("unsupported".to_string())
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Server actions (\"use server\") are not yet supported in Turbopack".into())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell("".to_string()))
    }
}
