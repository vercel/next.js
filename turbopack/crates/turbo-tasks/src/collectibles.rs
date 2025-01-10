use auto_hash_map::AutoSet;

use crate::{Vc, VcValueTrait};

pub trait CollectiblesSource {
    fn take_collectibles<T: VcValueTrait>(self) -> AutoSet<Vc<T>>;
    fn peek_collectibles<T: VcValueTrait>(self) -> AutoSet<Vc<T>>;
}
