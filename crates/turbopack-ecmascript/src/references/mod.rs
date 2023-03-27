pub mod amd;
pub mod cjs;
pub mod constant_condition;
pub mod esm;
pub mod node;
pub mod pattern_mapping;
pub mod raw;
pub mod typescript;
pub mod unreachable;
pub mod util;

use std::{
    borrow::Cow,
    collections::{BTreeMap, HashMap},
    future::Future,
    mem::take,
    pin::Pin,
    sync::Arc,
};

use anyhow::Result;
use constant_condition::{ConstantConditionValue, ConstantConditionVc};
use indexmap::IndexSet;
use lazy_static::lazy_static;
use parking_lot::Mutex;
use regex::Regex;
use swc_core::{
    common::{
        comments::CommentKind,
        errors::{DiagnosticId, Handler, HANDLER},
        pass::AstNodePath,
        Span, Spanned, GLOBALS,
    },
    ecma::{
        ast::*,
        visit::{AstParentKind, AstParentNodeRef, VisitAstPath, VisitWithPath},
    },
};
use turbo_tasks::{primitives::BoolVc, TryJoinIterExt, Value};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetVc},
    compile_time_info::CompileTimeInfoVc,
    reference::{AssetReferenceVc, AssetReferencesVc, SourceMapReferenceVc},
    reference_type::{CommonJsReferenceSubType, ReferenceType},
    resolve::{
        find_context_file,
        origin::{ResolveOrigin, ResolveOriginVc},
        package_json,
        parse::RequestVc,
        pattern::Pattern,
        resolve, FindContextFileResult, ModulePartVc, PrimaryResolveResult,
    },
};
use turbopack_swc_utils::emitter::IssueEmitter;
use unreachable::UnreachableVc;

use self::{
    amd::{
        AmdDefineAssetReferenceVc, AmdDefineDependencyElement, AmdDefineFactoryType,
        AmdDefineWithDependenciesCodeGenVc,
    },
    cjs::CjsAssetReferenceVc,
    esm::{
        export::EsmExport, EsmAssetReferenceVc, EsmAsyncAssetReferenceVc, EsmExports,
        EsmModuleItemVc, ImportMetaBindingVc, ImportMetaRefVc, UrlAssetReferenceVc,
    },
    node::{DirAssetReferenceVc, PackageJsonReferenceVc},
    raw::SourceAssetReferenceVc,
    typescript::{
        TsConfigReferenceVc, TsReferencePathAssetReferenceVc, TsReferenceTypeAssetReferenceVc,
    },
};
use super::{
    analyzer::{
        builtin::replace_builtin,
        graph::{create_graph, Effect},
        linker::link,
        well_known::replace_well_known,
        FreeVarKind, JsValue, ObjectPart, WellKnownFunctionKind, WellKnownObjectKind,
    },
    errors,
    parse::{parse, ParseResult},
    resolve::{apply_cjs_specific_options, cjs_resolve},
    special_cases::special_cases,
    utils::js_value_to_pattern,
    webpack::{
        parse::{webpack_runtime, WebpackRuntime, WebpackRuntimeVc},
        WebpackChunkAssetReference, WebpackEntryAssetReference, WebpackRuntimeAssetReference,
    },
    EcmascriptModuleAssetType,
};
use crate::{
    analyzer::{
        builtin::early_replace_builtin,
        graph::{ConditionalKind, EffectArg, EvalContext},
        imports::{ImportedSymbol, Reexport},
        ModuleValue,
    },
    chunk::{EcmascriptExports, EcmascriptExportsVc},
    code_gen::{
        CodeGen, CodeGenerateableVc, CodeGenerateableWithAvailabilityInfoVc, CodeGenerateablesVc,
    },
    magic_identifier,
    references::{
        cjs::{
            CjsRequireAssetReferenceVc, CjsRequireCacheAccess, CjsRequireResolveAssetReferenceVc,
        },
        esm::{module_id::EsmModuleIdAssetReferenceVc, EsmBindingVc, EsmExportsVc},
    },
    tree_shake::{part_of_module, split},
    typescript::resolve::tsconfig,
    EcmascriptInputTransformsVc, EcmascriptOptions,
};

#[turbo_tasks::value(shared)]
pub struct AnalyzeEcmascriptModuleResult {
    pub references: AssetReferencesVc,
    pub code_generation: CodeGenerateablesVc,
    pub exports: EcmascriptExportsVc,
    /// `true` when the analysis was successful.
    pub successful: bool,
}

#[turbo_tasks::value_impl]
impl AnalyzeEcmascriptModuleResultVc {
    #[turbo_tasks::function]
    pub async fn needs_availability_info(self) -> Result<BoolVc> {
        let AnalyzeEcmascriptModuleResult {
            references,
            code_generation,
            ..
        } = &*self.await?;
        for c in code_generation.await?.iter() {
            if matches!(c, CodeGen::CodeGenerateableWithAvailabilityInfo(..)) {
                return Ok(BoolVc::cell(true));
            }
        }
        for r in references.await?.iter() {
            if CodeGenerateableWithAvailabilityInfoVc::resolve_from(r)
                .await?
                .is_some()
            {
                return Ok(BoolVc::cell(true));
            }
        }
        return Ok(BoolVc::cell(false));
    }
}

/// A temporary analysis result builder to pass around, to be turned into an
/// `AnalyzeEcmascriptModuleResultVc` eventually.
pub(crate) struct AnalyzeEcmascriptModuleResultBuilder {
    references: Vec<AssetReferenceVc>,
    code_gens: Vec<CodeGen>,
    exports: EcmascriptExports,
    successful: bool,
}

impl AnalyzeEcmascriptModuleResultBuilder {
    pub fn new() -> Self {
        Self {
            references: Vec::new(),
            code_gens: Vec::new(),
            exports: EcmascriptExports::None,
            successful: false,
        }
    }

    /// Adds an asset reference to the analysis result.
    pub fn add_reference<R>(&mut self, reference: R)
    where
        R: Into<AssetReferenceVc>,
    {
        self.references.push(reference.into());
    }

    /// Adds a codegen to the analysis result.
    pub fn add_code_gen<C>(&mut self, code_gen: C)
    where
        C: Into<CodeGenerateableVc>,
    {
        self.code_gens
            .push(CodeGen::CodeGenerateable(code_gen.into()));
    }

    /// Adds a codegen to the analysis result.
    pub fn add_code_gen_with_availability_info<C>(&mut self, code_gen: C)
    where
        C: Into<CodeGenerateableWithAvailabilityInfoVc>,
    {
        self.code_gens
            .push(CodeGen::CodeGenerateableWithAvailabilityInfo(
                code_gen.into(),
            ));
    }
    /// Sets the analysis result ES export.
    pub fn set_exports(&mut self, exports: EcmascriptExports) {
        self.exports = exports;
    }

    /// Sets whether the analysis was successful.
    pub fn set_successful(&mut self, successful: bool) {
        self.successful = successful;
    }

    /// Builds the final analysis result. Resolves internal Vcs for performance
    /// in using them.
    pub async fn build(mut self) -> Result<AnalyzeEcmascriptModuleResultVc> {
        for r in self.references.iter_mut() {
            *r = r.resolve().await?;
        }
        for c in self.code_gens.iter_mut() {
            match c {
                CodeGen::CodeGenerateable(c) => {
                    *c = c.resolve().await?;
                }
                CodeGen::CodeGenerateableWithAvailabilityInfo(c) => {
                    *c = c.resolve().await?;
                }
            }
        }
        Ok(AnalyzeEcmascriptModuleResultVc::cell(
            AnalyzeEcmascriptModuleResult {
                references: AssetReferencesVc::cell(self.references),
                code_generation: CodeGenerateablesVc::cell(self.code_gens),
                exports: self.exports.into(),
                successful: self.successful,
            },
        ))
    }
}

impl Default for AnalyzeEcmascriptModuleResultBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[turbo_tasks::function]
pub(crate) async fn analyze_ecmascript_module(
    source: AssetVc,
    origin: ResolveOriginVc,
    ty: Value<EcmascriptModuleAssetType>,
    transforms: EcmascriptInputTransformsVc,
    options: Value<EcmascriptOptions>,
    compile_time_info: CompileTimeInfoVc,
    part: Option<ModulePartVc>,
) -> Result<AnalyzeEcmascriptModuleResultVc> {
    let mut analysis = AnalyzeEcmascriptModuleResultBuilder::new();
    let path = origin.origin_path();

    // Is this a typescript file that requires analzying type references?
    let analyze_types = match &*ty {
        EcmascriptModuleAssetType::TypescriptWithTypes
        | EcmascriptModuleAssetType::TypescriptDeclaration => true,
        EcmascriptModuleAssetType::Typescript | EcmascriptModuleAssetType::Ecmascript => false,
    };

    let parsed = if let Some(part) = part {
        let parsed = parse(source, ty, transforms);
        let split_data = split(path, parsed);
        part_of_module(split_data, part)
    } else {
        parse(source, ty, transforms)
    };

    match &*find_context_file(path.parent(), package_json()).await? {
        FindContextFileResult::Found(package_json, _) => {
            analysis.add_reference(PackageJsonReferenceVc::new(*package_json));
        }
        FindContextFileResult::NotFound(_) => {}
    };

    if analyze_types {
        match &*find_context_file(path.parent(), tsconfig()).await? {
            FindContextFileResult::Found(tsconfig, _) => {
                analysis.add_reference(TsConfigReferenceVc::new(origin, *tsconfig));
            }
            FindContextFileResult::NotFound(_) => {}
        };
    }

    special_cases(&path.await?.path, &mut analysis);

    let parsed = parsed.await?;

    match &*parsed {
        ParseResult::Ok {
            program,
            globals,
            eval_context,
            comments,
            source_map,
            ..
        } => {
            let mut import_references = Vec::new();

            let pos = program.span().lo;
            if analyze_types {
                if let Some(comments) = comments.leading.get(&pos) {
                    for comment in comments.iter() {
                        if let CommentKind::Line = comment.kind {
                            lazy_static! {
                                static ref REFERENCE_PATH: Regex = Regex::new(
                                    r#"^/\s*<reference\s*path\s*=\s*["'](.+)["']\s*/>\s*$"#
                                )
                                .unwrap();
                                static ref REFERENCE_TYPES: Regex = Regex::new(
                                    r#"^/\s*<reference\s*types\s*=\s*["'](.+)["']\s*/>\s*$"#
                                )
                                .unwrap();
                            }
                            let text = &comment.text;
                            if let Some(m) = REFERENCE_PATH.captures(text) {
                                let path = &m[1];
                                analysis.add_reference(TsReferencePathAssetReferenceVc::new(
                                    origin,
                                    path.to_string(),
                                ));
                            } else if let Some(m) = REFERENCE_TYPES.captures(text) {
                                let types = &m[1];
                                analysis.add_reference(TsReferenceTypeAssetReferenceVc::new(
                                    origin,
                                    types.to_string(),
                                ));
                            }
                        }
                    }
                }
            }
            comments.trailing.iter().for_each(|r| {
                r.value().iter().for_each(|comment| match comment.kind {
                    CommentKind::Line => {
                        lazy_static! {
                            static ref SOURCE_MAP_FILE_REFERENCE: Regex =
                                Regex::new(r#"# sourceMappingURL=(.*?\.map)$"#).unwrap();
                        }
                        if let Some(m) = SOURCE_MAP_FILE_REFERENCE.captures(&comment.text) {
                            let path = &m[1];
                            // TODO this probably needs to be a field in EcmascriptModuleAsset so it
                            // knows to use that SourceMap when running code generation.
                            // The reference is needed too for turbotrace
                            let origin_path = origin.origin_path();
                            analysis.add_reference(SourceMapReferenceVc::new(
                                origin_path,
                                origin_path.parent().join(path),
                            ))
                        }
                    }
                    CommentKind::Block => {}
                });
            });

            let handler = Handler::with_emitter(
                true,
                false,
                box IssueEmitter {
                    source,
                    source_map: source_map.clone(),
                    title: None,
                },
            );
            let var_graph = HANDLER.set(&handler, || {
                GLOBALS.set(globals, || create_graph(program, eval_context))
            });

            for r in eval_context.imports.references() {
                let r = EsmAssetReferenceVc::new(
                    origin,
                    RequestVc::parse(Value::new(r.module_path.to_string().into())),
                    Value::new(r.annotations.clone()),
                    if options.import_parts {
                        match &r.imported_symbol {
                            ImportedSymbol::ModuleEvaluation => {
                                Some(ModulePartVc::module_evaluation())
                            }
                            ImportedSymbol::Symbol(name) => {
                                Some(ModulePartVc::export(name.to_string()))
                            }
                            ImportedSymbol::Namespace => None,
                        }
                    } else {
                        None
                    },
                );
                import_references.push(r);
            }

            for r in import_references.iter_mut() {
                // Resolving these references here avoids many resolve wrapper tasks when
                // passing that to other turbo tasks functions later.
                *r = r.resolve().await?;
            }
            // Avoid adding duplicate references to the analysis
            for r in import_references.iter().collect::<IndexSet<_>>() {
                analysis.add_reference(*r);
            }

            let (
                mut var_graph,
                webpack_runtime,
                webpack_entry,
                webpack_chunks,
                esm_exports,
                esm_star_exports,
            ) = HANDLER.set(&handler, || {
                GLOBALS.set(globals, || {
                    // TODO migrate to effects
                    let mut visitor = AssetReferencesVisitor::new(
                        eval_context,
                        &import_references,
                        &mut analysis,
                    );

                    for (i, reexport) in eval_context.imports.reexports() {
                        let import_ref = import_references[i];
                        match reexport {
                            Reexport::Star => {
                                visitor.esm_star_exports.push(import_ref);
                            }
                            Reexport::Namespace { exported: n } => {
                                visitor.esm_exports.insert(
                                    n.to_string(),
                                    EsmExport::ImportedNamespace(import_ref),
                                );
                            }
                            Reexport::Named {
                                imported: i,
                                exported: e,
                            } => {
                                visitor.esm_exports.insert(
                                    e.to_string(),
                                    EsmExport::ImportedBinding(import_ref, i.to_string()),
                                );
                            }
                        }
                    }

                    program.visit_with_path(&mut visitor, &mut Default::default());

                    (
                        var_graph,
                        visitor.webpack_runtime,
                        visitor.webpack_entry,
                        visitor.webpack_chunks,
                        visitor.esm_exports,
                        visitor.esm_star_exports,
                    )
                })
            });

            let mut ignore_effect_span = None;
            // Check if it was a webpack entry
            if let Some((request, span)) = webpack_runtime {
                let request = RequestVc::parse(Value::new(request.into()));
                let runtime = resolve_as_webpack_runtime(origin, request, transforms);
                match &*runtime.await? {
                    WebpackRuntime::Webpack5 { .. } => {
                        ignore_effect_span = Some(span);
                        analysis.add_reference(
                            WebpackRuntimeAssetReference {
                                origin,
                                request,
                                runtime,
                                transforms,
                            }
                            .cell(),
                        );
                        if webpack_entry {
                            analysis.add_reference(
                                WebpackEntryAssetReference {
                                    source,
                                    runtime,
                                    transforms,
                                }
                                .cell(),
                            );
                        }
                        for chunk in webpack_chunks {
                            analysis.add_reference(
                                WebpackChunkAssetReference {
                                    chunk_id: chunk,
                                    runtime,
                                    transforms,
                                }
                                .cell(),
                            );
                        }
                    }
                    WebpackRuntime::None => {}
                }
            }

            let exports = if !esm_exports.is_empty() || !esm_star_exports.is_empty() {
                let esm_exports: EsmExportsVc = EsmExports {
                    exports: esm_exports,
                    star_exports: esm_star_exports,
                }
                .into();
                analysis.add_code_gen(esm_exports);
                EcmascriptExports::EsmExports(esm_exports)
            } else if has_cjs_export(program) {
                EcmascriptExports::CommonJs
            } else {
                EcmascriptExports::None
            };

            analysis.set_exports(exports);

            fn handle_call_boxed<
                'a,
                FF: Future<Output = Result<JsValue>> + Send + 'a,
                F: Fn(JsValue) -> FF + Sync + 'a,
                G: Fn(Vec<Effect>) + Send + Sync + 'a,
            >(
                handler: &'a Handler,
                source: AssetVc,
                origin: ResolveOriginVc,
                ast_path: &'a [AstParentKind],
                span: Span,
                func: JsValue,
                this: JsValue,
                args: Vec<EffectArg>,
                link_value: &'a F,
                add_effects: &'a G,
                analysis: &'a mut AnalyzeEcmascriptModuleResultBuilder,
                compile_time_info: CompileTimeInfoVc,
            ) -> Pin<Box<dyn Future<Output = Result<()>> + Send + 'a>> {
                Box::pin(handle_call(
                    handler,
                    source,
                    origin,
                    ast_path,
                    span,
                    func,
                    this,
                    args,
                    link_value,
                    add_effects,
                    analysis,
                    compile_time_info,
                ))
            }

            async fn handle_call<
                FF: Future<Output = Result<JsValue>> + Send,
                F: Fn(JsValue) -> FF + Sync,
                G: Fn(Vec<Effect>) + Send + Sync,
            >(
                handler: &Handler,
                source: AssetVc,
                origin: ResolveOriginVc,
                ast_path: &[AstParentKind],
                span: Span,
                func: JsValue,
                this: JsValue,
                args: Vec<EffectArg>,
                link_value: &F,
                add_effects: &G,
                analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
                compile_time_info: CompileTimeInfoVc,
            ) -> Result<()> {
                fn explain_args(args: &[JsValue]) -> (String, String) {
                    JsValue::explain_args(args, 10, 2)
                }
                let linked_args = |args: Vec<EffectArg>| async move {
                    args.into_iter()
                        .map(|arg| {
                            let add_effects = &add_effects;
                            async move {
                                let value = match arg {
                                    EffectArg::Value(value) => value,
                                    EffectArg::Closure(value, block) => {
                                        add_effects(block.effects);
                                        value
                                    }
                                    EffectArg::Spread => {
                                        JsValue::Unknown(None, "spread is not supported yet")
                                    }
                                };
                                link_value(value).await
                            }
                        })
                        .try_join()
                        .await
                };
                match func {
                    JsValue::Alternatives(_, alts) => {
                        for alt in alts {
                            handle_call_boxed(
                                handler,
                                source,
                                origin,
                                ast_path,
                                span,
                                alt,
                                this.clone(),
                                args.clone(),
                                link_value,
                                add_effects,
                                analysis,
                                compile_time_info,
                            )
                            .await?;
                        }
                    }
                    JsValue::WellKnownFunction(WellKnownFunctionKind::Import) => {
                        let args = linked_args(args).await?;
                        if args.len() == 1 {
                            let pat = js_value_to_pattern(&args[0]);
                            if !pat.has_constant_parts() {
                                let (args, hints) = explain_args(&args);
                                handler.span_warn_with_code(
                                    span,
                                    &format!("import({args}) is very dynamic{hints}",),
                                    DiagnosticId::Lint(
                                        errors::failed_to_analyse::ecmascript::DYNAMIC_IMPORT
                                            .to_string(),
                                    ),
                                )
                            }
                            analysis.add_reference(EsmAsyncAssetReferenceVc::new(
                                origin,
                                RequestVc::parse(Value::new(pat)),
                                AstPathVc::cell(ast_path.to_vec()),
                            ));
                            return Ok(());
                        }
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            span,
                            &format!("import({args}) is not statically analyse-able{hints}",),
                            DiagnosticId::Error(
                                errors::failed_to_analyse::ecmascript::DYNAMIC_IMPORT.to_string(),
                            ),
                        )
                    }
                    JsValue::WellKnownFunction(WellKnownFunctionKind::Require) => {
                        let args = linked_args(args).await?;
                        if args.len() == 1 {
                            let pat = js_value_to_pattern(&args[0]);
                            if !pat.has_constant_parts() {
                                let (args, hints) = explain_args(&args);
                                handler.span_warn_with_code(
                                    span,
                                    &format!("require({args}) is very dynamic{hints}",),
                                    DiagnosticId::Lint(
                                        errors::failed_to_analyse::ecmascript::REQUIRE.to_string(),
                                    ),
                                )
                            }
                            analysis.add_reference(CjsRequireAssetReferenceVc::new(
                                origin,
                                RequestVc::parse(Value::new(pat)),
                                AstPathVc::cell(ast_path.to_vec()),
                            ));
                            return Ok(());
                        }
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            span,
                            &format!("require({args}) is not statically analyse-able{hints}",),
                            DiagnosticId::Error(
                                errors::failed_to_analyse::ecmascript::REQUIRE.to_string(),
                            ),
                        )
                    }
                    JsValue::WellKnownFunction(WellKnownFunctionKind::Define) => {
                        analyze_amd_define(
                            analysis,
                            origin,
                            handler,
                            span,
                            ast_path,
                            linked_args(args).await?,
                        );
                    }

                    JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve) => {
                        let args = linked_args(args).await?;
                        if args.len() == 1 {
                            let pat = js_value_to_pattern(&args[0]);
                            if !pat.has_constant_parts() {
                                let (args, hints) = explain_args(&args);
                                handler.span_warn_with_code(
                                    span,
                                    &format!("require.resolve({args}) is very dynamic{hints}",),
                                    DiagnosticId::Lint(
                                        errors::failed_to_analyse::ecmascript::REQUIRE_RESOLVE
                                            .to_string(),
                                    ),
                                )
                            }
                            analysis.add_reference(CjsRequireResolveAssetReferenceVc::new(
                                origin,
                                RequestVc::parse(Value::new(pat)),
                                AstPathVc::cell(ast_path.to_vec()),
                            ));
                            return Ok(());
                        }
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            span,
                            &format!(
                                "require.resolve({args}) is not statically analyse-able{hints}",
                            ),
                            DiagnosticId::Error(
                                errors::failed_to_analyse::ecmascript::REQUIRE_RESOLVE.to_string(),
                            ),
                        )
                    }

                    JsValue::WellKnownFunction(WellKnownFunctionKind::FsReadMethod(name)) => {
                        let args = linked_args(args).await?;
                        if !args.is_empty() {
                            let pat = js_value_to_pattern(&args[0]);
                            if !pat.has_constant_parts() {
                                let (args, hints) = explain_args(&args);
                                handler.span_warn_with_code(
                                    span,
                                    &format!("fs.{name}({args}) is very dynamic{hints}",),
                                    DiagnosticId::Lint(
                                        errors::failed_to_analyse::ecmascript::FS_METHOD
                                            .to_string(),
                                    ),
                                )
                            }
                            analysis.add_reference(SourceAssetReferenceVc::new(source, pat.into()));
                            return Ok(());
                        }
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            span,
                            &format!("fs.{name}({args}) is not statically analyse-able{hints}",),
                            DiagnosticId::Error(
                                errors::failed_to_analyse::ecmascript::FS_METHOD.to_string(),
                            ),
                        )
                    }

                    JsValue::WellKnownFunction(WellKnownFunctionKind::PathResolve(..)) => {
                        let parent_path = origin.origin_path().parent().await?;
                        let args = linked_args(args).await?;

                        let linked_func_call = link_value(JsValue::call(
                            box JsValue::WellKnownFunction(WellKnownFunctionKind::PathResolve(
                                box parent_path.path.as_str().into(),
                            )),
                            args.clone(),
                        ))
                        .await?;

                        let pat = js_value_to_pattern(&linked_func_call);
                        if !pat.has_constant_parts() {
                            let (args, hints) = explain_args(&args);
                            handler.span_warn_with_code(
                                span,
                                &format!("path.resolve({args}) is very dynamic{hints}",),
                                DiagnosticId::Lint(
                                    errors::failed_to_analyse::ecmascript::PATH_METHOD.to_string(),
                                ),
                            )
                        }
                        analysis.add_reference(SourceAssetReferenceVc::new(source, pat.into()));
                        return Ok(());
                    }

                    JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin) => {
                        let args = linked_args(args).await?;
                        let linked_func_call = link_value(JsValue::call(
                            box JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin),
                            args.clone(),
                        ))
                        .await?;
                        let pat = js_value_to_pattern(&linked_func_call);
                        if !pat.has_constant_parts() {
                            let (args, hints) = explain_args(&args);
                            handler.span_warn_with_code(
                                span,
                                &format!("path.join({args}) is very dynamic{hints}",),
                                DiagnosticId::Lint(
                                    errors::failed_to_analyse::ecmascript::PATH_METHOD.to_string(),
                                ),
                            )
                        }
                        analysis.add_reference(DirAssetReferenceVc::new(source, pat.into()));
                        return Ok(());
                    }
                    JsValue::WellKnownFunction(WellKnownFunctionKind::ChildProcessSpawnMethod(
                        name,
                    )) => {
                        let args = linked_args(args).await?;
                        if !args.is_empty() {
                            let mut show_dynamic_warning = false;
                            let pat = js_value_to_pattern(&args[0]);
                            if pat.is_match("node") && args.len() >= 2 {
                                let first_arg =
                                    JsValue::member(box args[1].clone(), box 0_f64.into());
                                let first_arg = link_value(first_arg).await?;
                                let pat = js_value_to_pattern(&first_arg);
                                if !pat.has_constant_parts() {
                                    show_dynamic_warning = true;
                                }
                                analysis.add_reference(CjsAssetReferenceVc::new(
                                    origin,
                                    RequestVc::parse(Value::new(pat)),
                                ));
                            }
                            if show_dynamic_warning || !pat.has_constant_parts() {
                                let (args, hints) = explain_args(&args);
                                handler.span_warn_with_code(
                                    span,
                                    &format!("child_process.{name}({args}) is very dynamic{hints}",),
                                    DiagnosticId::Lint(
                                        errors::failed_to_analyse::ecmascript::CHILD_PROCESS_SPAWN
                                            .to_string(),
                                    ),
                                );
                            }
                            analysis.add_reference(SourceAssetReferenceVc::new(source, pat.into()));
                            return Ok(());
                        }
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            span,
                            &format!(
                                "child_process.{name}({args}) is not statically \
                                 analyse-able{hints}",
                            ),
                            DiagnosticId::Error(
                                errors::failed_to_analyse::ecmascript::CHILD_PROCESS_SPAWN
                                    .to_string(),
                            ),
                        )
                    }
                    JsValue::WellKnownFunction(WellKnownFunctionKind::ChildProcessFork) => {
                        let args = linked_args(args).await?;
                        if !args.is_empty() {
                            let first_arg = &args[0];
                            let pat = js_value_to_pattern(first_arg);
                            if !pat.has_constant_parts() {
                                let (args, hints) = explain_args(&args);
                                handler.span_warn_with_code(
                                    span,
                                    &format!("child_process.fork({args}) is very dynamic{hints}",),
                                    DiagnosticId::Lint(
                                        errors::failed_to_analyse::ecmascript::CHILD_PROCESS_SPAWN
                                            .to_string(),
                                    ),
                                );
                            }
                            analysis.add_reference(CjsAssetReferenceVc::new(
                                origin,
                                RequestVc::parse(Value::new(pat)),
                            ));
                            return Ok(());
                        }
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            span,
                            &format!(
                                "child_process.fork({args}) is not statically analyse-able{hints}",
                            ),
                            DiagnosticId::Error(
                                errors::failed_to_analyse::ecmascript::CHILD_PROCESS_SPAWN
                                    .to_string(),
                            ),
                        )
                    }
                    JsValue::WellKnownFunction(WellKnownFunctionKind::NodePreGypFind) => {
                        use crate::resolve::node_native_binding::NodePreGypConfigReferenceVc;

                        let args = linked_args(args).await?;
                        if args.len() == 1 {
                            let first_arg = &args[0];
                            let pat = js_value_to_pattern(first_arg);
                            if !pat.has_constant_parts() {
                                let (args, hints) = explain_args(&args);
                                handler.span_warn_with_code(
                                    span,
                                    &format!("node-pre-gyp.find({args}) is very dynamic{hints}",),
                                    DiagnosticId::Lint(
                                        errors::failed_to_analyse::ecmascript::NODE_PRE_GYP_FIND
                                            .to_string(),
                                    ),
                                );
                                return Ok(());
                            }
                            analysis.add_reference(NodePreGypConfigReferenceVc::new(
                                origin.origin_path().parent(),
                                pat.into(),
                                compile_time_info.environment().compile_target(),
                            ));
                            return Ok(());
                        }
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            span,
                            &format!(
                                "require('@mapbox/node-pre-gyp').find({args}) is not statically \
                                 analyse-able{hints}",
                            ),
                            DiagnosticId::Error(
                                errors::failed_to_analyse::ecmascript::NODE_PRE_GYP_FIND
                                    .to_string(),
                            ),
                        )
                    }
                    JsValue::WellKnownFunction(WellKnownFunctionKind::NodeGypBuild) => {
                        use crate::resolve::node_native_binding::NodeGypBuildReferenceVc;

                        let args = linked_args(args).await?;
                        if args.len() == 1 {
                            let first_arg = link_value(args[0].clone()).await?;
                            if let Some(s) = first_arg.as_str() {
                                // TODO this resolving should happen within NodeGypBuildReferenceVc
                                let current_context = origin
                                    .origin_path()
                                    .root()
                                    .join(s.trim_start_matches("/ROOT/"));
                                analysis.add_reference(NodeGypBuildReferenceVc::new(
                                    current_context,
                                    compile_time_info.environment().compile_target(),
                                ));
                                return Ok(());
                            }
                        }
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            span,
                            &format!(
                                "require('node-gyp-build')({args}) is not statically \
                                 analyse-able{hints}",
                            ),
                            DiagnosticId::Error(
                                errors::failed_to_analyse::ecmascript::NODE_GYP_BUILD.to_string(),
                            ),
                        )
                    }
                    JsValue::WellKnownFunction(WellKnownFunctionKind::NodeBindings) => {
                        use crate::resolve::node_native_binding::NodeBindingsReferenceVc;

                        let args = linked_args(args).await?;
                        if args.len() == 1 {
                            let first_arg = link_value(args[0].clone()).await?;
                            if let Some(ref s) = first_arg.as_str() {
                                analysis.add_reference(NodeBindingsReferenceVc::new(
                                    origin.origin_path(),
                                    s.to_string(),
                                ));
                                return Ok(());
                            }
                        }
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            span,
                            &format!(
                                "require('bindings')({args}) is not statically analyse-able{hints}",
                            ),
                            DiagnosticId::Error(
                                errors::failed_to_analyse::ecmascript::NODE_BINDINGS.to_string(),
                            ),
                        )
                    }
                    JsValue::WellKnownFunction(WellKnownFunctionKind::NodeExpressSet) => {
                        let args = linked_args(args).await?;
                        if args.len() == 2 {
                            if let Some(s) = args.get(0).and_then(|arg| arg.as_str()) {
                                let pkg_or_dir = args.get(1).unwrap();
                                let pat = js_value_to_pattern(pkg_or_dir);
                                if !pat.has_constant_parts() {
                                    let (args, hints) = explain_args(&args);
                                    handler.span_warn_with_code(
                                        span,
                                        &format!(
                                            "require('express')().set({args}) is very \
                                             dynamic{hints}",
                                        ),
                                        DiagnosticId::Lint(
                                            errors::failed_to_analyse::ecmascript::NODE_EXPRESS
                                                .to_string(),
                                        ),
                                    );
                                    return Ok(());
                                }
                                match s {
                                    "views" => {
                                        if let Pattern::Constant(p) = &pat {
                                            let abs_pattern = if p.starts_with("/ROOT/") {
                                                pat
                                            } else {
                                                let linked_func_call = link_value(JsValue::call(
                                                    box JsValue::WellKnownFunction(
                                                        WellKnownFunctionKind::PathJoin,
                                                    ),
                                                    vec![
                                                        JsValue::FreeVar(FreeVarKind::Dirname),
                                                        pkg_or_dir.clone(),
                                                    ],
                                                ))
                                                .await?;
                                                js_value_to_pattern(&linked_func_call)
                                            };
                                            analysis.add_reference(DirAssetReferenceVc::new(
                                                source,
                                                abs_pattern.into(),
                                            ));
                                            return Ok(());
                                        }
                                    }
                                    "view engine" => {
                                        if let Some(pkg) = pkg_or_dir.as_str() {
                                            if pkg != "html" {
                                                let pat = js_value_to_pattern(pkg_or_dir);
                                                analysis.add_reference(CjsAssetReferenceVc::new(
                                                    origin,
                                                    RequestVc::parse(Value::new(pat)),
                                                ));
                                            }
                                            return Ok(());
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            span,
                            &format!(
                                "require('express')().set({args}) is not statically \
                                 analyse-able{hints}",
                            ),
                            DiagnosticId::Error(
                                errors::failed_to_analyse::ecmascript::NODE_EXPRESS.to_string(),
                            ),
                        )
                    }
                    JsValue::WellKnownFunction(
                        WellKnownFunctionKind::NodeStrongGlobalizeSetRootDir,
                    ) => {
                        let args = linked_args(args).await?;
                        if let Some(p) = args.get(0).and_then(|arg| arg.as_str()) {
                            let abs_pattern = if p.starts_with("/ROOT/") {
                                Pattern::Constant(format!("{p}/intl"))
                            } else {
                                let linked_func_call = link_value(JsValue::call(
                                    box JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin),
                                    vec![
                                        JsValue::FreeVar(FreeVarKind::Dirname),
                                        p.into(),
                                        "intl".into(),
                                    ],
                                ))
                                .await?;
                                js_value_to_pattern(&linked_func_call)
                            };
                            analysis.add_reference(DirAssetReferenceVc::new(
                                source,
                                abs_pattern.into(),
                            ));
                            return Ok(());
                        }
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            span,
                            &format!(
                                "require('strong-globalize').SetRootDir({args}) is not statically \
                                 analyse-able{hints}",
                            ),
                            DiagnosticId::Error(
                                errors::failed_to_analyse::ecmascript::NODE_GYP_BUILD.to_string(),
                            ),
                        )
                    }
                    JsValue::WellKnownFunction(WellKnownFunctionKind::NodeResolveFrom) => {
                        let args = linked_args(args).await?;
                        if args.len() == 2 && args.get(1).and_then(|arg| arg.as_str()).is_some() {
                            analysis.add_reference(CjsAssetReferenceVc::new(
                                origin,
                                RequestVc::parse(Value::new(js_value_to_pattern(&args[1]))),
                            ));
                            return Ok(());
                        }
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            span,
                            &format!(
                                "require('resolve-from')({args}) is not statically \
                                 analyse-able{hints}",
                            ),
                            DiagnosticId::Error(
                                errors::failed_to_analyse::ecmascript::NODE_RESOLVE_FROM
                                    .to_string(),
                            ),
                        )
                    }
                    JsValue::WellKnownFunction(WellKnownFunctionKind::NodeProtobufLoad) => {
                        let args = linked_args(args).await?;
                        if args.len() == 2 {
                            if let Some(JsValue::Object { parts, .. }) = args.get(1) {
                                for dir in parts
                                    .iter()
                                    .filter_map(|object_part| {
                                        if let ObjectPart::KeyValue(
                                            JsValue::Constant(key),
                                            JsValue::Array { items: dirs, .. },
                                        ) = object_part
                                        {
                                            if key.as_str() == Some("includeDirs") {
                                                return Some(dirs.iter().filter_map(|dir| {
                                                    dir.as_str().map(ToString::to_string)
                                                }));
                                            }
                                        }
                                        None
                                    })
                                    .flatten()
                                {
                                    analysis.add_reference(DirAssetReferenceVc::new(
                                        source,
                                        Pattern::Constant(dir).into(),
                                    ));
                                }
                                return Ok(());
                            }
                        }
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            span,
                            &format!(
                                "require('@grpc/proto-loader').load({args}) is not statically \
                                 analyse-able{hints}",
                            ),
                            DiagnosticId::Error(
                                errors::failed_to_analyse::ecmascript::NODE_PROTOBUF_LOADER
                                    .to_string(),
                            ),
                        )
                    }
                    _ => {
                        for arg in args {
                            if let EffectArg::Closure(_, block) = arg {
                                add_effects(block.effects);
                            }
                        }
                    }
                }
                Ok(())
            }

            async fn handle_member(
                ast_path: &[AstParentKind],
                obj: JsValue,
                prop: JsValue,
                analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
            ) -> Result<()> {
                match (obj, prop) {
                    (
                        JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
                        JsValue::Constant(s),
                    ) if s.as_str() == Some("cache") => {
                        analysis.add_code_gen(
                            CjsRequireCacheAccess {
                                path: AstPathVc::cell(ast_path.to_vec()),
                            }
                            .cell(),
                        );
                    }
                    _ => {}
                }

                Ok(())
            }

            let effects = take(&mut var_graph.effects);

            enum Action {
                Effect(Effect),
                LeaveScope(u32),
            }

            // This is the current state of known values of function arguments.
            let mut fun_args_values = Mutex::new(HashMap::<u32, Vec<JsValue>>::new());

            // This is a stack of effects to process. We use a stack since during processing
            // of an effect we might want to add more effects into the middle of the
            // processing. Using a stack where effects are appended in reverse
            // order allows us to do that. It's recursion implemented as Stack.
            let mut queue_stack = Mutex::new(Vec::new());
            queue_stack
                .get_mut()
                .extend(effects.into_iter().map(Action::Effect).rev());

            let linker = |value| value_visitor(origin, value, compile_time_info);
            // There can be many references to import.meta, but only the first should hoist
            // the object allocation.
            let mut first_import_meta = true;

            while let Some(action) = queue_stack.get_mut().pop() {
                match action {
                    Action::LeaveScope(func_ident) => {
                        fun_args_values.get_mut().remove(&func_ident);
                    }
                    Action::Effect(effect) => {
                        let add_effects = |effects: Vec<Effect>| {
                            queue_stack
                                .lock()
                                .extend(effects.into_iter().map(Action::Effect).rev())
                        };
                        let link_value = |value| {
                            link(
                                &var_graph,
                                value,
                                &early_value_visitor,
                                &linker,
                                fun_args_values.lock().clone(),
                            )
                        };
                        match effect {
                            Effect::Conditional {
                                condition,
                                kind,
                                ast_path: condition_ast_path,
                                span: _,
                            } => {
                                let condition = link_value(condition).await?;
                                macro_rules! inactive {
                                    ($block:ident) => {
                                        analysis.add_code_gen(UnreachableVc::new(AstPathVc::cell(
                                            $block.ast_path.to_vec(),
                                        )));
                                    };
                                }
                                macro_rules! condition {
                                    ($expr:expr) => {
                                        analysis.add_code_gen(ConstantConditionVc::new(
                                            Value::new($expr),
                                            AstPathVc::cell(condition_ast_path.to_vec()),
                                        ));
                                    };
                                }
                                macro_rules! active {
                                    ($block:ident) => {
                                        queue_stack.get_mut().extend(
                                            $block.effects.into_iter().map(Action::Effect).rev(),
                                        )
                                    };
                                }
                                match *kind {
                                    ConditionalKind::If { then } => match condition.is_truthy() {
                                        Some(true) => {
                                            condition!(ConstantConditionValue::Truthy);
                                            active!(then);
                                        }
                                        Some(false) => {
                                            condition!(ConstantConditionValue::Falsy);
                                            inactive!(then);
                                        }
                                        None => {
                                            active!(then);
                                        }
                                    },
                                    ConditionalKind::IfElse { then, r#else }
                                    | ConditionalKind::Ternary { then, r#else } => {
                                        match condition.is_truthy() {
                                            Some(true) => {
                                                condition!(ConstantConditionValue::Truthy);
                                                active!(then);
                                                inactive!(r#else);
                                            }
                                            Some(false) => {
                                                condition!(ConstantConditionValue::Falsy);
                                                active!(r#else);
                                                inactive!(then);
                                            }
                                            None => {
                                                active!(then);
                                                active!(r#else);
                                            }
                                        }
                                    }
                                    ConditionalKind::And { expr } => match condition.is_truthy() {
                                        Some(true) => {
                                            condition!(ConstantConditionValue::Truthy);
                                            active!(expr);
                                        }
                                        Some(false) => {
                                            // The condition value needs to stay since it's used
                                            inactive!(expr);
                                        }
                                        None => {
                                            active!(expr);
                                        }
                                    },
                                    ConditionalKind::Or { expr } => match condition.is_truthy() {
                                        Some(true) => {
                                            // The condition value needs to stay since it's used
                                            inactive!(expr);
                                        }
                                        Some(false) => {
                                            condition!(ConstantConditionValue::Falsy);
                                            active!(expr);
                                        }
                                        None => {
                                            active!(expr);
                                        }
                                    },
                                    ConditionalKind::NullishCoalescing { expr } => {
                                        match condition.is_nullish() {
                                            Some(true) => {
                                                condition!(ConstantConditionValue::Nullish);
                                                active!(expr);
                                            }
                                            Some(false) => {
                                                inactive!(expr);
                                            }
                                            None => {
                                                active!(expr);
                                            }
                                        }
                                    }
                                }
                            }
                            Effect::Call {
                                func,
                                args,
                                ast_path,
                                span,
                            } => {
                                if let Some(ignored) = &ignore_effect_span {
                                    if *ignored == span {
                                        continue;
                                    }
                                }
                                let func = link_value(func).await?;

                                handle_call(
                                    &handler,
                                    source,
                                    origin,
                                    &ast_path,
                                    span,
                                    func,
                                    JsValue::Unknown(None, "no this provided"),
                                    args,
                                    &link_value,
                                    &add_effects,
                                    &mut analysis,
                                    compile_time_info,
                                )
                                .await?;
                            }
                            Effect::MemberCall {
                                obj,
                                prop,
                                mut args,
                                ast_path,
                                span,
                            } => {
                                if let Some(ignored) = &ignore_effect_span {
                                    if *ignored == span {
                                        continue;
                                    }
                                }
                                let mut obj = link_value(obj).await?;
                                let prop = link_value(prop).await?;

                                if let JsValue::Array {
                                    items: ref mut values,
                                    mutable,
                                    ..
                                } = obj
                                {
                                    if matches!(prop.as_str(), Some("map" | "forEach" | "filter")) {
                                        if let [EffectArg::Closure(value, block)] = &mut args[..] {
                                            *value = link_value(take(value)).await?;
                                            if let JsValue::Function(_, func_ident, _) = value {
                                                let mut closure_arg =
                                                    JsValue::alternatives(take(values));
                                                if mutable {
                                                    closure_arg.add_unknown_mutations();
                                                }
                                                fun_args_values
                                                    .get_mut()
                                                    .insert(*func_ident, vec![closure_arg]);
                                                queue_stack
                                                    .get_mut()
                                                    .push(Action::LeaveScope(*func_ident));
                                                queue_stack.get_mut().extend(
                                                    take(&mut block.effects)
                                                        .into_iter()
                                                        .map(Action::Effect)
                                                        .rev(),
                                                );
                                                continue;
                                            }
                                        }
                                    }
                                }

                                let func =
                                    link_value(JsValue::member(box obj.clone(), box prop)).await?;

                                handle_call(
                                    &handler,
                                    source,
                                    origin,
                                    &ast_path,
                                    span,
                                    func,
                                    obj,
                                    args,
                                    &link_value,
                                    &add_effects,
                                    &mut analysis,
                                    compile_time_info,
                                )
                                .await?;
                            }
                            Effect::Member {
                                obj,
                                prop,
                                ast_path,
                                span: _,
                            } => {
                                let obj = link_value(obj).await?;
                                let prop = link_value(prop).await?;

                                handle_member(&ast_path, obj, prop, &mut analysis).await?;
                            }
                            Effect::ImportedBinding {
                                esm_reference_index,
                                export,
                                ast_path,
                                span: _,
                            } => {
                                if let Some(r) = import_references.get(esm_reference_index) {
                                    if let Some("__turbopack_module_id__") = export.as_deref() {
                                        analysis.add_reference(EsmModuleIdAssetReferenceVc::new(
                                            *r,
                                            AstPathVc::cell(ast_path),
                                        ))
                                    } else {
                                        analysis.add_code_gen(EsmBindingVc::new(
                                            *r,
                                            export,
                                            AstPathVc::cell(ast_path),
                                        ));
                                    }
                                }
                            }
                            Effect::ImportMeta { ast_path, span: _ } => {
                                if first_import_meta {
                                    first_import_meta = false;
                                    analysis.add_code_gen(ImportMetaBindingVc::new(
                                        source.ident().path(),
                                    ));
                                }

                                analysis
                                    .add_code_gen(ImportMetaRefVc::new(AstPathVc::cell(ast_path)));
                            }
                            Effect::Url {
                                input,
                                ast_path,
                                span,
                            } => {
                                let pat = js_value_to_pattern(&input);
                                if !pat.has_constant_parts() {
                                    handler.span_warn_with_code(
                                span,
                                &format!("new URL({input}, import.meta.url) is very dynamic"),
                                DiagnosticId::Lint(
                                    errors::failed_to_analyse::ecmascript::NEW_URL_IMPORT_META
                                        .to_string(),
                                ),
                            )
                                }
                                analysis.add_reference(UrlAssetReferenceVc::new(
                                    origin,
                                    RequestVc::parse(Value::new(pat)),
                                    compile_time_info.environment().rendering(),
                                    AstPathVc::cell(ast_path),
                                ));
                            }
                        }
                    }
                }
            }
            analysis.set_successful(true);
        }
        ParseResult::Unparseable | ParseResult::NotFound => {}
    };

    analysis.build().await
}

fn analyze_amd_define(
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
    origin: ResolveOriginVc,
    handler: &Handler,
    span: Span,
    ast_path: &[AstParentKind],
    args: Vec<JsValue>,
) {
    match &args[..] {
        [JsValue::Constant(id), JsValue::Array { items: deps, .. }, _] if id.as_str().is_some() => {
            analyze_amd_define_with_deps(
                analysis,
                origin,
                handler,
                span,
                ast_path,
                id.as_str(),
                deps,
            );
        }
        [JsValue::Array { items: deps, .. }, _] => {
            analyze_amd_define_with_deps(analysis, origin, handler, span, ast_path, None, deps);
        }
        [JsValue::Constant(id), JsValue::Function(..)] if id.as_str().is_some() => {
            analysis.add_code_gen(AmdDefineWithDependenciesCodeGenVc::new(
                vec![
                    AmdDefineDependencyElement::Require,
                    AmdDefineDependencyElement::Exports,
                    AmdDefineDependencyElement::Module,
                ],
                origin,
                AstPathVc::cell(ast_path.to_vec()),
                AmdDefineFactoryType::Function,
            ));
        }
        [JsValue::Constant(id), _] if id.as_str().is_some() => {
            analysis.add_code_gen(AmdDefineWithDependenciesCodeGenVc::new(
                vec![
                    AmdDefineDependencyElement::Require,
                    AmdDefineDependencyElement::Exports,
                    AmdDefineDependencyElement::Module,
                ],
                origin,
                AstPathVc::cell(ast_path.to_vec()),
                AmdDefineFactoryType::Unknown,
            ));
        }
        [JsValue::Function(..)] => {
            analysis.add_code_gen(AmdDefineWithDependenciesCodeGenVc::new(
                vec![
                    AmdDefineDependencyElement::Require,
                    AmdDefineDependencyElement::Exports,
                    AmdDefineDependencyElement::Module,
                ],
                origin,
                AstPathVc::cell(ast_path.to_vec()),
                AmdDefineFactoryType::Function,
            ));
        }
        [JsValue::Object { .. }] => {
            analysis.add_code_gen(AmdDefineWithDependenciesCodeGenVc::new(
                vec![],
                origin,
                AstPathVc::cell(ast_path.to_vec()),
                AmdDefineFactoryType::Value,
            ));
        }
        [_] => {
            analysis.add_code_gen(AmdDefineWithDependenciesCodeGenVc::new(
                vec![
                    AmdDefineDependencyElement::Require,
                    AmdDefineDependencyElement::Exports,
                    AmdDefineDependencyElement::Module,
                ],
                origin,
                AstPathVc::cell(ast_path.to_vec()),
                AmdDefineFactoryType::Unknown,
            ));
        }
        _ => {
            handler.span_err_with_code(
                span,
                "unsupported AMD define() form",
                DiagnosticId::Error(errors::failed_to_analyse::ecmascript::AMD_DEFINE.to_string()),
            );
        }
    }
}

fn analyze_amd_define_with_deps(
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
    origin: ResolveOriginVc,
    handler: &Handler,
    span: Span,
    ast_path: &[AstParentKind],
    id: Option<&str>,
    deps: &[JsValue],
) {
    let mut requests = Vec::new();
    for dep in deps {
        if let Some(dep) = dep.as_str() {
            match dep {
                "exports" => {
                    requests.push(AmdDefineDependencyElement::Exports);
                }
                "require" => {
                    handler.span_warn_with_code(
                        span,
                        "using \"require\" as dependency in an AMD define() is not yet supported",
                        DiagnosticId::Error(
                            errors::failed_to_analyse::ecmascript::AMD_DEFINE.to_string(),
                        ),
                    );
                    requests.push(AmdDefineDependencyElement::Require);
                }
                "module" => {
                    requests.push(AmdDefineDependencyElement::Module);
                }
                _ => {
                    let request = RequestVc::parse_string(dep.to_string());
                    let reference = AmdDefineAssetReferenceVc::new(origin, request);
                    requests.push(AmdDefineDependencyElement::Request(request));
                    analysis.add_reference(reference);
                }
            }
        } else {
            handler.span_err_with_code(
                // TODO(alexkirsz) It'd be best to highlight the argument's span, but
                // `JsValue`s do not keep a hold of their original span.
                span,
                "unsupported AMD define() dependency element form",
                DiagnosticId::Error(errors::failed_to_analyse::ecmascript::AMD_DEFINE.to_string()),
            );
        }
    }

    if id.is_some() {
        handler.span_warn_with_code(
            span,
            "passing an ID to AMD define() is not yet fully supported",
            DiagnosticId::Lint(errors::failed_to_analyse::ecmascript::AMD_DEFINE.to_string()),
        );
    }

    analysis.add_code_gen(AmdDefineWithDependenciesCodeGenVc::new(
        requests,
        origin,
        AstPathVc::cell(ast_path.to_vec()),
        AmdDefineFactoryType::Function,
    ));
}

/// Used to generate the "root" path to a __filename/__dirname/import.meta.url
/// reference.
pub async fn as_abs_path(path: FileSystemPathVc) -> Result<JsValue> {
    // TODO: This should be updated to generate a real system path on the fly
    // during runtime, so that the generated code is constant between systems
    // but the runtime evaluation can take into account the project's
    // actual root directory.
    require_resolve(path).await
}

/// Generates an absolute path usable for `require.resolve()` calls.
async fn require_resolve(path: FileSystemPathVc) -> Result<JsValue> {
    Ok(format!("/ROOT/{}", path.await?.path.as_str()).into())
}

async fn early_value_visitor(mut v: JsValue) -> Result<(JsValue, bool)> {
    let modified = early_replace_builtin(&mut v);
    Ok((v, modified))
}

async fn value_visitor(
    origin: ResolveOriginVc,
    v: JsValue,
    compile_time_info: CompileTimeInfoVc,
) -> Result<(JsValue, bool)> {
    let (mut v, modified) = value_visitor_inner(origin, v, compile_time_info).await?;
    v.normalize_shallow();
    Ok((v, modified))
}

async fn value_visitor_inner(
    origin: ResolveOriginVc,
    v: JsValue,
    compile_time_info: CompileTimeInfoVc,
) -> Result<(JsValue, bool)> {
    if let Some(def_name_len) = v.get_defineable_name_len() {
        let compile_time_info = compile_time_info.await?;
        let defines = compile_time_info.defines.await?;
        for (name, value) in defines.iter() {
            if name.len() != def_name_len {
                continue;
            }
            if v.iter_defineable_name_rev()
                .eq(name.iter().map(Cow::Borrowed).rev())
            {
                return Ok((value.into(), true));
            }
        }
    }
    let value = match v {
        JsValue::Call(
            _,
            box JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve),
            args,
        ) => {
            if args.len() == 1 {
                let pat = js_value_to_pattern(&args[0]);
                let request = RequestVc::parse(Value::new(pat.clone()));
                let resolved = cjs_resolve(origin, request).await?;
                let mut values = resolved
                    .primary
                    .iter()
                    .map(|result| async move {
                        Ok(if let PrimaryResolveResult::Asset(asset) = result {
                            Some(require_resolve(asset.ident().path()).await?)
                        } else {
                            None
                        })
                    })
                    .try_join()
                    .await?
                    .into_iter()
                    .flatten()
                    .collect::<Vec<_>>();
                match values.len() {
                    0 => JsValue::Unknown(
                        Some(Arc::new(JsValue::call(
                            box JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve),
                            args,
                        ))),
                        "unresolveable request",
                    ),
                    1 => values.pop().unwrap(),
                    _ => JsValue::alternatives(values),
                }
            } else {
                JsValue::Unknown(
                    Some(Arc::new(JsValue::call(
                        box JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve),
                        args,
                    ))),
                    "only a single argument is supported",
                )
            }
        }
        JsValue::FreeVar(ref kind) => match kind {
            FreeVarKind::Dirname => as_abs_path(origin.origin_path().parent()).await?,
            FreeVarKind::Filename => as_abs_path(origin.origin_path()).await?,

            FreeVarKind::Require => JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
            FreeVarKind::Define => JsValue::WellKnownFunction(WellKnownFunctionKind::Define),
            FreeVarKind::Import => JsValue::WellKnownFunction(WellKnownFunctionKind::Import),
            FreeVarKind::NodeProcess => JsValue::WellKnownObject(WellKnownObjectKind::NodeProcess),
            FreeVarKind::Object => JsValue::WellKnownObject(WellKnownObjectKind::GlobalObject),
            _ => return Ok((v, false)),
        },
        JsValue::Module(ModuleValue {
            module: ref name, ..
        }) => {
            if *compile_time_info.environment().node_externals().await? {
                // TODO check externals
                match &**name {
                    "path" => JsValue::WellKnownObject(WellKnownObjectKind::PathModule),
                    "fs/promises" => JsValue::WellKnownObject(WellKnownObjectKind::FsModule),
                    "fs" => JsValue::WellKnownObject(WellKnownObjectKind::FsModule),
                    "child_process" => JsValue::WellKnownObject(WellKnownObjectKind::ChildProcess),
                    "os" => JsValue::WellKnownObject(WellKnownObjectKind::OsModule),
                    "process" => JsValue::WellKnownObject(WellKnownObjectKind::NodeProcess),
                    "@mapbox/node-pre-gyp" => {
                        JsValue::WellKnownObject(WellKnownObjectKind::NodePreGyp)
                    }
                    "node-gyp-build" => {
                        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeGypBuild)
                    }
                    "bindings" => JsValue::WellKnownFunction(WellKnownFunctionKind::NodeBindings),
                    "express" => JsValue::WellKnownFunction(WellKnownFunctionKind::NodeExpress),
                    "strong-globalize" => {
                        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeStrongGlobalize)
                    }
                    "resolve-from" => {
                        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeResolveFrom)
                    }
                    "@grpc/proto-loader" => {
                        JsValue::WellKnownObject(WellKnownObjectKind::NodeProtobufLoader)
                    }
                    _ => JsValue::Unknown(
                        Some(Arc::new(v)),
                        "cross module analyzing is not yet supported",
                    ),
                }
            } else {
                JsValue::Unknown(
                    Some(Arc::new(v)),
                    "cross module analyzing is not yet supported",
                )
            }
        }
        JsValue::Argument(..) => JsValue::Unknown(
            Some(Arc::new(v)),
            "cross function analyzing is not yet supported",
        ),
        _ => {
            let (mut v, mut modified) = replace_well_known(v, compile_time_info).await?;
            modified = replace_builtin(&mut v) || modified;
            modified = modified || v.make_nested_operations_unknown();
            return Ok((v, modified));
        }
    };
    Ok((value, true))
}

