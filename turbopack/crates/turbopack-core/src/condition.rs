use anyhow::Result;
use futures::{stream, StreamExt};
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, ResolvedVc};
use turbo_tasks_fs::FileSystemPath;

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, NonLocalValue)]
pub enum ContextCondition {
    All(Vec<ContextCondition>),
    Any(Vec<ContextCondition>),
    Not(Box<ContextCondition>),
    InDirectory(String),
    InPath(ResolvedVc<FileSystemPath>),
}

impl ContextCondition {
    /// Creates a condition that matches if all of the given conditions match.
    pub fn all(conditions: Vec<ContextCondition>) -> ContextCondition {
        ContextCondition::All(conditions)
    }

    /// Creates a condition that matches if any of the given conditions match.
    pub fn any(conditions: Vec<ContextCondition>) -> ContextCondition {
        ContextCondition::Any(conditions)
    }

    /// Creates a condition that matches if the given condition does not match.
    #[allow(clippy::should_implement_trait)]
    pub fn not(condition: ContextCondition) -> ContextCondition {
        ContextCondition::Not(Box::new(condition))
    }

    /// Returns true if the condition matches the context.
    pub async fn matches(&self, path: &FileSystemPath) -> Result<bool> {
        match self {
            ContextCondition::All(conditions) => {
                // False positive.
                #[allow(clippy::manual_try_fold)]
                stream::iter(conditions)
                    .fold(Ok(true), |acc, c| async move {
                        Ok(acc? && Box::pin(c.matches(path)).await?)
                    })
                    .await
            }
            ContextCondition::Any(conditions) => {
                // False positive.
                #[allow(clippy::manual_try_fold)]
                stream::iter(conditions)
                    .fold(Ok(false), |acc, c| async move {
                        Ok(acc? || Box::pin(c.matches(path)).await?)
                    })
                    .await
            }
            ContextCondition::Not(condition) => Box::pin(condition.matches(path)).await.map(|b| !b),
            ContextCondition::InPath(other_path) => {
                Ok(path.is_inside_or_equal_ref(&*other_path.await?))
            }
            ContextCondition::InDirectory(dir) => Ok(path.path.starts_with(&format!("{dir}/"))
                || path.path.contains(&format!("/{dir}/"))
                || path.path.ends_with(&format!("/{dir}"))
                || path.path == *dir),
        }
    }
}
