use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, ResolvedVc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    reference_type::ReferenceType, source::Source, source_transform::SourceTransforms,
};
use turbopack_css::CssModuleAssetType;
use turbopack_ecmascript::{EcmascriptInputTransforms, EcmascriptOptions};
use turbopack_wasm::source::WebAssemblySourceType;

use super::{match_mode::MatchMode, CustomModuleType, RuleCondition};

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, NonLocalValue)]
pub struct ModuleRule {
    condition: RuleCondition,
    effects: Vec<ModuleRuleEffect>,
    match_mode: MatchMode,
}

impl ModuleRule {
    /// Creates a new module rule. Will not match internal references.
    pub fn new(condition: RuleCondition, effects: Vec<ModuleRuleEffect>) -> Self {
        ModuleRule {
            condition,
            effects,
            match_mode: MatchMode::NonInternal,
        }
    }

    /// Creates a new module rule. Will only match internal references.
    pub fn new_internal(condition: RuleCondition, effects: Vec<ModuleRuleEffect>) -> Self {
        ModuleRule {
            condition,
            effects,
            match_mode: MatchMode::Internal,
        }
    }

    /// Creates a new module rule. Will match all references.
    pub fn new_all(condition: RuleCondition, effects: Vec<ModuleRuleEffect>) -> Self {
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
        source: ResolvedVc<Box<dyn Source>>,
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
    /// Allow to extend an existing Ecmascript module rules for the additional
    /// transforms. First argument will prepend the existing transforms, and
    /// the second argument will append the new transforms.
    ExtendEcmascriptTransforms {
        prepend: ResolvedVc<EcmascriptInputTransforms>,
        append: ResolvedVc<EcmascriptInputTransforms>,
    },
    SourceTransforms(ResolvedVc<SourceTransforms>),
    Ignore,
}

#[turbo_tasks::value(serialization = "auto_for_input", shared)]
#[derive(Hash, Debug, Copy, Clone)]
pub enum ModuleType {
    Ecmascript {
        transforms: ResolvedVc<EcmascriptInputTransforms>,
        #[turbo_tasks(trace_ignore)]
        options: ResolvedVc<EcmascriptOptions>,
    },
    Typescript {
        transforms: ResolvedVc<EcmascriptInputTransforms>,
        // parse JSX syntax.
        tsx: bool,
        // follow references to imported types.
        analyze_types: bool,
        #[turbo_tasks(trace_ignore)]
        options: ResolvedVc<EcmascriptOptions>,
    },
    TypescriptDeclaration {
        transforms: ResolvedVc<EcmascriptInputTransforms>,
        #[turbo_tasks(trace_ignore)]
        options: ResolvedVc<EcmascriptOptions>,
    },
    Json,
    Raw,
    CssModule,
    Css {
        ty: CssModuleAssetType,
    },
    Static,
    WebAssembly {
        source_ty: WebAssemblySourceType,
    },
    Custom(ResolvedVc<Box<dyn CustomModuleType>>),
}
