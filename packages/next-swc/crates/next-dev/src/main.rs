#![feature(future_join)]
#![feature(min_specialization)]

use std::{
    env::current_dir,
    future::join,
    net::IpAddr,
    path::PathBuf,
    time::{Duration, Instant},
};

use anyhow::{Context, Result};
use clap::Parser;
use next_dev::{register, NextDevServerBuilder};
use owo_colors::OwoColorize;
use turbo_tasks::{util::FormatDuration, TurboTasks};
use turbo_tasks_memory::MemoryBackend;
use turbopack_cli_utils::issue::IssueSeverityCliOption;
use turbopack_core::issue::IssueSeverity;

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
    dir: Option<PathBuf>,

    /// The root directory of the project. Nothing outside of this directory can
    /// be accessed. e. g. the monorepo root.
    /// If no directory is provided, `dir` will be used.
    #[cfg_attr(feature = "cli", clap(long, value_parser))]
    #[cfg_attr(feature = "serializable", serde(default))]
    root: Option<PathBuf>,

    /// The port number on which to start the application
    #[cfg_attr(
        feature = "cli",
        clap(short, long, value_parser, default_value_t = 3000)
    )]
    #[cfg_attr(feature = "serializable", serde(default = "default_port"))]
    port: u16,

    /// Hostname on which to start the application
    #[cfg_attr(
        feature = "cli",
        clap(short = 'H', long, value_parser, default_value = "0.0.0.0")
    )]
    #[cfg_attr(feature = "serializable", serde(default = "default_host"))]
    hostname: IpAddr,

    /// Compile all, instead of only compiling referenced assets when their
    /// parent asset is requested
    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    eager_compile: bool,

    /// Don't open the browser automatically when the dev server has started.
    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    no_open: bool,

    #[cfg_attr(feature = "cli", clap(short, long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    /// Filter by issue severity.
    log_level: Option<IssueSeverityCliOption>,

    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    /// Show all log messages without limit.
    show_all: bool,

    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    /// Expand the log details.
    log_detail: bool,

    // Inherited options from next-dev, need revisit later.
    // This is not supported by CLI yet.
    #[cfg_attr(feature = "serializable", serde(default))]
    allow_retry: bool,
    #[cfg_attr(feature = "serializable", serde(default))]
    dev: bool,
    #[cfg_attr(feature = "serializable", serde(default))]
    is_next_dev_command: bool,
    #[cfg_attr(feature = "serializable", serde(default))]
    server_components_external_packages: Vec<String>,
}

#[cfg(feature = "serializable")]
fn default_port() -> u16 {
    3000
}

#[cfg(feature = "serializable")]
fn default_host() -> IpAddr {
    IpAddr::V4(std::net::Ipv4Addr::new(0, 0, 0, 0))
}

#[cfg(not(feature = "cli"))]
fn main() -> Result<()> {
    unimplemented!("Cannot run binary without CLI feature enabled");
}

#[tokio::main]
#[cfg(feature = "cli")]
async fn main() -> Result<()> {
    let start = Instant::now();

    #[cfg(feature = "tokio_console")]
    console_subscriber::init();
    register();

    let args = DevServerOptions::parse();

    let dir = args
        .dir
        .map(|dir| dir.canonicalize())
        .unwrap_or_else(current_dir)
        .context("project directory can't be found")?
        .to_str()
        .context("project directory contains invalid characters")?
        .to_string();

    let root_dir = if let Some(root) = args.root {
        root.canonicalize()
            .context("root directory can't be found")?
            .to_str()
            .context("root directory contains invalid characters")?
            .to_string()
    } else {
        dir.clone()
    };

    let tt = TurboTasks::new(MemoryBackend::new());
    let tt_clone = tt.clone();

    let server = NextDevServerBuilder::new(tt, dir, root_dir)
        .entry_request("src/index".into())
        .eager_compile(args.eager_compile)
        .hostname(args.hostname)
        .port(args.port)
        .log_detail(args.log_detail)
        .show_all(args.show_all)
        .log_level(
            args.log_level
                .map_or_else(|| IssueSeverity::Warning, |l| l.0),
        )
        .build()
        .await?;

    {
        let index_uri = if server.addr.ip().is_loopback() || server.addr.ip().is_unspecified() {
            format!("http://localhost:{}", server.addr.port())
        } else {
            format!("http://{}", server.addr)
        };
        println!(
            "{} - started server on {}:{}, url: {}",
            "ready".green(),
            server.addr.ip(),
            server.addr.port(),
            index_uri
        );
        if !args.no_open {
            let _ = webbrowser::open(&index_uri);
        }
    }

    let stats_future = async move {
        println!(
            "{event_type} - initial compilation {start}",
            event_type = "event".purple(),
            start = FormatDuration(start.elapsed()),
        );

        loop {
            let (elapsed, _count) = tt_clone
                .get_or_wait_update_info(Duration::from_millis(100))
                .await;
            println!(
                "{event_type} - updated in {elapsed}",
                event_type = "event".purple(),
                elapsed = FormatDuration(elapsed),
            );
        }
    };

    join!(stats_future, async { server.future.await.unwrap() }).await;

    Ok(())
}
