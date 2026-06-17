use std::{iter, mem::take};

pub mod kinds;
pub mod require_context;

use anyhow::Result;
use either::Either;
use smallvec::SmallVec;
use turbo_rcstr::rcstr;
use turbo_tasks::Vc;
use turbopack_core::compile_time_info::CompileTimeInfo;
use url::Url;

use super::{
    ConstantValue, JsValue, JsValueUrlKind, ModuleValue, WellKnownFunctionKind, WellKnownObjectKind,
};
use crate::analyzer::{Bump, BumpVec, RequireContextValue, ThreadLocal};

pub async fn replace_well_known<'a>(
    arena: &'a ThreadLocal<Bump>,
    value: JsValue<'a>,
    compile_time_info: Vc<CompileTimeInfo>,
    allow_project_root_tracing: bool,
) -> Result<(JsValue<'a>, bool)> {
    Ok(match value {
        JsValue::Call(_, call) if matches!(call.callee(), JsValue::WellKnownFunction(_)) => {
            let (callee, args) = call.into_parts();
            let JsValue::WellKnownFunction(kind) = callee else {
                unreachable!()
            };
            (
                well_known_function_call(
                    arena,
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
                && let JsValue::WellKnownObject(_) = &call.args()[0]
            {
                return Ok((call.args()[0].clone_in(arena.get_or_default()), true));
            }
            (JsValue::Call(total, call), false)
        }
        JsValue::Member(_, mut obj, mut prop) if matches!(&*obj, JsValue::WellKnownObject(_)) => {
            let JsValue::WellKnownObject(kind) = take(&mut *obj) else {
                unreachable!()
            };
            well_known_object_member(arena, kind, take(&mut *prop), compile_time_info).await?
        }
        JsValue::Member(_, mut obj, mut prop) if matches!(&*obj, JsValue::WellKnownFunction(_)) => {
            let JsValue::WellKnownFunction(kind) = take(&mut *obj) else {
                unreachable!()
            };
            well_known_function_member(arena.get_or_default(), kind, take(&mut *prop))
        }
        JsValue::Member(_, mut obj, mut prop) if matches!(&*obj, JsValue::Array { .. }) => {
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
                _ => (
                    JsValue::member(arena.get_or_default(), take(&mut *obj), take(&mut *prop)),
                    false,
                ),
            }
        }
        // module.hot → WellKnownObject(ModuleHot) (only when HMR is enabled)
        JsValue::Member(_, obj, prop)
            if matches!(&*obj, JsValue::FreeVar(name) if &**name == "module")
                && prop.as_str() == Some("hot")
                && compile_time_info.await?.hot_module_replacement_enabled =>
        {
            (
                JsValue::WellKnownObject(WellKnownObjectKind::ModuleHot),
                true,
            )
        }
        _ => (value, false),
    })
}

pub async fn well_known_function_call<'a>(
    arena: &'a ThreadLocal<Bump>,
    kind: WellKnownFunctionKind<'a>,
    _this: JsValue<'a>,
    args: BumpVec<'a, JsValue<'a>>,
    compile_time_info: Vc<CompileTimeInfo>,
    allow_project_root_tracing: bool,
) -> Result<JsValue<'a>> {
    Ok(match kind {
        WellKnownFunctionKind::ObjectAssign => object_assign(arena.get_or_default(), args),
        WellKnownFunctionKind::PathJoin => path_join(arena.get_or_default(), args),
        WellKnownFunctionKind::PathDirname => path_dirname(arena.get_or_default(), args),
        WellKnownFunctionKind::PathResolve(cwd) => path_resolve(
            arena.get_or_default(),
            cwd.clone_in(arena.get_or_default()),
            args,
        ),
        WellKnownFunctionKind::Import => import(arena.get_or_default(), args),
        WellKnownFunctionKind::Require => require(arena.get_or_default(), args),
        WellKnownFunctionKind::RequireContextRequire(value) => {
            require_context_require(arena.get_or_default(), value, args)?
        }
        WellKnownFunctionKind::RequireContextRequireKeys(value) => {
            require_context_require_keys(arena.get_or_default(), value, args)?
        }
        WellKnownFunctionKind::RequireContextRequireResolve(value) => {
            require_context_require_resolve(arena.get_or_default(), value, args)?
        }
        WellKnownFunctionKind::PathToFileUrl => path_to_file_url(arena.get_or_default(), args),
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
                    JsValue::call_from_parts(
                        arena.get_or_default(),
                        JsValue::WellKnownFunction(kind),
                        args,
                    ),
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
            JsValue::call_from_parts(
                arena.get_or_default(),
                JsValue::WellKnownFunction(kind),
                args,
            ),
            true,
            rcstr!("unsupported function"),
        ),
    })
}