#[derive(Debug)]
enum StaticExpr {
    String(String),
    FreeVar(Vec<String>),
    ImportedVar(String, Vec<String>),
    Unknown,
}

// TODO get rid of that
#[derive(Default)]
struct StaticAnalyser {
    imports: HashMap<String, (String, Vec<String>)>,
}

impl StaticAnalyser {
    fn prop_to_name(&self, prop: &MemberProp) -> Option<String> {
        match prop {
            MemberProp::Ident(ident) => Some(ident.sym.to_string()),
            MemberProp::PrivateName(_) => None,
            MemberProp::Computed(ComputedPropName { expr, .. }) => match self.evaluate_expr(expr) {
                StaticExpr::String(str) => Some(str),
                _ => None,
            },
        }
    }

    fn evaluate_expr(&self, expr: &Expr) -> StaticExpr {
        match expr {
            Expr::Lit(Lit::Str(str)) => StaticExpr::String(str.value.to_string()),
            Expr::Ident(ident) => {
                let str = ident.sym.to_string();
                match self.imports.get(&str) {
                    Some((module, import)) => {
                        StaticExpr::ImportedVar(module.clone(), import.clone())
                    }
                    None => StaticExpr::FreeVar(vec![str]),
                }
            }
            Expr::Member(member) => match self.evaluate_expr(&member.obj) {
                StaticExpr::FreeVar(mut vec) => match self.prop_to_name(&member.prop) {
                    Some(name) => {
                        vec.push(name);
                        StaticExpr::FreeVar(vec)
                    }
                    None => StaticExpr::Unknown,
                },
                StaticExpr::ImportedVar(module, mut vec) => match self.prop_to_name(&member.prop) {
                    Some(name) => {
                        vec.push(name);
                        StaticExpr::ImportedVar(module, vec)
                    }
                    None => StaticExpr::Unknown,
                },
                _ => StaticExpr::Unknown,
            },
            _ => StaticExpr::Unknown,
        }
    }
}

