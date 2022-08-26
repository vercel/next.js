use std::collections::HashMap;

use regex::Regex;
use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;
use turbo_tasks_fs::{FileSystemPath, FileSystemPathVc};
use turbopack_ecmascript::{EcmascriptInputTransform, EcmascriptInputTransformsVc};

#[turbo_tasks::function]
pub async fn module_options(_context: FileSystemPathVc) -> ModuleOptionsVc {
    the_module_options()
}

#[turbo_tasks::function]
pub async fn the_module_options() -> ModuleOptionsVc {
    let app_transforms = EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::JSX]);
    let no_transforms = EcmascriptInputTransformsVc::cell(Vec::new());
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
                ModuleRuleCondition::any(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".js".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".jsx".to_string()),
                ]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(
                    app_transforms,
                ))],
            ),
            ModuleRule::new(
                ModuleRuleCondition::all(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".js".to_string()),
                    ModuleRuleCondition::ResourcePathInDirectory("node_modules".to_string()),
                ]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(
                    no_transforms,
                ))],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".mjs".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(
                    app_transforms,
                ))],
            ),
            ModuleRule::new(
                ModuleRuleCondition::all(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".mjs".to_string()),
                    ModuleRuleCondition::ResourcePathInDirectory("node_modules".to_string()),
                ]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(
                    no_transforms,
                ))],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".cjs".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(
                    app_transforms,
                ))],
            ),
            ModuleRule::new(
                ModuleRuleCondition::all(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".cjs".to_string()),
                    ModuleRuleCondition::ResourcePathInDirectory("node_modules".to_string()),
                ]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(
                    no_transforms,
                ))],
            ),
            ModuleRule::new(
                ModuleRuleCondition::any(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".ts".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".tsx".to_string()),
                ]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript(
                    no_transforms,
                ))],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".d.ts".to_string()),
                vec![ModuleRuleEffect::ModuleType(
                    ModuleType::TypescriptDeclaration(no_transforms),
                )],
            ),
            ModuleRule::new(
                ModuleRuleCondition::any(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".apng".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".avif".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".gif".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".ico".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".jpg".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".jpeg".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".png".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".svg".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".webp".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".woff2".to_string()),
                ]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Static)],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathHasNoExtension,
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(
                    no_transforms,
                ))],
            ),
        ],
    })
}

#[turbo_tasks::value(cell = "new", eq = "manual")]
pub struct ModuleOptions {
    pub rules: Vec<ModuleRule>,
}

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

#[derive(TraceRawVcs, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ModuleRuleEffectKey {
    ModuleType,
    Custom,
}
