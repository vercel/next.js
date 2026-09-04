#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::{collections::HashSet, mem::take, sync::Mutex};

use anyhow::Result;
use turbo_tasks::{Invalidator, ResolvedVc, TraitRef, Vc, get_invalidator, with_turbo_tasks};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn trait_ref() {
    let mut nonce = 0;
    run_once(&REGISTRATION, move || {
        nonce += 1;
        async move {
            #[turbo_tasks::function(operation, root)]
            fn create_counter_operation(nonce: u32) -> Vc<Counter> {
                let _ = nonce;
                Counter::cell(Counter {
                    value: Mutex::new((0, Default::default())),
                })
            }

            #[turbo_tasks::function(operation, root)]
            fn read_counter_operation(counter: ResolvedVc<Counter>) -> Vc<Counter> {
                *counter
            }

            #[turbo_tasks::function(operation, root)]
            fn counter_trait_operation(counter: ResolvedVc<Counter>) -> Vc<Box<dyn CounterTrait>> {
                Vc::upcast(*counter)
            }

            #[turbo_tasks::function(operation, root)]
            fn counter_value_trait_operation(
                counter: ResolvedVc<Counter>,
            ) -> Vc<Box<dyn CounterValueTrait>> {
                Vc::upcast(counter.get_value())
            }

            let counter = create_counter_operation(nonce)
                .resolve()
                .strongly_consistent()
                .await?;

            let counter_value = counter.get_value();

            assert_eq!(*counter.get_value().strongly_consistent().await?, 0);
            assert_eq!(*counter_value.strongly_consistent().await?, 0);

            read_counter_operation(counter)
                .read_strongly_consistent()
                .await?
                .incr();

            assert_eq!(*counter.get_value().strongly_consistent().await?, 1);
            assert_eq!(*counter_value.strongly_consistent().await?, 1);

            // `ref_counter` will still point to the same `counter` instance as `counter`.
            let trait_ref_counter = counter_trait_operation(counter)
                .read_trait_strongly_consistent()
                .await?;
            let ref_counter = TraitRef::cell(trait_ref_counter.clone());
            let ref_counter_value = ref_counter.get_value();

            // However, `local_counter_value` will point to the value of `counter_value`
            // at the time it was turned into a trait reference (just like a `ReadRef`
            // would).
            let local_counter_value = TraitRef::cell(
                counter_value_trait_operation(counter)
                    .read_trait_strongly_consistent()
                    .await?,
            )
            .get_value();

            read_counter_operation(counter)
                .read_strongly_consistent()
                .await?
                .incr();
            assert_eq!(trait_ref_counter.get_value_sync().0, 2);
            assert_eq!(*counter.get_value().strongly_consistent().await?, 2);
            assert_eq!(*counter_value.strongly_consistent().await?, 2);
            assert_eq!(*ref_counter_value.strongly_consistent().await?, 2);
            assert_eq!(*local_counter_value.strongly_consistent().await?, 1);

            anyhow::Ok(())
        }
    })
    .await
    .unwrap()
}

#[turbo_tasks::value(transparent)]
#[derive(Copy, Clone)]
struct CounterValue(usize);

#[turbo_tasks::value(serialization = "skip", evict = "never", cell = "new", eq = "manual")]
struct Counter {
    #[turbo_tasks(debug_ignore, trace_ignore)]
    value: Mutex<(usize, HashSet<Invalidator>)>,
}

impl Counter {
    fn incr(&self) {
        with_turbo_tasks(|tt| {
            let mut lock = self.value.lock().unwrap();
            lock.0 += 1;
            let invalidators = take(&mut lock.1);
            for i in invalidators {
                i.invalidate(&**tt);
            }
        });
    }
}

#[turbo_tasks::value_trait]
trait CounterTrait {
    #[turbo_tasks::function(root)]
    fn get_value(&self) -> Vc<CounterValue>;

    fn get_value_sync(&self) -> CounterValue;
}

#[turbo_tasks::value_impl]
impl CounterTrait for Counter {
    #[turbo_tasks::function(root)]
    fn get_value(&self) -> Result<Vc<CounterValue>> {
        let mut lock = self.value.lock().unwrap();
        lock.1.insert(get_invalidator().unwrap());
        Ok(Vc::cell(lock.0))
    }

    fn get_value_sync(&self) -> CounterValue {
        CounterValue(self.value.lock().unwrap().0)
    }
}

#[turbo_tasks::value_trait]
trait CounterValueTrait {
    #[turbo_tasks::function(root)]
    fn get_value(&self) -> Vc<CounterValue>;
}

#[turbo_tasks::value_impl]
impl CounterValueTrait for CounterValue {
    #[turbo_tasks::function(root)]
    fn get_value(self: Vc<Self>) -> Vc<Self> {
        self
    }
}