fn object_assign<'a>(arena: &'a Bump, args: BumpVec<'a, JsValue<'a>>) -> JsValue<'a> {
    if args.iter().all(|arg| matches!(arg, JsValue::Object { .. })) {
        if let Some(mut merged_object) = args.into_iter().reduce(|mut acc, cur| {
            if let JsValue::Object { parts, mutable, .. } = &mut acc
                && let JsValue::Object {
                    parts: next_parts,
                    mutable: next_mutable,
                    ..
                } = &cur
            {
                parts.extend(arena, next_parts.iter().map(|p| p.clone_in(arena)));
                *mutable |= *next_mutable;
            }
            acc
        }) {
            merged_object.update_total_nodes();
            merged_object
        } else {
            JsValue::unknown(
                JsValue::call_from_iter(
                    arena,
                    JsValue::WellKnownFunction(WellKnownFunctionKind::ObjectAssign),
                    [],
                ),
                true,
                rcstr!("empty arguments for Object.assign"),
            )
        }
    } else {
        JsValue::unknown(
            JsValue::call_from_parts(
                arena,
                JsValue::WellKnownFunction(WellKnownFunctionKind::ObjectAssign),
                args,
            ),
            true,
            rcstr!("only const object assign is supported"),
        )
    }
}

fn path_join<'a>(arena: &'a Bump, args: BumpVec<'a, JsValue<'a>>) -> JsValue<'a> {
    if args.is_empty() {
        return rcstr!(".").into();
    }
    let mut locked_prefix: SmallVec<[JsValue<'a>; 16]> = SmallVec::new();
    let mut segments: SmallVec<[JsValue<'a>; 16]> = SmallVec::new();
    for arg in args {
        let arg_parts = if let Some(str) = arg.as_str() {
            let split = str.split('/');
            Either::Left(split.map(|s| s.into()))
        } else {
            Either::Right(iter::once(arg))
        };
        for item in arg_parts {
            if let Some(str) = item.as_str() {
                match str {
                    "" | "." => {
                        if locked_prefix.is_empty() && segments.is_empty() {
                            locked_prefix.push(item);
                        }
                    }
                    ".." => {
                        if segments.pop().is_none() {
                            locked_prefix.push(item);
                        }
                    }
                    _ => segments.push(item),
                }
            } else {
                locked_prefix.append(&mut segments);
                locked_prefix.push(item);
            }
        }
    }
    locked_prefix.append(&mut segments);
    let mut iter = locked_prefix.into_iter();
    let first = iter.next().unwrap();
    let mut last_is_str = first.as_str().is_some();
    // `segments` is now empty; reuse it as the render buffer (`result`) for the
    // joined parts to avoid allocating a third vec.
    let mut result = segments;
    result.push(first);
    for part in iter {
        let is_str = part.as_str().is_some();
        if last_is_str && is_str {
            result.push(rcstr!("/").into());
        } else {
            result.push(JsValue::alternatives(BumpVec::from_iter_in(
                arena,
                [rcstr!("/").into(), rcstr!("").into()],
            )));
        }
        result.push(part);
        last_is_str = is_str;
    }
    JsValue::concat(BumpVec::from_iter_in(arena, result))
}

fn path_resolve<'a>(
    arena: &'a Bump,
    cwd: JsValue<'a>,
    mut args: BumpVec<'a, JsValue<'a>>,
) -> JsValue<'a> {
    // If no path segments are passed, `path.resolve()` will return the absolute
    // path of the current working directory.
    if args.is_empty() {
        return JsValue::unknown_empty(false, rcstr!("cwd is not static analyzable"));
    }
    if args.len() == 1 {
        return args.into_iter().next().unwrap();
    }

    // path.resolve stops at the string starting with `/`
    for (idx, arg) in args.iter().enumerate().rev() {
        if idx != 0
            && let Some(str) = arg.as_str()
            && str.starts_with('/')
        {
            return path_resolve(arena, cwd, args.split_off(arena, idx));
        }
    }

    let mut results_final: SmallVec<[JsValue<'a>; 16]> = SmallVec::new();
    let mut results: SmallVec<[JsValue<'a>; 16]> = SmallVec::new();
    for arg in args {
        let arg_parts = if let Some(str) = arg.as_str() {
            let split = str.split('/');
            Either::Left(split.map(|s| s.into()))
        } else {
            Either::Right(iter::once(arg))
        };
        for item in arg_parts {
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
            results.push(rcstr!("/").into());
        } else {
            results.push(JsValue::alternatives(BumpVec::from_iter_in(
                arena,
                [rcstr!("/").into(), rcstr!("").into()],
            )));
        }
        results.push(part);
        last_was_str = is_str;
    }

    JsValue::concat(BumpVec::from_iter_in(arena, results))
}

fn path_dirname<'a>(arena: &'a Bump, mut args: BumpVec<'a, JsValue<'a>>) -> JsValue<'a> {
    if let Some(arg) = args.iter_mut().next() {
        if let Some(str) = arg.as_str() {
            if let Some(i) = str.rfind('/') {
                return JsValue::Constant(ConstantValue::Str(str[..i].to_string().into()));
            } else {
                return JsValue::Constant(ConstantValue::Str(rcstr!("").into()));
            }
        } else if let JsValue::Concat(_, items) = arg
            && let Some(last) = items.last_mut()
            && let Some(str) = last.as_str()
            && let Some(i) = str.rfind('/')
        {
            *last = JsValue::Constant(ConstantValue::Str(str[..i].to_string().into()));
            return take(arg);
        }
    }
    JsValue::unknown(
        JsValue::call_from_parts(
            arena,
            JsValue::WellKnownFunction(WellKnownFunctionKind::PathDirname),
            args,
        ),
        true,
        rcstr!("path.dirname with unsupported arguments"),
    )
}

