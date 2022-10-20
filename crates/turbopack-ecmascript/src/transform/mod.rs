mod server_to_client_proxy;

use std::sync::Arc;

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
use turbopack_core::environment::EnvironmentVc;

use self::server_to_client_proxy::{create_proxy_module, is_client_module};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Debug, Copy, Clone)]
pub enum EcmascriptInputTransform {
    React {
        #[serde(default)]
        refresh: bool,
    },
    CommonJs,
    PresetEnv(EnvironmentVc),
    StyledJsx,
    TypeScript,
    ClientDirective(StringVc),
    Custom,
}

#[turbo_tasks::value(transparent, serialization = "auto_for_input")]
#[derive(Debug, PartialOrd, Ord, Hash, Clone)]
pub struct EcmascriptInputTransforms(Vec<EcmascriptInputTransform>);

pub struct TransformContext<'a> {
    pub comments: &'a SwcComments,
    pub top_level_mark: Mark,
    pub unresolved_mark: Mark,
    pub source_map: &'a Arc<SourceMap>,
    pub file_name_str: &'a str,
}

impl EcmascriptInputTransform {
    pub async fn apply(
        &self,
        program: &mut Program,
        &TransformContext {
            comments,
            source_map,
            top_level_mark,
            unresolved_mark,
            file_name_str,
        }: &TransformContext<'_>,
    ) -> Result<()> {
        match *self {
            EcmascriptInputTransform::React { refresh } => {
                program.visit_mut_with(&mut react(
                    source_map.clone(),
                    Some(comments.clone()),
                    swc_core::ecma::transforms::react::Options {
                        runtime: Some(swc_core::ecma::transforms::react::Runtime::Automatic),
                        refresh: if refresh {
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
            EcmascriptInputTransform::PresetEnv(env) => {
                let versions = env.runtime_versions().await?;
                let config = swc_core::ecma::preset_env::Config {
                    targets: Some(Targets::Versions(*versions)),
                    mode: None, // Don't insert core-js polyfills
                    ..Default::default()
                };

                let module_program = match program {
                    Program::Module(_) => {
                        std::mem::replace(program, Program::Module(Module::dummy()))
                    }
                    Program::Script(s) => Program::Module(Module {
                        span: s.span,
                        body: s
                            .body
                            .iter()
                            .map(|stmt| ModuleItem::Stmt(stmt.clone()))
                            .collect(),
                        shebang: s.shebang.clone(),
                    }),
                };

                *program = module_program.fold_with(&mut chain!(
                    preset_env::preset_env(
                        top_level_mark,
                        Some(comments.clone()),
                        config,
                        Assumptions::default(),
                        &mut FeatureFlag::empty(),
                    ),
                    inject_helpers()
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
            EcmascriptInputTransform::TypeScript => {
                use swc_core::ecma::transforms::typescript::strip;
                program.visit_mut_with(&mut strip(top_level_mark));
            }
            EcmascriptInputTransform::ClientDirective(transition_name) => {
                let transition_name = &*transition_name.await?;
                if is_client_module(program) {
                    *program = create_proxy_module(transition_name, &format!("./{file_name_str}"));
                    program.visit_mut_with(&mut resolver(unresolved_mark, top_level_mark, false));
                }
            }
            EcmascriptInputTransform::Custom => todo!(),
        }
        Ok(())
    }
}
