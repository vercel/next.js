mod server_to_client_proxy;

use std::{fmt::Debug, path::Path, sync::Arc};

use anyhow::Result;
use swc_core::{
    base::SwcComments,
    common::{chain, util::take::Take, FileName, Mark, SourceMap},
    ecma::{
        ast::{Module, ModuleItem, Program},
        preset_env::{self, Targets},
        transforms::{
            base::{feature::FeatureFlag, helpers::inject_helpers, resolver, Assumptions},
            react::react,
        },
        visit::{FoldWith, VisitMutWith},
    },
};
use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::json::parse_json_with_source_context;
use turbopack_core::environment::EnvironmentVc;

use self::server_to_client_proxy::{create_proxy_module, is_client_module};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, PartialOrd, Ord, Hash)]
pub enum EcmascriptInputTransform {
    ClientDirective(StringVc),
    CommonJs,
    Custom(CustomTransformVc),
    Emotion,
    PresetEnv(EnvironmentVc),
    React {
        #[serde(default)]
        refresh: bool,
    },
    StyledComponents,
    StyledJsx,
    // These options are subset of swc_core::ecma::transforms::typescript::Config, but
    // it doesn't derive `Copy` so repeating values in here
    TypeScript {
        #[serde(default)]
        use_define_for_class_fields: bool,
    },
}

/// The CustomTransformer trait allows you to implement your own custom SWC
/// transformer to run over all ECMAScript files imported in the graph.
pub trait CustomTransformer: Debug {
    fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Option<Program>;
}

/// A wrapper around a CustomTransformer instance, allowing it to operate with
/// the turbo_task caching requirements.
#[turbo_tasks::value(
    transparent,
    serialization = "none",
    eq = "manual",
    into = "new",
    cell = "new"
)]
#[derive(Debug)]
pub struct CustomTransform(#[turbo_tasks(trace_ignore)] Box<dyn CustomTransformer + Send + Sync>);

impl CustomTransformer for CustomTransform {
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
            ..
        } = ctx;
        match self {
            EcmascriptInputTransform::React { refresh } => {
                program.visit_mut_with(&mut react(
                    source_map.clone(),
                    Some(comments.clone()),
                    swc_core::ecma::transforms::react::Options {
                        runtime: Some(swc_core::ecma::transforms::react::Runtime::Automatic),
                        development: Some(true),
                        refresh: if *refresh {
                            Some(swc_core::ecma::transforms::react::RefreshOptions {
                                ..Default::default()
                            })
                        } else {
                            None
                        },
                        ..Default::default()
                    },
                    top_level_mark,
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
            EcmascriptInputTransform::Emotion => {
                let p = std::mem::replace(program, Program::Module(Module::dummy()));
                *program = p.fold_with(&mut swc_emotion::emotion(
                    Default::default(),
                    Path::new(file_name_str),
                    source_map.clone(),
                    comments.clone(),
                ))
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
            EcmascriptInputTransform::StyledComponents => {
                program.visit_mut_with(&mut styled_components::styled_components(
                    FileName::Anon,
                    file_name_hash,
                    parse_json_with_source_context("{}")?,
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
            EcmascriptInputTransform::ClientDirective(transition_name) => {
                let transition_name = &*transition_name.await?;
                if is_client_module(program) {
                    *program = create_proxy_module(transition_name, &format!("./{file_name_str}"));
                    program.visit_mut_with(&mut resolver(unresolved_mark, top_level_mark, false));
                }
            }
            EcmascriptInputTransform::Custom(transform) => {
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
