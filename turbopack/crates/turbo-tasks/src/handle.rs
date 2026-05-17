//! Devirtualized dispatch for the turbo-tasks task-local.
//!
//! The task-local that holds the current `TurboTasksApi` implementation
//! has historically been an `Arc<dyn TurboTasksApi>`. The `dyn` is
//! necessary because the prod implementor (`TurboTasks<B>`) is generic
//! over a backend type that the `task_local!` macro cannot name — but
//! the cost is an indirect vtable call on every dispatched method, and
//! rustc currently does not emit the LLVM metadata that
//! `WholeProgramDevirt` needs to inline through trait objects
//! ([rust#68262], [rust#45774]).
//!
//! [rust#68262]: https://github.com/rust-lang/rust/issues/68262
//! [rust#45774]: https://github.com/rust-lang/rust/issues/45774
//!
//! This module replaces that `dyn` with `extern "Rust"` direct calls.
//! Under `lto = "thin"` + `codegen-units = 1` (this workspace's release
//! profile), the `extern "Rust"` call inlines across the
//! `turbo-tasks` → `turbo-tasks-backend` boundary, collapsing the
//! dispatch site to a direct call into the underlying backend method.
//!
//! ```text
//!  call site                                turbo-tasks-backend
//! ┌──────────────────────────┐              ┌─────────────────────────────────────┐
//! │ tt.invalidate(task)       │ ───────────► │ #[no_mangle] pub extern "Rust" fn   │
//! │   __tt_static_invalidate(ptr, task)      │ __tt_static_invalidate(ptr, task) { │
//! │                          │              │   let tt: &TurboTasks<…> = …;       │
//! │                          │              │   tt.invalidate(task)               │
//! └──────────────────────────┘              │ }                                   │
//!                                            └─────────────────────────────────────┘
//! ```
//!
//! ## Linkage contract
//!
//! `turbo-tasks` declares the `__tt_static_*` symbols as `extern "Rust"`
//! forward declarations unconditionally. `turbo-tasks-backend` defines
//! them as `#[no_mangle] pub extern "Rust" fn`. Every binary that
//! links `libturbo_tasks.rlib` MUST also link
//! `libturbo_tasks_backend.rlib` so the linker can resolve the symbols
//! — there's no feature flag to gate this off.
//!
//! For library crates that depend on `turbo-tasks` for the proc-macro
//! types (`turbo_tasks::value`, `turbo_tasks::function`) but never
//! construct a `TurboTasks<B>`, that's still required because their
//! test binaries link the rlib. The convention is a dev-dep on
//! `turbo-tasks-backend` plus `#[cfg(test)] extern crate
//! turbo_tasks_backend;` in `src/lib.rs` — see the existing examples in
//! `turbo-tasks-bytes`, `turbo-esregex`, etc.
//!
//! ## Follow-ups
//!
//! - `task_statistics` is only used by `turbo-tasks-backend/tests/task_statistics.rs`; if that test
//!   calls it on a concrete `TurboTasks<B>` instead of via the handle, it can move off the dispatch
//!   surface (no extern, no method on `TurboTasksHandle`).

use std::ptr::NonNull;

/// Type-erased reference to a `TurboTasksApi` implementation. See the
/// [module docs](self) for the dispatch design.
///
/// The pointer is the data pointer of an `Arc::into_raw(arc)` where
/// `arc: Arc<TurboTasks<B>>` for the concrete backend type the
/// `__tt_static_*` providers were generated for. Dispatch goes through
/// `extern "Rust"` symbols defined in `turbo-tasks-backend`.
pub struct TurboTasksHandle(NonNull<()>);

impl std::fmt::Debug for TurboTasksHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("TurboTasksHandle").field(&self.0).finish()
    }
}

// Safety: the concrete `Arc<TurboTasks<B>>` behind the pointer is
// `Send + Sync`. We strip the type via `*const ()` but keep the
// underlying ref-counted ownership intact.
unsafe impl Send for TurboTasksHandle {}
unsafe impl Sync for TurboTasksHandle {}

impl TurboTasksHandle {
    /// Construct a handle from an `Arc::into_raw` pointer.
    ///
    /// # Safety
    ///
    /// `ptr` must come from `Arc::into_raw(arc)` where `arc` is an
    /// `Arc<TurboTasks<B>>` for the concrete backend the
    /// `__tt_static_*` providers (in `turbo-tasks-backend`) target.
    /// Ownership of one strong refcount transfers into the handle.
    #[inline]
    pub unsafe fn from_static_raw(ptr: NonNull<()>) -> Self {
        Self(ptr)
    }
}

// =====================================================================
// `extern "Rust"` forward declarations.
//
// The bodies are defined `#[no_mangle]` in `turbo-tasks-backend` and
// resolved at link time. Thin LTO inlines them across the crate boundary.
// =====================================================================

