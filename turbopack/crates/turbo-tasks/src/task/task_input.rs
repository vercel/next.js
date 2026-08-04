use std::{
    collections::{BTreeMap, BTreeSet},
    fmt::Debug,
    future::Future,
    hash::Hash,
    ops::{Deref, DerefMut},
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::Duration,
};

use anyhow::Result;
use bincode::{
    Decode, Encode,
    de::Decoder,
    enc::Encoder,
    error::{DecodeError, EncodeError},
};
use either::Either;
use turbo_frozenmap::{FrozenMap, FrozenSet};
use turbo_rcstr::RcStr;
use turbo_tasks_hash::HashAlgorithm;

// This import is necessary for derive macros to work, as their expansion refers to the crate
// name directly.
use crate::{self as turbo_tasks, OrdResolvedVc, ReadRef};
use crate::{
    DynTaskInputs, ResolvedVc, TaskId, TransientInstance, TransientValue, ValueTypeId, Vc,
    trace::TraceRawVcs,
};

/// Dual-mode recursive input resolution: `EXPR.resolve_input().await?` in async mode,
/// direct `EXPR.resolve_input()?` in the no-async sync engine.
#[cfg(not(feature = "sync"))]
macro_rules! resolve_in {
    ($e:expr) => {
        $e.resolve_input().await?
    };
}
#[cfg(feature = "sync")]
macro_rules! resolve_in {
    ($e:expr) => {
        $e.resolve_input()?
    };
}

/// Like [`resolve_in!`] but boxes the recursive future in async mode (needed for
/// single-field recursive types like `Box`/`Arc`/`ReadRef` to keep the async state
/// machine finite-sized). The sync engine has no future, so it is a direct call.
#[cfg(not(feature = "sync"))]
macro_rules! resolve_in_boxed {
    ($e:expr) => {
        ::std::boxed::Box::pin($e.resolve_input()).await?
    };
}
#[cfg(feature = "sync")]
macro_rules! resolve_in_boxed {
    ($e:expr) => {
        $e.resolve_input()?
    };
}

/// Emit the mode-appropriate `resolve_input` method with a shared body: an `async fn`
/// in async mode, a plain `fn` returning `Result<Self>` in the no-async sync engine.
/// The body should use [`resolve_in!`]/[`resolve_in_boxed!`] for nested resolution.
// The receiver is threaded through as a caller-provided ident (`|this|`) rather than
// using `self` directly: a macro cannot emit a method whose `&self` binds a `self`
// token that originates in the caller's `$body` (macro hygiene keeps them distinct).
#[cfg(not(feature = "sync"))]
macro_rules! resolve_input_fn {
    (|$this:ident| $body:block) => {
        async fn resolve_input(&self) -> Result<Self> {
            let $this = self;
            $body
        }
    };
}
#[cfg(feature = "sync")]
macro_rules! resolve_input_fn {
    (|$this:ident| $body:block) => {
        fn resolve_input(&self) -> Result<Self> {
            let $this = self;
            $body
        }
    };
}

/// An 8-byte hand-rolled [`Future`] that immediately resolves to `Ok(self.clone())` of the
/// referenced value.
///
/// Used by the async [`TaskInput::resolve_input`] default implementation.
#[cfg(not(feature = "sync"))]
struct CloneReady<'a, T> {
    pub inner: Option<&'a T>,
}

#[cfg(not(feature = "sync"))]
impl<'a, T: Clone> Future for CloneReady<'a, T> {
    type Output = Result<T>;