/// Resolve the contents of an import call, throwing errors
/// if we come across any unsupported syntax.
pub fn import<'a>(arena: &'a Bump, args: BumpVec<'a, JsValue<'a>>) -> JsValue<'a> {
    match &args[..] {
        [JsValue::Constant(ConstantValue::Str(v))] => JsValue::promise(
            arena,
            JsValue::Module(ModuleValue {
                module: v.as_atom().into_owned().into(),
                annotations: None,
            }),
        ),
        _ => JsValue::unknown(
            JsValue::call_from_parts(
                arena,
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
fn require<'a>(arena: &'a Bump, args: BumpVec<'a, JsValue<'a>>) -> JsValue<'a> {
    if args.len() == 1 {
        if let Some(s) = args[0].as_str() {
            JsValue::Module(ModuleValue {
                module: s.into(),
                annotations: None,
            })
        } else {
            JsValue::unknown(
                JsValue::call_from_parts(
                    arena,
                    JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
                    args,
                ),
                true,
                rcstr!("only constant argument is supported"),
            )
        }
    } else {
        JsValue::unknown(
            JsValue::call_from_parts(
                arena,
                JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
                args,
            ),
            true,
            rcstr!("only a single argument is supported"),
        )
    }
}

/// (try to) statically evaluate `require.context(...)()`
fn require_context_require<'a>(
    arena: &'a Bump,
    val: Box<RequireContextValue>,
    args: BumpVec<'a, JsValue<'a>>,
) -> Result<JsValue<'a>> {
    if args.is_empty() {
        return Ok(JsValue::unknown(
            JsValue::call_from_parts(
                arena,
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
            JsValue::call_from_parts(
                arena,
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
            JsValue::call_from_parts(
                arena,
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
fn require_context_require_keys<'a>(
    arena: &'a Bump,
    val: Box<RequireContextValue>,
    args: BumpVec<'a, JsValue<'a>>,
) -> Result<JsValue<'a>> {
    Ok(if args.is_empty() {
        JsValue::array(BumpVec::from_iter_in(
            arena,
            val.0.keys().cloned().map(|k| k.into()),
        ))
    } else {
        JsValue::unknown(
            JsValue::call_from_parts(
                arena,
                JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContextRequireKeys(val)),
                args,
            ),
            true,
            rcstr!("require.context(...).keys() does not accept arguments"),
        )
    })
}

/// (try to) statically evaluate `require.context(...).resolve()`
fn require_context_require_resolve<'a>(
    arena: &'a Bump,
    val: Box<RequireContextValue>,
    args: BumpVec<'a, JsValue<'a>>,
) -> Result<JsValue<'a>> {
    if args.len() != 1 {
        return Ok(JsValue::unknown(
            JsValue::call_from_parts(
                arena,
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
            JsValue::call_from_parts(
                arena,
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
            JsValue::call_from_parts(
                arena,
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

fn path_to_file_url<'a>(arena: &'a Bump, args: BumpVec<'a, JsValue<'a>>) -> JsValue<'a> {
    if args.len() == 1 {
        if let Some(path) = args[0].as_str() {
            Url::from_file_path(path)
                .map(|url| JsValue::Url(String::from(url).into(), JsValueUrlKind::Absolute))
                .unwrap_or_else(|_| {
                    JsValue::unknown(
                        JsValue::call_from_parts(
                            arena,
                            JsValue::WellKnownFunction(WellKnownFunctionKind::PathToFileUrl),
                            args,
                        ),
                        true,
                        rcstr!("url not parseable: path is relative or has an invalid prefix"),
                    )
                })
        } else {
            JsValue::unknown(
                JsValue::call_from_parts(
                    arena,
                    JsValue::WellKnownFunction(WellKnownFunctionKind::PathToFileUrl),
                    args,
                ),
                true,
                rcstr!("only constant argument is supported"),
            )
        }
    } else {
        JsValue::unknown(
            JsValue::call_from_parts(
                arena,
                JsValue::WellKnownFunction(WellKnownFunctionKind::PathToFileUrl),
                args,
            ),
            true,
            rcstr!("only a single argument is supported"),
        )
    }
}

fn well_known_function_member<'a>(
    arena: &'a Bump,
    kind: WellKnownFunctionKind<'a>,
    prop: JsValue<'a>,
) -> (JsValue<'a>, bool) {
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
                JsValue::member(arena, JsValue::WellKnownFunction(kind), prop),
                false,
            );
        }
    };
    (new_value, true)
}

async fn well_known_object_member<'a>(
    arena: &'a ThreadLocal<Bump>,
    kind: WellKnownObjectKind,
    prop: JsValue<'a>,
    compile_time_info: Vc<CompileTimeInfo>,
) -> Result<(JsValue<'a>, bool)> {
    let new_value = match kind {
        WellKnownObjectKind::GlobalObject => global_object(arena.get_or_default(), prop),
        WellKnownObjectKind::PathModule | WellKnownObjectKind::PathModuleDefault => {
            path_module_member(arena, kind, prop, compile_time_info).await?
        }
        WellKnownObjectKind::FsModule
        | WellKnownObjectKind::FsModuleDefault
        | WellKnownObjectKind::FsModulePromises => {
            fs_module_member(arena.get_or_default(), kind, prop)
        }
        WellKnownObjectKind::FsExtraModule | WellKnownObjectKind::FsExtraModuleDefault => {
            fs_extra_module_member(arena.get_or_default(), kind, prop)
        }
        WellKnownObjectKind::ModuleModule | WellKnownObjectKind::ModuleModuleDefault => {
            module_module_member(arena.get_or_default(), kind, prop)
        }
        WellKnownObjectKind::UrlModule | WellKnownObjectKind::UrlModuleDefault => {
            url_module_member(arena.get_or_default(), kind, prop)
        }
        WellKnownObjectKind::WorkerThreadsModule
        | WellKnownObjectKind::WorkerThreadsModuleDefault => {
            worker_threads_module_member(arena.get_or_default(), kind, prop)
        }
        WellKnownObjectKind::ChildProcessModule
        | WellKnownObjectKind::ChildProcessModuleDefault => {
            child_process_module_member(arena.get_or_default(), kind, prop)
        }
        WellKnownObjectKind::OsModule | WellKnownObjectKind::OsModuleDefault => {
            os_module_member(arena.get_or_default(), kind, prop)
        }
        WellKnownObjectKind::NodeProcessModule => {
            node_process_member(arena, prop, compile_time_info).await?
        }
        WellKnownObjectKind::NodePreGyp => node_pre_gyp(arena.get_or_default(), prop),
        WellKnownObjectKind::NodeExpressApp => express(arena.get_or_default(), prop),
        WellKnownObjectKind::NodeProtobufLoader => protobuf_loader(arena.get_or_default(), prop),
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
                    JsValue::member(arena.get_or_default(), JsValue::WellKnownObject(kind), prop),
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
                        JsValue::member(
                            arena.get_or_default(),
                            JsValue::WellKnownObject(kind),
                            prop,
                        ),
                        true,
                        rcstr!("unsupported property on module.hot"),
                    ),
                    true,
                ));
            }
        },
        WellKnownObjectKind::Navigator => match prop.as_str() {
            Some("serviceWorker") => {
                JsValue::WellKnownObject(WellKnownObjectKind::NavigatorServiceWorker)
            }
            _ => {
                return Ok((
                    JsValue::member(arena.get_or_default(), JsValue::WellKnownObject(kind), prop),
                    false,
                ));
            }
        },
        WellKnownObjectKind::NavigatorServiceWorker => match prop.as_str() {
            Some("register") => {
                JsValue::WellKnownFunction(WellKnownFunctionKind::ServiceWorkerRegister)
            }
            _ => {
                return Ok((
                    JsValue::member(arena.get_or_default(), JsValue::WellKnownObject(kind), prop),
                    false,
                ));
            }
        },
        #[allow(unreachable_patterns)]
        _ => {
            return Ok((
                JsValue::member(arena.get_or_default(), JsValue::WellKnownObject(kind), prop),
                false,
            ));
        }
    };
    Ok((new_value, true))
}

