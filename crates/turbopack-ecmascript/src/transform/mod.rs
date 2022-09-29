use std::sync::Arc;

use anyhow::Result;
use swc_core::{
    common::{comments::SingleThreadedComments, util::take::Take, FileName, Mark, SourceMap},
    ecma::{
        ast::{Module, Program},
        transforms::react::react,
        visit::{FoldWith, VisitMutWith},
    },
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Debug, Copy, Clone)]
pub enum EcmascriptInputTransform {
    React {
        #[serde(default)]
        refresh: bool,
    },
    CommonJs,
    StyledJsx,
    TypeScript,
    Custom,
}

#[turbo_tasks::value(transparent, serialization = "auto_for_input")]
#[derive(Debug, PartialOrd, Ord, Hash, Clone)]
pub struct EcmascriptInputTransforms(Vec<EcmascriptInputTransform>);

pub struct TransformContext<'a> {
    pub comments: &'a SingleThreadedComments,
    pub top_level_mark: Mark,
    pub unresolved_mark: Mark,
    pub source_map: &'a Arc<SourceMap>,
}

impl EcmascriptInputTransform {
    pub fn apply(
        &self,
        program: &mut Program,
        &TransformContext {
            comments,
            source_map,
            top_level_mark,
            unresolved_mark,
        }: &TransformContext,
    ) {
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
            EcmascriptInputTransform::StyledJsx => {
                // Modeled after https://github.com/swc-project/plugins/blob/ae735894cdb7e6cfd776626fe2bc580d3e80fed9/packages/styled-jsx/src/lib.rs
                let real_program = std::mem::replace(program, Program::Module(Module::dummy()));
                *program = real_program.fold_with(&mut styled_jsx::styled_jsx(
                    source_map.clone(),
                    // styled_jsx don't really use that in a relevant way
                    FileName::Anon,
                ));
            }
            EcmascriptInputTransform::TypeScript => {
                use swc_core::ecma::transforms::typescript::strip;
                program.visit_mut_with(&mut strip(top_level_mark));
            }
            EcmascriptInputTransform::Custom => todo!(),
        }
    }
}
