use criterion::{criterion_group, criterion_main};

mod analyzer;
mod node_file_trace;

criterion_group!(analyzer_benches, analyzer::benchmark);
criterion_group!(node_file_trace_benches, node_file_trace::benchmark);
criterion_main!(analyzer_benches, node_file_trace_benches);
