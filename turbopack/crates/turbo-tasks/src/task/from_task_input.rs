use crate::{ResolvedVc, TaskInput, Vc};

// NOTE: If you add new implementations of this trait, you'll need to modify
// `expand_task_input_type` in `turbo-tasks-macros/src/func.rs`.
pub trait FromTaskInput: private::Sealed {
    type TaskInput: TaskInput;
    fn from_task_input(from: Self::TaskInput) -> Self;
}

/// Borrow-compatible conversion from `&Self::TaskInput` to `&Self`. The
/// `#[turbo_tasks::function]` macro uses this to give a body declaring `&T`
/// (where `T: FromTaskInput`) a view of the cached `T::TaskInput` without an
/// owned conversion or a clone.
///
/// All implementations are layout-compatible re-interpretations: `Self` and
/// `Self::TaskInput` either are the same type or are `#[repr(transparent)]`
/// wrappers around each other (e.g. `ResolvedVc<T>` is a transparent wrapper
/// around `Vc<T>`), so `&Self::TaskInput` and `&Self` have identical layout.
///
/// # Safety
/// Implementors must guarantee that `Self` and `Self::TaskInput` have identical
/// layout (size, alignment, and any niche optimizations). The default
/// implementations cover the trivial wrapper / structural cases; do not add new
/// implementations without auditing layout compatibility.
pub unsafe trait RefFromTaskInput: FromTaskInput {
    fn ref_from_task_input(from: &Self::TaskInput) -> &Self;
}

mod private {
    use super::*;
    /// Implements the sealed trait pattern:
    /// <https://rust-lang.github.io/api-guidelines/future-proofing.html>
    pub trait Sealed {}
    impl<T> Sealed for ResolvedVc<T> where T: ?Sized {}
    impl<T> Sealed for Vec<T> where T: FromTaskInput {}
    impl<T> Sealed for Option<T> where T: FromTaskInput {}
}

impl<T> FromTaskInput for ResolvedVc<T>
where
    T: Send + Sync + ?Sized,
{
    type TaskInput = Vc<T>;
    fn from_task_input(from: Vc<T>) -> ResolvedVc<T> {
        debug_assert!(
            from.is_resolved(),
            "Outer `Vc`s are always resolved before this is called"
        );
        ResolvedVc { node: from }
    }
}

// SAFETY: `ResolvedVc<T>` is `#[repr(transparent)]` over `Vc<T>` (see
// `turbopack/crates/turbo-tasks/src/vc/resolved.rs`), so `&Vc<T>` and
// `&ResolvedVc<T>` have identical layout.
unsafe impl<T> RefFromTaskInput for ResolvedVc<T>
where
    T: Send + Sync + ?Sized,
{
    fn ref_from_task_input(from: &Vc<T>) -> &ResolvedVc<T> {
        debug_assert!(
            from.is_resolved(),
            "Outer `Vc`s are always resolved before this is called"
        );
        // SAFETY: see the safety comment on the `unsafe impl`.
        unsafe { &*(from as *const Vc<T> as *const ResolvedVc<T>) }
    }
}

impl<T> FromTaskInput for Vec<T>
where
    T: FromTaskInput,
{
    type TaskInput = Vec<T::TaskInput>;
    fn from_task_input(from: Vec<T::TaskInput>) -> Vec<T> {
        let mut converted = Vec::with_capacity(from.len());
        for value in from {
            converted.push(T::from_task_input(value));
        }
        converted
    }
}

// SAFETY: `Vec<U>` and `Vec<V>` have identical layout iff `U` and `V` do, and
// `T: RefFromTaskInput` carries that guarantee for `T` and `T::TaskInput`.
unsafe impl<T> RefFromTaskInput for Vec<T>
where
    T: RefFromTaskInput,
{
    fn ref_from_task_input(from: &Vec<T::TaskInput>) -> &Vec<T> {
        // SAFETY: see the safety comment on the `unsafe impl`.
        unsafe { &*(from as *const Vec<T::TaskInput> as *const Vec<T>) }
    }
}

impl<T> FromTaskInput for Option<T>
where
    T: FromTaskInput,
{
    type TaskInput = Option<T::TaskInput>;
    fn from_task_input(from: Option<T::TaskInput>) -> Option<T> {
        from.map(T::from_task_input)
    }
}

// SAFETY: `Option<U>` and `Option<V>` have identical layout (including niche
// optimizations) iff `U` and `V` do; `T: RefFromTaskInput` carries that guarantee.
unsafe impl<T> RefFromTaskInput for Option<T>
where
    T: RefFromTaskInput,
{
    fn ref_from_task_input(from: &Option<T::TaskInput>) -> &Option<T> {
        // SAFETY: see the safety comment on the `unsafe impl`.
        unsafe { &*(from as *const Option<T::TaskInput> as *const Option<T>) }
    }
}