    fn poll(mut self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Self::Output> {
        Poll::Ready(Ok(self
            .inner
            .take()
            .expect("future already polled to completion")
            .clone()))
    }
}

// `CloneReady` holds only a shared reference; it has no self-referential state.
#[cfg(not(feature = "sync"))]
impl<'a, T> Unpin for CloneReady<'a, T> {}

/// Trait to implement in order for a type to be accepted as a
/// [`#[turbo_tasks::function]`][crate::function] argument.
///
/// ## Serialization
///
/// For persistent caching of a task, arguments must be serializable. All `TaskInput`s must
/// implement the bincode [`Encode`] and [`Decode`] traits.
///
/// Transient task inputs are required to implement [`Encode`] and [`Decode`], but are allowed to
/// panic at runtime. This requirement could be lifted in the future.
///
/// Bincode encoding must be deterministic and compatible with [`Eq`] comparisons. If two
/// `TaskInput`s compare equal they must also encode to the same bytes.
///
/// ## Hash and Eq
///
/// Arguments are used as part of keys in a `HashMap`, so they must implement of [`PartialEq`],
/// [`Eq`], and [`Hash`] traits.
///
/// ## [`Vc<T>`][Vc]
///
/// A [`Vc`] is a pointer to a cell. It implements `TaskInput` and serves as a "pass by reference"
/// argument:
///
/// - **Memoization**: [`Vc`] is keyed by pointer for memoization purposes. Identical values in
///   different cells are treated as distinct.
/// - **Singleton Pattern**: To ensure memoization efficiency, the singleton pattern can be employed
///   to guarantee that identical values yield the same `Vc`. For more info see [Singleton Pattern
///   Guide][singleton].
///
/// [singleton]: https://turbopack-rust-docs.vercel.sh/turbo-engine/singleton.html
///
/// ## Deriving `TaskInput`
///
/// Structs or enums can be made into task inputs by deriving `TaskInput`:
///
/// ```rust
/// #[turbo_tasks::task_input]
/// struct MyStruct {
///     // Fields go here...
/// }
/// ```
///
/// Derived `TaskInput` types **passed by value**. When called, arguments are moved into a `Box`,
/// and then cloned before being passed into the function. If the task is invalidated, the
/// `TaskInput` is cloned again to allow the function to be re-executed. It's recommended to ensure
/// that these types are cheap to clone.
///
/// Reference-counted types like [`Arc`] are cheap to clone, but each reference contained in a
/// `TaskInput` will be serialized independently in the persistent cache, and may consume extra disk
/// space. If an [`Arc`] points to a large type, consider wrapping that type in [`Vc`], so that only
/// one copy of the value will be serialized.
pub trait TaskInput:
    Send + Sync + Clone + Debug + PartialEq + Eq + Hash + TraceRawVcs + Encode + Decode<()>
{
    /// This method should resolve any [`Vc`]s nested inside of this object, cloning the object in
    /// the process. If the input is unresolved ([`TaskInput::is_resolved`]) a "local" resolution
    /// task is created that runs this method.
    #[cfg(not(feature = "sync"))]
    fn resolve_input(&self) -> impl Future<Output = Result<Self>> + Send + '_ {
        CloneReady { inner: Some(self) }
    }

    /// This method should resolve any [`Vc`]s nested inside of this object, cloning the object in
    /// the process. Sync engine: no `Vc` to await, so this just clones.
    #[cfg(feature = "sync")]
    fn resolve_input(&self) -> Result<Self> {
        Ok(self.clone())
    }

    /// This should return `true` if there are any unresolved [`Vc`]s in the type.
    ///
    /// Note that [`Vc`]s can sometimes be internally resolved, so you should call
    /// [`Vc::is_resolved`] (or rely on the derive macro for this trait) instead of returning `true`
    /// for any [`Vc`]. [`ResolvedVc::is_resolved`] always returns `true`.
    ///
    /// If this returns `true`, a "local" resolution task calling [`TaskInput::resolve_input`] will
    /// be spawned before the function accepting the arguments is run.
    ///
    /// If this returns `false`, the `TaskInput` will be [cloned][Clone] instead of resolved, and
    /// the function's task will be spawned directly without a resolution step.
    fn is_resolved(&self) -> bool {
        true
    }

    /// This should return true if this object contains a [`Vc`] (or any subtype of [`Vc`]) pointing
    /// to a cell owned by a transient task.
    ///
    /// Any function called with a transient `TaskInput` will be transient. Any [`Vc`] constructed
    /// in a transient task or in a top-level [`run_once`][crate::run_once] closure will be
    /// transient.
    ///
    /// Internally, a [`Vc`] can be determined to be transient by comparing the owning task's id
    /// with the [`TRANSIENT_TASK_BIT`][crate::TRANSIENT_TASK_BIT] mask.
    fn is_transient(&self) -> bool;
}