struct AssetReferencesVisitor<'a> {
    eval_context: &'a EvalContext,
    old_analyser: StaticAnalyser,
    import_references: &'a [EsmAssetReferenceVc],
    analysis: &'a mut AnalyzeEcmascriptModuleResultBuilder,
    esm_exports: BTreeMap<String, EsmExport>,
    esm_star_exports: Vec<EsmAssetReferenceVc>,
    webpack_runtime: Option<(String, Span)>,
    webpack_entry: bool,
    webpack_chunks: Vec<Lit>,
}

impl<'a> AssetReferencesVisitor<'a> {
    fn new(
        eval_context: &'a EvalContext,
        import_references: &'a [EsmAssetReferenceVc],
        analysis: &'a mut AnalyzeEcmascriptModuleResultBuilder,
    ) -> Self {
        Self {
            eval_context,
            old_analyser: StaticAnalyser::default(),
            import_references,
            analysis,
            esm_exports: BTreeMap::new(),
            esm_star_exports: Vec::new(),
            webpack_runtime: None,
            webpack_entry: false,
            webpack_chunks: Vec::new(),
        }
    }
}

fn as_parent_path(ast_path: &AstNodePath<AstParentNodeRef<'_>>) -> Vec<AstParentKind> {
    ast_path.iter().map(|n| n.kind()).collect()
}

