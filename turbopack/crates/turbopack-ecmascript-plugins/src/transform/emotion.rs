#![allow(unused)]
use std::{
    hash::{Hash, Hasher},
    path::Path,
};

use anyhow::Result;
use async_trait::async_trait;
use rustc_hash::FxHasher;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::util::take::Take,
    ecma::{
        ast::{Module, Program},
        visit::FoldWith,
    },
};
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, OperationValue, ValueDefault, Vc};
use turbopack_ecmascript::{CustomTransformer, TransformContext};

#[derive(
    Clone, PartialEq, Eq, Debug, TraceRawVcs, Serialize, Deserialize, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum EmotionLabelKind {
    DevOnly,
    Always,
    Never,
}

//[TODO]: need to support importmap, there are type mismatch between
//next.config.js to swc's emotion options
#[turbo_tasks::value(shared, operation)]
#[derive(Default, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EmotionTransformConfig {
    pub sourcemap: Option<bool>,
    pub label_format: Option<String>,
    pub auto_label: Option<EmotionLabelKind>,
}

#[turbo_tasks::value_impl]
impl EmotionTransformConfig {
    #[turbo_tasks::function]
    pub fn default_private() -> Vc<Self> {
        Self::cell(Default::default())
    }
}

impl ValueDefault for EmotionTransformConfig {
    fn value_default() -> Vc<Self> {
        EmotionTransformConfig::default_private()
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
            label_format: config.label_format.as_deref().map(From::from),
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

#[async_trait]
impl CustomTransformer for EmotionTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "emotion", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        #[cfg(feature = "transform_emotion")]
        {
            let hash = {
                let mut hasher = FxHasher::default();
                program.hash(&mut hasher);
                hasher.finish()
            };
            program.mutate(swc_emotion::emotion(
                &self.config,
                Path::new(ctx.file_name_str),
                hash as u32,
                ctx.source_map.clone(),
                ctx.comments.clone(),
            ));
        }

        Ok(())
    }
}
