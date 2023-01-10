use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;
use turbo_tasks_fs::FileSystemPath;

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq)]
pub enum ContextCondition {
    All(Vec<ContextCondition>),
    Any(Vec<ContextCondition>),
    Not(Box<ContextCondition>),
    InDirectory(String),
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
    pub fn matches(&self, context: &FileSystemPath) -> bool {
        match self {
            ContextCondition::All(conditions) => conditions.iter().all(|c| c.matches(context)),
            ContextCondition::Any(conditions) => conditions.iter().any(|c| c.matches(context)),
            ContextCondition::Not(condition) => !condition.matches(context),
            ContextCondition::InDirectory(dir) => {
                context.path.starts_with(&format!("{dir}/"))
                    || context.path.contains(&format!("/{dir}/"))
                    || context.path.ends_with(&format!("/{dir}"))
                    || context.path == *dir
            }
        }
    }
}
