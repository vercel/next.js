#![allow(dead_code)]

use std::marker::PhantomData;

use turbo_tasks::{ResolvedValue, ResolvedVc, Vc};

struct Unresolved;

#[derive(ResolvedValue)]
struct PhantomDataCanContainAnything<T: Send>(
    PhantomData<ResolvedVc<T>>,
    PhantomData<Unresolved>,
    PhantomData<ResolvedVc<Unresolved>>,
);

fn main() {}
