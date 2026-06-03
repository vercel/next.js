//! `#[no_mangle] pub extern "Rust" fn __tt_static_*` providers for the
//! `TurboTasksHandle` dispatch.
//!
//! The forward declarations live in `turbo_tasks::handle`. Both sides
//! are unconditional — any binary that links `libturbo_tasks.rlib`
//! must also link `libturbo_tasks_backend.rlib` so the linker can
//! resolve the externs.
//!
//! Each provider:
//! 1. Casts the opaque `*const ()` receiver back to `&ProdHandleConcrete` (the production handle
//!    type — `TurboTasks<TurboTasksBackend<…>>`).
//! 2. Calls the trait method on the concrete type.
//!
//! Under thin LTO + `codegen-units = 1`, every step inlines into the
//! caller and the dispatch shape is `direct call` with no
//! indirect calls. See `turbo_tasks::handle` for the experiment that
//! verified this.

use std::sync::Arc;

use turbo_tasks::{TurboTasksApi as _, TurboTasksCallApi as _};

/// The concrete prod handle type. The `__tt_static_*` providers below
/// cast each opaque `*const ()` receiver to `&ProdHandleConcrete`, so
/// any `Arc<TurboTasks<TurboTasksBackend<_>>>` that goes into a
/// [`turbo_tasks::TurboTasksHandle`] via `make_handle` MUST be this
/// exact type. Mismatch is undefined behavior. See
/// [`crate::ProdBackingStorage`] for why the storage type is wrapped in
/// `Either`.
pub type ProdHandleConcrete = turbo_tasks::TurboTasks<
    crate::TurboTasksBackend<
        crate::KeyValueDatabaseBackingStorage<crate::database::turbo::TurboKeyValueDatabase>,
    >,
>;

/// Generates `#[no_mangle] pub extern "Rust" fn __tt_static_<name>(...)`
/// for a single dispatched method, dispatched via method call syntax.
macro_rules! provide_prod {
    (
        fn $name:ident( $($arg:ident : $ty:ty),* $(,)? ) $(-> $ret:ty)?
    ) => {
        #[unsafe(no_mangle)]
        pub extern "Rust" fn ${concat(__tt_static_, $name)}(
            ptr: *const ()
            $(, $arg : $ty)*
        ) $(-> $ret)? {
            let tt: &ProdHandleConcrete = unsafe { &*(ptr as *const ProdHandleConcrete) };
            tt.$name($($arg),*)
        }
    };
}

// ---- dispatched methods ---------------------------------------------------
//
// Keep this list in sync with the matching `tt_decl!` invocations in
// `turbopack/crates/turbo-tasks/src/handle.rs`.

// TurboTasksCallApi
provide_prod!(fn dynamic_call(
    native_fn: &'static turbo_tasks::macro_helpers::NativeFunction,
    this: Option<turbo_tasks::RawVc>,
    arg: &mut dyn turbo_tasks::StackDynTaskInputs,
    persistence: turbo_tasks::TaskPersistence,
) -> turbo_tasks::RawVc);
provide_prod!(fn native_call(
    native_fn: &'static turbo_tasks::macro_helpers::NativeFunction,
    this: Option<turbo_tasks::RawVc>,
    arg: &mut dyn turbo_tasks::StackDynTaskInputs,
    persistence: turbo_tasks::TaskPersistence,
) -> turbo_tasks::RawVc);
provide_prod!(fn trait_call(
    trait_method: &'static turbo_tasks::TraitMethod,
    this: turbo_tasks::RawVc,
    arg: &mut dyn turbo_tasks::StackDynTaskInputs,
    persistence: turbo_tasks::TaskPersistence,
) -> turbo_tasks::RawVc);
provide_prod!(fn send_compilation_event(
    event: ::std::sync::Arc<dyn turbo_tasks::message_queue::CompilationEvent>,
));
provide_prod!(fn get_task_name(task: turbo_tasks::TaskId) -> ::std::string::String);

