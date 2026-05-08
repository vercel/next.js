use anyhow::Result;
use triomphe::Arc;
use turbo_rcstr::rcstr;
use turbo_tasks::Vc;
use turbopack_core::compile_time_info::CompileTimeInfo;
use url::Url;

use super::{
    ConstantValue, JsValue, JsValueUrlKind, ModuleValue, WellKnownFunctionKind, WellKnownObjectKind,
};
use crate::analyzer::RequireContextValue;

pub async fn replace_well_known(
    value: JsValue,
    compile_time_info: Vc<CompileTimeInfo>,
    allow_project_root_tracing: bool,
) -> Result<(JsValue, bool)> {
    Ok(match value {
        JsValue::Call(_, call) if matches!(call.callee(), JsValue::WellKnownFunction(_)) => {
            let (callee, args) = call.into_parts();
            let JsValue::WellKnownFunction(kind) = Arc::unwrap_or_clone(callee) else {
                unreachable!()
            };
            (
                well_known_function_call(
                    kind,
                    JsValue::unknown_empty(false, rcstr!("this is not analyzed yet")),
                    args,
                    compile_time_info,
                    allow_project_root_tracing,
                )
                .await?,
                true,
            )
        }
        JsValue::Call(total, call) => {
            // var fs = require('fs'), fs = __importStar(fs);
            // TODO(WEB-552) this is not correct and has many false positives!
            if call.args().len() == 1
                && let JsValue::WellKnownObject(_) = &*call.args()[0]
            {
                return Ok(((*call.args()[0]).clone(), true));
            }
            (JsValue::Call(total, call), false)
        }
        JsValue::Member(_, obj, prop) if matches!(&*obj, JsValue::WellKnownObject(_)) => {
            let JsValue::WellKnownObject(kind) = Arc::unwrap_or_clone(obj) else {
                unreachable!()
            };
            well_known_object_member(kind, prop, compile_time_info).await?
        }
        JsValue::Member(_, obj, prop) if matches!(&*obj, JsValue::WellKnownFunction(_)) => {
            let JsValue::WellKnownFunction(kind) = Arc::unwrap_or_clone(obj) else {
                unreachable!()
            };
            well_known_function_member(kind, prop)
        }
        JsValue::Member(c, obj, prop) if matches!(&*obj, JsValue::Array { .. }) => {
            match prop.as_str() {
                Some("filter") => (
                    JsValue::WellKnownFunction(WellKnownFunctionKind::ArrayFilter),
                    true,
                ),
                Some("forEach") => (
                    JsValue::WellKnownFunction(WellKnownFunctionKind::ArrayForEach),
                    true,
                ),
                Some("map") => (
                    JsValue::WellKnownFunction(WellKnownFunctionKind::ArrayMap),
                    true,
                ),
                _ => (JsValue::Member(c, obj, prop), false),
            }
        }
        // module.hot → WellKnownObject(ModuleHot) (only when HMR is enabled)
        JsValue::Member(c, obj, prop)
            if matches!(&*obj, JsValue::FreeVar(name) if &**name == "module")
                && prop.as_str() == Some("hot")
                && compile_time_info.await?.hot_module_replacement_enabled =>
        {
            let _ = (c, obj, prop);
            (
                JsValue::WellKnownObject(WellKnownObjectKind::ModuleHot),
                true,
            )
        }
        _ => (value, false),
    })
}

