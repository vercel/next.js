use std::{fmt::Debug, future::Future, marker::PhantomData};

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::{
    registry::get_value_type,
    task::shared_reference::TypedSharedReference,
    vc::{cast::VcCast, ReadVcFuture, VcValueTraitCast},
    Vc, VcValueTrait,
};

/// Similar to a [`ReadRef<T>`][crate::ReadRef], but contains a value trait
/// object instead.
///
/// The only way to interact with a `TraitRef<T>` is by passing
/// it around or turning it back into a value trait vc by calling
/// [`ReadRef::cell`][crate::ReadRef::cell].
///
/// Internally it stores a reference counted reference to a value on the heap.
pub struct TraitRef<T>
where
    T: ?Sized,
{
    shared_reference: TypedSharedReference,
    _t: PhantomData<T>,
}

impl<T> Debug for TraitRef<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TraitRef")
            .field("shared_reference", &self.shared_reference)
            .finish()
    }
}

impl<T> Clone for TraitRef<T> {
    fn clone(&self) -> Self {
        Self {
            shared_reference: self.shared_reference.clone(),
            _t: PhantomData,
        }
    }
}

impl<T> PartialEq for TraitRef<T> {
    fn eq(&self, other: &Self) -> bool {
        self.shared_reference == other.shared_reference
    }
}

impl<T> Eq for TraitRef<T> {}

impl<T> std::hash::Hash for TraitRef<T> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.shared_reference.hash(state)
    }
}

impl<T> Serialize for TraitRef<T> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.shared_reference.serialize(serializer)
    }
}

impl<'de, T> Deserialize<'de> for TraitRef<T> {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(Self {
            shared_reference: TypedSharedReference::deserialize(deserializer)?,
            _t: PhantomData,
        })
    }
}

// Otherwise, TraitRef<Box<dyn Trait>> would not be Sync.
// SAFETY: TraitRef doesn't actually contain a T.
unsafe impl<T> Sync for TraitRef<T> where T: ?Sized {}

// Otherwise, TraitRef<Box<dyn Trait>> would not be Send.
// SAFETY: TraitRef doesn't actually contain a T.
unsafe impl<T> Send for TraitRef<T> where T: ?Sized {}

impl<T> Unpin for TraitRef<T> where T: ?Sized {}

impl<T> TraitRef<T>
where
    T: ?Sized,
{
    pub(crate) fn new(shared_reference: TypedSharedReference) -> Self {
        Self {
            shared_reference,
            _t: PhantomData,
        }
    }

    pub fn ptr_eq(this: &Self, other: &Self) -> bool {
        triomphe::Arc::ptr_eq(&this.shared_reference.1 .0, &other.shared_reference.1 .0)
    }
}

impl<T> TraitRef<T>
where
    T: VcValueTrait + ?Sized,
{
    /// Returns a new cell that points to a value that implements the value
    /// trait `T`.
    pub fn cell(trait_ref: TraitRef<T>) -> Vc<T> {
        let TraitRef {
            shared_reference, ..
        } = trait_ref;
        let value_type = get_value_type(shared_reference.0);
        (value_type.raw_cell)(shared_reference).into()
    }
}

/// A trait that allows a value trait vc to be converted into a trait reference.
///
/// The signature is similar to `IntoFuture`, but we don't want trait vcs to
/// have the same future-like semantics as value vcs when it comes to producing
/// refs. This behavior is rarely needed, so in most cases, `.await`ing a trait
/// vc is a mistake.
pub trait IntoTraitRef {
    type ValueTrait: VcValueTrait + ?Sized;
    type Future: Future<Output = Result<<VcValueTraitCast<Self::ValueTrait> as VcCast>::Output>>;

    fn into_trait_ref(self) -> Self::Future;
}

impl<T> IntoTraitRef for Vc<T>
where
    T: VcValueTrait + ?Sized,
{
    type ValueTrait = T;

    type Future = ReadVcFuture<T, VcValueTraitCast<T>>;

    fn into_trait_ref(self) -> Self::Future {
        self.node.into_read().into()
    }
}
