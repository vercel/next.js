pub mod cjs;
pub mod esm;
pub mod node;
pub mod raw;
pub mod typescript;

use std::{
    collections::HashMap,
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};

use anyhow::Result;
use lazy_static::lazy_static;
use regex::Regex;
use swc_common::{
    comments::CommentKind,
    errors::{DiagnosticId, Handler, HANDLER},
    pass::AstNodePath,
    Span, Spanned, GLOBALS,
};
use swc_ecma_visit::{AstParentNodeRef, VisitWithPath, AstParentKind};
use swc_ecmascript::{
    ast::{
        CallExpr, Callee, ComputedPropName, ExportAll, Expr, ExprOrSpread, ImportDecl,
        ImportSpecifier, Lit, MemberProp, ModuleExportName, NamedExport, VarDeclarator,
    },
    visit::VisitAstPath,
};
use turbo_tasks::{util::try_join_all, Value};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::AssetVc,
    context::AssetContextVc,
    reference::{AssetReferenceVc, AssetReferencesVc},
    resolve::{
        find_context_file, parse::RequestVc, pattern::Pattern, resolve,
        AffectingResolvingAssetReferenceVc, FindContextFileResult, ResolveResult,
    },
};

use self::{
    cjs::CjsAssetReferenceVc,
    esm::{EsmAssetReferenceVc, EsmAsyncAssetReferenceVc},
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
    parse::{parse, Buffer, ParseResult},
    resolve::{apply_cjs_specific_options, cjs_resolve},
    special_cases::special_cases,
    target::CompileTargetVc,
    utils::js_value_to_pattern,
    webpack::{
        parse::{webpack_runtime, WebpackRuntime, WebpackRuntimeVc},
        WebpackChunkAssetReference, WebpackEntryAssetReference, WebpackRuntimeAssetReference,
    },
    ModuleAssetType,
};