macro_rules! impl_task_input {
    ($($t:ty),*) => {
        $(
            impl TaskInput for $t {
                fn is_transient(&self) -> bool {
                    false
                }
            }
        )*
    };
}

impl_task_input! {
    (),
    bool,
    u8,
    u16,
    u32,
    i32,
    u64,
    u128,
    usize,
    RcStr,
    TaskId,
    ValueTypeId,
    Duration,
    String,
    HashAlgorithm
}

impl<T> TaskInput for Vec<T>
where
    T: TaskInput,
{
    fn is_resolved(&self) -> bool {
        self.iter().all(TaskInput::is_resolved)
    }

    fn is_transient(&self) -> bool {
        self.iter().any(TaskInput::is_transient)
    }

    resolve_input_fn!(|this| {
        let mut resolved = Vec::with_capacity(this.len());
        for value in this {
            resolved.push(resolve_in!(value));
        }
        Ok(resolved)
    });
}

impl<T> TaskInput for Box<T>
where
    T: TaskInput,
{
    fn is_resolved(&self) -> bool {
        self.as_ref().is_resolved()
    }

    fn is_transient(&self) -> bool {
        self.as_ref().is_transient()
    }

    resolve_input_fn!(|this| { Ok(Box::new(resolve_in_boxed!(this.as_ref()))) });
}

impl<T> TaskInput for Arc<T>
where
    T: TaskInput,
{
    fn is_resolved(&self) -> bool {
        self.as_ref().is_resolved()
    }

    fn is_transient(&self) -> bool {
        self.as_ref().is_transient()
    }

    resolve_input_fn!(|this| { Ok(Arc::new(resolve_in_boxed!(this.as_ref()))) });
}

impl<T> TaskInput for ReadRef<T>
where
    T: TaskInput,
{
    fn is_resolved(&self) -> bool {
        Self::as_raw_ref(self).is_resolved()
    }

    fn is_transient(&self) -> bool {
        Self::as_raw_ref(self).is_transient()
    }

    resolve_input_fn!(|this| {
        Ok(ReadRef::new_owned(resolve_in_boxed!(Self::as_raw_ref(
            this
        ))))
    });
}

impl<T> TaskInput for Option<T>
where
    T: TaskInput,
{
    fn is_resolved(&self) -> bool {
        match self {
            Some(value) => value.is_resolved(),
            None => true,
        }
    }

    fn is_transient(&self) -> bool {
        match self {
            Some(value) => value.is_transient(),
            None => false,
        }
    }

    resolve_input_fn!(|this| {
        match this {
            Some(value) => Ok(Some(resolve_in!(value))),
            None => Ok(None),
        }
    });
}

impl<T> TaskInput for Vc<T>
where
    T: Send + Sync + ?Sized,
{
    fn is_resolved(&self) -> bool {
        Vc::is_resolved(*self)
    }

    fn is_transient(&self) -> bool {
        self.node.is_transient()
    }

    // It isn't ideal to use this function but it exactly matches this usecase (resolved but
    // still a Vc)
    #[cfg(not(feature = "sync"))]
    fn resolve_input(&self) -> impl Future<Output = Result<Self>> + Send + '_ {
        (*self).resolve()
    }

    #[cfg(feature = "sync")]
    fn resolve_input(&self) -> Result<Self> {
        (*self).resolve().resolve_sync()
    }
}

// `TaskInput` isn't needed/used for a bare `ResolvedVc`, as we'll expose `ResolvedVc` arguments as
// `Vc`, but it is useful for structs that contain `ResolvedVc` and want to derive `TaskInput`.
impl<T> TaskInput for ResolvedVc<T>
where
    T: Send + Sync + ?Sized,
{
    fn is_resolved(&self) -> bool {
        true
    }

    fn is_transient(&self) -> bool {
        self.node.is_transient()
    }
}

