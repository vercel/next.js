use anyhow::Result;
use async_recursion::async_recursion;
use serde::{Deserialize, Serialize};
use turbo_tasks::{primitives::Regex, trace::TraceRawVcs};
use turbo_tasks_fs::{glob::GlobReadRef, FileSystemPath, FileSystemPathReadRef};
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
    /// For paths that are within the same filesystem as the `base`, it need to
    /// match the relative path from base to resource. This includes `./` or
    /// `../` prefix. For paths in a different filesystem, it need to match
    /// the resource path in that filesystem without any prefix. This means
    /// any glob starting with `./` or `../` will only match paths in the
    /// project. Globs starting with `**` can match any path.
    ResourcePathGlob {
        base: FileSystemPathReadRef,
        #[turbo_tasks(trace_ignore)]
        glob: GlobReadRef,
    },
    ResourceBasePathGlob(#[turbo_tasks(trace_ignore)] GlobReadRef),
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
            ModuleRuleCondition::ResourcePathGlob { glob, base } => {
                if let Some(path) = base.get_relative_path_to(path) {
                    glob.execute(&path)
                } else {
                    glob.execute(&path.path)
                }
            }
            ModuleRuleCondition::ResourceBasePathGlob(glob) => {
                let basename = path
                    .path
                    .rsplit_once('/')
                    .map_or(path.path.as_str(), |(_, b)| b);
                glob.execute(basename)
            }
            _ => todo!("not implemented yet"),
        })
    }
}
