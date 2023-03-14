use std::path::PathBuf;

#[cfg(feature = "cli")]
use clap::Parser;
use turbo_binding::turbopack::cli_utils::issue::IssueSeverityCliOption;

#[derive(Debug)]
#[cfg_attr(feature = "cli", derive(Parser))]
#[cfg_attr(feature = "cli", clap(author, version, about, long_about = None))]
#[cfg_attr(feature = "serializable", derive(serde::Deserialize))]
#[cfg_attr(feature = "serializable", serde(rename_all = "camelCase"))]
pub struct BuildOptions {
    /// The directory of the Next.js application.
    /// If no directory is provided, the current directory will be used.
    #[cfg_attr(feature = "cli", clap(value_parser))]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub dir: Option<PathBuf>,

    /// The root directory of the project. Nothing outside of this directory can
    /// be accessed. e. g. the monorepo root.
    /// If no directory is provided, `dir` will be used.
    #[cfg_attr(feature = "cli", clap(long, value_parser))]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub root: Option<PathBuf>,

    /// The build id.
    #[cfg_attr(feature = "cli", clap(long, value_parser))]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub build_id: Option<String>,

    /// Display version of the binary. Noop if used in library mode.
    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub display_version: bool,

    /// Filter by issue severity.
    #[cfg_attr(feature = "cli", clap(short, long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub log_level: Option<IssueSeverityCliOption>,

    /// Show all log messages without limit.
    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub show_all: bool,

    /// Expand the log details.
    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub log_detail: bool,

    /// Whether to enable full task stats recording in Turbo Engine.
    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub full_stats: bool,

    /// Enable experimental garbage collection with the provided memory limit in
    /// MB.
    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub memory_limit: Option<usize>,
}
