use criterion::{criterion_group, criterion_main};

mod analyzer;

criterion_group!(benches, analyzer::benchmark);
criterion_main!(benches);
