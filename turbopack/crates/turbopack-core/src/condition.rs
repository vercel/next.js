use futures::StreamExt;
use serde::{Deserialize, Serialize};
use turbo_tasks::{NonLocalValue, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, NonLocalValue)]
pub enum ContextCondition {
    All(Vec<ContextCondition>),
    Any(Vec<ContextCondition>),
    Not(Box<ContextCondition>),
    InDirectory(String),
    InPath(FileSystemPath),
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
    pub fn matches(&self, path: &FileSystemPath) -> bool {
        match self {
            ContextCondition::All(conditions) => {
                for condition in conditions {
                    if !condition.matches(path) {
                        return false;
                    }
                }
                return true;
            }
            ContextCondition::Any(conditions) => {
                for condition in conditions {
                    if condition.matches(path) {
                        return true;
                    }
                }
                return false;
            }
            ContextCondition::Not(condition) => !condition.matches(path),
            ContextCondition::InPath(other_path) => path.is_inside_or_equal_ref(other_path),
            ContextCondition::InDirectory(dir) => {
                if let Some(pos) = path.path.find(dir) {
                    let end = pos + dir.len();
                    (pos == 0 || path.path.as_bytes()[pos - 1] == b'/')
                        && (end == path.path.len() || path.path.as_bytes()[end] == b'/')
                } else {
                    false
                }
            }
        }
    }
}
