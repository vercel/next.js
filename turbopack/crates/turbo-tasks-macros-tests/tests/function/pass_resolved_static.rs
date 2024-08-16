#![feature(arbitrary_self_types)]
#![allow(dead_code)]

use turbo_tasks::{ResolvedVc, Vc};

#[turbo_tasks::value(transparent, resolved)]
struct IntegersVec(Vec<ResolvedVc<u32>>);

#[turbo_tasks::function(resolved)]
fn return_contains_resolved_vc() -> Vc<IntegersVec> {
    Vc::cell(Vec::new())
}

#[turbo_tasks::function(resolved)]
fn return_contains_resolved_vc_result() -> anyhow::Result<Vc<IntegersVec>> {
    Ok(Vc::cell(Vec::new()))
}

fn main() {}
