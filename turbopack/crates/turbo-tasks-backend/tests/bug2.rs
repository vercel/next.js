#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::sync::Arc;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{NonLocalValue, State, TaskInput, Vc, trace::TraceRawVcs};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[derive(
    Clone, Debug, PartialEq, Eq, Hash, NonLocalValue, Serialize, Deserialize, TraceRawVcs, TaskInput,
)]
pub struct TaskReferenceSpec {
    task: u16,
    chain: u8,
    read: bool,
    read_strongly_consistent: bool,
}

#[derive(
    Clone, Debug, PartialEq, Eq, Hash, NonLocalValue, Serialize, Deserialize, TraceRawVcs, TaskInput,
)]
pub struct TaskSpec {
    references: Vec<TaskReferenceSpec>,
    children: u8,
    change: Option<Box<TaskSpec>>,
}

#[turbo_tasks::value(transparent)]
struct Iteration(State<usize>);

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn graph_bug() {
    run_once(&REGISTRATION, move || async move {
        let spec = vec![
            TaskSpec {
                references: vec![TaskReferenceSpec {
                    task: 1,
                    chain: 0,
                    read: false,
                    read_strongly_consistent: false,
                }],
                children: 0,
                change: Some(Box::new(TaskSpec {
                    references: vec![TaskReferenceSpec {
                        task: 1,
                        chain: 254,
                        read: false,
                        read_strongly_consistent: false,
                    }],
                    children: 0,
                    change: None,
                })),
            },
            TaskSpec {
                references: vec![],
                children: 0,
                change: None,
            },
        ];

        let it = create_iteration().resolve().await?;
        it.await?.set(0);
        println!("🚀 Initial");
        let task = run_task(Arc::new(spec), it, 0);
        task.strongly_consistent().await?;
        println!("🚀 Set iteration to 1");
        it.await?.set(1);
        task.strongly_consistent().await?;
        println!("🚀 Finished strongly consistent wait");

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::function]
fn create_iteration() -> Vc<Iteration> {
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
    println!("run_task_chain(from: {from}, ref_index: {ref_index}, to: {to}, chain: {chain})");
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
    println!("run_task(task_index: {task_index})");
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
    println!("run_task_child(from: {from}, i: {i})");
    let _ = from;
    let _ = i;
    Ok(Vc::cell(()))
}
