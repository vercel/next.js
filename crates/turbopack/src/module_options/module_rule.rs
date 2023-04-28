use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::AssetVc, plugin::CustomModuleTypeVc, reference_type::ReferenceType,
    source_transform::SourceTransformsVc,
};
use turbopack_css::CssInputTransformsVc;
use turbopack_ecmascript::{EcmascriptInputTransformsVc, EcmascriptOptions};
use turbopack_mdx::MdxTransformOptionsVc;

use super::ModuleRuleCondition;

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq)]
pub struct ModuleRule {
    condition: ModuleRuleCondition,
    effects: Vec<ModuleRuleEffect>,
}

impl ModuleRule {
    pub fn new(condition: ModuleRuleCondition, effects: Vec<ModuleRuleEffect>) -> Self {
        ModuleRule { condition, effects }
    }

    pub fn effects(&self) -> impl Iterator<Item = &ModuleRuleEffect> {
        self.effects.iter()
    }

    pub async fn matches(
        &self,
        source: AssetVc,
        path: &FileSystemPath,
        reference_type: &ReferenceType,
    ) -> Result<bool> {
        self.condition.matches(source, path, reference_type).await
    }
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub enum ModuleRuleEffect {
    ModuleType(ModuleType),
    AddEcmascriptTransforms(EcmascriptInputTransformsVc),
    SourceTransforms(SourceTransformsVc),
    Custom,
}

#[turbo_tasks::value(serialization = "auto_for_input", shared)]
#[derive(PartialOrd, Ord, Hash, Debug, Copy, Clone)]
pub enum ModuleType {
    Ecmascript {
        transforms: EcmascriptInputTransformsVc,
        #[turbo_tasks(trace_ignore)]
        options: EcmascriptOptions,
    },
    Typescript {
        transforms: EcmascriptInputTransformsVc,
        #[turbo_tasks(trace_ignore)]
        options: EcmascriptOptions,
    },
    TypescriptWithTypes {
        transforms: EcmascriptInputTransformsVc,
        #[turbo_tasks(trace_ignore)]
        options: EcmascriptOptions,
    },
    TypescriptDeclaration {
        transforms: EcmascriptInputTransformsVc,
        #[turbo_tasks(trace_ignore)]
        options: EcmascriptOptions,
    },
    Json,
    Raw,
    Mdx {
        transforms: EcmascriptInputTransformsVc,
        options: MdxTransformOptionsVc,
    },
    Css(CssInputTransformsVc),
    CssModule(CssInputTransformsVc),
    Static,
    Custom(CustomModuleTypeVc),
}
