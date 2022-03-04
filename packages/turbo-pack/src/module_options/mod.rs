use regex::Regex;
use std::collections::HashMap;
use turbo_tasks::trace::TraceSlotRefs;
use turbo_tasks_fs::FileSystemPathRef;

#[turbo_tasks::function]
pub async fn module_options(_context: FileSystemPathRef) -> ModuleOptionsRef {
    the_module_options()
}

#[turbo_tasks::function]
pub async fn the_module_options() -> ModuleOptionsRef {
    ModuleOptions {
        rules: vec![
            ModuleRule::new(
                vec![ModuleRuleCondition::ResourcePathEndsWith(
                    ".json".to_string(),
                )],
                vec![ModuleRuleEffect::ModuleType(ModuleType::Json)],
            ),
            ModuleRule::new(
                vec![ModuleRuleCondition::ResourcePathEndsWith(".js".to_string())],
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript)],
            ),
        ],
    }
    .into()
}

#[turbo_tasks::value(into: new)]
pub struct ModuleOptions {
    pub rules: Vec<ModuleRule>,
}

#[derive(TraceSlotRefs)]
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

#[derive(TraceSlotRefs)]
pub enum ModuleRuleCondition {
    ResourcePathEndsWith(String),
    ResourcePathRegex(#[trace_ignore] Regex),
}

#[derive(TraceSlotRefs)]
pub enum ModuleRuleEffect {
    ModuleType(ModuleType),
    Custom,
}

#[derive(TraceSlotRefs)]
pub enum ModuleType {
    Ecmascript,
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

#[derive(TraceSlotRefs, PartialEq, Eq, Hash)]
pub enum ModuleRuleEffectKey {
    ModuleType,
    Custom,
}
