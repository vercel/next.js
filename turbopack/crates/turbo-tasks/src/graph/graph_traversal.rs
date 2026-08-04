#[cfg(not(feature = "sync"))]
use std::future::Future;

use anyhow::Result;
#[cfg(not(feature = "sync"))]
use futures::{StreamExt, stream::FuturesUnordered};
use rustc_hash::FxHashSet;

#[cfg(not(feature = "sync"))]
use super::with_future::With;
use super::{Visit, VisitControlFlow, graph_store::GraphStore};

/// A list of modules that were already visited and should be skipped (including their subgraphs).
#[derive(Clone, Default, Debug)]
pub struct VisitedNodes<T>(pub FxHashSet<T>);

/// [`GraphTraversal`] is a utility type that can be used to traverse a graph of
/// nodes, where each node can have a variable number of outgoing edges.
///
/// The traversal is done in parallel, and the order of the nodes in the traversal
/// result is determined by the [`GraphStore`] parameter.
#[cfg(not(feature = "sync"))]
pub trait GraphTraversal: GraphStore + Sized {
    fn visit<VisitImpl, Impl>(
        self,
        root_nodes: impl IntoIterator<Item = Self::Node>,
        visit: VisitImpl,
    ) -> impl Future<Output = GraphTraversalResult<Result<Self>>> + Send
    where
        VisitImpl: Visit<Self::Node, Self::Edge, Impl> + Send,
        Impl: Send;
}

/// Synchronous (`sync` feature) counterpart of the async `GraphTraversal` above:
/// `visit` performs the whole traversal inline (sequentially) and returns the
/// result directly instead of a future. `read!(store.visit(..))` works in both
/// modes via the `SyncRead` impl for [`GraphTraversalResult`] below.
#[cfg(feature = "sync")]
pub trait GraphTraversal: GraphStore + Sized {
    fn visit<VisitImpl, Impl>(
        self,
        root_nodes: impl IntoIterator<Item = Self::Node>,
        visit: VisitImpl,
    ) -> GraphTraversalResult<Result<Self>>
    where
        // `Sync` on the visitor and `'static` + `Send` on the payload types are
        // required by the streaming driver: a node's `edges()` computation is
        // published to the worker pool the moment the node is discovered, so
        // `Node`/`Handle`/`EdgesIntoIter` cross into pool jobs by value.
        VisitImpl: Visit<Self::Node, Self::Edge, Impl> + Send + Sync,
        Impl: Send,
        Self::Node: Clone + 'static,
        Self::Handle: 'static,
        VisitImpl::EdgesIntoIter: Send + 'static;
}

#[cfg(not(feature = "sync"))]
impl<Store> GraphTraversal for Store
where
    Store: GraphStore,
{
    /// Visits the graph starting from the given `roots`, and returns a future
    /// that will resolve to the traversal result.
    fn visit<VisitImpl, Impl>(
        mut self,
        root_nodes: impl IntoIterator<Item = Self::Node>,
        mut visit: VisitImpl,
    ) -> impl Future<Output = GraphTraversalResult<Result<Self>>> + Send
    where
        VisitImpl: Visit<Self::Node, Self::Edge, Impl> + Send,
        Impl: Send,
    {
        let mut futures = FuturesUnordered::new();

        // Populate `futures` with all the roots, `root_nodes` isn't required to be `Send`, so this
        // has to happen outside of the future. We could require `root_nodes` to be `Send` in the
        // future.
        for node in root_nodes {
            match visit.visit(&node, None) {
                VisitControlFlow::Continue => {
                    if let Some(handle) = self.try_enter(&node) {
                        let span = visit.span(&node, None);
                        futures.push(With::new(visit.edges(&node), span, handle));
                    }
                    self.insert(None, node);
                }
                VisitControlFlow::Skip => {
                    self.insert(None, node);
                }
                VisitControlFlow::Exclude => {
                    // do nothing
                }
            }
        }

        async move {
            let mut result = Ok(());
            loop {
                match futures.next().await {
                    Some((parent_node, span, Ok(edges))) => {
                        let _guard = span.enter();
                        for (node, edge) in edges {
                            match visit.visit(&node, Some(&edge)) {
                                VisitControlFlow::Continue => {
                                    if let Some(handle) = self.try_enter(&node) {
                                        let span = visit.span(&node, Some(&edge));
                                        let edges_future = visit.edges(&node);
                                        futures.push(With::new(edges_future, span, handle));
                                    }
                                    self.insert(Some((&parent_node, edge)), node);
                                }
                                VisitControlFlow::Skip => {
                                    self.insert(Some((&parent_node, edge)), node);
                                }
                                VisitControlFlow::Exclude => {
                                    // do nothing
                                }
                            }
                        }
                    }
                    Some((_, _, Err(err))) => {
                        result = Err(err);
                    }
                    None => {
                        return GraphTraversalResult::Completed(result.map(|()| self));
                    }
                }
            }
        }
    }
}