impl<T> TaskInput for OrdResolvedVc<T>
where
    T: Send + Sync + ?Sized,
{
    fn is_resolved(&self) -> bool {
        true
    }

    fn is_transient(&self) -> bool {
        self.node.is_transient()
    }
}

impl<T> TaskInput for TransientValue<T>
where
    T: DynTaskInputs + Clone + Debug + Hash + Eq + TraceRawVcs + 'static,
{
    fn is_transient(&self) -> bool {
        true
    }
}

impl<T> Encode for TransientValue<T> {
    fn encode<E: Encoder>(&self, _encoder: &mut E) -> Result<(), EncodeError> {
        Err(EncodeError::Other("cannot encode transient task inputs"))
    }
}

impl<Context, T> Decode<Context> for TransientValue<T> {
    fn decode<D: Decoder<Context = Context>>(_decoder: &mut D) -> Result<Self, DecodeError> {
        Err(DecodeError::Other("cannot decode transient task inputs"))
    }
}

impl<T> TaskInput for TransientInstance<T>
where
    T: Sync + Send + TraceRawVcs + 'static,
{
    fn is_transient(&self) -> bool {
        true
    }
}

impl<T> Encode for TransientInstance<T> {
    fn encode<E: Encoder>(&self, _encoder: &mut E) -> Result<(), EncodeError> {
        Err(EncodeError::Other("cannot encode transient task inputs"))
    }
}

impl<Context, T> Decode<Context> for TransientInstance<T> {
    fn decode<D: Decoder<Context = Context>>(_decoder: &mut D) -> Result<Self, DecodeError> {
        Err(DecodeError::Other("cannot decode transient task inputs"))
    }
}

impl<K, V> TaskInput for BTreeMap<K, V>
where
    K: TaskInput + Ord,
    V: TaskInput,
{
    resolve_input_fn!(|this| {
        let mut new_map = BTreeMap::new();
        for (k, v) in this {
            new_map.insert(resolve_in!(k), resolve_in!(v));
        }
        Ok(new_map)
    });

    fn is_resolved(&self) -> bool {
        self.iter()
            .all(|(k, v)| TaskInput::is_resolved(k) && TaskInput::is_resolved(v))
    }

    fn is_transient(&self) -> bool {
        self.iter()
            .any(|(k, v)| TaskInput::is_transient(k) || TaskInput::is_transient(v))
    }
}

impl<T> TaskInput for BTreeSet<T>
where
    T: TaskInput + Ord,
{
    resolve_input_fn!(|this| {
        let mut new_set = BTreeSet::new();
        for value in this {
            new_set.insert(resolve_in!(value));
        }
        Ok(new_set)
    });

    fn is_resolved(&self) -> bool {
        self.iter().all(TaskInput::is_resolved)
    }

    fn is_transient(&self) -> bool {
        self.iter().any(TaskInput::is_transient)
    }
}

impl<K, V> TaskInput for FrozenMap<K, V>
where
    K: TaskInput + Ord + 'static,
    V: TaskInput + 'static,
{
    resolve_input_fn!(|this| {
        let mut new_entries = Vec::with_capacity(this.len());
        for (k, v) in this {
            new_entries.push((resolve_in!(k), resolve_in!(v)));
        }
        // note: resolving might deduplicate `Vc`s in keys
        Ok(Self::from(new_entries))
    });

    fn is_resolved(&self) -> bool {
        self.iter()
            .all(|(k, v)| TaskInput::is_resolved(k) && TaskInput::is_resolved(v))
    }

    fn is_transient(&self) -> bool {
        self.iter()
            .any(|(k, v)| TaskInput::is_transient(k) || TaskInput::is_transient(v))
    }
}

impl<T> TaskInput for FrozenSet<T>
where
    T: TaskInput + Ord + 'static,
{
    resolve_input_fn!(|this| {
        let mut new_set = Vec::with_capacity(this.len());
        for value in this {
            new_set.push(resolve_in!(value));
        }
        Ok(Self::from_iter(new_set))
    });

    fn is_resolved(&self) -> bool {
        self.iter().all(TaskInput::is_resolved)
    }

    fn is_transient(&self) -> bool {
        self.iter().any(TaskInput::is_transient)
    }
}

