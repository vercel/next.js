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
    #[cfg_attr(
        feature = "cli",
        clap(short, long, value_parser, default_value_t = 3000)
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

    /// Don't open the browser automatically when the dev server has started.
    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub no_open: bool,

    #[cfg_attr(feature = "cli", clap(short, long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    /// Filter by issue severity.
    pub log_level: Option<IssueSeverityCliOption>,

    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    /// Show all log messages without limit.
    pub show_all: bool,

    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    /// Expand the log details.
    pub log_detail: bool,

    // Inherited options from next-dev, need revisit later.
    // These are not supported by CLI yet.
    #[cfg(feature = "serializable")]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub allow_retry: bool,
    #[cfg(feature = "serializable")]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub dev: bool,
    #[cfg(feature = "serializable")]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub is_next_dev_command: bool,
    #[cfg(feature = "serializable")]
    #[cfg_attr(feature = "serializable", serde(default))]
    pub server_components_external_packages: Vec<String>,
}

#[cfg(feature = "serializable")]
fn default_port() -> u16 {
    3000
}

#[cfg(feature = "serializable")]
fn default_host() -> IpAddr {
    IpAddr::V4(std::net::Ipv4Addr::new(0, 0, 0, 0))
}
