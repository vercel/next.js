use std::hash::Hash;

use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use bincode::{Decode, Encode};
use num_bigint::BigInt;
use parking_lot::Mutex;
use rustc_hash::FxHashMap;
use swc_core::common::{GLOBALS, source_map::SmallPos};
use thread_local::ThreadLocal;
use tracing::instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, ResolvedVc, TryJoinIterExt, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    compile_time_info::CompileTimeInfo,
    issue::{Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, StyledString},
    module::Module,
    reference::ModuleReference,
};

use crate::{
    AnalyzeMode, EcmascriptParsable, SpecifiedModuleType,
    analyzer::{
        Bump, BumpVec, ConstantValue, JsValue, Modified, ModuleValue, ObjectMutability, ObjectPart,
        builtin::replace_builtin, graph::create_graph, linker::link,
        well_known::replace_well_known,
    },
    directive::parse_module_turbopack_directives,
    parse::ParseResult,
    references::{early_value_visitor, esm::EsmAssetReference},
};

const STRING_INLINE_THRESHOLD: usize = 6;
const NUMBER_INLINE_THRESHOLD: f64 = 1_000_000.0;
const BIGINT_INLINE_THRESHOLD: i64 = 1_000_000;

/// Import names that are all-uppercase and contain at least one letter are eligible for automatic
/// constant inlining, even without an import attribute.
pub fn is_import_name_eligible_for_exports(name: &str) -> bool {
    let mut seen_alphabetic = false;
    for c in name.chars() {
        if !(c.is_ascii() && (!c.is_ascii_alphabetic() || c.is_uppercase())) {
            return false;
        }
        seen_alphabetic |= c.is_ascii_alphabetic();
    }
    seen_alphabetic
}

#[instrument(level = "info", skip_all, name = "determine cross-module constants")]
pub async fn module_value_to_constants_module<'a>(
    arena: &'a ThreadLocal<Bump>,
    module_value: &ModuleValue,
    compile_time_info: Vc<CompileTimeInfo>,
    import_references: &[ResolvedVc<EsmAssetReference>],
) -> Result<Option<JsValue<'a>>> {
    let Some(reference_idx) = module_value.reference else {
        bail!("missing reference for constant value");
    };

    let reference_idx = reference_idx.get();
    let import_reference = import_references
        .get(reference_idx)
        .with_context(|| format!("couldn't find import reference at index {reference_idx}"))?;

    // We are reusing the exact resolve options from EsmAssetReference here, which is good and gives
    // us side-effect-free barrel file resolving for free.
    let resolved = import_reference.resolve_reference().await?;
    let Some(module) = resolved.first_module().await? else {
        // failed to resolve, issue was already emitted by resolve_reference
        return Ok(None);
    };

    let constants = get_constants(*module, compile_time_info).await?;

    Ok(constants.as_ref().map(|constants| {
        constants.as_js_value(
            arena.get_or_default(),
            module_value
                .annotations
                .as_ref()
                .and_then(|a| a.turbopack_constants()),
        )
    }))
}

#[derive(Debug, Clone, Eq, PartialEq, NonLocalValue, TraceRawVcs, Encode, Decode)]
enum ConstantsModuleExport {
    Constant(ConstantValueBitEquality),
    NonConstant(ResolvedVc<NonConstantIssue>),
}

#[turbo_tasks::value]
#[derive(Debug)]
struct ConstantsModule {
    exports: Vec<(RcStr, ConstantsModuleExport)>,
    has_directive: bool,
}

#[turbo_tasks::value(transparent)]
#[derive(Debug)]
struct OptionConstantsModule(Option<ConstantsModule>);

