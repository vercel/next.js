pub mod amd;
pub mod cjs;
pub mod esm;
pub mod node;
pub mod pattern_mapping;
pub mod raw;
pub mod typescript;
pub mod util;

use std::{
    collections::{BTreeMap, HashMap},
    future::Future,
    mem::take,
    pin::Pin,
    sync::{Arc, Mutex},
};

use anyhow::Result;
use lazy_static::lazy_static;
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
use turbo_tasks::{TryJoinIterExt, Value};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::AssetVc,
    environment::EnvironmentVc,
    reference::{AssetReferenceVc, AssetReferencesVc, SourceMapVc},
    resolve::{
        find_context_file, origin::ResolveOriginVc, parse::RequestVc, pattern::Pattern, resolve,
        FindContextFileResult, ResolveResult,
    },
};
use turbopack_swc_utils::emitter::IssueEmitter;

use self::{
    amd::{
        AmdDefineAssetReferenceVc, AmdDefineDependencyElement, AmdDefineFactoryType,
        AmdDefineWithDependenciesCodeGenVc,
    },
    cjs::CjsAssetReferenceVc,
    esm::{
        export::EsmExport, EsmAssetReferenceVc, EsmAsyncAssetReferenceVc, EsmExports,
        EsmModuleItemVc,
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
        linker::{link, LinkCache},
        well_known::replace_well_known,
        ConstantValue, FreeVarKind, JsValue, ObjectPart, WellKnownFunctionKind,
        WellKnownObjectKind,
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
    analyzer::{graph::EvalContext, imports::Reexport, ModuleValue},
    chunk::{EcmascriptExports, EcmascriptExportsVc},
    code_gen::{CodeGenerateableVc, CodeGenerateablesVc},
    magic_identifier,
    references::{
        cjs::{
            CjsRequireAssetReferenceVc, CjsRequireCacheAccess, CjsRequireResolveAssetReferenceVc,
        },
        esm::{module_id::EsmModuleIdAssetReferenceVc, EsmBindingVc, EsmExportsVc},
    },
    EcmascriptInputTransformsVc,
};

#[turbo_tasks::value]
pub struct AnalyzeEcmascriptModuleResult {
    pub references: AssetReferencesVc,
    pub code_generation: CodeGenerateablesVc,
    pub exports: EcmascriptExportsVc,
}

/// A temporary analysis result builder to pass around, to be turned into an
/// `AnalyzeEcmascriptModuleResultVc` eventually.
pub(crate) struct AnalyzeEcmascriptModuleResultBuilder {
    references: Vec<AssetReferenceVc>,
    code_gens: Vec<CodeGenerateableVc>,
    exports: EcmascriptExports,
}

impl AnalyzeEcmascriptModuleResultBuilder {
    pub fn new() -> Self {
        Self {
            references: Vec::new(),
            code_gens: Vec::new(),
            exports: EcmascriptExports::None,
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
        self.code_gens.push(code_gen.into());
    }

    /// Sets the analysis result ES export.
    pub fn set_exports(&mut self, exports: EcmascriptExports) {
        self.exports = exports;
    }

    /// Builds the final analysis result.
    pub fn build(self) -> AnalyzeEcmascriptModuleResultVc {
        AnalyzeEcmascriptModuleResultVc::cell(AnalyzeEcmascriptModuleResult {
            references: AssetReferencesVc::cell(self.references),
            code_generation: CodeGenerateablesVc::cell(self.code_gens),
            exports: self.exports.into(),
        })
    }
}

impl Default for AnalyzeEcmascriptModuleResultBuilder {
    fn default() -> Self {
        Self::new()
    }
}

impl From<AnalyzeEcmascriptModuleResultBuilder> for AnalyzeEcmascriptModuleResultVc {
    fn from(builder: AnalyzeEcmascriptModuleResultBuilder) -> Self {
        builder.build()
    }
}

#[turbo_tasks::function]
pub(crate) async fn analyze_ecmascript_module(
    source: AssetVc,
    origin: ResolveOriginVc,
    ty: Value<EcmascriptModuleAssetType>,
    transforms: EcmascriptInputTransformsVc,
    environment: EnvironmentVc,
) -> Result<AnalyzeEcmascriptModuleResultVc> {
    let mut analysis = AnalyzeEcmascriptModuleResultBuilder::new();
    let path = source.path();

    let is_typescript = match &*ty {
        EcmascriptModuleAssetType::Typescript
        | EcmascriptModuleAssetType::TypescriptDeclaration => true,
        EcmascriptModuleAssetType::Ecmascript => false,
    };

    let parsed = parse(source, ty, transforms);

    match &*find_context_file(path.parent(), "package.json").await? {
        FindContextFileResult::Found(package_json, _) => {
            analysis.add_reference(PackageJsonReferenceVc::new(*package_json));
        }
        FindContextFileResult::NotFound(_) => {}
    };

    if is_typescript {
        match &*find_context_file(path.parent(), "tsconfig.json").await? {
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
            if is_typescript {
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
                            analysis.add_reference(SourceMapVc::new(
                                source.path(),
                                source.path().parent().join(path),
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
            let (
                mut var_graph,
                webpack_runtime,
                webpack_entry,
                webpack_chunks,
                esm_exports,
                esm_star_exports,
            ) = HANDLER.set(&handler, || {
                GLOBALS.set(globals, || {
                    let var_graph = create_graph(program, eval_context);

                    for (src, annotations) in eval_context.imports.references() {
                        let r = EsmAssetReferenceVc::new(
                            origin,
                            RequestVc::parse(Value::new(src.to_string().into())),
                            Value::new(annotations.clone()),
                        );
                        import_references.push(r);
                        analysis.add_reference(r);
                    }

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
            } else if let Program::Module(_) = program {
                EcmascriptExports::None
            } else {
                EcmascriptExports::CommonJs
            };

            analysis.set_exports(exports);

            fn handle_call_boxed<
                'a,
                FF: Future<Output = Result<JsValue>> + Send + 'a,
                F: Fn(JsValue) -> FF + Sync + 'a,
            >(
                handler: &'a Handler,
                source: AssetVc,
                origin: ResolveOriginVc,
                ast_path: &'a [AstParentKind],
                span: Span,
                func: JsValue,
                this: JsValue,
                args: Vec<JsValue>,
                link_value: &'a F,
                is_typescript: bool,
                analysis: &'a mut AnalyzeEcmascriptModuleResultBuilder,
                environment: EnvironmentVc,
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
                    is_typescript,
                    analysis,
                    environment,
                ))
            }

            async fn handle_call<
                FF: Future<Output = Result<JsValue>> + Send,
                F: Fn(JsValue) -> FF + Sync,
            >(
                handler: &Handler,
                source: AssetVc,
                origin: ResolveOriginVc,
                ast_path: &[AstParentKind],
                span: Span,
                func: JsValue,
                this: JsValue,
                args: Vec<JsValue>,
                link_value: &F,
                is_typescript: bool,
                analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
                environment: EnvironmentVc,
            ) -> Result<()> {
                fn explain_args(args: &[JsValue]) -> (String, String) {
                    JsValue::explain_args(args, 10, 2)
                }
                let linked_args = || args.iter().map(|arg| link_value(arg.clone())).try_join();
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
                                is_typescript,
                                analysis,
                                environment,
                            )
                            .await?;
                        }
                    }
                    JsValue::Member(_, obj, props) => {
                        if let JsValue::Array(..) = *obj {
                            let args = linked_args().await?;
                            let linked_array =
                                link_value(JsValue::MemberCall(args.len(), obj, props, args))
                                    .await?;
                            if let JsValue::Array(_, elements) = linked_array {
                                for ele in elements {
                                    if let JsValue::Call(_, callee, args) = ele {
                                        handle_call_boxed(
                                            handler,
                                            source,
                                            origin,
                                            ast_path,
                                            span,
                                            *callee,
                                            JsValue::Unknown(None, "no this provided"),
                                            args,
                                            link_value,
                                            is_typescript,
                                            analysis,
                                            environment,
                                        )
                                        .await?;
                                    }
                                }
                            }
                        }
                    }
                    JsValue::WellKnownFunction(WellKnownFunctionKind::Import) => {
                        let args = linked_args().await?;
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
                        let args = linked_args().await?;
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
                            linked_args().await?,
                        );
                    }

                    JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve) => {
                        let args = linked_args().await?;
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
                        let args = linked_args().await?;
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
                        let parent_path = source.path().parent().await?;
                        let args = linked_args().await?;

                        let linked_func_call = link_value(JsValue::call(
                            box JsValue::WellKnownFunction(WellKnownFunctionKind::PathResolve(
                                box parent_path.path.as_str().into(),
                            )),
                            args,
                        ))
                        .await?;

                        let pat = js_value_to_pattern(&linked_func_call);
                        if !pat.has_constant_parts() {
                            let (args, hints) = explain_args(&linked_args().await?);
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
                        let linked_func_call = link_value(JsValue::call(
                            box JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin),
                            args.clone(),
                        ))
                        .await?;
                        let pat = js_value_to_pattern(&linked_func_call);
                        if !pat.has_constant_parts() {
                            let (args, hints) = explain_args(&linked_args().await?);
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
                        let args = linked_args().await?;
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
                        if !args.is_empty() {
                            let first_arg = link_value(args[0].clone()).await?;
                            let pat = js_value_to_pattern(&first_arg);
                            if !pat.has_constant_parts() {
                                let (args, hints) = explain_args(&linked_args().await?);
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
                        let (args, hints) = explain_args(&linked_args().await?);
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

                        let args = linked_args().await?;
                        if args.len() == 1 {
                            let first_arg = link_value(args[0].clone()).await?;
                            let pat = js_value_to_pattern(&first_arg);
                            if !pat.has_constant_parts() {
                                let (args, hints) = explain_args(&linked_args().await?);
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
                                source.path().parent(),
                                pat.into(),
                                environment.compile_target(),
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

                        let args = linked_args().await?;
                        if args.len() == 1 {
                            let first_arg = link_value(args[0].clone()).await?;
                            if let Some(s) = first_arg.as_str() {
                                // TODO this resolving should happen within NodeGypBuildReferenceVc
                                let current_context =
                                    source.path().root().join(s.trim_start_matches("/ROOT/"));
                                analysis.add_reference(NodeGypBuildReferenceVc::new(
                                    current_context,
                                    environment.compile_target(),
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

                        let args = linked_args().await?;
                        if args.len() == 1 {
                            let first_arg = link_value(args[0].clone()).await?;
                            if let Some(ref s) = first_arg.as_str() {
                                analysis.add_reference(NodeBindingsReferenceVc::new(
                                    source.path(),
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
                        let linked_args = linked_args().await?;
                        if linked_args.len() == 2 {
                            if let Some(s) = linked_args.get(0).and_then(|arg| arg.as_str()) {
                                let pkg_or_dir = linked_args.get(1).unwrap();
                                let pat = js_value_to_pattern(pkg_or_dir);
                                if !pat.has_constant_parts() {
                                    let (args, hints) = explain_args(&linked_args);
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
                        let linked_args = linked_args().await?;
                        if let Some(p) = linked_args.get(0).and_then(|arg| arg.as_str()) {
                            let abs_pattern = if p.starts_with("/ROOT/") {
                                Pattern::Constant(format!("{p}/intl"))
                            } else {
                                let linked_func_call = link_value(JsValue::call(
                                    box JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin),
                                    vec![
                                        JsValue::FreeVar(FreeVarKind::Dirname),
                                        JsValue::Constant(ConstantValue::StrWord(p.into())),
                                        JsValue::Constant(ConstantValue::StrWord("intl".into())),
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
                        if args.len() == 2 {
                            let args = linked_args().await?;
                            if let Some(JsValue::Object(_, parts)) = args.get(1) {
                                for dir in parts
                                    .iter()
                                    .filter_map(|object_part| {
                                        if let ObjectPart::KeyValue(
                                            JsValue::Constant(key),
                                            JsValue::Array(_, dirs),
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
                    _ => {}
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

            let cache = Mutex::new(LinkCache::new());
            let linker = |value| value_visitor(source, origin, value, environment);
            let effects = take(&mut var_graph.effects);
            let link_value = |value| link(&var_graph, value, &linker, &cache);

            for effect in effects.into_iter() {
                match effect {
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
                            is_typescript,
                            &mut analysis,
                            environment,
                        )
                        .await?;
                    }
                    Effect::MemberCall {
                        obj,
                        prop,
                        args,
                        ast_path,
                        span,
                    } => {
                        if let Some(ignored) = &ignore_effect_span {
                            if *ignored == span {
                                continue;
                            }
                        }
                        let obj = link_value(obj).await?;
                        let func = link_value(JsValue::member(box obj.clone(), box prop)).await?;

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
                            is_typescript,
                            &mut analysis,
                            environment,
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
                }
            }
        }
        ParseResult::Unparseable | ParseResult::NotFound => {}
    };

    Ok(analysis.build())
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
        [JsValue::Constant(id), JsValue::Array(_, deps), _] if id.as_str().is_some() => {
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
        [JsValue::Array(_, deps), _] => {
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
        [JsValue::Object(..)] => {
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

async fn as_abs_path(path: FileSystemPathVc) -> Result<JsValue> {
    Ok(format!("/ROOT/{}", path.await?.path.as_str()).into())
}

async fn value_visitor(
    source: AssetVc,
    origin: ResolveOriginVc,
    v: JsValue,
    environment: EnvironmentVc,
) -> Result<(JsValue, bool)> {
    let (mut v, modified) = value_visitor_inner(source, origin, v, environment).await?;
    v.normalize_shallow();
    Ok((v, modified))
}

async fn value_visitor_inner(
    source: AssetVc,
    origin: ResolveOriginVc,
    v: JsValue,
    environment: EnvironmentVc,
) -> Result<(JsValue, bool)> {
    Ok((
        match v {
            JsValue::Call(
                _,
                box JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve),
                args,
            ) => {
                if args.len() == 1 {
                    let pat = js_value_to_pattern(&args[0]);
                    let request = RequestVc::parse(Value::new(pat.clone()));
                    let resolved = cjs_resolve(origin, request).await?;
                    match &*resolved {
                        ResolveResult::Single(asset, _) => as_abs_path(asset.path()).await?,
                        ResolveResult::Alternatives(assets, _) => JsValue::alternatives(
                            assets
                                .iter()
                                .map(|asset| as_abs_path(asset.path()))
                                .try_join()
                                .await?,
                        ),
                        _ => JsValue::Unknown(
                            Some(Arc::new(JsValue::call(
                                box JsValue::WellKnownFunction(
                                    WellKnownFunctionKind::RequireResolve,
                                ),
                                args,
                            ))),
                            Box::leak(Box::new(format!("unresolveable request {pat}"))),
                        ),
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
            JsValue::FreeVar(FreeVarKind::Dirname) => as_abs_path(source.path().parent()).await?,
            JsValue::FreeVar(FreeVarKind::Filename) => as_abs_path(source.path()).await?,

            JsValue::FreeVar(FreeVarKind::Require) => {
                JsValue::WellKnownFunction(WellKnownFunctionKind::Require)
            }
            JsValue::FreeVar(FreeVarKind::Define) => {
                JsValue::WellKnownFunction(WellKnownFunctionKind::Define)
            }
            JsValue::FreeVar(FreeVarKind::Import) => {
                JsValue::WellKnownFunction(WellKnownFunctionKind::Import)
            }
            JsValue::FreeVar(FreeVarKind::NodeProcess) => {
                JsValue::WellKnownObject(WellKnownObjectKind::NodeProcess)
            }
            JsValue::FreeVar(FreeVarKind::Object) => {
                JsValue::WellKnownObject(WellKnownObjectKind::GlobalObject)
            }
            JsValue::FreeVar(_) => JsValue::Unknown(Some(Arc::new(v)), "unknown global"),
            JsValue::Module(ModuleValue {
                module: ref name, ..
            }) => match &**name {
                // TODO check externals
                "path" if *environment.node_externals().await? => {
                    JsValue::WellKnownObject(WellKnownObjectKind::PathModule)
                }
                "fs/promises" if *environment.node_externals().await? => {
                    JsValue::WellKnownObject(WellKnownObjectKind::FsModule)
                }
                "fs" if *environment.node_externals().await? => {
                    JsValue::WellKnownObject(WellKnownObjectKind::FsModule)
                }
                "child_process" if *environment.node_externals().await? => {
                    JsValue::WellKnownObject(WellKnownObjectKind::ChildProcess)
                }
                "os" if *environment.node_externals().await? => {
                    JsValue::WellKnownObject(WellKnownObjectKind::OsModule)
                }
                "process" if *environment.node_externals().await? => {
                    JsValue::WellKnownObject(WellKnownObjectKind::NodeProcess)
                }
                "@mapbox/node-pre-gyp" if *environment.node_externals().await? => {
                    JsValue::WellKnownObject(WellKnownObjectKind::NodePreGyp)
                }
                "node-gyp-build" if *environment.node_externals().await? => {
                    JsValue::WellKnownFunction(WellKnownFunctionKind::NodeGypBuild)
                }
                "bindings" if *environment.node_externals().await? => {
                    JsValue::WellKnownFunction(WellKnownFunctionKind::NodeBindings)
                }
                "express" if *environment.node_externals().await? => {
                    JsValue::WellKnownFunction(WellKnownFunctionKind::NodeExpress)
                }
                "strong-globalize" if *environment.node_externals().await? => {
                    JsValue::WellKnownFunction(WellKnownFunctionKind::NodeStrongGlobalize)
                }
                "resolve-from" if *environment.node_externals().await? => {
                    JsValue::WellKnownFunction(WellKnownFunctionKind::NodeResolveFrom)
                }
                "@grpc/proto-loader" if *environment.node_externals().await? => {
                    JsValue::WellKnownObject(WellKnownObjectKind::NodeProtobufLoader)
                }
                _ => JsValue::Unknown(
                    Some(Arc::new(v)),
                    "cross module analyzing is not yet supported",
                ),
            },
            JsValue::Argument(_) => JsValue::Unknown(
                Some(Arc::new(v)),
                "cross function analyzing is not yet supported",
            ),
            _ => {
                let (mut v, mut modified) = replace_well_known(v, environment).await?;
                modified = replace_builtin(&mut v) || modified;
                return Ok((v, modified));
            }
        },
        true,
    ))
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
            EsmExport::LocalBinding(magic_identifier::encode("default export")),
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
                            .unwrap_or_else(|| magic_identifier::encode("default export")),
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
    let options = origin.resolve_options();

    let options = apply_cjs_specific_options(options);

    let resolved = resolve(
        origin.origin_path().parent().resolve().await?,
        request,
        options,
    );

    if let ResolveResult::Single(source, _) = &*resolved.await? {
        Ok(webpack_runtime(*source, transforms))
    } else {
        Ok(WebpackRuntime::None.into())
    }
}

// TODO enable serialization
#[turbo_tasks::value(transparent, serialization = "none")]
pub struct AstPath(#[turbo_tasks(trace_ignore)] Vec<AstParentKind>);
