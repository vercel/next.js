use std::mem::take;

use anyhow::Result;
use turbopack_core::compile_time_info::CompileTimeInfoVc;
use url::Url;

use super::{
    imports::ImportAnnotations, ConstantValue, JsValue, ModuleValue, WellKnownFunctionKind,
    WellKnownObjectKind,
};
use crate::analyzer::RequireContextValueVc;

pub async fn replace_well_known(
    value: JsValue,
    compile_time_info: CompileTimeInfoVc,
) -> Result<(JsValue, bool)> {
    Ok(match value {
        JsValue::Call(_, box JsValue::WellKnownFunction(kind), args) => (
            well_known_function_call(
                kind,
                JsValue::unknown_empty("this is not analyzed yet"),
                args,
                compile_time_info,
            )
            .await?,
            true,
        ),
        JsValue::Call(usize, callee, args) => {
            // var fs = require('fs'), fs = __importStar(fs);
            // TODO(WEB-552) this is not correct and has many false positives!
            if args.len() == 1 {
                if let JsValue::WellKnownObject(_) = &args[0] {
                    return Ok((args[0].clone(), true));
                }
            }
            (JsValue::Call(usize, callee, args), false)
        }
        JsValue::Member(_, box JsValue::WellKnownObject(kind), box prop) => {
            well_known_object_member(kind, prop, compile_time_info).await?
        }
        JsValue::Member(_, box JsValue::WellKnownFunction(kind), box prop) => {
            well_known_function_member(kind, prop)
        }
        _ => (value, false),
    })
}

pub async fn well_known_function_call(
    kind: WellKnownFunctionKind,
    _this: JsValue,
    args: Vec<JsValue>,
    compile_time_info: CompileTimeInfoVc,
) -> Result<JsValue> {
    Ok(match kind {
        WellKnownFunctionKind::ObjectAssign => object_assign(args),
        WellKnownFunctionKind::PathJoin => path_join(args),
        WellKnownFunctionKind::PathDirname => path_dirname(args),
        WellKnownFunctionKind::PathResolve(cwd) => path_resolve(*cwd, args),
        WellKnownFunctionKind::Import => JsValue::unknown(
            JsValue::call(Box::new(JsValue::WellKnownFunction(kind)), args),
            "import() is not supported",
        ),
        WellKnownFunctionKind::Require => require(args),
        WellKnownFunctionKind::RequireContextRequire(value) => {
            require_context_require(value, args).await?
        }
        WellKnownFunctionKind::RequireContextRequireKeys(value) => {
            require_context_require_keys(value, args).await?
        }
        WellKnownFunctionKind::RequireContextRequireResolve(value) => {
            require_context_require_resolve(value, args).await?
        }
        WellKnownFunctionKind::PathToFileUrl => path_to_file_url(args),
        WellKnownFunctionKind::OsArch => compile_time_info
            .environment()
            .compile_target()
            .await?
            .arch
            .as_str()
            .into(),
        WellKnownFunctionKind::OsPlatform => compile_time_info
            .environment()
            .compile_target()
            .await?
            .platform
            .as_str()
            .into(),
        WellKnownFunctionKind::ProcessCwd => {
            if let Some(cwd) = &*compile_time_info.environment().cwd().await? {
                cwd.clone().into()
            } else {
                JsValue::unknown(
                    JsValue::call(Box::new(JsValue::WellKnownFunction(kind)), args),
                    "process.cwd is not specified in the environment",
                )
            }
        }
        WellKnownFunctionKind::OsEndianness => compile_time_info
            .environment()
            .compile_target()
            .await?
            .endianness
            .as_str()
            .into(),
        WellKnownFunctionKind::NodeExpress => {
            JsValue::WellKnownObject(WellKnownObjectKind::NodeExpressApp)
        }
        // bypass
        WellKnownFunctionKind::NodeResolveFrom => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::NodeResolveFrom)
        }

        _ => JsValue::unknown(
            JsValue::call(Box::new(JsValue::WellKnownFunction(kind)), args),
            "unsupported function",
        ),
    })
}

