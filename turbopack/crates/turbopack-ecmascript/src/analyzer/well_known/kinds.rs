use swc_core::ecma::atoms::Atom;

use crate::analyzer::{ConstantString, JsValue, RequireContextValue};

/// A list of well-known objects that have special meaning in the analysis.
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum WellKnownObjectKind {
    GlobalObject,
    PathModule,
    PathModuleDefault,
    FsModule,
    FsModuleDefault,
    FsModulePromises,
    FsExtraModule,
    FsExtraModuleDefault,
    ModuleModule,
    ModuleModuleDefault,
    UrlModule,
    UrlModuleDefault,
    WorkerThreadsModule,
    WorkerThreadsModuleDefault,
    ChildProcessModule,
    ChildProcessModuleDefault,
    OsModule,
    OsModuleDefault,
    NodeProcessModule,
    NodeProcessArgv,
    NodeProcessEnv,
    NodePreGyp,
    NodeExpressApp,
    NodeProtobufLoader,
    NodeBuffer,
    RequireCache,
    ImportMeta,
    /// An iterator object, used to model generator return values.
    Generator,
    /// The `module.hot` object providing HMR API.
    ModuleHot,
}

impl WellKnownObjectKind {
    pub fn as_define_name(&self) -> Option<&[&str]> {
        match self {
            Self::GlobalObject => Some(&["Object"]),
            Self::PathModule => Some(&["path"]),
            Self::FsModule => Some(&["fs"]),
            Self::UrlModule => Some(&["url"]),
            Self::ChildProcessModule => Some(&["child_process"]),
            Self::OsModule => Some(&["os"]),
            Self::WorkerThreadsModule => Some(&["worker_threads"]),
            Self::NodeProcessModule => Some(&["process"]),
            Self::NodeProcessArgv => Some(&["process", "argv"]),
            Self::NodeProcessEnv => Some(&["process", "env"]),
            Self::NodeBuffer => Some(&["Buffer"]),
            Self::RequireCache => Some(&["require", "cache"]),
            Self::ImportMeta => Some(&["import", "meta"]),
            _ => None,
        }
    }
}

/// A list of well-known functions that have special meaning in the analysis.
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum WellKnownFunctionKind {
    ArrayFilter,
    ArrayForEach,
    ArrayMap,
    ObjectAssign,
    PathJoin,
    PathDirname,
    /// `0` is the current working directory.
    PathResolve(Box<JsValue>),
    Import,
    Require,
    /// `0` is the path to resolve from (relative to the current module).
    RequireFrom(Box<ConstantString>),
    RequireResolve,
    RequireContext,
    // Boxed: `RequireContextValue` wraps a 56-byte `FxIndexMap`. Inlining it here dominates
    // `WellKnownFunctionKind`'s size (64 bytes) and by extension `JsValue`.
    RequireContextRequire(Box<RequireContextValue>),
    RequireContextRequireKeys(Box<RequireContextValue>),
    RequireContextRequireResolve(Box<RequireContextValue>),
    Define,
    FsReadMethod(Atom),
    FsReadDir,
    PathToFileUrl,
    CreateRequire,
    ChildProcessSpawnMethod(Atom),
    ChildProcessFork,
    OsArch,
    OsPlatform,
    OsEndianness,
    ProcessCwd,
    NodePreGypFind,
    NodeGypBuild,
    NodeBindings,
    NodeExpress,
    NodeExpressSet,
    NodeStrongGlobalize,
    NodeStrongGlobalizeSetRootDir,
    NodeResolveFrom,
    NodeProtobufLoad,
    WorkerConstructor,
    SharedWorkerConstructor,
    // The worker_threads Worker class
    NodeWorkerConstructor,
    URLConstructor,
    /// `module.hot.accept(deps, callback, errorHandler)` — accept HMR updates for dependencies.
    ModuleHotAccept,
    /// `module.hot.decline(deps)` — decline HMR updates for dependencies.
    ModuleHotDecline,
    /// `import.meta.glob(patterns, options?)` — Vite-compatible glob import.
    ImportMetaGlob,
}

impl WellKnownFunctionKind {
    pub fn as_define_name(&self) -> Option<&[&str]> {
        match self {
            Self::Import { .. } => Some(&["import"]),
            Self::Require { .. } => Some(&["require"]),
            Self::RequireResolve => Some(&["require", "resolve"]),
            Self::RequireContext => Some(&["require", "context"]),
            Self::Define => Some(&["define"]),
            _ => None,
        }
    }
}
