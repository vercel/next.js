use auto_hash_map::AutoSet;

use crate::{ResolvedVc, VcValueTrait};

/// Implemented on `OperationVc` and `RawVc`.
pub trait CollectiblesSource {
    fn take_collectibles<T: VcValueTrait>(self) -> AutoSet<ResolvedVc<T>>;
    fn peek_collectibles<T: VcValueTrait>(self) -> AutoSet<ResolvedVc<T>>;
}
