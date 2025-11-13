#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{NonLocalValue, Vc, trace::TraceRawVcs};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[derive(Debug, Clone, PartialEq, Eq, NonLocalValue, Serialize, Deserialize, TraceRawVcs)]
struct TaskReferenceSpec {
    task: u16,
    read: bool,
    read_strongly_consistent: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, NonLocalValue, Serialize, Deserialize, TraceRawVcs)]
struct TaskSpec {
    references: Vec<TaskReferenceSpec>,
}

#[turbo_tasks::value(transparent)]
struct TasksSpec(Vec<TaskSpec>);

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn graph_bug() {
    // see https://github.com/vercel/next.js/pull/79451
    run_once(&REGISTRATION, || async {
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
        run_task(spec, 0).await?;

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

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
