#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Children that are immutable, without children or collectibles, when they are connected stay
//! outside the aggregation graph: they get no upper edges, but their parent counts are tracked.

mod util;

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{CollectiblesSource, ResolvedVc, State, TaskId, ValueToString, Vc, emit};

use crate::util::create_tt;

/// The `TaskId` backing a resolved `Vc` (its `TaskOutput` node).
fn task_id_of<T>(vc: Vc<T>) -> TaskId {
    Vc::into_raw(vc)
        .try_get_task_id()
        .expect("a resolved Vc should be backed by a task")
}

#[turbo_tasks::value(transparent)]
struct Flag(State<bool>);

#[turbo_tasks::function(operation, root)]
fn create_flag() -> Vc<Flag> {
    Flag(State::new(true)).cell()
}

/// Has no dependencies, so it is immutable once it completed.
#[turbo_tasks::function]
fn constant() -> Vc<u32> {
    Vc::cell(7)
}

/// Completes `constant` before the readers connect it.
#[turbo_tasks::function(operation, root)]
async fn warm_constant() -> Result<Vc<u32>> {
    Ok(Vc::cell(*constant().await?))
}

/// Reads `constant` while the flag is set.
#[turbo_tasks::function]
async fn reader(i: u32, flag: ResolvedVc<Flag>) -> Result<Vc<u32>> {
    let base = if *flag.await?.get() {
        *constant().await?
    } else {
        0
    };
    Ok(Vc::cell(base + i))
}

#[turbo_tasks::function(operation, root)]
async fn sum_readers(n: u32, flag: ResolvedVc<Flag>) -> Result<Vc<u32>> {
    let mut total = 0;
    for i in 0..n {
        total += *reader(i, *flag).await?;
    }
    Ok(Vc::cell(total))
}

const READERS: u32 = 20;

fn expected_sum(constant: u32) -> u32 {
    (0..READERS).map(|i| constant + i).sum()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn immutable_children_are_connected_outside_the_aggregation_graph() {
    let (tt, _persistence_dir) =
        create_tt("immutable_children_are_connected_outside_the_aggregation_graph");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        let backend = tt2.backend();
        assert_eq!(*warm_constant().read_strongly_consistent().await?, 7);
        let constant_id = task_id_of(constant());
        // `warm_constant` awaited `constant`, so `constant` had already completed (as immutable)
        // when `warm_constant` completed and connected it.
        assert!(backend.is_unaggregated_child_for_testing(
            task_id_of(warm_constant().connect()),
            constant_id,
            &tt2
        ));
        assert_eq!(backend.upper_count_for_testing(constant_id, &tt2), 0);
        assert_eq!(backend.parent_count_for_testing(constant_id), 1);

        let flag_op = create_flag();
        let flag_vc = flag_op.resolve().strongly_consistent().await?;
        let flag = flag_op.read_strongly_consistent().await?;
        let sum = sum_readers(READERS, flag_vc);
        assert_eq!(*sum.read_strongly_consistent().await?, expected_sum(7));

        // Every reader connects the now immutable `constant` outside the aggregation graph: it
        // gains a parent per reader but no upper edges.
        for i in 0..READERS {
            assert!(backend.is_unaggregated_child_for_testing(
                task_id_of(reader(i, *flag_vc)),
                constant_id,
                &tt2
            ));
        }
        assert_eq!(backend.upper_count_for_testing(constant_id, &tt2), 0);
        assert_eq!(backend.parent_count_for_testing(constant_id), 1 + READERS);

        // The readers stop reading `constant`, which releases their parent counts.
        flag.set(false);
        assert_eq!(*sum.read_strongly_consistent().await?, expected_sum(0));
        assert_eq!(backend.parent_count_for_testing(constant_id), 1);
        assert_eq!(backend.upper_count_for_testing(constant_id, &tt2), 0);

        // And reconnect it, again outside the aggregation graph.
        flag.set(true);
        assert_eq!(*sum.read_strongly_consistent().await?, expected_sum(7));
        assert_eq!(backend.parent_count_for_testing(constant_id), 1 + READERS);
        assert_eq!(backend.upper_count_for_testing(constant_id, &tt2), 0);

        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}

#[turbo_tasks::value(shared)]
struct Thing(u32);

#[turbo_tasks::value_impl]
impl ValueToString for Thing {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.0.to_string().into())
    }
}

/// Immutable (it has no dependencies) but emits a collectible, so it must stay in the aggregation
/// graph for the collectible to reach the uppers.
#[turbo_tasks::function]
fn emitting_constant() -> Vc<u32> {
    emit(ResolvedVc::upcast::<Box<dyn ValueToString>>(
        Thing::resolved_cell(Thing(42)),
    ));
    Vc::cell(1)
}

#[turbo_tasks::function(operation, root)]
async fn warm_emitting_constant() -> Result<Vc<u32>> {
    Ok(Vc::cell(*emitting_constant().await?))
}

#[turbo_tasks::function(operation, root)]
async fn read_emitting_constant() -> Result<Vc<u32>> {
    Ok(Vc::cell(*emitting_constant().await?))
}

#[turbo_tasks::function(operation, root)]
async fn collect_from_reader() -> Result<Vc<u32>> {
    let reader = read_emitting_constant();
    reader.connect().await?;
    let collectibles = reader.peek_collectibles::<Box<dyn ValueToString>>();
    Ok(Vc::cell(collectibles.len() as u32))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn immutable_children_with_collectibles_stay_aggregated() {
    let (tt, _persistence_dir) = create_tt("immutable_children_with_collectibles_stay_aggregated");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        assert_eq!(
            *warm_emitting_constant().read_strongly_consistent().await?,
            1
        );
        assert_eq!(*collect_from_reader().read_strongly_consistent().await?, 1);
        assert!(!tt2.backend().is_unaggregated_child_for_testing(
            task_id_of(read_emitting_constant().connect()),
            task_id_of(emitting_constant()),
            &tt2
        ));
        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}