pub async fn well_known_function_call(
    kind: WellKnownFunctionKind,
    _this: JsValue,
    args: Vec<Arc<JsValue>>,
    compile_time_info: Vc<CompileTimeInfo>,
    allow_project_root_tracing: bool,
) -> Result<JsValue> {
    Ok(match kind {
        WellKnownFunctionKind::ObjectAssign => object_assign(args),
        WellKnownFunctionKind::PathJoin => path_join(args),
        WellKnownFunctionKind::PathDirname => path_dirname(args),
        WellKnownFunctionKind::PathResolve(cwd) => path_resolve(*cwd, args),
        WellKnownFunctionKind::Import => import(args),
        WellKnownFunctionKind::Require => require(args),
        WellKnownFunctionKind::RequireContextRequire(value) => {
            require_context_require(value, args)?
        }
        WellKnownFunctionKind::RequireContextRequireKeys(value) => {
            require_context_require_keys(value, args)?
        }
        WellKnownFunctionKind::RequireContextRequireResolve(value) => {
            require_context_require_resolve(value, args)?
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
            if allow_project_root_tracing
                && let Some(cwd) = &*compile_time_info.environment().cwd().await?
            {
                format!("/ROOT/{}", cwd.path).into()
            } else {
                JsValue::unknown(
                    JsValue::call_from_iter(JsValue::WellKnownFunction(kind), args),
                    true,
                    rcstr!("process.cwd is not specified in the environment"),
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
            JsValue::call_from_iter(JsValue::WellKnownFunction(kind), args),
            true,
            rcstr!("unsupported function"),
        ),
    })
}

fn object_assign(args: Vec<Arc<JsValue>>) -> JsValue {
    if args
        .iter()
        .all(|arg| matches!(&**arg, JsValue::Object { .. }))
    {
        if let Some(mut merged_object) =
            args.into_iter()
                .map(Arc::unwrap_or_clone)
                .reduce(|mut acc, cur| {
                    if let JsValue::Object { parts, mutable, .. } = &mut acc
                        && let JsValue::Object {
                            parts: next_parts,
                            mutable: next_mutable,
                            ..
                        } = &cur
                    {
                        parts.extend_from_slice(next_parts);
                        *mutable |= *next_mutable;
                    }
                    acc
                })
        {
            merged_object.update_total_nodes();
            merged_object
        } else {
            JsValue::unknown(
                JsValue::call_from_iter(
                    JsValue::WellKnownFunction(WellKnownFunctionKind::ObjectAssign),
                    Vec::<Arc<JsValue>>::new(),
                ),
                true,
                rcstr!("empty arguments for Object.assign"),
            )
        }
    } else {
        JsValue::unknown(
            JsValue::call_from_iter(
                JsValue::WellKnownFunction(WellKnownFunctionKind::ObjectAssign),
                args,
            ),
            true,
            rcstr!("only const object assign is supported"),
        )
    }
}

fn path_join(args: Vec<Arc<JsValue>>) -> JsValue {
    if args.is_empty() {
        return rcstr!(".").into();
    }
    let mut parts: Vec<JsValue> = Vec::new();
    for item in args {
        if let Some(str) = item.as_str() {
            let split = str.split('/');
            parts.extend(split.map(|s| s.into()));
        } else {
            parts.push(Arc::unwrap_or_clone(item));
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
    let mut results: Vec<Arc<JsValue>> = vec![Arc::new(first)];
    for part in iter {
        let is_str = part.as_str().is_some();
        if last_is_str && is_str {
            results.push(Arc::new(rcstr!("/").into()));
        } else {
            results.push(Arc::new(JsValue::alternatives(vec![
                Arc::new(rcstr!("/").into()),
                Arc::new(rcstr!("").into()),
            ])));
        }
        results.push(Arc::new(part));
        last_is_str = is_str;
    }
    JsValue::concat(results)
}

fn path_resolve(cwd: JsValue, mut args: Vec<Arc<JsValue>>) -> JsValue {
    // If no path segments are passed, `path.resolve()` will return the absolute
    // path of the current working directory.
    if args.is_empty() {
        return JsValue::unknown_empty(false, rcstr!("cwd is not static analyzable"));
    }
    if args.len() == 1 {
        return Arc::unwrap_or_clone(args.into_iter().next().unwrap());
    }

    // path.resolve stops at the string starting with `/`
    for (idx, arg) in args.iter().enumerate().rev() {
        if idx != 0
            && let Some(str) = arg.as_str()
            && str.starts_with('/')
        {
            return path_resolve(cwd, args.drain(idx..).collect());
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
                            results_final.push(rcstr!("..").into());
                        }
                    }
                    _ => results.push(str.into()),
                }
            }
        } else {
            results_final.append(&mut results);
            results_final.push(Arc::unwrap_or_clone(item));
        }
    }
    results_final.append(&mut results);
    let mut iter = results_final.into_iter();
    let first = iter.next().unwrap();

    let is_already_absolute =
        first.is_empty_string() == Some(true) || first.starts_with("/") == Some(true);

    let mut last_was_str = first.as_str().is_some();

    let mut results: Vec<Arc<JsValue>> = Vec::new();
    if !is_already_absolute {
        results.push(Arc::new(cwd));
    }

    results.push(Arc::new(first));
    for part in iter {
        let is_str = part.as_str().is_some();
        if last_was_str && is_str {
            results.push(Arc::new(rcstr!("/").into()));
        } else {
            results.push(Arc::new(JsValue::alternatives(vec![
                Arc::new(rcstr!("/").into()),
                Arc::new(rcstr!("").into()),
            ])));
        }
        results.push(Arc::new(part));
        last_was_str = is_str;
    }

    JsValue::concat(results)
}

