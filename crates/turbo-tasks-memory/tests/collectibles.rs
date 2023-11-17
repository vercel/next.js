#![feature(arbitrary_self_types)]

use std::{collections::HashSet, time::Duration};

use anyhow::Result;
use auto_hash_map::AutoSet;
use tokio::time::sleep;
use turbo_tasks::{emit, CollectiblesSource, ValueToString, Vc};
use turbo_tasks_testing::{register, run};
register!();

#[tokio::test]
async fn transitive_emitting() {
    run! {
        let result = my_transitive_emitting_function("".to_string(), "".to_string());
        result.strongly_consistent().await?;
        let list = result.peek_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        let mut expected = ["123", "42"].into_iter().collect::<HashSet<_>>();
        for collectible in list {
            assert!(expected.remove(collectible.to_string().await?.as_str()))
        }
        assert_eq!(result.await?.0, 0);
    }
}

#[tokio::test]
async fn transitive_emitting_indirect() {
    run! {
        let result = my_transitive_emitting_function("".to_string(), "".to_string());
        let collectibles = my_transitive_emitting_function_collectibles("".to_string(), "".to_string());
        let list = collectibles.strongly_consistent().await?;
        assert_eq!(list.len(), 2);
        let mut expected = ["123", "42"].into_iter().collect::<HashSet<_>>();
        for collectible in list.iter() {
            assert!(expected.remove(collectible.to_string().await?.as_str()))
        }
        assert_eq!(result.await?.0, 0);
    }
}

#[tokio::test]
async fn multi_emitting() {
    run! {
        let result = my_multi_emitting_function();
        result.strongly_consistent().await?;
        let list = result.peek_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        let mut expected = ["123", "42"].into_iter().collect::<HashSet<_>>();
        for collectible in list {
            assert!(expected.remove(collectible.to_string().await?.as_str()))
        }
        assert_eq!(result.await?.0, 0);
    }
}

#[tokio::test]
async fn taking_collectibles() {
    run! {
        let result = my_collecting_function();
        let list = result.take_collectibles::<Box<dyn ValueToString>>();
        // my_collecting_function already processed the collectibles so the list should
        // be empty
        assert!(list.is_empty());
        assert_eq!(result.await?.0, 0);
    }
}

#[tokio::test]
async fn taking_collectibles_extra_layer() {
    run! {
        let result = my_collecting_function_indirect();
        result.strongly_consistent().await?;
        let list = result.take_collectibles::<Box<dyn ValueToString>>();
        // my_collecting_function already processed the collectibles so the list should
        // be empty
        assert!(list.is_empty());
        assert_eq!(result.await?.0, 0);
    }
}

#[tokio::test]
async fn taking_collectibles_parallel() {
    run! {
        let result = my_transitive_emitting_function("".to_string(), "a".to_string());
        result.strongly_consistent().await?;
        let list = result.take_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        assert_eq!(result.await?.0, 0);

        let result = my_transitive_emitting_function("".to_string(), "b".to_string());
        result.strongly_consistent().await?;
        let list = result.take_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        assert_eq!(result.await?.0, 0);

        let result = my_transitive_emitting_function_with_child_scope("".to_string(), "b".to_string(), "1".to_string());
        result.strongly_consistent().await?;
        let list = result.take_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        assert_eq!(result.await?.0, 0);

        let result = my_transitive_emitting_function_with_child_scope("".to_string(), "b".to_string(), "2".to_string());
        result.strongly_consistent().await?;
        let list = result.take_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        assert_eq!(result.await?.0, 0);

        let result = my_transitive_emitting_function_with_child_scope("".to_string(), "c".to_string(), "3".to_string());
        result.strongly_consistent().await?;
        let list = result.take_collectibles::<Box<dyn ValueToString>>();
        assert_eq!(list.len(), 2);
        assert_eq!(result.await?.0, 0);
    }
}

#[turbo_tasks::value(transparent)]
struct Collectibles(AutoSet<Vc<Box<dyn ValueToString>>>);

#[turbo_tasks::function]
async fn my_collecting_function() -> Result<Vc<Thing>> {
    let result = my_transitive_emitting_function("".to_string(), "".to_string());
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
    my_transitive_emitting_function("".to_string(), "a".to_string()).await?;
    my_transitive_emitting_function("".to_string(), "b".to_string()).await?;
    my_emitting_function("".to_string()).await?;
    Ok(Thing::cell(Thing(0)))
}

#[turbo_tasks::function]
async fn my_transitive_emitting_function(key: String, _key2: String) -> Result<Vc<Thing>> {
    my_emitting_function(key).await?;
    Ok(Thing::cell(Thing(0)))
}

#[turbo_tasks::function]
async fn my_transitive_emitting_function_collectibles(
    key: String,
    key2: String,
) -> Vc<Collectibles> {
    let result = my_transitive_emitting_function(key, key2);
    Vc::cell(result.peek_collectibles::<Box<dyn ValueToString>>())
}

#[turbo_tasks::function]
async fn my_transitive_emitting_function_with_child_scope(
    key: String,
    key2: String,
    _key3: String,
) -> Result<Vc<Thing>> {
    let thing = my_transitive_emitting_function(key, key2);
    thing.strongly_consistent().await?;
    let list = thing.peek_collectibles::<Box<dyn ValueToString>>();
    assert_eq!(list.len(), 2);
    Ok(thing)
}

#[turbo_tasks::function]
async fn my_emitting_function(_key: String) -> Result<()> {
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
    fn to_string(&self) -> Vc<String> {
        Vc::cell(self.0.to_string())
    }
}