#[turbo_tasks::function]
pub(crate) async fn module_references(
    source: AssetVc,
    context: AssetContextVc,
    ty: Value<ModuleAssetType>,
    target: CompileTargetVc,
    node_native_bindings: bool,
) -> Result<AssetReferencesVc> {
    let mut references = Vec::new();
    let path = source.path();

    match &*find_context_file(path.parent(), "package.json").await? {
        FindContextFileResult::Found(package_json) => {
            references.push(PackageJsonReferenceVc::new(*package_json).into());
        }
        FindContextFileResult::NotFound => {}
    };

    let is_typescript = match &*ty {
        ModuleAssetType::Typescript | ModuleAssetType::TypescriptDeclaration => true,
        ModuleAssetType::Ecmascript => false,
    };

    if is_typescript {
        match &*find_context_file(path.parent(), "tsconfig.json").await? {
            FindContextFileResult::Found(tsconfig) => {
                references.push(TsConfigReferenceVc::new(*tsconfig, context).into());
            }
            FindContextFileResult::NotFound => {}
        };
    }

    special_cases(&path.await?.path, &mut references);

    let parsed = parse(source, ty).await?;
    match &*parsed {
        ParseResult::Ok {
            program,
            globals,
            eval_context,
            source_map,
            leading_comments,
            trailing_comments,
            ..
        } => {
            let pos = program.span().lo;
            if is_typescript {
                if let Some(comments) = leading_comments.get(&pos) {
                    for comment in comments.iter() {
                        match comment.kind {
                            CommentKind::Line => {
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
                                    references.push(
                                        TsReferencePathAssetReferenceVc::new(
                                            context,
                                            path.to_string(),
                                        )
                                        .into(),
                                    );
                                } else if let Some(m) = REFERENCE_TYPES.captures(text) {
                                    let types = &m[1];
                                    references.push(
                                        TsReferenceTypeAssetReferenceVc::new(
                                            context,
                                            types.to_string(),
                                        )
                                        .into(),
                                    );
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            trailing_comments.values().for_each(|comments| {
                comments.iter().for_each(|comment| match comment.kind {
                    CommentKind::Line => {
                        lazy_static! {
                            static ref SOURCE_MAP_FILE_REFERENCE: Regex =
                                Regex::new(r#"# sourceMappingURL=(.*?\.map)$"#).unwrap();
                        }
                        if let Some(m) = SOURCE_MAP_FILE_REFERENCE.captures(&comment.text) {
                            let path = &m[1];
                            references.push(
                                AffectingResolvingAssetReferenceVc::new(
                                    context.context_path().join(path),
                                )
                                .into(),
                            )
                        }
                    }
                    CommentKind::Block => {}
                });
            });

            let buf = Buffer::new();
            let handler =
                Handler::with_emitter_writer(Box::new(buf.clone()), Some(source_map.clone()));
            let (var_graph, webpack_runtime, webpack_entry, webpack_chunks) =
                HANDLER.set(&handler, || {
                    GLOBALS.set(globals, || {
                        let var_graph = create_graph(&program, eval_context);

                        // TODO migrate to effects
                        let mut visitor = AssetReferencesVisitor::new(context, &mut references);
                        program.visit_with_path(&mut visitor, &mut Default::default());

                        (
                            var_graph,
                            visitor.webpack_runtime,
                            visitor.webpack_entry,
                            visitor.webpack_chunks,
                        )
                    })
                });

            let mut ignore_effect_span = None;
            // Check if it was a webpack entry
            if let Some((request, span)) = webpack_runtime {
                let request = RequestVc::parse(Value::new(request.into()));
                let runtime = resolve_as_webpack_runtime(context, request);
                match &*runtime.await? {
                    WebpackRuntime::Webpack5 { .. } => {
                        ignore_effect_span = Some(span);
                        references.push(
                            WebpackRuntimeAssetReference {
                                context,
                                request,
                                runtime,
                            }
                            .into(),
                        );
                        if webpack_entry {
                            references.push(
                                WebpackEntryAssetReference {
                                    source,
                                    runtime,
                                }
                                .into(),
                            );
                        }
                        for chunk in webpack_chunks {
                            references.push(
                                WebpackChunkAssetReference {
                                    chunk_id: chunk,
                                    runtime,
                                }
                                .into(),
                            );
                        }
                    }
                    WebpackRuntime::None => {}
                }
            }

            fn handle_call_boxed<
                'a,
                FF: Future<Output = Result<JsValue>> + Send + 'a,
                F: Fn(JsValue) -> FF + Sync + 'a,
            >(
                handler: &'a Handler,
                source: AssetVc,
                context: AssetContextVc,
                ast_path: &'a Vec<AstParentKind>,
                span: Span,
                func: &'a JsValue,
                this: &'a JsValue,
                args: &'a Vec<JsValue>,
                link_value: &'a F,
                is_typescript: bool,
                references: &'a mut Vec<AssetReferenceVc>,
                target: CompileTargetVc,
                node_native_bindings: bool,
            ) -> Pin<Box<dyn Future<Output = Result<()>> + Send + 'a>> {
                Box::pin(handle_call(
                    handler,
                    source,
                    context,
                    ast_path,
                    span,
                    func,
                    this,
                    args,
                    link_value,
                    is_typescript,
                    references,
                    target,
                    node_native_bindings,
                ))
            }

            async fn handle_call<
                FF: Future<Output = Result<JsValue>> + Send,
                F: Fn(JsValue) -> FF + Sync,
            >(
                handler: &Handler,
                source: AssetVc,
                context: AssetContextVc,
                ast_path: &Vec<AstParentKind>,
                span: Span,
                func: &JsValue,
                this: &JsValue,
                args: &Vec<JsValue>,
                link_value: &F,
                is_typescript: bool,
                references: &mut Vec<AssetReferenceVc>,
                target: CompileTargetVc,
                node_native_bindings: bool,
            ) -> Result<()> {
                fn explain_args(args: &Vec<JsValue>) -> (String, String) {
                    JsValue::explain_args(&args, 10, 2)
                }
                let linked_args = || try_join_all(args.iter().map(|arg| link_value(arg.clone())));
                match func {
                    JsValue::Alternatives(_, alts) => {
                        for alt in alts {
                            handle_call_boxed(
                                handler,
                                source,
                                context,
                                ast_path,
                                span,
                                alt,
                                this,
                                args,
                                link_value,
                                is_typescript,
                                references,
                                target,
                                node_native_bindings,
                            )
                            .await?;
                        }
                    }
                    JsValue::Member(_, obj, props) => {
                        if let JsValue::Array(..) = &**obj {
                            let args = linked_args().await?;
                            let linked_array = link_value(JsValue::MemberCall(
                                args.len(),
                                obj.clone(),
                                props.clone(),
                                args,
                            ))
                            .await?;
                            if let JsValue::Array(_, elements) = linked_array {
                                for ele in elements {
                                    if let JsValue::Call(_, callee, args) = ele {
                                        handle_call_boxed(
                                            handler,
                                            source,
                                            context,
                                            ast_path,
                                            span,
                                            &callee,
                                            this,
                                            &args,
                                            link_value,
                                            is_typescript,
                                            references,
                                            target,
                                            node_native_bindings,
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
                            references.push(
                                EsmAsyncAssetReferenceVc::new(
                                    context,
                                    RequestVc::parse(Value::new(pat)),
                                    AstPathVc::cell(ast_path.clone()),
                                )
                                .into(),
                            );
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
                            references.push(
                                CjsAssetReferenceVc::new(
                                    context,
                                    RequestVc::parse(Value::new(pat)),
                                )
                                .into(),
                            );
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
                            references.push(
                                CjsAssetReferenceVc::new(
                                    context,
                                    RequestVc::parse(Value::new(pat)),
                                )
                                .into(),
                            );
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
                        if args.len() >= 1 {
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
                            references.push(SourceAssetReferenceVc::new(source, pat.into()).into());
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
                        references.push(SourceAssetReferenceVc::new(source, pat.into()).into());
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
                        references.push(DirAssetReferenceVc::new(source, pat.into()).into());
                        return Ok(());
                    }
                    JsValue::WellKnownFunction(WellKnownFunctionKind::ChildProcessSpawnMethod(
                        name,
                    )) => {
                        let args = linked_args().await?;
                        if args.len() >= 1 {
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
                                references.push(
                                    CjsAssetReferenceVc::new(
                                        context,
                                        RequestVc::parse(Value::new(pat)),
                                    )
                                    .into(),
                                );
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
                            references.push(SourceAssetReferenceVc::new(source, pat.into()).into());
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
                        if args.len() >= 1 {
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
                            references.push(
                                CjsAssetReferenceVc::new(
                                    context,
                                    RequestVc::parse(Value::new(pat)),
                                )
                                .into(),
                            );
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
                            references.push(
                                NodePreGypConfigReferenceVc::new(
                                    source.path().parent(),
                                    pat.into(),
                                    target,
                                )
                                .into(),
                            );
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
                        use crate::{
                            analyzer::ConstantValue,
                            resolve::node_native_binding::NodeGypBuildReferenceVc,
                        };

                        let args = linked_args().await?;
                        if args.len() == 1 {
                            let first_arg = link_value(args[0].clone()).await?;
                            if let JsValue::Constant(ConstantValue::Str(ref s)) = first_arg {
                                let current_context = FileSystemPathVc::new(
                                    source.path().fs(),
                                    s.trim_start_matches("/ROOT/"),
                                );
                                references.push(
                                    NodeGypBuildReferenceVc::new(current_context, target).into(),
                                );
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
                        use crate::{
                            analyzer::ConstantValue,
                            resolve::node_native_binding::NodeBindingsReferenceVc,
                        };

                        let args = linked_args().await?;
                        if args.len() == 1 {
                            let first_arg = link_value(args[0].clone()).await?;
                            if let JsValue::Constant(ConstantValue::Str(ref s)) = first_arg {
                                references.push(
                                    NodeBindingsReferenceVc::new(source.path(), s.to_string())
                                        .into(),
                                );
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
                            if let Some(JsValue::Constant(ConstantValue::Str(s))) =
                                linked_args.get(0)
                            {
                                let pkg_or_dir = linked_args.get(1).unwrap();
                                let pat = js_value_to_pattern(&pkg_or_dir);
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
                                match &**s {
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
                                            references.push(
                                                DirAssetReferenceVc::new(
                                                    source,
                                                    abs_pattern.into(),
                                                )
                                                .into(),
                                            );
                                            return Ok(());
                                        }
                                    }
                                    "view engine" => {
                                        if let JsValue::Constant(ConstantValue::Str(pkg)) =
                                            pkg_or_dir
                                        {
                                            if pkg != "html" {
                                                let pat = js_value_to_pattern(&pkg_or_dir);
                                                references.push(
                                                    CjsAssetReferenceVc::new(
                                                        context,
                                                        RequestVc::parse(Value::new(pat)),
                                                    )
                                                    .into(),
                                                );
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
                        if let Some(JsValue::Constant(ConstantValue::Str(p))) = linked_args.get(0) {
                            let abs_pattern = if p.starts_with("/ROOT/") {
                                Pattern::Constant(format!("{p}/intl"))
                            } else {
                                let linked_func_call = link_value(JsValue::call(
                                    box JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin),
                                    vec![
                                        JsValue::FreeVar(FreeVarKind::Dirname),
                                        JsValue::Constant(ConstantValue::Str(p.clone())),
                                        JsValue::Constant(ConstantValue::Str("intl".into())),
                                    ],
                                ))
                                .await?;
                                js_value_to_pattern(&linked_func_call)
                            };
                            references
                                .push(DirAssetReferenceVc::new(source, abs_pattern.into()).into());
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
                        if args.len() == 2 {
                            if let Some(JsValue::Constant(ConstantValue::Str(_))) = args.get(1) {
                                references.push(
                                    CjsAssetReferenceVc::new(
                                        context,
                                        RequestVc::parse(Value::new(js_value_to_pattern(&args[1]))),
                                    )
                                    .into(),
                                );
                                return Ok(());
                            }
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
                                            JsValue::Constant(ConstantValue::Str(key)),
                                            JsValue::Array(_, dirs),
                                        ) = object_part
                                        {
                                            if key == "includeDirs" {
                                                return Some(dirs.iter().filter_map(|dir| {
                                                    if let JsValue::Constant(ConstantValue::Str(
                                                        dir_str,
                                                    )) = dir
                                                    {
                                                        Some(dir_str.to_string())
                                                    } else {
                                                        None
                                                    }
                                                }));
                                            }
                                        }
                                        None
                                    })
                                    .flatten()
                                {
                                    references.push(
                                        DirAssetReferenceVc::new(
                                            source,
                                            Pattern::Constant(dir).into(),
                                        )
                                        .into(),
                                    );
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

            let cache = Mutex::new(LinkCache::new());
            let linker =
                |value| value_visitor(source, context, value, target, node_native_bindings);
            let link_value = |value| link(&var_graph, value, &linker, &cache);

            for effect in var_graph.effects.iter() {
                match effect {
                    Effect::Call {
                        func,
                        args,
                        ast_path,
                        span
                    } => {
                        if let Some(ignored) = &ignore_effect_span
                        {
                            if ignored == span {
                                continue;
                            }
                        }
                        let func = link_value(func.clone()).await?;

                        handle_call(
                            &handler,
                            source,
                            context,
                            &ast_path,
                            *span,
                            &func,
                            &JsValue::Unknown(None, "no this provided"),
                            &args,
                            &link_value,
                            is_typescript,
                            &mut references,
                            target,
                            node_native_bindings,
                        )
                        .await?;
                    }
                    Effect::MemberCall {
                        obj,
                        prop,
                        args,
                        ast_path,
                        span
                    } => {
                        if let Some(ignored) = &ignore_effect_span
                        {
                            if ignored == span {
                                continue;
                            }
                        }
                        let obj = link_value(obj.clone()).await?;
                        let func =
                            link_value(JsValue::member(box obj.clone(), box prop.clone())).await?;

                        handle_call(
                            &handler,
                            source,
                            context,
                            &ast_path,
                            *span,
                            &func,
                            &obj,
                            &args,
                            &link_value,
                            is_typescript,
                            &mut references,
                            target,
                            node_native_bindings,
                        )
                        .await?;
                    }
                }
            }
            if !buf.is_empty() {
                // TODO report them in a stream
                println!("{}", buf);
            }
        }
        ParseResult::Unparseable | ParseResult::NotFound => {}
    };
    Ok(AssetReferencesVc::cell(references))
}

async fn as_abs_path(path: FileSystemPathVc) -> Result<JsValue> {
    Ok(format!("/ROOT/{}", path.await?.path.as_str()).into())
}

async fn value_visitor(
    source: AssetVc,
    context: AssetContextVc,
    v: JsValue,
    target: CompileTargetVc,
    node_native_bindings: bool,
) -> Result<(JsValue, bool)> {
    let (mut v, m) = value_visitor_inner(source, context, v, target, node_native_bindings).await?;
    v.normalize_shallow();
    Ok((v, m))
}

async fn value_visitor_inner(
    source: AssetVc,
    context: AssetContextVc,
    v: JsValue,
    target: CompileTargetVc,
    node_native_bindings: bool,
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
                    let resolved = cjs_resolve(request, context).await?;
                    match &*resolved {
                        ResolveResult::Single(asset, _) => as_abs_path(asset.path()).await?,
                        ResolveResult::Alternatives(assets, _) => JsValue::alternatives(
                            try_join_all(assets.iter().map(|asset| as_abs_path(asset.path())))
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
            JsValue::Module(ref name) => match &**name {
                // TODO check externals
                "path" => JsValue::WellKnownObject(WellKnownObjectKind::PathModule),
                "fs/promises" => JsValue::WellKnownObject(WellKnownObjectKind::FsModule),
                "fs" => JsValue::WellKnownObject(WellKnownObjectKind::FsModule),
                "child_process" => JsValue::WellKnownObject(WellKnownObjectKind::ChildProcess),
                "os" => JsValue::WellKnownObject(WellKnownObjectKind::OsModule),
                "process" => JsValue::WellKnownObject(WellKnownObjectKind::NodeProcess),
                "@mapbox/node-pre-gyp" if node_native_bindings => {
                    JsValue::WellKnownObject(WellKnownObjectKind::NodePreGyp)
                }
                "node-gyp-build" if node_native_bindings => {
                    JsValue::WellKnownFunction(WellKnownFunctionKind::NodeGypBuild)
                }
                "bindings" if node_native_bindings => {
                    JsValue::WellKnownFunction(WellKnownFunctionKind::NodeBindings)
                }
                "express" if node_native_bindings => {
                    JsValue::WellKnownFunction(WellKnownFunctionKind::NodeExpress)
                }
                "strong-globalize" if node_native_bindings => {
                    JsValue::WellKnownFunction(WellKnownFunctionKind::NodeStrongGlobalize)
                }
                "resolve-from" if node_native_bindings => {
                    JsValue::WellKnownFunction(WellKnownFunctionKind::NodeResolveFrom)
                }
                "@grpc/proto-loader" if node_native_bindings => {
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
                let (mut v, m1) = replace_well_known(v, target).await?;
                let m2 = replace_builtin(&mut v);
                return Ok((v, m1 || m2));
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

#[derive(Default)]
struct StaticAnalyser {
    imports: HashMap<String, (String, Vec<String>)>,
}

impl StaticAnalyser {
    fn prop_to_name(&self, prop: &MemberProp) -> Option<String> {
        match prop {
            MemberProp::Ident(ident) => Some(ident.sym.to_string()),
            MemberProp::PrivateName(_) => None,
            MemberProp::Computed(ComputedPropName { expr, .. }) => {
                match self.evaluate_expr(&**expr) {
                    StaticExpr::String(str) => Some(str),
                    _ => None,
                }
            }
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
    context: AssetContextVc,
    old_analyser: StaticAnalyser,
    references: &'a mut Vec<AssetReferenceVc>,
    webpack_runtime: Option<(String, Span)>,
    webpack_entry: bool,
    webpack_chunks: Vec<Lit>,
}
impl<'a> AssetReferencesVisitor<'a> {
    fn new(context: AssetContextVc, references: &'a mut Vec<AssetReferenceVc>) -> Self {
        Self {
            context,
            old_analyser: StaticAnalyser::default(),
            references,
            webpack_runtime: None,
            webpack_entry: false,
            webpack_chunks: Vec::new(),
        }
    }
}

fn as_parent_path(ast_path: &AstNodePath<AstParentNodeRef<'_>>) -> Vec<AstParentKind> {
    ast_path.iter().map(|n| n.kind()).collect()
}

impl<'a> VisitAstPath for AssetReferencesVisitor<'a> {
    fn visit_export_all<'ast: 'r, 'r>(
        &mut self,
        export: &'ast ExportAll,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let src = export.src.value.to_string();
        self.references.push(
            // TODO create a separate AssetReference for this
            EsmAssetReferenceVc::new(
                self.context,
                RequestVc::parse(Value::new(src.into())),
                AstPathVc::cell(as_parent_path(ast_path)),
            )
            .into(),
        );
        export.visit_children_with_path(self, ast_path);
    }
    fn visit_named_export<'ast: 'r, 'r>(
        &mut self,
        export: &'ast NamedExport,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if let Some(src) = &export.src {
            let src = src.value.to_string();
            self.references.push(
                // TODO create a separate AssetReference for this
                EsmAssetReferenceVc::new(
                    self.context,
                    RequestVc::parse(Value::new(src.into())),
                    AstPathVc::cell(as_parent_path(ast_path)),
                )
                .into(),
            );
        }
        export.visit_children_with_path(self, ast_path);
    }
    fn visit_import_decl<'ast: 'r, 'r>(
        &mut self,
        import: &'ast ImportDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let src = import.src.value.to_string();
        self.references.push(
            EsmAssetReferenceVc::new(
                self.context,
                RequestVc::parse(Value::new(src.clone().into())),
                AstPathVc::cell(as_parent_path(ast_path)),
            )
            .into(),
        );
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
                                        if let Some(lit) = expr.as_lit() {
                                            if let Lit::Str(str) = lit {
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
        }
        decl.visit_children_with_path(self, ast_path);
    }

    fn visit_call_expr<'ast: 'r, 'r>(
        &mut self,
        call: &'ast CallExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        match &call.callee {
            Callee::Expr(expr) => match self.old_analyser.evaluate_expr(&expr) {
                StaticExpr::FreeVar(var) => match &var[..] {
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
                                for elem in array.elems.iter() {
                                    if let Some(ExprOrSpread { spread: None, expr }) = elem {
                                        if let Some(lit) = expr.as_lit() {
                                            self.webpack_chunks.push(lit.clone());
                                        }
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                },
                _ => {}
            },
            _ => {}
        }
        call.visit_children_with_path(self, ast_path);
    }
}

#[turbo_tasks::function]
async fn resolve_as_webpack_runtime(
    context: AssetContextVc,
    request: RequestVc,
) -> Result<WebpackRuntimeVc> {
    let options = context.resolve_options();

    let options = apply_cjs_specific_options(options);

    let resolved = resolve(context.context_path(), request, options);

    if let ResolveResult::Single(source, _) = &*resolved.await? {
        Ok(webpack_runtime(*source))
    } else {
        Ok(WebpackRuntime::None.into())
    }
}

// TODO enable serialization
#[turbo_tasks::value(transparent, serialization: none)]
pub struct AstPath(#[trace_ignore] Vec<AstParentKind>);
