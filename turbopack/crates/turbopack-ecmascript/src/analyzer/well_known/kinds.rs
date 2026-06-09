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

    /// Returns a short display name and a longer explanation for this object,
    /// used when rendering [`JsValue`][crate::analyzer::JsValue] explanations.
    pub fn explain(&self) -> (&'static str, &'static str) {
        match self {
            Self::Generator => (
                "Generator",
                "A Generator or AsyncGenerator object: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Generator",
            ),
            Self::GlobalObject => ("Object", "The global Object variable"),
            Self::PathModule | Self::PathModuleDefault => (
                "path",
                "The Node.js path module: https://nodejs.org/api/path.html",
            ),
            Self::FsModule | Self::FsModuleDefault => (
                "fs",
                "The Node.js fs module: https://nodejs.org/api/fs.html",
            ),
            Self::FsExtraModule | Self::FsExtraModuleDefault => (
                "fs-extra",
                "The Node.js fs-extra module: https://github.com/jprichardson/node-fs-extra",
            ),
            Self::FsModulePromises => (
                "fs/promises",
                "The Node.js fs module: https://nodejs.org/api/fs.html#promises-api",
            ),
            Self::UrlModule | Self::UrlModuleDefault => (
                "url",
                "The Node.js url module: https://nodejs.org/api/url.html",
            ),
            Self::ModuleModule | Self::ModuleModuleDefault => (
                "module",
                "The Node.js `module` module: https://nodejs.org/api/module.html",
            ),
            Self::WorkerThreadsModule | Self::WorkerThreadsModuleDefault => (
                "worker_threads",
                "The Node.js `worker_threads` module: https://nodejs.org/api/worker_threads.html",
            ),
            Self::ChildProcessModule | Self::ChildProcessModuleDefault => (
                "child_process",
                "The Node.js child_process module: https://nodejs.org/api/child_process.html",
            ),
            Self::OsModule | Self::OsModuleDefault => (
                "os",
                "The Node.js os module: https://nodejs.org/api/os.html",
            ),
            Self::NodeProcessModule => (
                "process",
                "The Node.js process module: https://nodejs.org/api/process.html",
            ),
            Self::NodeProcessArgv => (
                "process.argv",
                "The Node.js process.argv property: https://nodejs.org/api/process.html#processargv",
            ),
            Self::NodeProcessEnv => (
                "process.env",
                "The Node.js process.env property: https://nodejs.org/api/process.html#processenv",
            ),
            Self::NodePreGyp => (
                "@mapbox/node-pre-gyp",
                "The Node.js @mapbox/node-pre-gyp module: https://github.com/mapbox/node-pre-gyp",
            ),
            Self::NodeExpressApp => (
                "express",
                "The Node.js express package: https://github.com/expressjs/express",
            ),
            Self::NodeProtobufLoader => (
                "@grpc/proto-loader",
                "The Node.js @grpc/proto-loader package: https://github.com/grpc/grpc-node",
            ),
            Self::NodeBuffer => (
                "Buffer",
                "The Node.js Buffer object: https://nodejs.org/api/buffer.html#class-buffer",
            ),
            Self::RequireCache => (
                "require.cache",
                "The CommonJS require.cache object: https://nodejs.org/api/modules.html#requirecache",
            ),
            Self::ImportMeta => ("import.meta", "The import.meta object"),
            Self::ModuleHot => ("module.hot", "The module.hot HMR API"),
        }
    }
}

/// A list of well-known functions that have special meaning in the analysis.
#[derive(Debug, Clone, Hash, PartialEq)]
pub enum WellKnownFunctionKind<'a> {
    ArrayFilter,
    ArrayForEach,
    ArrayMap,
    ObjectAssign,
    PathJoin,
    PathDirname,
    /// `0` is the current working directory.
    PathResolve(&'a JsValue<'a>),
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

