#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::{collections::HashSet, time::Duration};

use anyhow::Result;
use auto_hash_map::AutoSet;
use tokio::time::sleep;
use turbo_rcstr::RcStr;
use turbo_tasks::{emit, CollectiblesSource, ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn transitive_emitting() {
    run(&REGISTRATION, || async {
        let result = my_transitive_emitting_function("".into(), "".into());
        result.strongly_consistent().await?;
        let list = result.peek_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        let mut expected = ["123", "42"].into_iter().collect::<HashSet<_>>();
        for collectible in list {
            assert!(expected.remove(collectible.to_string().await?.as_str()))
        }
        assert_eq!(result.await?.0, 0);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn transitive_emitting_indirect() {
    run(&REGISTRATION, || async {
        let result = my_transitive_emitting_function("".into(), "".into());
        let collectibles = my_transitive_emitting_function_collectibles("".into(), "".into());
        let list = collectibles.strongly_consistent().await?;
        assert_eq!(list.len(), 2);
        let mut expected = ["123", "42"].into_iter().collect::<HashSet<_>>();
        for collectible in list.iter() {
            assert!(expected.remove(collectible.to_string().await?.as_str()))
        }
        assert_eq!(result.await?.0, 0);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn multi_emitting() {
    run(&REGISTRATION, || async {
        let result = my_multi_emitting_function();
        result.strongly_consistent().await?;
        let list = result.peek_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        let mut expected = ["123", "42"].into_iter().collect::<HashSet<_>>();
        for collectible in list {
            assert!(expected.remove(collectible.to_string().await?.as_str()))
        }
        assert_eq!(result.await?.0, 0);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn taking_collectibles() {
    run(&REGISTRATION, || async {
        let result = my_collecting_function();
        let list = result.take_collectibles::<Box<dyn ValueToString>>();
        // my_collecting_function already processed the collectibles so the list should
        // be empty
        assert!(list.is_empty());
        assert_eq!(result.await?.0, 0);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn taking_collectibles_extra_layer() {
    run(&REGISTRATION, || async {
        let result = my_collecting_function_indirect();
        result.strongly_consistent().await?;
        let list = result.take_collectibles::<Box<dyn ValueToString>>();
        // my_collecting_function already processed the collectibles so the list should
        // be empty
        assert!(list.is_empty());
        assert_eq!(result.await?.0, 0);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn taking_collectibles_parallel() {
    run(&REGISTRATION, || async {
        let result = my_transitive_emitting_function("".into(), "a".into());
        result.strongly_consistent().await?;
        let list = result.take_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        assert_eq!(result.await?.0, 0);

        let result = my_transitive_emitting_function("".into(), "b".into());
        result.strongly_consistent().await?;
        let list = result.take_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        assert_eq!(result.await?.0, 0);

        let result =
            my_transitive_emitting_function_with_child_scope("".into(), "b".into(), "1".into());
        result.strongly_consistent().await?;
        let list = result.take_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        assert_eq!(result.await?.0, 0);

        let result =
            my_transitive_emitting_function_with_child_scope("".into(), "b".into(), "2".into());
        result.strongly_consistent().await?;
        let list = result.take_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        assert_eq!(result.await?.0, 0);

        let result =
            my_transitive_emitting_function_with_child_scope("".into(), "c".into(), "3".into());
        result.strongly_consistent().await?;
        let list = result.take_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        assert_eq!(result.await?.0, 0);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value(transparent)]
struct Collectibles(AutoSet<ResolvedVc<Box<dyn ValueToString>>>);

#[turbo_tasks::function]
async fn my_collecting_function() -> Result<Vc<Thing>> {
    let result = my_transitive_emitting_function("".into(), "".into());
    result.take_collectibles::<Box<dyn ValueToString>>();
    Ok(result)
}

#[turbo_tasks::function]
async fn my_collecting_function_indirect() -> Result<Vc<Thing>> {
    let result = my_collecting_function();
    result.strongly_consistent().await?;
    let list = result.peek_collectibles::<Box<dyn ValueToString>>();
    // my_collecting_function already processed the collectibles so the list should
    // be empty
    assert!(list.is_empty());
    Ok(result)
}

#[turbo_tasks::function]
async fn my_multi_emitting_function() -> Result<Vc<Thing>> {
    my_transitive_emitting_function("".into(), "a".into()).await?;
    my_transitive_emitting_function("".into(), "b".into()).await?;
    my_emitting_function("".into()).await?;
    Ok(Thing::cell(Thing(0)))
}

#[turbo_tasks::function]
async fn my_transitive_emitting_function(key: RcStr, _key2: RcStr) -> Result<Vc<Thing>> {
    my_emitting_function(key).await?;
    Ok(Thing::cell(Thing(0)))
}

#[turbo_tasks::function]
async fn my_transitive_emitting_function_collectibles(
    key: RcStr,
    key2: RcStr,
) -> Result<Vc<Collectibles>> {
    let result = my_transitive_emitting_function(key, key2);
    Ok(Vc::cell(
        result
            .peek_collectibles::<Box<dyn ValueToString>>()
            .into_iter()
            .map(|v| v.to_resolved())
            .try_join()
            .await?
            .into_iter()
            .collect(),
    ))
}

#[turbo_tasks::function]
async fn my_transitive_emitting_function_with_child_scope(
    key: RcStr,
    key2: RcStr,
    _key3: RcStr,
) -> Result<Vc<Thing>> {
    let thing = my_transitive_emitting_function(key, key2);
    thing.strongly_consistent().await?;
    let list = thing.peek_collectibles::<Box<dyn ValueToString>>();
    assert_eq!(list.len(), 2);
    Ok(thing)
}

#[turbo_tasks::function]
async fn my_emitting_function(_key: RcStr) -> Result<()> {
    sleep(Duration::from_millis(100)).await;
    emit(Vc::upcast::<Box<dyn ValueToString>>(Thing::new(123)));
    emit(Vc::upcast::<Box<dyn ValueToString>>(Thing::new(42)));
    Ok(())
}

#[turbo_tasks::value(shared)]
struct Thing(u32);

impl Thing {
    fn new(v: u32) -> Vc<Self> {
        Self::cell(Thing(v))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for Thing {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.0.to_string().into())
    }
}
