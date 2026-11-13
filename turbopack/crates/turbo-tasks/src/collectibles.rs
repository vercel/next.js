use auto_hash_map::AutoSet;

use crate::{ResolvedVc, VcValueTrait};

/// Implemented on `OperationVc` and `RawVc`.
///
/// Collectibles are only stable after a strongly consistent read of their source (e.g.
/// [`OperationVc::read_strongly_consistent`][crate::OperationVc::read_strongly_consistent]). After
/// a read that isn't strongly consistent, collectibles of tasks in the source's subgraph that are
/// still being recomputed may not be visible yet.
pub trait CollectiblesSource {
    fn drop_collectibles<T: VcValueTrait>(self);
    fn take_collectibles<T: VcValueTrait>(self) -> AutoSet<ResolvedVc<T>>;
    fn peek_collectibles<T: VcValueTrait>(self) -> AutoSet<ResolvedVc<T>>;
}
