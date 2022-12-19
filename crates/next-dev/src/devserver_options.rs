use std::{net::IpAddr, path::PathBuf};

#[cfg(feature = "cli")]
use clap::Parser;
use turbopack_cli_utils::issue::IssueSeverityCliOption;

#[derive(Debug)]
#[cfg_attr(feature = "cli", derive(Parser))]
#[cfg_attr(feature = "cli", clap(author, version, about, long_about = None))]
#[cfg_attr(feature = "serializable", derive(serde::Deserialize))]
#[cfg_attr(feature = "serializable", serde(rename_all = "camelCase"))]
pub struct DevServerOptions {
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

    /// The port number on which to start the application
    /// Note: setting env PORT allows to configure port without explicit cli
    /// args. However, this is temporary measure to conform with existing
    /// next.js devserver and can be removed in the future.
    #[cfg_attr(
        feature = "cli",
        clap(short, long, value_parser, default_value_t = 3000, env = "PORT")
    )]
    #[cfg_attr(feature = "serializable", serde(default = "default_port"))]
    pub port: u16,

    /// Hostname on which to start the application
    #[cfg_attr(
        feature = "cli",
        clap(short = 'H', long, value_parser, default_value = "0.0.0.0")
    )]
    #[cfg_attr(feature = "serializable", serde(default = "default_host"))]
    pub hostname: IpAddr,

    /// Compile all, instead of only compiling referenced assets when their
    /// parent asset is requested
    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub eager_compile: bool,

    /// Display version of the binary. Noop if used in library mode.
    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub display_version: bool,

    /// Don't open the browser automatically when the dev server has started.
    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub no_open: bool,

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

    // ==
    // = Inherited options from next-dev, need revisit later.
    // ==
    /// If port is not explicitly specified, use different port if it's already
    /// in use.
    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub allow_retry: bool,

    /// Internal for next.js, no specific usage yet.
    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub dev: bool,

    /// Internal for next.js, no specific usage yet.
    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub is_next_dev_command: bool,
}

#[cfg(feature = "serializable")]
fn default_port() -> u16 {
    std::env::var("PORT")
        .ok()
        .and_then(|port| port.parse().ok())
        .unwrap_or(3000)
}

#[cfg(feature = "serializable")]
fn default_host() -> IpAddr {
    IpAddr::V4(std::net::Ipv4Addr::new(0, 0, 0, 0))
}
