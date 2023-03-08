use std::{fmt::Debug, future::Future, marker::PhantomData, sync::Arc};

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::{manager::find_cell_by_type, RawVc, SharedReference, ValueTraitVc};

/// Similar to a [`ReadRef<T>`], but contains a value trait object instead. The
/// only way to interact with a `TraitRef<T>` is by passing it around or turning
/// it back into a value trait vc by calling [`ReadRef::cell`].
///
/// Internally it stores a reference counted reference to a value on the heap.
#[derive(Debug, Clone, Hash, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
pub struct TraitRef<T>
where
    T: ?Sized,
{
    shared_reference: SharedReference,
    _t: PhantomData<Arc<T>>,
}

impl<T> TraitRef<T> {
    pub(crate) fn new(shared_reference: SharedReference) -> Self {
        Self {
            shared_reference,
            _t: PhantomData,
        }
    }
}

impl<T> TraitRef<T>
where
    T: From<RawVc>,
{
    /// Returns a new cell that points to a value that implements the value
    /// trait `T`.
    pub fn cell(trait_ref: TraitRef<T>) -> T {
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
    type TraitVc: ValueTraitVc;
    type Future: Future<Output = Result<TraitRef<Self::TraitVc>>>;

    fn into_trait_ref(self) -> Self::Future;
}