pub fn object_assign(args: Vec<JsValue>) -> JsValue {
    if args.iter().all(|arg| matches!(arg, JsValue::Object { .. })) {
        if let Some(mut merged_object) = args.into_iter().reduce(|mut acc, cur| {
            if let JsValue::Object { parts, mutable, .. } = &mut acc {
                if let JsValue::Object {
                    parts: next_parts,
                    mutable: next_mutable,
                    ..
                } = &cur
                {
                    parts.extend_from_slice(next_parts);
                    *mutable |= *next_mutable;
                }
            }
            acc
        }) {
            merged_object.update_total_nodes();
            merged_object
        } else {
            JsValue::unknown(
                JsValue::call(
                    Box::new(JsValue::WellKnownFunction(
                        WellKnownFunctionKind::ObjectAssign,
                    )),
                    vec![],
                ),
                "empty arguments for Object.assign",
            )
        }
    } else {
        JsValue::unknown(
            JsValue::call(
                Box::new(JsValue::WellKnownFunction(
                    WellKnownFunctionKind::ObjectAssign,
                )),
                args,
            ),
            "only const object assign is supported",
        )
    }
}

pub fn path_join(args: Vec<JsValue>) -> JsValue {
    if args.is_empty() {
        return ".".into();
    }
    let mut parts = Vec::new();
    for item in args {
        if let Some(str) = item.as_str() {
            let splitted = str.split('/');
            parts.extend(splitted.map(|s| s.into()));
        } else {
            parts.push(item);
        }
    }
    let mut results_final = Vec::new();
    let mut results: Vec<JsValue> = Vec::new();
    for item in parts {
        if let Some(str) = item.as_str() {
            match str {
                "" | "." => {
                    if results_final.is_empty() && results.is_empty() {
                        results_final.push(item);
                    }
                }
                ".." => {
                    if results.pop().is_none() {
                        results_final.push(item);
                    }
                }
                _ => results.push(item),
            }
        } else {
            results_final.append(&mut results);
            results_final.push(item);
        }
    }
    results_final.append(&mut results);
    let mut iter = results_final.into_iter();
    let first = iter.next().unwrap();
    let mut last_is_str = first.as_str().is_some();
    results.push(first);
    for part in iter {
        let is_str = part.as_str().is_some();
        if last_is_str && is_str {
            results.push("/".into());
        } else {
            results.push(JsValue::alternatives(vec!["/".into(), "".into()]));
        }
        results.push(part);
        last_is_str = is_str;
    }
    JsValue::concat(results)
}

pub fn path_resolve(cwd: JsValue, mut args: Vec<JsValue>) -> JsValue {
    // If no path segments are passed, `path.resolve()` will return the absolute
    // path of the current working directory.
    if args.is_empty() {
        return JsValue::unknown_empty("cwd is not static analyzable");
    }
    if args.len() == 1 {
        return args.into_iter().next().unwrap();
    }

    // path.resolve stops at the string starting with `/`
    for (idx, arg) in args.iter().enumerate().rev() {
        if idx != 0 {
            if let Some(str) = arg.as_str() {
                if str.starts_with('/') {
                    return path_resolve(cwd, args.drain(idx..).collect());
                }
            }
        }
    }

    let mut results_final = Vec::new();
    let mut results: Vec<JsValue> = Vec::new();
    for item in args {
        if let Some(str) = item.as_str() {
            for str in str.split('/') {
                match str {
                    "" | "." => {
                        if results_final.is_empty() && results.is_empty() {
                            results_final.push(str.into());
                        }
                    }
                    ".." => {
                        if results.pop().is_none() {
                            results_final.push("..".into());
                        }
                    }
                    _ => results.push(str.into()),
                }
            }
        } else {
            results_final.append(&mut results);
            results_final.push(item);
        }
    }
    results_final.append(&mut results);
    let mut iter = results_final.into_iter();
    let first = iter.next().unwrap();

    let is_already_absolute =
        first.is_empty_string() == Some(true) || first.starts_with("/") == Some(true);

    let mut last_was_str = first.as_str().is_some();

    if !is_already_absolute {
        results.push(cwd);
    }

    results.push(first);
    for part in iter {
        let is_str = part.as_str().is_some();
        if last_was_str && is_str {
            results.push("/".into());
        } else {
            results.push(JsValue::alternatives(vec!["/".into(), "".into()]));
        }
        results.push(part);
        last_was_str = is_str;
    }

    JsValue::concat(results)
}