impl WellKnownFunctionKind<'_> {
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

    /// Returns a short display name and a longer explanation for this function,
    /// used when rendering [`JsValue`][crate::analyzer::JsValue] explanations.
    pub fn explain(&self) -> (String, &'static str) {
        match self {
            Self::ArrayFilter => (
                "Array.prototype.filter".to_string(),
                "The standard Array.prototype.filter method: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter",
            ),
            Self::ArrayForEach => (
                "Array.prototype.forEach".to_string(),
                "The standard Array.prototype.forEach method: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach",
            ),
            Self::ArrayMap => (
                "Array.prototype.map".to_string(),
                "The standard Array.prototype.map method: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map",
            ),
            Self::ObjectAssign => (
                "Object.assign".to_string(),
                "Object.assign method: https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object/assign",
            ),
            Self::PathJoin => (
                "path.join".to_string(),
                "The Node.js path.join method: https://nodejs.org/api/path.html#pathjoinpaths",
            ),
            Self::PathDirname => (
                "path.dirname".to_string(),
                "The Node.js path.dirname method: https://nodejs.org/api/path.html#pathdirnamepath",
            ),
            Self::PathResolve(cwd) => (
                format!("path.resolve({cwd})"),
                "The Node.js path.resolve method: https://nodejs.org/api/path.html#pathresolvepaths",
            ),
            Self::Import => (
                "import".to_string(),
                "The dynamic import() method from the ESM specification: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#dynamic_imports",
            ),
            Self::Require => ("require".to_string(), "The require method from CommonJS"),
            Self::RequireFrom(rel) => (
                format!("createRequire('{rel}')"),
                "The return value of Node.js module.createRequire: https://nodejs.org/api/module.html#modulecreaterequirefilename",
            ),
            Self::RequireResolve => (
                "require.resolve".to_string(),
                "The require.resolve method from CommonJS",
            ),
            Self::RequireContext => (
                "require.context".to_string(),
                "The require.context method from webpack",
            ),
            Self::RequireContextRequire(..) => (
                "require.context(...)".to_string(),
                "The require.context(...) method from webpack: https://webpack.js.org/api/module-methods/#requirecontext",
            ),
            Self::RequireContextRequireKeys(..) => (
                "require.context(...).keys".to_string(),
                "The require.context(...).keys method from webpack: https://webpack.js.org/guides/dependency-management/#requirecontext",
            ),
            Self::RequireContextRequireResolve(..) => (
                "require.context(...).resolve".to_string(),
                "The require.context(...).resolve method from webpack: https://webpack.js.org/guides/dependency-management/#requirecontext",
            ),
            Self::Define => ("define".to_string(), "The define method from AMD"),
            Self::FsReadMethod(name) => (
                format!("fs.{name}"),
                "A file reading method from the Node.js fs module: https://nodejs.org/api/fs.html",
            ),
            Self::FsReadDir => (
                "fs.readdir".to_string(),
                "The Node.js fs.readdir method: https://nodejs.org/api/fs.html",
            ),
            Self::PathToFileUrl => (
                "url.pathToFileURL".to_string(),
                "The Node.js url.pathToFileURL method: https://nodejs.org/api/url.html#urlpathtofileurlpath",
            ),
            Self::CreateRequire => (
                "module.createRequire".to_string(),
                "The Node.js module.createRequire method: https://nodejs.org/api/module.html#modulecreaterequirefilename",
            ),
            Self::ChildProcessSpawnMethod(name) => (
                format!("child_process.{name}"),
                "A process spawning method from the Node.js child_process module: https://nodejs.org/api/child_process.html",
            ),
            Self::ChildProcessFork => (
                "child_process.fork".to_string(),
                "The Node.js child_process.fork method: https://nodejs.org/api/child_process.html#child_processforkmodulepath-args-options",
            ),
            Self::OsArch => (
                "os.arch".to_string(),
                "The Node.js os.arch method: https://nodejs.org/api/os.html#os_os_arch",
            ),
            Self::OsPlatform => (
                "os.process".to_string(),
                "The Node.js os.process method: https://nodejs.org/api/os.html#os_os_process",
            ),
            Self::OsEndianness => (
                "os.endianness".to_string(),
                "The Node.js os.endianness method: https://nodejs.org/api/os.html#os_os_endianness",
            ),
            Self::ProcessCwd => (
                "process.cwd".to_string(),
                "The Node.js process.cwd method: https://nodejs.org/api/process.html#processcwd",
            ),
            Self::NodePreGypFind => (
                "binary.find".to_string(),
                "The Node.js @mapbox/node-pre-gyp module: https://github.com/mapbox/node-pre-gyp",
            ),
            Self::NodeGypBuild => (
                "node-gyp-build".to_string(),
                "The Node.js node-gyp-build module: https://github.com/prebuild/node-gyp-build",
            ),
            Self::NodeBindings => (
                "bindings".to_string(),
                "The Node.js bindings module: https://github.com/TooTallNate/node-bindings",
            ),
            Self::NodeExpress => (
                "express".to_string(),
                "require('express')() : https://github.com/expressjs/express",
            ),
            Self::NodeExpressSet => (
                "set".to_string(),
                "require('express')().set('view engine', 'jade')  https://github.com/expressjs/express",
            ),
            Self::NodeStrongGlobalize => (
                "SetRootDir".to_string(),
                "require('strong-globalize')()  https://github.com/strongloop/strong-globalize",
            ),
            Self::NodeStrongGlobalizeSetRootDir => (
                "SetRootDir".to_string(),
                "require('strong-globalize').SetRootDir(__dirname)  https://github.com/strongloop/strong-globalize",
            ),
            Self::NodeResolveFrom => (
                "resolveFrom".to_string(),
                "require('resolve-from')(__dirname, 'node-gyp/bin/node-gyp')  https://github.com/sindresorhus/resolve-from",
            ),
            Self::NodeProtobufLoad => (
                "load/loadSync".to_string(),
                "require('@grpc/proto-loader').load(filepath, { includeDirs: [root] }) https://github.com/grpc/grpc-node",
            ),
            Self::NodeWorkerConstructor => (
                "Worker".to_string(),
                "The Node.js worker_threads Worker constructor: https://nodejs.org/api/worker_threads.html#worker_threads_class_worker",
            ),
            Self::WorkerConstructor => (
                "Worker".to_string(),
                "The standard Worker constructor: https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker",
            ),
            Self::SharedWorkerConstructor => (
                "SharedWorker".to_string(),
                "The standard SharedWorker constructor: https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker/SharedWorker",
            ),
            Self::URLConstructor => (
                "URL".to_string(),
                "The standard URL constructor: https://developer.mozilla.org/en-US/docs/Web/API/URL/URL",
            ),
            Self::ModuleHotAccept => (
                "module.hot.accept".to_string(),
                "The module.hot.accept HMR API: https://webpack.js.org/api/hot-module-replacement/#accept",
            ),
            Self::ModuleHotDecline => (
                "module.hot.decline".to_string(),
                "The module.hot.decline HMR API: https://webpack.js.org/api/hot-module-replacement/#decline",
            ),
            Self::ImportMetaGlob => (
                "import.meta.glob".to_string(),
                "The import.meta.glob() function from Vite: https://vite.dev/guide/features.html#glob-import",
            ),
        }
    }
}
