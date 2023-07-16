use crate::{CollectiblesFuture, VcValueTrait};

pub trait CollectiblesSource {
    fn take_collectibles<T: VcValueTrait>(self) -> CollectiblesFuture<T>;
    fn peek_collectibles<T: VcValueTrait>(self) -> CollectiblesFuture<T>;
}
