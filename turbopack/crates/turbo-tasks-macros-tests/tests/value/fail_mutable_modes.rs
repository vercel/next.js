#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(unexpected_cfgs)]

#[turbo_tasks::value(cell = "mutable", serialization = "skip")]
struct Skipped { value: u32 }

#[turbo_tasks::value(cell = "mutable", serialization = "hash")]
struct Hashed { value: u32 }

#[turbo_tasks::value(cell = "mutable", transparent)]
struct Transparent(u32);

fn main() {}
