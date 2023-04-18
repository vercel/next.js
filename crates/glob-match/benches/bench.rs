use criterion::{criterion_group, criterion_main, Criterion};
use glob_match::*;

const PATH: &'static str = "some/a/bigger/path/to/the/crazy/needle.txt";
const GLOB: &'static str = "some/**/needle.txt";

#[inline]
fn glob(pat: &str, s: &str) -> bool {
  let pat = glob::Pattern::new(pat).unwrap();
  pat.matches(s)
}

#[inline]
fn globset(pat: &str, s: &str) -> bool {
  let pat = globset::Glob::new(pat).unwrap().compile_matcher();
  pat.is_match(s)
}

fn glob_match_crate(b: &mut Criterion) {
  b.bench_function("mine", |b| b.iter(|| assert!(glob_match(GLOB, PATH))));
}

fn glob_crate(b: &mut Criterion) {
  b.bench_function("glob_crate", |b| b.iter(|| assert!(glob(GLOB, PATH))));
}

fn globset_crate(b: &mut Criterion) {
  b.bench_function("globset_crate", |b| b.iter(|| assert!(globset(GLOB, PATH))));
}

criterion_group!(benches, globset_crate, glob_crate, glob_match_crate);
criterion_main!(benches);
