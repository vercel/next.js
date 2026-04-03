#![cfg_attr(windows, feature(junction_point))]

mod fs_watcher;
mod symlink_stress;

use clap::{Parser, Subcommand};

/// A collection of fuzzers for `turbo-tasks`. These are not test cases as they're slow and (in many
/// cases) non-deterministic.
///
/// It's recommend you build this with `--release`.
///
/// This is its own crate to avoid littering other crates with binary-only dependencies
/// <https://github.com/rust-lang/cargo/issues/1982>.
#[derive(Parser)]
#[command()]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Continuously fuzzes the filesystem watcher until ctrl+c'd.
    FsWatcher(fs_watcher::FsWatcher),
    /// Stress tests symlink/junction writes in a tight loop.
    SymlinkStress(symlink_stress::SymlinkStress),
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::FsWatcher(args) => fs_watcher::run(args).await,
        Commands::SymlinkStress(args) => symlink_stress::run(args).await,
    }
}
