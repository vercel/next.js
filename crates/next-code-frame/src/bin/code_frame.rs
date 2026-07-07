use std::{fs, process::ExitCode};

use clap::Parser;
use next_code_frame::{CodeFrameLocation, CodeFrameOptions, Location, render_code_frame};

/// Render a code frame for the given file and position.
///
/// Lines and columns are 1-indexed.
#[derive(Parser)]
#[command(name = "code_frame")]
struct Args {
    /// Source file to render
    file: String,
    /// Start position (line:column, 1-indexed)
    start: String,
    /// End position (line:column, 1-indexed)
    end: Option<String>,
    /// Message to display with the error
    #[arg(short, long)]
    message: Option<String>,
    /// Maximum output width in columns
    #[arg(short = 'w', long, default_value_t = 100)]
    max_width: usize,
}

fn parse_position(s: &str) -> Option<Location> {
    let (line, col) = s.split_once(':')?;
    Some(Location {
        line: line.parse().ok()?,
        column: Some(col.parse().ok()?),
    })
}

fn main() -> ExitCode {
    let args = Args::parse();

    let source = match fs::read_to_string(&args.file) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Error reading {}: {e}", args.file);
            return ExitCode::FAILURE;
        }
    };

    let start = match parse_position(&args.start) {
        Some(loc) => loc,
        None => {
            eprintln!("Invalid start position: {}", args.start);
            return ExitCode::FAILURE;
        }
    };

    let end = match args.end.as_deref().map(parse_position) {
        Some(Some(loc)) => Some(loc),
        Some(None) => {
            eprintln!("Invalid end position: {}", args.end.unwrap());
            return ExitCode::FAILURE;
        }
        None => None,
    };

    let location = CodeFrameLocation { start, end };
    let options = CodeFrameOptions {
        message: args.message,
        max_width: args.max_width,
        ..Default::default()
    };

    match render_code_frame(&source, &location, &options) {
        Ok(Some(frame)) => {
            println!("{frame}");
            ExitCode::SUCCESS
        }
        Ok(None) => {
            // Location is out of range (e.g., empty file or line past EOF)
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("Error rendering code frame: {e}");
            ExitCode::FAILURE
        }
    }
}
