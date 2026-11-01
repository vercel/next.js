#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Taking the collectibles of an operation unemits all of them at once. This covers that every
//! taken collectible is hidden from the uppers of the taking task, including collectibles that
//! are emitted multiple times, also when the set of taken collectibles changes. It also covers
//! dropping collectibles, taking from a source without collectibles, and taking from a source
//! whose own collectibles were already taken (so its aggregated counts aren't all positive).

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{CollectiblesSource, ResolvedVc, State, ValueToString, Vc, emit};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

const UPPERS: u32 = 4;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn taken_collectibles_are_unemitted_together() {
    run_once(&REGISTRATION, async || {
        let input = ChangingInput {
            state: State::new(20),
        }
        .resolved_cell();

        for count in [20, 5, 30, 0, 10] {
            input.await?.state.set(count);
            for drop in [false, true] {
                for upper in 0..UPPERS {
                    let read = upper_operation(input, drop, upper)
                        .read_strongly_consistent()
                        .await?;
                    // `count` distinct collectibles plus the shared one. Dropping doesn't report
                    // what was removed.
                    let expected_taken = if drop { 0 } else { count + 1 };
                    assert_eq!(
                        read.taken, expected_taken,
                        "drop {drop}, upper {upper}, count {count}"
                    );
                    assert_eq!(
                        read.visible,
                        vec![format!("keep {count}")],
                        "drop {drop}, upper {upper}, count {count}"
                    );
                }
            }
            let outer = outer_taking_operation(input)
                .read_strongly_consistent()
                .await?;
            assert_eq!(*outer, vec![format!("keep {count}")], "count {count}");
        }
        assert_eq!(
            *empty_taking_operation().read_strongly_consistent().await?,
            0
        );
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

fn collectible(value: String) -> ResolvedVc<Box<dyn ValueToString>> {
    ResolvedVc::upcast(
        Collectible {
            value: value.into(),
        }
        .resolved_cell(),
    )
}

#[turbo_tasks::function]
fn shared_collectible() -> Vc<Box<dyn ValueToString>> {
    *collectible("shared".to_string())
}

/// Emits the shared collectible twice and `count` distinct ones.
#[turbo_tasks::function]
async fn emit_many(count: u32) -> Result<()> {
    let shared = shared_collectible().to_resolved().await?;
    emit(shared);
    emit(shared);
    for index in 0..count {
        emit(collectible(format!("item {index} of {count}")));
    }
    Ok(())
}

/// Emits the shared collectible once more from another task.
#[turbo_tasks::function]
async fn emit_shared_again() -> Result<()> {
    emit(shared_collectible().to_resolved().await?);
    Ok(())
}

#[turbo_tasks::function(operation, root)]
async fn child_operation(input: ResolvedVc<ChangingInput>) -> Result<Vc<u32>> {
    let count = *input.await?.state.get();
    emit_many(count).await?;
    emit_shared_again().await?;
    Ok(Vc::cell(count))
}

#[turbo_tasks::function]
async fn emit_keep(count: u32) -> Result<()> {
    emit(collectible(format!("keep {count}")));
    Ok(())
}

/// Takes (or drops) all collectibles of the child operation, and emits one collectible of its own.
#[turbo_tasks::function(operation, root)]
async fn taking_operation(input: ResolvedVc<ChangingInput>, drop: bool) -> Result<Vc<u32>> {
    let child = child_operation(input);
    let count = *child.connect().await?;
    let taken = if drop {
        child.drop_collectibles::<Box<dyn ValueToString>>();
        0
    } else {
        child.take_collectibles::<Box<dyn ValueToString>>().len() as u32
    };
    emit_keep(count).await?;
    Ok(Vc::cell(taken))
}

#[turbo_tasks::value(transparent)]
struct Strings(Vec<String>);

/// Takes the collectibles of [`taking_operation`], which has already taken the collectibles of
/// its child.
#[turbo_tasks::function(operation, root)]
async fn outer_taking_operation(input: ResolvedVc<ChangingInput>) -> Result<Vc<Strings>> {
    let taking = taking_operation(input, false);
    taking.connect().await?;
    let mut taken = Vec::new();
    for collectible in taking.take_collectibles::<Box<dyn ValueToString>>() {
        taken.push(collectible.to_string().await?.to_string());
    }
    taken.sort();
    Ok(Vc::cell(taken))
}

#[turbo_tasks::function(operation, root)]
fn empty_operation() -> Vc<()> {
    Vc::cell(())
}

#[turbo_tasks::function(operation, root)]
async fn empty_taking_operation() -> Result<Vc<u32>> {
    let empty = empty_operation();
    empty.connect().await?;
    Ok(Vc::cell(
        empty.take_collectibles::<Box<dyn ValueToString>>().len() as u32,
    ))
}

#[turbo_tasks::value]
struct UpperRead {
    taken: u32,
    visible: Vec<String>,
}

/// One of several uppers that connect the same taking operation.
#[turbo_tasks::function(operation, root)]
async fn upper_operation(
    input: ResolvedVc<ChangingInput>,
    drop: bool,
    upper: u32,
) -> Result<Vc<UpperRead>> {
    let _ = upper;
    let taking = taking_operation(input, drop);
    let taken = *taking.connect().await?;
    let mut visible = Vec::new();
    for collectible in taking.peek_collectibles::<Box<dyn ValueToString>>() {
        visible.push(collectible.to_string().await?.to_string());
    }
    visible.sort();
    Ok(UpperRead { taken, visible }.cell())
}
