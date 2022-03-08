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
impl AssetReferencesSetRef {
    pub fn empty() -> Self {
        Self::slot(AssetReferencesSet {
            references: Vec::new(),
        })
    }
}