/// A thin wrapper around [`Either`] that implements the traits required by [`TaskInput`], notably
/// [`Encode`] and [`Decode`].
#[derive(Clone, Debug, PartialEq, Eq, Hash, TraceRawVcs)]
pub struct EitherTaskInput<L, R>(pub Either<L, R>);

impl<L, R> Deref for EitherTaskInput<L, R> {
    type Target = Either<L, R>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<L, R> DerefMut for EitherTaskInput<L, R> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl<L, R> Encode for EitherTaskInput<L, R>
where
    L: Encode,
    R: Encode,
{
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        turbo_bincode::either::encode(self, encoder)
    }
}

impl<Context, L, R> Decode<Context> for EitherTaskInput<L, R>
where
    L: Decode<Context>,
    R: Decode<Context>,
{
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        turbo_bincode::either::decode(decoder).map(Self)
    }
}

impl<L, R> TaskInput for EitherTaskInput<L, R>
where
    L: TaskInput,
    R: TaskInput,
{
    #[cfg(not(feature = "sync"))]
    fn resolve_input(&self) -> impl Future<Output = Result<Self>> + Send + '_ {
        self.as_ref().map_either(
            |l| async move { anyhow::Ok(Self(Either::Left(l.resolve_input().await?))) },
            |r| async move { anyhow::Ok(Self(Either::Right(r.resolve_input().await?))) },
        )
    }

    #[cfg(feature = "sync")]
    fn resolve_input(&self) -> Result<Self> {
        Ok(match self.as_ref() {
            Either::Left(l) => Self(Either::Left(resolve_in!(l))),
            Either::Right(r) => Self(Either::Right(resolve_in!(r))),
        })
    }

    fn is_resolved(&self) -> bool {
        self.as_ref()
            .either(TaskInput::is_resolved, TaskInput::is_resolved)
    }

    fn is_transient(&self) -> bool {
        self.as_ref()
            .either(TaskInput::is_transient, TaskInput::is_transient)
    }
}

macro_rules! tuple_impls {
    ( $( $name:ident )+ ) => {
        impl<$($name: TaskInput),+> TaskInput for ($($name,)+)
        where $($name: TaskInput),+
        {
            #[allow(non_snake_case)]
            fn is_resolved(&self) -> bool {
                let ($($name,)+) = self;
                $($name.is_resolved() &&)+ true
            }

            #[allow(non_snake_case)]
            fn is_transient(&self) -> bool {
                let ($($name,)+) = self;
                $($name.is_transient() ||)+ false
            }

            #[allow(non_snake_case)]
            resolve_input_fn!(|this| {
                let ($($name,)+) = this;
                Ok(($(resolve_in!($name),)+))
            });
        }
    };
}

