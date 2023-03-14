#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Copy, Clone, Hash, PartialOrd, Ord)]
pub enum NextMode {
    Development,
    Build,
}

impl NextMode {
    pub fn node_env(&self) -> &'static str {
        match self {
            NextMode::Development => "development",
            NextMode::Build => "production",
        }
    }
}
