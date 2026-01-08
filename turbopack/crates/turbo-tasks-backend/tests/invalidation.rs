#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use rustc_hash::FxHashMap;
use turbo_tasks::{OperationVc, ResolvedVc, State, Vc};
use turbo_tasks_testing::{Registration, register, run};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn invalidation() {
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

#[turbo_tasks::value(transparent)]
struct Step(State<u32>);

#[turbo_tasks::function]
fn create_state() -> Vc<Step> {
    Step(State::new(0)).cell()
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