pub fn path_dirname(mut args: Vec<JsValue>) -> JsValue {
    if let Some(arg) = args.iter_mut().next() {
        if let Some(str) = arg.as_str() {
            if let Some(i) = str.rfind('/') {
                return JsValue::Constant(ConstantValue::Str(str[..i].to_string().into()));
            } else {
                return JsValue::Constant(ConstantValue::Str("".into()));
            }
        } else if let JsValue::Concat(_, items) = arg {
            if let Some(last) = items.last_mut() {
                if let Some(str) = last.as_str() {
                    if let Some(i) = str.rfind('/') {
                        *last = JsValue::Constant(ConstantValue::Str(str[..i].to_string().into()));
                        return take(arg);
                    }
                }
            }
        }
    }
    JsValue::unknown(
        JsValue::call(
            Box::new(JsValue::WellKnownFunction(
                WellKnownFunctionKind::PathDirname,
            )),
            args,
        ),
        "path.dirname with unsupported arguments",
    )
}

pub fn require(args: Vec<JsValue>) -> JsValue {
    if args.len() == 1 {
        if let Some(s) = args[0].as_str() {
            JsValue::Module(ModuleValue {
                module: s.into(),
                annotations: ImportAnnotations::default(),
            })
        } else {
            JsValue::unknown(
                JsValue::call(
                    Box::new(JsValue::WellKnownFunction(WellKnownFunctionKind::Require)),
                    args,
                ),
                "only constant argument is supported",
            )
        }
    } else {
        JsValue::unknown(
            JsValue::call(
                Box::new(JsValue::WellKnownFunction(WellKnownFunctionKind::Require)),
                args,
            ),
            "only a single argument is supported",
        )
    }
}

/// (try to) statically evaluate `require.context(...)()`
pub async fn require_context_require(
    val: RequireContextValueVc,
    args: Vec<JsValue>,
) -> Result<JsValue> {
    if args.is_empty() {
        return Ok(JsValue::unknown(
            JsValue::call(
                Box::new(JsValue::WellKnownFunction(
                    WellKnownFunctionKind::RequireContextRequire(val),
                )),
                args,
            ),
            "require.context(...).require() requires an argument specifying the module path",
        ));
    }

    let Some(s) = args[0].as_str() else {
        return Ok(JsValue::unknown(
            JsValue::call(
                Box::new(JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContextRequire(val))),
                args,
            ),
            "require.context(...).require() only accepts a single, constant string argument",
        ));
    };

    let map = val.await?;
    let Some(m) = map.get(s) else {
       return Ok(JsValue::unknown(
           JsValue::call(
               Box::new(JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContextRequire(val))),
               args,
           ),
           "require.context(...).require() can only be called with an argument that's in the context",
       ));
    };

    Ok(JsValue::Module(ModuleValue {
        module: m.to_string().into(),
        annotations: ImportAnnotations::default(),
    }))
}

/// (try to) statically evaluate `require.context(...).keys()`
pub async fn require_context_require_keys(
    val: RequireContextValueVc,
    args: Vec<JsValue>,
) -> Result<JsValue> {
    Ok(if args.is_empty() {
        let map = val.await?;
        JsValue::array(map.keys().cloned().map(|k| k.into()).collect())
    } else {
        JsValue::unknown(
            JsValue::call(
                Box::new(JsValue::WellKnownFunction(
                    WellKnownFunctionKind::RequireContextRequireKeys(val),
                )),
                args,
            ),
            "require.context(...).keys() does not accept arguments",
        )
    })
}

