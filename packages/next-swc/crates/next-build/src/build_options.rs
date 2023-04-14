use std::path::PathBuf;

use next_core::{next_config::Rewrites, turbopack::core::issue::IssueSeverity};

#[derive(Clone, Debug)]
pub struct BuildOptions {
    pub dir: Option<PathBuf>,

    pub root: Option<PathBuf>,

    pub memory_limit: Option<usize>,

    pub log_level: Option<IssueSeverity>,

    pub show_all: bool,

    pub log_detail: bool,

    pub full_stats: bool,

    pub build_context: Option<BuildContext>,
}

#[derive(Clone, Debug)]
pub struct BuildContext {
    /// The build id.
    pub build_id: String,

    /// Next.js config rewrites.
    pub rewrites: Rewrites,
}
