#![no_main]
#![feature(arbitrary_self_types_pointers)]

use anyhow::Result;
use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;
use serde::{Deserialize, Serialize};
use turbo_tasks::{self, NonLocalValue, TurboTasks, Vc, trace::TraceRawVcs};

#[derive(Arbitrary, Debug, PartialEq, Eq, NonLocalValue, Serialize, Deserialize, TraceRawVcs)]
struct TaskReferenceSpec {
    task: u16,
    read: bool,
    read_strongly_consistent: bool,
}

#[derive(Arbitrary, Debug, PartialEq, Eq, NonLocalValue, Serialize, Deserialize, TraceRawVcs)]
struct TaskSpec {
    references: Vec<TaskReferenceSpec>,
}

#[turbo_tasks::value(transparent)]
struct TasksSpec(Vec<TaskSpec>);

fuzz_target!(|data: Vec<TaskSpec>| {
    let mut data = data;
    let len = data.len();
    for (i, task) in data.iter_mut().enumerate() {
        for reference in task.references.iter_mut() {
            reference.task = (i + 1 + (reference.task as usize % (len - i))) as u16;
        }
    }
    data.push(TaskSpec { references: vec![] });
    register();
    let tt = TurboTasks::new(turbo_tasks_backend::TurboTasksBackend::new(
        turbo_tasks_backend::BackendOptions {
            storage_mode: None,
            ..Default::default()
        },
        turbo_tasks_backend::noop_backing_storage(),
    ));
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(async {
            tt.run_once(async move {
                let spec: Vc<TasksSpec> = Vc::cell(data);
                run_task(spec, 0).await?;
                Ok(())
            })
            .await
        })
        .unwrap();
});

#[turbo_tasks::function]
async fn run_task(spec: Vc<TasksSpec>, task: u16) -> Result<Vc<()>> {
    let spec_ref = spec.await?;
    let task = &spec_ref[task as usize];
    for reference in &task.references {
        let call = run_task(spec, reference.task);
        if reference.read {
            call.await?;
        }
        if reference.read_strongly_consistent {
            call.strongly_consistent().await?;
        }
    }
    Ok(Vc::cell(()))
}

pub fn register() {
    turbo_tasks::register();
    include!(concat!(env!("OUT_DIR"), "/register_fuzz_graph.rs"));
}
