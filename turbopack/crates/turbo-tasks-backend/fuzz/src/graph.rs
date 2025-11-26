use std::sync::Arc;

use anyhow::Result;
use arbitrary::Arbitrary;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use turbo_tasks::{self, NonLocalValue, State, TaskInput, TurboTasks, Vc, trace::TraceRawVcs};
use turbo_tasks_malloc::TurboMalloc;

#[derive(
    Arbitrary,
    Clone,
    Debug,
    PartialEq,
    Eq,
    Hash,
    NonLocalValue,
    Serialize,
    Deserialize,
    TraceRawVcs,
    TaskInput,
)]
pub struct TaskReferenceSpec {
    task: u16,
    chain: u8,
    read: bool,
    read_strongly_consistent: bool,
}

#[derive(
    Arbitrary,
    Clone,
    Debug,
    PartialEq,
    Eq,
    Hash,
    NonLocalValue,
    Serialize,
    Deserialize,
    TraceRawVcs,
    TaskInput,
)]
pub struct TaskSpec {
    references: Vec<TaskReferenceSpec>,
    children: u8,
    change: Option<Box<TaskSpec>>,
}

impl TaskSpec {
    fn iter(&self) -> impl Iterator<Item = &TaskSpec> {
        Iter::new(self)
    }
}

struct Iter<'a> {
    current: Option<&'a TaskSpec>,
}

impl<'a> Iter<'a> {
    fn new(task: &'a TaskSpec) -> Self {
        Self {
            current: Some(task),
        }
    }
}

impl<'a> Iterator for Iter<'a> {
    type Item = &'a TaskSpec;

    fn next(&mut self) -> Option<Self::Item> {
        if let Some(current) = self.current {
            if let Some(change) = &current.change {
                self.current = Some(change);
            } else {
                self.current = None;
            }
            Some(current)
        } else {
            None
        }
    }
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
    let len = data.len();
    if len == 0 {
        return;
    }
    let mut max_count = 1;
    for (i, task) in data.iter().enumerate() {
        let mut count = 0;
        for task in task.iter() {
            count += 1;
            for reference in task.references.iter() {
                let task = reference.task as usize;
                if task <= i {
                    return;
                }
                if task >= len {
                    return;
                }
            }
        }
        max_count = max_count.max(count);
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
    actual_operation(Arc::new(data), max_count);
}

#[turbo_tasks::value(transparent)]
struct Iteration(State<usize>);

fn actual_operation(spec: Arc<Vec<TaskSpec>>, iterations: usize) {
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
            for i in 0..iterations {
                let spec = spec.clone();
                tt.run(async move {
                    let it = create_state().resolve().await?;
                    it.await?.set(i);
                    let task = run_task(spec.clone(), it, 0);
                    task.strongly_consistent().await?;
                    Ok(())
                })
                .await?;
            }
            tt.stop_and_wait().await;
            drop(tt);
            anyhow::Ok(())
        })
        .unwrap();
}

#[turbo_tasks::function]
fn create_state() -> Vc<Iteration> {
    Vc::cell(State::new(0))
}

#[turbo_tasks::function]
async fn run_task_chain(
    spec: Arc<Vec<TaskSpec>>,
    iteration: Vc<Iteration>,
    from: u16,
    ref_index: usize,
    to: u16,
    chain: u8,
) -> Result<Vc<()>> {
    if chain > 0 {
        run_task_chain(spec, iteration, from, ref_index, to, chain - 1).await?;
    } else {
        run_task(spec, iteration, to).await?;
    }
    Ok(Vc::cell(()))
}

#[turbo_tasks::function]
async fn run_task(
    spec: Arc<Vec<TaskSpec>>,
    iteration: Vc<Iteration>,
    task_index: u16,
) -> Result<Vc<()>> {
    let mut task = &spec[task_index as usize];
    if task.change.is_some() {
        let iteration = iteration.await?;
        let it = *iteration.get();
        for _ in 0..it {
            task = if let Some(change) = &task.change {
                change
            } else {
                task
            };
        }
    }
    for i in 0..task.children {
        run_task_child(task_index, i).await?;
    }
    for (i, reference) in task.references.iter().enumerate() {
        let call = if reference.chain > 0 {
            run_task_chain(
                spec.clone(),
                iteration,
                task_index,
                i,
                reference.task,
                reference.chain,
            )
        } else {
            run_task(spec.clone(), iteration, reference.task)
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
