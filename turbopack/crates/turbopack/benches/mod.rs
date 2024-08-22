use codspeed_criterion_compat::{criterion_group, criterion_main};

mod node_file_trace;

criterion_group!(node_file_trace_benches, node_file_trace::benchmark);
criterion_main!(node_file_trace_benches);