fn global_object<'a>(arena: &'a Bump, prop: JsValue<'a>) -> JsValue<'a> {
    match prop.as_str() {
        Some("assign") => JsValue::WellKnownFunction(WellKnownFunctionKind::ObjectAssign),
        _ => JsValue::unknown(
            JsValue::member(
                arena,
                JsValue::WellKnownObject(WellKnownObjectKind::GlobalObject),
                prop,
            ),
            true,
            rcstr!("unsupported property on global Object"),
        ),
    }
}

async fn path_module_member<'a>(
    arena: &'a ThreadLocal<Bump>,
    kind: WellKnownObjectKind,
    prop: JsValue<'a>,
    compile_time_info: Vc<CompileTimeInfo>,
) -> Result<JsValue<'a>> {
    Ok(match (kind, prop.as_str()) {
        (.., Some("join")) => JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin),
        (.., Some("dirname")) => JsValue::WellKnownFunction(WellKnownFunctionKind::PathDirname),
        (.., Some("resolve")) => {
            // cwd is added while resolving in references.rs
            JsValue::WellKnownFunction(WellKnownFunctionKind::PathResolve(
                arena.get_or_default().alloc(JsValue::from("")),
            ))
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
                arena.get_or_default(),
                JsValue::WellKnownObject(WellKnownObjectKind::PathModule),
                prop,
            ),
            true,
            rcstr!("unsupported property on Node.js path module"),
        ),
    })
}

