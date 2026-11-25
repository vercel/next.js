use std::{io::Write, path::PathBuf};

use anyhow::Result;
use clap::Parser;
use turbopack_trace_size::TraceSizeAnalyzer;

/// Shows which events take up the space in a Turbopack trace file (e.g.
/// `.next-profiles/trace-turbopack.bin`). Raw, gzip and zstd compressed files
/// are supported.
#[derive(Parser)]
#[command(version)]
struct Args {
    /// Path to the trace file.
    path: PathBuf,

    /// How many entries to show in the per span name and per field key tables.
    #[arg(short = 'n', long, default_value_t = 30)]
    top: usize,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let analyzer = TraceSizeAnalyzer::analyze_file(&args.path)?;
    let mut out = std::io::stdout().lock();
    analyzer.write_report(&mut out, args.top)?;
    out.flush()?;
    Ok(())
}
