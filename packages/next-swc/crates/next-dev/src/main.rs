#![feature(future_join)]
#![feature(min_specialization)]

use std::{
    env::current_dir,
    future::join,
    net::IpAddr,
    path::PathBuf,
    time::{Duration, Instant},
};

use anyhow::Context;
use clap::Parser;
use next_dev::{register, NextDevServerBuilder};
use turbo_tasks::{util::FormatDuration, TurboTasks};
use turbo_tasks_memory::MemoryBackend;
use turbopack_cli_utils::issue::IssueSeverityCliOption;
use turbopack_core::issue::IssueSeverity;

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
struct Cli {
    /// The directory of the Next.js application.
    /// If no directory is provided, the current directory will be used.
    #[clap(value_parser)]
    dir: Option<PathBuf>,

    /// The port number on which to start the application
    #[clap(short, long, value_parser, default_value_t = 3000)]
    port: u16,

    /// Hostname on which to start the application
    #[clap(short = 'H', long, value_parser, default_value = "127.0.0.1")]
    hostname: IpAddr,

    /// Compile all, instead of only compiling referenced assets when their
    /// parent asset is requested
    #[clap(long)]
    eager_compile: bool,

    /// Don't open the browser automatically when the dev server has started.
    #[clap(long)]
    no_open: bool,

    #[clap(short, long)]
    /// Filter by issue severity.
    log_level: Option<IssueSeverityCliOption>,

    #[clap(long)]
    /// Show all log messages without limit.
    show_all: bool,

    #[clap(long)]
    /// Expand the log details.
    log_detail: bool,
}

#[tokio::main]
async fn main() {
    let start = Instant::now();

    #[cfg(feature = "tokio_console")]
    console_subscriber::init();
    register();

    let args = Cli::parse();

    let dir = args
        .dir
        .map(|dir| dir.canonicalize())
        .unwrap_or_else(current_dir)
        .unwrap()
        .to_str()
        .context("current directory contains invalid characters")
        .unwrap()
        .to_string();

    let tt = TurboTasks::new(MemoryBackend::new());
    let tt_clone = tt.clone();

    let server = NextDevServerBuilder::new()
        .turbo_tasks(tt)
        .project_dir(dir)
        .entry_asset("src/index.js".into())
        .eager_compile(args.eager_compile)
        .hostname(args.hostname)
        .port(args.port)
        .log_detail(args.log_detail)
        .show_all(args.show_all)
        .log_level(args.log_level.map_or_else(|| IssueSeverity::Error, |l| l.0))
        .build()
        .await
        .unwrap();

    {
        let index_uri = if server.addr.ip().is_loopback() {
            format!("http://localhost:{}", server.addr.port())
        } else {
            format!("http://{}", server.addr)
        };
        println!("server listening on: {uri}", uri = index_uri);
        if !args.no_open {
            let _ = webbrowser::open(&index_uri);
        }
    }

    join! {
        async move {
            let (elapsed, count) = tt_clone.get_or_wait_update_info(Duration::ZERO).await;
            println!("initial compilation {} ({} task execution, {} tasks)",
            FormatDuration(start.elapsed()), FormatDuration(elapsed), count);

            loop {
                let (elapsed, count) = tt_clone.get_or_wait_update_info(Duration::from_millis(100)).await;
                println!("updated in {} ({} tasks)", FormatDuration(elapsed), count);
            }
        },
        async {
            server.future.await.unwrap()
        }
    }
    .await;
}
