#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Reading already computed task outputs from a new root operation, or calling already computed
//! tasks from a top-level (parentless) context, must keep values, invalidation and GC correct.

mod gc_fixture;
mod util;

use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

use anyhow::Result;
use turbo_tasks::{ResolvedVc, TaskId, TransientValue, TryJoinIterExt, TurboTasks, Vc};
use turbo_tasks_backend::TurboTasksBackend;

use crate::{
    gc_fixture::{Constant, Selector, create_constant, create_selector},
    util::create_tt,
};

const MODULES: u32 = 64;
const ENDPOINTS: u32 = 12;
const BATCH: u32 = 4;
const ROOT: u32 = u32::MAX;

static COUNTED_ENDPOINT_EXECUTIONS: AtomicUsize = AtomicUsize::new(0);

/// The `TaskId` backing a `Vc`'s `TaskOutput` node. Doesn't read the task.
fn task_id_of<T>(vc: Vc<T>) -> TaskId {
    Vc::into_raw(vc)
        .try_get_task_id()
        .expect("a task call should be backed by a task")
}

/// A module of a small shared DAG. Module 0 reads the input, every other module reads two lower
/// modules, so every module depends on the input.
#[turbo_tasks::function]
async fn module(input: ResolvedVc<Constant>, i: u32) -> Result<Vc<u32>> {
    if i == 0 {
        return Ok(Vc::cell(*input.await?.get()));
    }
    let a = *module(*input, i / 2).await?;
    let b = *module(*input, (i * 7 + 3) % i).await?;
    Ok(Vc::cell(a.wrapping_add(b).wrapping_add(i)))
}

#[turbo_tasks::function]
async fn endpoint(input: ResolvedVc<Constant>, e: u32) -> Result<Vc<u32>> {
    let values = [e % MODULES, (e * 5 + 1) % MODULES, MODULES - 1]
        .into_iter()
        .map(|i| module(*input, i))
        .try_join()
        .await?;
    Ok(Vc::cell(
        values.iter().fold(e, |acc, v| acc.wrapping_add(**v)),
    ))
}

/// Like `endpoint`, but counts its executions. Only the parentless-call test uses it, so other
/// tests running concurrently in the same process can't affect the count.
#[turbo_tasks::function]
async fn counted_endpoint(input: ResolvedVc<Constant>, e: u32) -> Result<Vc<u32>> {
    COUNTED_ENDPOINT_EXECUTIONS.fetch_add(1, Ordering::SeqCst);
    Ok(Vc::cell(*endpoint(*input, e).await?))
}

#[turbo_tasks::function(operation, root)]
async fn counted_emit_operation(input: ResolvedVc<Constant>) -> Result<Vc<u32>> {
    let values = (0..ENDPOINTS)
        .map(|e| counted_endpoint(*input, e))
        .try_join()
        .await?;
    Ok(Vc::cell(
        values.iter().fold(0u32, |acc, v| acc.wrapping_add(**v)),
    ))
}

/// The "emit" operation that computes all endpoints first.
#[turbo_tasks::function(operation, root)]
async fn emit_operation(input: ResolvedVc<Constant>) -> Result<Vc<u32>> {
    let values = (0..ENDPOINTS)
        .map(|e| endpoint(*input, e))
        .try_join()
        .await?;
    Ok(Vc::cell(
        values.iter().fold(0u32, |acc, v| acc.wrapping_add(**v)),
    ))
}

#[turbo_tasks::function]
async fn wrapper(input: ResolvedVc<Constant>, e: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(*endpoint(*input, e).await? ^ 1))
}

#[turbo_tasks::function]
async fn batch(input: ResolvedVc<Constant>, start: u32) -> Result<Vc<u32>> {
    let values = (start..(start + BATCH).min(ENDPOINTS))
        .map(|e| wrapper(*input, e))
        .try_join()
        .await?;
    Ok(Vc::cell(
        values.iter().fold(0u32, |acc, v| acc.wrapping_add(**v)),
    ))
}