fn path_dirname(mut args: Vec<Arc<JsValue>>) -> JsValue {
    if let Some(arg) = args.first() {
        if let Some(str) = arg.as_str() {
            if let Some(i) = str.rfind('/') {
                return JsValue::Constant(ConstantValue::Str(str[..i].to_string().into()));
            } else {
                return JsValue::Constant(ConstantValue::Str(rcstr!("").into()));
            }
        }
        let truncate_to = if let JsValue::Concat(_, items) = &**arg
            && let Some(last) = items.last()
            && let Some(str) = last.as_str()
        {
            str.rfind('/')
        } else {
            None
        };
        if let Some(i) = truncate_to {
            // We're going to consume the first arg, so unwrap it to take ownership and
            // modify in place.
            let mut arg = Arc::unwrap_or_clone(args.swap_remove(0));
            let JsValue::Concat(_, items) = &mut arg else {
                unreachable!()
            };
            let last = items.last_mut().unwrap();
            let str = last.as_str().unwrap();
            *last = Arc::new(JsValue::Constant(ConstantValue::Str(
                str[..i].to_string().into(),
            )));
            return arg;
        }
    }
    JsValue::unknown(
        JsValue::call_from_iter(
            JsValue::WellKnownFunction(WellKnownFunctionKind::PathDirname),
            args,
        ),
        true,
        rcstr!("path.dirname with unsupported arguments"),
    )
}

/// Resolve the contents of an import call, throwing errors
/// if we come across any unsupported syntax.
pub fn import(args: Vec<Arc<JsValue>>) -> JsValue {
    match args.as_slice() {
        [arg] if matches!(&**arg, JsValue::Constant(ConstantValue::Str(_))) => {
            let JsValue::Constant(ConstantValue::Str(v)) = &**arg else {
                unreachable!()
            };
            JsValue::promise(Arc::new(JsValue::Module(ModuleValue {
                module: v.as_atom().into_owned().into(),
                annotations: None,
            })))
        }
        _ => JsValue::unknown(
            JsValue::call_from_iter(
                JsValue::WellKnownFunction(WellKnownFunctionKind::Import),
                args,
            ),
            true,
            rcstr!("only a single constant argument is supported"),
        ),
    }
}

/// Resolve the contents of a require call, throwing errors
/// if we come across any unsupported syntax.
fn require(args: Vec<Arc<JsValue>>) -> JsValue {
    if args.len() == 1 {
        if let Some(s) = args[0].as_str() {
            JsValue::Module(ModuleValue {
                module: s.into(),
                annotations: None,
            })
        } else {
            JsValue::unknown(
                JsValue::call_from_iter(
                    JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
                    args,
                ),
                true,
                rcstr!("only constant argument is supported"),
            )
        }
    } else {
        JsValue::unknown(
            JsValue::call_from_iter(
                JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
                args,
            ),
            true,
            rcstr!("only a single argument is supported"),
        )
    }
}

/// (try to) statically evaluate `require.context(...)()`
fn require_context_require(
    val: Box<RequireContextValue>,
    args: Vec<Arc<JsValue>>,
) -> Result<JsValue> {
    if args.is_empty() {
        return Ok(JsValue::unknown(
            JsValue::call_from_iter(
                JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContextRequire(val)),
                args,
            ),
            true,
            rcstr!(
                "require.context(...).require() requires an argument specifying the module path"
            ),
        ));
    }

    let Some(s) = args[0].as_str() else {
        return Ok(JsValue::unknown(
            JsValue::call_from_iter(
                JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContextRequire(val)),
                args,
            ),
            true,
            rcstr!(
                "require.context(...).require() only accepts a single, constant string argument"
            ),
        ));
    };

    let Some(m) = val.0.get(s) else {
        return Ok(JsValue::unknown(
            JsValue::call_from_iter(
                JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContextRequire(val)),
                args,
            ),
            true,
            rcstr!(
                "require.context(...).require() can only be called with an argument that's in the \
                 context"
            ),
        ));
    };

    Ok(JsValue::Module(ModuleValue {
        module: m.to_string().into(),
        annotations: None,
    }))
}

