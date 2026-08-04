//! Testing utilities and macros for turbo-tasks and applications based on it.

pub mod retry;
mod run;

/// Dual-mode test sleep. In the async build it expands to `tokio::time::sleep(d).await`
/// (so it works in both `async fn` bodies and async test blocks). In the no-tokio
/// `sync` build it is a no-op: the inline engine has no background work to wait for, so
/// sleeps used to let async recomputation/aggregation settle are unnecessary. Works in
/// `#[turbo_tasks::function]` bodies too (which become non-async under `sync`).
#[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
#[macro_export]
macro_rules! sleep {
    ($d:expr) => {
        ::tokio::time::sleep($d).await
    };
}

#[cfg(feature = "sync")]
#[macro_export]
macro_rules! sleep {
    ($d:expr) => {{
        // A real blocking sleep. The sync engine IS concurrent (rayon `parallel!`, and
        // tests may spawn `std::thread`s, e.g. a background eviction loop), so sleeps that
        // let other threads interleave must actually pass time. For settling-only sleeps
        // this is just harmless extra latency.
        ::std::thread::sleep($d)
    }};
}

/// Dual-mode concurrent read. In the async build it expands to `tokio::try_join!`
/// (reads run concurrently across worker threads). In the no-tokio `sync` build it
/// reads each future sequentially and inline (`read!`). Returns `anyhow::Result<(..)>`,
/// matching `tokio::try_join!`'s `.unwrap()`/`?` call sites in the tests.
#[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
#[macro_export]
macro_rules! try_join {
    ($($f:expr),+ $(,)?) => {
        ::tokio::try_join!($($f),+)
    };
}

#[cfg(feature = "sync")]
#[macro_export]
macro_rules! try_join {
    ($($f:expr),+ $(,)?) => {
        (|| -> ::anyhow::Result<_> {
            ::core::result::Result::Ok(($(::turbo_tasks::read!($f)?,)+))
        })()
    };
}

/// Dual-mode "run this async block on a separate task/thread and join it". Used by
/// tests that isolate a worker-thread panic. In the async build it is
/// `tokio::task::spawn(async move { .. }).await`; in the no-tokio `sync` build it runs
/// the block on a real OS thread (`std::thread::spawn`, driven by `sync_poll`) and
/// `join()`s it — a panic still unwinds on a separate thread (firing the panic hook)
/// and is reported back. Both arms return a `Result` you can ignore or inspect.
#[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
#[macro_export]
macro_rules! spawn_join {
    ($body:block) => {
        ::tokio::task::spawn(async move { $body }).await
    };
}

#[cfg(feature = "sync")]
#[macro_export]
macro_rules! spawn_join {
    ($body:block) => {
        ::std::thread::spawn(move || {
            ::turbo_tasks::macro_helpers::sync_poll_test(async move { $body })
        })
        .join()
    };
}

/// Dual-mode bounded read used by hang-catching tests: `timeout!(dur, fut)` followed by
/// `.await`. In the async build it is `tokio::time::timeout(dur, fut)` (yields
/// `Result<Out, Elapsed>`). In the no-tokio `sync` build it drives `fut` inline and yields
/// `Result<Out, ()>` (always `Ok`) — the hang protection comes from the engine's own
/// `SYNC_DEADLOCK_TIMEOUT` guard, which panics on a stuck read. The `.unwrap_or_else(|_| ..)`
/// at call sites works for either error type.
#[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
#[macro_export]
macro_rules! timeout {
    ($d:expr, $f:expr) => {
        ::tokio::time::timeout($d, $f)
    };
}

#[cfg(feature = "sync")]
#[macro_export]
macro_rules! timeout {
    ($d:expr, $f:expr) => {
        async {
            let _: ::core::time::Duration = $d;
            ::core::result::Result::<_, ()>::Ok(::turbo_tasks::read!($f))
        }
    };
}

pub use crate::run::{
    Registration, TestInstance, run, run_once, run_once_without_cache_check, run_with_tt,
    run_without_cache_check, test_instance,
};