impl ConstantsModule {
    pub fn as_js_value<'a>(
        &self,
        arena: &'a Bump,
        constant_annotation: Option<bool>,
    ) -> JsValue<'a> {
        let has_opt_in = constant_annotation.unwrap_or(self.has_directive);

        // This has to be
        // - mutable:false, otherwise nothing would ever be inlined, because all property accesses
        //   would be receive a `|unknown` alternative
        // - frozen:true, otherwise mutable:false would cause accesses of missing properties to be
        //   `undefined`. Because we return a JsValue::Object even if the module has only some
        //   constants exports, this would cause `import {NON_CONSTANT_EXPORT}` to be incorrectly
        //   replaced with `undefined`.
        JsValue::object_with_mutability(
            BumpVec::from_iter_in(
                arena,
                self.exports.iter().map(|(key, value)| {
                    ObjectPart::KeyValue(
                        JsValue::Constant(ConstantValue::Str(key.clone().into())),
                        match value {
                            ConstantsModuleExport::Constant(value) => {
                                if !has_opt_in {
                                    // when not having opt in, only inline short literals
                                    match &value.0 {
                                        ConstantValue::Str(s)
                                            if s.as_str().len() > STRING_INLINE_THRESHOLD =>
                                        {
                                            JsValue::unknown_empty(
                                                false,
                                                rcstr!("constant too long"),
                                            )
                                        }
                                        ConstantValue::Num(n)
                                            if n.0.abs() > NUMBER_INLINE_THRESHOLD =>
                                        {
                                            JsValue::unknown_empty(
                                                false,
                                                rcstr!("constant too long"),
                                            )
                                        }
                                        ConstantValue::BigInt(n)
                                            if **n > BigInt::from(BIGINT_INLINE_THRESHOLD)
                                                || **n < BigInt::from(-BIGINT_INLINE_THRESHOLD) =>
                                        {
                                            JsValue::unknown_empty(
                                                false,
                                                rcstr!("constant too long"),
                                            )
                                        }
                                        ConstantValue::Regex(_) => {
                                            // Regexes are literals, but they are also objects, so
                                            // have identity and aren't inlined without opt in.
                                            JsValue::unknown_empty(
                                                false,
                                                rcstr!("regex not inlined"),
                                            )
                                        }
                                        v => JsValue::Constant(v.clone()),
                                    }
                                } else {
                                    JsValue::Constant(value.0.clone())
                                }
                            }
                            ConstantsModuleExport::NonConstant(issue) => {
                                if constant_annotation == Some(true) {
                                    // If self.has_directive, then we already emitted the issue in
                                    // get_constants.
                                    issue.emit();
                                }
                                JsValue::unknown_empty(false, rcstr!("not a constant"))
                            }
                        },
                    )
                }),
            ),
            // TODO ideally this would just use ObjectMutability::Frozen.
            //
            // When not opted in, this has to stay FrozenSubset though, because when importing a
            // non-constant export, it should not be replaced with `undefined` (which is what
            // Frozen) would do.
            ObjectMutability::FrozenSubset,
        )
    }
}

#[turbo_tasks::function]
pub async fn get_constants(
    module: ResolvedVc<Box<dyn Module>>,
    compile_time_info: Vc<CompileTimeInfo>,
) -> Result<Vc<OptionConstantsModule>> {
    let Some(parseable) = ResolvedVc::try_sidecast::<Box<dyn EcmascriptParsable>>(module) else {
        // should never actually happen, there should be a "imported module is not chunkable" error
        // somewhere as well if it's truly not an Ecmascript module
        return Ok(Vc::cell(None));
    };

    let parsed = parseable.failsafe_parse().await?;
    let ParseResult::Ok {
        program,
        eval_context,
        globals,
        ..
    } = &*parsed
    else {
        // The `parse` call has already emitted parse issues in case of `ParseResult::Unparsable`
        return Ok(Vc::cell(None));
    };

    let directives = parse_module_turbopack_directives(program);

    let arena = ThreadLocal::new();

    let var_graph = {
        let supports_block_scoping = *compile_time_info
            .environment()
            .runtime_versions()
            .supports_block_scoping()
            .await?;
        let _span = tracing::trace_span!("analyze variable values").entered();
        GLOBALS.set(globals, || {
            create_graph(
                arena.get_or_default(),
                program,
                eval_context,
                AnalyzeMode::Tracing,
                supports_block_scoping,
                // This is currently ignored with cjs_tree_shaking:false
                SpecifiedModuleType::Automatic,
                // TODO enable CJS tree shaking here
                false,
                // TODO enable CJS scope hoisting here
                false,
            )
        })
    };

    let fun_args_values = Mutex::new(FxHashMap::default());
    let var_cache = Mutex::new(FxHashMap::default());

    let compile_time_info_ref = compile_time_info.await?;

    let exports = eval_context
        .imports
        .exports_ids
        .iter()
        .map(async |(export_name, (binding, span))| {
            let value = GLOBALS.set(globals, || {
                eval_context.eval_id(arena.get_or_default(), binding.clone())
            });

            let linked_value = link(
                &arena,
                &var_graph,
                value.clone_in(arena.get_or_default()),
                &|value| early_value_visitor(&arena, value),
                &async |v| {
                    if let [Some((name, _))] = &*v.get_definable_name(Some(&var_graph))
                        && let Some(value) = compile_time_info_ref.defines.get(name).await?
                    {
                        return Ok((
                            JsValue::from_compile_time_define_value_in(
                                arena.get_or_default(),
                                &value,
                            )?,
                            Modified::Yes,
                        ));
                    }

                    // This is basically what's necessary to support imports in constant modules.
                    // It's just that you'd need `get_constants_inner` which is not a turbotask (and
                    // contains the logic of the current get_constants function). So that would redo
                    // a small amount of work but would allow imports.
                    //
                    // TODO when opted in, also resolve imports
                    // if directives.constants_module
                    //     && let JsValue::Module(module) = &v
                    // {
                    //     // We can't do a recursive turbotask call here, to prevent deadlocks.
                    //     if let Some(constants) =
                    //         get_constants(resolve_somehow(module), compile_time_info)
                    //             .await?
                    //             .as_ref()
                    //     {
                    //         return Ok((constants.as_js_value(false), true));
                    //     }
                    // }

                    let (mut v, mut modified) =
                        replace_well_known(&arena, v, compile_time_info, false).await?;
                    if replace_builtin(arena.get_or_default(), &mut v).is_modified() {
                        modified = Modified::Yes;
                    }
                    if !modified.is_modified() {
                        modified = Modified::from(v.make_nested_operations_unknown());
                    }
                    Ok((v, modified))
                },
                &fun_args_values,
                &var_cache,
            )
            .await?;

            if let JsValue::Constant(constant) = linked_value.0 {
                Ok((
                    export_name.as_str().into(),
                    ConstantsModuleExport::Constant(ConstantValueBitEquality(constant)),
                ))
            } else {
                let explained = linked_value.0.explain(10, 5);
                let issue = NonConstantIssue::new(
                    export_name.as_str().into(),
                    module.ident().await?.path.clone(),
                    module.source().await?.map(|source| {
                        IssueSource::from_swc_offsets(source, span.lo.to_u32(), span.hi.to_u32())
                    }),
                    (explained.0.into(), explained.1.into()),
                )
                .to_resolved()
                .await?;
                if directives.constants_module {
                    issue.emit();
                }
                Ok((
                    export_name.as_str().into(),
                    ConstantsModuleExport::NonConstant(issue),
                ))
            }
        })
        .try_join()
        .await?;

    Ok(Vc::cell(Some(ConstantsModule {
        exports,
        has_directive: directives.constants_module,
    })))
}

