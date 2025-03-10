use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{primitives::Regex, trace::TraceRawVcs, NonLocalValue, ReadRef, ResolvedVc};
use turbo_tasks_fs::{glob::Glob, FileSystemPath};
use turbopack_core::{
    reference_type::ReferenceType, source::Source, virtual_source::VirtualSource,
};

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, NonLocalValue)]
pub enum RuleCondition {
    All(Vec<RuleCondition>),
    Any(Vec<RuleCondition>),
    Not(Box<RuleCondition>),
    ReferenceType(ReferenceType),
    ResourceIsVirtualSource,
    ResourcePathEquals(ReadRef<FileSystemPath>),
    ResourcePathHasNoExtension,
    ResourcePathEndsWith(String),
    ResourcePathInDirectory(String),
    ResourcePathInExactDirectory(ReadRef<FileSystemPath>),
    ResourcePathRegex(#[turbo_tasks(trace_ignore)] Regex),
    /// For paths that are within the same filesystem as the `base`, it need to
    /// match the relative path from base to resource. This includes `./` or
    /// `../` prefix. For paths in a different filesystem, it need to match
    /// the resource path in that filesystem without any prefix. This means
    /// any glob starting with `./` or `../` will only match paths in the
    /// project. Globs starting with `**` can match any path.
    ResourcePathGlob {
        base: ReadRef<FileSystemPath>,
        #[turbo_tasks(trace_ignore)]
        glob: ReadRef<Glob>,
    },
    ResourceBasePathGlob(#[turbo_tasks(trace_ignore)] ReadRef<Glob>),
}

impl RuleCondition {
    pub fn all(conditions: Vec<RuleCondition>) -> RuleCondition {
        RuleCondition::All(conditions)
    }

    pub fn any(conditions: Vec<RuleCondition>) -> RuleCondition {
        RuleCondition::Any(conditions)
    }

    #[allow(clippy::should_implement_trait)]
    pub fn not(condition: RuleCondition) -> RuleCondition {
        RuleCondition::Not(Box::new(condition))
    }
}

impl RuleCondition {
    pub async fn matches(
        &self,
        source: ResolvedVc<Box<dyn Source>>,
        path: &FileSystemPath,
        reference_type: &ReferenceType,
    ) -> Result<bool> {
        Ok(match self {
            RuleCondition::All(conditions) => {
                for condition in conditions {
                    if !Box::pin(condition.matches(source, path, reference_type)).await? {
                        return Ok(false);
                    }
                }
                true
            }
            RuleCondition::Any(conditions) => {
                for condition in conditions {
                    if Box::pin(condition.matches(source, path, reference_type)).await? {
                        return Ok(true);
                    }
                }
                false
            }
            RuleCondition::Not(condition) => {
                !Box::pin(condition.matches(source, path, reference_type)).await?
            }
            RuleCondition::ResourcePathEquals(other) => path == &**other,
            RuleCondition::ResourcePathEndsWith(end) => path.path.ends_with(end),
            RuleCondition::ResourcePathHasNoExtension => {
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
            RuleCondition::ResourcePathInDirectory(dir) => {
                path.path.starts_with(&format!("{dir}/")) || path.path.contains(&format!("/{dir}/"))
            }
            RuleCondition::ResourcePathInExactDirectory(parent_path) => {
                path.is_inside_ref(parent_path)
            }
            RuleCondition::ReferenceType(condition_ty) => condition_ty.includes(reference_type),
            RuleCondition::ResourceIsVirtualSource => {
                ResolvedVc::try_downcast_type::<VirtualSource>(source).is_some()
            }
            RuleCondition::ResourcePathGlob { glob, base } => {
                if let Some(path) = base.get_relative_path_to(path) {
                    glob.execute(&path)
                } else {
                    glob.execute(&path.path)
                }
            }
            RuleCondition::ResourceBasePathGlob(glob) => {
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
