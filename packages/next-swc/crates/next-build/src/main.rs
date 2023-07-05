use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;
use next_build::BuildOptions;
use turbopack_binding::turbopack::cli_utils::issue::IssueSeverityCliOption;

#[global_allocator]
static ALLOC: turbopack_binding::turbo::malloc::TurboMalloc =
    turbopack_binding::turbo::malloc::TurboMalloc;

#[derive(Debug, Parser)]
#[clap(author, version, about, long_about = None)]
pub struct BuildCliArgs {
    /// The directory of the Next.js application.
    /// If no directory is provided, the current directory will be used.
    #[clap(value_parser)]
    pub dir: Option<PathBuf>,

    /// The root directory of the project. Nothing outside of this directory can
    /// be accessed. e. g. the monorepo root.
    /// If no directory is provided, `dir` will be used.
    #[clap(long, value_parser)]
    pub root: Option<PathBuf>,

    /// Display version of the binary. Noop if used in library mode.
    #[clap(long)]
    pub display_version: bool,

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

    /// Enable experimental garbage collection with the provided memory limit in
    /// MB.
    #[clap(long)]
    pub memory_limit: Option<usize>,
}

fn main() {
    use turbopack_binding::turbo::malloc::TurboMalloc;

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .on_thread_stop(|| {
            TurboMalloc::thread_stop();
        })
        .build()
        .unwrap()
        .block_on(main_inner())
        .unwrap()
}

async fn main_inner() -> Result<()> {
    let args = BuildCliArgs::parse();

    if args.display_version {
        // Note: enabling git causes trouble with aarch64 linux builds with libz-sys
        println!(
            "Build Timestamp\t\t{:#?}",
            option_env!("VERGEN_BUILD_TIMESTAMP").unwrap_or_else(|| "N/A")
        );
        println!(
            "Build Version\t\t{:#?}",
            option_env!("VERGEN_BUILD_SEMVER").unwrap_or_else(|| "N/A")
        );
        println!(
            "Cargo Target Triple\t{:#?}",
            option_env!("VERGEN_CARGO_TARGET_TRIPLE").unwrap_or_else(|| "N/A")
        );
        println!(
            "Cargo Profile\t\t{:#?}",
            option_env!("VERGEN_CARGO_PROFILE").unwrap_or_else(|| "N/A")
        );

        return Ok(());
    }

    next_build::build(BuildOptions {
        dir: args.dir,
        root: args.root,
        memory_limit: args.memory_limit,
        log_level: args.log_level.map(|l| l.0),
        show_all: args.show_all,
        log_detail: args.log_detail,
        full_stats: args.full_stats,
        build_context: None,
    })
    .await
}
