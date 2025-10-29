//! Provides a central registry for safe runtime registration and de-registration of panic hooks.
//!
//! Registered hooks are called in an arbitrary order.
//!
//! This is used inside `turbo-tasks-backend` to invalidate the filesystem cache if a panic occurs
//! anywhere inside of Turbopack. That panic hook must be dynamically registered as it contains a
//! reference to the database.
//!
//! The program using turbo-tasks must call [`std::panic::set_hook`] with [`handle_panic`] exactly
//! once for these registered panic handlers to function. Short-lived programs or code that does not
//! fully control its execution environment (like unit tests) may choose not to do this, so these
//! panic hooks are best-effort.
//!
//! It's recommended that when adding this global panic handler (or any other panic handler) that:
//! - You call it as early in the program as possible, to avoid race conditions with other threads.
//! - The new panic handler should call any existing panic handler.
//!
//! ```
//! use std::panic::{set_hook, take_hook};
//! use turbo_tasks::panic_hooks::handle_panic;
//!
//! let prev_hook = take_hook();
//! set_hook(Box::new(move |info| {
//!     handle_panic(info);
//!     prev_hook(info);
//! }));
//! ```
//!
//! This code is not particularly well-optimized under the assumption that panics are a rare
//! occurrence.

use std::{
    cell::RefCell,
    collections::HashMap,
    hash::{BuildHasherDefault, DefaultHasher},
    num::NonZeroU64,
    panic::PanicHookInfo,
    sync::{Arc, RwLock},
};

use crate::util::IdFactory;

thread_local! {
    /// The location of the last error that occurred in the current thread.
    ///
    /// Used for debugging when errors are sent to telemetry.
    pub(crate) static LAST_ERROR_LOCATION: RefCell<Option<String>> = const { RefCell::new(None) };
}

static HOOK_ID_FACTORY: IdFactory<NonZeroU64> =
    IdFactory::new_const(NonZeroU64::MIN, NonZeroU64::MAX);

// We could use a `DashMap` or the `slab` crate, but we anticipate that setting up and tearing down
// hooks is rare.
static PANIC_HOOKS: RwLock<HashMap<NonZeroU64, ArcPanicHook, BuildHasherDefault<DefaultHasher>>> =
    RwLock::new(HashMap::with_hasher(BuildHasherDefault::new()));

pub type PanicHook = Box<dyn Fn(&PanicHookInfo<'_>) + Sync + Send + 'static>;
pub type ArcPanicHook = Arc<dyn Fn(&PanicHookInfo<'_>) + Sync + Send + 'static>;

/// This function should be registered as the global panic handler using [`std::panic::set_hook`].
/// See [the module-level documentation][self] for usage examples.
pub fn handle_panic(info: &PanicHookInfo<'_>) {
    // we only want to do this once-per-process, so hard-code it here instead of using a dynamically
    // registered panic hook
    LAST_ERROR_LOCATION.with_borrow_mut(|loc| {
        *loc = info.location().map(|l| l.to_string());
    });

    // Collect and clone all the hooks and drop the lock guard so that we can avoid risks of
    // deadlocks due to potentially re-entrant calls to `register_panic_hook` or
    // `PanicHookGuard::drop`. This is expensive, but this should be a cold codepath.
    let hooks: Vec<ArcPanicHook> = PANIC_HOOKS.read().unwrap().values().cloned().collect();
    for hook in hooks {
        (hook)(info);
    }
}

/// Registers a hook to be called when a panic occurs. Panic hooks are called in the order that they
/// are registered. Dropping the returned [`PanicHookGuard`] removes the registered hook.
///
/// In the case that the panic hook refers to the object that contains the [`PanicHookGuard`], make
/// sure to use [`std::sync::Weak`] to avoid leaks. [`Arc::new_cyclic`] may be useful in
/// constructing such an object.
pub fn register_panic_hook(hook: PanicHook) -> PanicHookGuard {
    let id = HOOK_ID_FACTORY.get();
    PANIC_HOOKS.write().unwrap().insert(id, Arc::from(hook));
    PanicHookGuard { id }
}

/// A guard returned from [`register_panic_hook`] that cleans up the panic hook when dropped.
#[must_use = "If the guard is not stored somewhere, it will be immediately dropped and the panic \
              hook will be immediately cleaned up"]
pub struct PanicHookGuard {
    id: NonZeroU64,
}

impl Drop for PanicHookGuard {
    fn drop(&mut self) {
        PANIC_HOOKS.write().unwrap().remove(&self.id);
    }
}
