#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Owned publication through `read_strongly_consistent_and_apply_effects`: claims, bounded
//! dispatch, draining on cancellation and panic, effect kinds, and the reentrancy guard.

use std::{
    panic::AssertUnwindSafe,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

use anyhow::Result;
use async_trait::async_trait;
use futures::FutureExt;
use parking_lot::Mutex;
use tokio::sync::watch;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    ApplyError, CapturedEffect, Effect, EffectExt, EffectStateStorage, Effects, NonLocalValue,
    ResolvedVc, TurboTasks, Vc, read_strongly_consistent_and_apply_effects, take_effects,
};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

#[derive(NonLocalValue)]
struct Lab {
    #[turbo_tasks(unsafe_ignore)]
    storage: EffectStateStorage,
    #[turbo_tasks(unsafe_ignore)]
    log: Mutex<Vec<String>>,
    #[turbo_tasks(unsafe_ignore)]
    release: watch::Sender<bool>,
    in_flight: AtomicUsize,
    max_in_flight: AtomicUsize,
    /// What a `Reenter` effect tries to publish.
    #[turbo_tasks(unsafe_ignore)]
    nested: Mutex<Option<turbo_tasks::OperationVc<Effects>>>,
}

impl Lab {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            storage: EffectStateStorage::default(),
            log: Mutex::new(Vec::new()),
            release: watch::channel(false).0,
            in_flight: AtomicUsize::new(0),
            max_in_flight: AtomicUsize::new(0),
            nested: Mutex::new(None),
        })
    }

    fn log(&self) -> Vec<String> {
        self.log.lock().clone()
    }

    fn push(&self, entry: String) {
        self.log.lock().push(entry);
    }
}

#[turbo_tasks::value(eq = "manual", serialization = "skip")]
struct LabCell {
    #[turbo_tasks(debug_ignore)]
    lab: Arc<Lab>,
}

impl PartialEq for LabCell {
    fn eq(&self, _other: &Self) -> bool {
        false
    }
}

/// What a test effect does when applied.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Behavior {
    Write,
    /// Like `Write`, but a different effect kind.
    WriteOtherKind,
    /// Waits for `Lab::release`.
    Block,
    /// Waits for `Lab::release` inside `apply` but before entering `run_apply`, so storage still
    /// records the previous result while it waits.
    GateBeforeApply,
    Panic,
    /// Panics with a payload whose `Drop` also panics.
    PanicWithPanickingPayload,
    /// Tries to publish another effect from inside its apply.
    Reenter,
    /// Tracks how many applies run at once.
    Count,
}

impl Behavior {
    fn parse(name: &str) -> Self {
        match name {
            "write" => Self::Write,
            "other" => Self::WriteOtherKind,
            "block" => Self::Block,
            "pregate" => Self::GateBeforeApply,
            "panic" => Self::Panic,
            "badpanic" => Self::PanicWithPanickingPayload,
            "reenter" => Self::Reenter,
            "count" => Self::Count,
            _ => panic!("unknown behavior {name}"),
        }
    }
}

#[turbo_tasks::value(serialization = "skip", cell = "new", eq = "manual")]
struct LabEffect {
    key: RcStr,
    behavior: u8,
    value_hash: u128,
    #[turbo_tasks(debug_ignore)]
    lab: Arc<Lab>,
}

const BEHAVIORS: [Behavior; 8] = [
    Behavior::Write,
    Behavior::WriteOtherKind,
    Behavior::Block,
    Behavior::GateBeforeApply,
    Behavior::Panic,
    Behavior::PanicWithPanickingPayload,
    Behavior::Reenter,
    Behavior::Count,
];

#[async_trait]
#[turbo_tasks::value_impl]
impl Effect for LabEffect {
    async fn capture(&self) -> Result<Box<dyn CapturedEffect>> {
        Ok(Box::new(CapturedLabEffect {
            key: self.key.clone(),
            behavior: BEHAVIORS[self.behavior as usize],
            value_hash: self.value_hash,
            lab: self.lab.clone(),
        }))
    }
}

#[derive(NonLocalValue)]
struct CapturedLabEffect {
    key: RcStr,
    #[turbo_tasks(unsafe_ignore)]
    behavior: Behavior,
    value_hash: u128,
    lab: Arc<Lab>,
}