/// (try to) statically evaluate `require.context(...).keys()`
fn require_context_require_keys(
    val: Box<RequireContextValue>,
    args: Vec<Arc<JsValue>>,
) -> Result<JsValue> {
    Ok(if args.is_empty() {
        JsValue::array(val.0.keys().cloned().map(|k| Arc::new(k.into())).collect())
    } else {
        JsValue::unknown(
            JsValue::call_from_iter(
                JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContextRequireKeys(val)),
                args,
            ),
            true,
            rcstr!("require.context(...).keys() does not accept arguments"),
        )
    })
}

/// (try to) statically evaluate `require.context(...).resolve()`
fn require_context_require_resolve(
    val: Box<RequireContextValue>,
    args: Vec<Arc<JsValue>>,
) -> Result<JsValue> {
    if args.len() != 1 {
        return Ok(JsValue::unknown(
            JsValue::call_from_iter(
                JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContextRequireResolve(
                    val,
                )),
                args,
            ),
            true,
            rcstr!(
                "require.context(...).resolve() only accepts a single, constant string argument"
            ),
        ));
    }

    let Some(s) = args[0].as_str() else {
        return Ok(JsValue::unknown(
            JsValue::call_from_iter(
                JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContextRequireResolve(
                    val,
                )),
                args,
            ),
            true,
            rcstr!(
                "require.context(...).resolve() only accepts a single, constant string argument"
            ),
        ));
    };

    let Some(m) = val.0.get(s) else {
        return Ok(JsValue::unknown(
            JsValue::call_from_iter(
                JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContextRequireResolve(
                    val,
                )),
                args,
            ),
            true,
            rcstr!(
                "require.context(...).resolve() can only be called with an argument that's in the \
                 context"
            ),
        ));
    };

    Ok(m.as_str().into())
}

fn path_to_file_url(args: Vec<Arc<JsValue>>) -> JsValue {
    if args.len() == 1 {
        if let Some(path) = args[0].as_str() {
            Url::from_file_path(path)
                .map(|url| JsValue::Url(String::from(url).into(), JsValueUrlKind::Absolute))
                .unwrap_or_else(|_| {
                    JsValue::unknown(
                        JsValue::call_from_iter(
                            JsValue::WellKnownFunction(WellKnownFunctionKind::PathToFileUrl),
                            args,
                        ),
                        true,
                        rcstr!("url not parseable: path is relative or has an invalid prefix"),
                    )
                })
        } else {
            JsValue::unknown(
                JsValue::call_from_iter(
                    JsValue::WellKnownFunction(WellKnownFunctionKind::PathToFileUrl),
                    args,
                ),
                true,
                rcstr!("only constant argument is supported"),
            )
        }
    } else {
        JsValue::unknown(
            JsValue::call_from_iter(
                JsValue::WellKnownFunction(WellKnownFunctionKind::PathToFileUrl),
                args,
            ),
            true,
            rcstr!("only a single argument is supported"),
        )
    }
}

fn well_known_function_member(kind: WellKnownFunctionKind, prop: Arc<JsValue>) -> (JsValue, bool) {
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
        (WellKnownFunctionKind::Import, Some("meta")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta)
        }
        #[allow(unreachable_patterns)]
        (kind, _) => {
            return (
                JsValue::member(Arc::new(JsValue::WellKnownFunction(kind)), prop),
                false,
            );
        }
    };
    (new_value, true)
}

