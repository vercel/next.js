#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_tasks::{OperationVc, OrderedAutoMap, ReadRef, ResolvedVc, State, Vc};
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

/// A keyed cell over an `OrderedAutoMap`: reordering the entries must invalidate readers of the
/// whole map, but not readers of single keys whose values didn't change.
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
        // Keyed readers are not affected by the order.
        assert_eq!(a_ref.random, a_ref2.random);
        assert_eq!(b_ref.random, b_ref2.random);

        // `a` changes and `b` and `c` swap back: only the reader of `a` is invalidated.
        state.set(3);

        let keys_ref3 = keys.read_strongly_consistent().await?;
        let a_ref3 = a.read_strongly_consistent().await?;
        let b_ref3 = b.read_strongly_consistent().await?;
        assert_eq!(*keys_ref3, ["a", "b", "c"]);
        assert_eq!(a_ref3.value, Some(10));
        assert_eq!(b_ref3.value, Some(2));
        assert_ne!(a_ref2.random, a_ref3.random);
        assert_eq!(b_ref2.random, b_ref3.random);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value(transparent, cell = "keyed")]
struct OrderedMap(OrderedAutoMap<String, u32>);

#[turbo_tasks::function(operation, root)]
async fn create_ordered_map(step: ResolvedVc<Step>) -> Result<Vc<OrderedMap>> {
    let step = step.await?;
    let step_value = step.get();

    let entries: &[(&str, u32)] = match *step_value {
        1 => &[("a", 1), ("b", 2), ("c", 3)],
        2 => &[("a", 1), ("c", 3), ("b", 2)],
        3 => &[("a", 10), ("b", 2), ("c", 3)],
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
    Ok(Vc::cell(map.iter().map(|(key, _)| key.clone()).collect()))
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

/// A keyed cell over a `Vec`, keyed by index: readers of an index are only invalidated when the
/// value at that index changes, or the index is added or removed.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_invalidation_vec() {
    run(&REGISTRATION, async || {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(1);

        let list = create_list(state_vc);
        let readers = (0..4usize)
            .map(|index| get_list_value(list, index))
            .collect::<Vec<_>>();
        let len = get_list_len(list);
        let keyed = get_list_values_keyed(list);

        async fn read_all(
            readers: &[OperationVc<GetValueResult>],
        ) -> Result<Vec<ReadRef<GetValueResult>>> {
            let mut results = Vec::new();
            for reader in readers {
                results.push(reader.read_strongly_consistent().await?);
            }
            Ok(results)
        }
        let values = |results: &[ReadRef<GetValueResult>]| {
            results.iter().map(|r| r.value).collect::<Vec<_>>()
        };

        // Step 1: [1, 2, 3]
        let r1 = read_all(&readers).await?;
        let len1 = len.read_strongly_consistent().await?;
        let keyed1 = keyed.read_strongly_consistent().await?;
        assert_eq!(values(&r1), [Some(1), Some(2), Some(3), None]);
        assert_eq!(len1.value, Some(3));
        assert_eq!(keyed1.values, [Some(1), Some(3)]);

        // Step 2: [1, 22, 3]: only index 1 (and the whole value) changed.
        state.set(2);
        let r2 = read_all(&readers).await?;
        let len2 = len.read_strongly_consistent().await?;
        let keyed2 = keyed.read_strongly_consistent().await?;
        assert_eq!(values(&r2), [Some(1), Some(22), Some(3), None]);
        assert_eq!(r1[0].random, r2[0].random);
        assert_ne!(r1[1].random, r2[1].random);
        assert_eq!(r1[2].random, r2[2].random);
        assert_eq!(r1[3].random, r2[3].random);
        assert_ne!(len1.random, len2.random);
        // The keyed reader only accessed indices 0 and 2.
        assert_eq!(keyed1.random, keyed2.random);

        // Step 3: [1, 22]: index 2 removed.
        state.set(3);
        let r3 = read_all(&readers).await?;
        let keyed3 = keyed.read_strongly_consistent().await?;
        assert_eq!(values(&r3), [Some(1), Some(22), None, None]);
        assert_eq!(r2[0].random, r3[0].random);
        assert_eq!(r2[1].random, r3[1].random);
        assert_ne!(r2[2].random, r3[2].random);
        assert_eq!(r2[3].random, r3[3].random);
        assert_ne!(keyed2.random, keyed3.random);
        assert_eq!(keyed3.values, [Some(1), None]);

        // Step 4: [1, 22, 4, 5]: indices 2 and 3 added.
        state.set(4);
        let r4 = read_all(&readers).await?;
        let keyed4 = keyed.read_strongly_consistent().await?;
        assert_eq!(values(&r4), [Some(1), Some(22), Some(4), Some(5)]);
        assert_eq!(r3[0].random, r4[0].random);
        assert_eq!(r3[1].random, r4[1].random);
        assert_ne!(r3[2].random, r4[2].random);
        assert_ne!(r3[3].random, r4[3].random);
        assert_ne!(keyed3.random, keyed4.random);
        assert_eq!(keyed4.values, [Some(1), Some(4)]);

        // Step 5: [7, 22, 4, 5]: only index 0 changed, which the keyed reader accessed.
        state.set(5);
        let r5 = read_all(&readers).await?;
        let keyed5 = keyed.read_strongly_consistent().await?;
        assert_eq!(values(&r5), [Some(7), Some(22), Some(4), Some(5)]);
        assert_ne!(r4[0].random, r5[0].random);
        assert_eq!(r4[1].random, r5[1].random);
        assert_eq!(r4[2].random, r5[2].random);
        assert_eq!(r4[3].random, r5[3].random);
        assert_ne!(keyed4.random, keyed5.random);
        assert_eq!(keyed5.values, [Some(7), Some(4)]);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value(transparent, cell = "keyed")]
struct List(Vec<u32>);

#[turbo_tasks::function(operation, root)]
async fn create_list(step: ResolvedVc<Step>) -> Result<Vc<List>> {
    let step = step.await?;
    let step_value = step.get();

    Ok(Vc::cell(match *step_value {
        1 => vec![1, 2, 3],
        2 => vec![1, 22, 3],
        3 => vec![1, 22],
        4 => vec![1, 22, 4, 5],
        5 => vec![7, 22, 4, 5],
        _ => vec![],
    }))
}

#[turbo_tasks::function(operation, root)]
async fn get_list_value(list: OperationVc<List>, index: usize) -> Result<Vc<GetValueResult>> {
    let list = list.connect();
    let value = list.get(&index).await?.as_deref().copied();
    let random = rand::random::<u32>();
    Ok(GetValueResult { value, random }.cell())
}

#[turbo_tasks::function(operation, root)]
async fn get_list_len(list: OperationVc<List>) -> Result<Vc<GetValueResult>> {
    let list = list.connect().await?;
    let value = Some(list.len() as u32);
    let random = rand::random::<u32>();
    Ok(GetValueResult { value, random }.cell())
}

#[turbo_tasks::value]
struct GetValuesResult {
    values: Vec<Option<u32>>,
    random: u32,
}

/// Reads indices 0 and 2 through one `keyed_reader()`.
#[turbo_tasks::function(operation, root)]
async fn get_list_values_keyed(list: OperationVc<List>) -> Result<Vc<GetValuesResult>> {
    let list = list.connect().keyed_reader().await?;
    let values = [0usize, 2].iter().map(|i| list.get(i).copied()).collect();
    let random = rand::random::<u32>();
    Ok(GetValuesResult { values, random }.cell())
}