#[derive(Debug, thiserror::Error, NonLocalValue)]
#[error("lab effect failed")]
struct LabError;

struct PanickingPayload;

impl Drop for PanickingPayload {
    fn drop(&mut self) {
        if !std::thread::panicking() {
            panic!("panic payload dropped");
        }
    }
}

#[async_trait]
impl CapturedEffect for CapturedLabEffect {
    fn key(&self) -> Box<[u8]> {
        self.key.as_bytes().into()
    }

    fn value_hash(&self) -> u128 {
        self.value_hash
    }

    fn state_storage(&self) -> &EffectStateStorage {
        &self.lab.storage
    }

    fn kind(&self) -> &'static str {
        if self.behavior == Behavior::WriteOtherKind {
            "other"
        } else {
            "write"
        }
    }

    async fn apply(&self) -> Result<(), ApplyError> {
        let lab = &self.lab;
        let name = format!("{} {}", self.key, self.value_hash);
        if self.behavior == Behavior::GateBeforeApply {
            lab.push(format!("gated {name}"));
            let _ = lab.release.subscribe().wait_for(|open| *open).await;
        }
        self.lab
            .storage
            .run_apply::<LabError, _, _>(
                self.key(),
                self.kind(),
                self.value_hash,
                Some(async || {
                    lab.push(format!("start {name}"));
                    match self.behavior {
                        Behavior::Write | Behavior::WriteOtherKind | Behavior::GateBeforeApply => {}
                        Behavior::Block => {
                            let _ = lab.release.subscribe().wait_for(|open| *open).await;
                        }
                        Behavior::Panic => panic!("lab effect panicked"),
                        Behavior::PanicWithPanickingPayload => {
                            std::panic::panic_any(PanickingPayload)
                        }
                        Behavior::Reenter => {
                            let op = lab.nested.lock().expect("nested operation");
                            let nested =
                                read_strongly_consistent_and_apply_effects(op, |e| e).await;
                            let rejected = nested.is_err_and(|err| {
                                err.to_string().contains("inside an effect's apply")
                            });
                            lab.push(format!(
                                "nested publication {}",
                                if rejected { "rejected" } else { "not rejected" }
                            ));
                        }
                        Behavior::Count => {
                            let now = lab.in_flight.fetch_add(1, Ordering::SeqCst) + 1;
                            lab.max_in_flight.fetch_max(now, Ordering::SeqCst);
                            tokio::time::sleep(Duration::from_millis(5)).await;
                            lab.in_flight.fetch_sub(1, Ordering::SeqCst);
                        }
                    }
                    lab.push(format!("end {name}"));
                    Ok::<_, LabError>(())
                }),
            )
            .await
    }
}

/// Emits one effect per `key:behavior:hash` entry of `spec` (separated by `;`).
#[turbo_tasks::function(operation, root)]
async fn publish(lab: ResolvedVc<LabCell>, spec: RcStr) -> Result<Vc<()>> {
    let lab = lab.await?.lab.clone();
    for entry in spec.split(';') {
        let mut parts = entry.split(':');
        let key: RcStr = parts.next().unwrap().into();
        let behavior = Behavior::parse(parts.next().unwrap());
        let value_hash = parts.next().unwrap().parse()?;
        LabEffect {
            key,
            behavior: BEHAVIORS.iter().position(|b| *b == behavior).unwrap() as u8,
            value_hash,
            lab: lab.clone(),
        }
        .resolved_cell()
        .emit();
    }
    Ok(Vc::cell(()))
}

#[turbo_tasks::function(operation, root)]
async fn capture(operation: turbo_tasks::OperationVc<()>) -> Result<Vc<Effects>> {
    operation.read_strongly_consistent().await?;
    Ok(take_effects(operation).await?.cell())
}

fn tt() -> Arc<TurboTasks<TurboTasksBackend>> {
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            storage_mode: None,
            ..Default::default()
        },
        noop_backing_storage(),
    ))
}

