use anyhow::Result;
use arbitrary::Arbitrary;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use turbo_tasks::{self, NonLocalValue, TurboTasks, Vc, trace::TraceRawVcs};
use turbo_tasks_malloc::TurboMalloc;

#[derive(
    Arbitrary, Clone, Debug, PartialEq, Eq, NonLocalValue, Serialize, Deserialize, TraceRawVcs,
)]
pub struct TaskReferenceSpec {
    task: u16,
    chain: u8,
    read: bool,
    read_strongly_consistent: bool,
}

#[derive(
    Arbitrary, Clone, Debug, PartialEq, Eq, NonLocalValue, Serialize, Deserialize, TraceRawVcs,
)]
pub struct TaskSpec {
    references: Vec<TaskReferenceSpec>,
    children: u8,
}

static RUNTIME: Lazy<tokio::runtime::Runtime> = Lazy::new(|| {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .on_thread_stop(|| {
            TurboMalloc::thread_stop();
        })
        .build()
        .unwrap()
});

pub fn init() {
    let _ = &*RUNTIME;
}

pub fn run(data: Vec<TaskSpec>) {
    let mut data = data;
    let len = data.len();
    if len == 0 {
        return;
    }
    for (i, task) in data.iter_mut().enumerate() {
        for reference in task.references.iter_mut() {
            let task = reference.task as usize;
            if task <= i {
                return;
            }
            if task >= len {
                return;
            }
        }
    }
    let mut referenced = vec![false; data.len()];
    for task in &data {
        for reference in &task.references {
            referenced[reference.task as usize] = true;
        }
    }
    if !referenced.iter().skip(1).all(|&x| x) {
        return;
    }
    actual_operation(data);
}

fn actual_operation(data: Vec<TaskSpec>) {
    let tt = TurboTasks::new(turbo_tasks_backend::TurboTasksBackend::new(
        turbo_tasks_backend::BackendOptions {
            storage_mode: None,
            small_preallocation: true,
            ..Default::default()
        },
        turbo_tasks_backend::noop_backing_storage(),
    ));
    RUNTIME
        .block_on(async {
            tt.run_once(async move {
                let spec: Vc<TasksSpec> = Vc::cell(data);
                run_task(spec, 0).strongly_consistent().await?;
                Ok(())
            })
            .await
        })
        .unwrap();
}

#[turbo_tasks::value(transparent)]
struct TasksSpec(Vec<TaskSpec>);

#[turbo_tasks::function]
async fn run_task_chain(
    spec: Vc<TasksSpec>,
    from: u16,
    ref_index: usize,
    to: u16,
    chain: u8,
) -> Result<Vc<()>> {
    if chain > 0 {
        run_task_chain(spec, from, ref_index, to, chain - 1).await?;
    } else {
        run_task(spec, to).await?;
    }
    Ok(Vc::cell(()))
}

#[turbo_tasks::function]
async fn run_task(spec: Vc<TasksSpec>, task_index: u16) -> Result<Vc<()>> {
    let spec_ref = spec.await?;
    let task = &spec_ref[task_index as usize];
    for i in 0..task.children {
        run_task_child(task_index, i).await?;
    }
    for (i, reference) in task.references.iter().enumerate() {
        let call = if reference.chain > 0 {
            run_task_chain(spec, task_index, i, reference.task, reference.chain)
        } else {
            run_task(spec, reference.task)
        };
        if reference.read {
            call.await?;
        }
        if reference.read_strongly_consistent {
            call.strongly_consistent().await?;
        }
    }
    Ok(Vc::cell(()))
}

#[turbo_tasks::function]
async fn run_task_child(from: u16, i: u8) -> Result<Vc<()>> {
    let _ = from;
    let _ = i;
    Ok(Vc::cell(()))
}

/// This removes all unused tasks and remaps references to have a continuous range.
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
