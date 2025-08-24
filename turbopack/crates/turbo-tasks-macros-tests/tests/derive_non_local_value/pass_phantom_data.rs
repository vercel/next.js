#![allow(dead_code)]

use std::marker::PhantomData;

use turbo_tasks::{NonLocalValue, Vc};

struct Unresolved;

#[derive(NonLocalValue)]
struct PhantomDataCanContainAnything<T: Send>(
    PhantomData<Vc<T>>,
    PhantomData<Unresolved>,
    PhantomData<Vc<Unresolved>>,
);

fn main() {}
