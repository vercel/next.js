use std::{mem::take, sync::Arc};

use anyhow::Result;
use turbopack_core::environment::EnvironmentVc;
use url::Url;

use super::{
    imports::ImportAnnotations, ConstantValue, JsValue, ModuleValue, WellKnownFunctionKind,
    WellKnownObjectKind,
};

pub async fn replace_well_known(
    value: JsValue,
    environment: EnvironmentVc,
) -> Result<(JsValue, bool)> {
    Ok(match value {
        JsValue::Call(_, box JsValue::WellKnownFunction(kind), args) => (
            well_known_function_call(
                kind,
                JsValue::Unknown(None, "this is not analyzed yet"),
                args,
                environment,
            )
            .await?,
            true,
        ),
        JsValue::Call(usize, callee, args) => {
            // var fs = require('fs'), fs = __importStar(fs);
            if args.len() == 1 {
                if let JsValue::WellKnownObject(_) = &args[0] {
                    return Ok((args[0].clone(), true));
                }
            }
            (JsValue::Call(usize, callee, args), false)
        }
        JsValue::Member(_, box JsValue::WellKnownObject(kind), box prop) => (
            well_known_object_member(kind, prop, environment).await?,
            true,
        ),
        JsValue::Member(_, box JsValue::WellKnownFunction(kind), box prop) => {
            (well_known_function_member(kind, prop), true)
        }
        _ => (value, false),
    })
}

pub async fn well_known_function_call(
    kind: WellKnownFunctionKind,
    _this: JsValue,
    args: Vec<JsValue>,
    environment: EnvironmentVc,
) -> Result<JsValue> {
    Ok(match kind {
        WellKnownFunctionKind::ObjectAssign => object_assign(args),
        WellKnownFunctionKind::PathJoin => path_join(args),
        WellKnownFunctionKind::PathDirname => path_dirname(args),
        WellKnownFunctionKind::PathResolve(cwd) => path_resolve(*cwd, args),
        WellKnownFunctionKind::Import => JsValue::Unknown(
            Some(Arc::new(JsValue::call(
                box JsValue::WellKnownFunction(kind),
                args,
            ))),
            "import() is not supported",
        ),
        WellKnownFunctionKind::Require => require(args),
        WellKnownFunctionKind::PathToFileUrl => path_to_file_url(args),
        WellKnownFunctionKind::OsArch => environment.compile_target().await?.arch.as_str().into(),
        WellKnownFunctionKind::OsPlatform => {
            environment.compile_target().await?.platform.as_str().into()
        }
        WellKnownFunctionKind::ProcessCwd => {
            if let Some(cwd) = &*environment.cwd().await? {
                cwd.clone().into()
            } else {
                JsValue::Unknown(
                    Some(Arc::new(JsValue::call(
                        box JsValue::WellKnownFunction(WellKnownFunctionKind::ProcessCwd),
                        args,
                    ))),
                    "process.cwd is not specified in the environment",
                )
            }
        }
        WellKnownFunctionKind::OsEndianness => environment
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

        _ => JsValue::Unknown(
            Some(Arc::new(JsValue::call(
                box JsValue::WellKnownFunction(kind),
                args,
            ))),
            "unsupported function",
        ),
    })
}

pub fn object_assign(args: Vec<JsValue>) -> JsValue {
    if args.iter().all(|arg| matches!(arg, JsValue::Object(..))) {
        if let Some(merged_object) = args.into_iter().reduce(|mut acc, cur| {
            if let JsValue::Object(_, parts) = &mut acc {
                if let JsValue::Object(_, next_parts) = &cur {
                    parts.extend_from_slice(next_parts);
                }
            }
            acc
        }) {
            merged_object
        } else {
            JsValue::Unknown(
                Some(Arc::new(JsValue::Call(
                    0,
                    box JsValue::WellKnownFunction(WellKnownFunctionKind::ObjectAssign),
                    vec![],
                ))),
                "empty arguments for Object.assign",
            )
        }
    } else {
        JsValue::Unknown(
            Some(Arc::new(JsValue::Call(
                args.len(),
                box JsValue::WellKnownFunction(WellKnownFunctionKind::ObjectAssign),
                args,
            ))),
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
        return JsValue::Unknown(None, "cwd is not static analyzable");
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
        first.as_str().map_or(false, |s| s.is_empty()) || first.starts_with("/");

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
                return JsValue::Constant(ConstantValue::StrWord(str[..i].to_string().into()));
            } else {
                return JsValue::Constant(ConstantValue::StrWord("".into()));
            }
        } else if let JsValue::Concat(_, items) = arg {
            if let Some(last) = items.last_mut() {
                if let Some(str) = last.as_str() {
                    if let Some(i) = str.rfind('/') {
                        *last =
                            JsValue::Constant(ConstantValue::StrWord(str[..i].to_string().into()));
                        return take(arg);
                    }
                }
            }
        }
    }
    JsValue::Unknown(
        Some(Arc::new(JsValue::call(
            box JsValue::WellKnownFunction(WellKnownFunctionKind::PathDirname),
            args,
        ))),
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
            JsValue::Unknown(
                Some(Arc::new(JsValue::call(
                    box JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
                    args,
                ))),
                "only constant argument is supported",
            )
        }
    } else {
        JsValue::Unknown(
            Some(Arc::new(JsValue::call(
                box JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
                args,
            ))),
            "only a single argument is supported",
        )
    }
}

