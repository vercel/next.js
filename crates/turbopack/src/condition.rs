use anyhow::Result;
use async_recursion::async_recursion;
use futures::{stream, StreamExt};
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, Vc};
use turbo_tasks_fs::FileSystemPath;

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq)]
pub enum ContextCondition {
    All(Vec<ContextCondition>),
    Any(Vec<ContextCondition>),
    Not(Box<ContextCondition>),
    InDirectory(String),
    InPath(Vc<FileSystemPath>),
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

    #[async_recursion]
    /// Returns true if the condition matches the context.
    pub async fn matches(&self, context: &FileSystemPath) -> Result<bool> {
        match self {
            ContextCondition::All(conditions) => {
                // False positive.
                #[allow(clippy::manual_try_fold)]
                stream::iter(conditions)
                    .fold(Ok(true), |acc, c| async move {
                        Ok(acc? && c.matches(context).await?)
                    })
                    .await
            }
            ContextCondition::Any(conditions) => {
                // False positive.
                #[allow(clippy::manual_try_fold)]
                stream::iter(conditions)
                    .fold(Ok(true), |acc, c| async move {
                        Ok(acc? || c.matches(context).await?)
                    })
                    .await
            }
            ContextCondition::Not(condition) => condition.matches(context).await.map(|b| !b),
            ContextCondition::InPath(path) => Ok(context.is_inside_ref(&*path.await?)),
            ContextCondition::InDirectory(dir) => Ok(context.path.starts_with(&format!("{dir}/"))
                || context.path.contains(&format!("/{dir}/"))
                || context.path.ends_with(&format!("/{dir}"))
                || context.path == *dir),
        }
    }
}
