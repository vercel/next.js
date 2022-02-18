#[turbo_tasks::value]
#[derive(Hash, PartialEq, Eq)]
pub struct AssetReference {
    pub request: String,
}

#[turbo_tasks::value_impl]
impl AssetReference {
    // TODO key
    // #[turbo_tasks::constructor(key: request)]
    #[turbo_tasks::constructor(intern)]
    pub fn new(request: String) -> Self {
        Self { request }
    }
}

#[turbo_tasks::value]
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
