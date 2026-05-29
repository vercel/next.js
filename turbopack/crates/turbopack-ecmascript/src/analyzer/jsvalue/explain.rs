use std::fmt::Write;

use either::Either;

use crate::analyzer::{
    JsValue, ModuleValue, ObjectPart, WellKnownFunctionKind, WellKnownObjectKind,
    jsvalue::pretty_join,
};

// Methods for explaining a value
impl JsValue {
    pub fn explain_args(args: &[JsValue], depth: usize, unknown_depth: usize) -> (String, String) {
        let mut hints = Vec::new();
        let args = args
            .iter()
            .map(|arg| arg.explain_internal(&mut hints, 1, depth, unknown_depth))
            .collect::<Vec<_>>();
        let explainer = pretty_join(&args, 0, ", ", ",", "");
        (
            explainer,
            hints.into_iter().fold(String::new(), |mut out, h| {
                let _ = write!(out, "\n{h}");
                out
            }),
        )
    }

    pub fn explain(&self, depth: usize, unknown_depth: usize) -> (String, String) {
        let mut hints = Vec::new();
        let explainer = self.explain_internal(&mut hints, 0, depth, unknown_depth);
        (
            explainer,
            hints.into_iter().fold(String::new(), |mut out, h| {
                let _ = write!(out, "\n{h}");
                out
            }),
        )
    }

    fn explain_internal_inner(
        &self,
        hints: &mut Vec<String>,
        indent_depth: usize,
        depth: usize,
        unknown_depth: usize,
    ) -> String {
        if depth == 0 {
            return "...".to_string();
        }
        // let i = hints.len();

        // if explainer.len() < 100 {
        self.explain_internal(hints, indent_depth, depth - 1, unknown_depth)
        // }
        // hints.truncate(i);
        // hints.push(String::new());
        // hints[i] = format!(
        //     "- *{}* {}",
        //     i,
        //     self.explain_internal(hints, 1, depth - 1, unknown_depth)
        // );
        // format!("*{}*", i)
    }