#[turbo_tasks::value]
struct NonConstantIssue {
    export: RcStr,
    file_path: FileSystemPath,
    source: Option<IssueSource>,
    value: (RcStr, RcStr),
}

#[turbo_tasks::value_impl]
impl NonConstantIssue {
    #[turbo_tasks::function]
    fn new(
        export: RcStr,
        file_path: FileSystemPath,
        source: Option<IssueSource>,
        value: (RcStr, RcStr),
    ) -> Vc<Self> {
        Self {
            export,
            file_path,
            source,
            value,
        }
        .cell()
    }
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for NonConstantIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Line(vec![
            StyledString::Text(rcstr!("Export ")),
            StyledString::Code(self.export.clone()),
            StyledString::Text(rcstr!(" is not a constant")),
        ]))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Analysis
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.file_path.clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Stack(
            [
                Some(StyledString::Line(vec![
                    StyledString::Text(rcstr!("It was analyzed to be ")),
                    StyledString::Code(self.value.0.clone()),
                ])),
                (!self.value.1.is_empty())
                    .then(|| StyledString::Line(vec![StyledString::Code(self.value.1.clone())])),
                Some(StyledString::Line(vec![
                    StyledString::Text(rcstr!(
                        "It has to be a constant because the module contains "
                    )),
                    StyledString::Code(rcstr!("use turbopack: constants")),
                    StyledString::Text(rcstr!(" or was imported with ")),
                    StyledString::Code(rcstr!("with {turbopackConstants: 'true'}")),
                ])),
            ]
            .into_iter()
            .flatten()
            .collect(),
        )))
    }

    fn source(&self) -> Option<IssueSource> {
        self.source
    }
}

#[derive(Debug, Clone, Default, TraceRawVcs, Encode, Decode, NonLocalValue)]
struct ConstantValueBitEquality(ConstantValue);

impl PartialEq for ConstantValueBitEquality {
    fn eq(&self, other: &Self) -> bool {
        match (&self.0, &other.0) {
            (ConstantValue::Undefined, ConstantValue::Undefined)
            | (ConstantValue::Null, ConstantValue::Null)
            | (ConstantValue::True, ConstantValue::True)
            | (ConstantValue::False, ConstantValue::False) => true,
            (ConstantValue::Num(l), ConstantValue::Num(r)) => {
                l.0.to_le_bytes() == r.0.to_le_bytes()
            }
            (ConstantValue::BigInt(l), ConstantValue::BigInt(r)) => l == r,
            (ConstantValue::Str(l), ConstantValue::Str(r)) => l == r,
            (ConstantValue::Regex(l), ConstantValue::Regex(r)) => l == r,
            _ => false,
        }
    }
}
impl Eq for ConstantValueBitEquality {}

impl Hash for ConstantValueBitEquality {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        std::mem::discriminant(&self.0).hash(state);
        match &self.0 {
            ConstantValue::Undefined => {}
            ConstantValue::Null => {}
            ConstantValue::True => {}
            ConstantValue::False => {}
            ConstantValue::Num(n) => n.0.to_le_bytes().hash(state),
            ConstantValue::BigInt(n) => n.hash(state),
            ConstantValue::Str(s) => s.hash(state),
            ConstantValue::Regex(r) => r.hash(state),
        }
    }
}
