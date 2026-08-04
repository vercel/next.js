//! Allocation-free job representation (the rayon `StackJob`/`JobRef` pattern).
//!
//! A `join` keeps its second closure, result slot, and completion latch on its **stack
//! frame** and pushes a type-erased pointer (`JobRef`) onto the deque. This is sound
//! because `join` does not return until the job has been observed complete (its latch is
//! set), so the pointer never outlives the frame. This removes the ~3 heap allocations +
//! mutex/condvar per fork that a boxed-closure design pays, matching rayon's overhead.
//!
//! `HeapJob` is the owned fallback for fire-and-forget `spawn` / the root `run` job, where
//! there is no stack frame to anchor to.

use std::{
    cell::UnsafeCell,
    panic::{AssertUnwindSafe, catch_unwind, resume_unwind},
    sync::atomic::{AtomicU8, Ordering::*},
    thread,
};

use crate::WorkerHandle;

/// A type-erased pointer to a job plus its monomorphized execute function. `Copy` so it
/// flows through the deque cheaply.
#[derive(Clone, Copy)]
pub(crate) struct JobRef {
    pointer: *const (),
    execute_fn: unsafe fn(*const (), &WorkerHandle),
    /// The recursion depth this job should run at, so granularity control (share shallow,
    /// inline deep) is preserved when the job is executed by a thief that stole it.
    pub(crate) depth: u32,
    /// WaitGraph token identifying this forked job (high-bit-set, disjoint from task tokens),
    /// or `0` for untracked jobs (`HeapJob` / the root). Whichever worker runs the job owns
    /// this token for the duration (`begin_compute`/`end_compute` in `run_chunk`), so a
    /// fork/join wait on it (`wait_for_job`) participates in cross-layer cycle detection.
    pub(crate) token: u64,
    /// Whether this job was forked from inside an `owning` region — i.e. it is part of
    /// computing some task. A thief that runs it must itself become `owning` for the
    /// duration, so it will not steal *unrelated* task-blocking work onto this frozen chunk
    /// stack (which would strand the ancestor's in-progress token and can deadlock). Without
    /// this, a stolen `par_map` chunk runs non-owning and its `wait_for_job` steals freely.
    pub(crate) owning: bool,
}

// SAFETY: a `JobRef` is only ever executed once, on whichever worker pops it; the pointed-to
// job's `Send` bounds (enforced at construction) make that sound.
unsafe impl Send for JobRef {}

impl JobRef {
    /// SAFETY: must be called at most once, and the pointed-to job must still be alive
    /// (guaranteed by the `join` frame blocking until its latch is set, or by `HeapJob`
    /// ownership transfer).
    pub(crate) unsafe fn execute(self, w: &WorkerHandle) {
        unsafe { (self.execute_fn)(self.pointer, w) }
    }
}

/// A bare atomic completion flag. No stored waiter / mutex / condvar, so `set` is a single
/// release store that never touches `self` again — which also means the waiting frame can
/// be freed the instant after, with no use-after-free hazard.
///
/// In fork-join mode the waiter never parks (it steals while waiting), so it just polls
/// `is_set`. In `owning` mode the waiter polls with short timed parks (`wait`); a real
/// unpark fast-path can be layered on later if owning-mode wait latency matters.
pub(crate) struct Latch {
    state: AtomicU8,
}
const UNSET: u8 = 0;
const SET: u8 = 1;

impl Latch {
    pub(crate) fn new() -> Latch {
        Latch {
            state: AtomicU8::new(UNSET),
        }
    }
    pub(crate) fn is_set(&self) -> bool {
        self.state.load(Acquire) == SET
    }
    /// Mark complete. Single release store; must not touch `self` afterwards (the waiter
    /// may observe this and free the frame immediately).
    pub(crate) fn set(&self) {
        self.state.store(SET, Release);
    }
    /// Poll until set, sleeping in short bounded intervals between checks.
    pub(crate) fn wait(&self) {
        while self.state.load(Acquire) != SET {
            thread::park_timeout(std::time::Duration::from_micros(200));
        }
    }
}

/// A job whose state (closure, result, latch) lives on the forking frame's stack.
pub(crate) struct StackJob<B, R> {
    latch: Latch,
    func: UnsafeCell<Option<B>>,
    result: UnsafeCell<Option<thread::Result<R>>>,
}

impl<B, R> StackJob<B, R>
where
    B: FnOnce(&WorkerHandle) -> R + Send,
    R: Send,
{
    pub(crate) fn new(b: B) -> StackJob<B, R> {
        StackJob {
            latch: Latch::new(),
            func: UnsafeCell::new(Some(b)),
            result: UnsafeCell::new(None),
        }
    }

    pub(crate) fn latch(&self) -> &Latch {
        &self.latch
    }

    pub(crate) fn as_job_ref(&self, depth: u32, token: u64, owning: bool) -> JobRef {
        JobRef {
            pointer: self as *const _ as *const (),
            execute_fn: Self::execute,
            depth,
            token,
            owning,
        }
    }

    unsafe fn execute(this: *const (), w: &WorkerHandle) {
        // SAFETY: `this` points at a live `StackJob<B, R>` (its `join` frame is parked on
        // the latch); we are the sole executor of this ref, so the `UnsafeCell` accesses
        // do not race.
        let job = unsafe { &*(this as *const Self) };
        let b = unsafe { (*job.func.get()).take().unwrap() };
        let res = catch_unwind(AssertUnwindSafe(|| b(w)));
        unsafe { *job.result.get() = Some(res) };
        job.latch.set();
    }

    /// SAFETY: call only after the latch is set (the job has executed).
    pub(crate) unsafe fn into_result(self) -> R {
        match self
            .result
            .into_inner()
            .expect("job executed before into_result")
        {
            Ok(r) => r,
            Err(panic) => resume_unwind(panic),
        }
    }
}

/// An owned, heap-allocated job for `spawn` / `run`, where there is no stack frame to
/// anchor a `StackJob` to. Executing it reclaims and drops the box.
pub(crate) struct HeapJob<F> {
    func: F,
}

impl<F> HeapJob<F>
where
    F: FnOnce(&WorkerHandle) + Send + 'static,
{
    pub(crate) fn boxed(func: F) -> Box<HeapJob<F>> {
        Box::new(HeapJob { func })
    }

    pub(crate) fn into_job_ref(self: Box<Self>, depth: u32) -> JobRef {
        // Fire-and-forget / root jobs are not fork/join children anyone waits on by token
        // (token 0), and a `spawn`/root job is an independent unit of work, not a chunk of
        // a task being computed by its creator, so it does not inherit owning-ness.
        self.into_job_ref_tracked(depth, 0, false)
    }

    /// Like [`into_job_ref`][Self::into_job_ref] but with an explicit `WaitGraph` token and
    /// owning flag — for [`crate::JobSource`] jobs, whose owner `managed_block`s on the
    /// token while the job runs on another worker, and which are part of computing the
    /// owner's task (so their runner must be `owning`).
    pub(crate) fn into_job_ref_tracked(
        self: Box<Self>,
        depth: u32,
        token: u64,
        owning: bool,
    ) -> JobRef {
        JobRef {
            pointer: Box::into_raw(self) as *const (),
            execute_fn: Self::execute,
            depth,
            token,
            owning,
        }
    }

    unsafe fn execute(this: *const (), w: &WorkerHandle) {
        // SAFETY: `this` came from `Box::into_raw` in `into_job_ref` and is executed once.
        let job = unsafe { Box::from_raw(this as *mut Self) };
        (job.func)(w);
    }
}
