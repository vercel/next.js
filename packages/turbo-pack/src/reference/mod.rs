use crate::{asset::AssetRef, resolve::ResolveResultRef};

#[turbo_tasks::value_trait]
pub trait AssetReference {
    fn resolve(&self, from: AssetRef) -> ResolveResultRef;
}

#[turbo_tasks::value(shared)]
#[derive(Hash, PartialEq, Eq)]
pub struct AssetReferencesSet {
    pub references: Vec<AssetReferenceRef>,
}

#[turbo_tasks::value_impl]
impl AssetReferencesSet {
    #[turbo_tasks::constructor(intern)]
    pub fn empty() -> Self {
        Self {
            references: Vec::new(),
        }
    }
}
