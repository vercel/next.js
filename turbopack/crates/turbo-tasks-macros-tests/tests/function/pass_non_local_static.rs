#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(dead_code)]

use turbo_tasks::{ResolvedVc, Vc};

#[turbo_tasks::value(transparent, non_local)]
struct IntegersVec(Vec<ResolvedVc<u32>>);

#[turbo_tasks::function(non_local_return)]
fn return_contains_resolved_vc() -> Vc<IntegersVec> {
    Vc::cell(Vec::new())
}

#[turbo_tasks::function(non_local_return)]
fn return_contains_resolved_vc_result() -> anyhow::Result<Vc<IntegersVec>> {
    Ok(Vc::cell(Vec::new()))
}

fn main() {}
