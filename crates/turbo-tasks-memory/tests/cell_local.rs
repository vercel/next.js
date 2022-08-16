#![feature(min_specialization)]

use std::sync::Mutex;

use anyhow::Result;
use turbo_tasks::{get_invalidator, Invalidator};
use turbo_tasks_testing::{register, run};

register!();

#[tokio::test]
async fn cell_local() {
    run! {
        let counter = CounterVc::cell(Counter { value: Mutex::new((0, None))});
        let counter_value = counter.get_value();

        assert_eq!(*counter.get_value().strongly_consistent().await?, 0);
        assert_eq!(*counter_value.strongly_consistent().await?, 0);
        counter.await?.incr();

        assert_eq!(*counter.get_value().strongly_consistent().await?, 1);
        assert_eq!(*counter_value.strongly_consistent().await?, 1);
        let local_counter_value = counter_value.cell_local().await?;
        counter.await?.incr();

        assert_eq!(*counter.get_value().strongly_consistent().await?, 2);
        assert_eq!(*counter_value.strongly_consistent().await?, 2);
        assert_eq!(*local_counter_value.strongly_consistent().await?, 1);
    }
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

#[turbo_tasks::value_impl]
impl CounterVc {
    #[turbo_tasks::function]
    pub async fn get_value(self) -> Result<CounterValueVc> {
        let this = self.await?;
        let mut lock = this.value.lock().unwrap();
        lock.1 = Some(get_invalidator());
        Ok(CounterValueVc::cell(lock.0))
    }
}
