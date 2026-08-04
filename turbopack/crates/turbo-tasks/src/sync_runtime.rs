//! Synchronous turbo-tasks execution runtime (the inline-compute engine).
//!
//! This is the real, no-tokio execution model: a task that reads an uncomputed
//! dependency computes it inline on the current thread (recursion), so the call
//! stack is the dependency chain.
//!
//! Only compiled under the `sync` feature.

use std::{
    future::Future,
    pin::pin,
    task::{Context, Poll, RawWaker, RawWakerVTable, Waker},
};

/// A no-op waker: synchronous task bodies never register real wakeups, so polling
/// never needs to be re-driven by a reactor.
fn noop_waker() -> Waker {
    fn clone(_: *const ()) -> RawWaker {
        RawWaker::new(std::ptr::null(), &VTABLE)
    }
    fn noop(_: *const ()) {}
    static VTABLE: RawWakerVTable = RawWakerVTable::new(clone, noop, noop, noop);
    // SAFETY: the vtable's functions are all no-ops and ignore the data pointer, so a
    // null data pointer is sound.
    unsafe { Waker::from_raw(RawWaker::new(std::ptr::null(), &VTABLE)) }
}

/// Drive `future` to completion synchronously, on the current thread, with no async
/// runtime.
///
/// In the synchronous model a task body has no real suspension points — every
/// dependency read is a `read!` (a synchronous call that computes inline), not an
/// `.await`. Therefore the body's future is always `Ready` after a single poll.
///
/// If it returns `Pending`, that means a genuine suspension point survived into a
/// sync build — almost always a raw `.await` that the Phase-3 codemod missed (it
/// should be `read!`/`parallel!`). We panic with a clear diagnostic rather than
/// spin, since there is no reactor to make progress.
pub fn sync_poll<F: Future>(future: F) -> F::Output {
    let waker = noop_waker();
    let mut cx = Context::from_waker(&waker);
    let mut future = pin!(future);
    match future.as_mut().poll(&mut cx) {
        Poll::Ready(output) => output,
        Poll::Pending => panic!(
            "sync turbo-tasks: a task future returned `Pending`, but the synchronous runtime has \
             no reactor to resume it. This means a real suspension point (a raw `.await`) \
             survived into a `sync` build — it should be `read!` or `parallel!`."
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::sync_poll;

    #[test]
    fn drives_a_ready_future() {
        assert_eq!(sync_poll(async { 1 + 2 }), 3);
    }

    #[test]
    fn drives_a_future_with_nested_ready_awaits() {
        // Awaiting already-ready futures still completes in a single poll — this is
        // exactly the shape of a sync task body whose `read!`s resolve inline.
        let out = sync_poll(async {
            let a = async { 10 }.await;
            let b = async { 20 }.await;
            a + b
        });
        assert_eq!(out, 30);
    }

    #[test]
    #[should_panic(expected = "returned `Pending`")]
    fn panics_on_genuine_suspension() {
        sync_poll(std::future::pending::<()>());
    }
}
