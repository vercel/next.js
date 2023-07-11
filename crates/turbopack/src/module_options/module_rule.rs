use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    reference_type::ReferenceType, source::SourceVc, source_transform::SourceTransformsVc,
};
use turbopack_css::{CssInputTransformsVc, CssModuleAssetType};
use turbopack_ecmascript::{EcmascriptInputTransformsVc, EcmascriptOptions};
use turbopack_mdx::MdxTransformOptionsVc;

use super::{CustomModuleTypeVc, ModuleRuleCondition};

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq)]
pub struct ModuleRule {
    condition: ModuleRuleCondition,
    effects: Vec<ModuleRuleEffect>,
    match_mode: MatchMode,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs)]
enum MatchMode {
    // Match all but internal references.
    NonInternal,
    // Only match internal references.
    Internal,
    // Match both internal and non-internal references.
    All,
}

impl MatchMode {
    fn matches(&self, reference_type: &ReferenceType) -> bool {
        matches!(
            (self, reference_type.is_internal()),
            (MatchMode::All, _) | (MatchMode::NonInternal, false) | (MatchMode::Internal, true)
        )
    }
}

impl ModuleRule {
    /// Creates a new module rule. Will not match internal references.
    pub fn new(condition: ModuleRuleCondition, effects: Vec<ModuleRuleEffect>) -> Self {
        ModuleRule {
            condition,
            effects,
            match_mode: MatchMode::NonInternal,
        }
    }

    /// Creates a new module rule. Will only matches internal references.
    pub fn new_internal(condition: ModuleRuleCondition, effects: Vec<ModuleRuleEffect>) -> Self {
        ModuleRule {
            condition,
            effects,
            match_mode: MatchMode::Internal,
        }
    }

    /// Creates a new module rule. Will only matches internal references.
    pub fn new_all(condition: ModuleRuleCondition, effects: Vec<ModuleRuleEffect>) -> Self {
        ModuleRule {
            condition,
            effects,
            match_mode: MatchMode::All,
        }
    }

    pub fn effects(&self) -> impl Iterator<Item = &ModuleRuleEffect> {
        self.effects.iter()
    }

    pub async fn matches(
        &self,
        source: SourceVc,
        path: &FileSystemPath,
        reference_type: &ReferenceType,
    ) -> Result<bool> {
        Ok(self.match_mode.matches(reference_type)
            && self.condition.matches(source, path, reference_type).await?)
    }
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub enum ModuleRuleEffect {
    ModuleType(ModuleType),
    AddEcmascriptTransforms(EcmascriptInputTransformsVc),
    SourceTransforms(SourceTransformsVc),
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
    CssGlobal,
    CssModule,
    Css {
        ty: CssModuleAssetType,
        transforms: CssInputTransformsVc,
    },
    Static,
    Custom(CustomModuleTypeVc),
}