// TurboTasksApi
provide_prod!(fn invalidate(task: turbo_tasks::TaskId));
provide_prod!(fn invalidate_with_reason(
    task: turbo_tasks::TaskId,
    reason: turbo_tasks::util::StaticOrArc<dyn turbo_tasks::InvalidationReason>,
));
provide_prod!(fn invalidate_serialization(task: turbo_tasks::TaskId));
provide_prod!(fn try_read_task_output(
    task: turbo_tasks::TaskId,
    options: turbo_tasks::ReadOutputOptions,
) -> ::anyhow::Result<::core::result::Result<turbo_tasks::RawVc, turbo_tasks::event::EventListener>>);
provide_prod!(fn try_read_task_cell(
    task: turbo_tasks::TaskId,
    index: turbo_tasks::CellId,
    options: turbo_tasks::ReadCellOptions,
) -> ::anyhow::Result<::core::result::Result<turbo_tasks::backend::TypedCellContent, turbo_tasks::event::EventListener>>);
provide_prod!(fn try_read_local_output(
    execution_id: turbo_tasks::ExecutionId,
    local_task_id: turbo_tasks::LocalTaskId,
) -> ::anyhow::Result<::core::result::Result<turbo_tasks::RawVc, turbo_tasks::event::EventListener>>);
provide_prod!(fn read_task_collectibles(
    task: turbo_tasks::TaskId,
    trait_id: turbo_tasks::TraitTypeId,
) -> turbo_tasks::backend::TaskCollectiblesMap);
provide_prod!(fn emit_collectible(
    trait_type: turbo_tasks::TraitTypeId,
    collectible: turbo_tasks::RawVc,
));
provide_prod!(fn unemit_collectible(
    trait_type: turbo_tasks::TraitTypeId,
    collectible: turbo_tasks::RawVc,
    count: u32,
));
provide_prod!(fn unemit_collectibles(
    trait_type: turbo_tasks::TraitTypeId,
    collectibles: &turbo_tasks::backend::TaskCollectiblesMap,
));
provide_prod!(fn try_read_own_task_cell(
    current_task: turbo_tasks::TaskId,
    index: turbo_tasks::CellId,
) -> ::anyhow::Result<turbo_tasks::backend::TypedCellContent>);
provide_prod!(fn read_own_task_cell(
    task: turbo_tasks::TaskId,
    index: turbo_tasks::CellId,
) -> ::anyhow::Result<turbo_tasks::backend::TypedCellContent>);
provide_prod!(fn update_own_task_cell(
    task: turbo_tasks::TaskId,
    index: turbo_tasks::CellId,
    content: turbo_tasks::backend::CellContent,
    updated_key_hashes: ::core::option::Option<::smallvec::SmallVec<[u64; 2]>>,
    content_hash: ::core::option::Option<turbo_tasks::backend::CellHash>,
    verification_mode: turbo_tasks::backend::VerificationMode,
));
provide_prod!(fn mark_own_task_as_finished(task: turbo_tasks::TaskId));
provide_prod!(fn connect_task(task: turbo_tasks::TaskId));
provide_prod!(fn spawn_detached_for_testing(
    f: ::std::pin::Pin<::std::boxed::Box<dyn ::std::future::Future<Output = ()> + ::core::marker::Send + 'static>>,
));
provide_prod!(fn is_tracking_dependencies() -> bool);

// `task_statistics` is special: the trait method returns
// `&TaskStatisticsApi` borrowed from `&self`, but extern "Rust" can't
// carry that lifetime through a `*const ()` receiver. The provider
// returns a raw pointer; the handle wrapper in `turbo-tasks` re-binds
// the lifetime to `&self`. This is sound because the underlying Arc
// (held by the handle) keeps the `TaskStatisticsApi` alive.
#[unsafe(no_mangle)]
pub extern "Rust" fn __tt_static_task_statistics(
    ptr: *const (),
) -> *const turbo_tasks::task_statistics::TaskStatisticsApi {
    let tt: &ProdHandleConcrete = unsafe { &*(ptr as *const ProdHandleConcrete) };
    tt.task_statistics() as *const _
}

// ---- Arc clone / drop -----------------------------------------------------

#[unsafe(no_mangle)]
pub extern "Rust" fn __tt_static_clone_arc(ptr: *const ()) {
    // Bump the refcount of the Arc whose data pointer is `ptr`. The caller
    // (`<TurboTasksHandle as Clone>::clone`) is responsible for reusing
    // the same `ptr` value in the new handle, so we don't need to return
    // anything.
    unsafe { Arc::<ProdHandleConcrete>::increment_strong_count(ptr as *const ProdHandleConcrete) }
}

#[unsafe(no_mangle)]
pub extern "Rust" fn __tt_static_drop_arc(ptr: *const ()) {
    // Decrement the refcount; runs the destructor when it reaches zero.
    unsafe { Arc::<ProdHandleConcrete>::decrement_strong_count(ptr as *const ProdHandleConcrete) }
}

// ---- Weak refcount providers ---------------------------------------------

#[unsafe(no_mangle)]
pub extern "Rust" fn __tt_static_downgrade(arc_ptr: *const ()) -> *const () {
    // Reconstitute the Arc transiently to call `downgrade`, then leak the
    // Arc back so its refcount is unchanged. The Weak we produce owns its
    // own weak refcount.
    let arc = unsafe { Arc::from_raw(arc_ptr as *const ProdHandleConcrete) };
    let weak = Arc::downgrade(&arc);
    ::std::mem::forget(arc);
    ::std::sync::Weak::into_raw(weak) as *const ()
}

#[unsafe(no_mangle)]
pub extern "Rust" fn __tt_static_upgrade(weak_ptr: *const ()) -> *const () {
    // Reconstitute the Weak transiently to attempt upgrade, then leak it
    // back so its refcount is unchanged.
    let weak = unsafe { ::std::sync::Weak::from_raw(weak_ptr as *const ProdHandleConcrete) };
    let maybe_arc = weak.upgrade();
    ::std::mem::forget(weak);
    match maybe_arc {
        Some(arc) => Arc::into_raw(arc) as *const (),
        None => ::std::ptr::null(),
    }
}

#[unsafe(no_mangle)]
pub extern "Rust" fn __tt_static_clone_weak(weak_ptr: *const ()) {
    // `Weak` has no `increment_weak_count` API, so we round-trip through
    // `Weak::clone` and leak both copies.
    let weak = unsafe { ::std::sync::Weak::from_raw(weak_ptr as *const ProdHandleConcrete) };
    let cloned = weak.clone();
    ::std::mem::forget(weak);
    ::std::mem::forget(cloned);
}

#[unsafe(no_mangle)]
pub extern "Rust" fn __tt_static_drop_weak(weak_ptr: *const ()) {
    drop(unsafe { ::std::sync::Weak::from_raw(weak_ptr as *const ProdHandleConcrete) });
}
