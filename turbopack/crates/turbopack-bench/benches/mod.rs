use criterion::{Criterion, criterion_group, criterion_main};
use turbopack_bench::bundlers::Bundler;

fn get_bundlers() -> Vec<Box<dyn Bundler>> {
    turbopack_bench::bundlers::get_bundlers()
}

fn bench_startup(c: &mut Criterion) {
    turbopack_bench::bench_startup(c, &get_bundlers())
}

fn bench_hydration(c: &mut Criterion) {
    turbopack_bench::bench_hydration(c, &get_bundlers())
}

fn bench_startup_cached(c: &mut Criterion) {
    turbopack_bench::bench_startup_cached(c, &get_bundlers())
}

fn bench_hydration_cached(c: &mut Criterion) {
    turbopack_bench::bench_hydration_cached(c, &get_bundlers())
}

fn bench_hmr_to_eval(c: &mut Criterion) {
    turbopack_bench::bench_hmr_to_eval(c, &get_bundlers())
}

fn bench_hmr_to_commit(c: &mut Criterion) {
    turbopack_bench::bench_hmr_to_commit(c, &get_bundlers())
}

criterion_group!(
  name = benches;
  config = Criterion::default();
  targets = bench_startup, bench_hydration, bench_startup_cached, bench_hydration_cached, bench_hmr_to_eval, bench_hmr_to_commit
);
criterion_main!(benches);
