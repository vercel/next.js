use std::collections::HashMap;

use regex::Regex;
use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;
use turbo_tasks_fs::FileSystemPath;
use turbopack_css::CssInputTransformsVc;
use turbopack_ecmascript::EcmascriptInputTransformsVc;

#[derive(TraceRawVcs, Debug, Serialize, Deserialize)]
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

    pub fn matches(&self, path: &FileSystemPath) -> bool {
        self.condition.matches(path)
    }

    pub fn effects(&self) -> impl Iterator<Item = (&ModuleRuleEffectKey, &ModuleRuleEffect)> {
        self.effects.iter()
    }
}

#[derive(TraceRawVcs, Debug, Serialize, Deserialize)]
pub enum ModuleRuleCondition {
    All(Vec<ModuleRuleCondition>),
    Any(Vec<ModuleRuleCondition>),
    ResourcePathHasNoExtension,
    ResourcePathEndsWith(String),
    ResourcePathInDirectory(String),
    ResourcePathRegex(
        #[turbo_tasks(trace_ignore)]
        #[serde(with = "serde_regex")]
        Regex,
    ),
}

impl ModuleRuleCondition {
    pub fn all(conditions: Vec<ModuleRuleCondition>) -> ModuleRuleCondition {
        ModuleRuleCondition::All(conditions)
    }

    pub fn any(conditions: Vec<ModuleRuleCondition>) -> ModuleRuleCondition {
        ModuleRuleCondition::Any(conditions)
    }

    pub fn matches(&self, path: &FileSystemPath) -> bool {
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
            _ => todo!("not implemented yet"),
        }
    }
}

#[derive(TraceRawVcs, Debug, Serialize, Deserialize)]
pub enum ModuleRuleEffect {
    ModuleType(ModuleType),
    Custom,
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Debug, Copy, Clone)]
pub enum ModuleType {
    Ecmascript(EcmascriptInputTransformsVc),
    Typescript(EcmascriptInputTransformsVc),
    TypescriptDeclaration(EcmascriptInputTransformsVc),
    Json,
    Raw,
    Css(CssInputTransformsVc),
    Static,
    // TODO allow custom function when we support function pointers
    Custom(u8),
}

impl ModuleRuleEffect {
    pub fn key(&self) -> ModuleRuleEffectKey {
        match self {
            ModuleRuleEffect::ModuleType(_) => ModuleRuleEffectKey::ModuleType,
            ModuleRuleEffect::Custom => ModuleRuleEffectKey::Custom,
        }
    }
}

#[derive(TraceRawVcs, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ModuleRuleEffectKey {
    ModuleType,
    Custom,
}
