use turbo_tasks::TaskInput;
use turbopack_binding::turbopack::{core::chunk::MinifyType, ecmascript_runtime::RuntimeType};

/// The mode in which Next.js is running.
#[turbo_tasks::value(shared)]
#[derive(Debug, Copy, Clone, TaskInput, Ord, PartialOrd, Hash)]
pub enum NextMode {
    /// `next dev --turbo`
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

    pub fn minify_type(&self) -> MinifyType {
        match self {
            NextMode::Development => MinifyType::NoMinify,
            NextMode::Build => MinifyType::Minify,
        }
    }

    pub fn runtime_type(&self) -> RuntimeType {
        match self {
            NextMode::Development => RuntimeType::Development,
            NextMode::Build => RuntimeType::Production,
        }
    }
}