async fn publish_spec(lab: &Arc<Lab>, spec: &str) -> Result<()> {
    read_strongly_consistent_and_apply_effects(
        capture(publish(
            LabCell { lab: lab.clone() }.resolved_cell(),
            spec.into(),
        )),
        |e| e,
    )
    .await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn same_key_and_hash_with_another_kind_is_applied() {
    let tt = tt();
    let lab = Lab::new();
    tt.run_once({
        let lab = lab.clone();
        async move {
            publish_spec(&lab, "out:write:7").await?;
            publish_spec(&lab, "out:other:7").await?;
            anyhow::Ok(())
        }
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
    assert_eq!(
        lab.log(),
        ["start out 7", "end out 7", "start out 7", "end out 7"]
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn publishing_from_inside_an_apply_is_rejected_without_deadlock() {
    let tt = tt();
    let lab = Lab::new();
    tokio::time::timeout(
        Duration::from_secs(10),
        tt.run_once({
            let lab = lab.clone();
            async move {
                *lab.nested.lock() = Some(capture(publish(
                    LabCell { lab: lab.clone() }.resolved_cell(),
                    "nested:write:1".into(),
                )));
                publish_spec(&lab, "out:reenter:1").await
            }
        }),
    )
    .await
    .expect("nested publication deadlocked")
    .unwrap();
    tt.stop_and_wait().await;
    assert!(
        lab.log()
            .contains(&"nested publication rejected".to_string())
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn cancelled_publication_drains_started_writes_before_releasing_claims() {
    let tt = tt();
    let lab = Lab::new();
    tt.run_once({
        let lab = lab.clone();
        async move {
            let mut first = Box::pin(publish_spec(&lab, "out:block:1"));
            tokio::time::timeout(Duration::from_secs(5), async {
                loop {
                    tokio::select! {
                        result = &mut first => panic!("blocked publication finished: {result:?}"),
                        _ = tokio::time::sleep(Duration::from_millis(5)) => {}
                    }
                    if lab.log().contains(&"start out 1".to_string()) {
                        break;
                    }
                }
            })
            .await?;
            // Cancel the caller while its write is running.
            drop(first);

            let second = publish_spec(&lab, "out:write:2");
            let release = async {
                tokio::time::sleep(Duration::from_millis(100)).await;
                assert_eq!(
                    lab.log(),
                    ["start out 1"],
                    "the next publication must wait for the cancelled write"
                );
                lab.release.send_replace(true);
            };
            let (second, ()) = futures::future::join(second, release).await;
            second?;
            anyhow::Ok(())
        }
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
    assert_eq!(
        lab.log(),
        ["start out 1", "end out 1", "start out 2", "end out 2"]
    );
}

/// A publication sharing only an already written key with a slower one does not wait for the slower
/// one's other writes.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn finished_write_releases_its_key_before_slower_siblings() {
    let tt = tt();
    let lab = Lab::new();
    tt.run_once({
        let lab = lab.clone();
        async move {
            let mut slow = Box::pin(publish_spec(&lab, "shared:write:1;private:block:1"));
            wait_for_log(&lab, &mut slow, &["end shared 1", "start private 1"]).await?;
            let unblocked =
                tokio::time::timeout(Duration::from_secs(5), publish_spec(&lab, "shared:write:1"))
                    .await;
            lab.release.send_replace(true);
            unblocked.expect("waited for an unrelated write")?;
            slow.await
        }
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
    let mut log = lab.log();
    log.sort();
    assert_eq!(
        log,
        [
            "end private 1",
            "end shared 1",
            "start private 1",
            "start shared 1"
        ],
        "each key is written once"
    );
}

/// A started write holds its key's claim before it reaches the per-key state machine, so a
/// publication whose plan still matches storage cannot commit until that write has finished.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn started_write_holds_its_claim_before_entering_run_apply() {
    let tt = tt();
    let lab = Lab::new();
    tt.run_once({
        let lab = lab.clone();
        async move {
            publish_spec(&lab, "out:write:0").await?;
            let mut writer = Box::pin(publish_spec(&lab, "out:pregate:1"));
            wait_for_log(&lab, &mut writer, &["gated out 1"]).await?;
            let mut matching = Box::pin(publish_spec(&lab, "out:write:0"));
            let early = tokio::select! {
                result = &mut matching => Some(result),
                _ = tokio::time::sleep(Duration::from_millis(50)) => None,
            };
            lab.release.send_replace(true);
            assert!(
                early.is_none(),
                "committed while a started write was pending: {early:?}"
            );
            let (writer, matching) = futures::future::join(writer, matching).await;
            writer?;
            matching?;
            anyhow::Ok(())
        }
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

/// Polls `publication` until `lab`'s log contains every entry of `entries`, failing if the
/// publication finishes first.
async fn wait_for_log(
    lab: &Lab,
    publication: &mut (impl Future<Output = Result<()>> + Unpin),
    entries: &[&str],
) -> Result<()> {
    let waited = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            tokio::select! {
                result = &mut *publication => panic!("publication finished early: {result:?}"),
                _ = tokio::time::sleep(Duration::from_millis(5)) => {}
            }
            let log = lab.log();
            if entries.iter().all(|entry| log.iter().any(|e| e == entry)) {
                break;
            }
        }
    })
    .await;
    if waited.is_err() {
        lab.release.send_replace(true);
    }
    Ok(waited?)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn panicking_write_drains_siblings_before_unwinding() {
    let tt = tt();
    let lab = Lab::new();
    let log = tt
        .run_once({
            let lab = lab.clone();
            async move {
                let mut publication = Box::pin(
                    AssertUnwindSafe(publish_spec(&lab, "a:block:1;b:panic:1")).catch_unwind(),
                );
                // Wait until both writes have started: `b` has panicked while `a` is blocked.
                tokio::time::timeout(Duration::from_secs(5), async {
                    loop {
                        tokio::select! {
                            _ = &mut publication => panic!("publication finished while a write was blocked"),
                            _ = tokio::time::sleep(Duration::from_millis(5)) => {}
                        }
                        let log = lab.log();
                        if log.contains(&"start a 1".to_string())
                            && log.contains(&"start b 1".to_string())
                        {
                            break;
                        }
                    }
                })
                .await?;
                // The panic must not propagate while `a` is still writing.
                tokio::select! {
                    _ = &mut publication => panic!("the panic propagated before its sibling finished"),
                    _ = tokio::time::sleep(Duration::from_millis(50)) => {}
                }
                lab.release.send_replace(true);
                let result = publication.await;
                assert!(result.is_err(), "the panic must propagate to the publisher");
                anyhow::Ok(lab.log())
            }
        })
        .await
        .unwrap();
    tt.stop_and_wait().await;
    assert!(
        log.contains(&"end a 1".to_string()),
        "the blocked sibling must finish before the panic propagates: {log:?}"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn dispatch_is_bounded() {
    let tt = tt();
    let lab = Lab::new();
    tt.run_once({
        let lab = lab.clone();
        async move {
            let spec = (0..1100)
                .map(|i| format!("k{i}:count:1"))
                .collect::<Vec<_>>()
                .join(";");
            publish_spec(&lab, &spec).await
        }
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
    assert_eq!(
        lab.log().iter().filter(|e| e.starts_with("end")).count(),
        1100
    );
    let max = lab.max_in_flight.load(Ordering::SeqCst);
    assert!(max <= 1024, "{max} applies ran at once");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn cancelled_drain_survives_a_panicking_panic_payload() {
    let tt = tt();
    let lab = Lab::new();
    tt.run_once({
        let lab = lab.clone();
        async move {
            let mut first = Box::pin(publish_spec(&lab, "a:badpanic:1;b:block:1"));
            tokio::time::timeout(Duration::from_secs(5), async {
                loop {
                    tokio::select! {
                        result = &mut first => panic!("blocked publication finished: {result:?}"),
                        _ = tokio::time::sleep(Duration::from_millis(5)) => {}
                    }
                    let log = lab.log();
                    if log.contains(&"start a 1".to_string())
                        && log.contains(&"start b 1".to_string())
                    {
                        break;
                    }
                }
            })
            .await?;
            // Let the panicking write finish, then cancel while `b` is still blocked.
            tokio::time::sleep(Duration::from_millis(20)).await;
            drop(first);

            let second = publish_spec(&lab, "b:write:2");
            let release = async {
                tokio::time::sleep(Duration::from_millis(100)).await;
                assert!(
                    !lab.log().contains(&"start b 2".to_string()),
                    "the next publication must wait for the blocked write"
                );
                lab.release.send_replace(true);
            };
            let (second, ()) = futures::future::join(second, release).await;
            second?;
            anyhow::Ok(())
        }
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
    let log = lab.log();
    let end_b1 = log.iter().position(|e| e == "end b 1").unwrap();
    let start_b2 = log.iter().position(|e| e == "start b 2").unwrap();
    assert!(end_b1 < start_b2, "{log:?}");
}

#[turbo_tasks::function(operation, root)]
async fn effects_of(lab: ResolvedVc<LabCell>, spec: RcStr) -> Result<Vc<Effects>> {
    let op = publish(lab, spec);
    op.read_strongly_consistent().await?;
    Ok(take_effects(op).await?.cell())
}

/// Returns another task's cell rather than one of its own.
#[turbo_tasks::function(operation, root)]
fn chained(lab: ResolvedVc<LabCell>, spec: RcStr) -> Vc<Effects> {
    effects_of(lab, spec).connect()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn publishing_a_root_without_its_own_cell_fails_clearly() {
    let tt = tt();
    let lab = Lab::new();
    let error = tt
        .run_once({
            let lab = lab.clone();
            async move {
                read_strongly_consistent_and_apply_effects(
                    chained(
                        LabCell { lab: lab.clone() }.resolved_cell(),
                        "out:write:1".into(),
                    ),
                    |e| e,
                )
                .await?;
                anyhow::Ok(())
            }
        })
        .await
        .unwrap_err();
    tt.stop_and_wait().await;
    assert!(
        format!("{error:#}").contains("returns its own cell"),
        "{error:#}"
    );
    assert!(lab.log().is_empty(), "nothing must be written");
}

/// Publication overhead without disk IO: the full protocol against an unclaimed, unvalidated
/// apply of the same plans in the same process.
///
/// `cargo test --release -p turbo-tasks-backend --test publication -- --ignored --nocapture`
#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
#[ignore]
async fn publication_overhead() {
    for (roots, private, shared) in [(1usize, 5000usize, 0usize), (128, 10, 40)] {
        let tt = tt();
        let lab = Lab::new();
        let (protocol, unclaimed) = tt
            .run_once({
                let lab = lab.clone();
                async move {
                    let cell = LabCell { lab: lab.clone() }.resolved_cell();
                    let mut protocol = Vec::new();
                    let mut unclaimed = Vec::new();
                    for round in 0..30u32 {
                        let ops: Vec<_> = (0..roots)
                            .map(|r| {
                                let mut spec: Vec<String> = (0..private)
                                    .map(|i| format!("r{r}f{i}:write:{round}"))
                                    .collect();
                                spec.extend((0..shared).map(|i| format!("s{i}:write:{round}")));
                                capture(publish(cell, spec.join(";").into()))
                            })
                            .collect();
                        for op in &ops {
                            op.read_strongly_consistent().await?;
                        }
                        // Alternate which variant writes, so each measures fresh writes.
                        let start = std::time::Instant::now();
                        if round % 2 == 0 {
                            futures::future::try_join_all(
                                ops.iter().map(|op| {
                                    read_strongly_consistent_and_apply_effects(*op, |e| e)
                                }),
                            )
                            .await?;
                            protocol.push(start.elapsed());
                        } else {
                            futures::future::try_join_all(ops.iter().map(|op| async {
                                op.read_strongly_consistent()
                                    .await?
                                    .apply_for_testing()
                                    .await?;
                                anyhow::Ok(())
                            }))
                            .await?;
                            unclaimed.push(start.elapsed());
                        }
                    }
                    anyhow::Ok((protocol, unclaimed))
                }
            })
            .await
            .unwrap();
        tt.stop_and_wait().await;
        let median = |mut v: Vec<Duration>| {
            v.sort();
            v[v.len() / 2]
        };
        println!(
            "OVERHEAD roots={roots} private={private} shared={shared}: protocol={:?} \
             unclaimed={:?}",
            median(protocol),
            median(unclaimed)
        );
    }
}
