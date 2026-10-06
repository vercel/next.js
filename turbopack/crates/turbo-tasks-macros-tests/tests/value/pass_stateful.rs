#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(unexpected_cfgs, dead_code)]

use turbo_tasks::{NonLocalValue, OperationValue, ReadRef, StateCell};

#[turbo_tasks::value(cell = "stateful", operation)]
#[derive(Clone)]
struct Stateful { value: u32 }

#[turbo_tasks::value(operation)]
struct Holder { state: StateCell<Stateful> }

fn assert_handle<T: Copy + Clone + Eq + std::hash::Hash + NonLocalValue + OperationValue>() {}
fn check_api(value: Stateful) -> anyhow::Result<()> {
    let state = value.stateful_cell();
    let _: ReadRef<Stateful> = state.get()?;
    let _: ReadRef<Stateful> = state.get_untracked()?;
    state.set(Stateful { value: 1 })?;
    state.update(|value| value.value += 1)?;
    Ok(())
}
fn main() { assert_handle::<StateCell<Stateful>>(); }
