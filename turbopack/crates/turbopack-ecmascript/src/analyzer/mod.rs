use std::{
    hash::{Hash, Hasher},
    sync::LazyLock,
};

use anyhow::{Result, bail};
use swc_core::{
    common::Mark,
    ecma::{
        ast::{Id, Ident},
        atoms::Atom,
    },
};
use turbo_esregex::EsRegex;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, Vc};

pub(crate) use self::imports::ImportMap;
use crate::references::require_context::RequireContextMap;

pub mod builtin;
pub mod graph;
pub mod imports;
pub mod linker;
pub mod side_effects;
pub mod top_level_await;
pub mod well_known;

mod jsvalue;
pub use jsvalue::*;

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

#[derive(Debug, Clone)]
pub struct RequireContextOptions {
    pub dir: RcStr,
    pub include_subdirs: bool,
    /// this is a regex (pattern, flags)
    pub filter: EsRegex,
}

/// Parse the arguments passed to a require.context invocation, validate them
/// and convert them to the appropriate rust values.
pub fn parse_require_context(args: &[JsValue]) -> Result<RequireContextOptions> {
    if !(1..=3).contains(&args.len()) {
        // https://linear.app/vercel/issue/WEB-910/add-support-for-requirecontexts-mode-argument
        bail!("require.context() only supports 1-3 arguments (mode is not supported)");
    }

    let Some(dir) = args[0].as_str().map(|s| s.into()) else {
        bail!("require.context(dir, ...) requires dir to be a constant string");
    };

    let include_subdirs = if let Some(include_subdirs) = args.get(1) {
        if let Some(include_subdirs) = include_subdirs.as_bool() {
            include_subdirs
        } else {
            bail!(
                "require.context(..., includeSubdirs, ...) requires includeSubdirs to be a \
                 constant boolean",
            );
        }
    } else {
        true
    };

    let filter = if let Some(filter) = args.get(2) {
        if let JsValue::Constant(ConstantValue::Regex(box (pattern, flags))) = filter {
            EsRegex::new(pattern, flags)?
        } else {
            bail!("require.context(..., ..., filter) requires filter to be a regex");
        }
    } else {
        // https://webpack.js.org/api/module-methods/#requirecontext
        // > optional, default /^\.\/.*$/, any file
        static DEFAULT_REGEX: LazyLock<EsRegex> =
            LazyLock::new(|| EsRegex::new(r"^\./.*$", "").unwrap());

        DEFAULT_REGEX.clone()
    };

    Ok(RequireContextOptions {
        dir,
        include_subdirs,
        filter,
    })
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct RequireContextValue(FxIndexMap<RcStr, RcStr>);

impl RequireContextValue {
    pub async fn from_context_map(map: Vc<RequireContextMap>) -> Result<Self> {
        let mut context_map = FxIndexMap::default();

        for (key, entry) in map.await?.iter() {
            context_map.insert(key.clone(), entry.origin_relative.clone());
        }

        Ok(RequireContextValue(context_map))
    }
}

impl Hash for RequireContextValue {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.0.len().hash(state);
        for (i, (k, v)) in self.0.iter().enumerate() {
            i.hash(state);
            k.hash(state);
            v.hash(state);
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

fn is_unresolved(i: &Ident, unresolved_mark: Mark) -> bool {
    i.ctxt.outer() == unresolved_mark
}

fn is_unresolved_id(i: &Id, unresolved_mark: Mark) -> bool {
    i.1.outer() == unresolved_mark
}

#[doc(hidden)]
pub mod test_utils {
    use anyhow::Result;
    use turbo_rcstr::rcstr;
    use turbo_tasks::{FxIndexMap, PrettyPrintError, Vc};
    use turbopack_core::compile_time_info::CompileTimeInfo;

    use super::{
        ConstantValue, JsValue, JsValueUrlKind, ModuleValue, WellKnownFunctionKind,
        WellKnownObjectKind, builtin::early_replace_builtin, well_known::replace_well_known,
    };
    use crate::{
        analyzer::{
            RequireContextValue, builtin::replace_builtin, imports::ImportAttributes,
            parse_require_context,
        },
        utils::module_value_to_well_known_object,
    };

    pub async fn early_visitor(mut v: JsValue) -> Result<(JsValue, bool)> {
        let m = early_replace_builtin(&mut v);
        Ok((v, m))
    }

    /// Visitor that replaces well known functions and objects with their
    /// corresponding values. Returns the new value and whether it was modified.
    pub async fn visitor(
        v: JsValue,
        compile_time_info: Vc<CompileTimeInfo>,
        attributes: &ImportAttributes,
    ) -> Result<(JsValue, bool)> {
        let ImportAttributes { ignore, .. } = *attributes;
        let mut new_value = match v {
            JsValue::Call(_, ref call)
                if matches!(
                    call.callee(),
                    JsValue::WellKnownFunction(WellKnownFunctionKind::Import)
                ) =>
            {
                match &call.args()[0] {
                    JsValue::Constant(ConstantValue::Str(v)) => {
                        JsValue::promise(JsValue::Module(ModuleValue {
                            module: v.as_atom().into_owned().into(),
                            annotations: None,
                        }))
                    }
                    _ => v.into_unknown(true, rcstr!("import() non constant")),
                }
            }
            JsValue::Call(_, ref call)
                if matches!(
                    call.callee(),
                    JsValue::WellKnownFunction(WellKnownFunctionKind::CreateRequire)
                ) =>
            {
                if let [
                    JsValue::Member(
                        _,
                        box JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta),
                        box JsValue::Constant(ConstantValue::Str(prop)),
                    ),
                ] = call.args()
                    && prop.as_str() == "url"
                {
                    JsValue::WellKnownFunction(WellKnownFunctionKind::Require)
                } else {
                    v.into_unknown(true, rcstr!("createRequire() non constant"))
                }
            }
            JsValue::Call(_, ref call)
                if matches!(
                    call.callee(),
                    JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve)
                ) =>
            {
                match &call.args()[0] {
                    JsValue::Constant(v) => (v.to_string() + "/resolved/lib/index.js").into(),
                    _ => v.into_unknown(true, rcstr!("require.resolve non constant")),
                }
            }
            JsValue::Call(_, ref call)
                if matches!(
                    call.callee(),
                    JsValue::WellKnownFunction(WellKnownFunctionKind::ImportMetaGlob)
                ) =>
            {
                v.into_unknown(false, rcstr!("import.meta.glob()"))
            }
            JsValue::Call(_, ref call)
                if matches!(
                    call.callee(),
                    JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContext)
                ) =>
            {
                match parse_require_context(call.args()) {
                    Ok(options) => {
                        let mut map = FxIndexMap::default();

                        map.insert(
                            rcstr!("./a"),
                            format!("[context: {}]/a", options.dir).into(),
                        );
                        map.insert(
                            rcstr!("./b"),
                            format!("[context: {}]/b", options.dir).into(),
                        );
                        map.insert(
                            rcstr!("./c"),
                            format!("[context: {}]/c", options.dir).into(),
                        );

                        JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContextRequire(
                            Box::new(RequireContextValue(map)),
                        ))
                    }
                    Err(err) => v.into_unknown(true, PrettyPrintError(&err).to_string().into()),
                }
            }
            JsValue::New(_, ref call)
                if matches!(
                    call.callee(),
                    JsValue::WellKnownFunction(WellKnownFunctionKind::URLConstructor)
                ) =>
            {
                if let [
                    JsValue::Constant(ConstantValue::Str(url)),
                    JsValue::Member(
                        _,
                        box JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta),
                        box JsValue::Constant(ConstantValue::Str(prop)),
                    ),
                ] = call.args()
                {
                    if prop.as_str() == "url" {
                        // TODO avoid clone
                        JsValue::Url(url.clone(), JsValueUrlKind::Relative)
                    } else {
                        v.into_unknown(true, rcstr!("new non constant"))
                    }
                } else {
                    v.into_unknown(true, rcstr!("new non constant"))
                }
            }
            JsValue::FreeVar(ref var) => match &**var {
                "__dirname" => rcstr!("__dirname").into(),
                "__filename" => rcstr!("__filename").into(),

                "require" => JsValue::unknown_if(
                    ignore,
                    JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
                    true,
                    rcstr!("ignored require"),
                ),
                "import" => JsValue::unknown_if(
                    ignore,
                    JsValue::WellKnownFunction(WellKnownFunctionKind::Import),
                    true,
                    rcstr!("ignored import"),
                ),
                "Worker" => JsValue::unknown_if(
                    ignore,
                    JsValue::WellKnownFunction(WellKnownFunctionKind::WorkerConstructor),
                    true,
                    rcstr!("ignored Worker constructor"),
                ),
                "define" => JsValue::WellKnownFunction(WellKnownFunctionKind::Define),
                "URL" => JsValue::WellKnownFunction(WellKnownFunctionKind::URLConstructor),
                "process" => JsValue::WellKnownObject(WellKnownObjectKind::NodeProcessModule),
                "Object" => JsValue::WellKnownObject(WellKnownObjectKind::GlobalObject),
                "Buffer" => JsValue::WellKnownObject(WellKnownObjectKind::NodeBuffer),
                _ => v.into_unknown(true, rcstr!("unknown global")),
            },
            JsValue::Module(ref mv) => {
                if let Some(wko) = module_value_to_well_known_object(mv) {
                    wko
                } else {
                    return Ok((v, false));
                }
            }
            _ => {
                let (mut v, m1) = replace_well_known(v, compile_time_info, true).await?;
                let m2 = replace_builtin(&mut v);
                let m = m1 || m2 || v.make_nested_operations_unknown();
                return Ok((v, m));
            }
        };
        new_value.normalize_shallow();
        Ok((new_value, true))
    }
}

