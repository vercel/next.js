use std::collections::HashMap;

use regex::Regex;
use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;
use turbo_tasks_fs::{FileSystemPath, FileSystemPathVc};

#[turbo_tasks::function]
pub async fn module_options(_context: FileSystemPathVc) -> ModuleOptionsVc {
    the_module_options()
}

#[turbo_tasks::function]
pub async fn the_module_options() -> ModuleOptionsVc {
    ModuleOptionsVc::cell(ModuleOptions {
        rules: vec![
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".json".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Json)],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".css".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Css)],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".js".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript)],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".mjs".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript)],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".cjs".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript)],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".ts".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript)],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".d.ts".to_string()),
                vec![ModuleRuleEffect::ModuleType(
                    ModuleType::TypescriptDeclaration,
                )],
            ),
            ModuleRule::new(
                ModuleRuleCondition::any(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".png".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".jpg".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".webp".to_string()),
                ]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Static)],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathHasNoExtension,
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

#[derive(TraceRawVcs, Serialize, Deserialize)]
pub enum ModuleRuleCondition {
    And(Box<ModuleRuleCondition>, Box<ModuleRuleCondition>),
    Or(Box<ModuleRuleCondition>, Box<ModuleRuleCondition>),
    All(Vec<ModuleRuleCondition>),
    Any(Vec<ModuleRuleCondition>),
    ResourcePathHasNoExtension,
    ResourcePathEndsWith(String),
    ResourcePathRegex(
        #[trace_ignore]
        #[serde(with = "serde_regex")]
        Regex,
    ),
}

impl ModuleRuleCondition {
    pub fn and(self, other: ModuleRuleCondition) -> ModuleRuleCondition {
        ModuleRuleCondition::And(Box::new(self), Box::new(other))
    }

    pub fn or(self, other: ModuleRuleCondition) -> ModuleRuleCondition {
        ModuleRuleCondition::Or(Box::new(self), Box::new(other))
    }

    pub fn all(conditions: Vec<ModuleRuleCondition>) -> ModuleRuleCondition {
        ModuleRuleCondition::All(conditions)
    }

    pub fn any(conditions: Vec<ModuleRuleCondition>) -> ModuleRuleCondition {
        ModuleRuleCondition::Any(conditions)
    }

    pub fn matches(&self, path: &FileSystemPath) -> bool {
        match self {
            ModuleRuleCondition::And(c1, c2) => c1.matches(path) && c2.matches(path),
            ModuleRuleCondition::Or(c1, c2) => c1.matches(path) || c2.matches(path),
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
            _ => todo!("not implemented yet"),
        }
    }
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

#[derive(TraceRawVcs, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ModuleRuleEffectKey {
    ModuleType,
    Custom,
}
