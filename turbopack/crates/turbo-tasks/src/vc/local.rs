use crate::{marker_trait::impl_auto_marker_trait, OperationVc, ResolvedVc};

/// Marker trait indicating that a type does not contain any instances of [`Vc`] or references to
/// [`Vc`]. It may contain [`ResolvedVc`] or [`OperationVc`].
///
/// This is referred to as "non-local", as a base [`Vc`] type may contain task-local references that
/// are not valid after the contructing task finishes execution.
///
/// [`Vc`] can be thought of as containing a lifetime (`Vc<'task, T>`), and a [`NonLocalValue`] can
/// be thought of as `'static` or ["owned"][ToOwned]. We don't currently use literal lifetimes for
/// verbosity reasons, but safety is guaranteed through a combination of this trait and runtime
/// assertions.
///
/// A future version of this trait may be implemented using a combination of [`auto_traits`] and
/// [`negative_impls`], but [a derive macro][macro@NonLocalValue] is provided that avoids the need
/// for these nightly-only features.
///
/// # Safety
///
/// This trait is marked as unsafe. You should not implement it yourself, but instead you should
/// rely on [`#[turbo_tasks::value]`][macro@crate::value] or
/// [`#[derive(NonLocalValue)]`][macro@NonLocalValue] to do it for you.
///
/// There may be a few rare cases (e.g. custom generic bounds) where you cannot use
/// `#[turbo_tasks::value]`. In these cases, it is your responsibility to ensure that no fields can
/// contain a [`Vc`] or a transitive reference to a [`Vc`].
///
/// There are currently runtime assertions in place as a fallback to ensure memory safety, but those
/// assertions may become debug-only in the future if it significantly improves performance.
///
/// [`Vc`]: crate::Vc
/// [`auto_traits`]: https://doc.rust-lang.org/beta/unstable-book/language-features/auto-traits.html
/// [`negative_impls`]: https://doc.rust-lang.org/beta/unstable-book/language-features/negative-impls.html
pub unsafe trait NonLocalValue {}

// TODO(bgw): These trait implementations aren't correct, as these values `T` could contain
// references to local `Vc` values. We must also check that `T: NonLocalValue`. However, we're
// temporarily ignoring that problem, as:
//
// - We don't *currently* depend on `NonLocalValue` for safety (local tasks aren't enabled).
// - We intend to make all `VcValueType`s implement `NonLocalValue`, so implementing this for all
//   values is approximating that future state.
// - Adding a `T: NonLocalValue` bound introduces a lot of noise that isn't directly actionable for
//   types that include a `ResolvedVc` or `OperationVc` that is not *yet* a `NonLocalValue`.
unsafe impl<T: ?Sized> NonLocalValue for OperationVc<T> {}
unsafe impl<T: ?Sized> NonLocalValue for ResolvedVc<T> {}

impl_auto_marker_trait!(NonLocalValue);

/// Implements [`NonLocalValue`] for a struct or enum by adding static (compile-time)
/// assertions that every field implements [`NonLocalValue`].
///
/// Fields that do not contain [`Vc`] can be excluded from assertions using [`TraceRawVcs`]'s
/// `#[turbo_tasks(trace_ignore)]` annotation. This can be useful for third-party library types
/// that cannot implement [`NonLocalValue`] due to the orphan rules.
///
/// [`NonLocalValue`]: trait@NonLocalValue
/// [`Vc`]: crate::Vc
/// [`TraceRawVcs`]: crate::trace::TraceRawVcs
pub use turbo_tasks_macros::NonLocalValue;
