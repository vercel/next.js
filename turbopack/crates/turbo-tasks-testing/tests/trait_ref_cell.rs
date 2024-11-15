#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::sync::Mutex;

use anyhow::Result;
use turbo_tasks::{get_invalidator, IntoTraitRef, Invalidator, TraitRef, Vc};
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn trait_ref() {
    run(&REGISTRATION, || async {
        let counter = Counter::cell(Counter {
            value: Mutex::new((0, None)),
        });

        let counter_value = counter.get_value();

        assert_eq!(*counter.get_value().strongly_consistent().await?, 0);
        assert_eq!(*counter_value.strongly_consistent().await?, 0);

        counter.await?.incr();

        assert_eq!(*counter.get_value().strongly_consistent().await?, 1);
        assert_eq!(*counter_value.strongly_consistent().await?, 1);

        // `ref_counter` will still point to the same `counter` instance as `counter`.
        let ref_counter = TraitRef::cell(
            Vc::upcast::<Box<dyn CounterTrait>>(counter)
                .into_trait_ref()
                .await?,
        );
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
struct CounterValue(usize);

#[turbo_tasks::value(serialization = "none", cell = "new", eq = "manual")]
struct Counter {
    #[turbo_tasks(debug_ignore, trace_ignore)]
    value: Mutex<(usize, Option<Invalidator>)>,
}

impl Counter {
    fn incr(&self) {
        let mut lock = self.value.lock().unwrap();
        lock.0 += 1;
        if let Some(i) = lock.1.take() {
            i.invalidate();
        }
    }
}

#[turbo_tasks::value_trait]
trait CounterTrait {
    fn get_value(&self) -> Vc<CounterValue>;
}

#[turbo_tasks::value_impl]
impl CounterTrait for Counter {
    #[turbo_tasks::function]
    async fn get_value(&self) -> Result<Vc<CounterValue>> {
        let mut lock = self.value.lock().unwrap();
        lock.1 = Some(get_invalidator());
        Ok(Vc::cell(lock.0))
    }
}

#[turbo_tasks::value_trait]
trait CounterValueTrait {
    fn get_value(&self) -> Vc<CounterValue>;
}

#[turbo_tasks::value_impl]
impl CounterValueTrait for CounterValue {
    #[turbo_tasks::function]
    fn get_value(self: Vc<Self>) -> Vc<Self> {
        self
    }
}