#[cfg(test)]
mod tests {
    use std::{mem::take, path::PathBuf, sync::Arc, time::Instant};

    use parking_lot::Mutex;
    use rustc_hash::FxHashMap;
    use swc_core::{
        common::{
            FilePathMapping, GLOBALS, Globals, Mark, SourceMap, comments::SingleThreadedComments,
        },
        ecma::{
            ast::{EsVersion, Id},
            parser::parse_file_as_program,
            transforms::base::resolver,
            visit::VisitMutWith,
        },
        testing::{NormalizedOutput, fixture},
    };
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::{ResolvedVc, TurboTasks, util::FormatDuration};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbopack_core::{
        compile_time_info::CompileTimeInfo,
        environment::{Environment, ExecutionEnvironment, NodeJsEnvironment, NodeJsVersion},
        target::{Arch, CompileTarget, Endianness, Libc, Platform},
    };

    use super::{
        JsValue,
        graph::{ConditionalKind, Effect, EffectArg, EvalContext, VarGraph, create_graph},
        linker::link,
    };
    use crate::{
        AnalyzeMode,
        analyzer::{graph::AssignmentScopes, imports::ImportAttributes},
    };

    #[fixture("tests/analyzer/graph/**/input.js")]
    fn fixture(input: PathBuf) {
        let input = RcStr::from(input.to_str().unwrap());
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async move {
            let tt = TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));
            tt.run_once(async move {
                fixture_op(input).read_strongly_consistent().await?;
                anyhow::Ok(())
            })
            .await
            .unwrap();
        });
    }

    #[turbo_tasks::function(operation, root)]
    async fn fixture_op(input: RcStr) -> anyhow::Result<()> {
        let input = PathBuf::from(input.as_str());
        let graph_snapshot_path = input.with_file_name("graph.snapshot");
        let graph_explained_snapshot_path = input.with_file_name("graph-explained.snapshot");
        let graph_effects_snapshot_path = input.with_file_name("graph-effects.snapshot");
        let resolved_explained_snapshot_path = input.with_file_name("resolved-explained.snapshot");
        let resolved_effects_snapshot_path = input.with_file_name("resolved-effects.snapshot");
        let large_marker = input.with_file_name("large");

        let cm: Arc<SourceMap> = Arc::new(SourceMap::new(FilePathMapping::empty()));
        let globals = Arc::new(Globals::new());

        // Keep all non-`Send` SWC types (`SingleThreadedComments`, `Lrc<SourceFile>`)
        // confined to this synchronous block so they don't have to cross an `.await`
        // and break the `Send` bound on `tt.run_once`'s future.
        let (eval_context, mut var_graph) = GLOBALS.set(&globals, || {
            let fm = cm.load_file(&input).unwrap();
            let comments = SingleThreadedComments::default();
            let mut m = parse_file_as_program(
                &fm,
                Default::default(),
                EsVersion::latest(),
                Some(&comments),
                &mut vec![],
            )
            .map_err(|err| anyhow::anyhow!("parse error: {err:?}"))?;

            let unresolved_mark = Mark::new();
            let top_level_mark = Mark::new();
            m.visit_mut_with(&mut resolver(unresolved_mark, top_level_mark, false));

            let eval_context = EvalContext::new(
                Some(&m),
                unresolved_mark,
                top_level_mark,
                Default::default(),
                Some(&comments),
            );

            let var_graph = create_graph(
                &m,
                &eval_context,
                AnalyzeMode::CodeGenerationAndTracing,
                true,
            );
            anyhow::Ok((eval_context, var_graph))
        })?;
        let var_cache = Default::default();

        let mut named_values = var_graph
            .values
            .clone()
            .into_iter()
            .map(|((id, ctx), value)| {
                let unique = var_graph.values.keys().filter(|(i, _)| &id == i).count() == 1;
                if unique {
                    (id.to_string(), ((id, ctx), value))
                } else {
                    (format!("{id}{ctx:?}"), ((id, ctx), value))
                }
            })
            .collect::<Vec<_>>();
        named_values.sort_by(|a, b| a.0.cmp(&b.0));

        fn explain_all<'a>(
            values: impl IntoIterator<Item = (&'a String, &'a JsValue, Option<AssignmentScopes>)>,
        ) -> String {
            values
                .into_iter()
                .map(|(id, value, assignment_scopes)| {
                    let non_root_assignments = match assignment_scopes {
                        Some(AssignmentScopes::AllInModuleEvalScope) => " (const after eval)",
                        _ => "",
                    };
                    let (explainer, hints) = value.explain(10, 5);
                    format!("{id}{non_root_assignments} = {explainer}{hints}")
                })
                .collect::<Vec<_>>()
                .join("\n\n")
        }

        {
            // Dump snapshot of graph

            let large = large_marker.exists();

            if !large {
                NormalizedOutput::from(format!(
                    "{:#?}",
                    named_values
                        .iter()
                        .map(|(name, (_, value))| (name, value))
                        .collect::<Vec<_>>()
                ))
                .compare_to_file(&graph_snapshot_path)
                .unwrap();
            }
            NormalizedOutput::from(explain_all(named_values.iter().map(
                |(name, (id, value))| {
                    (
                        name,
                        value,
                        eval_context.imports.assignment_scopes.get(id).copied(),
                    )
                },
            )))
            .compare_to_file(&graph_explained_snapshot_path)
            .unwrap();
            if !large {
                NormalizedOutput::from(format!("{:#?}", var_graph.effects))
                    .compare_to_file(&graph_effects_snapshot_path)
                    .unwrap();
            }
        }

        {
            // Dump snapshot of resolved

            let start = Instant::now();
            let mut resolved = Vec::new();
            for (name, (id, _)) in named_values.iter().cloned() {
                let start = Instant::now();
                // Ideally this would use eval_context.imports.get_attributes(span), but the
                // span isn't available here
                let (res, steps) = resolve(
                    &var_graph,
                    JsValue::Variable(id),
                    ImportAttributes::empty_ref(),
                    &var_cache,
                )
                .await;
                let time = start.elapsed();
                if time.as_millis() > 1 {
                    println!(
                        "linking {} {name} took {} in {} steps",
                        input.display(),
                        FormatDuration(time),
                        steps
                    );
                }

                resolved.push((name, res));
            }
            let time = start.elapsed();
            if time.as_millis() > 1 {
                println!("linking {} took {}", input.display(), FormatDuration(time));
            }

            let start = Instant::now();
            let explainer = explain_all(resolved.iter().map(|(name, value)| (name, value, None)));
            let time = start.elapsed();
            if time.as_millis() > 1 {
                println!(
                    "explaining {} took {}",
                    input.display(),
                    FormatDuration(time)
                );
            }

            NormalizedOutput::from(explainer)
                .compare_to_file(&resolved_explained_snapshot_path)
                .unwrap();
        }

        {
            // Dump snapshot of resolved effects

            let start = Instant::now();
            let mut resolved = Vec::new();
            let mut queue = take(&mut var_graph.effects)
                .into_iter()
                .map(|effect| (0, effect))
                .rev()
                .collect::<Vec<_>>();
            let mut i = 0;
            while let Some((parent, effect)) = queue.pop() {
                i += 1;
                let start = Instant::now();
                async fn handle_args(
                    args: Vec<EffectArg>,
                    queue: &mut Vec<(usize, Effect)>,
                    var_graph: &VarGraph,
                    var_cache: &Mutex<FxHashMap<Id, JsValue>>,
                    i: usize,
                ) -> Vec<JsValue> {
                    let mut new_args = Vec::with_capacity(args.len());
                    for arg in args {
                        match arg {
                            EffectArg::Value(v) => {
                                new_args.push(
                                    resolve(var_graph, v, ImportAttributes::empty_ref(), var_cache)
                                        .await
                                        .0,
                                );
                            }
                            EffectArg::Closure(v, effects) => {
                                new_args.push(
                                    resolve(var_graph, v, ImportAttributes::empty_ref(), var_cache)
                                        .await
                                        .0,
                                );
                                queue.extend(effects.effects.into_iter().rev().map(|e| (i, e)));
                            }
                            EffectArg::Spread => {
                                new_args.push(JsValue::unknown_empty(true, rcstr!("spread")));
                            }
                        }
                    }
                    new_args
                }
                let steps = match effect {
                    Effect::Conditional {
                        condition, kind, ..
                    } => {
                        let (condition, steps) = resolve(
                            &var_graph,
                            *condition,
                            ImportAttributes::empty_ref(),
                            &var_cache,
                        )
                        .await;
                        resolved.push((format!("{parent} -> {i} conditional"), condition));
                        match *kind {
                            ConditionalKind::If { then } => {
                                queue.extend(then.effects.into_iter().rev().map(|e| (i, e)));
                            }
                            ConditionalKind::Else { r#else } => {
                                queue.extend(r#else.effects.into_iter().rev().map(|e| (i, e)));
                            }
                            ConditionalKind::IfElse { then, r#else }
                            | ConditionalKind::Ternary { then, r#else } => {
                                queue.extend(r#else.effects.into_iter().rev().map(|e| (i, e)));
                                queue.extend(then.effects.into_iter().rev().map(|e| (i, e)));
                            }
                            ConditionalKind::IfElseMultiple { then, r#else } => {
                                for then in then {
                                    queue.extend(then.effects.into_iter().rev().map(|e| (i, e)));
                                }
                                for r#else in r#else {
                                    queue.extend(r#else.effects.into_iter().rev().map(|e| (i, e)));
                                }
                            }
                            ConditionalKind::And { expr }
                            | ConditionalKind::Or { expr }
                            | ConditionalKind::NullishCoalescing { expr }
                            | ConditionalKind::Labeled { body: expr } => {
                                queue.extend(expr.effects.into_iter().rev().map(|e| (i, e)));
                            }
                        };
                        steps
                    }
                    Effect::Call {
                        func,
                        args,
                        new,
                        span,
                        ..
                    } => {
                        let (func, steps) = resolve(
                            &var_graph,
                            *func,
                            eval_context.imports.get_attributes(span),
                            &var_cache,
                        )
                        .await;
                        let new_args =
                            handle_args(args, &mut queue, &var_graph, &var_cache, i).await;
                        resolved.push((
                            format!("{parent} -> {i} call"),
                            if new {
                                JsValue::new_from_iter(func, new_args)
                            } else {
                                JsValue::call_from_iter(func, new_args)
                            },
                        ));
                        steps
                    }
                    Effect::FreeVar { var, .. } => {
                        resolved.push((format!("{parent} -> {i} free var"), JsValue::FreeVar(var)));
                        0
                    }
                    Effect::TypeOf { arg, .. } => {
                        let (arg, steps) =
                            resolve(&var_graph, *arg, ImportAttributes::empty_ref(), &var_cache)
                                .await;
                        resolved.push((
                            format!("{parent} -> {i} typeof"),
                            JsValue::type_of(Box::new(arg)),
                        ));
                        steps
                    }
                    Effect::MemberCall {
                        obj, prop, args, ..
                    } => {
                        let (obj, obj_steps) =
                            resolve(&var_graph, *obj, ImportAttributes::empty_ref(), &var_cache)
                                .await;
                        let (prop, prop_steps) =
                            resolve(&var_graph, *prop, ImportAttributes::empty_ref(), &var_cache)
                                .await;
                        let new_args =
                            handle_args(args, &mut queue, &var_graph, &var_cache, i).await;
                        resolved.push((
                            format!("{parent} -> {i} member call"),
                            JsValue::member_call_from_iter(obj, prop, new_args),
                        ));
                        obj_steps + prop_steps
                    }
                    Effect::DynamicImport { args, .. } => {
                        let new_args =
                            handle_args(args, &mut queue, &var_graph, &var_cache, i).await;
                        resolved.push((
                            format!("{parent} -> {i} dynamic import"),
                            JsValue::call_from_iter(JsValue::FreeVar("import".into()), new_args),
                        ));
                        0
                    }
                    Effect::Unreachable { .. } => {
                        resolved.push((
                            format!("{parent} -> {i} unreachable"),
                            JsValue::unknown_empty(true, rcstr!("unreachable")),
                        ));
                        0
                    }
                    Effect::ImportMeta { .. }
                    | Effect::ImportedBinding { .. }
                    | Effect::Member { .. } => 0,
                };
                let time = start.elapsed();
                if time.as_millis() > 1 {
                    println!(
                        "linking effect {} took {} in {} steps",
                        input.display(),
                        FormatDuration(time),
                        steps
                    );
                }
            }
            let time = start.elapsed();
            if time.as_millis() > 1 {
                println!(
                    "linking effects {} took {}",
                    input.display(),
                    FormatDuration(time)
                );
            }

            let start = Instant::now();
            let explainer = explain_all(resolved.iter().map(|(name, value)| (name, value, None)));
            let time = start.elapsed();
            if time.as_millis() > 1 {
                println!(
                    "explaining effects {} took {}",
                    input.display(),
                    FormatDuration(time)
                );
            }

            NormalizedOutput::from(explainer)
                .compare_to_file(&resolved_effects_snapshot_path)
                .unwrap();
        }

        Ok(())
    }

    async fn resolve(
        var_graph: &VarGraph,
        val: JsValue,
        attributes: &ImportAttributes,
        var_cache: &Mutex<FxHashMap<Id, JsValue>>,
    ) -> (JsValue, u32) {
        // The caller (`fixture`) runs us inside `tt.run_once`, so a real
        // turbo-tasks task context is already established here.
        async {
            let compile_time_info = CompileTimeInfo::builder(
                Environment::new(ExecutionEnvironment::NodeJsLambda(
                    NodeJsEnvironment {
                        compile_target: CompileTarget {
                            arch: Arch::X64,
                            platform: Platform::Linux,
                            endianness: Endianness::Little,
                            libc: Libc::Glibc,
                        }
                        .resolved_cell(),
                        node_version: NodeJsVersion::default().resolved_cell(),
                        cwd: ResolvedVc::cell(None),
                    }
                    .resolved_cell(),
                ))
                .to_resolved()
                .await?,
            )
            .cell()
            .await?;
            link(
                var_graph,
                val,
                &super::test_utils::early_visitor,
                &(|val| {
                    Box::pin(super::test_utils::visitor(
                        val,
                        compile_time_info,
                        attributes,
                    ))
                }),
                &Default::default(),
                var_cache,
            )
            .await
        }
        .await
        .unwrap()
    }
}
