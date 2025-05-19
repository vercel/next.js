#![no_main]
#![feature(arbitrary_self_types_pointers)]

use anyhow::Result;
use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;
use serde::{Deserialize, Serialize};
use turbo_tasks::{self, NonLocalValue, TurboTasks, Vc, trace::TraceRawVcs};
use turbo_tasks_malloc::TurboMalloc;

#[derive(
    Arbitrary, Clone, Debug, PartialEq, Eq, NonLocalValue, Serialize, Deserialize, TraceRawVcs,
)]
struct TaskReferenceSpec {
    task: u16,
    read: bool,
    read_strongly_consistent: bool,
}

#[derive(
    Arbitrary, Clone, Debug, PartialEq, Eq, NonLocalValue, Serialize, Deserialize, TraceRawVcs,
)]
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
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .worker_threads(1)
        .on_thread_stop(|| {
            TurboMalloc::thread_stop();
        })
        .build()
        .unwrap();
    runtime
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

#[allow(dead_code, reason = "used to minimize the graph when crash found")]
fn optimize(spec: Vec<TaskSpec>) -> Vec<TaskSpec> {
    let mut referenced = vec![false; spec.len()];
    for task in &spec {
        for reference in &task.references {
            referenced[reference.task as usize] = true;
        }
    }
    let mut new_index = vec![usize::MAX; spec.len()];
    let mut index = 0;
    for i in 0..spec.len() {
        if referenced[i] {
            new_index[i] = index;
            index += 1;
        }
    }
    let mut new_spec = vec![];
    for (i, task) in spec.iter().enumerate() {
        if referenced[i] {
            let mut new_task = task.clone();
            for reference in &mut new_task.references {
                reference.task = new_index[reference.task as usize] as u16;
            }
            new_spec.push(new_task);
        }
    }
    new_spec
}
