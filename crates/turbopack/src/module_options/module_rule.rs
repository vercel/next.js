use std::collections::HashMap;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    primitives::{BoolVc, RegexVc},
    trace::TraceRawVcs,
    TryJoinIterExt,
};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_css::CssInputTransformsVc;
use turbopack_ecmascript::EcmascriptInputTransformsVc;

#[turbo_tasks::value]
pub struct ModuleRule {
    condition: ModuleRuleConditionVc,
    effects: HashMap<ModuleRuleEffectKey, ModuleRuleEffectVc>,
}

#[turbo_tasks::value_impl]
impl ModuleRuleVc {
    #[turbo_tasks::function]
    pub async fn new(
        condition: ModuleRuleConditionVc,
        effects: Vec<ModuleRuleEffectVc>,
    ) -> Result<Self> {
        Ok(ModuleRule {
            condition,
            effects: effects
                .into_iter()
                .map(|e| async move { Ok((e.await?.key(), e)) })
                .try_join()
                .await?
                .into_iter()
                .collect(),
        }
        .cell())
    }
}

impl ModuleRule {
    pub fn effects(&self) -> impl Iterator<Item = (&ModuleRuleEffectKey, &ModuleRuleEffectVc)> {
        self.effects.iter()
    }
}

#[turbo_tasks::value_impl]
impl ModuleRuleVc {
    #[turbo_tasks::function]
    pub async fn matches(self, path: FileSystemPathVc) -> Result<BoolVc> {
        Ok(self.await?.condition.matches(path))
    }
}

#[turbo_tasks::value(shared)]
pub enum ModuleRuleCondition {
    All(Vec<ModuleRuleConditionVc>),
    Any(Vec<ModuleRuleConditionVc>),
    ResourcePathHasNoExtension,
    ResourcePathEndsWith(String),
    ResourcePathInDirectory(String),
    ResourcePathInExactDirectory(FileSystemPathVc),
    ResourcePathRegex(RegexVc),
}

impl ModuleRuleCondition {
    pub fn all(conditions: Vec<ModuleRuleCondition>) -> ModuleRuleCondition {
        ModuleRuleCondition::All(conditions.into_iter().map(|c| c.cell()).collect())
    }

    pub fn any(conditions: Vec<ModuleRuleCondition>) -> ModuleRuleCondition {
        ModuleRuleCondition::Any(conditions.into_iter().map(|c| c.cell()).collect())
    }
}

#[turbo_tasks::value_impl]
impl ModuleRuleConditionVc {
    #[turbo_tasks::function]
    pub async fn matches(self, path: FileSystemPathVc) -> Result<BoolVc> {
        let path_ref = path.await?;
        Ok(match &*self.await? {
            ModuleRuleCondition::All(conditions) => BoolVc::cell(
                conditions
                    .iter()
                    .map(|c| c.matches(path))
                    .try_join()
                    .await?
                    .into_iter()
                    .all(|c| *c),
            ),
            ModuleRuleCondition::Any(conditions) => BoolVc::cell(
                conditions
                    .iter()
                    .map(|c| c.matches(path))
                    .try_join()
                    .await?
                    .into_iter()
                    .any(|c| *c),
            ),
            ModuleRuleCondition::ResourcePathEndsWith(end) => {
                BoolVc::cell(path_ref.path.ends_with(end))
            }
            ModuleRuleCondition::ResourcePathHasNoExtension => {
                BoolVc::cell(if let Some(i) = path_ref.path.rfind('.') {
                    if let Some(j) = path_ref.path.rfind('/') {
                        j > i
                    } else {
                        false
                    }
                } else {
                    true
                })
            }
            ModuleRuleCondition::ResourcePathInDirectory(dir) => BoolVc::cell(
                path_ref.path.starts_with(&format!("{dir}/"))
                    || path_ref.path.contains(&format!("/{dir}/")),
            ),
            ModuleRuleCondition::ResourcePathInExactDirectory(parent_path) => {
                path.is_inside(*parent_path)
            }
            _ => todo!("not implemented yet"),
        })
    }
}

#[turbo_tasks::value(shared)]
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

#[derive(TraceRawVcs, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ModuleRuleEffectKey {
    ModuleType,
    AddEcmascriptTransforms,
    Custom,
}