async fn well_known_object_member(
    kind: WellKnownObjectKind,
    prop: Arc<JsValue>,
    compile_time_info: Vc<CompileTimeInfo>,
) -> Result<(JsValue, bool)> {
    let new_value = match kind {
        WellKnownObjectKind::GlobalObject => global_object(prop),
        WellKnownObjectKind::PathModule | WellKnownObjectKind::PathModuleDefault => {
            path_module_member(kind, prop, compile_time_info).await?
        }
        WellKnownObjectKind::FsModule
        | WellKnownObjectKind::FsModuleDefault
        | WellKnownObjectKind::FsModulePromises => fs_module_member(kind, prop),
        WellKnownObjectKind::FsExtraModule | WellKnownObjectKind::FsExtraModuleDefault => {
            fs_extra_module_member(kind, prop)
        }
        WellKnownObjectKind::ModuleModule | WellKnownObjectKind::ModuleModuleDefault => {
            module_module_member(kind, prop)
        }
        WellKnownObjectKind::UrlModule | WellKnownObjectKind::UrlModuleDefault => {
            url_module_member(kind, prop)
        }
        WellKnownObjectKind::WorkerThreadsModule
        | WellKnownObjectKind::WorkerThreadsModuleDefault => {
            worker_threads_module_member(kind, prop)
        }
        WellKnownObjectKind::ChildProcessModule
        | WellKnownObjectKind::ChildProcessModuleDefault => child_process_module_member(kind, prop),
        WellKnownObjectKind::OsModule | WellKnownObjectKind::OsModuleDefault => {
            os_module_member(kind, prop)
        }
        WellKnownObjectKind::NodeProcessModule => {
            node_process_member(prop, compile_time_info).await?
        }
        WellKnownObjectKind::NodePreGyp => node_pre_gyp(prop),
        WellKnownObjectKind::NodeExpressApp => express(prop),
        WellKnownObjectKind::NodeProtobufLoader => protobuf_loader(prop),
        WellKnownObjectKind::ImportMeta => match prop.as_str() {
            // import.meta.turbopackHot is the ESM equivalent of module.hot for HMR
            Some("turbopackHot") if compile_time_info.await?.hot_module_replacement_enabled => {
                JsValue::WellKnownObject(WellKnownObjectKind::ModuleHot)
            }
            // import.meta.glob is the Vite-compatible glob import.
            // Note: import.meta.globEager() (removed in Vite 3) is intentionally
            // not supported. Users should migrate to import.meta.glob('...', { eager: true }).
            Some("glob") => JsValue::WellKnownFunction(WellKnownFunctionKind::ImportMetaGlob),
            _ => {
                return Ok((
                    JsValue::member(Arc::new(JsValue::WellKnownObject(kind)), prop),
                    false,
                ));
            }
        },
        WellKnownObjectKind::ModuleHot => match prop.as_str() {
            Some("accept") => JsValue::WellKnownFunction(WellKnownFunctionKind::ModuleHotAccept),
            Some("decline") => JsValue::WellKnownFunction(WellKnownFunctionKind::ModuleHotDecline),
            _ => {
                return Ok((
                    JsValue::unknown(
                        JsValue::member(Arc::new(JsValue::WellKnownObject(kind)), prop),
                        true,
                        rcstr!("unsupported property on module.hot"),
                    ),
                    true,
                ));
            }
        },
        #[allow(unreachable_patterns)]
        _ => {
            return Ok((
                JsValue::member(Arc::new(JsValue::WellKnownObject(kind)), prop),
                false,
            ));
        }
    };
    Ok((new_value, true))
}

fn global_object(prop: Arc<JsValue>) -> JsValue {
    match prop.as_str() {
        Some("assign") => JsValue::WellKnownFunction(WellKnownFunctionKind::ObjectAssign),
        _ => JsValue::unknown(
            JsValue::member(
                Arc::new(JsValue::WellKnownObject(WellKnownObjectKind::GlobalObject)),
                prop,
            ),
            true,
            rcstr!("unsupported property on global Object"),
        ),
    }
}

async fn path_module_member(
    kind: WellKnownObjectKind,
    prop: Arc<JsValue>,
    compile_time_info: Vc<CompileTimeInfo>,
) -> Result<JsValue> {
    Ok(match (kind, prop.as_str()) {
        (.., Some("join")) => JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin),
        (.., Some("dirname")) => JsValue::WellKnownFunction(WellKnownFunctionKind::PathDirname),
        (.., Some("resolve")) => {
            // cwd is added while resolving in references.rs
            JsValue::WellKnownFunction(WellKnownFunctionKind::PathResolve(Box::new(JsValue::from(
                "",
            ))))
        }
        (.., Some("sep")) => compile_time_info
            .environment()
            .compile_target()
            .await?
            .platform
            .path_separator()
            .into(),
        (WellKnownObjectKind::PathModule, Some("default")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::PathModuleDefault)
        }
        _ => JsValue::unknown(
            JsValue::member(
                Arc::new(JsValue::WellKnownObject(WellKnownObjectKind::PathModule)),
                prop,
            ),
            true,
            rcstr!("unsupported property on Node.js path module"),
        ),
    })
}

