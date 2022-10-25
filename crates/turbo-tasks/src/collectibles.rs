use anyhow::{anyhow, Result};

use crate::{
    self as turbo_tasks, manager::read_task_collectibles, primitives::RawVcSetVc,
    CollectiblesFuture, RawVc, TraitTypeId,
};

#[turbo_tasks::function]
#[allow(dead_code)] // It's used indirectly
pub async fn read_collectibles(raw: RawVc, trait_type: usize) -> Result<RawVcSetVc> {
    if let RawVc::TaskOutput(task) = raw {
        let tt = crate::turbo_tasks();
        let set = read_task_collectibles(&*tt, task, TraitTypeId::from(trait_type)).await?;
        Ok(RawVcSetVc::cell(set))
    } else {
        Err(anyhow!(
            "peek/take_collectibles was called on Vc that points to a cell (instead of a Vc that \
             points to a task output)"
        ))
    }
}

pub trait CollectiblesSource {
    fn take_collectibles<T: turbo_tasks::ValueTraitVc>(self) -> CollectiblesFuture<T>;
    fn peek_collectibles<T: turbo_tasks::ValueTraitVc>(self) -> CollectiblesFuture<T>;
}
