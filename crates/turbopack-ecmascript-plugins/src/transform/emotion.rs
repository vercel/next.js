#![allow(unused)]
use std::{
    hash::{Hash, Hasher},
    path::Path,
};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::util::take::Take,
    ecma::{
        ast::{Module, Program},
        visit::FoldWith,
    },
};
use turbo_tasks::trace::TraceRawVcs;
use turbopack_ecmascript::{CustomTransformer, TransformContext};

#[derive(Clone, PartialEq, Eq, Debug, TraceRawVcs, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EmotionLabelKind {
    DevOnly,
    Always,
    Never,
}

#[turbo_tasks::value(transparent)]
pub struct OptionEmotionTransformConfig(Option<EmotionTransformConfigVc>);

//[TODO]: need to support importmap, there are type mismatch between
//next.config.js to swc's emotion options
#[turbo_tasks::value(shared)]
#[derive(Default, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EmotionTransformConfig {
    pub sourcemap: Option<bool>,
    pub label_format: Option<String>,
    pub auto_label: Option<EmotionLabelKind>,
}

#[turbo_tasks::value_impl]
impl EmotionTransformConfigVc {
    #[turbo_tasks::function]
    pub fn default() -> Self {
        Self::cell(Default::default())
    }
}

impl Default for EmotionTransformConfigVc {
    fn default() -> Self {
        Self::default()
    }
}

#[derive(Debug)]
pub struct EmotionTransformer {
    #[cfg(feature = "transform_emotion")]
    config: swc_emotion::EmotionOptions,
}

#[cfg(feature = "transform_emotion")]
impl EmotionTransformer {
    pub fn new(config: &EmotionTransformConfig) -> Option<Self> {
        let config = swc_emotion::EmotionOptions {
            // When you create a transformer structure, it is assumed that you are performing an
            // emotion transform.
            enabled: Some(true),
            sourcemap: config.sourcemap,
            label_format: config.label_format.clone(),
            auto_label: if let Some(auto_label) = config.auto_label.as_ref() {
                match auto_label {
                    EmotionLabelKind::Always => Some(true),
                    EmotionLabelKind::Never => Some(false),
                    // [TODO]: this is not correct coerece, need to be fixed
                    EmotionLabelKind::DevOnly => None,
                }
            } else {
                None
            },
            ..Default::default()
        };

        Some(EmotionTransformer { config })
    }
}

#[cfg(not(feature = "transform_emotion"))]
impl EmotionTransformer {
    pub fn new(_config: &EmotionTransformConfig) -> Option<Self> {
        None
    }
}

impl CustomTransformer for EmotionTransformer {
    fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Option<Program> {
        #[cfg(feature = "transform_emotion")]
        {
            let p = std::mem::replace(program, Program::Module(Module::dummy()));
            let hash = {
                #[allow(clippy::disallowed_types)]
                let mut hasher = std::collections::hash_map::DefaultHasher::new();
                p.hash(&mut hasher);
                hasher.finish()
            };
            *program = p.fold_with(&mut swc_emotion::emotion(
                self.config.clone(),
                Path::new(ctx.file_name_str),
                hash as u32,
                ctx.source_map.clone(),
                ctx.comments.clone(),
            ));
        }

        None
    }
}

pub async fn build_emotion_transformer(
    config: &Option<EmotionTransformConfigVc>,
) -> Result<Option<Box<EmotionTransformer>>> {
    Ok(if let Some(config) = config {
        EmotionTransformer::new(&*config.await?).map(Box::new)
    } else {
        None
    })
}
