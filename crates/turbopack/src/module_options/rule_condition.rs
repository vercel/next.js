use serde::{Deserialize, Serialize};
use turbo_tasks::{primitives::Regex, trace::TraceRawVcs};
use turbo_tasks_fs::{FileSystemPath, FileSystemPathReadRef};
use turbopack_core::reference_type::ReferenceType;

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq)]
pub enum ModuleRuleCondition {
    All(Vec<ModuleRuleCondition>),
    Any(Vec<ModuleRuleCondition>),
    Not(Box<ModuleRuleCondition>),
    ReferenceType(ReferenceType),
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
    pub fn matches(&self, path: &FileSystemPath, reference_type: &ReferenceType) -> bool {
        match self {
            ModuleRuleCondition::All(conditions) => {
                conditions.iter().all(|c| c.matches(path, reference_type))
            }
            ModuleRuleCondition::Any(conditions) => {
                conditions.iter().any(|c| c.matches(path, reference_type))
            }
            ModuleRuleCondition::Not(condition) => !condition.matches(path, reference_type),
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
            _ => todo!("not implemented yet"),
        }
    }
}
