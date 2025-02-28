use criterion::{criterion_group, criterion_main, BatchSize, BenchmarkId, Criterion};
use turbo_rcstr::RcStr;

// map has a fast-path if the Arc is uniquely owned
fn bench_map(c: &mut Criterion) {
    let long_string = "this is a long string that will take time to copy".repeat(1000);
    for cloned in [false, true] {
        c.bench_with_input(
            BenchmarkId::new("RcStr::map", if cloned { "cloned" } else { "unique" }),
            &cloned,
            |b, cloned| {
                b.iter_batched(
                    || {
                        let rc_str = RcStr::from(long_string.as_str());
                        let maybe_cloned = if *cloned { Some(rc_str.clone()) } else { None };
                        (rc_str, maybe_cloned)
                    },
                    |(mut rc_str, maybe_cloned)| {
                        rc_str = rc_str.map(|mut s| {
                            s.truncate(s.len() - 1);
                            s
                        });
                        // don't drop these ourselves, let criterion do that later
                        (rc_str, maybe_cloned)
                    },
                    BatchSize::LargeInput,
                );
            },
        );
    }
}

criterion_group!(
  name = benches;
  config = Criterion::default();
  targets = bench_map,
);
criterion_main!(benches);
