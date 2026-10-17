#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(unexpected_cfgs)]

// Connected Vc payloads do not satisfy OperationValue, even when Clone.
#[turbo_tasks::value(cell = "mutable")]
#[derive(Clone)]
struct ConnectedPayload { value: turbo_tasks::ResolvedVc<u32> }

fn main() {}
