mod server_to_client_proxy;

use std::{path::Path, sync::Arc};

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
mod next_ssg;

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Debug, Copy, Clone)]
pub enum EcmascriptInputTransform {
    ClientDirective(StringVc),
    CommonJs,
    Custom,
    Emotion,
    /// This enables the Next SSG transform, which will eliminate
    /// `getStaticProps`/`getServerSideProps`/etc. exports from the output, as
    /// well as any imports that are only used by those exports.
    ///
    /// It also provides diagnostics for improper use of `getServerSideProps`.
    NextJsPageSsr,
    NextJsFont,
    PresetEnv(EnvironmentVc),
    React {
        #[serde(default)]
        refresh: bool,
    },
    StyledComponents,
    StyledJsx,
    TypeScript,
}

#[turbo_tasks::value(transparent, serialization = "auto_for_input")]
#[derive(Debug, PartialOrd, Ord, Hash, Clone)]
pub struct EcmascriptInputTransforms(Vec<EcmascriptInputTransform>);

#[turbo_tasks::value_impl]
impl EcmascriptInputTransformsVc {
    #[turbo_tasks::function]
    pub async fn extend(self, other: EcmascriptInputTransformsVc) -> Result<Self> {
        let mut transforms = self.await?.clone_value();
        transforms.extend(&*other.await?);
        Ok(EcmascriptInputTransformsVc::cell(transforms))
    }
}

pub struct TransformContext<'a> {
    pub comments: &'a SwcComments,
    pub top_level_mark: Mark,
    pub unresolved_mark: Mark,
    pub source_map: &'a Arc<SourceMap>,
    pub file_name_str: &'a str,
    pub file_name_hash: u128,
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
            file_name_hash,
        }: &TransformContext<'_>,
    ) -> Result<()> {
        match *self {
            EcmascriptInputTransform::React { refresh } => {
                program.visit_mut_with(&mut react(
                    source_map.clone(),
                    Some(comments.clone()),
                    swc_core::ecma::transforms::react::Options {
                        runtime: Some(swc_core::ecma::transforms::react::Runtime::Automatic),
                        development: Some(true),
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
                    inject_helpers()
                ));
            }
            EcmascriptInputTransform::StyledComponents => {
                program.visit_mut_with(&mut styled_components::styled_components(
                    FileName::Anon,
                    file_name_hash,
                    serde_json::from_str("{}")?,
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
            EcmascriptInputTransform::NextJsPageSsr => {
                use next_ssg::next_ssg;
                let eliminated_packages = Default::default();

                let module_program = unwrap_module_program(program);

                *program = module_program.fold_with(&mut next_ssg(eliminated_packages));
            }
            EcmascriptInputTransform::NextJsFont => {
                let mut next_font = next_font::next_font_loaders(next_font::Config {
                    font_loaders: vec!["@next/font/google".into(), "@next/font/local".into()],
                    relative_file_path_from_root: file_name_str.into(),
                });

                program.visit_mut_with(&mut next_font);
            }
            EcmascriptInputTransform::Custom => todo!(),
        }
        Ok(())
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
