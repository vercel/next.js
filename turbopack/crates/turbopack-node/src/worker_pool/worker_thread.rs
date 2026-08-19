use std::{
    collections::VecDeque,
    sync::{Arc, OnceLock},
};

use bytes::Bytes;
use napi::{
    Status,
    bindgen_prelude::Unknown,
    threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use napi_derive::napi;
use parking_lot::Mutex;
use tokio::sync::oneshot;
use turbo_rcstr::RcStr;

use crate::worker_pool::{
    WorkerOptions,
    operation::{TaskMessage, WORKER_POOL_OPERATION},
};

type FatalThreadsafeFunction<T> = ThreadsafeFunction<
    T,
    Unknown<'static>,
    T,
    Status,
    /* CalleeHandled */ false,
    /* Weak */ true,
>;

static WORKER_CREATOR: OnceLock<FatalThreadsafeFunction<NapiWorkerCreation>> = OnceLock::new();

static WORKER_TERMINATOR: OnceLock<FatalThreadsafeFunction<NapiWorkerTermination>> =
    OnceLock::new();

static PENDING_CREATIONS: OnceLock<Mutex<VecDeque<oneshot::Sender<u32>>>> = OnceLock::new();

// Allow dead_code for test builds where napi exports are not entry points
#[allow(dead_code)]
#[napi]
pub fn register_worker_scheduler(
    #[napi(ts_arg_type = "(arg: NapiWorkerCreation) => any")] creator: FatalThreadsafeFunction<
        NapiWorkerCreation,
    >,
    #[napi(ts_arg_type = "(arg: NapiWorkerTermination) => any")]
    terminator: FatalThreadsafeFunction<NapiWorkerTermination>,
) -> napi::Result<()> {
    WORKER_CREATOR
        .set(creator)
        .map_err(|_| napi::Error::from_reason("Worker creator already registered"))?;
    WORKER_TERMINATOR
        .set(terminator)
        .map_err(|_| napi::Error::from_reason("Worker terminator already registered"))
}

pub async fn create_worker(options: Arc<WorkerOptions>) -> anyhow::Result<u32> {
    let (tx, rx) = oneshot::channel();

    let napi_options = (&options).into();

    {
        let pending = PENDING_CREATIONS.get_or_init(|| Mutex::new(VecDeque::new()));
        // ensure pool entry exists for these options so scale ops can observe it
        WORKER_POOL_OPERATION
            .pools
            .lock()
            .entry(options.clone())
            .or_default();
        pending.lock().push_back(tx);
    }

    if let Some(creator) = WORKER_CREATOR.get() {
        creator.call(
            NapiWorkerCreation {
                options: napi_options,
            },
            ThreadsafeFunctionCallMode::NonBlocking,
        );
    } else {
        anyhow::bail!("Worker creator not registered");
    }

    let worker_id = rx.await?;
    Ok(worker_id)
}

// Allow dead_code for test builds where napi exports are not entry points
#[allow(dead_code)]
#[napi]
pub fn worker_created(worker_id: u32) {
    if let Some(pending) = PENDING_CREATIONS.get()
        && let Some(tx) = pending.lock().pop_front()
    {
        let _ = tx.send(worker_id);
    }
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
