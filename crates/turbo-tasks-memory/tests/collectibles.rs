#![feature(min_specialization)]

use std::collections::HashSet;

use anyhow::Result;
use turbo_tasks::{emit, primitives::StringVc, CollectiblesSource, ValueToString, ValueToStringVc};
use turbo_tasks_testing::{register, run};
register!();

#[tokio::test]
async fn transitive_emitting() {
    run! {
        let result = my_transitive_emitting_function("", "");
        let list = result.peek_collectibles::<ValueToStringVc>().await?;
        assert_eq!(list.len(), 2);
        let mut expected = ["123", "42"].into_iter().collect::<HashSet<_>>();
        for collectible in list {
            assert!(expected.remove(collectible.to_string().await?.as_str()))
        }
        assert_eq!(result.await?.0, 0);
    }
}

#[tokio::test]
async fn multi_emitting() {
    run! {
        let result = my_multi_emitting_function();
        let list = result.peek_collectibles::<ValueToStringVc>().await?;
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
        let list = result.take_collectibles::<ValueToStringVc>().await?;
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
        let list = result.take_collectibles::<ValueToStringVc>().await?;
        // my_collecting_function already processed the collectibles so the list should
        // be empty
        assert!(list.is_empty());
        assert_eq!(result.await?.0, 0);
    }
}

#[tokio::test]
async fn taking_collectibles_parallel() {
    run! {
        let result = my_transitive_emitting_function("", "a");
        let list = result.take_collectibles::<ValueToStringVc>().await?;
        assert_eq!(list.len(), 2);
        assert_eq!(result.await?.0, 0);

        let result = my_transitive_emitting_function("", "b");
        let list = result.take_collectibles::<ValueToStringVc>().await?;
        assert_eq!(list.len(), 2);
        assert_eq!(result.await?.0, 0);

        let result = my_transitive_emitting_function_with_child_scope("", "b", "1");
        let list = result.take_collectibles::<ValueToStringVc>().await?;
        assert_eq!(list.len(), 2);
        assert_eq!(result.await?.0, 0);

        let result = my_transitive_emitting_function_with_child_scope("", "b", "2");
        let list = result.take_collectibles::<ValueToStringVc>().await?;
        assert_eq!(list.len(), 2);
        assert_eq!(result.await?.0, 0);

        let result = my_transitive_emitting_function_with_child_scope("", "c", "3");
        let list = result.take_collectibles::<ValueToStringVc>().await?;
        assert_eq!(list.len(), 2);
        assert_eq!(result.await?.0, 0);
    }
}

#[turbo_tasks::function]
async fn my_collecting_function() -> Result<ThingVc> {
    let result = my_transitive_emitting_function("", "");
    result.take_collectibles::<ValueToStringVc>().await?;
    Ok(result)
}

#[turbo_tasks::function]
async fn my_collecting_function_indirect() -> Result<ThingVc> {
    let result = my_collecting_function();
    let list = result.peek_collectibles::<ValueToStringVc>().await?;
    // my_collecting_function already processed the collectibles so the list should
    // be empty
    assert!(list.is_empty());
    Ok(result)
}

#[turbo_tasks::function]
fn my_multi_emitting_function() -> ThingVc {
    my_transitive_emitting_function("", "a");
    my_transitive_emitting_function("", "b");
    my_emitting_function("");
    ThingVc::cell(Thing(0))
}

#[turbo_tasks::function]
fn my_transitive_emitting_function(key: &str, _key2: &str) -> ThingVc {
    my_emitting_function(key);
    ThingVc::cell(Thing(0))
}

#[turbo_tasks::function]
async fn my_transitive_emitting_function_with_child_scope(
    key: &str,
    key2: &str,
    _key3: &str,
) -> Result<ThingVc> {
    let thing = my_transitive_emitting_function(key, key2);
    let list = thing.peek_collectibles::<ValueToStringVc>().await?;
    assert_eq!(list.len(), 2);
    Ok(thing)
}

#[turbo_tasks::function]
async fn my_emitting_function(_key: &str) -> Result<()> {
    emit(ThingVc::new(123).as_value_to_string());
    emit(ThingVc::new(42).as_value_to_string());
    Ok(())
}

#[turbo_tasks::value(shared)]
struct Thing(u32);

impl ThingVc {
    fn new(v: u32) -> Self {
        Self::cell(Thing(v))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for Thing {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        StringVc::cell(self.0.to_string())
    }
}
