#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::{
    future::{Future, IntoFuture},
    sync::Arc,
};

use anyhow::Result;
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::json;
use turbo_tasks::{TurboTasks, Vc};
use turbo_tasks_memory::MemoryBackend;
use turbo_tasks_testing::{register, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn test_simple_task() {
    run_with_tt(|tt| async move {
        for i in 0..10 {
            double(i).await.unwrap();
            // use cached results
            double(i).await.unwrap();
        }
        for i in 0..5 {
            double(i).await.unwrap();
        }
        assert_eq!(
            stats_json(&tt),
            json!({
                "turbo-tasks-memory::::double": {
                    "cache_miss": 10,
                    "cache_hit": 15,
                },
            })
        );
    })
    .await;
}

#[tokio::test]
async fn test_await_same_vc_multiple_times() {
    run_with_tt(|tt| async move {
        let dvc = double(0);
        // this is awaited multiple times, but only resolved once
        tokio::try_join!(dvc.into_future(), dvc.into_future()).unwrap();
        dvc.await.unwrap();
        assert_eq!(
            stats_json(&tt),
            json!({
                "turbo-tasks-memory::::double": {
                    "cache_miss": 1,
                    "cache_hit": 0,
                },
            })
        );
    })
    .await;
}

#[tokio::test]
async fn test_vc_receiving_task() {
    run_with_tt(|tt| async move {
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
            stats_json(&tt),
            json!({
                "turbo-tasks-memory::::double": {
                    "cache_miss": 10,
                    "cache_hit": 5,
                },
                "turbo-tasks-memory::::double_vc": {
                    "cache_miss": 10,
                    "cache_hit": 15,
                },
            })
        );
    })
    .await;
}

#[tokio::test]
async fn test_trait_methods() {
    run_with_tt(|tt| async move {
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
            stats_json(&tt),
            json!({
                "turbo-tasks-memory::::wrap": {
                    "cache_miss": 10,
                    "cache_hit": 5,
                },
                "turbo-tasks-memory::::WrappedU64::Doublable::double": {
                    "cache_miss": 10,
                    "cache_hit": 15,
                },
                "turbo-tasks-memory::::WrappedU64::Doublable::double_vc": {
                    "cache_miss": 10,
                    "cache_hit": 15,
                },
            })
        );
    })
    .await;
}

#[tokio::test]
async fn test_dyn_trait_methods() {
    run_with_tt(|tt| async move {
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
            stats_json(&tt),
            json!({
                "turbo-tasks-memory::::wrap": {
                    "cache_miss": 10,
                    "cache_hit": 7,
                },
                "turbo-tasks-memory::::WrappedU64::Doublable::double": {
                    "cache_miss": 10,
                    "cache_hit": 17,
                },
                "turbo-tasks-memory::::WrappedU64::Doublable::double_vc": {
                    "cache_miss": 10,
                    "cache_hit": 17,
                },
            })
        );
    })
    .await;
}

// creates Vcs, but doesn't ever execute them
#[tokio::test]
async fn test_no_execution() {
    run_with_tt(|tt| async move {
        // don't await this!
        let _ = wrap_vc(double_vc(double(123))).double().double_vc();
        assert_eq!(
            stats_json(&tt),
            json!({
                "turbo-tasks-memory::::double": {
                    "cache_miss": 1,
                    "cache_hit": 0,
                },
            })
        );
    })
    .await;
}

// Internally, this function uses `CachedTaskType::Native`.
#[turbo_tasks::function]
fn double(val: u64) -> Vc<u64> {
    Vc::cell(val * 2)
}

// Internally, this function uses `CachedTaskType::ResolveNative`.
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
    fn double(&self) -> Vc<Self>;
    fn double_vc(self: Vc<Self>) -> Vc<Self>;
}

#[turbo_tasks::value_impl]
impl Doublable for WrappedU64 {
    #[turbo_tasks::function]
    fn double(&self) -> Vc<Self> {
        WrappedU64(self.0 * 2).cell()
    }

    #[turbo_tasks::function]
    async fn double_vc(&self) -> Result<Vc<Self>> {
        let val = self.0;
        Ok(WrappedU64(val * 2).cell())
    }
}

#[turbo_tasks::function]
async fn fail(val: u64) -> Result<Vc<()>> {
    anyhow::bail!("failed using {val}");
}

async fn run_with_tt<Fut>(func: impl FnOnce(Arc<TurboTasks<MemoryBackend>>) -> Fut)
where
    Fut: Future<Output = ()> + Send + 'static,
{
    REGISTRATION.ensure_registered();
    let tt = TurboTasks::new(MemoryBackend::default());
    tt.backend().task_statistics().enable();
    let fut = func(Arc::clone(&tt));
    tt.run_once(async move {
        fut.await;
        Ok(())
    })
    .await
    .unwrap();
}

fn stats_json(tt: &TurboTasks<MemoryBackend>) -> serde_json::Value {
    remove_hashes(serde_json::to_value(tt.backend().task_statistics().get()).unwrap())
}

// Global task identifiers can contain a hash of the crate and dependencies.
// Remove that so that we can compare against a stable value in tests.
fn remove_hashes(mut json: serde_json::Value) -> serde_json::Value {
    static HASH_RE: Lazy<Regex> = Lazy::new(|| Regex::new("@[^:]+").unwrap());
    match &mut json {
        serde_json::Value::Object(map) => {
            let old_map = std::mem::take(map);
            for (k, v) in old_map {
                map.insert(HASH_RE.replace(&k, "").into_owned(), v);
            }
        }
        _ => unreachable!("expected object"),
    };
    json
}
