use std::{fmt::Debug, future::Future, marker::PhantomData};

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::{
    manager::find_cell_by_type,
    vc::{cast::VcCast, VcValueTraitCast},
    RawVc, ReadRawVcFuture, SharedReference, Vc, VcValueTrait,
};

/// Similar to a [`ReadRef<T>`][crate::ReadRef], but contains a value trait
/// object instead. The only way to interact with a `TraitRef<T>` is by passing
/// it around or turning it back into a value trait vc by calling
/// [`ReadRef::cell`][crate::ReadRef::cell].
///
/// Internally it stores a reference counted reference to a value on the heap.
pub struct TraitRef<T>
where
    T: ?Sized,
{
    shared_reference: SharedReference,
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

impl<T> PartialOrd for TraitRef<T> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl<T> Ord for TraitRef<T> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.shared_reference.cmp(&other.shared_reference)
    }
}

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
            shared_reference: SharedReference::deserialize(deserializer)?,
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
    pub(crate) fn new(shared_reference: SharedReference) -> Self {
        Self {
            shared_reference,
            _t: PhantomData,
        }
    }
}

impl<T> TraitRef<T>
where
    T: VcValueTrait + ?Sized + Send,
{
    /// Returns a new cell that points to a value that implements the value
    /// trait `T`.
    pub fn cell(trait_ref: TraitRef<T>) -> Vc<T> {
        // See Safety clause above.
        let SharedReference(ty, _) = trait_ref.shared_reference;
        let ty = ty.unwrap();
        let local_cell = find_cell_by_type(ty);
        local_cell.update_shared_reference(trait_ref.shared_reference);
        let raw_vc: RawVc = local_cell.into();
        raw_vc.into()
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
    fn into_trait_ref_untracked(self) -> Self::Future;
    fn into_trait_ref_strongly_consistent_untracked(self) -> Self::Future;
}

impl<T> IntoTraitRef for Vc<T>
where
    T: VcValueTrait + ?Sized + Send,
{
    type ValueTrait = T;

    type Future = ReadRawVcFuture<T, VcValueTraitCast<T>>;

    fn into_trait_ref(self) -> Self::Future {
        self.node.into_trait_read::<T>()
    }

    fn into_trait_ref_untracked(self) -> Self::Future {
        self.node.into_trait_read_untracked::<T>()
    }

    fn into_trait_ref_strongly_consistent_untracked(self) -> Self::Future {
        self.node
            .into_strongly_consistent_trait_read_untracked::<T>()
    }
}
