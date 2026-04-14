use turbo_frozenmap::FrozenSet;

use crate::{ResolvedVc, VcValueTrait};

/// Implemented on `OperationVc` and `RawVc`.
pub trait CollectiblesSource {
    fn drop_collectibles<T: VcValueTrait>(self);
    fn take_collectibles<T: VcValueTrait>(self) -> FrozenSet<ResolvedVc<T>>;
    fn peek_collectibles<T: VcValueTrait>(self) -> FrozenSet<ResolvedVc<T>>;
}