/// A second, later root operation that reads the existing endpoint outputs through intermediate
/// tasks.
#[turbo_tasks::function(operation, root)]
async fn stats_operation(input: ResolvedVc<Constant>) -> Result<Vc<u32>> {
    let values = (0..ENDPOINTS)
        .step_by(BATCH as usize)
        .map(|start| batch(*input, start))
        .try_join()
        .await?;
    Ok(Vc::cell(
        values.iter().fold(0u32, |acc, v| acc.wrapping_add(**v)),
    ))
}

/// Computes the expected outputs without turbo-tasks.
fn expected(input: u32) -> (u32, u32) {
    let mut modules = vec![0u32; MODULES as usize];
    modules[0] = input;
    for i in 1..MODULES {
        let a = modules[(i / 2) as usize];
        let b = modules[((i * 7 + 3) % i) as usize];
        modules[i as usize] = a.wrapping_add(b).wrapping_add(i);
    }
    let endpoint = |e: u32| {
        [e % MODULES, (e * 5 + 1) % MODULES, MODULES - 1]
            .into_iter()
            .fold(e, |acc, i| acc.wrapping_add(modules[i as usize]))
    };
    let emit = (0..ENDPOINTS).fold(0u32, |acc, e| acc.wrapping_add(endpoint(e)));
    let stats = (0..ENDPOINTS).fold(0u32, |acc, e| acc.wrapping_add(endpoint(e) ^ 1));
    (emit, stats)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn new_root_operation_reads_existing_subgraph() {
    let (tt, _persistence_dir) = create_tt("new_root_operation_reads_existing_subgraph");
    let tt2 = tt.clone();
    turbo_tasks::run_once(tt.clone(), async move {
        let constant_op = create_constant();
        let input = constant_op.resolve().strongly_consistent().await?;
        let constant = constant_op.read_strongly_consistent().await?;

        let (emit, stats) = expected(0);
        assert_eq!(
            *emit_operation(input).read_strongly_consistent().await?,
            emit
        );
        // A new root operation over the already computed endpoints.
        assert_eq!(
            *stats_operation(input).read_strongly_consistent().await?,
            stats
        );

        // The operations are roots, the shared tasks below them are not.
        let backend = tt2.backend();
        for root in [
            task_id_of(emit_operation(input).connect()),
            task_id_of(stats_operation(input).connect()),
        ] {
            assert_eq!(
                backend.aggregation_number_for_testing(root, &tt2),
                Some(ROOT)
            );
        }

        // Invalidation reaches both roots, and the strongly consistent read of the new root
        // waits for the recomputation of the shared subgraph.
        constant.set(5);
        let (emit, stats) = expected(5);
        assert_eq!(
            *stats_operation(input).read_strongly_consistent().await?,
            stats
        );
        assert_eq!(
            *emit_operation(input).read_strongly_consistent().await?,
            emit
        );

        constant.set(9);
        let (emit, stats) = expected(9);
        assert_eq!(
            *emit_operation(input).read_strongly_consistent().await?,
            emit
        );
        assert_eq!(
            *stats_operation(input).read_strongly_consistent().await?,
            stats
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

/// Calls `counted_endpoint` for all endpoints from a `run` closure, which has no current task
/// (unlike `run_once`, whose closure runs as a transient task). Returns the endpoint tasks.
async fn call_endpoints_without_parent(
    tt: &Arc<TurboTasks<TurboTasksBackend>>,
    input: ResolvedVc<Constant>,
) -> Vec<TaskId> {
    tt.run(async move {
        Ok((0..ENDPOINTS)
            .map(|e| task_id_of(counted_endpoint(*input, e)))
            .collect::<Vec<_>>())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn parentless_calls_of_existing_tasks_are_not_made_roots() {
    let (tt, _persistence_dir) = create_tt("parentless_calls_of_existing_tasks_are_not_made_roots");
    let (input, executions) = turbo_tasks::run_once(tt.clone(), async move {
        let input = create_constant().resolve().strongly_consistent().await?;
        let (emit, _) = expected(0);
        assert_eq!(
            *counted_emit_operation(input)
                .read_strongly_consistent()
                .await?,
            emit
        );
        anyhow::Ok((input, COUNTED_ENDPOINT_EXECUTIONS.load(Ordering::SeqCst)))
    })
    .await
    .unwrap();

    let backend = tt.backend();
    let endpoints = call_endpoints_without_parent(&tt, input).await;
    for &task in &endpoints {
        // The caller holds the task alive...
        assert_eq!(backend.transient_ref_count_for_testing(task), 1);
        // ...but it doesn't become an aggregation root of its existing subgraph.
        assert!(
            backend
                .aggregation_number_for_testing(task, &tt)
                .is_some_and(|n| n != ROOT)
        );
    }
    // Calling them again is a cache hit.
    assert_eq!(call_endpoints_without_parent(&tt, input).await, endpoints);
    assert_eq!(
        COUNTED_ENDPOINT_EXECUTIONS.load(Ordering::SeqCst),
        executions
    );

    let tt2 = tt.clone();
    let endpoints2 = endpoints.clone();
    turbo_tasks::run_once(tt.clone(), async move {
        // Invalidation of the tasks that were called without a parent still recomputes them.
        let constant = create_constant().read_strongly_consistent().await?;
        constant.set(3);
        let (emit, stats) = expected(3);
        assert_eq!(
            *counted_emit_operation(input)
                .read_strongly_consistent()
                .await?,
            emit
        );
        assert_eq!(
            *stats_operation(input).read_strongly_consistent().await?,
            stats
        );
        assert!(COUNTED_ENDPOINT_EXECUTIONS.load(Ordering::SeqCst) > executions);
        for &task in &endpoints2 {
            assert!(
                tt2.backend()
                    .aggregation_number_for_testing(task, &tt2)
                    .is_some_and(|n| n != ROOT)
            );
        }

        // A persistent task called by a transient task (here the `run_once` task) is still made a
        // root: it shields the persistent graph from the transient caller.
        let called_by_transient_task = task_id_of(counted_endpoint(*input, 0));
        assert_eq!(called_by_transient_task, endpoints2[0]);
        assert_eq!(
            tt2.backend()
                .aggregation_number_for_testing(called_by_transient_task, &tt2),
            Some(ROOT)
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[turbo_tasks::function]
async fn held_branch(input: ResolvedVc<Constant>) -> Result<Vc<u32>> {
    Ok(Vc::cell(*module(*input, 1).await? + 100))
}

#[turbo_tasks::function]
async fn dropped_branch(input: ResolvedVc<Constant>) -> Result<Vc<u32>> {
    Ok(Vc::cell(*input.await?.get() + 200))
}

#[turbo_tasks::function]
fn other_branch() -> Vc<u32> {
    Vc::cell(300)
}

/// Reads `held_branch` and `dropped_branch` while the selector is false, only `other_branch` when
/// it is true.
#[turbo_tasks::function(operation, root)]
async fn select_branches(
    selector: ResolvedVc<Selector>,
    input: ResolvedVc<Constant>,
) -> Result<Vc<u32>> {
    if *selector.await?.get() {
        return Ok(other_branch());
    }
    Ok(Vc::cell(
        *held_branch(*input).await? + *dropped_branch(*input).await?,
    ))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn parentless_call_still_pins_task_against_gc() {
    let (tt, _persistence_dir) = create_tt("parentless_call_still_pins_task_against_gc");
    let (selector_vc, input) = turbo_tasks::run_once(tt.clone(), async move {
        let selector_vc = create_selector(false)
            .resolve()
            .strongly_consistent()
            .await?;
        let input = create_constant().resolve().strongly_consistent().await?;
        // module(1) = module(0) + module(0) + 1 = 1, with module(0) = input = 0.
        assert_eq!(
            *select_branches(selector_vc, input)
                .read_strongly_consistent()
                .await?,
            1 + 100 + 200
        );
        anyhow::Ok((selector_vc, input))
    })
    .await
    .unwrap();

    // Call the already computed branch without a parent task, so this session holds it.
    let held = tt
        .run(async move { Ok(task_id_of(held_branch(*input))) })
        .await
        .unwrap();
    let backend = tt.backend();
    assert!(
        backend
            .aggregation_number_for_testing(held, &tt)
            .is_some_and(|n| n != ROOT)
    );

    turbo_tasks::run_once(tt.clone(), async move {
        // Disconnect both branches from the live graph.
        create_selector(false)
            .read_strongly_consistent()
            .await?
            .set(true);
        assert_eq!(
            *select_branches(selector_vc, input)
                .read_strongly_consistent()
                .await?,
            300
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();

    assert_eq!(backend.parent_count_for_testing(held), 0);
    assert_eq!(backend.transient_ref_count_for_testing(held), 1);
    // `dropped_branch` is collected. `held_branch` is pinned by the call without a parent, and
    // keeps its subgraph alive.
    assert_eq!(backend.gc_for_testing(&tt), 1);
    assert_eq!(backend.gc_for_testing(&tt), 0);
    backend.assert_task_exists_for_testing(held, &tt);
    tt.stop_and_wait().await;
}

/// A transient (non-root) function task, transient because of its argument.
#[turbo_tasks::function]
async fn transient_endpoint(
    input: ResolvedVc<Constant>,
    salt: TransientValue<u32>,
) -> Result<Vc<u32>> {
    Ok(Vc::cell(*endpoint(*input, 0).await? ^ *salt))
}

/// A transient root operation, transient because of its argument.
#[turbo_tasks::function(operation, root)]
async fn transient_root_operation(
    input: ResolvedVc<Constant>,
    salt: TransientValue<u32>,
) -> Result<Vc<u32>> {
    Ok(Vc::cell(*transient_endpoint(*input, salt).await? ^ 1))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn parentless_calls_of_transient_tasks_are_only_roots_if_root_functions() {
    let (tt, _persistence_dir) =
        create_tt("parentless_calls_of_transient_tasks_are_only_roots_if_root_functions");
    let input = turbo_tasks::run_once(tt.clone(), async move {
        anyhow::Ok(create_constant().resolve().strongly_consistent().await?)
    })
    .await
    .unwrap();

    let salt = TransientValue::new(7);
    let salt2 = salt.clone();
    // Check the parentless call before creating the operation: the operation calls the same task
    // and its transient parent edge would race with the exact ref-count assertion.
    let non_root = tt
        .run(async move { Ok(task_id_of(transient_endpoint(*input, salt))) })
        .await
        .unwrap();
    let backend = tt.backend();
    assert!(non_root.is_transient());
    // A parentless transient task isn't made a root...
    assert!(
        backend
            .aggregation_number_for_testing(non_root, &tt)
            .is_some_and(|n| n != ROOT)
    );
    assert_eq!(backend.transient_ref_count_for_testing(non_root), 1);

    let (operation, operation_id) = tt
        .run(async move {
            let operation = transient_root_operation(input, salt2);
            Ok((operation, task_id_of(operation.connect())))
        })
        .await
        .unwrap();
    // ...but a `root` function is a root from its creation.
    assert!(operation_id.is_transient());
    assert_eq!(
        backend.aggregation_number_for_testing(operation_id, &tt),
        Some(ROOT)
    );

    // Strongly consistent reads of the transient root see values and invalidation.
    turbo_tasks::run_once(tt.clone(), async move {
        // `endpoint(input, 0)` reads modules 0, 1 and MODULES - 1.
        let expected_for = |input: u32| {
            let mut modules = vec![0u32; MODULES as usize];
            modules[0] = input;
            for i in 1..MODULES {
                let a = modules[(i / 2) as usize];
                let b = modules[((i * 7 + 3) % i) as usize];
                modules[i as usize] = a.wrapping_add(b).wrapping_add(i);
            }
            [0, 1, MODULES - 1]
                .into_iter()
                .fold(0u32, |acc, i| acc.wrapping_add(modules[i as usize]))
                ^ 7
                ^ 1
        };
        assert_eq!(
            *operation.read_strongly_consistent().await?,
            expected_for(0)
        );
        create_constant().read_strongly_consistent().await?.set(4);
        assert_eq!(
            *operation.read_strongly_consistent().await?,
            expected_for(4)
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}
