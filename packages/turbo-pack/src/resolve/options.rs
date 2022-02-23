use turbo_tasks::trace::TraceSlotRefs;
use turbo_tasks_fs::FileSystemPathRef;

#[turbo_tasks::value(intern)]
#[derive(Hash, PartialEq, Eq, Debug)]
pub struct LockedVersions {}

#[derive(TraceSlotRefs, Hash, PartialEq, Eq, Clone, Debug)]
pub enum ResolveModules {
    /// when inside of path, use the list of directories to
    /// resolve inside these
    Nested(FileSystemPathRef, Vec<String>),
    /// look into that directory
    Path(FileSystemPathRef),
    /// lookup versions based on lockfile in the registry filesystem
    /// registry filesystem is assumed to have structure like
    /// @scope/module/version/<path-in-package>
    Registry(FileSystemPathRef, LockedVersionsRef),
}

#[derive(TraceSlotRefs, Hash, PartialEq, Eq, Clone, Debug)]
pub enum ResolveIntoPackage {
    ExportsField(String),
    MainField(String),
    Default(String),
}

#[turbo_tasks::value(intern)]
#[derive(Hash, PartialEq, Eq, Clone, Debug)]
pub struct ResolveOptions {
    pub extensions: Vec<String>,
    pub modules: Vec<ResolveModules>,
    pub into_package: Vec<ResolveIntoPackage>,
}

#[turbo_tasks::value(intern)]
#[derive(Hash, PartialEq, Eq, Clone, Debug)]
pub struct ResolveModulesOptions {
    pub modules: Vec<ResolveModules>,
}

#[turbo_tasks::function]
pub async fn resolve_modules_options(options: ResolveOptionsRef) -> ResolveModulesOptionsRef {
    ResolveModulesOptions {
        modules: options.await.modules.clone(),
    }
    .into()
}
