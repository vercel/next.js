use anyhow::Result;
use either::Either;
use parking_lot::RwLockReadGuard;

use crate::{
    converting_iter::{ConvertingIter, OwnedLookupEntry},
    db::Inner,
    dedupe_iter::DedupeIter,
    parallel_scheduler::ParallelScheduler,
};

/// Iterator over entries in a family
pub struct FamilyIter<'l, S: ParallelScheduler> {
    pub(crate) inner: Either<ConvertingIter<'l, S>, DedupeIter<ConvertingIter<'l, S>>>,
    /// The read guard to keep the inner data alive.
    /// Must be kept last to ensure it is dropped after the iterators.
    pub(crate) _guard: RwLockReadGuard<'l, Inner>,
}

impl<'l, S: ParallelScheduler> Iterator for FamilyIter<'l, S> {
    type Item = Result<OwnedLookupEntry>;

    fn next(&mut self) -> Option<Self::Item> {
        match &mut self.inner {
            Either::Left(iter) => iter.next(),
            Either::Right(iter) => iter.next(),
        }
    }
}
