#![allow(dead_code)]

use std::marker::PhantomData;

use turbo_tasks::{ResolvedValue, Vc};

struct Unresolved;

#[derive(ResolvedValue)]
struct PhantomDataCanContainAnything<T: Send>(
    PhantomData<Vc<T>>,
    PhantomData<Unresolved>,
    PhantomData<Vc<Unresolved>>,
);

fn main() {}