fn for_each_ident_in_decl(decl: &Decl, f: &mut impl FnMut(String)) {
    match decl {
        Decl::Class(ClassDecl { ident, .. }) | Decl::Fn(FnDecl { ident, .. }) => {
            f(ident.sym.to_string());
        }
        Decl::Var(var_decl) => {
            let decls = &*var_decl.decls;
            decls
                .iter()
                .for_each(|VarDeclarator { name, .. }| for_each_ident_in_pat(name, f));
        }
        Decl::TsInterface(_) | Decl::TsTypeAlias(_) | Decl::TsEnum(_) | Decl::TsModule(_) => {
            // ignore typescript for code generation
        }
    }
}
fn for_each_ident_in_pat(pat: &Pat, f: &mut impl FnMut(String)) {
    match pat {
        Pat::Ident(BindingIdent { id, .. }) => {
            f(id.sym.to_string());
        }
        Pat::Array(ArrayPat { elems, .. }) => elems.iter().for_each(|e| {
            if let Some(e) = e {
                for_each_ident_in_pat(e, f);
            }
        }),
        Pat::Rest(RestPat { arg, .. }) => {
            for_each_ident_in_pat(arg, f);
        }
        Pat::Object(ObjectPat { props, .. }) => {
            props.iter().for_each(|p| match p {
                ObjectPatProp::KeyValue(KeyValuePatProp { value, .. }) => {
                    for_each_ident_in_pat(value, f);
                }
                ObjectPatProp::Assign(AssignPatProp { key, .. }) => {
                    f(key.sym.to_string());
                }
                ObjectPatProp::Rest(RestPat { arg, .. }) => {
                    for_each_ident_in_pat(arg, f);
                }
            });
        }
        Pat::Assign(AssignPat { left, .. }) => {
            for_each_ident_in_pat(left, f);
        }
        Pat::Invalid(_) | Pat::Expr(_) => {
            panic!("Unexpected pattern while enumerating idents");
        }
    }
}

