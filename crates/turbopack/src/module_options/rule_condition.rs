use anyhow::Result;
use async_recursion::async_recursion;
use serde::{Deserialize, Serialize};
use turbo_tasks::{primitives::Regex, trace::TraceRawVcs};
use turbo_tasks_fs::{FileSystemPath, FileSystemPathReadRef};
use turbopack_core::{
    asset::AssetVc, reference_type::ReferenceType, virtual_asset::VirtualAssetVc,
};

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq)]
pub enum ModuleRuleCondition {
    All(Vec<ModuleRuleCondition>),
    Any(Vec<ModuleRuleCondition>),
    Not(Box<ModuleRuleCondition>),
    ReferenceType(ReferenceType),
    ResourceIsVirtualAsset,
    ResourcePathEquals(FileSystemPathReadRef),
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

    #[allow(clippy::should_implement_trait)]
    pub fn not(condition: ModuleRuleCondition) -> ModuleRuleCondition {
        ModuleRuleCondition::Not(Box::new(condition))
    }
}

impl ModuleRuleCondition {
    #[async_recursion]
    pub async fn matches(
        &self,
        source: AssetVc,
        path: &FileSystemPath,
        reference_type: &ReferenceType,
    ) -> Result<bool> {
        Ok(match self {
            ModuleRuleCondition::All(conditions) => {
                for condition in conditions {
                    if !condition.matches(source, path, reference_type).await? {
                        return Ok(false);
                    }
                }
                true
            }
            ModuleRuleCondition::Any(conditions) => {
                for condition in conditions {
                    if condition.matches(source, path, reference_type).await? {
                        return Ok(true);
                    }
                }
                false
            }
            ModuleRuleCondition::Not(condition) => {
                !condition.matches(source, path, reference_type).await?
            }
            ModuleRuleCondition::ResourcePathEquals(other) => path == &**other,
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
            ModuleRuleCondition::ReferenceType(condition_ty) => {
                condition_ty.includes(reference_type)
            }
            ModuleRuleCondition::ResourceIsVirtualAsset => {
                VirtualAssetVc::resolve_from(source).await?.is_some()
            }
            _ => todo!("not implemented yet"),
        })
    }
}
