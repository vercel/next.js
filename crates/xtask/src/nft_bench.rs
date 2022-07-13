use std::fs;

use owo_colors::OwoColorize;
use serde::{Deserialize, Serialize};
use tabled::{builder::Builder, object::Cell, Format, Modify, Style, Tabled};

#[derive(Tabled, Serialize, Deserialize)]
struct BenchSuite {
    suite: String,
    #[tabled(rename = "Rust duration")]
    rust_duration: String,
    #[tabled(rename = "@vercel/nft duration")]
    node_duration: String,
    is_faster: bool,
}

pub fn show_result() {
    let bench_result_raw = fs::read_to_string("crates/turbopack/bench.json").unwrap();
    let mut table = Builder::new();
    table = table.set_columns(["Suite", "Rust duration", "@vercel/nft duration"]);
    let mut faster = Vec::new();
    let mut slower = Vec::new();
    for (i, suite) in bench_result_raw
        .lines()
        .flat_map(|line| {
            let suite: Vec<BenchSuite> = serde_json::from_str(line).unwrap();
            suite
        })
        .enumerate()
    {
        table = table.add_record([
            suite
                .suite
                .trim_start_matches("node-file-trace/integration/")
                .to_owned(),
            suite.rust_duration,
            suite.node_duration,
        ]);
        if suite.is_faster {
            faster.push(i);
        } else {
            slower.push(i);
        }
    }
    let mut table = table.build();
    for i in faster {
        table = table
            .with(Modify::new(Cell(i + 1, 1)).with(Format::new(|s| s.green().to_string())))
            .with(Modify::new(Cell(i + 1, 2)).with(Format::new(|s| s.red().to_string())));
    }
    for i in slower {
        table = table
            .with(Modify::new(Cell(i + 1, 1)).with(Format::new(|s| s.red().to_string())))
            .with(Modify::new(Cell(i + 1, 2)).with(Format::new(|s| s.green().to_string())));
    }
    println!("{}", table.with(Style::modern()).to_string());
}