fn fs_module_member<'a>(
    arena: &'a Bump,
    kind: WellKnownObjectKind,
    prop: JsValue<'a>,
) -> JsValue<'a> {
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
            arena,
            JsValue::WellKnownObject(WellKnownObjectKind::FsModule),
            prop,
        ),
        true,
        rcstr!("unsupported property on Node.js fs module"),
    )
}

fn fs_extra_module_member<'a>(
    arena: &'a Bump,
    kind: WellKnownObjectKind,
    prop: JsValue<'a>,
) -> JsValue<'a> {
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
            arena,
            JsValue::WellKnownObject(WellKnownObjectKind::FsExtraModule),
            prop,
        ),
        true,
        rcstr!("unsupported property on fs-extra module"),
    )
}

fn module_module_member<'a>(
    arena: &'a Bump,
    kind: WellKnownObjectKind,
    prop: JsValue<'a>,
) -> JsValue<'a> {
    match (kind, prop.as_str()) {
        (.., Some("createRequire")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::CreateRequire)
        }
        (WellKnownObjectKind::ModuleModule, Some("default")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::ModuleModuleDefault)
        }
        _ => JsValue::unknown(
            JsValue::member(
                arena,
                JsValue::WellKnownObject(WellKnownObjectKind::ModuleModule),
                prop,
            ),
            true,
            rcstr!("unsupported property on Node.js `module` module"),
        ),
    }
}

fn url_module_member<'a>(
    arena: &'a Bump,
    kind: WellKnownObjectKind,
    prop: JsValue<'a>,
) -> JsValue<'a> {
    match (kind, prop.as_str()) {
        (.., Some("pathToFileURL")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::PathToFileUrl)
        }
        (WellKnownObjectKind::UrlModule, Some("default")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::UrlModuleDefault)
        }
        _ => JsValue::unknown(
            JsValue::member(
                arena,
                JsValue::WellKnownObject(WellKnownObjectKind::UrlModule),
                prop,
            ),
            true,
            rcstr!("unsupported property on Node.js url module"),
        ),
    }
}

