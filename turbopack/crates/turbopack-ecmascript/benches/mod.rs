extern crate turbo_tasks_malloc;

use criterion::{criterion_group, criterion_main};

mod analyzer;
mod references;

criterion_group!(analyzer_benches, analyzer::benchmark);
criterion_group!(full_benches, references::benchmark);
criterion_main!(analyzer_benches, full_benches);
