use std::sync::{
    Arc, OnceLock,
    atomic::{AtomicU64, Ordering},
};

use bytes::Bytes;
use napi::{
    Env,
    threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use napi_derive::napi;
use parking_lot::Mutex;
use rustc_hash::FxHashMap;
use tokio::sync::oneshot;
use turbo_rcstr::RcStr;

use crate::worker_pool::{
    WorkerOptions,
    operation::{TaskMessage, WORKER_POOL_OPERATION},
};

static WORKER_CREATOR: OnceLock<ThreadsafeFunction<NapiWorkerCreation, ErrorStrategy::Fatal>> =
    OnceLock::new();

static WORKER_TERMINATOR: OnceLock<
    ThreadsafeFunction<NapiWorkerTermination, ErrorStrategy::Fatal>,
> = OnceLock::new();

/// A creation announced to the JS side whose worker has not checked in yet.
struct PendingCreation {
    sender: oneshot::Sender<u32>,
}

/// Creations in flight, keyed by a nonce that is handed to the JS creator and
/// announced back by the booted worker (and by the exit handler). The nonce
/// correlation replaces the previous global FIFO, which mis-paired workers
/// and acquirers across pools and after any canceled/failed creation.
static PENDING_CREATIONS: OnceLock<Mutex<FxHashMap<u64, PendingCreation>>> = OnceLock::new();

static NEXT_CREATION_NONCE: AtomicU64 = AtomicU64::new(1);

// Allow dead_code for test builds where napi exports are not entry points
#[allow(dead_code)]
#[napi]
pub fn register_worker_scheduler(
    env: Env,
    creator: ThreadsafeFunction<NapiWorkerCreation, ErrorStrategy::Fatal>,
    terminator: ThreadsafeFunction<NapiWorkerTermination, ErrorStrategy::Fatal>,
) -> napi::Result<()> {
    // Unref ThreadsafeFunction so it doesn't keep the Node.js event loop alive.
    // Call unref on the functions before storing them globally.
    let creator_unrefed = {
        let mut c = creator;
        // Safe to call unref; if the napi crate provides this method it will drop the ref
        // preventing the ThreadsafeFunction from keeping the loop alive.
        let _ = c.unref(&env);
        c
    };
    let terminator_unrefed = {
        let mut t = terminator;
        let _ = t.unref(&env);
        t
    };

    WORKER_CREATOR
        .set(creator_unrefed)
        .map_err(|_| napi::Error::from_reason("Worker creator already registered"))?;
    WORKER_TERMINATOR
        .set(terminator_unrefed)
        .map_err(|_| napi::Error::from_reason("Worker terminator already registered"))
}

pub async fn create_worker(options: Arc<WorkerOptions>) -> anyhow::Result<u32> {
    let (tx, rx) = oneshot::channel();
    let nonce = NEXT_CREATION_NONCE.fetch_add(1, Ordering::Relaxed);

    let napi_options = (&options).into();

    {
        let pending = PENDING_CREATIONS.get_or_init(|| Mutex::new(FxHashMap::default()));
        // ensure pool entry exists for these options so scale ops can observe it
        WORKER_POOL_OPERATION
            .pools
            .lock()
            .entry(options.clone())
            .or_default();
        pending.lock().insert(nonce, PendingCreation { sender: tx });
    }

    // If this future is dropped while waiting (caller canceled), drop the
    // pending entry so the eventual announcement is recognized as unclaimed
    // and the booted worker is terminated instead of retained forever.
    let _guard = PendingCreationGuard { nonce };

    if let Some(creator) = WORKER_CREATOR.get() {
        creator.call(
            NapiWorkerCreation {
                options: napi_options,
                nonce: nonce as f64,
            },
            ThreadsafeFunctionCallMode::NonBlocking,
        );
    } else {
        anyhow::bail!("Worker creator not registered");
    }

    let worker_id = rx.await?;
    Ok(worker_id)
}

struct PendingCreationGuard {
    nonce: u64,
}

impl Drop for PendingCreationGuard {
    fn drop(&mut self) {
        if let Some(pending) = PENDING_CREATIONS.get() {
            pending.lock().remove(&self.nonce);
        }
    }
}

/// The result of pairing a booted worker with its pending creation.
#[derive(Debug, PartialEq, Eq)]
enum ClaimOutcome {
    /// The acquirer received the worker id.
    Claimed,
    /// The creation was canceled or unknown; the unclaimed worker was asked
    /// to terminate so it is not retained by the JS worker map forever.
    Unclaimed,
}

fn claim_worker(worker_id: u32, nonce: u64, options: Arc<WorkerOptions>) -> ClaimOutcome {
    let creation = PENDING_CREATIONS
        .get()
        .and_then(|pending| pending.lock().remove(&nonce));
    match creation {
        Some(creation) => {
            if creation.sender.send(worker_id).is_ok() {
                ClaimOutcome::Claimed
            } else {
                // The acquirer was canceled while the worker was booting.
                terminate_worker(options, worker_id);
                ClaimOutcome::Unclaimed
            }
        }
        None => {
            // Announcement for a canceled or otherwise unknown creation.
            terminate_worker(options, worker_id);
            ClaimOutcome::Unclaimed
        }
    }
}

/// Fails the pending creation for `nonce`, if one exists, so the acquirer
/// stops waiting and the boot failure surfaces as an error (which the pool
/// retries) instead of hanging forever.
fn fail_pending_creation(nonce: u64) -> bool {
    PENDING_CREATIONS
        .get()
        .and_then(|pending| pending.lock().remove(&nonce))
        .is_some()
}

// Allow dead_code for test builds where napi exports are not entry points
#[allow(dead_code)]
#[napi]
pub fn worker_created(worker_id: u32, nonce: f64, options: NapiWorkerOptions) {
    let options = Arc::new(WorkerOptions {
        filename: options.filename,
        cwd: options.cwd,
    });
    claim_worker(worker_id, nonce as u64, options);
}

// Allow dead_code for test builds where napi exports are not entry points
#[allow(dead_code)]
#[napi]
pub fn worker_exited(termination: NapiWorkerTermination, nonce: f64) {
    // A worker that died before announcing itself fails its pending creation;
    // for an announced worker this is a no-op.
    fail_pending_creation(nonce as u64);
    let options = Arc::new(WorkerOptions {
        filename: termination.options.filename,
        cwd: termination.options.cwd,
    });
    WORKER_POOL_OPERATION.worker_exited(options, termination.worker_id);
}

pub fn terminate_worker(options: Arc<WorkerOptions>, worker_id: u32) {
    if let Some(terminator) = WORKER_TERMINATOR.get() {
        terminator.call(
            NapiWorkerTermination {
                options: options.into(),
                worker_id,
            },
            ThreadsafeFunctionCallMode::NonBlocking,
        );
    }
}

#[napi(object)]
pub struct NapiWorkerCreation {
    pub options: NapiWorkerOptions,
    /// Opaque creation nonce (a u64 passed as f64). The JS creator forwards
    /// it to the worker's `workerData`; the booted worker announces it back
    /// in `workerCreated`, and the exit handler reports it in `workerExited`.
    pub nonce: f64,
}

#[napi(object)]
pub struct NapiWorkerOptions {
    pub filename: RcStr,
    pub cwd: RcStr,
}

impl<T> From<T> for NapiWorkerOptions
where
    T: AsRef<WorkerOptions>,
{
    fn from(pool_options: T) -> Self {
        let WorkerOptions { filename, cwd } = pool_options.as_ref();
        NapiWorkerOptions {
            filename: filename.clone(),
            cwd: cwd.clone(),
        }
    }
}

#[napi(object)]
pub struct NapiWorkerTermination {
    pub options: NapiWorkerOptions,
    pub worker_id: u32,
}

// Allow dead_code for test builds where napi exports are not entry points
#[allow(dead_code)]
#[napi(object)]
pub struct NapiTaskMessage {
    pub task_id: u32,
    pub data: napi::bindgen_prelude::Buffer,
}

impl From<NapiTaskMessage> for TaskMessage {
    fn from(message: NapiTaskMessage) -> Self {
        let NapiTaskMessage { task_id, data } = message;
        TaskMessage {
            task_id,
            // Copy out of the JS Buffer rather than retaining a napi reference
            // (`Bytes::from_owner`). Because `send_task_message` is a *sync*
            // `#[napi]` fn, this runs on the env thread, so the `Buffer` is
            // dropped here via a direct `napi_reference_unref`. It never crosses
            // to a tokio/turbo-tasks thread, so the global CustomGC
            // ThreadsafeFunction (napi-rs#3357) is never
            // invoked for our task payloads.
            data: Bytes::copy_from_slice(&data),
        }
    }
}

// Allow dead_code for test builds where napi exports are not entry points
#[allow(dead_code)]
#[napi]
pub async fn recv_task_message_in_worker(worker_id: u32) -> napi::Result<NapiTaskMessage> {
    let (task_id, message) = WORKER_POOL_OPERATION
        .recv_task_message_in_worker(worker_id)
        .await?;
    Ok(NapiTaskMessage {
        task_id,
        data: Vec::from(message).into(),
    })
}

// Allow dead_code for test builds where napi exports are not entry points
#[allow(dead_code)]
#[napi]
pub fn send_task_message(message: NapiTaskMessage) -> napi::Result<()> {
    Ok(WORKER_POOL_OPERATION.send_task_message(message.into())?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_options() -> Arc<WorkerOptions> {
        Arc::new(WorkerOptions {
            filename: "creation-test.js".into(),
            cwd: "/".into(),
        })
    }

    fn insert_pending(nonce: u64, sender: oneshot::Sender<u32>) {
        PENDING_CREATIONS
            .get_or_init(|| Mutex::new(FxHashMap::default()))
            .lock()
            .insert(nonce, PendingCreation { sender });
    }

    /// The nonce pairs each announced worker with exactly its own acquirer,
    /// across pools and interleaved creations.
    #[test]
    fn claim_pairs_announced_worker_with_its_acquirer() {
        let nonce = 9_000_000_001_u64;
        let (tx, rx) = oneshot::channel::<u32>();
        insert_pending(nonce, tx);
        assert_eq!(
            claim_worker(42, nonce, test_options()),
            ClaimOutcome::Claimed
        );
        assert_eq!(rx.blocking_recv().unwrap(), 42);
    }

    /// An announcement for a canceled/unknown creation must terminate the
    /// unclaimed worker rather than let the JS map retain it forever.
    #[test]
    fn claim_unknown_nonce_is_unclaimed() {
        assert_eq!(
            claim_worker(43, 9_000_000_002, test_options()),
            ClaimOutcome::Unclaimed
        );
    }

    /// An acquirer canceled while its worker was booting must not strand the
    /// fresh worker.
    #[test]
    fn claim_canceled_acquirer_is_unclaimed() {
        let nonce = 9_000_000_003_u64;
        let (tx, rx) = oneshot::channel::<u32>();
        drop(rx);
        insert_pending(nonce, tx);
        assert_eq!(
            claim_worker(44, nonce, test_options()),
            ClaimOutcome::Unclaimed
        );
    }

    /// A worker that dies before announcing fails its pending creation so the
    /// acquirer stops waiting instead of hanging forever.
    #[test]
    fn fail_pending_creation_unblocks_acquirer() {
        let nonce = 9_000_000_004_u64;
        let (tx, rx) = oneshot::channel::<u32>();
        insert_pending(nonce, tx);
        assert!(fail_pending_creation(nonce));
        assert!(rx.blocking_recv().is_err());
        // A duplicate exit report is a no-op.
        assert!(!fail_pending_creation(nonce));
    }

    /// A creation that fails before reaching JS must not leave a stale
    /// pending entry behind.
    #[tokio::test(flavor = "current_thread")]
    async fn create_worker_without_creator_leaves_no_pending_entry() {
        let nonce_before = NEXT_CREATION_NONCE.load(Ordering::Relaxed);
        let result = create_worker(test_options()).await;
        assert!(result.is_err());
        let pending = PENDING_CREATIONS.get().unwrap();
        let pending = pending.lock();
        for nonce in nonce_before..=NEXT_CREATION_NONCE.load(Ordering::Relaxed) {
            assert!(!pending.contains_key(&nonce));
        }
    }
}