fn worker_threads_module_member<'a>(
    arena: &'a Bump,
    kind: WellKnownObjectKind,
    prop: JsValue<'a>,
) -> JsValue<'a> {
    match (kind, prop.as_str()) {
        (.., Some("Worker")) => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::NodeWorkerConstructor)
        }
        (WellKnownObjectKind::WorkerThreadsModule, Some("default")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::WorkerThreadsModuleDefault)
        }
        _ => JsValue::unknown(
            JsValue::member(
                arena,
                JsValue::WellKnownObject(WellKnownObjectKind::WorkerThreadsModule),
                prop,
            ),
            true,
            rcstr!("unsupported property on Node.js worker_threads module"),
        ),
    }
}

fn child_process_module_member<'a>(
    arena: &'a Bump,
    kind: WellKnownObjectKind,
    prop: JsValue<'a>,
) -> JsValue<'a> {
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
                arena,
                JsValue::WellKnownObject(WellKnownObjectKind::ChildProcessModule),
                prop,
            ),
            true,
            rcstr!("unsupported property on Node.js child_process module"),
        ),
    }
}

fn os_module_member<'a>(
    arena: &'a Bump,
    kind: WellKnownObjectKind,
    prop: JsValue<'a>,
) -> JsValue<'a> {
    match (kind, prop.as_str()) {
        (.., Some("platform")) => JsValue::WellKnownFunction(WellKnownFunctionKind::OsPlatform),
        (.., Some("arch")) => JsValue::WellKnownFunction(WellKnownFunctionKind::OsArch),
        (.., Some("endianness")) => JsValue::WellKnownFunction(WellKnownFunctionKind::OsEndianness),
        (WellKnownObjectKind::OsModule, Some("default")) => {
            JsValue::WellKnownObject(WellKnownObjectKind::OsModuleDefault)
        }
        _ => JsValue::unknown(
            JsValue::member(
                arena,
                JsValue::WellKnownObject(WellKnownObjectKind::OsModule),
                prop,
            ),
            true,
            rcstr!("unsupported property on Node.js os module"),
        ),
    }
}

async fn node_process_member<'a>(
    arena: &'a ThreadLocal<Bump>,
    prop: JsValue<'a>,
    compile_time_info: Vc<CompileTimeInfo>,
) -> Result<JsValue<'a>> {
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
                arena.get_or_default(),
                JsValue::WellKnownObject(WellKnownObjectKind::NodeProcessModule),
                prop,
            ),
            true,
            rcstr!("unsupported property on Node.js process object"),
        ),
    })
}

fn node_pre_gyp<'a>(arena: &'a Bump, prop: JsValue<'a>) -> JsValue<'a> {
    match prop.as_str() {
        Some("find") => JsValue::WellKnownFunction(WellKnownFunctionKind::NodePreGypFind),
        _ => JsValue::unknown(
            JsValue::member(
                arena,
                JsValue::WellKnownObject(WellKnownObjectKind::NodePreGyp),
                prop,
            ),
            true,
            rcstr!("unsupported property on @mapbox/node-pre-gyp module"),
        ),
    }
}

fn express<'a>(arena: &'a Bump, prop: JsValue<'a>) -> JsValue<'a> {
    match prop.as_str() {
        Some("set") => JsValue::WellKnownFunction(WellKnownFunctionKind::NodeExpressSet),
        _ => JsValue::unknown(
            JsValue::member(
                arena,
                JsValue::WellKnownObject(WellKnownObjectKind::NodeExpressApp),
                prop,
            ),
            true,
            rcstr!("unsupported property on require('express')() object"),
        ),
    }
}

fn protobuf_loader<'a>(arena: &'a Bump, prop: JsValue<'a>) -> JsValue<'a> {
    match prop.as_str() {
        Some("load") | Some("loadSync") => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::NodeProtobufLoad)
        }
        _ => JsValue::unknown(
            JsValue::member(
                arena,
                JsValue::WellKnownObject(WellKnownObjectKind::NodeProtobufLoader),
                prop,
            ),
            true,
            rcstr!("unsupported property on require('@grpc/proto-loader') object"),
        ),
    }
}

#[cfg(test)]
mod tests {
    use bumpalo::Bump;

    use super::path_join;
    use crate::analyzer::{BumpVec, JsValue};