/// (try to) statically evaluate `require.context(...).resolve()`
pub async fn require_context_require_resolve(
    val: RequireContextValueVc,
    args: Vec<JsValue>,
) -> Result<JsValue> {
    if args.len() != 1 {
        return Ok(JsValue::unknown(
            JsValue::call(
                Box::new(JsValue::WellKnownFunction(
                    WellKnownFunctionKind::RequireContextRequireResolve(val),
                )),
                args,
            ),
            "require.context(...).resolve() only accepts a single, constant string argument",
        ));
    }

    let Some(s) = args[0].as_str() else {
        return Ok(JsValue::unknown(
            JsValue::call(
                Box::new(JsValue::WellKnownFunction(
                    WellKnownFunctionKind::RequireContextRequireResolve(val),
                )),
                args,
            ),
            "require.context(...).resolve() only accepts a single, constant string argument",
        ));
    };

    let map = val.await?;
    let Some(m) = map.get(s) else {
        return Ok(JsValue::unknown(
            JsValue::call(
                Box::new(JsValue::WellKnownFunction(
                    WellKnownFunctionKind::RequireContextRequireResolve(val),
                )),
                args,
            ),
            "require.context(...).resolve() can only be called with an argument that's in the context",
        ));
    };

    Ok(m.as_str().into())
}

pub fn path_to_file_url(args: Vec<JsValue>) -> JsValue {
    if args.len() == 1 {
        if let Some(path) = args[0].as_str() {
            Url::from_file_path(path)
                .map(JsValue::Url)
                .unwrap_or_else(|_| {
                    JsValue::unknown(
                        JsValue::call(
                            Box::new(JsValue::WellKnownFunction(
                                WellKnownFunctionKind::PathToFileUrl,
                            )),
                            args,
                        ),
                        "url not parseable: path is relative or has an invalid prefix",
                    )
                })
        } else {
            JsValue::unknown(
                JsValue::call(
                    Box::new(JsValue::WellKnownFunction(
                        WellKnownFunctionKind::PathToFileUrl,
                    )),
                    args,
                ),
                "only constant argument is supported",
            )
        }
    } else {
        JsValue::unknown(
            JsValue::call(
                Box::new(JsValue::WellKnownFunction(
                    WellKnownFunctionKind::PathToFileUrl,
                )),
                args,
            ),
            "only a single argument is supported",
        )
    }
}

pub fn well_known_function_member(kind: WellKnownFunctionKind, prop: JsValue) -> (JsValue, bool) {
    let new_value = match (kind, prop.as_str()) {
        (WellKnownFunctionKind::Require, Some("resolve")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve)
        }
        (WellKnownFunctionKind::Require, Some("cache")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::RequireCache)
        }
        (WellKnownFunctionKind::Require, Some("context")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContext)
        }
        (WellKnownFunctionKind::RequireContextRequire(val), Some("resolve")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContextRequireResolve(val))
        }
        (WellKnownFunctionKind::RequireContextRequire(val), Some("keys")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContextRequireKeys(val))
        }
        (WellKnownFunctionKind::NodeStrongGlobalize, Some("SetRootDir")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::NodeStrongGlobalizeSetRootDir)
        }
        (WellKnownFunctionKind::NodeResolveFrom, Some("silent")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::NodeResolveFrom)
        }
        #[allow(unreachable_patterns)]
        (kind, _) => {
            return (
                JsValue::member(Box::new(JsValue::WellKnownFunction(kind)), Box::new(prop)),
                false,
            )
        }
    };
    (new_value, true)
}