impl<'a> VisitAstPath for AssetReferencesVisitor<'a> {
    fn visit_export_all<'ast: 'r, 'r>(
        &mut self,
        export: &'ast ExportAll,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let path = AstPathVc::cell(as_parent_path(ast_path));
        self.analysis.add_code_gen(EsmModuleItemVc::new(path));
        export.visit_children_with_path(self, ast_path);
    }

    fn visit_named_export<'ast: 'r, 'r>(
        &mut self,
        export: &'ast NamedExport,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let path = AstPathVc::cell(as_parent_path(ast_path));
        if export.src.is_none() {
            for spec in export.specifiers.iter() {
                fn to_string(name: &ModuleExportName) -> String {
                    match name {
                        ModuleExportName::Ident(ident) => ident.sym.to_string(),
                        ModuleExportName::Str(str) => str.value.to_string(),
                    }
                }
                match spec {
                    ExportSpecifier::Namespace(_) => {
                        panic!(
                            "ExportNamespaceSpecifier will not happen in combination with src == \
                             None"
                        );
                    }
                    ExportSpecifier::Default(_) => {
                        panic!(
                            "ExportDefaultSpecifier will not happen in combination with src == \
                             None"
                        );
                    }
                    ExportSpecifier::Named(ExportNamedSpecifier { orig, exported, .. }) => {
                        let key = to_string(exported.as_ref().unwrap_or(orig));
                        let binding_name = to_string(orig);
                        let export = {
                            let imported_binding = if let ModuleExportName::Ident(ident) = orig {
                                self.eval_context.imports.get_binding(&ident.to_id())
                            } else {
                                None
                            };
                            if let Some((index, export)) = imported_binding {
                                let esm_ref = self.import_references[index];
                                if let Some(export) = export {
                                    EsmExport::ImportedBinding(esm_ref, export)
                                } else {
                                    EsmExport::ImportedNamespace(esm_ref)
                                }
                            } else {
                                EsmExport::LocalBinding(binding_name)
                            }
                        };
                        self.esm_exports.insert(key, export);
                    }
                }
            }
        }

        self.analysis.add_code_gen(EsmModuleItemVc::new(path));
        export.visit_children_with_path(self, ast_path);
    }

    fn visit_export_decl<'ast: 'r, 'r>(
        &mut self,
        export: &'ast ExportDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        for_each_ident_in_decl(&export.decl, &mut |name| {
            self.esm_exports
                .insert(name.clone(), EsmExport::LocalBinding(name));
        });
        self.analysis
            .add_code_gen(EsmModuleItemVc::new(AstPathVc::cell(as_parent_path(
                ast_path,
            ))));
        export.visit_children_with_path(self, ast_path);
    }

    fn visit_export_default_expr<'ast: 'r, 'r>(
        &mut self,
        export: &'ast ExportDefaultExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.esm_exports.insert(
            "default".to_string(),
            EsmExport::LocalBinding(magic_identifier::mangle("default export")),
        );
        self.analysis
            .add_code_gen(EsmModuleItemVc::new(AstPathVc::cell(as_parent_path(
                ast_path,
            ))));
        export.visit_children_with_path(self, ast_path);
    }

    fn visit_export_default_decl<'ast: 'r, 'r>(
        &mut self,
        export: &'ast ExportDefaultDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        match &export.decl {
            DefaultDecl::Class(ClassExpr { ident, .. }) | DefaultDecl::Fn(FnExpr { ident, .. }) => {
                self.esm_exports.insert(
                    "default".to_string(),
                    EsmExport::LocalBinding(
                        ident
                            .as_ref()
                            .map(|i| i.sym.to_string())
                            .unwrap_or_else(|| magic_identifier::mangle("default export")),
                    ),
                );
            }
            DefaultDecl::TsInterfaceDecl(..) => {
                // ignore
            }
        }
        self.analysis
            .add_code_gen(EsmModuleItemVc::new(AstPathVc::cell(as_parent_path(
                ast_path,
            ))));
        export.visit_children_with_path(self, ast_path);
    }

    fn visit_import_decl<'ast: 'r, 'r>(
        &mut self,
        import: &'ast ImportDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let path = AstPathVc::cell(as_parent_path(ast_path));
        let src = import.src.value.to_string();
        import.visit_children_with_path(self, ast_path);
        if import.type_only {
            return;
        }
        for specifier in &import.specifiers {
            match specifier {
                ImportSpecifier::Named(named) => {
                    if !named.is_type_only {
                        self.old_analyser.imports.insert(
                            named.local.sym.to_string(),
                            (
                                src.clone(),
                                vec![match &named.imported {
                                    Some(ModuleExportName::Ident(ident)) => ident.sym.to_string(),
                                    Some(ModuleExportName::Str(str)) => str.value.to_string(),
                                    None => named.local.sym.to_string(),
                                }],
                            ),
                        );
                    }
                }
                ImportSpecifier::Default(default_import) => {
                    self.old_analyser.imports.insert(
                        default_import.local.sym.to_string(),
                        (src.clone(), vec!["default".to_string()]),
                    );
                }
                ImportSpecifier::Namespace(namespace) => {
                    self.old_analyser
                        .imports
                        .insert(namespace.local.sym.to_string(), (src.clone(), Vec::new()));
                }
            }
        }
        self.analysis.add_code_gen(EsmModuleItemVc::new(path));
    }

    fn visit_var_declarator<'ast: 'r, 'r>(
        &mut self,
        decl: &'ast VarDeclarator,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if let Some(ident) = decl.name.as_ident() {
            if &*ident.id.sym == "__webpack_require__" {
                if let Some(init) = &decl.init {
                    if let Some(call) = init.as_call() {
                        if let Some(expr) = call.callee.as_expr() {
                            if let Some(ident) = expr.as_ident() {
                                if &*ident.sym == "require" {
                                    if let [ExprOrSpread { spread: None, expr }] = &call.args[..] {
                                        if let Some(Lit::Str(str)) = expr.as_lit() {
                                            self.webpack_runtime =
                                                Some((str.value.to_string(), call.span));
                                            return;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        decl.visit_children_with_path(self, ast_path);
    }

    fn visit_call_expr<'ast: 'r, 'r>(
        &mut self,
        call: &'ast CallExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if let Callee::Expr(expr) = &call.callee {
            if let StaticExpr::FreeVar(var) = self.old_analyser.evaluate_expr(expr) {
                match &var[..] {
                    [webpack_require, property]
                        if webpack_require == "__webpack_require__" && property == "C" =>
                    {
                        self.webpack_entry = true;
                    }
                    [webpack_require, property]
                        if webpack_require == "__webpack_require__" && property == "X" =>
                    {
                        if let [_, ExprOrSpread {
                            spread: None,
                            expr: chunk_ids,
                        }, _] = &call.args[..]
                        {
                            if let Some(array) = chunk_ids.as_array() {
                                for elem in array.elems.iter().flatten() {
                                    if let ExprOrSpread { spread: None, expr } = elem {
                                        if let Some(lit) = expr.as_lit() {
                                            self.webpack_chunks.push(lit.clone());
                                        }
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
        call.visit_children_with_path(self, ast_path);
    }
}

#[turbo_tasks::function]
async fn resolve_as_webpack_runtime(
    origin: ResolveOriginVc,
    request: RequestVc,
    transforms: EcmascriptInputTransformsVc,
) -> Result<WebpackRuntimeVc> {
    let ty = Value::new(ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined));
    let options = origin.resolve_options(ty.clone());

    let options = apply_cjs_specific_options(options);

    let resolved = resolve(
        origin.origin_path().parent().resolve().await?,
        request,
        options,
    );

    if let Some(source) = *resolved.first_asset().await? {
        Ok(webpack_runtime(source, transforms))
    } else {
        Ok(WebpackRuntime::None.into())
    }
}

// TODO enable serialization
#[turbo_tasks::value(transparent, serialization = "none")]
pub struct AstPath(#[turbo_tasks(trace_ignore)] Vec<AstParentKind>);

pub static TURBOPACK_HELPER: &str = "__turbopackHelper";

pub fn is_turbopack_helper_import(import: &ImportDecl) -> bool {
    import.asserts.as_ref().map_or(true, |asserts| {
        asserts.props.iter().any(|assert| {
            assert
                .as_prop()
                .and_then(|prop| prop.as_key_value())
                .and_then(|kv| kv.key.as_ident())
                .map_or(true, |ident| &*ident.sym != TURBOPACK_HELPER)
        })
    })
}

fn has_cjs_export(p: &Program) -> bool {
    use swc_core::ecma::visit::{visit_obj_and_computed, Visit, VisitWith};

    if let Program::Module(m) = p {
        // Check for imports/exports
        if m.body.iter().any(|item| {
            item.as_module_decl().map_or(false, |module_decl| {
                module_decl
                    .as_import()
                    .map_or(true, |import| !is_turbopack_helper_import(import))
            })
        }) {
            return false;
        }
    }

    struct Visitor {
        found: bool,
    }

    impl Visit for Visitor {
        visit_obj_and_computed!();

        fn visit_ident(&mut self, i: &Ident) {
            if &*i.sym == "module"
                || &*i.sym == "exports"
                || &*i.sym == "__turbopack_export_value__"
            {
                self.found = true;
            }
        }
        fn visit_expr(&mut self, n: &Expr) {
            if self.found {
                return;
            }
            n.visit_children_with(self);
        }

        fn visit_stmt(&mut self, n: &Stmt) {
            if self.found {
                return;
            }
            n.visit_children_with(self);
        }
    }

    let mut v = Visitor { found: false };
    p.visit_with(&mut v);
    v.found
}