pub fn path_to_file_url(args: Vec<JsValue>) -> JsValue {
    if args.len() == 1 {
        if let Some(path) = args[0].as_str() {
            Url::from_file_path(path)
                .map(JsValue::Url)
                .unwrap_or_else(|_err| {
                    JsValue::Unknown(
                        Some(Arc::new(JsValue::call(
                            box JsValue::WellKnownFunction(WellKnownFunctionKind::PathToFileUrl),
                            args,
                        ))),
                        // TODO include err in message
                        "url not parseable",
                    )
                })
        } else {
            JsValue::Unknown(
                Some(Arc::new(JsValue::call(
                    box JsValue::WellKnownFunction(WellKnownFunctionKind::PathToFileUrl),
                    args,
                ))),
                "only constant argument is supported",
            )
        }
    } else {
        JsValue::Unknown(
            Some(Arc::new(JsValue::call(
                box JsValue::WellKnownFunction(WellKnownFunctionKind::PathToFileUrl),
                args,
            ))),
            "only a single argument is supported",
        )
    }
}

pub fn well_known_function_member(kind: WellKnownFunctionKind, prop: JsValue) -> JsValue {
    match (&kind, prop.as_str()) {
        (WellKnownFunctionKind::Require, Some("resolve")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve)
        }
        (WellKnownFunctionKind::Require, Some("cache")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::RequireCache)
        }
        (WellKnownFunctionKind::NodeStrongGlobalize, Some("SetRootDir")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::NodeStrongGlobalizeSetRootDir)
        }
        (WellKnownFunctionKind::NodeResolveFrom, Some("silent")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::NodeResolveFrom)
        }
        _ => JsValue::Unknown(
            Some(Arc::new(JsValue::member(
                box JsValue::WellKnownFunction(kind),
                box prop,
            ))),
            "unsupported property on function",
        ),
    }
}

pub async fn well_known_object_member(
    kind: WellKnownObjectKind,
    prop: JsValue,
    environment: EnvironmentVc,
) -> Result<JsValue> {
    Ok(match kind {
        WellKnownObjectKind::GlobalObject => global_object(prop),
        WellKnownObjectKind::PathModule | WellKnownObjectKind::PathModuleDefault => {
            path_module_member(kind, prop)
        }
        WellKnownObjectKind::FsModule | WellKnownObjectKind::FsModuleDefault => {
            fs_module_member(kind, prop)
        }
        WellKnownObjectKind::UrlModule | WellKnownObjectKind::UrlModuleDefault => {
            url_module_member(kind, prop)
        }
        WellKnownObjectKind::ChildProcess | WellKnownObjectKind::ChildProcessDefault => {
            child_process_module_member(kind, prop)
        }
        WellKnownObjectKind::OsModule | WellKnownObjectKind::OsModuleDefault => {
            os_module_member(kind, prop)
        }
        WellKnownObjectKind::NodeProcess => node_process_member(prop, environment).await?,
        WellKnownObjectKind::NodePreGyp => node_pre_gyp(prop),
        WellKnownObjectKind::NodeExpressApp => express(prop),
        WellKnownObjectKind::NodeProtobufLoader => protobuf_loader(prop),
        #[allow(unreachable_patterns)]
        _ => JsValue::Unknown(
            Some(Arc::new(JsValue::member(
                box JsValue::WellKnownObject(kind),
                box prop,
            ))),
            "unsupported object kind",
        ),
    })
}

