use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{reference_type::ReferenceType, source::Source};

use super::{match_mode::MatchMode, RuleCondition};
use crate::transition::Transition;

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq)]
pub struct TransitionRule {
    condition: RuleCondition,
    transition: Vc<Box<dyn Transition>>,
    match_mode: MatchMode,
}

impl TransitionRule {
    /// Creates a new transition rule. Will not match internal references.
    pub fn new(condition: RuleCondition, transition: Vc<Box<dyn Transition>>) -> Self {
        TransitionRule {
            condition,
            transition,
            match_mode: MatchMode::NonInternal,
        }
    }

    /// Creates a new transition rule. Will only match internal references.
    pub fn new_internal(condition: RuleCondition, transition: Vc<Box<dyn Transition>>) -> Self {
        TransitionRule {
            condition,
            transition,
            match_mode: MatchMode::Internal,
        }
    }

    /// Creates a new transition rule. Will match all references.
    pub fn new_all(condition: RuleCondition, transition: Vc<Box<dyn Transition>>) -> Self {
        TransitionRule {
            condition,
            transition,
            match_mode: MatchMode::All,
        }
    }

    pub fn transition(&self) -> Vc<Box<dyn Transition>> {
        self.transition
    }

    pub async fn matches(
        &self,
        source: Vc<Box<dyn Source>>,
        path: &FileSystemPath,
        reference_type: &ReferenceType,
    ) -> Result<bool> {
        Ok(self.match_mode.matches(reference_type)
            && self.condition.matches(source, path, reference_type).await?)
    }
}
