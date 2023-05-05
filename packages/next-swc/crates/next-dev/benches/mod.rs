use criterion::{criterion_group, criterion_main, Criterion};
use turbo_binding::turbopack::{
    bench as turbopack_bench,
    bench::bundlers::{Bundler, RenderType},
};

use crate::bundler::TurboNext;

mod bundler;

fn get_bundlers() -> Vec<Box<dyn Bundler>> {
    vec![
        Box::new(TurboNext::new(
            "TurboNextDev SSR",
            "/page",
            RenderType::ServerSidePrerendered,
        )),
        Box::new(TurboNext::new(
            "TurboNextDev RSC",
            "/app",
            RenderType::ServerSideRenderedWithEvents,
        )),
        Box::new(TurboNext::new(
            "TurboNextDev RCC",
            "/client",
            RenderType::ServerSideRenderedWithEvents,
        )),
    ]
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
