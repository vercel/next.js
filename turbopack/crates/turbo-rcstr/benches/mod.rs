use criterion::{BatchSize, BenchmarkId, Criterion, criterion_group, criterion_main};
use turbo_rcstr::{RcStr, rcstr};

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

/// Compare the performance of `from` and `rcstr!`
fn bench_construct(c: &mut Criterion) {
    let mut g = c.benchmark_group("Rcstr::construct");
    g.bench_with_input("rcstr!/small", "small", |f, _| {
        f.iter(|| rcstr!("hello"));
    });
    g.bench_with_input("rcstr!/large", "large", |f, _| {
        f.iter(|| rcstr!("this is a long string that will take time to copy"));
    });

    g.bench_with_input("from/small", "small", |f, _| {
        f.iter(|| RcStr::from("hello"));
    });
    g.bench_with_input("from/large", "large", |f, _| {
        f.iter(|| RcStr::from("this is a long string that will take time to copy"));
    });
}
criterion_group!(
  name = benches;
  config = Criterion::default();
  targets = bench_map,bench_construct,
);
criterion_main!(benches);
