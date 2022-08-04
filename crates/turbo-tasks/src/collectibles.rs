use anyhow::Result;

use crate::{
    self as turbo_tasks, manager::read_task_collectibles, primitives::RawVcSetVc,
    CollectiblesFuture, RawVc, TraitTypeId,
};

#[turbo_tasks::function]
pub async fn read_collectibles(raw: RawVc, trait_type: usize) -> Result<RawVcSetVc> {
    let tt = crate::turbo_tasks();
    let set =
        read_task_collectibles(&*tt, raw.get_task_id(), TraitTypeId::from(trait_type)).await?;
    Ok(RawVcSetVc::cell(set.into_iter().collect()))
}

pub trait CollectiblesSource {
    fn take_collectibles<T: turbo_tasks::ValueTraitVc>(self) -> CollectiblesFuture<T>;
    fn peek_collectibles<T: turbo_tasks::ValueTraitVc>(self) -> CollectiblesFuture<T>;
}
