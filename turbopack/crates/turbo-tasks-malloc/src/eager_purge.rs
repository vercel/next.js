//! Temporarily makes mimalloc return freed memory to the OS immediately.
//!
//! This changes mimalloc's process-wide `purge_delay` option at runtime, while other threads keep
//! allocating and freeing. mimalloc documents `mi_option_set` as not thread-safe: the option is a
//! plain `long` that allocator threads read without synchronization, so this is formally a data
//! race. It's benign in practice:
//! - The option value is a naturally aligned `long` (word-sized or smaller), which supported
//!   targets read and write without tearing, so a concurrent reader sees either the old or the new
//!   delay.
//! - The delay only controls purge timing: whether a range of freed memory is returned to the OS
//!   right away or after a delay. It plays no part in allocation bookkeeping, so either value is
//!   correct and there is no memory-safety consequence.
//! - It changes rarely: once when the first guard is created and once when the last one is dropped.

/// mimalloc's `purge_delay` option.
#[cfg(all(feature = "custom_allocator", not(target_family = "wasm"), not(miri)))]
const MI_OPTION_PURGE_DELAY: mimalloc::sys::mi_option_t = mimalloc::sys::mi_option_purge_delay;

#[cfg(all(feature = "custom_allocator", not(target_family = "wasm"), not(miri)))]
mod imp {
    use std::{os::raw::c_long, sync::Mutex};

    use super::MI_OPTION_PURGE_DELAY;

    struct State {
        /// Number of live guards.
        active: usize,
        /// The purge delay to restore when the last guard is dropped, or `None` if it wasn't
        /// changed.
        previous: Option<c_long>,
    }

    static STATE: Mutex<State> = Mutex::new(State {
        active: 0,
        previous: None,
    });

    pub(super) fn get() -> c_long {
        mimalloc::option_get(MI_OPTION_PURGE_DELAY)
    }

    fn set(value: c_long) {
        // Allocator threads read the option concurrently, see the module docs for why that's
        // benign.
        mimalloc::option_set(MI_OPTION_PURGE_DELAY, value)
    }

    pub(super) fn enter() {
        let mut state = STATE.lock().unwrap_or_else(|e| e.into_inner());
        if state.active == 0 {
            let previous = get();
            // A negative delay means purging is disabled (e.g. via `MIMALLOC_PURGE_DELAY=-1`), and
            // zero means it's already eager: leave both alone.
            if previous > 0 {
                set(0);
                state.previous = Some(previous);
            }
        }
        state.active += 1;
    }

    pub(super) fn exit() {
        let mut state = STATE.lock().unwrap_or_else(|e| e.into_inner());
        state.active -= 1;
        if state.active == 0
            && let Some(previous) = state.previous.take()
        {
            set(previous);
        }
    }
}

/// While alive, the allocator returns memory to the OS as soon as it's freed, instead of after
/// a delay. Created by [`TurboMalloc::enter_eager_purge_mode`].
///
/// Entering and leaving the mode changes mimalloc's `purge_delay` option while other threads use
/// the allocator. mimalloc documents changing options as not thread-safe; this is a benign race:
/// the value is an aligned `long` that is read without tearing on supported targets, and it only
/// decides when freed memory is returned to the OS, not how allocations are tracked.
///
/// [`TurboMalloc::enter_eager_purge_mode`]: crate::TurboMalloc::enter_eager_purge_mode
#[must_use = "eager purge mode ends when the guard is dropped"]
pub struct EagerPurgeGuard {
    _private: (),
}

impl EagerPurgeGuard {
    pub(crate) fn new() -> Self {
        #[cfg(all(feature = "custom_allocator", not(target_family = "wasm"), not(miri)))]
        imp::enter();
        Self { _private: () }
    }
}

impl Drop for EagerPurgeGuard {
    fn drop(&mut self) {
        #[cfg(all(feature = "custom_allocator", not(target_family = "wasm"), not(miri)))]
        imp::exit();
    }
}

#[cfg(all(
    test,
    feature = "custom_allocator",
    not(target_family = "wasm"),
    not(miri)
))]
mod tests {
    use std::{
        panic::{AssertUnwindSafe, catch_unwind},
        sync::{Arc, Barrier},
        thread,
    };

    use super::imp::get;
    use crate::TurboMalloc;

    /// The only test that changes the purge delay, since it's process-wide.
    #[test]
    fn guards_set_and_restore_purge_delay() {
        let set = |value| mimalloc::option_set(super::MI_OPTION_PURGE_DELAY, value);
        let original = get();
        set(1234);

        let a = TurboMalloc::enter_eager_purge_mode();
        assert_eq!(get(), 0);
        let b = TurboMalloc::enter_eager_purge_mode();
        assert_eq!(get(), 0);
        // Not in LIFO order: the purge delay stays eager until the last guard is dropped.
        drop(a);
        assert_eq!(get(), 0);
        drop(b);
        assert_eq!(get(), 1234);

        // Guards held at the same time on other threads, and dropped there.
        let entered = Arc::new(Barrier::new(3));
        let release = Arc::new(Barrier::new(3));
        let threads = (0..2)
            .map(|_| {
                let entered = entered.clone();
                let release = release.clone();
                thread::spawn(move || {
                    let guard = TurboMalloc::enter_eager_purge_mode();
                    entered.wait();
                    release.wait();
                    drop(guard);
                })
            })
            .collect::<Vec<_>>();
        entered.wait();
        assert_eq!(get(), 0);
        release.wait();
        for thread in threads {
            thread.join().unwrap();
        }
        assert_eq!(get(), 1234);

        // A guard dropped while unwinding restores the delay too.
        let result = catch_unwind(AssertUnwindSafe(|| {
            let _guard = TurboMalloc::enter_eager_purge_mode();
            assert_eq!(get(), 0);
            panic!("unwinding with a guard");
        }));
        assert!(result.is_err());
        assert_eq!(get(), 1234);

        // A purge delay that's already eager, or purging disabled by the user (negative delay), is
        // left alone.
        for value in [0, -1] {
            set(value);
            let guard = TurboMalloc::enter_eager_purge_mode();
            assert_eq!(get(), value);
            drop(guard);
            assert_eq!(get(), value);
        }

        set(original);
    }
}
