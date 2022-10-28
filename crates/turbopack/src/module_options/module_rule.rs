use std::collections::HashMap;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{primitives::Regex, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPathReadRef;
use turbopack_css::CssInputTransformsVc;
use turbopack_ecmascript::EcmascriptInputTransformsVc;

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq)]
pub struct ModuleRule {
    condition: ModuleRuleCondition,
    effects: HashMap<ModuleRuleEffectKey, ModuleRuleEffect>,
}

impl ModuleRule {
    pub fn new(condition: ModuleRuleCondition, effects: Vec<ModuleRuleEffect>) -> Self {
        ModuleRule {
            condition,
            effects: effects.into_iter().map(|e| (e.key(), e)).collect(),
        }
    }
}

impl ModuleRule {
    pub fn effects(&self) -> impl Iterator<Item = (&ModuleRuleEffectKey, &ModuleRuleEffect)> {
        self.effects.iter()
    }
}

impl ModuleRule {
    pub fn matches(&self, path: &FileSystemPathReadRef) -> bool {
        self.condition.matches(path)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq)]
pub enum ModuleRuleCondition {
    All(Vec<ModuleRuleCondition>),
    Any(Vec<ModuleRuleCondition>),
    ResourcePathHasNoExtension,
    ResourcePathEndsWith(String),
    ResourcePathInDirectory(String),
    ResourcePathInExactDirectory(FileSystemPathReadRef),
    ResourcePathRegex(#[turbo_tasks(trace_ignore)] Regex),
}

impl ModuleRuleCondition {
    pub fn all(conditions: Vec<ModuleRuleCondition>) -> ModuleRuleCondition {
        ModuleRuleCondition::All(conditions)
    }

    pub fn any(conditions: Vec<ModuleRuleCondition>) -> ModuleRuleCondition {
        ModuleRuleCondition::Any(conditions)
    }
}

impl ModuleRuleCondition {
    pub fn matches(&self, path: &FileSystemPathReadRef) -> bool {
        match self {
            ModuleRuleCondition::All(conditions) => conditions.iter().all(|c| c.matches(path)),
            ModuleRuleCondition::Any(conditions) => conditions.iter().any(|c| c.matches(path)),
            ModuleRuleCondition::ResourcePathEndsWith(end) => path.path.ends_with(end),
            ModuleRuleCondition::ResourcePathHasNoExtension => {
                if let Some(i) = path.path.rfind('.') {
                    if let Some(j) = path.path.rfind('/') {
                        j > i
                    } else {
                        false
                    }
                } else {
                    true
                }
            }
            ModuleRuleCondition::ResourcePathInDirectory(dir) => {
                path.path.starts_with(&format!("{dir}/")) || path.path.contains(&format!("/{dir}/"))
            }
            ModuleRuleCondition::ResourcePathInExactDirectory(parent_path) => {
                path.is_inside(parent_path)
            }
            _ => todo!("not implemented yet"),
        }
    }
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub enum ModuleRuleEffect {
    ModuleType(ModuleType),
    AddEcmascriptTransforms(EcmascriptInputTransformsVc),
    Custom,
}

#[turbo_tasks::value(serialization = "auto_for_input", shared)]
#[derive(PartialOrd, Ord, Hash, Debug, Copy, Clone)]
pub enum ModuleType {
    Ecmascript(EcmascriptInputTransformsVc),
    Typescript(EcmascriptInputTransformsVc),
    TypescriptDeclaration(EcmascriptInputTransformsVc),
    Json,
    Raw,
    Css(CssInputTransformsVc),
    CssModule(CssInputTransformsVc),
    Static,
    // TODO allow custom function when we support function pointers
    Custom(u8),
}

impl ModuleRuleEffect {
    pub fn key(&self) -> ModuleRuleEffectKey {
        match self {
            ModuleRuleEffect::ModuleType(_) => ModuleRuleEffectKey::ModuleType,
            ModuleRuleEffect::AddEcmascriptTransforms(_) => {
                ModuleRuleEffectKey::AddEcmascriptTransforms
            }
            ModuleRuleEffect::Custom => ModuleRuleEffectKey::Custom,
        }
    }
}

#[derive(TraceRawVcs, Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ModuleRuleEffectKey {
    ModuleType,
    AddEcmascriptTransforms,
    Custom,
}