fn fs_module_member(kind: WellKnownObjectKind, prop: Arc<JsValue>) -> JsValue {
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
            (.., "readdir" | "readdirSync") => {
                return JsValue::WellKnownFunction(WellKnownFunctionKind::FsReadDir);
            }
            (WellKnownObjectKind::FsModule | WellKnownObjectKind::FsModuleDefault, "promises") => {
                return JsValue::WellKnownObject(WellKnownObjectKind::FsModulePromises);
            }
            (WellKnownObjectKind::FsModule, "default") => {
                return JsValue::WellKnownObject(WellKnownObjectKind::FsModuleDefault);
            }
            _ => {}
        }
    }
    JsValue::unknown(
        JsValue::member(
            Arc::new(JsValue::WellKnownObject(WellKnownObjectKind::FsModule)),
            prop,
        ),
        true,
        rcstr!("unsupported property on Node.js fs module"),
    )
}

fn fs_extra_module_member(kind: WellKnownObjectKind, prop: Arc<JsValue>) -> JsValue {
    if let Some(word) = prop.as_str() {
        match (kind, word) {
            // regular fs methods
            (
                ..,
                "realpath" | "realpathSync" | "stat" | "statSync" | "existsSync"
                | "createReadStream" | "exists" | "open" | "openSync" | "readFile" | "readFileSync",
            ) => {
                return JsValue::WellKnownFunction(WellKnownFunctionKind::FsReadMethod(
                    word.into(),
                ));
            }
            // fs-extra specific
            (
                ..,
                "pathExists" | "pathExistsSync" | "readJson" | "readJSON" | "readJsonSync"
                | "readJSONSync",
            ) => {
                return JsValue::WellKnownFunction(WellKnownFunctionKind::FsReadMethod(
                    word.into(),
                ));
            }
            (WellKnownObjectKind::FsExtraModule, "default") => {
                return JsValue::WellKnownObject(WellKnownObjectKind::FsExtraModuleDefault);
            }
            _ => {}
        }
    }
    JsValue::unknown(
        JsValue::member(
            Arc::new(JsValue::WellKnownObject(WellKnownObjectKind::FsExtraModule)),
            prop,
        ),
        true,
        rcstr!("unsupported property on fs-extra module"),
    )
}

fn module_module_member(kind: WellKnownObjectKind, prop: Arc<JsValue>) -> JsValue {
    match (kind, prop.as_str()) {
        (.., Some("createRequire")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::CreateRequire)
        }
        (WellKnownObjectKind::ModuleModule, Some("default")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::ModuleModuleDefault)
        }
        _ => JsValue::unknown(
            JsValue::member(
                Arc::new(JsValue::WellKnownObject(WellKnownObjectKind::ModuleModule)),
                prop,
            ),
            true,
            rcstr!("unsupported property on Node.js `module` module"),
        ),
    }
}

fn url_module_member(kind: WellKnownObjectKind, prop: Arc<JsValue>) -> JsValue {
    match (kind, prop.as_str()) {
        (.., Some("pathToFileURL")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::PathToFileUrl)
        }
        (WellKnownObjectKind::UrlModule, Some("default")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::UrlModuleDefault)
        }
        _ => JsValue::unknown(
            JsValue::member(
                Arc::new(JsValue::WellKnownObject(WellKnownObjectKind::UrlModule)),
                prop,
            ),
            true,
            rcstr!("unsupported property on Node.js url module"),
        ),
    }
}

