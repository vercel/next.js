use std::collections::HashMap;

use regex::Regex;
use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;
use turbo_tasks_fs::FileSystemPathVc;

#[turbo_tasks::function]
pub async fn module_options(_context: FileSystemPathVc) -> ModuleOptionsVc {
    the_module_options()
}

#[turbo_tasks::function]
pub async fn the_module_options() -> ModuleOptionsVc {
    ModuleOptionsVc::cell(ModuleOptions {
        rules: vec![
            ModuleRule::new(
                vec![ModuleRuleCondition::ResourcePathEndsWith(
                    ".json".to_string(),
                )],
                vec![ModuleRuleEffect::ModuleType(ModuleType::Json)],
            ),
            ModuleRule::new(
                vec![ModuleRuleCondition::ResourcePathEndsWith(
                    ".css".to_string(),
                )],
                vec![ModuleRuleEffect::ModuleType(ModuleType::Css)],
            ),
            ModuleRule::new(
                vec![ModuleRuleCondition::ResourcePathEndsWith(".js".to_string())],
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript)],
            ),
            ModuleRule::new(
                vec![ModuleRuleCondition::ResourcePathEndsWith(
                    ".mjs".to_string(),
                )],
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript)],
            ),
            ModuleRule::new(
                vec![ModuleRuleCondition::ResourcePathEndsWith(
                    ".cjs".to_string(),
                )],
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript)],
            ),
            ModuleRule::new(
                vec![ModuleRuleCondition::ResourcePathEndsWith(".ts".to_string())],
                vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript)],
            ),
            ModuleRule::new(
                vec![ModuleRuleCondition::ResourcePathEndsWith(
                    ".d.ts".to_string(),
                )],
                vec![ModuleRuleEffect::ModuleType(
                    ModuleType::TypescriptDeclaration,
                )],
            ),
            ModuleRule::new(
                vec![ModuleRuleCondition::ResourcePathHasNoExtension],
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript)],
            ),
        ],
    })
}

#[turbo_tasks::value(cell: new, eq: manual)]
pub struct ModuleOptions {
    pub rules: Vec<ModuleRule>,
}

#[derive(TraceRawVcs, Serialize, Deserialize)]
pub struct ModuleRule {
    pub conditions: Vec<ModuleRuleCondition>,
    pub effects: HashMap<ModuleRuleEffectKey, ModuleRuleEffect>,
}

impl ModuleRule {
    pub fn new(conditions: Vec<ModuleRuleCondition>, effects: Vec<ModuleRuleEffect>) -> Self {
        ModuleRule {
            conditions,
            effects: effects.into_iter().map(|e| (e.key(), e)).collect(),
        }
    }
}

#[derive(TraceRawVcs, Serialize, Deserialize)]
pub enum ModuleRuleCondition {
    ResourcePathHasNoExtension,
    ResourcePathEndsWith(String),
    ResourcePathRegex(
        #[trace_ignore]
        #[serde(with = "serde_regex")]
        Regex,
    ),
}

#[derive(TraceRawVcs, Serialize, Deserialize)]
pub enum ModuleRuleEffect {
    ModuleType(ModuleType),
    Custom,
}

#[derive(TraceRawVcs, Serialize, Deserialize)]
pub enum ModuleType {
    Ecmascript,
    Typescript,
    TypescriptDeclaration,
    Json,
    Raw,
    Css,
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

#[derive(TraceRawVcs, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ModuleRuleEffectKey {
    ModuleType,
    Custom,
}
