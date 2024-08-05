#![feature(arbitrary_self_types)]

use std::sync::{Arc, Mutex};

use indexmap::{IndexMap, IndexSet};
use turbo_tasks::{debug::ValueDebug, Invalidator, ReadRef, TaskId, Vc};
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn test_option_some() {
    run(&REGISTRATION, async move {
        let vc_42 = Vc::cell(42);
        let option: Vc<Option<Vc<u32>>> = Vc::cell(Some(vc_42));
        assert!(*option.is_some().await.unwrap());
        assert!(!(*option.is_none().await.unwrap()));
        assert_eq!(&*option.await.unwrap(), &Some(vc_42));
        assert_eq!(option.dbg().await.unwrap().to_string(), "Some(\n    42,\n)");
    })
    .await
}

#[tokio::test]
async fn test_option_none() {
    run(&REGISTRATION, async move {
        let option: Vc<Option<Vc<u32>>> = Default::default();
        assert!(!(*option.is_some().await.unwrap()));
        assert!(*option.is_none().await.unwrap());
        assert_eq!(&*option.await.unwrap(), &None);
        assert_eq!(option.dbg().await.unwrap().to_string(), "None");
    })
    .await
}

#[tokio::test]
async fn test_vec() {
    run(&REGISTRATION, async move {
        let vc_42 = Vc::cell(42);
        let vec: Vc<Vec<Vc<u32>>> = Vc::cell(vec![vc_42]);
        assert_eq!(*vec.len().await.unwrap(), 1);
        assert!(!(*vec.is_empty().await.unwrap()));
        assert_eq!(&*vec.await.unwrap(), &[vc_42]);
        assert_eq!(vec.dbg().await.unwrap().to_string(), "[\n    42,\n]");
    })
    .await
}

#[tokio::test]
async fn test_empty_vec() {
    run(&REGISTRATION, async move {
        let vec: Vc<Vec<Vc<u32>>> = Default::default();
        assert_eq!(*vec.len().await.unwrap(), 0);
        assert!(*vec.is_empty().await.unwrap());
        assert_eq!(vec.dbg().await.unwrap().to_string(), "[]");
    })
    .await
}

#[tokio::test]
async fn test_nested_empty_vec() {
    run(&REGISTRATION, async move {
        let vec: Vc<Vec<Vc<Vec<Vc<u32>>>>> = Default::default();
        assert_eq!(*vec.len().await.unwrap(), 0);
        assert_eq!(vec.dbg().await.unwrap().to_string(), "[]");
    })
    .await
}

#[tokio::test]
async fn test_index_set() {
    run(&REGISTRATION, async move {
        let vc_42 = Vc::cell(42);
        let set: Vc<IndexSet<Vc<u32>>> = Vc::cell(IndexSet::from([vc_42]));
        assert_eq!(*set.len().await.unwrap(), 1);
        assert!(!(*set.is_empty().await.unwrap()));
        assert_eq!(&*set.await.unwrap(), &IndexSet::from([vc_42]));
        assert_eq!(set.dbg().await.unwrap().to_string(), "{\n    42,\n}");
    })
    .await
}

#[tokio::test]
async fn test_empty_index_set() {
    run(&REGISTRATION, async move {
        let set: Vc<IndexSet<Vc<u32>>> = Default::default();
        assert_eq!(*set.len().await.unwrap(), 0);
        assert!(*set.is_empty().await.unwrap());
        assert_eq!(&*set.await.unwrap(), &IndexSet::<Vc<u32>>::default());
        assert_eq!(set.dbg().await.unwrap().to_string(), "{}");
    })
    .await
}

#[tokio::test]
async fn test_index_map() {
    run(&REGISTRATION, async move {
        let vc_42 = Vc::cell(42);
        let map: Vc<IndexMap<Vc<u32>, _>> = Vc::cell(IndexMap::from([(vc_42, vc_42)]));
        assert_eq!(*map.len().await.unwrap(), 1);
        assert!(!(*map.is_empty().await.unwrap()));
        assert_eq!(&*map.await.unwrap(), &IndexMap::from([(vc_42, vc_42)]));
        assert_eq!(map.dbg().await.unwrap().to_string(), "{\n    42: 42,\n}");
    })
    .await
}

#[tokio::test]
async fn test_empty_index_map() {
    run(&REGISTRATION, async move {
        let map: Vc<IndexMap<Vc<u32>, Vc<u32>>> = Default::default();
        assert_eq!(*map.len().await.unwrap(), 0);
        assert!(*map.is_empty().await.unwrap());
        assert_eq!(
            &*map.await.unwrap(),
            &IndexMap::<Vc<u32>, Vc<u32>>::default()
        );
        assert_eq!(map.dbg().await.unwrap().to_string(), "{}");
    })
    .await
}

// Simulate a non-deterministic function that stores different generic types in
// it's cells each time it runs.
#[tokio::test]
async fn test_changing_generic() {
    run(&REGISTRATION, async move {
        let state_vc = State::default().cell();
        let state_ref = state_vc.await.unwrap();
        for _i in 0..10 {
            let _ = non_deterministic(state_vc)
                .resolve_strongly_consistent()
                .await
                .unwrap();
            state_ref
                .inner
                .lock()
                .unwrap()
                .last_invalidator
                .take()
                .unwrap()
                .invalidate();
        }
    })
    .await
}

// Test that we can convert a `Vc` to a `ReadRef`, and then back to a `Vc`.
#[tokio::test]
async fn test_read_ref_round_trip() {
    run(&REGISTRATION, async move {
        let c: Vc<Option<Vc<u8>>> = Vc::cell(Some(Vc::cell(1)));
        let _ = ReadRef::cell(c.await.unwrap()).await.unwrap();
    })
    .await
}

#[turbo_tasks::value(eq = "manual")]
#[derive(Default)]
struct State {
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[serde(skip)]
    inner: Arc<Mutex<StateInner>>,
}

#[derive(Default)]
struct StateInner {
    branch: bool,
    last_invalidator: Option<Invalidator>,
    last_task_id: Option<TaskId>,
}

impl PartialEq for State {
    fn eq(&self, other: &Self) -> bool {
        std::ptr::eq(self as *const _, other as *const _)
    }
}

impl Eq for State {}

#[turbo_tasks::function]
async fn non_deterministic(state: Vc<State>) {
    let state = state.await.unwrap();
    let mut state_inner = state.inner.lock().unwrap();

    let task_id = if state_inner.branch {
        let c: Vc<Option<Vc<u8>>> = Vc::cell(Some(Vc::cell(1)));
        println!("u8 branch");
        Vc::into_raw(c).get_task_id()
    } else {
        let c: Vc<Option<Vc<u32>>> = Vc::cell(Some(Vc::cell(1)));
        println!("u32 branch");
        Vc::into_raw(c).get_task_id()
    };

    state_inner.branch = !state_inner.branch;
    if let Some(last_task_id) = state_inner.last_task_id {
        assert_eq!(last_task_id, task_id);
    }
    state_inner.last_task_id = Some(task_id);
    state_inner.last_invalidator = Some(turbo_tasks::get_invalidator());
}
