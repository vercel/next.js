#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::time::Duration;

use anyhow::Result;
use auto_hash_map::AutoSet;
use rustc_hash::FxHashSet;
use tokio::time::sleep;
use turbo_rcstr::RcStr;
use turbo_tasks::{emit, CollectiblesSource, ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn transitive_emitting() {
    run(&REGISTRATION, || async {
        let result_op = my_transitive_emitting_function("".into(), "".into());
        let result_val = result_op.connect().strongly_consistent().await?;
        let list = result_op.peek_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        let mut expected = ["123", "42"].into_iter().collect::<FxHashSet<_>>();
        for collectible in list {
            assert!(expected.remove(collectible.to_string().await?.as_str()))
        }
        assert_eq!(result_val.0, 0);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn transitive_emitting_indirect() {
    run(&REGISTRATION, || async {
        let result_op = my_transitive_emitting_function("".into(), "".into());
        let collectibles_op = my_transitive_emitting_function_collectibles("".into(), "".into());
        let list = collectibles_op.connect().strongly_consistent().await?;
        assert_eq!(list.len(), 2);
        let mut expected = ["123", "42"].into_iter().collect::<FxHashSet<_>>();
        for collectible in list.iter() {
            assert!(expected.remove(collectible.to_string().await?.as_str()))
        }
        assert_eq!(result_op.connect().await?.0, 0);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn multi_emitting() {
    run(&REGISTRATION, || async {
        let result_op = my_multi_emitting_function();
        let result_val = result_op.connect().strongly_consistent().await?;
        let list = result_op.peek_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        let mut expected = ["123", "42"].into_iter().collect::<FxHashSet<_>>();
        for collectible in list {
            assert!(expected.remove(collectible.to_string().await?.as_str()))
        }
        assert_eq!(result_val.0, 0);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn taking_collectibles() {
    run(&REGISTRATION, || async {
        let result_op = my_collecting_function();
        let result_val = result_op.connect().strongly_consistent().await?;
        let list = result_op.take_collectibles::<Box<dyn ValueToString>>();
        // my_collecting_function already processed the collectibles so the list should
        // be empty
        assert!(list.is_empty());
        assert_eq!(result_val.0, 0);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn taking_collectibles_extra_layer() {
    run(&REGISTRATION, || async {
        let result_op = my_collecting_function_indirect();
        let result_val = result_op.connect().strongly_consistent().await?;
        let list = result_op.take_collectibles::<Box<dyn ValueToString>>();
        // my_collecting_function already processed the collectibles so the list should
        // be empty
        assert!(list.is_empty());
        assert_eq!(result_val.0, 0);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn taking_collectibles_parallel() {
    run(&REGISTRATION, || async {
        let result_op = my_transitive_emitting_function("".into(), "a".into());
        let result_val = result_op.connect().strongly_consistent().await?;
        let list = result_op.take_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        assert_eq!(result_val.0, 0);

        let result_op = my_transitive_emitting_function("".into(), "b".into());
        let result_val = result_op.connect().strongly_consistent().await?;
        let list = result_op.take_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        assert_eq!(result_val.0, 0);

        let result_op =
            my_transitive_emitting_function_with_child_scope("".into(), "b".into(), "1".into());
        let result_val = result_op.connect().strongly_consistent().await?;
        let list = result_op.take_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        assert_eq!(result_val.0, 0);

        let result_op =
            my_transitive_emitting_function_with_child_scope("".into(), "b".into(), "2".into());
        let result_val = result_op.connect().strongly_consistent().await?;
        let list = result_op.take_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        assert_eq!(result_val.0, 0);

        let result_op =
            my_transitive_emitting_function_with_child_scope("".into(), "c".into(), "3".into());
        let result_val = result_op.connect().strongly_consistent().await?;
        let list = result_op.take_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        assert_eq!(result_val.0, 0);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn taking_collectibles_with_resolve() {
    run(&REGISTRATION, || async {
        let result_op = my_transitive_emitting_function_with_resolve("resolve".into());
        result_op.connect().strongly_consistent().await?;
        let list = result_op.take_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value(transparent)]
struct Collectibles(AutoSet<ResolvedVc<Box<dyn ValueToString>>>);

#[turbo_tasks::function(operation)]
async fn my_collecting_function() -> Result<Vc<Thing>> {
    let result_op = my_transitive_emitting_function("".into(), "".into());
    let result_vc = result_op.connect();
    result_vc.await?;
    result_op.take_collectibles::<Box<dyn ValueToString>>();
    Ok(result_vc)
}

#[turbo_tasks::function(operation)]
async fn my_collecting_function_indirect() -> Result<Vc<Thing>> {
    let result_op = my_collecting_function();
    let result_vc = result_op.connect();
    result_vc.strongly_consistent().await?;
    let list = result_op.peek_collectibles::<Box<dyn ValueToString>>();
    // my_collecting_function already processed the collectibles so the list should
    // be empty
    assert!(list.is_empty());
    Ok(result_vc)
}

#[turbo_tasks::function(operation)]
async fn my_multi_emitting_function() -> Result<Vc<Thing>> {
    my_transitive_emitting_function("".into(), "a".into())
        .connect()
        .await?;
    my_transitive_emitting_function("".into(), "b".into())
        .connect()
        .await?;
    my_emitting_function("".into()).await?;
    Ok(Thing::cell(Thing(0)))
}

#[turbo_tasks::function(operation)]
async fn my_transitive_emitting_function(key: RcStr, key2: RcStr) -> Result<Vc<Thing>> {
    let _ = key2;
    my_emitting_function(key).await?;
    Ok(Thing::cell(Thing(0)))
}

#[turbo_tasks::function(operation)]
async fn my_transitive_emitting_function_collectibles(
    key: RcStr,
    key2: RcStr,
) -> Result<Vc<Collectibles>> {
    let result_op = my_transitive_emitting_function(key, key2);
    Ok(Vc::cell(
        result_op
            .peek_collectibles::<Box<dyn ValueToString>>()
            .into_iter()
            .map(|v| v.to_resolved())
            .try_join()
            .await?
            .into_iter()
            .collect(),
    ))
}

#[turbo_tasks::function(operation)]
async fn my_transitive_emitting_function_with_child_scope(
    key: RcStr,
    key2: RcStr,
    key3: RcStr,
) -> Result<Vc<Thing>> {
    let _ = key3;
    let thing_op = my_transitive_emitting_function(key, key2);
    let thing_vc = thing_op.connect();
    thing_vc.await?;
    let list = thing_op.peek_collectibles::<Box<dyn ValueToString>>();
    assert_eq!(list.len(), 2);
    Ok(thing_vc)
}

#[turbo_tasks::function]
async fn my_emitting_function(key: RcStr) -> Result<()> {
    let _ = key;
    sleep(Duration::from_millis(100)).await;
    emit(ResolvedVc::upcast::<Box<dyn ValueToString>>(Thing::new(
        123,
    )));
    emit(ResolvedVc::upcast::<Box<dyn ValueToString>>(Thing::new(42)));
    Ok(())
}

#[turbo_tasks::function]
async fn my_transitive_emitting_function_with_thing(key: RcStr, _thing: Vc<Thing>) -> Result<()> {
    let _ = my_emitting_function(key);
    Ok(())
}

#[turbo_tasks::function(operation)]
async fn my_transitive_emitting_function_with_resolve(key: RcStr) -> Result<()> {
    let _ = my_transitive_emitting_function_with_thing(key, get_thing(0));
    Ok(())
}

#[turbo_tasks::value(shared)]
struct Thing(u32);

impl Thing {
    fn new(v: u32) -> ResolvedVc<Self> {
        Self::resolved_cell(Thing(v))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for Thing {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.0.to_string().into())
    }
}

#[turbo_tasks::function]
fn get_thing(v: u32) -> Vc<Thing> {
    Thing::cell(Thing(v))
}
