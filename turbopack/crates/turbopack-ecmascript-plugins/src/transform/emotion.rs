#![allow(unused)]
use std::{
    hash::{Hash, Hasher},
    path::Path,
};

use anyhow::Result;
use async_trait::async_trait;
use indexmap::IndexMap;
use rustc_hash::{FxBuildHasher, FxHasher};
use serde::{Deserialize, Serialize};
use swc_core::{
    atoms::Atom,
    common::util::take::Take,
    ecma::{
        ast::{Module, Program},
        visit::FoldWith,
    },
};
use swc_emotion::ImportMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, OperationValue, ValueDefault, Vc, trace::TraceRawVcs};
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

#[derive(
    Clone, PartialEq, Eq, Debug, TraceRawVcs, Serialize, Deserialize, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct EmotionImportItemConfig {
    pub canonical_import: EmotionItemSpecifier,
    pub styled_base_import: Option<EmotionItemSpecifier>,
}

impl From<&EmotionImportItemConfig> for swc_emotion::ImportItemConfig {
    fn from(value: &EmotionImportItemConfig) -> Self {
        swc_emotion::ImportItemConfig {
            canonical_import: From::from(&value.canonical_import),
            styled_base_import: value.styled_base_import.as_ref().map(From::from),
        }
    }
}

#[derive(
    Clone, PartialEq, Eq, Debug, TraceRawVcs, Serialize, Deserialize, NonLocalValue, OperationValue,
)]
pub struct EmotionItemSpecifier(pub RcStr, pub RcStr);

impl From<&EmotionItemSpecifier> for swc_emotion::ItemSpecifier {
    fn from(value: &EmotionItemSpecifier) -> Self {
        swc_emotion::ItemSpecifier(value.0.as_str().into(), value.1.as_str().into())
    }
}

pub type EmotionImportMapValue = IndexMap<RcStr, EmotionImportItemConfig, FxBuildHasher>;

#[turbo_tasks::value(shared, operation)]
#[derive(Default, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EmotionTransformConfig {
    pub sourcemap: Option<bool>,
    pub label_format: Option<String>,
    pub auto_label: Option<EmotionLabelKind>,
    pub import_map: Option<IndexMap<RcStr, EmotionImportMapValue, FxBuildHasher>>,
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
            auto_label: match config.auto_label.as_ref() {
                Some(EmotionLabelKind::Always) => Some(true),
                Some(EmotionLabelKind::Never) => Some(false),
                // [TODO]: this is not correct (doesn't take current mode into account)
                Some(EmotionLabelKind::DevOnly) => None,
                None => None,
            },
            import_map: config.import_map.as_ref().map(|map| {
                map.iter()
                    .map(|(k, v)| {
                        (
                            k.as_str().into(),
                            swc_emotion::ImportMapValue::from_iter(v.iter().map(|(k, v)| {
                                (k.as_str().into(), swc_emotion::ImportItemConfig::from(v))
                            })),
                        )
                    })
                    .collect()
            }),
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