fn global_object(prop: JsValue) -> JsValue {
    match prop.as_str() {
        Some("assign") => JsValue::WellKnownFunction(WellKnownFunctionKind::ObjectAssign),
        _ => JsValue::Unknown(
            Some(Arc::new(JsValue::member(
                box JsValue::WellKnownObject(WellKnownObjectKind::GlobalObject),
                box prop,
            ))),
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
            JsValue::WellKnownFunction(WellKnownFunctionKind::PathResolve(box JsValue::from("")))
        }
        (WellKnownObjectKind::PathModule, Some("default")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::PathModuleDefault)
        }
        _ => JsValue::Unknown(
            Some(Arc::new(JsValue::member(
                box JsValue::WellKnownObject(WellKnownObjectKind::PathModule),
                box prop,
            ))),
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
    JsValue::Unknown(
        Some(Arc::new(JsValue::member(
            box JsValue::WellKnownObject(WellKnownObjectKind::FsModule),
            box prop,
        ))),
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
        _ => JsValue::Unknown(
            Some(Arc::new(JsValue::member(
                box JsValue::WellKnownObject(WellKnownObjectKind::UrlModule),
                box prop,
            ))),
            "unsupported property on Node.js url module",
        ),
    }
}

pub fn child_process_module_member(kind: WellKnownObjectKind, prop: JsValue) -> JsValue {
    let prop_str = prop.as_str();
    match (kind, prop_str) {
        (.., Some("spawn") | Some("spawnSync") | Some("execFile") | Some("execFileSync")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::ChildProcessSpawnMethod(
                prop_str.unwrap().into(),
            ))
        }
        (.., Some("fork")) => JsValue::WellKnownFunction(WellKnownFunctionKind::ChildProcessFork),
        (WellKnownObjectKind::ChildProcess, Some("default")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::ChildProcessDefault)
        }
        _ => JsValue::Unknown(
            Some(Arc::new(JsValue::member(
                box JsValue::WellKnownObject(WellKnownObjectKind::ChildProcess),
                box prop,
            ))),
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
        _ => JsValue::Unknown(
            Some(Arc::new(JsValue::member(
                box JsValue::WellKnownObject(WellKnownObjectKind::OsModule),
                box prop,
            ))),
            "unsupported property on Node.js os module",
        ),
    }
}

async fn node_process_member(prop: JsValue, environment: EnvironmentVc) -> Result<JsValue> {
    Ok(match prop.as_str() {
        Some("arch") => environment.compile_target().await?.arch.as_str().into(),
        Some("platform") => environment.compile_target().await?.platform.as_str().into(),
        Some("cwd") => JsValue::WellKnownFunction(WellKnownFunctionKind::ProcessCwd),
        _ => JsValue::Unknown(
            Some(Arc::new(JsValue::member(
                box JsValue::WellKnownObject(WellKnownObjectKind::NodeProcess),
                box prop,
            ))),
            "unsupported property on Node.js process object",
        ),
    })
}

fn node_pre_gyp(prop: JsValue) -> JsValue {
    match prop.as_str() {
        Some("find") => JsValue::WellKnownFunction(WellKnownFunctionKind::NodePreGypFind),
        _ => JsValue::Unknown(
            Some(Arc::new(JsValue::member(
                box JsValue::WellKnownObject(WellKnownObjectKind::NodePreGyp),
                box prop,
            ))),
            "unsupported property on @mapbox/node-pre-gyp module",
        ),
    }
}

fn express(prop: JsValue) -> JsValue {
    match prop.as_str() {
        Some("set") => JsValue::WellKnownFunction(WellKnownFunctionKind::NodeExpressSet),
        _ => JsValue::Unknown(
            Some(Arc::new(JsValue::member(
                box JsValue::WellKnownObject(WellKnownObjectKind::NodeExpressApp),
                box prop,
            ))),
            "unsupported property on require('express')() object",
        ),
    }
}

fn protobuf_loader(prop: JsValue) -> JsValue {
    match prop.as_str() {
        Some("load") | Some("loadSync") => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::NodeProtobufLoad)
        }
        _ => JsValue::Unknown(
            Some(Arc::new(JsValue::member(
                box JsValue::WellKnownObject(WellKnownObjectKind::NodeProtobufLoader),
                box prop,
            ))),
            "unsupported property on require('@grpc/proto-loader') object",
        ),
    }
}