// Implement `TaskInput` for all tuples of 1 to 12 elements.
tuple_impls! { A }
tuple_impls! { A B }
tuple_impls! { A B C }
tuple_impls! { A B C D }
tuple_impls! { A B C D E }
tuple_impls! { A B C D E F }
tuple_impls! { A B C D E F G }
tuple_impls! { A B C D E F G H }
tuple_impls! { A B C D E F G H I }
tuple_impls! { A B C D E F G H I J }
tuple_impls! { A B C D E F G H I J K }
tuple_impls! { A B C D E F G H I J K L }

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;

    use super::*;

    fn assert_task_input<T>(_: T)
    where
        T: TaskInput,
    {
    }

    #[test]
    fn test_no_fields() -> Result<()> {
        #[turbo_tasks::task_input]
        #[derive(Clone, Eq, PartialEq, Hash, Debug, Encode, Decode, TraceRawVcs)]
        struct NoFields;

        assert_task_input(NoFields);
        Ok(())
    }

    #[test]
    fn test_one_unnamed_field() -> Result<()> {
        #[turbo_tasks::task_input]
        #[derive(Clone, Eq, PartialEq, Hash, Debug, Encode, Decode, TraceRawVcs)]
        struct OneUnnamedField(u32);

        assert_task_input(OneUnnamedField(42));
        Ok(())
    }

    #[test]
    fn test_multiple_unnamed_fields() -> Result<()> {
        #[turbo_tasks::task_input]
        #[derive(Clone, Eq, PartialEq, Hash, Debug, Encode, Decode, TraceRawVcs)]
        struct MultipleUnnamedFields(u32, RcStr);

        assert_task_input(MultipleUnnamedFields(42, rcstr!("42")));
        Ok(())
    }

    #[test]
    fn test_one_named_field() -> Result<()> {
        #[turbo_tasks::task_input]
        #[derive(Clone, Eq, PartialEq, Hash, Debug, Encode, Decode, TraceRawVcs)]
        struct OneNamedField {
            named: u32,
        }

        assert_task_input(OneNamedField { named: 42 });
        Ok(())
    }

    #[test]
    fn test_multiple_named_fields() -> Result<()> {
        #[turbo_tasks::task_input]
        #[derive(Clone, Eq, PartialEq, Hash, Debug, Encode, Decode, TraceRawVcs)]
        struct MultipleNamedFields {
            named: u32,
            other: RcStr,
        }

        assert_task_input(MultipleNamedFields {
            named: 42,
            other: rcstr!("42"),
        });
        Ok(())
    }

    #[test]
    fn test_generic_field() -> Result<()> {
        #[turbo_tasks::task_input]
        #[derive(Clone, Eq, PartialEq, Hash, Debug, Encode, Decode, TraceRawVcs)]
        struct GenericField<T>(T);

        assert_task_input(GenericField(42));
        assert_task_input(GenericField(rcstr!("42")));
        Ok(())
    }

    #[turbo_tasks::task_input]
    #[derive(Clone, Eq, PartialEq, Hash, Debug, Encode, Decode, TraceRawVcs)]
    enum OneVariant {
        Variant,
    }

    #[test]
    fn test_one_variant() -> Result<()> {
        assert_task_input(OneVariant::Variant);
        Ok(())
    }

    #[test]
    fn test_multiple_variants() -> Result<()> {
        #[turbo_tasks::task_input]
        #[derive(Clone, PartialEq, Eq, Hash, Debug, Encode, Decode, TraceRawVcs)]
        enum MultipleVariants {
            Variant1,
            Variant2,
        }

        assert_task_input(MultipleVariants::Variant2);
        Ok(())
    }

    #[turbo_tasks::task_input]
    #[derive(Clone, Eq, PartialEq, Hash, Debug, Encode, Decode, TraceRawVcs)]
    enum MultipleVariantsAndHeterogeneousFields {
        Variant1,
        Variant2(u32),
        Variant3 { named: u32 },
        Variant4(u32, RcStr),
        Variant5 { named: u32, other: RcStr },
    }

    #[test]
    fn test_multiple_variants_and_heterogeneous_fields() -> Result<()> {
        assert_task_input(MultipleVariantsAndHeterogeneousFields::Variant5 {
            named: 42,
            other: rcstr!("42"),
        });
        Ok(())
    }

    #[test]
    fn test_nested_variants() -> Result<()> {
        #[turbo_tasks::task_input]
        #[derive(Clone, Eq, PartialEq, Hash, Debug, Encode, Decode, TraceRawVcs)]
        enum NestedVariants {
            Variant1,
            Variant2(MultipleVariantsAndHeterogeneousFields),
            Variant3 { named: OneVariant },
            Variant4(OneVariant, RcStr),
            Variant5 { named: OneVariant, other: RcStr },
        }

        assert_task_input(NestedVariants::Variant5 {
            named: OneVariant::Variant,
            other: rcstr!("42"),
        });
        assert_task_input(NestedVariants::Variant2(
            MultipleVariantsAndHeterogeneousFields::Variant5 {
                named: 42,
                other: rcstr!("42"),
            },
        ));
        Ok(())
    }
}
