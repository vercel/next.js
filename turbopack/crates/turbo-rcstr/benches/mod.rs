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
/// Benchmark intern table hit: repeatedly create RcStr from the same string.
/// With interning this is a table lookup + Arc clone instead of a fresh allocation.
fn bench_intern_hit(c: &mut Criterion) {
    let mut g = c.benchmark_group("intern_hit");
    let long = "this is a long string that exercises the intern table lookup path";

    // Pre-populate the intern table
    let _keep = RcStr::from(long);

    g.bench_function("from/interned", |b| {
        b.iter(|| {
            let s = RcStr::from(long);
            std::hint::black_box(&s);
        });
    });
    g.finish();
}

/// Benchmark equality of interned strings (pointer identity fast path).
fn bench_eq_interned(c: &mut Criterion) {
    let mut g = c.benchmark_group("eq");
    let long = "benchmark equality: a long string for comparing interned values";
    let a = RcStr::from(long);
    let b = RcStr::from(long);

    g.bench_function("interned", |bench| {
        bench.iter(|| std::hint::black_box(&a) == std::hint::black_box(&b));
    });
    g.finish();
}

criterion_group!(
  name = benches;
  config = Criterion::default();
  targets = bench_map,bench_construct,bench_intern_hit,bench_eq_interned,
);
criterion_main!(benches);