pub async fn well_known_object_member(
    kind: WellKnownObjectKind,
    prop: JsValue,
    compile_time_info: CompileTimeInfoVc,
) -> Result<(JsValue, bool)> {
    let new_value = match kind {
        WellKnownObjectKind::GlobalObject => global_object(prop),
        WellKnownObjectKind::PathModule | WellKnownObjectKind::PathModuleDefault => {
            path_module_member(kind, prop)
        }
        WellKnownObjectKind::FsModule
        | WellKnownObjectKind::FsModuleDefault
        | WellKnownObjectKind::FsModulePromises => fs_module_member(kind, prop),
        WellKnownObjectKind::UrlModule | WellKnownObjectKind::UrlModuleDefault => {
            url_module_member(kind, prop)
        }
        WellKnownObjectKind::ChildProcess | WellKnownObjectKind::ChildProcessDefault => {
            child_process_module_member(kind, prop)
        }
        WellKnownObjectKind::OsModule | WellKnownObjectKind::OsModuleDefault => {
            os_module_member(kind, prop)
        }
        WellKnownObjectKind::NodeProcess => node_process_member(prop, compile_time_info).await?,
        WellKnownObjectKind::NodePreGyp => node_pre_gyp(prop),
        WellKnownObjectKind::NodeExpressApp => express(prop),
        WellKnownObjectKind::NodeProtobufLoader => protobuf_loader(prop),
        #[allow(unreachable_patterns)]
        _ => {
            return Ok((
                JsValue::member(Box::new(JsValue::WellKnownObject(kind)), Box::new(prop)),
                false,
            ))
        }
    };
    Ok((new_value, true))
}

fn global_object(prop: JsValue) -> JsValue {
    match prop.as_str() {
        Some("assign") => JsValue::WellKnownFunction(WellKnownFunctionKind::ObjectAssign),
        _ => JsValue::unknown(
            JsValue::member(
                Box::new(JsValue::WellKnownObject(WellKnownObjectKind::GlobalObject)),
                Box::new(prop),
            ),
            "unsupported property on global Object",
        ),
    }
}

pub fn path_module_member(kind: WellKnownObjectKind, prop: JsValue) -> JsValue {
    match (kind, prop.as_str()) {
        (.., Some("join")) => JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin),
        (.., Some("dirname")) => JsValue::WellKnownFunction(WellKnownFunctionKind::PathDirname),
        (.., Some("resolve")) => {
            // cwd is added while resolving in refernces.rs
            JsValue::WellKnownFunction(WellKnownFunctionKind::PathResolve(Box::new(JsValue::from(
                "",
            ))))
        }
        (WellKnownObjectKind::PathModule, Some("default")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::PathModuleDefault)
        }
        _ => JsValue::unknown(
            JsValue::member(
                Box::new(JsValue::WellKnownObject(WellKnownObjectKind::PathModule)),
                Box::new(prop),
            ),
            "unsupported property on Node.js path module",
        ),
    }
}

pub fn fs_module_member(kind: WellKnownObjectKind, prop: JsValue) -> JsValue {
    if let Some(word) = prop.as_str() {
        match (kind, word) {
            (
                ..,
                "realpath" | "realpathSync" | "stat" | "statSync" | "existsSync"
                | "createReadStream" | "exists" | "open" | "openSync" | "readFile" | "readFileSync",
            ) => {
                return JsValue::WellKnownFunction(WellKnownFunctionKind::FsReadMethod(
                    word.into(),
                ));
            }
            (WellKnownObjectKind::FsModule | WellKnownObjectKind::FsModuleDefault, "promises") => {
                return JsValue::WellKnownObject(WellKnownObjectKind::FsModulePromises)
            }
            (WellKnownObjectKind::FsModule, "default") => {
                return JsValue::WellKnownObject(WellKnownObjectKind::FsModuleDefault)
            }
            _ => {}
        }
    }
    JsValue::unknown(
        JsValue::member(
            Box::new(JsValue::WellKnownObject(WellKnownObjectKind::FsModule)),
            Box::new(prop),
        ),
        "unsupported property on Node.js fs module",
    )
}

pub fn url_module_member(kind: WellKnownObjectKind, prop: JsValue) -> JsValue {
    match (kind, prop.as_str()) {
        (.., Some("pathToFileURL")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::PathToFileUrl)
        }
        (WellKnownObjectKind::UrlModuleDefault, Some("default")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::UrlModuleDefault)
        }
        _ => JsValue::unknown(
            JsValue::member(
                Box::new(JsValue::WellKnownObject(WellKnownObjectKind::UrlModule)),
                Box::new(prop),
            ),
            "unsupported property on Node.js url module",
        ),
    }
}

