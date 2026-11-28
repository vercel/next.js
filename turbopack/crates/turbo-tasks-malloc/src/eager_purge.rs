//! Temporarily makes mimalloc return freed memory to the OS immediately.

/// Overrides mimalloc's `purge_delay` option with 0 (purge freed memory immediately). The option
/// only controls purge timing, so changing it at runtime is benign, see [`crate::option_override`].
/// A negative delay means purging is disabled (e.g. via `MIMALLOC_PURGE_DELAY=-1`), and zero means
/// it's already eager: both are left alone.
#[cfg(all(feature = "custom_allocator", not(target_family = "wasm"), not(miri)))]
static EAGER_PURGE: crate::option_override::OptionOverride =
    crate::option_override::OptionOverride::new(
        mimalloc::sys::mi_option_purge_delay,
        0,
        |previous| previous > 0,
    );

/// While alive, the allocator returns memory to the OS as soon as it's freed, instead of after
/// a delay. Created by [`TurboMalloc::enter_eager_purge_mode`].
///
/// Entering and leaving the mode changes mimalloc's `purge_delay` option while other threads use
/// the allocator. mimalloc documents changing options as not thread-safe; this is a benign race,
/// see the `option_override` module.
///
/// [`TurboMalloc::enter_eager_purge_mode`]: crate::TurboMalloc::enter_eager_purge_mode
#[must_use = "eager purge mode ends when the guard is dropped"]
pub struct EagerPurgeGuard {
    #[cfg(all(feature = "custom_allocator", not(target_family = "wasm"), not(miri)))]
    _override: crate::option_override::OptionOverrideGuard,
    _private: (),
}

impl EagerPurgeGuard {
    pub(crate) fn new() -> Self {
        Self {
            #[cfg(all(feature = "custom_allocator", not(target_family = "wasm"), not(miri)))]
            _override: EAGER_PURGE.enter(),
            _private: (),
        }
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

    use super::EAGER_PURGE;
    use crate::TurboMalloc;

    /// The only test that changes the purge delay, since it's process-wide.
    #[test]
    fn guards_set_and_restore_purge_delay() {
        let get = || EAGER_PURGE.get();
        let set = |value| mimalloc::option_set(mimalloc::sys::mi_option_purge_delay, value);
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
