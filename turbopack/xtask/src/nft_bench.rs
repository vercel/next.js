use std::{borrow::Cow, fs};

use owo_colors::OwoColorize;
use serde::{Deserialize, Serialize};
use tabled::{Style, Table, Tabled};

#[derive(Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
struct BenchSuite {
    suite: String,
    node_duration: String,
    rust_duration: String,
    rust_speedup: String,
    is_faster: bool,
}

impl Tabled for BenchSuite {
    const LENGTH: usize = 4;

    fn fields(&self) -> Vec<Cow<'_, str>> {
        fn g(s: &str) -> Cow<'_, str> {
            Cow::Owned(s.green().to_string())
        }
        fn r(s: &str) -> Cow<'_, str> {
            Cow::Owned(s.red().to_string())
        }
        if self.is_faster {
            [
                g(&self.suite),
                r(&self.node_duration),
                g(&self.rust_duration),
                g(&self.rust_speedup),
            ]
        } else {
            [
                r(&self.suite),
                g(&self.node_duration),
                r(&self.rust_duration),
                r(&self.rust_speedup),
            ]
        }
        .into_iter()
        .collect()
    }

    fn headers() -> Vec<Cow<'static, str>> {
        ["Suite", "@vercel/nft duration", "Rust duration", "Speedup"]
            .map(Cow::Borrowed)
            .into_iter()
            .collect()
    }
}

pub fn show_result() {
    let bench_result_raw = fs::read_to_string("crates/turbopack/bench.json").unwrap();
    let mut results = bench_result_raw
        .lines()
        .flat_map(|line| {
            let suite: Vec<BenchSuite> = serde_json::from_str(line).unwrap();
            suite
        })
        .collect::<Vec<_>>();
    results.sort();
    println!("{}", Table::new(results).with(Style::modern()));
}
