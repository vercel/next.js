#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_tasks::{OperationVc, ResolvedVc, State, Vc};
use turbo_tasks_testing::{Registration, register, run};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value(transparent)]
struct Step(State<u32>);

#[turbo_tasks::function]
fn create_state() -> Vc<Step> {
    Step(State::new(0)).cell()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn invalidation_map() {
    run(&REGISTRATION, || async {
        let state = create_state().to_resolved().await?;
        state.await?.set(1);

        let map = create_map(state);
        let a = get_value(map, "a".to_string());
        let b = get_value(map, "b".to_string());
        let c = get_value(map, "c".to_string());

        let a_ref = a.read_strongly_consistent().await?;
        let b_ref = b.read_strongly_consistent().await?;
        let c_ref = c.read_strongly_consistent().await?;

        assert_eq!(a_ref.value, Some(1));
        assert_eq!(b_ref.value, Some(2));
        assert_eq!(c_ref.value, None);

        state.await?.set(2);

        let a_ref2 = a.read_strongly_consistent().await?;
        let b_ref2 = b.read_strongly_consistent().await?;
        let c_ref2 = c.read_strongly_consistent().await?;

        assert_eq!(a_ref2.value, Some(1));
        assert_eq!(b_ref2.value, Some(22));
        assert_eq!(c_ref2.value, None);
        assert_eq!(a_ref.random, a_ref2.random);
        assert_eq!(c_ref.random, c_ref2.random);

        state.await?.set(3);

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

#[turbo_tasks::function(operation)]
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

#[turbo_tasks::function(operation)]
async fn get_value(map: OperationVc<Map>, key: String) -> Result<Vc<GetValueResult>> {
    let map = map.connect();
    let value = map.get(&key).await?.as_deref().copied();
    let random = rand::random::<u32>();
    Ok(GetValueResult { value, random }.cell())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn invalidation_set() {
    run(&REGISTRATION, || async {
        let state = create_state().to_resolved().await?;
        state.await?.set(1);

        let set = create_set(state);
        let a = has_value(set, "a".to_string());
        let b = has_value(set, "b".to_string());
        let c = has_value(set, "c".to_string());

        let a_ref = a.read_strongly_consistent().await?;
        let b_ref = b.read_strongly_consistent().await?;
        let c_ref = c.read_strongly_consistent().await?;

        assert!(a_ref.value);
        assert!(b_ref.value);
        assert!(!c_ref.value);

        state.await?.set(2);

        let a_ref2 = a.read_strongly_consistent().await?;
        let b_ref2 = b.read_strongly_consistent().await?;
        let c_ref2 = c.read_strongly_consistent().await?;

        assert!(a_ref2.value);
        assert!(b_ref2.value);
        assert!(!c_ref2.value);
        assert_eq!(a_ref.random, a_ref2.random);
        assert_eq!(b_ref.random, b_ref2.random);
        assert_eq!(c_ref.random, c_ref2.random);

        state.await?.set(3);

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

#[turbo_tasks::function(operation)]
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

#[turbo_tasks::function(operation)]
async fn has_value(set: OperationVc<Set>, key: String) -> Result<Vc<HasValueResult>> {
    let set = set.connect();
    let value = set.contains_key(&key).await?;
    let random = rand::random::<u32>();
    Ok(HasValueResult { value, random }.cell())
}