    /// Renders the result of [`path_join`] into a single `String`.
    ///
    /// `path_join` returns a [`JsValue::Concat`] of the resulting path segments
    /// interleaved with `/` separators (or a bare [`JsValue::Constant`] for the
    /// empty-args case). When every input is a constant string the entire result
    /// is made of constant strings, so we can flatten it back into the joined
    /// path by concatenating each leaf. This avoids relying on `normalize`, which
    /// would collapse a result of `""` into an empty `Concat` rather than a
    /// `Constant`.
    ///
    /// For non-constant inputs the result also contains [`JsValue::FreeVar`]
    /// leaves and `"/"`-or-`""` separator [`JsValue::Alternatives`]; we render a
    /// free var as its name and pick the first (`"/"`) option of a separator so
    /// the rendering stays deterministic.
    fn render(value: &JsValue<'_>) -> String {
        match value {
            JsValue::Concat(_, parts) => parts.iter().map(render).collect(),
            JsValue::Alternatives { values, .. } => render(&values[0]),
            JsValue::FreeVar(name) => name.to_string(),
            other => other
                .as_str()
                .expect("path_join over constant strings should yield constant strings")
                .to_string(),
        }
    }

    /// Calls `path_join` with the given string segments and returns the joined
    /// path as a `String`.
    fn join(arena: &Bump, segments: &[&str]) -> String {
        let args = BumpVec::from_iter_in(arena, segments.iter().map(|s| JsValue::from(*s)));
        render(&path_join(arena, args))
    }

    /// Cases where `path_join`'s static-analysis result matches the runtime
    /// behaviour of Node's `path.posix.join`.
    ///
    /// Mirrors the `joinTests` table in Node's `test/parallel/test-path-join.js`:
    /// <https://github.com/nodejs/node/blob/main/test/parallel/test-path-join.js>
    #[test]
    fn matches_node_path_posix_join() {
        let arena = Bump::new();

        assert_eq!(join(&arena, &[]), ".");
        assert_eq!(join(&arena, &["/.", "x/b", "..", "/b/c.js"]), "/x/b/c.js");
        assert_eq!(join(&arena, &["foo", "../../../bar"]), "../../bar");
        assert_eq!(join(&arena, &["foo/", "../../../bar"]), "../../bar");
        assert_eq!(join(&arena, &["foo/x", "../../../bar"]), "../bar");
        assert_eq!(join(&arena, &["foo/x", "./bar"]), "foo/x/bar");
        assert_eq!(join(&arena, &["foo/x/", "./bar"]), "foo/x/bar");
        assert_eq!(join(&arena, &["foo/x/", ".", "bar"]), "foo/x/bar");
        assert_eq!(join(&arena, &[".", ".", "."]), ".");
        assert_eq!(join(&arena, &[".", "./", "."]), ".");
        assert_eq!(join(&arena, &[".", "/./", "."]), ".");
        assert_eq!(join(&arena, &[".", "/////./", "."]), ".");
        assert_eq!(join(&arena, &["."]), ".");
        assert_eq!(join(&arena, &["foo", "/bar"]), "foo/bar");
        assert_eq!(join(&arena, &["", "/foo"]), "/foo");
        assert_eq!(join(&arena, &["", "", "/foo"]), "/foo");
        assert_eq!(join(&arena, &["foo", ""]), "foo");
        assert_eq!(join(&arena, &["foo", "", "/bar"]), "foo/bar");
        assert_eq!(join(&arena, &[" /foo"]), " /foo");
        assert_eq!(join(&arena, &[" ", "foo"]), " /foo");
        assert_eq!(join(&arena, &[" ", "."]), " ");
        assert_eq!(join(&arena, &[" ", ""]), " ");
        assert_eq!(join(&arena, &["/", "foo"]), "/foo");
        assert_eq!(join(&arena, &["/", "/foo"]), "/foo");
        assert_eq!(join(&arena, &["/", "//foo"]), "/foo");
        assert_eq!(join(&arena, &["/", "", "/foo"]), "/foo");
        assert_eq!(join(&arena, &["", "/", "foo"]), "/foo");
        assert_eq!(join(&arena, &["", "/", "/foo"]), "/foo");
    }

