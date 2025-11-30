#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::{collections::HashSet, mem::take, sync::Mutex};

use anyhow::Result;
use turbo_tasks::{IntoTraitRef, Invalidator, TraitRef, Vc, get_invalidator};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn trait_ref() {
    run_once(&REGISTRATION, || async {
        let counter = Counter::cell(Counter {
            value: Mutex::new((0, Default::default())),
        });

        let counter_value = counter.get_value();

        assert_eq!(*counter.get_value().strongly_consistent().await?, 0);
        assert_eq!(*counter_value.strongly_consistent().await?, 0);

        counter.await?.incr();

        assert_eq!(*counter.get_value().strongly_consistent().await?, 1);
        assert_eq!(*counter_value.strongly_consistent().await?, 1);

        // `ref_counter` will still point to the same `counter` instance as `counter`.
        let trait_ref_counter = Vc::upcast::<Box<dyn CounterTrait>>(counter)
            .into_trait_ref()
            .await?;
        let ref_counter = TraitRef::cell(trait_ref_counter.clone());
        let ref_counter_value = ref_counter.get_value();

        // However, `local_counter_value` will point to the value of `counter_value`
        // at the time it was turned into a trait reference (just like a `ReadRef`
        // would).
        let local_counter_value = TraitRef::cell(
            Vc::upcast::<Box<dyn CounterValueTrait>>(counter_value)
                .into_trait_ref()
                .await?,
        )
        .get_value();

        counter.await?.incr();
        assert_eq!(trait_ref_counter.get_value_sync().0, 2);
        assert_eq!(*counter.get_value().strongly_consistent().await?, 2);
        assert_eq!(*counter_value.strongly_consistent().await?, 2);
        assert_eq!(*ref_counter_value.strongly_consistent().await?, 2);
        assert_eq!(*local_counter_value.strongly_consistent().await?, 1);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value(transparent)]
#[derive(Copy, Clone)]
struct CounterValue(usize);

#[turbo_tasks::value(serialization = "none", cell = "new", eq = "manual")]
struct Counter {
    #[turbo_tasks(debug_ignore, trace_ignore)]
    value: Mutex<(usize, HashSet<Invalidator>)>,
}

impl Counter {
    fn incr(&self) {
        let mut lock = self.value.lock().unwrap();
        lock.0 += 1;
        for i in take(&mut lock.1) {
            i.invalidate();
        }
    }
}

#[turbo_tasks::value_trait]
trait CounterTrait {
    #[turbo_tasks::function]
    fn get_value(&self) -> Vc<CounterValue>;

    fn get_value_sync(&self) -> CounterValue;
}

#[turbo_tasks::value_impl]
impl CounterTrait for Counter {
    #[turbo_tasks::function]
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
    #[turbo_tasks::function]
    fn get_value(&self) -> Vc<CounterValue>;
}

#[turbo_tasks::value_impl]
impl CounterValueTrait for CounterValue {
    #[turbo_tasks::function]
    fn get_value(self: Vc<Self>) -> Vc<Self> {
        self
    }
}
