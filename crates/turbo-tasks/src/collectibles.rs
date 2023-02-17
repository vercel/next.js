use crate::{self as turbo_tasks, CollectiblesFuture};

pub trait CollectiblesSource {
    fn take_collectibles<T: turbo_tasks::ValueTraitVc>(self) -> CollectiblesFuture<T>;
    fn peek_collectibles<T: turbo_tasks::ValueTraitVc>(self) -> CollectiblesFuture<T>;
}
