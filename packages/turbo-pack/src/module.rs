use turbo_tasks_fs::FileSystemPathRef;

#[turbo_tasks::value]
#[derive(Hash, PartialEq, Eq)]
pub struct Module {
    pub path: FileSystemPathRef,
}

#[turbo_tasks::value]
#[derive(Hash, PartialEq, Eq)]
pub struct ModulesSet {
    pub modules: Vec<ModuleRef>,
}
