use turbo_tasks::trace::TraceSlotRefs;
use turbo_tasks_fs::FileSystemPathRef;

#[derive(TraceSlotRefs, Hash, PartialEq, Eq, Clone, Debug)]
pub enum ResolveModules {
    Nested(Vec<String>),
    Path(FileSystemPathRef),
}

#[turbo_tasks::value]
#[derive(Hash, PartialEq, Eq, Clone, Debug)]
pub struct ResolveOptions {
    pub extensions: Vec<String>,
    pub modules: Vec<ResolveModules>,
}
