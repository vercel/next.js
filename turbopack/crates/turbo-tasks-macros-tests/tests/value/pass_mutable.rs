#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(unexpected_cfgs, dead_code)]

use turbo_tasks::{NonLocalValue, OperationValue, ReadRef, MutableCell};

#[turbo_tasks::value(cell = "mutable", operation)]
#[derive(Clone)]
struct MutableValue { value: u32 }

#[turbo_tasks::value(operation)]
struct Holder { state: MutableCell<MutableValue> }

fn assert_handle<T: Copy + Clone + Eq + std::hash::Hash + NonLocalValue + OperationValue>() {}
fn check_api(value: MutableValue) -> anyhow::Result<()> {
    let state = value.mutable_cell();
    let _: ReadRef<MutableValue> = state.get()?;
    let _: ReadRef<MutableValue> = state.get_untracked()?;
    state.set(MutableValue { value: 1 })?;
    state.update(|value| value.value += 1)?;
    Ok(())
}
fn main() { assert_handle::<MutableCell<MutableValue>>(); }
