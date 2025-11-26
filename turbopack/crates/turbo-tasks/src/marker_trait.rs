/// Creates an empty trait implementation for all common types. For generic collections, a bound is
/// added that any type parameters implement the trait.
///
/// This requires that `$trait` is a marker trait, as no associated types or methods will be
/// implemented.
///
/// These marker traits should also include a derive proc-macro in `turbo-tasks-macros` to allow
/// easy implementation on structs or enums.
///
/// This should eventually be replace by the `auto_traits`, once stabilized:
/// https://doc.rust-lang.org/nightly/unstable-book/language-features/auto-traits.html
macro_rules! impl_auto_marker_trait {
    ($trait:ident) => {
        $crate::marker_trait::impl_marker_trait!(
            $trait:
            i8, u8, i16, u16, i32, u32, i64, u64, i128, u128, isize, usize, f32, f64, char, bool,
        );
        $crate::marker_trait::impl_marker_trait!(
            $trait:
            ::std::sync::atomic::AtomicI8,
            ::std::sync::atomic::AtomicU8,
            ::std::sync::atomic::AtomicI16,
            ::std::sync::atomic::AtomicU16,
            ::std::sync::atomic::AtomicI32,
            ::std::sync::atomic::AtomicU32,
            ::std::sync::atomic::AtomicI64,
            ::std::sync::atomic::AtomicU64,
            ::std::sync::atomic::AtomicBool,
            ::std::sync::atomic::AtomicUsize,
        );
        $crate::marker_trait::impl_marker_trait!(
            $trait:
            (),
            str,
            ::std::string::String,
            ::std::time::Duration,
            ::anyhow::Error,
            ::turbo_rcstr::RcStr,
        );
        $crate::marker_trait::impl_marker_trait!($trait: ::std::path::Path, ::std::path::PathBuf);
        $crate::marker_trait::impl_marker_trait!(
            $trait:
            ::serde_json::Value, ::serde_json::Map<String, ::serde_json::Value>
        );

        $crate::marker_trait::impl_marker_trait_fn_ptr!($trait: E D C B A Z Y X W V U T);
        $crate::marker_trait::impl_marker_trait_tuple!($trait: E D C B A Z Y X W V U T);

        unsafe impl<T: $trait> $trait for ::std::option::Option<T> {}
        unsafe impl<T: $trait> $trait for ::std::vec::Vec<T> {}
        unsafe impl<T: $trait, const N: usize> $trait for ::smallvec::SmallVec<[T; N]> {}
        unsafe impl<T: $trait, const N: usize> $trait for [T; N] {}
        unsafe impl<T: $trait> $trait for [T] {}
        unsafe impl<T: $trait, S> $trait for ::std::collections::HashSet<T, S> {}
        unsafe impl<T: $trait, S, const I: usize> $trait for ::auto_hash_map::AutoSet<T, S, I> {}
        unsafe impl<T: $trait> $trait for ::std::collections::BTreeSet<T> {}
        unsafe impl<T: $trait, S> $trait for ::indexmap::IndexSet<T, S> {}
        unsafe impl<K: $trait, V: $trait, S> $trait for ::std::collections::HashMap<K, V, S> {}
        unsafe impl<K: $trait, V: $trait, S, const I: usize> $trait
            for ::auto_hash_map::AutoMap<K, V, S, I> {}
        unsafe impl<K: $trait, V: $trait> $trait for ::std::collections::BTreeMap<K, V> {}
        unsafe impl<K: $trait, V: $trait, S> $trait for ::indexmap::IndexMap<K, V, S> {}
        unsafe impl<T: $trait + ?Sized> $trait for ::std::boxed::Box<T> {}
        unsafe impl<T: $trait + ?Sized> $trait for ::std::sync::Arc<T> {}
        unsafe impl<B: $trait + ::std::borrow::ToOwned + ?Sized> $trait
            for ::std::borrow::Cow<'_, B> {}
        unsafe impl<T: $trait, E: $trait> $trait for ::std::result::Result<T, E> {}
        unsafe impl<T: $trait + ?Sized> $trait for ::std::sync::Mutex<T> {}
        unsafe impl<T: $trait + ?Sized> $trait for ::std::cell::RefCell<T> {}
        unsafe impl<T: ?Sized> $trait for ::std::marker::PhantomData<T> {}
        unsafe impl<L: $trait, R: $trait> $trait for ::either::Either<L, R> {}

        unsafe impl<T: $trait + ?Sized> $trait for $crate::TraitRef<T> {}
        unsafe impl<T> $trait for $crate::ReadRef<T>
        where
            T: $crate::VcValueType,
            <<T as $crate::VcValueType>::Read as $crate::VcRead<T>>::Target: $trait
        {}
        unsafe impl<T: $trait> $trait for $crate::State<T> {}
        unsafe impl<T: $trait> $trait for $crate::TransientState<T> {}
        unsafe impl<T: $trait> $trait for $crate::TransientValue<T> {}
        unsafe impl<T: $trait> $trait for $crate::TransientInstance<T> {}

        unsafe impl<T: $trait + ?Sized> $trait for &T {}
        unsafe impl<T: $trait + ?Sized> $trait for &mut T {}
    }
}

