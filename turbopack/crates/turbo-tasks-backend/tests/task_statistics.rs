#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::future::IntoFuture;

use anyhow::Result;
use serde_json::json;
use turbo_tasks::Vc;
use turbo_tasks_testing::{Registration, register, run_without_cache_check};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_simple_task() -> Result<()> {
    run_without_cache_check(&REGISTRATION, async move {
        enable_stats();
        for i in 0..10 {
            double(i).await.unwrap();
            // use cached results
            double(i).await.unwrap();
        }
        for i in 0..5 {
            double(i).await.unwrap();
        }
        assert_eq!(
            stats_json(),
            json!({
                "task_statistics::double": {
                    "cache_miss": 10,
                    "cache_hit": 15,
                },
            })
        );
        Ok(())
    })
    .await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_await_same_vc_multiple_times() -> Result<()> {
    run_without_cache_check(&REGISTRATION, async move {
        enable_stats();
        let dvc = double(0);
        // this is awaited multiple times, but only resolved once
        tokio::try_join!(dvc.into_future(), dvc.into_future()).unwrap();
        dvc.await.unwrap();
        assert_eq!(
            stats_json(),
            json!({
                "task_statistics::double": {
                    "cache_miss": 1,
                    "cache_hit": 0,
                },
            })
        );
        Ok(())
    })
    .await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_vc_receiving_task() -> Result<()> {
    run_without_cache_check(&REGISTRATION, async move {
        enable_stats();
        for i in 0..10 {
            let dvc = double(i);
            double_vc(dvc).await.unwrap();
            // use cached results
            double_vc(dvc).await.unwrap();
        }
        for i in 0..5 {
            let dvc = double(i);
            double_vc(dvc).await.unwrap();
        }
        assert_eq!(
            stats_json(),
            json!({
                "task_statistics::double": {
                    "cache_miss": 10,
                    "cache_hit": 5,
                },
                "task_statistics::double_vc": {
                    "cache_miss": 10,
                    "cache_hit": 15,
                },
            })
        );
        Ok(())
    })
    .await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_trait_methods() -> Result<()> {
    run_without_cache_check(&REGISTRATION, async move {
        enable_stats();
        for i in 0..10 {
            let wvc = wrap(i);
            tokio::try_join!(wvc.double().into_future(), wvc.double().into_future()).unwrap();
            tokio::try_join!(wvc.double_vc().into_future(), wvc.double_vc().into_future()).unwrap();
        }
        // use cached results
        for i in 0..5 {
            let wvc = wrap(i);
            wvc.double().await.unwrap();
            wvc.double_vc().await.unwrap();
        }
        assert_eq!(
            stats_json(),
            json!({
                "task_statistics::wrap": {
                    "cache_miss": 10,
                    "cache_hit": 5,
                },
                "<task_statistics::WrappedU64 as dyn task_statistics::Doublable>::double": {
                    "cache_miss": 10,
                    "cache_hit": 15,
                },
                "<task_statistics::WrappedU64 as dyn task_statistics::Doublable>::double_vc": {
                    "cache_miss": 10,
                    "cache_hit": 15,
                },
            })
        );
        Ok(())
    })
    .await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_dyn_trait_methods() -> Result<()> {
    run_without_cache_check(&REGISTRATION, async move {
        enable_stats();
        for i in 0..10 {
            let wvc: Vc<Box<dyn Doublable>> = Vc::upcast(wrap(i));
            let _ = tokio::try_join!(wvc.double().resolve(), wvc.double().resolve()).unwrap();
            let _ = tokio::try_join!(wvc.double_vc().resolve(), wvc.double_vc().resolve()).unwrap();
        }
        // use cached results
        for i in 0..5 {
            let wvc: Vc<Box<dyn Doublable>> = Vc::upcast(wrap(i));
            let _ = wvc.double().resolve().await.unwrap();
            let _ = wvc.double_vc().resolve().await.unwrap();
        }
        // use cached results without dynamic dispatch
        for i in 0..2 {
            let wvc = wrap(i);
            let _ = wvc.double().await.unwrap();
            let _ = wvc.double_vc().await.unwrap();
        }
        assert_eq!(
            stats_json(),
            json!({
                "task_statistics::wrap": {
                    "cache_miss": 10,
                    "cache_hit": 7,
                },
                "<task_statistics::WrappedU64 as dyn task_statistics::Doublable>::double": {
                    "cache_miss": 10,
                    "cache_hit": 17,
                },
                "<task_statistics::WrappedU64 as dyn task_statistics::Doublable>::double_vc": {
                    "cache_miss": 10,
                    "cache_hit": 17,
                },
            })
        );
        Ok(())
    })
    .await
}

// creates Vcs, but doesn't ever execute them
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_no_execution() -> Result<()> {
    run_without_cache_check(&REGISTRATION, async move {
        enable_stats();
        wrap_vc(double_vc(double(123)))
            .double()
            .double_vc()
            .as_side_effect()
            .await?;
        assert_eq!(
            stats_json(),
            json!({
                "<task_statistics::WrappedU64 as dyn task_statistics::Doublable>::double": {
                    "cache_hit": 0,
                    "cache_miss": 1
                },
                "<task_statistics::WrappedU64 as dyn task_statistics::Doublable>::double_vc":  {
                    "cache_hit": 0,
                    "cache_miss": 1
                },
                "task_statistics::double":  {
                    "cache_hit": 0,
                    "cache_miss": 1
                },
                "task_statistics::double_vc":  {
                    "cache_hit": 0,
                    "cache_miss": 1
                },
                "task_statistics::wrap_vc": {
                    "cache_hit": 0,
                    "cache_miss": 1
                },
            })
        );
        Ok(())
    })
    .await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_inline_definitions() -> Result<()> {
    run_without_cache_check(&REGISTRATION, async move {
        enable_stats();
        inline_definitions().await?;
        assert_eq!(
            stats_json(),
            json!({
                "<dyn task_statistics::inline_definitions_turbo_tasks_function_inline::Trait>::trait_fn": {
                    "cache_hit": 0,
                    "cache_miss": 1
                },
                "task_statistics::inline_definitions": {
                    "cache_hit": 0,
                    "cache_miss": 1
                },
                "task_statistics::inline_definitions_turbo_tasks_function_inline::Value::value_fn": {
                    "cache_hit": 0,
                    "cache_miss": 1
                },
                "task_statistics::inline_definitions_turbo_tasks_function_inline::inline_fn": {
                    "cache_hit": 0,
                    "cache_miss": 1
                },
                "task_statistics::inline_definitions_turbo_tasks_function_inline::{{closure}}::inline_fn_in_closure": {
                    "cache_hit": 0,
                    "cache_miss": 1
                }
            }),
        );
        Ok(())
    })
    .await
}

// Internally, this function uses `PersistentTaskType`.
#[turbo_tasks::function]
fn double(val: u64) -> Vc<u64> {
    Vc::cell(val * 2)
}

// Internally, this function uses `LocalTaskType::ResolveNative`.
#[turbo_tasks::function]
async fn double_vc(val: Vc<u64>) -> Result<Vc<u64>> {
    let val = *val.await?;
    Ok(Vc::cell(val * 2))
}

#[turbo_tasks::value]
struct WrappedU64(u64);

#[turbo_tasks::function]
fn wrap(val: u64) -> Vc<WrappedU64> {
    WrappedU64(val).cell()
}

#[turbo_tasks::function]
async fn wrap_vc(val: Vc<u64>) -> Result<Vc<WrappedU64>> {
    Ok(WrappedU64(*val.await?).cell())
}

#[turbo_tasks::value_trait]
pub trait Doublable {
    #[turbo_tasks::function]
    fn double(&self) -> Vc<Self>;
    #[turbo_tasks::function]
    fn double_vc(self: Vc<Self>) -> Vc<Self>;
}

#[turbo_tasks::value_impl]
impl Doublable for WrappedU64 {
    #[turbo_tasks::function]
    fn double(&self) -> Vc<Self> {
        WrappedU64(self.0 * 2).cell()
    }

    #[turbo_tasks::function]
    fn double_vc(&self) -> Result<Vc<Self>> {
        let val = self.0;
        Ok(WrappedU64(val * 2).cell())
    }
}

#[turbo_tasks::function]
fn fail(val: u64) -> Result<Vc<()>> {
    anyhow::bail!("failed using {val}");
}

fn enable_stats() {
    let tt = turbo_tasks::turbo_tasks();
    tt.task_statistics().enable();
}

fn stats_json() -> serde_json::Value {
    let tt = turbo_tasks::turbo_tasks();
    make_stats_deterministic(serde_json::to_value(tt.task_statistics().get()).unwrap())
}

// Global task identifiers can contain the crate name, remove it to simplify test assertions
fn make_stats_deterministic(mut json: serde_json::Value) -> serde_json::Value {
    match &mut json {
        serde_json::Value::Object(map) => {
            let old_map = std::mem::take(map);
            for (k, v) in old_map {
                // Replace `duration` with a fixed value to simplify test assertions
                let mut v = v.clone();
                let object = v.as_object_mut().unwrap();
                // These are only populated after the task has finalized execution so it racy to
                // assert on it.
                object.remove("duration");
                object.remove("executions");
                map.insert(k, v);
            }
        }
        _ => unreachable!("expected object"),
    };
    json
}

#[turbo_tasks::function]
fn inline_definitions() -> Result<Vc<()>> {
    #[turbo_tasks::function]
    fn inline_fn() -> Vc<()> {
        Vc::cell(())
    }
    let _ = inline_fn();

    let closure = || {
        #[turbo_tasks::function]
        fn inline_fn_in_closure() -> Vc<()> {
            Vc::cell(())
        }
        let _ = inline_fn_in_closure();
    };
    closure();

    #[turbo_tasks::value]
    struct Value;

    #[turbo_tasks::value_impl]
    impl Value {
        #[turbo_tasks::function]
        fn value_fn(&self) -> Vc<()> {
            Vc::cell(())
        }
    }
    let _ = Value.cell().value_fn();

    #[turbo_tasks::value_trait]
    trait Trait {
        #[turbo_tasks::function]
        fn trait_fn(&self) -> Vc<()> {
            Vc::cell(())
        }
    }

    #[turbo_tasks::value_impl]
    impl Trait for Value {}
    let _ = Value.cell().trait_fn();

    Ok(Vc::cell(()))
}
