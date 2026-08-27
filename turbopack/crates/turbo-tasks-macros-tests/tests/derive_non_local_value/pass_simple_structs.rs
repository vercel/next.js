#![allow(dead_code)]

use std::marker::PhantomData;

use turbo_tasks::NonLocalValue;


struct UnitStruct;


struct ContainsSimpleValuesNamed {
    a: i32,
    b: String,
    c: (),
    d: (u8, u8, (u8, u8, u8)),
    e: [u8; 8],
    f: PhantomData<u8>,
}


struct ContainsSimpleValuesUnnamed(i32, String, ());

fn main() {}
