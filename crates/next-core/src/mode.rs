use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::TaskInput;
use turbopack_ecmascript_runtime::RuntimeType;

use crate::next_shared::webpack_rules::WebpackLoaderBuiltinCondition;

/// The mode in which Next.js is running.
#[turbo_tasks::value(shared)]
#[derive(Debug, Copy, Clone, TaskInput, Ord, PartialOrd, Hash)]
pub enum NextMode {
    /// `next dev --turbopack`
    Development,
    /// `next build`
    Build,
}

impl NextMode {
    /// Returns the NODE_ENV value for the current mode.
    pub fn node_env(&self) -> &'static str {
        match self {
            NextMode::Development => "development",
            NextMode::Build => "production",
        }
    }

    /// Returns conditions that can be used in the Next.js config's turbopack "rules" section for
    /// defining webpack loader configuration.
    pub fn webpack_loader_conditions(&self) -> impl Iterator<Item = WebpackLoaderBuiltinCondition> {
        match self {
            NextMode::Development => [WebpackLoaderBuiltinCondition::Development],
            NextMode::Build => [WebpackLoaderBuiltinCondition::Production],
        }
        .into_iter()
    }

    /// Returns conditions used by `ResolveOptionsContext`.
    pub fn custom_resolve_conditions(&self) -> impl Iterator<Item = RcStr> {
        match self {
            NextMode::Development => [rcstr!("development")],
            NextMode::Build => [rcstr!("production")],
        }
        .into_iter()
    }

    /// Returns true if the development React runtime should be used.
    pub fn is_react_development(&self) -> bool {
        match self {
            NextMode::Development => true,
            NextMode::Build => false,
        }
    }

    pub fn is_development(&self) -> bool {
        match self {
            NextMode::Development => true,
            NextMode::Build => false,
        }
    }

    pub fn is_production(&self) -> bool {
        match self {
            NextMode::Development => false,
            NextMode::Build => true,
        }
    }

    pub fn runtime_type(&self) -> RuntimeType {
        match self {
            NextMode::Development => RuntimeType::Development,
            NextMode::Build => RuntimeType::Production,
        }
    }
}
