#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_tasks::{OperationVc, OrderedIndexMap, ResolvedVc, State, Vc};
use turbo_tasks_testing::{Registration, register, run};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value(transparent)]
struct Step(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_state_operation() -> Vc<Step> {
    Step(State::new(0)).cell()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_invalidation_map() {
    run(&REGISTRATION, async || {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(1);

        let map = create_map(state_vc);
        let a = get_value(map, "a".to_string());
        let b = get_value(map, "b".to_string());
        let c = get_value(map, "c".to_string());

        let a_ref = a.read_strongly_consistent().await?;
        let b_ref = b.read_strongly_consistent().await?;
        let c_ref = c.read_strongly_consistent().await?;

        assert_eq!(a_ref.value, Some(1));
        assert_eq!(b_ref.value, Some(2));
        assert_eq!(c_ref.value, None);

        state.set(2);

        let a_ref2 = a.read_strongly_consistent().await?;
        let b_ref2 = b.read_strongly_consistent().await?;
        let c_ref2 = c.read_strongly_consistent().await?;

        assert_eq!(a_ref2.value, Some(1));
        assert_eq!(b_ref2.value, Some(22));
        assert_eq!(c_ref2.value, None);
        assert_eq!(a_ref.random, a_ref2.random);
        assert_eq!(c_ref.random, c_ref2.random);

        state.set(3);

        let a_ref3 = a.read_strongly_consistent().await?;
        let b_ref3 = b.read_strongly_consistent().await?;
        let c_ref3 = c.read_strongly_consistent().await?;

        assert_eq!(a_ref3.value, None);
        assert_eq!(b_ref3.value, Some(22));
        assert_eq!(c_ref3.value, Some(3));
        assert_eq!(b_ref2.random, b_ref3.random);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value(transparent, cell = "keyed")]
struct Map(FxHashMap<String, u32>);

#[turbo_tasks::function(operation, root)]
async fn create_map(step: ResolvedVc<Step>) -> Result<Vc<Map>> {
    let step = step.await?;
    let step_value = step.get();

    Ok(Vc::cell(match *step_value {
        1 => FxHashMap::from_iter([("a".to_string(), 1), ("b".to_string(), 2)]),
        2 => FxHashMap::from_iter([("a".to_string(), 1), ("b".to_string(), 22)]),
        3 => FxHashMap::from_iter([("c".to_string(), 3), ("b".to_string(), 22)]),
        _ => FxHashMap::default(),
    }))
}

#[turbo_tasks::value]
struct GetValueResult {
    value: Option<u32>,
    random: u32,
}

#[turbo_tasks::function(operation, root)]
async fn get_value(map: OperationVc<Map>, key: String) -> Result<Vc<GetValueResult>> {
    let map = map.connect();
    let value = map.get(&key).await?.as_deref().copied();
    let random = rand::random::<u32>();
    Ok(GetValueResult { value, random }.cell())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_invalidation_set() {
    run(&REGISTRATION, async || {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(1);

        let set = create_set(state_vc);
        let a = has_value(set, "a".to_string());
        let b = has_value(set, "b".to_string());
        let c = has_value(set, "c".to_string());

        let a_ref = a.read_strongly_consistent().await?;
        let b_ref = b.read_strongly_consistent().await?;
        let c_ref = c.read_strongly_consistent().await?;

        assert!(a_ref.value);
        assert!(b_ref.value);
        assert!(!c_ref.value);

        state.set(2);

        let a_ref2 = a.read_strongly_consistent().await?;
        let b_ref2 = b.read_strongly_consistent().await?;
        let c_ref2 = c.read_strongly_consistent().await?;

        assert!(a_ref2.value);
        assert!(b_ref2.value);
        assert!(!c_ref2.value);
        assert_eq!(a_ref.random, a_ref2.random);
        assert_eq!(b_ref.random, b_ref2.random);
        assert_eq!(c_ref.random, c_ref2.random);

        state.set(3);

        let a_ref3 = a.read_strongly_consistent().await?;
        let b_ref3 = b.read_strongly_consistent().await?;
        let c_ref3 = c.read_strongly_consistent().await?;

        assert!(!a_ref3.value);
        assert!(b_ref3.value);
        assert!(c_ref3.value);
        assert_eq!(b_ref2.random, b_ref3.random);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value(transparent, cell = "keyed")]
struct Set(FxHashSet<String>);

#[turbo_tasks::function(operation, root)]
async fn create_set(step: ResolvedVc<Step>) -> Result<Vc<Set>> {
    let step = step.await?;
    let step_value = step.get();

    Ok(Vc::cell(match *step_value {
        1 => FxHashSet::from_iter(["a".to_string(), "b".to_string()]),
        2 => FxHashSet::from_iter(["e".to_string(), "a".to_string(), "b".to_string()]),
        3 => FxHashSet::from_iter(["c".to_string(), "b".to_string()]),
        _ => FxHashSet::default(),
    }))
}

#[turbo_tasks::value]
struct HasValueResult {
    value: bool,
    random: u32,
}

#[turbo_tasks::function(operation, root)]
async fn has_value(set: OperationVc<Set>, key: String) -> Result<Vc<HasValueResult>> {
    let set = set.connect();
    let value = set.contains_key(&key).await?;
    let random = rand::random::<u32>();
    Ok(HasValueResult { value, random }.cell())
}

/// A keyed cell over an `OrderedIndexMap`: reordering the entries must invalidate readers of the
/// whole map, and only readers of keys that moved.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_invalidation_ordered_map_reorder() {
    run(&REGISTRATION, async || {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(1);

        let map = create_ordered_map(state_vc);
        let keys = get_ordered_keys(map);
        let a = get_ordered_value(map, "a".to_string());
        let b = get_ordered_value(map, "b".to_string());

        let keys_ref = keys.read_strongly_consistent().await?;
        let a_ref = a.read_strongly_consistent().await?;
        let b_ref = b.read_strongly_consistent().await?;
        assert_eq!(*keys_ref, ["a", "b", "c"]);
        assert_eq!(a_ref.value, Some(1));
        assert_eq!(b_ref.value, Some(2));

        // Same entries, `b` and `c` swap places.
        state.set(2);

        let keys_ref2 = keys.read_strongly_consistent().await?;
        let a_ref2 = a.read_strongly_consistent().await?;
        let b_ref2 = b.read_strongly_consistent().await?;
        assert_eq!(*keys_ref2, ["a", "c", "b"]);
        assert_eq!(a_ref2.value, Some(1));
        assert_eq!(b_ref2.value, Some(2));
        // `a` didn't move, so its reader wasn't invalidated.
        assert_eq!(a_ref.random, a_ref2.random);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value(transparent, cell = "keyed")]
struct OrderedMap(OrderedIndexMap<String, u32>);

#[turbo_tasks::function(operation, root)]
async fn create_ordered_map(step: ResolvedVc<Step>) -> Result<Vc<OrderedMap>> {
    let step = step.await?;
    let step_value = step.get();

    let entries: &[(&str, u32)] = match *step_value {
        1 => &[("a", 1), ("b", 2), ("c", 3)],
        2 => &[("a", 1), ("c", 3), ("b", 2)],
        _ => &[],
    };
    Ok(Vc::cell(
        entries
            .iter()
            .map(|&(key, value)| (key.to_string(), value))
            .collect(),
    ))
}

#[turbo_tasks::value(transparent)]
struct Keys(Vec<String>);

#[turbo_tasks::function(operation, root)]
async fn get_ordered_keys(map: OperationVc<OrderedMap>) -> Result<Vc<Keys>> {
    let map = map.connect().await?;
    Ok(Vc::cell(map.keys().cloned().collect()))
}

#[turbo_tasks::function(operation, root)]
async fn get_ordered_value(
    map: OperationVc<OrderedMap>,
    key: String,
) -> Result<Vc<GetValueResult>> {
    let map = map.connect();
    let value = map.get(&key).await?.as_deref().copied();
    let random = rand::random::<u32>();
    Ok(GetValueResult { value, random }.cell())
}
