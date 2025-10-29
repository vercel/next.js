use std::{
    net::IpAddr,
    path::{Path, PathBuf},
    str::FromStr,
};

use anyhow::anyhow;
use clap::{Args, Parser, ValueEnum};
use serde::{Deserialize, Serialize};
use turbo_tasks::{NonLocalValue, TaskInput, trace::TraceRawVcs};
use turbopack_core::issue::IssueSeverity;

#[derive(Debug, Parser)]
#[clap(author, version, about, long_about = None)]
pub enum Arguments {
    Build(BuildArguments),
    Dev(DevArguments),
}

impl Arguments {
    /// The directory of the application. see [CommonArguments]::dir
    pub fn dir(&self) -> Option<&Path> {
        match self {
            Arguments::Build(args) => args.common.dir.as_deref(),
            Arguments::Dev(args) => args.common.dir.as_deref(),
        }
    }

    /// The number of worker threads to use. see [CommonArguments]::worker_threads
    pub fn worker_threads(&self) -> Option<usize> {
        match self {
            Arguments::Build(args) => args.common.worker_threads,
            Arguments::Dev(args) => args.common.worker_threads,
        }
    }
}

#[derive(
    Copy,
    Clone,
    Debug,
    ValueEnum,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Hash,
    TaskInput,
    NonLocalValue,
    TraceRawVcs,
)]
pub enum Target {
    Browser,
    Node,
}

#[derive(Debug, Args, Clone)]
pub struct CommonArguments {
    /// The entrypoints of the project. Resolved relative to the project's
    /// directory (`--dir`).
    #[clap(value_parser)]
    pub entries: Option<Vec<String>>,

    /// The directory of the application.
    /// If no directory is provided, the current directory will be used.
    #[clap(short, long, value_parser)]
    pub dir: Option<PathBuf>,

    /// The root directory of the project. Nothing outside of this directory can
    /// be accessed. e. g. the monorepo root.
    /// If no directory is provided, `dir` will be used.
    #[clap(long, value_parser)]
    pub root: Option<PathBuf>,

    /// Filter by issue severity.
    #[clap(short, long)]
    pub log_level: Option<IssueSeverityCliOption>,

    /// Show all log messages without limit.
    #[clap(long)]
    pub show_all: bool,

    /// Expand the log details.
    #[clap(long)]
    pub log_detail: bool,

    /// Whether to enable full task stats recording in Turbo Engine.
    #[clap(long)]
    pub full_stats: bool,

    /// Whether to build for the `browser` or `node`
    #[clap(long)]
    pub target: Option<Target>,

    /// Number of worker threads to use for parallel processing
    #[clap(long)]
    pub worker_threads: Option<usize>,
    // Enable experimental garbage collection with the provided memory limit in
    // MB.
    // #[clap(long)]
    // pub memory_limit: Option<usize>,
}

#[derive(Debug, Args)]
#[clap(author, version, about, long_about = None)]
pub struct DevArguments {
    #[clap(flatten)]
    pub common: CommonArguments,

    /// The port number on which to start the application
    /// Note: setting env PORT allows to configure port without explicit cli
    /// args. However, this is temporary measure to conform with existing
    /// next.js devserver and can be removed in the future.
    #[clap(short, long, value_parser, default_value_t = 3000, env = "PORT")]
    pub port: u16,

    /// Hostname on which to start the application
    #[clap(short = 'H', long, value_parser, default_value = "0.0.0.0")]
    pub hostname: IpAddr,

    /// Compile all, instead of only compiling referenced assets when their
    /// parent asset is requested
    #[clap(long)]
    pub eager_compile: bool,

    /// Don't open the browser automatically when the dev server has started.
    #[clap(long)]
    pub no_open: bool,

    // ==
    // = Inherited options from next-dev, need revisit later.
    // ==
    /// If port is not explicitly specified, use different port if it's already
    /// in use.
    #[clap(long)]
    pub allow_retry: bool,
}

#[derive(Debug, Args)]
#[clap(author, version, about, long_about = None)]
pub struct BuildArguments {
    #[clap(flatten)]
    pub common: CommonArguments,

    /// Don't generate sourcemaps.
    #[clap(long)]
    pub no_sourcemap: bool,

    /// Don't minify build output.
    #[clap(long)]
    pub no_minify: bool,

    /// Don't perform scope hoisting.
    #[clap(long)]
    pub no_scope_hoist: bool,

    /// Drop the `TurboTasks` object upon exit. By default we intentionally leak this memory, as
    /// we're about to exit the process anyways, but that can cause issues with valgrind or other
    /// leak detectors.
    #[clap(long, hide = true)]
    pub force_memory_cleanup: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct IssueSeverityCliOption(pub IssueSeverity);

impl serde::Serialize for IssueSeverityCliOption {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0.to_string())
    }
}

impl<'de> serde::Deserialize<'de> for IssueSeverityCliOption {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        <IssueSeverityCliOption as std::str::FromStr>::from_str(&s)
            .map_err(serde::de::Error::custom)
    }
}

impl ValueEnum for IssueSeverityCliOption {
    fn value_variants<'a>() -> &'a [Self] {
        const VARIANTS: [IssueSeverityCliOption; 8] = [
            IssueSeverityCliOption(IssueSeverity::Bug),
            IssueSeverityCliOption(IssueSeverity::Fatal),
            IssueSeverityCliOption(IssueSeverity::Error),
            IssueSeverityCliOption(IssueSeverity::Warning),
            IssueSeverityCliOption(IssueSeverity::Hint),
            IssueSeverityCliOption(IssueSeverity::Note),
            IssueSeverityCliOption(IssueSeverity::Suggestion),
            IssueSeverityCliOption(IssueSeverity::Info),
        ];
        &VARIANTS
    }

    fn to_possible_value<'a>(&self) -> Option<clap::builder::PossibleValue> {
        Some(clap::builder::PossibleValue::new(self.0.as_str()).help(self.0.as_help_str()))
    }
}

impl FromStr for IssueSeverityCliOption {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        <IssueSeverityCliOption as clap::ValueEnum>::from_str(s, true).map_err(|s| anyhow!("{}", s))
    }
}