/// Traversal drivers for the `sync` build. Same `visit`/`try_enter`/`insert` call
/// pattern and span handling as the async version; the expensive `edges` computation
/// (turbo-tasks reads for every discovered node) runs concurrently on the worker pool,
/// while the cheap serial bookkeeping (`visit`, `try_enter`, `insert`, which mutate
/// `self`/the store) stays on the driver.
///
/// Two fan-out strategies:
/// - **Streaming (default, see [`visit_streaming`])**: every discovered node is published
///   immediately to a self-draining source. The driver's tail wait is `WaitGraph`-visible, and
///   managed waits are event-driven, making this both deadlock-safe and faster on v0/chat.
/// - **Level-BFS (`TURBO_SYNC_TRAV_STREAMING=0`)**: one frontier at a time through
///   `sync_parallel_map`, with a fork/join wait per level. Retained as an A/B fallback.
///
/// Fan-out is used only when dependency tracking is off (the one-shot `turbopack
/// build` case): `edges` runs on pool workers that don't carry the traversal task's
/// `CURRENT_TASK_STATE`, so with tracking on the reads would not be attributed to the
/// traversal task — there we fall back to computing edges serially on the driver.
#[cfg(feature = "sync")]
impl<Store> GraphTraversal for Store
where
    Store: GraphStore,
{
    fn visit<VisitImpl, Impl>(
        mut self,
        root_nodes: impl IntoIterator<Item = Self::Node>,
        visit: VisitImpl,
    ) -> GraphTraversalResult<Result<Self>>
    where
        VisitImpl: Visit<Self::Node, Self::Edge, Impl> + Send + Sync,
        Impl: Send,
        Self::Node: Clone + 'static,
        Self::Handle: 'static,
        VisitImpl::EdgesIntoIter: Send + 'static,
    {
        if crate::manager::sync_traversal_streaming_enabled() && tt_parallel::in_worker() {
            return visit_streaming(self, root_nodes, visit);
        }

        // Level-BFS fallback: each frontier's `edges()` computations are
        // fanned out to the worker pool via `sync_parallel_map`, with a join barrier
        // per level. Unlike the streaming driver above, every wait the driver takes is
        // a fork/join wait — recorded in the `WaitGraph` as a job-token edge, and the
        // joiner runs its own queued jobs first — so no invisible park can strand the
        // driver's inline-claimed ancestor chain.
        //
        // Fan-out requires dependency tracking to be off (the one-shot `turbopack
        // build` case): pool workers don't carry the traversal task's
        // `CURRENT_TASK_STATE`, so with tracking on the `edges()` reads would not be
        // attributed to the traversal task — there each frontier is computed serially
        // on the driver's own stack.
        let parallel = !crate::manager::turbo_tasks().is_tracking_dependencies();
        let compute_edges = |visit: &VisitImpl,
                             inputs: Vec<(Self::Node, tracing::Span)>|
         -> Vec<Result<VisitImpl::EdgesIntoIter>> {
            if parallel && inputs.len() > 1 {
                crate::manager::sync_parallel_map(inputs, |(node, span)| {
                    let _guard = span.enter();
                    visit.edges(&node)
                })
            } else {
                inputs
                    .into_iter()
                    .map(|(node, span)| {
                        let _guard = span.enter();
                        visit.edges(&node)
                    })
                    .collect()
            }
        };

        // The current BFS frontier: entered nodes whose edges still need computing.
        let mut frontier: Vec<(Self::Handle, tracing::Span, Self::Node)> = Vec::new();

        for node in root_nodes {
            match visit.visit(&node, None) {
                VisitControlFlow::Continue => {
                    if let Some(handle) = self.try_enter(&node) {
                        let span = visit.span(&node, None);
                        frontier.push((handle, span, node.clone()));
                    }
                    self.insert(None, node);
                }
                VisitControlFlow::Skip => {
                    self.insert(None, node);
                }
                VisitControlFlow::Exclude => {
                    // do nothing
                }
            }
        }

        let mut result = Ok(());
        while !frontier.is_empty() {
            let inputs: Vec<(Self::Node, tracing::Span)> = frontier
                .iter()
                .map(|(_, span, node)| (node.clone(), span.clone()))
                .collect();
            let edge_results = compute_edges(&visit, inputs);

            let mut next: Vec<(Self::Handle, tracing::Span, Self::Node)> = Vec::new();
            for ((parent_node, span, _node), edges) in
                std::mem::take(&mut frontier).into_iter().zip(edge_results)
            {
                match edges {
                    Ok(edges) => {
                        let _guard = span.enter();
                        for (node, edge) in edges {
                            match visit.visit(&node, Some(&edge)) {
                                VisitControlFlow::Continue => {
                                    if let Some(handle) = self.try_enter(&node) {
                                        let child_span = visit.span(&node, Some(&edge));
                                        next.push((handle, child_span, node.clone()));
                                    }
                                    self.insert(Some((&parent_node, edge)), node);
                                }
                                VisitControlFlow::Skip => {
                                    self.insert(Some((&parent_node, edge)), node);
                                }
                                VisitControlFlow::Exclude => {
                                    // do nothing
                                }
                            }
                        }
                    }
                    Err(err) => {
                        result = Err(err);
                    }
                }
            }
            frontier = next;
        }
        GraphTraversalResult::Completed(result.map(|()| self))
    }
}

