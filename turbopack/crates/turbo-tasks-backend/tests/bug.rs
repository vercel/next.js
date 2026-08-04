#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use bincode::{Decode, Encode};
use turbo_tasks::{NonLocalValue, Vc, read, trace::TraceRawVcs};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[derive(Debug, Clone, PartialEq, Eq, NonLocalValue, TraceRawVcs, Encode, Decode)]
struct TaskReferenceSpec {
    task: u16,
    read: bool,
    read_strongly_consistent: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, NonLocalValue, TraceRawVcs, Encode, Decode)]
struct TaskSpec {
    references: Vec<TaskReferenceSpec>,
}

#[turbo_tasks::value(transparent)]
struct TasksSpec(Vec<TaskSpec>);

#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_graph_bug() {
    let mut nonce = 0;
    run_once(&REGISTRATION, move || async move {
        // pass a nonce to re-run the test body on every turbo-tasks restart
        nonce += 1;
        test_graph_bug_operation(nonce)
            .read_strongly_consistent()
            .await
    })
    .await
    .unwrap()
}

#[turbo_tasks::function(operation, root)]
async fn test_graph_bug_operation(nonce: u32) -> Result<Vc<()>> {
    let _ = nonce; // ensure the nonce is part of our cache key

    // see https://github.com/vercel/next.js/pull/79451
    let spec = vec![
        TaskSpec {
            references: vec![
                TaskReferenceSpec {
                    task: 3,
                    read: false,
                    read_strongly_consistent: true,
                },
                TaskReferenceSpec {
                    task: 1,
                    read: true,
                    read_strongly_consistent: false,
                },
                TaskReferenceSpec {
                    task: 12,
                    read: false,
                    read_strongly_consistent: true,
                },
            ],
        },
        TaskSpec {
            references: vec![TaskReferenceSpec {
                task: 2,
                read: true,
                read_strongly_consistent: true,
            }],
        },
        TaskSpec {
            references: vec![TaskReferenceSpec {
                task: 4,
                read: false,
                read_strongly_consistent: false,
            }],
        },
        TaskSpec {
            references: vec![TaskReferenceSpec {
                task: 6,
                read: false,
                read_strongly_consistent: false,
            }],
        },
        TaskSpec {
            references: vec![
                TaskReferenceSpec {
                    task: 5,
                    read: false,
                    read_strongly_consistent: false,
                },
                TaskReferenceSpec {
                    task: 13,
                    read: false,
                    read_strongly_consistent: false,
                },
            ],
        },
        TaskSpec {
            references: vec![
                TaskReferenceSpec {
                    task: 11,
                    read: false,
                    read_strongly_consistent: true,
                },
                TaskReferenceSpec {
                    task: 14,
                    read: false,
                    read_strongly_consistent: false,
                },
                TaskReferenceSpec {
                    task: 7,
                    read: false,
                    read_strongly_consistent: false,
                },
                TaskReferenceSpec {
                    task: 8,
                    read: false,
                    read_strongly_consistent: false,
                },
            ],
        },
        TaskSpec {
            references: vec![TaskReferenceSpec {
                task: 9,
                read: false,
                read_strongly_consistent: false,
            }],
        },
        TaskSpec { references: vec![] },
        TaskSpec {
            references: vec![
                TaskReferenceSpec {
                    task: 12,
                    read: false,
                    read_strongly_consistent: false,
                },
                TaskReferenceSpec {
                    task: 11,
                    read: false,
                    read_strongly_consistent: false,
                },
            ],
        },
        TaskSpec {
            references: vec![TaskReferenceSpec {
                task: 10,
                read: false,
                read_strongly_consistent: false,
            }],
        },
        TaskSpec {
            references: vec![TaskReferenceSpec {
                task: 12,
                read: false,
                read_strongly_consistent: false,
            }],
        },
        TaskSpec { references: vec![] },
        TaskSpec {
            references: vec![TaskReferenceSpec {
                task: 14,
                read: false,
                read_strongly_consistent: false,
            }],
        },
        TaskSpec { references: vec![] },
        TaskSpec {
            references: vec![
                TaskReferenceSpec {
                    task: 16,
                    read: false,
                    read_strongly_consistent: true,
                },
                TaskReferenceSpec {
                    task: 15,
                    read: false,
                    read_strongly_consistent: true,
                },
            ],
        },
        TaskSpec { references: vec![] },
        TaskSpec { references: vec![] },
    ];
    let spec: Vc<TasksSpec> = Vc::cell(spec);
    read!(run_task(spec, 0))?;

    Ok(Vc::cell(()))
}

#[turbo_tasks::function(root)]
async fn run_task(spec: Vc<TasksSpec>, task: u16) -> Result<Vc<()>> {
    let spec_ref = read!(spec)?;
    let task = &spec_ref[task as usize];
    for reference in &task.references {
        let call = run_task(spec, reference.task);
        if reference.read {
            read!(call)?;
        }
        if reference.read_strongly_consistent {
            read!(call.strongly_consistent())?;
        }
    }
    Ok(Vc::cell(()))
}