pub fn child_process_module_member(kind: WellKnownObjectKind, prop: JsValue) -> JsValue {
    let prop_str = prop.as_str();
    match (kind, prop_str) {
        (.., Some("spawn" | "spawnSync" | "execFile" | "execFileSync")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::ChildProcessSpawnMethod(
                prop_str.unwrap().into(),
            ))
        }
        (.., Some("fork")) => JsValue::WellKnownFunction(WellKnownFunctionKind::ChildProcessFork),
        (WellKnownObjectKind::ChildProcess, Some("default")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::ChildProcessDefault)
        }
        _ => JsValue::unknown(
            JsValue::member(
                Box::new(JsValue::WellKnownObject(WellKnownObjectKind::ChildProcess)),
                Box::new(prop),
            ),
            "unsupported property on Node.js child_process module",
        ),
    }
}

fn os_module_member(kind: WellKnownObjectKind, prop: JsValue) -> JsValue {
    match (kind, prop.as_str()) {
        (.., Some("platform")) => JsValue::WellKnownFunction(WellKnownFunctionKind::OsPlatform),
        (.., Some("arch")) => JsValue::WellKnownFunction(WellKnownFunctionKind::OsArch),
        (.., Some("endianness")) => JsValue::WellKnownFunction(WellKnownFunctionKind::OsEndianness),
        (WellKnownObjectKind::OsModule, Some("default")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::OsModuleDefault)
        }
        _ => JsValue::unknown(
            JsValue::member(
                Box::new(JsValue::WellKnownObject(WellKnownObjectKind::OsModule)),
                Box::new(prop),
            ),
            "unsupported property on Node.js os module",
        ),
    }
}

async fn node_process_member(
    prop: JsValue,
    compile_time_info: CompileTimeInfoVc,
) -> Result<JsValue> {
    Ok(match prop.as_str() {
        Some("arch") => compile_time_info
            .environment()
            .compile_target()
            .await?
            .arch
            .as_str()
            .into(),
        Some("platform") => compile_time_info
            .environment()
            .compile_target()
            .await?
            .platform
            .as_str()
            .into(),
        Some("cwd") => JsValue::WellKnownFunction(WellKnownFunctionKind::ProcessCwd),
        Some("env") => JsValue::WellKnownObject(WellKnownObjectKind::NodeProcessEnv),
        _ => JsValue::unknown(
            JsValue::member(
                Box::new(JsValue::WellKnownObject(WellKnownObjectKind::NodeProcess)),
                Box::new(prop),
            ),
            "unsupported property on Node.js process object",
        ),
    })
}

fn node_pre_gyp(prop: JsValue) -> JsValue {
    match prop.as_str() {
        Some("find") => JsValue::WellKnownFunction(WellKnownFunctionKind::NodePreGypFind),
        _ => JsValue::unknown(
            JsValue::member(
                Box::new(JsValue::WellKnownObject(WellKnownObjectKind::NodePreGyp)),
                Box::new(prop),
            ),
            "unsupported property on @mapbox/node-pre-gyp module",
        ),
    }
}

fn express(prop: JsValue) -> JsValue {
    match prop.as_str() {
        Some("set") => JsValue::WellKnownFunction(WellKnownFunctionKind::NodeExpressSet),
        _ => JsValue::unknown(
            JsValue::member(
                Box::new(JsValue::WellKnownObject(
                    WellKnownObjectKind::NodeExpressApp,
                )),
                Box::new(prop),
            ),
            "unsupported property on require('express')() object",
        ),
    }
}

fn protobuf_loader(prop: JsValue) -> JsValue {
    match prop.as_str() {
        Some("load") | Some("loadSync") => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::NodeProtobufLoad)
        }
        _ => JsValue::unknown(
            JsValue::member(
                Box::new(JsValue::WellKnownObject(
                    WellKnownObjectKind::NodeProtobufLoader,
                )),
                Box::new(prop),
            ),
            "unsupported property on require('@grpc/proto-loader') object",
        ),
    }
}
