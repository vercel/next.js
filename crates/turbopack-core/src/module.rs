use crate::asset::{Asset, AssetVc};

/// A module. This usually represents parsed source code, which has references
/// to other modules.
#[turbo_tasks::value_trait]
pub trait Module: Asset {}

#[turbo_tasks::value(transparent)]
pub struct OptionModule(Option<ModuleVc>);