    /// `..` cancels the most recent entry on the poppable `segments` stack.
    #[test]
    fn dotdot_pops_from_segments() {
        let arena = Bump::new();

        assert_eq!(join(&arena, &["foo/bar/baz", "../.."]), "foo");
        assert_eq!(join(&arena, &["a/b", ".."]), "a");
        assert_eq!(join(&arena, &["a/b/c/d", "../../.."]), "a");
        // The `..` only pops what is currently on the stack.
        assert_eq!(join(&arena, &["a/b", "../../c"]), "c");
    }

    /// When `segments` is empty there is nothing to pop, so `..` is committed to
    /// `locked_prefix` instead. Once there it can no longer be cancelled, which
    /// is why `..` is not clamped at the root.
    #[test]
    fn unpoppable_dotdot_is_locked_into_prefix() {
        let arena = Bump::new();

        assert_eq!(join(&arena, &["../../foo"]), "../../foo");
        // The leading `..` is locked into the prefix; the later `foo/..` cancels
        // within `segments`, leaving only the locked `..`.
        assert_eq!(join(&arena, &["..", "foo", ".."]), "..");
        // `..` past an absolute root accumulates rather than being clamped.
        assert_eq!(join(&arena, &["/foo", "../../bar"]), "/../bar");
    }

    /// A leading `.` (or empty segment) is locked into `locked_prefix`, but only
    /// while both stacks are still empty — interior `.`/empty segments are
    /// dropped.
    #[test]
    fn leading_dot_is_locked_but_interior_is_dropped() {
        let arena = Bump::new();

        assert_eq!(join(&arena, &["./foo", ".", "bar"]), "./foo/bar");
        assert_eq!(join(&arena, &["foo/x", ".", "bar"]), "foo/x/bar");
        assert_eq!(join(&arena, &[".", ".", "."]), ".");
    }

    /// Cases where `path_join`'s static-analysis result diverges from Node's
    /// `path.posix.join`. These all involve absolute paths (a leading `/`) or
    /// empty-string inputs, which the static analysis does not model the same way
    /// Node does at runtime.
    ///
    /// The assertions below are intentionally commented out — they describe the
    /// behaviour we would want to match (Node's computed value) but which
    /// `path_join` does not currently produce. The trailing comment on each line
    /// records what `path_join` returns today.
    ///
    /// Mirrors additional rows of the `joinTests` table in Node's
    /// `test/parallel/test-path-join.js`:
    /// <https://github.com/nodejs/node/blob/main/test/parallel/test-path-join.js>
    #[test]
    fn diverges_from_node_path_posix_join() {
        // let arena = Bump::new();

        // path_join: "/foo"
        // assert_eq!(join(&arena, &["", "foo"]), "foo");
        // path_join: "/foo"
        // assert_eq!(join(&arena, &["", "", "foo"]), "foo");
        // path_join: "/../../foo"
        // assert_eq!(join(&arena, &["", "..", "..", "/foo"]), "../../foo");
        // path_join: ""
        // assert_eq!(join(&arena, &["/"]), "/");
        // path_join: ""
        // assert_eq!(join(&arena, &["/", "."]), "/");
        // path_join: "/../../bar"
        // assert_eq!(join(&arena, &["/foo", "../../../bar"]), "/bar");
        // path_join: "/.."
        // assert_eq!(join(&arena, &["/", ".."]), "/");
        // path_join: "/../.."
        // assert_eq!(join(&arena, &["/", "..", ".."]), "/");
        // path_join: ""
        // assert_eq!(join(&arena, &["", "."]), ".");
        // path_join: ""
        // assert_eq!(join(&arena, &[""]), ".");
        // path_join: ""
        // assert_eq!(join(&arena, &["", ""]), ".");
    }

    /// A non-constant (dynamic) segment flushes the working `segments` stack into
    /// `locked_prefix` and freezes everything before it. A later `..` cannot pop
    /// across that boundary, unlike the all-constant case.
    #[test]
    fn dynamic_segment_freezes_preceding_segments() {
        let arena = Bump::new();

        // Baseline: with all-constant segments, `..` pops `x` off `segments`.
        assert_eq!(join(&arena, &["foo", "x", ".."]), "foo");

        // With a dynamic segment between `foo` and `..`, `foo` is flushed into
        // `locked_prefix` and survives — the trailing `..` cannot reach it.
        let args = BumpVec::from_iter_in(
            &arena,
            [
                JsValue::from("foo"),
                JsValue::FreeVar("dynamic".into()),
                JsValue::from(".."),
            ],
        );
        assert_eq!(render(&path_join(&arena, args)), "foo/dynamic/..");
    }
}
