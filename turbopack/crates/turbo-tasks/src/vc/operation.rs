use std::{fmt::Debug, hash::Hash};

use auto_hash_map::AutoSet;
use serde::{Deserialize, Serialize};

use crate::{trace::TraceRawVcs, CollectiblesSource, RawVc, TaskInput, Upcast, Vc, VcValueTrait};

#[must_use]
pub struct OperationVc<T>
where
    T: ?Sized + Send,
{
    pub(crate) node: Vc<T>,
}

impl<T: ?Sized + Send> OperationVc<T> {
    /// Creates a new `OperationVc` from a `Vc`.
    ///
    /// The caller must ensure that the `Vc` is not a local task and it points to a a single
    /// operation.
    pub fn new(node: Vc<T>) -> Self {
        // TODO to avoid this runtime check, we should mark functions with `(operation)` and return
        // a OperationVc directly
        assert!(
            !node.is_local(),
            "OperationVc::new can't be used on local tasks"
        );
        Self { node }
    }

    pub fn connect(self) -> Vc<T> {
        self.node.node.connect();
        self.node
    }

    /// Returns the `RawVc` corresponding to this `Vc`.
    pub fn into_raw(vc: Self) -> RawVc {
        vc.node.node
    }

    /// Upcasts the given `OperationVc<T>` to a `OperationVc<Box<dyn K>>`.
    ///
    /// This is also available as an `Into`/`From` conversion.
    #[inline(always)]
    pub fn upcast<K>(vc: Self) -> OperationVc<K>
    where
        T: Upcast<K>,
        K: VcValueTrait + ?Sized + Send,
    {
        OperationVc {
            node: Vc::upcast(vc.node),
        }
    }
}

impl<T> Copy for OperationVc<T> where T: ?Sized + Send {}

impl<T> Clone for OperationVc<T>
where
    T: ?Sized + Send,
{
    fn clone(&self) -> Self {
        *self
    }
}

impl<T> Hash for OperationVc<T>
where
    T: ?Sized + Send,
{
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.node.hash(state);
    }
}

impl<T> PartialEq<OperationVc<T>> for OperationVc<T>
where
    T: ?Sized + Send,
{
    fn eq(&self, other: &Self) -> bool {
        self.node == other.node
    }
}

impl<T> Eq for OperationVc<T> where T: ?Sized + Send {}

impl<T> Debug for OperationVc<T>
where
    T: ?Sized + Send,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OperationVc")
            .field("node", &self.node.node)
            .finish()
    }
}

impl<T> TaskInput for OperationVc<T> where T: ?Sized + Send {}

impl<T> From<RawVc> for OperationVc<T>
where
    T: ?Sized + Send,
{
    fn from(raw: RawVc) -> Self {
        Self {
            node: Vc::from(raw),
        }
    }
}

impl<T> Serialize for OperationVc<T>
where
    T: ?Sized + Send,
{
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.node.serialize(serializer)
    }
}

impl<'de, T> Deserialize<'de> for OperationVc<T>
where
    T: ?Sized + Send,
{
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(OperationVc {
            node: Vc::deserialize(deserializer)?,
        })
    }
}

impl<T> TraceRawVcs for OperationVc<T>
where
    T: ?Sized + Send,
{
    fn trace_raw_vcs(&self, trace_context: &mut crate::trace::TraceRawVcsContext) {
        self.node.trace_raw_vcs(trace_context);
    }
}

impl<T> CollectiblesSource for OperationVc<T>
where
    T: ?Sized + Send,
{
    fn take_collectibles<Vt: VcValueTrait + Send>(self) -> AutoSet<Vc<Vt>> {
        self.node.node.take_collectibles()
    }

    fn peek_collectibles<Vt: VcValueTrait + Send>(self) -> AutoSet<Vc<Vt>> {
        self.node.node.peek_collectibles()
    }
}