/// For each dispatched method, generates both the `extern "Rust"` forward
/// declaration of `__tt_static_<name>` and the matching inherent method on
/// `TurboTasksHandle` that calls it.
macro_rules! tt_decl {
    (
        fn $name:ident( $($arg:ident : $ty:ty),* $(,)? ) $(-> $ret:ty)?
    ) => {
        unsafe extern "Rust" {
            fn ${concat(__tt_static_, $name)}(ptr: *const () $(, $arg : $ty)*) $(-> $ret)?;
        }
        impl TurboTasksHandle {
            #[inline]
            pub fn $name(&self $(, $arg : $ty)*) $(-> $ret)? {
                unsafe { ${concat(__tt_static_, $name)}(self.0.as_ptr() $(, $arg)*) }
            }
        }
    };
}

// ---- dispatched methods -------------------------------------------------
//
// Keep this list in sync with the matching provider implementations in
// `turbo-tasks-backend/src/handle_providers.rs`. The list is duplicated;
// a missing provider surfaces as a link error.

// `TurboTasksCallApi` methods.
tt_decl!(fn dynamic_call(
    native_fn: &'static crate::native_function::NativeFunction,
    this: Option<crate::RawVc>,
    arg: &mut dyn crate::StackDynTaskInputs,
    persistence: crate::TaskPersistence,
) -> crate::RawVc);

tt_decl!(fn native_call(
    native_fn: &'static crate::native_function::NativeFunction,
    this: Option<crate::RawVc>,
    arg: &mut dyn crate::StackDynTaskInputs,
    persistence: crate::TaskPersistence,
) -> crate::RawVc);

tt_decl!(fn trait_call(
    trait_method: &'static crate::TraitMethod,
    this: crate::RawVc,
    arg: &mut dyn crate::StackDynTaskInputs,
    persistence: crate::TaskPersistence,
) -> crate::RawVc);

tt_decl!(fn send_compilation_event(
    event: ::std::sync::Arc<dyn crate::message_queue::CompilationEvent>,
));

tt_decl!(fn get_task_name(task: crate::TaskId) -> ::std::string::String);

// `TurboTasksApi` methods (inherits TurboTasksCallApi above).
tt_decl!(fn invalidate(task: crate::TaskId));

tt_decl!(fn invalidate_with_reason(
    task: crate::TaskId,
    reason: crate::util::StaticOrArc<dyn crate::InvalidationReason>,
));

tt_decl!(fn invalidate_serialization(task: crate::TaskId));

tt_decl!(fn try_read_task_output(
    task: crate::TaskId,
    options: crate::ReadOutputOptions,
) -> ::anyhow::Result<::core::result::Result<crate::RawVc, crate::event::EventListener>>);

tt_decl!(fn try_read_task_cell(
    task: crate::TaskId,
    index: crate::CellId,
    options: crate::ReadCellOptions,
) -> ::anyhow::Result<::core::result::Result<crate::backend::TypedCellContent, crate::event::EventListener>>);

tt_decl!(fn try_read_local_output(
    execution_id: crate::ExecutionId,
    local_task_id: crate::LocalTaskId,
) -> ::anyhow::Result<::core::result::Result<crate::RawVc, crate::event::EventListener>>);

tt_decl!(fn read_task_collectibles(
    task: crate::TaskId,
    trait_id: crate::TraitTypeId,
) -> crate::backend::TaskCollectiblesMap);

tt_decl!(fn emit_collectible(
    trait_type: crate::TraitTypeId,
    collectible: crate::RawVc,
));

tt_decl!(fn unemit_collectible(
    trait_type: crate::TraitTypeId,
    collectible: crate::RawVc,
    count: u32,
));

tt_decl!(fn unemit_collectibles(
    trait_type: crate::TraitTypeId,
    collectibles: &crate::backend::TaskCollectiblesMap,
));

tt_decl!(fn try_read_own_task_cell(
    current_task: crate::TaskId,
    index: crate::CellId,
) -> ::anyhow::Result<crate::backend::TypedCellContent>);

tt_decl!(fn read_own_task_cell(
    task: crate::TaskId,
    index: crate::CellId,
) -> ::anyhow::Result<crate::backend::TypedCellContent>);

tt_decl!(fn update_own_task_cell(
    task: crate::TaskId,
    index: crate::CellId,
    content: crate::backend::CellContent,
    updated_key_hashes: ::core::option::Option<::smallvec::SmallVec<[u64; 2]>>,
    content_hash: ::core::option::Option<crate::backend::CellHash>,
    verification_mode: crate::backend::VerificationMode,
));

tt_decl!(fn mark_own_task_as_finished(task: crate::TaskId));

tt_decl!(fn connect_task(task: crate::TaskId));

tt_decl!(fn spawn_detached_for_testing(
    f: ::std::pin::Pin<::std::boxed::Box<dyn ::std::future::Future<Output = ()> + ::core::marker::Send + 'static>>,
));

