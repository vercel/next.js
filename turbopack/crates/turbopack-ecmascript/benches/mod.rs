use criterion::{criterion_group, criterion_main};

mod analyzer;

criterion_group!(analyzer_benches, analyzer::benchmark);
criterion_main!(analyzer_benches);