/// Continuous-stream traversal driver for the `sync` build — the counterpart of the
/// async driver's `FuturesUnordered` loop above.
///
/// Rather than advancing one BFS frontier at a time (a join barrier per level, which
/// drains the worker pool between levels: the pool sits idle while the slowest item's
/// subtree finishes and the driver catches up on bookkeeping), every discovered node
/// is published immediately as an independent `edges()` job, and the driver processes
/// completions one at a time as they arrive. Discovery is self-feeding — a completion
/// can spawn more jobs — so the pool stays fed for the whole traversal. That is where
/// the async engine's within-a-single-route parallelism comes from: not suspension per
/// se, but hundreds of outstanding `edges()` demands at once.
///
/// Deadlock safety: the driver must never
/// depend on *pool capacity* to finish its own traversal. The first streaming driver
/// published jobs to the shared injector and parked invisibly on the completion
/// channel; on v0/chat the whole thread budget filled up with workers blocked on a task
/// token the driver itself owned (`get_evaluate_pool`), the driver's runnable jobs
/// starved behind ~146k queued tasks that would all block on that same token, and the
/// build stalled with no cycle to detect. This driver is **self-draining** instead:
///
/// - Jobs go into a [`tt_parallel::JobSource`] — a driver-owned queue that free workers prefer over
///   the injector backlog (fan-out preserved, and latency-critical traversal jobs are not stuck
///   behind queued tasks that may block on the driver's ancestors), and that the driver itself
///   drains while waiting (so the traversal completes even with zero cooperating workers — the
///   serial driver's property).
/// - Jobs taken by other workers run `owning` (part of this task's computation — the
///   owning-inheritance rule) and own a `WaitGraph` job token while running.
/// - When every outstanding job is claimed by another worker, the driver's tail wait is a
///   `managed_block` on one of those job tokens — WaitGraph-visible and walkable, so a genuine
///   cross-worker cycle is *detected* (and reported) instead of hanging.
#[cfg(feature = "sync")]
fn visit_streaming<Store, VisitImpl, Impl>(
    mut store: Store,
    root_nodes: impl IntoIterator<Item = Store::Node>,
    visit: VisitImpl,
) -> GraphTraversalResult<Result<Store>>
where
    Store: GraphStore,
    VisitImpl: Visit<Store::Node, Store::Edge, Impl> + Send + Sync,
    Impl: Send,
    // `Node`/`Handle`/`EdgesIntoIter` cross into pool jobs by value (the job computes
    // `edges(&node)`; the channel carries the handle and the result), so they must be
    // owned `'static` data. Only the visitor itself borrows from the caller's frame —
    // it crosses as a raw pointer instead (see `SendPtr` below).
    Store::Node: Clone + 'static,
    Store::Handle: 'static,
    VisitImpl::EdgesIntoIter: Send + 'static,
{
    use std::sync::mpsc::{Receiver, Sender, channel};

    use rustc_hash::FxHashSet;

    // One message per job: the job's token (driver bookkeeping), the parent handle (for
    // `GraphStore::insert`), the span the edges were computed under, and the edges
    // result (or the job's panic payload).
    type Msg<H, EI> = (u64, H, tracing::Span, std::thread::Result<Result<EI>>);

    let (tx, rx) = channel::<Msg<Store::Handle, VisitImpl::EdgesIntoIter>>();

    let worker =
        tt_parallel::current_worker().expect("visit_streaming requires a pool worker (in_worker)");

    // Reaps every in-flight job on scope exit — including unwind paths. Jobs still queued
    // in the source are discarded (they never run, so they never send); jobs already taken
    // by a worker each send exactly one message before they finish, so receiving one
    // message per remaining outstanding token guarantees no job still borrows the visitor
    // when this frame is torn down. That guarantee is what makes the `&'static` erasure
    // below sound.
    struct Reap<'r, H: Send, EI: Send> {
        source: tt_parallel::JobSource,
        rx: &'r Receiver<Msg<H, EI>>,
        outstanding: FxHashSet<u64>,
    }
    impl<H: Send, EI: Send> Drop for Reap<'_, H, EI> {
        fn drop(&mut self) {
            for token in self.source.drain_tokens() {
                self.outstanding.remove(&token);
            }
            while !self.outstanding.is_empty() {
                match self.rx.recv() {
                    Ok((token, ..)) => {
                        self.outstanding.remove(&token);
                    }
                    Err(_) => break,
                }
            }
            // `self.source` drops here, unregistering it from the pool.
        }
    }

    crate::sync_stats::bump(&crate::sync_stats::TRAV_STREAMS);
    let mut reap = Reap {
        source: crate::manager::sync_job_source(),
        rx: &rx,
        outstanding: FxHashSet::default(),
    };

    // A `Send`-able, fully type-erased pointer to the visitor. Pool jobs are `'static`,
    // but the visitor is not (it may itself borrow from the caller's frame — e.g.
    // `SingleModuleGraphBuilder<'_>`), so neither a reference nor a raw
    // `*const VisitImpl` (whose type still mentions the non-`'static` parameter) can
    // cross into a job; a `*const ()` plus a monomorphized, non-capturing accessor can.
    // Sound because `reap` blocks this frame from exiting until every spawned job has
    // finished or been discarded unrun, and jobs only ever take a shared `&VisitImpl`
    // from it (the sync `Visit` trait's methods are all `&self`, and `VisitImpl: Sync`).
    #[derive(Clone, Copy)]
    struct SendPtr(*const ());
    unsafe impl Send for SendPtr {}
    unsafe impl Sync for SendPtr {}
    let visit_ptr = SendPtr(&visit as *const VisitImpl as *const ());
    let edges_of: fn(SendPtr, &Store::Node) -> Result<VisitImpl::EdgesIntoIter> = |ptr, node| {
        // SAFETY: `ptr` is `&visit`, erased; the referent is alive for the whole job
        // (the driver's reap guarantee) and this only creates a shared reference.
        let visit: &VisitImpl = unsafe { &*(ptr.0 as *const VisitImpl) };
        visit.edges(node)
    };

    // Queue one `edges()` job; returns its token for the driver's outstanding set.
    let spawn_job = |source: &tt_parallel::JobSource,
                     handle: Store::Handle,
                     node: Store::Node,
                     span: tracing::Span|
     -> u64 {
        let tx: Sender<Msg<_, _>> = tx.clone();
        let token = tt_parallel::new_job_token();
        crate::sync_stats::bump(&crate::sync_stats::TRAV_JOBS);
        crate::manager::sync_source_push(source, token, move || {
            let result = {
                let _guard = span.enter();
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    edges_of(visit_ptr, &node)
                }))
            };
            // Always deliver exactly one message (the driver's reap counts on it);
            // ignore a send error if the receiver is already gone.
            let _ = tx.send((token, handle, span, result));
        });
        token
    };

    // Seed the stream with the entered roots (same bookkeeping as the serial driver).
    for node in root_nodes {
        match visit.visit(&node, None) {
            VisitControlFlow::Continue => {
                if let Some(handle) = store.try_enter(&node) {
                    let span = visit.span(&node, None);
                    let token = spawn_job(&reap.source, handle, node.clone(), span);
                    reap.outstanding.insert(token);
                }
                store.insert(None, node);
            }
            VisitControlFlow::Skip => {
                store.insert(None, node);
            }
            VisitControlFlow::Exclude => {
                // do nothing
            }
        }
    }

    /// The driver's tail wait: releases as soon as a completion message is available,
    /// buffering it in `slot`. Used inside `managed_block` on an outstanding job token,
    /// so the wait is WaitGraph-visible (`driver -> job token -> running worker`) while
    /// still waking on *any* job's completion.
    struct ChannelBlocker<'a, M> {
        rx: &'a Receiver<M>,
        slot: &'a mut Option<M>,
    }
    impl<M> tt_parallel::Blocker for ChannelBlocker<'_, M> {
        fn is_releasable(&mut self) -> bool {
            if self.slot.is_none() {
                *self.slot = self.rx.try_recv().ok();
            }
            self.slot.is_some()
        }
        fn block(&mut self, timeout: Option<std::time::Duration>) {
            if self.slot.is_none() {
                *self.slot = self
                    .rx
                    .recv_timeout(timeout.expect("channel blocker uses bounded cycle polling"))
                    .ok();
            }
        }
    }

    let mut result = Ok(());
    loop {
        // Obtain the next completion, contributing work while none is ready.
        let msg = loop {
            if let Ok(msg) = rx.try_recv() {
                break Some(msg);
            }
            if reap.outstanding.is_empty() {
                break None;
            }
            // Run one of our own queued jobs inline — the self-draining property: the
            // traversal advances even if no other worker ever takes a job (and even if
            // the rest of the pool is blocked piling up on a task this driver owns).
            if let Some((_token, job)) = reap.source.take() {
                job(&worker);
                reap.source.note_inline_progress();
                continue;
            }
            // Every outstanding job was taken by another worker (or its completion is
            // already in flight): park on one of their job tokens, WaitGraph-visibly.
            let token = *reap
                .outstanding
                .iter()
                .next()
                .expect("outstanding checked non-empty above");
            let mut slot = None;
            if worker
                .managed_block(
                    token,
                    ChannelBlocker {
                        rx: &rx,
                        slot: &mut slot,
                    },
                )
                .is_err()
            {
                // A confirmed cross-worker wait cycle through this traversal — the sync
                // engine cannot resolve it (the equivalent shape would deadlock the async
                // engine's task graph too). Panic with context; `reap` unwinds cleanly.
                panic!(
                    "sync streaming traversal: dependency cycle detected while waiting on a \
                     stolen edges() job (token {token:#x})"
                );
            }
            if let Some(msg) = slot {
                break Some(msg);
            }
        };
        let Some((token, parent_handle, span, payload)) = msg else {
            break;
        };
        reap.outstanding.remove(&token);
        let edges = match payload {
            Ok(edges) => edges,
            Err(panic) => {
                // A panicking job aborts the traversal; `reap` reaps the rest.
                std::panic::resume_unwind(panic)
            }
        };
        let edges = match edges {
            Ok(edges) => edges,
            Err(err) => {
                // Mirror the async driver: record the error, keep draining.
                result = Err(err);
                continue;
            }
        };
        let _guard = span.enter();
        for (node, edge) in edges {
            match visit.visit(&node, Some(&edge)) {
                VisitControlFlow::Continue => {
                    if let Some(handle) = store.try_enter(&node) {
                        let child_span = visit.span(&node, Some(&edge));
                        let token = spawn_job(&reap.source, handle, node.clone(), child_span);
                        reap.outstanding.insert(token);
                    }
                    store.insert(Some((&parent_handle, edge)), node);
                }
                VisitControlFlow::Skip => {
                    store.insert(Some((&parent_handle, edge)), node);
                }
                VisitControlFlow::Exclude => {
                    // do nothing
                }
            }
        }
    }
    GraphTraversalResult::Completed(result.map(|()| store))
}

pub enum GraphTraversalResult<Completed> {
    Completed(Completed),
}

/// Identity read: under `sync`, `GraphTraversal::visit` already returns the
/// completed `GraphTraversalResult`, so `read!(store.visit(..))` forwards it.
#[cfg(feature = "sync")]
impl<Completed> crate::macro_helpers::SyncRead for GraphTraversalResult<Completed> {
    type Output = Self;
    fn sync_read(self) -> Self::Output {
        self
    }
}

impl<Completed> GraphTraversalResult<Completed> {
    pub fn completed(self) -> Completed {
        match self {
            GraphTraversalResult::Completed(completed) => completed,
        }
    }
}