tt_decl!(fn is_tracking_dependencies() -> bool);

// `task_statistics` returns `&TaskStatisticsApi` borrowed from `&self`.
// The macro can't express the lifetime relationship through a `*const ()`
// receiver, so the provider returns `*const TaskStatisticsApi` and the
// handle wrapper re-binds the lifetime to `&self`.
unsafe extern "Rust" {
    fn __tt_static_task_statistics(
        ptr: *const (),
    ) -> *const crate::task_statistics::TaskStatisticsApi;
}

impl TurboTasksHandle {
    #[inline]
    pub fn task_statistics(&self) -> &crate::task_statistics::TaskStatisticsApi {
        // SAFETY: the provider returns a pointer to a
        // `TaskStatisticsApi` owned by the underlying `TurboTasks<B>`,
        // which this handle keeps alive via its Arc. The returned
        // reference is bound to `&self`.
        let p = unsafe { __tt_static_task_statistics(self.0.as_ptr()) };
        unsafe { &*p }
    }
}

// =====================================================================
// Clone / Drop — Arc refcounting through extern symbols.
// =====================================================================

unsafe extern "Rust" {
    fn __tt_static_clone_arc(ptr: *const ());
    fn __tt_static_drop_arc(ptr: *const ());

    // Weak-handle support. Each provides:
    //   downgrade : *const Arc<T> -> *const Weak<T> (creates a fresh
    //               Weak; caller owns the returned weak).
    //   upgrade   : *const Weak<T> -> *const Arc<T> (returns null if
    //               the Arc is gone; otherwise transfers one strong
    //               refcount).
    //   clone_weak: bumps the weak refcount.
    //   drop_weak : drops the weak refcount.
    fn __tt_static_downgrade(arc_ptr: *const ()) -> *const ();
    fn __tt_static_upgrade(weak_ptr: *const ()) -> *const ();
    fn __tt_static_clone_weak(weak_ptr: *const ());
    fn __tt_static_drop_weak(weak_ptr: *const ());
}

impl Clone for TurboTasksHandle {
    #[inline]
    fn clone(&self) -> Self {
        unsafe { __tt_static_clone_arc(self.0.as_ptr()) }
        Self(self.0)
    }
}

impl Drop for TurboTasksHandle {
    #[inline]
    fn drop(&mut self) {
        unsafe { __tt_static_drop_arc(self.0.as_ptr()) }
    }
}

impl TurboTasksHandle {
    /// Downgrades to a weak handle, equivalent to `Arc::downgrade`.
    #[inline]
    pub fn downgrade(&self) -> TurboTasksWeakHandle {
        let weak_ptr = unsafe { __tt_static_downgrade(self.0.as_ptr()) };
        // `Weak::into_raw` always produces a valid (non-null) pointer
        // even when the strong count is zero.
        TurboTasksWeakHandle(unsafe { NonNull::new_unchecked(weak_ptr as *mut ()) })
    }
}

// =====================================================================
// Weak-handle dispatch.
//
// Used by long-lived non-task contexts (e.g. the filesystem watcher in
// `turbo-tasks-fs`) that need to reach back into TurboTasks without
// keeping it alive.
// =====================================================================

/// Weak counterpart to [`TurboTasksHandle`]. Constructed via
/// [`TurboTasksHandle::downgrade`]; upgraded via
/// [`TurboTasksWeakHandle::upgrade`].
pub struct TurboTasksWeakHandle(NonNull<()>);

impl std::fmt::Debug for TurboTasksWeakHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("TurboTasksWeakHandle")
            .field(&self.0)
            .finish()
    }
}

// Safety: same reasoning as for `TurboTasksHandle`.
unsafe impl Send for TurboTasksWeakHandle {}
unsafe impl Sync for TurboTasksWeakHandle {}

impl TurboTasksWeakHandle {
    /// Tries to recover a strong handle. Returns `None` if the underlying
    /// concrete handle has been dropped.
    #[inline]
    pub fn upgrade(&self) -> Option<TurboTasksHandle> {
        let strong = unsafe { __tt_static_upgrade(self.0.as_ptr()) };
        let strong = NonNull::new(strong as *mut ())?;
        // SAFETY: provider returned a valid `Arc::into_raw` pointer for
        // the concrete type, transferring one strong refcount.
        Some(unsafe { TurboTasksHandle::from_static_raw(strong) })
    }
}

impl Clone for TurboTasksWeakHandle {
    #[inline]
    fn clone(&self) -> Self {
        unsafe { __tt_static_clone_weak(self.0.as_ptr()) }
        Self(self.0)
    }
}

impl Drop for TurboTasksWeakHandle {
    #[inline]
    fn drop(&mut self) {
        unsafe { __tt_static_drop_weak(self.0.as_ptr()) }
    }
}