fn worker_threads_module_member(kind: WellKnownObjectKind, prop: Arc<JsValue>) -> JsValue {
    match (kind, prop.as_str()) {
        (.., Some("Worker")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::NodeWorkerConstructor)
        }
        (WellKnownObjectKind::WorkerThreadsModule, Some("default")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::WorkerThreadsModuleDefault)
        }
        _ => JsValue::unknown(
            JsValue::member(
                Arc::new(JsValue::WellKnownObject(
                    WellKnownObjectKind::WorkerThreadsModule,
                )),
                prop,
            ),
            true,
            rcstr!("unsupported property on Node.js worker_threads module"),
        ),
    }
}

fn child_process_module_member(kind: WellKnownObjectKind, prop: Arc<JsValue>) -> JsValue {
    let prop_str = prop.as_str();
    match (kind, prop_str) {
        (.., Some("spawn" | "spawnSync" | "execFile" | "execFileSync")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::ChildProcessSpawnMethod(
                prop_str.unwrap().into(),
            ))
        }
        (.., Some("fork")) => JsValue::WellKnownFunction(WellKnownFunctionKind::ChildProcessFork),
        (WellKnownObjectKind::ChildProcessModule, Some("default")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::ChildProcessModuleDefault)
        }

        _ => JsValue::unknown(
            JsValue::member(
                Arc::new(JsValue::WellKnownObject(
                    WellKnownObjectKind::ChildProcessModule,
                )),
                prop,
            ),
            true,
            rcstr!("unsupported property on Node.js child_process module"),
        ),
    }
}

fn os_module_member(kind: WellKnownObjectKind, prop: Arc<JsValue>) -> JsValue {
    match (kind, prop.as_str()) {
        (.., Some("platform")) => JsValue::WellKnownFunction(WellKnownFunctionKind::OsPlatform),
        (.., Some("arch")) => JsValue::WellKnownFunction(WellKnownFunctionKind::OsArch),
        (.., Some("endianness")) => JsValue::WellKnownFunction(WellKnownFunctionKind::OsEndianness),
        (WellKnownObjectKind::OsModule, Some("default")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::OsModuleDefault)
        }
        _ => JsValue::unknown(
            JsValue::member(
                Arc::new(JsValue::WellKnownObject(WellKnownObjectKind::OsModule)),
                prop,
            ),
            true,
            rcstr!("unsupported property on Node.js os module"),
        ),
    }
}

async fn node_process_member(
    prop: Arc<JsValue>,
    compile_time_info: Vc<CompileTimeInfo>,
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
        Some("argv") => JsValue::WellKnownObject(WellKnownObjectKind::NodeProcessArgv),
        Some("env") => JsValue::WellKnownObject(WellKnownObjectKind::NodeProcessEnv),
        _ => JsValue::unknown(
            JsValue::member(
                Arc::new(JsValue::WellKnownObject(
                    WellKnownObjectKind::NodeProcessModule,
                )),
                prop,
            ),
            true,
            rcstr!("unsupported property on Node.js process object"),
        ),
    })
}

fn node_pre_gyp(prop: Arc<JsValue>) -> JsValue {
    match prop.as_str() {
        Some("find") => JsValue::WellKnownFunction(WellKnownFunctionKind::NodePreGypFind),
        _ => JsValue::unknown(
            JsValue::member(
                Arc::new(JsValue::WellKnownObject(WellKnownObjectKind::NodePreGyp)),
                prop,
            ),
            true,
            rcstr!("unsupported property on @mapbox/node-pre-gyp module"),
        ),
    }
}

fn express(prop: Arc<JsValue>) -> JsValue {
    match prop.as_str() {
        Some("set") => JsValue::WellKnownFunction(WellKnownFunctionKind::NodeExpressSet),
        _ => JsValue::unknown(
            JsValue::member(
                Arc::new(JsValue::WellKnownObject(
                    WellKnownObjectKind::NodeExpressApp,
                )),
                prop,
            ),
            true,
            rcstr!("unsupported property on require('express')() object"),
        ),
    }
}

fn protobuf_loader(prop: Arc<JsValue>) -> JsValue {
    match prop.as_str() {
        Some("load") | Some("loadSync") => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::NodeProtobufLoad)
        }
        _ => JsValue::unknown(
            JsValue::member(
                Arc::new(JsValue::WellKnownObject(
                    WellKnownObjectKind::NodeProtobufLoader,
                )),
                prop,
            ),
            true,
            rcstr!("unsupported property on require('@grpc/proto-loader') object"),
        ),
    }
}