    fn explain_internal(
        &self,
        hints: &mut Vec<String>,
        indent_depth: usize,
        depth: usize,
        unknown_depth: usize,
    ) -> String {
        match self {
            JsValue::Constant(v) => format!("{v}"),
            JsValue::Array { items, mutable, .. } => format!(
                "{}[{}]",
                if *mutable { "" } else { "frozen " },
                pretty_join(
                    &items
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    ", ",
                    ",",
                    ""
                )
            ),
            JsValue::Object { parts, mutable, .. } => format!(
                "{}{{{}}}",
                if *mutable { "" } else { "frozen " },
                pretty_join(
                    &parts
                        .iter()
                        .map(|v| match v {
                            ObjectPart::KeyValue(key, value) => format!(
                                "{}: {}",
                                key.explain_internal_inner(
                                    hints,
                                    indent_depth + 1,
                                    depth,
                                    unknown_depth
                                ),
                                value.explain_internal_inner(
                                    hints,
                                    indent_depth + 1,
                                    depth,
                                    unknown_depth
                                )
                            ),
                            ObjectPart::Spread(value) => format!(
                                "...{}",
                                value.explain_internal_inner(
                                    hints,
                                    indent_depth + 1,
                                    depth,
                                    unknown_depth
                                )
                            ),
                        })
                        .collect::<Vec<_>>(),
                    indent_depth,
                    ", ",
                    ",",
                    ""
                )
            ),
            JsValue::Url(url, kind) => format!("{url} {kind}"),
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property,
            } => {
                let list = pretty_join(
                    &values
                        .iter()
                        .map(|v| {
                            v.explain_internal_inner(hints, indent_depth + 1, depth, unknown_depth)
                        })
                        .collect::<Vec<_>>(),
                    indent_depth,
                    " | ",
                    "",
                    "| ",
                );
                if let Some(logical_property) = logical_property {
                    format!("({list}){{{logical_property}}}")
                } else {
                    format!("({list})")
                }
            }
            JsValue::FreeVar(name) => format!("FreeVar({name})"),
            JsValue::Variable(name) => {
                format!("{}", name.0)
            }
            JsValue::Argument(_, index) => {
                format!("arguments[{index}]")
            }
            JsValue::Concat(_, list) => format!(
                "`{}`",
                list.iter()
                    .map(|v| v.as_str().map_or_else(
                        || format!(
                            "${{{}}}",
                            v.explain_internal_inner(hints, indent_depth + 1, depth, unknown_depth)
                        ),
                        |str| str.to_string()
                    ))
                    .collect::<Vec<_>>()
                    .join("")
            ),
            JsValue::Add(_, list) => format!(
                "({})",
                pretty_join(
                    &list
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    " + ",
                    "",
                    "+ "
                )
            ),
            JsValue::Logical(_, op, list) => format!(
                "({})",
                pretty_join(
                    &list
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    op.joiner(),
                    "",
                    op.multi_line_joiner()
                )
            ),
            JsValue::Binary(_, a, op, b) => format!(
                "({}{}{})",
                a.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                op.joiner(),
                b.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
            ),
            JsValue::Tenary(_, test, cons, alt) => format!(
                "({} ? {} : {})",
                test.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                cons.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                alt.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
            ),
            JsValue::Not(_, value) => format!(
                "!({})",
                value.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
            ),
            JsValue::Iterated(_, iterable) => {
                format!(
                    "Iterated({})",
                    iterable.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
                )
            }
            JsValue::TypeOf(_, operand) => {
                format!(
                    "typeof({})",
                    operand.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
                )
            }
            JsValue::Promise(_, operand) => {
                format!(
                    "Promise<{}>",
                    operand.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
                )
            }
            JsValue::Awaited(_, operand) => {
                format!(
                    "await({})",
                    operand.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
                )
            }
            JsValue::New(_, call) => format!(
                "new {}({})",
                call.callee()
                    .explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                pretty_join(
                    &call
                        .args()
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    ", ",
                    ",",
                    ""
                )
            ),
            JsValue::Call(_, call) => format!(
                "{}({})",
                call.callee()
                    .explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                pretty_join(
                    &call
                        .args()
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    ", ",
                    ",",
                    ""
                )
            ),
            JsValue::SuperCall(_, args) => {
                format!(
                    "super({})",
                    pretty_join(
                        &args
                            .iter()
                            .map(|v| v.explain_internal_inner(
                                hints,
                                indent_depth + 1,
                                depth,
                                unknown_depth
                            ))
                            .collect::<Vec<_>>(),
                        indent_depth,
                        ", ",
                        ",",
                        ""
                    )
                )
            }
            JsValue::MemberCall(_, call) => format!(
                "{}[{}]({})",
                call.obj()
                    .explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                call.prop()
                    .explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                pretty_join(
                    &call
                        .args()
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    ", ",
                    ",",
                    ""
                )
            ),
            JsValue::Member(_, obj, prop) => {
                format!(
                    "{}[{}]",
                    obj.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                    prop.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
                )
            }
            JsValue::Module(ModuleValue {
                module: name,
                annotations,
            }) => {
                format!(
                    "module<{}, {}>",
                    name.to_string_lossy(),
                    if let Some(annotations) = annotations {
                        Either::Left(annotations)
                    } else {
                        Either::Right("{}")
                    }
                )
            }
            JsValue::Unknown {
                original_value: inner,
                reason: explainer,
                has_side_effects,
            } => {
                let has_side_effects = *has_side_effects;
                if unknown_depth == 0 || explainer.is_empty() {
                    "???".to_string()
                } else if let Some(inner) = inner {
                    let i = hints.len();
                    hints.push(String::new());
                    hints[i] = format!(
                        "- *{}* {}\n  ⚠️  {}{}",
                        i,
                        inner.explain_internal(hints, 1, depth, unknown_depth - 1),
                        explainer,
                        if has_side_effects {
                            "\n  ⚠️  This value might have side effects"
                        } else {
                            ""
                        }
                    );
                    format!("???*{i}*")
                } else {
                    let i = hints.len();
                    hints.push(String::new());
                    hints[i] = format!(
                        "- *{}* {}{}",
                        i,
                        explainer,
                        if has_side_effects {
                            "\n  ⚠️  This value might have side effects"
                        } else {
                            ""
                        }
                    );
                    format!("???*{i}*")
                }
            }
            JsValue::WellKnownObject(obj) => {
                let (name, explainer) = match obj {
                    WellKnownObjectKind::Generator => (
                        "Generator",
                        "A Generator or AsyncGenerator object: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Generator",
                    ),
                    WellKnownObjectKind::GlobalObject => (
                        "Object",
                        "The global Object variable",
                    ),
                    WellKnownObjectKind::PathModule | WellKnownObjectKind::PathModuleDefault => (
                        "path",
                        "The Node.js path module: https://nodejs.org/api/path.html",
                    ),
                    WellKnownObjectKind::FsModule | WellKnownObjectKind::FsModuleDefault => (
                        "fs",
                        "The Node.js fs module: https://nodejs.org/api/fs.html",
                    ),
                    WellKnownObjectKind::FsExtraModule | WellKnownObjectKind::FsExtraModuleDefault => (
                        "fs-extra",
                        "The Node.js fs-extra module: https://github.com/jprichardson/node-fs-extra",
                    ),
                    WellKnownObjectKind::FsModulePromises => (
                        "fs/promises",
                        "The Node.js fs module: https://nodejs.org/api/fs.html#promises-api",
                    ),
                    WellKnownObjectKind::UrlModule | WellKnownObjectKind::UrlModuleDefault => (
                        "url",
                        "The Node.js url module: https://nodejs.org/api/url.html",
                    ),
                    WellKnownObjectKind::ModuleModule | WellKnownObjectKind::ModuleModuleDefault => (
                        "module",
                        "The Node.js `module` module: https://nodejs.org/api/module.html",
                    ),
                    WellKnownObjectKind::WorkerThreadsModule | WellKnownObjectKind::WorkerThreadsModuleDefault => (
                        "worker_threads",
                        "The Node.js `worker_threads` module: https://nodejs.org/api/worker_threads.html",
                    ),
                    WellKnownObjectKind::ChildProcessModule | WellKnownObjectKind::ChildProcessModuleDefault => (
                        "child_process",
                        "The Node.js child_process module: https://nodejs.org/api/child_process.html",
                    ),
                    WellKnownObjectKind::OsModule | WellKnownObjectKind::OsModuleDefault => (
                        "os",
                        "The Node.js os module: https://nodejs.org/api/os.html",
                    ),
                    WellKnownObjectKind::NodeProcessModule => (
                        "process",
                        "The Node.js process module: https://nodejs.org/api/process.html",
                    ),
                    WellKnownObjectKind::NodeProcessArgv => (
                        "process.argv",
                        "The Node.js process.argv property: https://nodejs.org/api/process.html#processargv",
                    ),
                    WellKnownObjectKind::NodeProcessEnv => (
                        "process.env",
                        "The Node.js process.env property: https://nodejs.org/api/process.html#processenv",
                    ),
                    WellKnownObjectKind::NodePreGyp => (
                        "@mapbox/node-pre-gyp",
                        "The Node.js @mapbox/node-pre-gyp module: https://github.com/mapbox/node-pre-gyp",
                    ),
                    WellKnownObjectKind::NodeExpressApp => (
                        "express",
                        "The Node.js express package: https://github.com/expressjs/express"
                    ),
                    WellKnownObjectKind::NodeProtobufLoader => (
                        "@grpc/proto-loader",
                        "The Node.js @grpc/proto-loader package: https://github.com/grpc/grpc-node"
                    ),
                    WellKnownObjectKind::NodeBuffer => (
                        "Buffer",
                        "The Node.js Buffer object: https://nodejs.org/api/buffer.html#class-buffer"
                    ),
                    WellKnownObjectKind::RequireCache => (
                        "require.cache",
                        "The CommonJS require.cache object: https://nodejs.org/api/modules.html#requirecache"
                    ),
                    WellKnownObjectKind::ImportMeta => (
                        "import.meta",
                        "The import.meta object"
                    ),
                    WellKnownObjectKind::ModuleHot => (
                        "module.hot",
                        "The module.hot HMR API"
                    ),
                };
                if depth > 0 {
                    let i = hints.len();
                    hints.push(format!("- *{i}* {name}: {explainer}"));
                    format!("{name}*{i}*")
                } else {
                    name.to_string()
                }
            }
            JsValue::WellKnownFunction(func) => {
                let (name, explainer) = match func {
                    WellKnownFunctionKind::ArrayFilter => (
                      "Array.prototype.filter".to_string(),
                      "The standard Array.prototype.filter method: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter"
                    ),
                    WellKnownFunctionKind::ArrayForEach => (
                      "Array.prototype.forEach".to_string(),
                      "The standard Array.prototype.forEach method: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach"
                    ),
                    WellKnownFunctionKind::ArrayMap => (
                      "Array.prototype.map".to_string(),
                      "The standard Array.prototype.map method: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map"
                    ),
                    WellKnownFunctionKind::ObjectAssign => (
                        "Object.assign".to_string(),
                        "Object.assign method: https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object/assign",
                    ),
                    WellKnownFunctionKind::PathJoin => (
                        "path.join".to_string(),
                        "The Node.js path.join method: https://nodejs.org/api/path.html#pathjoinpaths",
                    ),
                    WellKnownFunctionKind::PathDirname => (
                        "path.dirname".to_string(),
                        "The Node.js path.dirname method: https://nodejs.org/api/path.html#pathdirnamepath",
                    ),
                    WellKnownFunctionKind::PathResolve(cwd) => (
                        format!("path.resolve({cwd})"),
                        "The Node.js path.resolve method: https://nodejs.org/api/path.html#pathresolvepaths",
                    ),
                    WellKnownFunctionKind::Import => (
                        "import".to_string(),
                        "The dynamic import() method from the ESM specification: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#dynamic_imports"
                    ),
                    WellKnownFunctionKind::Require => ("require".to_string(), "The require method from CommonJS"),
                    WellKnownFunctionKind::RequireFrom(rel) => (
                        format!("createRequire('{rel}')"),
                        "The return value of Node.js module.createRequire: https://nodejs.org/api/module.html#modulecreaterequirefilename"
                    ),
                    WellKnownFunctionKind::RequireResolve => ("require.resolve".to_string(), "The require.resolve method from CommonJS"),
                    WellKnownFunctionKind::RequireContext => ("require.context".to_string(), "The require.context method from webpack"),
                    WellKnownFunctionKind::RequireContextRequire(..) => ("require.context(...)".to_string(), "The require.context(...) method from webpack: https://webpack.js.org/api/module-methods/#requirecontext"),
                    WellKnownFunctionKind::RequireContextRequireKeys(..) => ("require.context(...).keys".to_string(), "The require.context(...).keys method from webpack: https://webpack.js.org/guides/dependency-management/#requirecontext"),
                    WellKnownFunctionKind::RequireContextRequireResolve(..) => ("require.context(...).resolve".to_string(), "The require.context(...).resolve method from webpack: https://webpack.js.org/guides/dependency-management/#requirecontext"),
                    WellKnownFunctionKind::Define => ("define".to_string(), "The define method from AMD"),
                    WellKnownFunctionKind::FsReadMethod(name) => (
                        format!("fs.{name}"),
                        "A file reading method from the Node.js fs module: https://nodejs.org/api/fs.html",
                    ),
                    WellKnownFunctionKind::FsReadDir => (
                        "fs.readdir".to_string(),
                        "The Node.js fs.readdir method: https://nodejs.org/api/fs.html",
                    ),
                    WellKnownFunctionKind::PathToFileUrl => (
                        "url.pathToFileURL".to_string(),
                        "The Node.js url.pathToFileURL method: https://nodejs.org/api/url.html#urlpathtofileurlpath",
                    ),
                    WellKnownFunctionKind::CreateRequire => (
                        "module.createRequire".to_string(),
                        "The Node.js module.createRequire method: https://nodejs.org/api/module.html#modulecreaterequirefilename",
                    ),
                    WellKnownFunctionKind::ChildProcessSpawnMethod(name) => (
                        format!("child_process.{name}"),
                        "A process spawning method from the Node.js child_process module: https://nodejs.org/api/child_process.html",
                    ),
                    WellKnownFunctionKind::ChildProcessFork => (
                        "child_process.fork".to_string(),
                        "The Node.js child_process.fork method: https://nodejs.org/api/child_process.html#child_processforkmodulepath-args-options",
                    ),
                    WellKnownFunctionKind::OsArch => (
                        "os.arch".to_string(),
                        "The Node.js os.arch method: https://nodejs.org/api/os.html#os_os_arch",
                    ),
                    WellKnownFunctionKind::OsPlatform => (
                        "os.process".to_string(),
                        "The Node.js os.process method: https://nodejs.org/api/os.html#os_os_process",
                    ),
                    WellKnownFunctionKind::OsEndianness => (
                        "os.endianness".to_string(),
                        "The Node.js os.endianness method: https://nodejs.org/api/os.html#os_os_endianness",
                    ),
                    WellKnownFunctionKind::ProcessCwd => (
                        "process.cwd".to_string(),
                        "The Node.js process.cwd method: https://nodejs.org/api/process.html#processcwd",
                    ),
                    WellKnownFunctionKind::NodePreGypFind => (
                        "binary.find".to_string(),
                        "The Node.js @mapbox/node-pre-gyp module: https://github.com/mapbox/node-pre-gyp",
                    ),
                    WellKnownFunctionKind::NodeGypBuild => (
                        "node-gyp-build".to_string(),
                        "The Node.js node-gyp-build module: https://github.com/prebuild/node-gyp-build"
                    ),
                    WellKnownFunctionKind::NodeBindings => (
                        "bindings".to_string(),
                        "The Node.js bindings module: https://github.com/TooTallNate/node-bindings"
                    ),
                    WellKnownFunctionKind::NodeExpress => (
                        "express".to_string(),
                        "require('express')() : https://github.com/expressjs/express"
                    ),
                    WellKnownFunctionKind::NodeExpressSet => (
                        "set".to_string(),
                        "require('express')().set('view engine', 'jade')  https://github.com/expressjs/express"
                    ),
                    WellKnownFunctionKind::NodeStrongGlobalize => (
                      "SetRootDir".to_string(),
                      "require('strong-globalize')()  https://github.com/strongloop/strong-globalize"
                    ),
                    WellKnownFunctionKind::NodeStrongGlobalizeSetRootDir => (
                      "SetRootDir".to_string(),
                      "require('strong-globalize').SetRootDir(__dirname)  https://github.com/strongloop/strong-globalize"
                    ),
                    WellKnownFunctionKind::NodeResolveFrom => (
                      "resolveFrom".to_string(),
                      "require('resolve-from')(__dirname, 'node-gyp/bin/node-gyp')  https://github.com/sindresorhus/resolve-from"
                    ),
                    WellKnownFunctionKind::NodeProtobufLoad => (
                      "load/loadSync".to_string(),
                      "require('@grpc/proto-loader').load(filepath, { includeDirs: [root] }) https://github.com/grpc/grpc-node"
                    ),
                    WellKnownFunctionKind::NodeWorkerConstructor => (
                      "Worker".to_string(),
                      "The Node.js worker_threads Worker constructor: https://nodejs.org/api/worker_threads.html#worker_threads_class_worker"
                    ),
                    WellKnownFunctionKind::WorkerConstructor => (
                      "Worker".to_string(),
                      "The standard Worker constructor: https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker"
                    ),
                    WellKnownFunctionKind::SharedWorkerConstructor => (
                      "SharedWorker".to_string(),
                      "The standard SharedWorker constructor: https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker/SharedWorker"
                    ),
                    WellKnownFunctionKind::URLConstructor => (
                      "URL".to_string(),
                      "The standard URL constructor: https://developer.mozilla.org/en-US/docs/Web/API/URL/URL"
                    ),
                    WellKnownFunctionKind::ModuleHotAccept => (
                      "module.hot.accept".to_string(),
                      "The module.hot.accept HMR API: https://webpack.js.org/api/hot-module-replacement/#accept"
                    ),
                    WellKnownFunctionKind::ModuleHotDecline => (
                      "module.hot.decline".to_string(),
                      "The module.hot.decline HMR API: https://webpack.js.org/api/hot-module-replacement/#decline"
                    ),
                    WellKnownFunctionKind::ImportMetaGlob => (
                      "import.meta.glob".to_string(),
                      "The import.meta.glob() function from Vite: https://vite.dev/guide/features.html#glob-import"
                    ),
                };
                if depth > 0 {
                    let i = hints.len();
                    hints.push(format!("- *{i}* {name}: {explainer}"));
                    format!("{name}*{i}*")
                } else {
                    name
                }
            }
            JsValue::Function(_, _, return_value) => {
                if depth > 0 {
                    format!(
                        "(...) => {}",
                        return_value.explain_internal(
                            hints,
                            indent_depth,
                            depth - 1,
                            unknown_depth
                        )
                    )
                } else {
                    "(...) => ...".to_string()
                }
            }
        }
    }
}