/// Create a trivial marker trait implementation for trivial types with no generic parameters.
///
/// Accepts a colon-separated `$trait` identifier followed by a comma-separated list of types to
/// implement the `$trait` on.
macro_rules! impl_marker_trait {
    ($trait:ident: $ty:ty $(,)?) => {
        unsafe impl $trait for $ty {}
    };

    ($trait:ident: $ty:ty, $($tys:ty),+ $(,)?) => {
        $crate::marker_trait::impl_marker_trait!($trait: $ty);
        $crate::marker_trait::impl_marker_trait!($trait: $($tys),+);
    }
}

/// Create an implementation for every possible `fn` pointer type, regardless of the type of the
/// arguments and return type.
///
/// This is typically valid for marker traits as `fn` pointer types (not the `Fn` trait) do not
/// contain any data, they are compile-time pointers to static code.
macro_rules! impl_marker_trait_fn_ptr {
    ($trait:ident: $T:ident) => {
        $crate::marker_trait::impl_marker_trait_fn_ptr!(@impl $trait: $T);
    };
    ($trait:ident: $T:ident $( $U:ident )+) => {
        $crate::marker_trait::impl_marker_trait_fn_ptr!($trait: $( $U )+);
        $crate::marker_trait::impl_marker_trait_fn_ptr!(@impl $trait: $T $( $U )+);
    };
    (@impl $trait:ident: $( $T:ident )+) => {
        unsafe impl<$($T,)+ Return> $trait for fn($($T),+) -> Return {}
    };
}

/// Create an implementation for every possible tuple where every element implements `$trait`.
///
/// Must be passed a sequence of identifier to the tuple's generic parameters. This will only
/// generate implementations up to the length of the passed in sequence.
///
/// Based on stdlib's internal `tuple_impls!` macro.
macro_rules! impl_marker_trait_tuple {
    ($trait:ident: $T:ident) => {
        $crate::marker_trait::impl_marker_trait_tuple!(@impl $trait: $T);
    };
    ($trait:ident: $T:ident $( $U:ident )+) => {
        $crate::marker_trait::impl_marker_trait_tuple!($trait: $( $U )+);
        $crate::marker_trait::impl_marker_trait_tuple!(@impl $trait: $T $( $U )+);
    };
    (@impl $trait:ident: $( $T:ident )+) => {
        unsafe impl<$($T: $trait),+> $trait for ($($T,)+) {}
    };
}

pub(crate) use impl_auto_marker_trait;
pub(crate) use impl_marker_trait;
pub(crate) use impl_marker_trait_fn_ptr;
pub(crate) use impl_marker_trait_tuple;
