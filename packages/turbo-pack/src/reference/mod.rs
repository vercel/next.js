#[turbo_tasks::value]
#[derive(Hash, PartialEq, Eq)]
pub struct ModuleReference {
    pub request: String,
}

#[turbo_tasks::value_impl]
impl ModuleReference {
    // TODO key
    // #[turbo_tasks::constructor(key: request)]
    #[turbo_tasks::constructor(intern)]
    pub fn new(request: String) -> Self {
        Self { request }
    }
}

#[turbo_tasks::value]
#[derive(Hash, PartialEq, Eq)]
pub struct ModuleReferencesSet {
    pub references: Vec<ModuleReferenceRef>,
}

#[turbo_tasks::value_impl]
impl ModuleReferencesSet {
    #[turbo_tasks::constructor(intern)]
    pub fn empty() -> Self {
        Self {
            references: Vec::new(),
        }
    }
}
