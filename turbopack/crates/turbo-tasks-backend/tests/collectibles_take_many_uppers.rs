#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! A task that takes the collectibles of a child operation holds a negative own count for each of
//! them. Each upper connecting that task must still see only the collectibles that weren't taken,
//! also after the child changes.

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{CollectiblesSource, ResolvedVc, State, ValueToString, Vc, emit};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

const UPPERS: u32 = 8;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn taken_collectibles_stay_hidden_from_many_uppers() {
    run_once(&REGISTRATION, async || {
        let input = ChangingInput {
            state: State::new(20),
        }
        .resolved_cell();

        for count in [20, 5, 30] {
            input.await?.state.set(count);
            for upper in 0..UPPERS {
                let read = upper_operation(input, upper)
                    .read_strongly_consistent()
                    .await?;
                assert_eq!(read.taken, count, "upper {upper}");
                assert_eq!(read.visible, vec![format!("keep {count}")], "upper {upper}");
            }
        }
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value]
struct ChangingInput {
    state: State<u32>,
}

#[turbo_tasks::value]
struct Collectible {
    value: RcStr,
}

#[turbo_tasks::value_impl]
impl ValueToString for Collectible {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.value.clone())
    }
}

fn emit_string(value: String) {
    let collectible: ResolvedVc<Box<dyn ValueToString>> = ResolvedVc::upcast(
        Collectible {
            value: value.into(),
        }
        .resolved_cell(),
    );
    emit(collectible);
}

#[turbo_tasks::function]
async fn emit_one(index: u32, count: u32) -> Result<()> {
    emit_string(format!("child {index} of {count}"));
    Ok(())
}

/// Emits `count` collectibles from separate child tasks.
#[turbo_tasks::function(operation, root)]
async fn child_operation(input: ResolvedVc<ChangingInput>) -> Result<Vc<u32>> {
    let count = *input.await?.state.get();
    for index in 0..count {
        emit_one(index, count).await?;
    }
    Ok(Vc::cell(count))
}

#[turbo_tasks::function]
async fn emit_keep(count: u32) -> Result<()> {
    emit_string(format!("keep {count}"));
    Ok(())
}

/// Takes all collectibles of the child operation, and emits one collectible of its own.
#[turbo_tasks::function(operation, root)]
async fn taking_operation(input: ResolvedVc<ChangingInput>) -> Result<Vc<u32>> {
    let child = child_operation(input);
    let count = *child.connect().await?;
    let taken = child.take_collectibles::<Box<dyn ValueToString>>();
    emit_keep(count).await?;
    Ok(Vc::cell(taken.len() as u32))
}

#[turbo_tasks::value]
struct UpperRead {
    taken: u32,
    visible: Vec<String>,
}

/// One of several uppers that connect the same taking operation.
#[turbo_tasks::function(operation, root)]
async fn upper_operation(input: ResolvedVc<ChangingInput>, upper: u32) -> Result<Vc<UpperRead>> {
    let _ = upper;
    let taking = taking_operation(input);
    let taken = *taking.connect().await?;
    let mut visible = Vec::new();
    for collectible in taking.peek_collectibles::<Box<dyn ValueToString>>() {
        visible.push(collectible.to_string().await?.to_string());
    }
    visible.sort();
    Ok(UpperRead { taken, visible }.cell())
}
