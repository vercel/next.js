use super::errors;
use super::{utils::js_value_to_pattern, ModuleAssetType};
use crate::analyzer::{
    builtin::replace_builtin,
    graph::{create_graph, Effect},
    linker::{link, LinkCache},
    well_known::replace_well_known,
    ConstantValue, FreeVarKind, JsValue, WellKnownFunctionKind, WellKnownObjectKind,
};
use crate::target::CompileTargetVc;
use anyhow::Result;
use lazy_static::lazy_static;
use regex::Regex;
use std::collections::HashSet;
use std::{
    collections::HashMap,
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};
use swc_common::{
    comments::CommentKind,
    errors::{DiagnosticId, Handler, HANDLER},
    Span, Spanned, GLOBALS,
};
use swc_ecmascript::{
    ast::{
        CallExpr, Callee, ComputedPropName, ExportAll, Expr, ExprOrSpread, ImportDecl,
        ImportSpecifier, Lit, MemberProp, ModuleExportName, NamedExport, VarDeclarator,
    },
    visit::{self, Visit, VisitWith},
};
use turbo_tasks::ValueToString;
use turbo_tasks::{util::try_join_all, Value, Vc};
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPathVc};
use turbopack_core::{
    asset::AssetVc,
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{
        find_context_file,
        parse::RequestVc,
        pattern::{Pattern, PatternVc},
        resolve, resolve_raw, FindContextFileResult, ResolveResult, ResolveResultVc,
    },
    source_asset::SourceAssetVc,
};

use super::{
    parse::{parse, Buffer, ParseResult},
    resolve::{apply_cjs_specific_options, cjs_resolve, esm_resolve},
    special_cases::special_cases,
    typescript::{resolve::type_resolve, TsConfigModuleAssetVc},
    webpack::{
        parse::{webpack_runtime, WebpackRuntime, WebpackRuntimeVc},
        WebpackChunkAssetReference, WebpackEntryAssetReference, WebpackRuntimeAssetReference,
    },
};

#[turbo_tasks::function]
pub async fn module_references(
    source: AssetVc,
    context: AssetContextVc,
    ty: Value<ModuleAssetType>,
    target: CompileTargetVc,
    node_native_bindings: bool,
) -> Result<Vc<Vec<AssetReferenceVc>>> {
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
            ..
        } => {
            if is_typescript {
                let pos = program.span().lo;
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

            let buf = Buffer::new();
            let handler =
                Handler::with_emitter_writer(Box::new(buf.clone()), Some(source_map.clone()));
            let (var_graph, webpack_runtime, webpack_entry, webpack_chunks) =
                HANDLER.set(&handler, || {
                    GLOBALS.set(globals, || {
                        let var_graph = create_graph(&program, eval_context);

                        // TODO migrate to effects
                        let mut visitor =
                            AssetReferencesVisitor::new(context, is_typescript, &mut references);
                        program.visit_with(&mut visitor);

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
                                context: context,
                                request: request,
                                runtime: runtime,
                            }
                            .into(),
                        );
                        if webpack_entry {
                            references.push(
                                WebpackEntryAssetReference {
                                    source: source,
                                    runtime: runtime,
                                }
                                .into(),
                            );
                        }
                        for chunk in webpack_chunks {
                            references.push(
                                WebpackChunkAssetReference {
                                    chunk_id: chunk,
                                    runtime: runtime,
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
                span: &'a Span,
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
                span: &Span,
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
                                    *span,
                                    &format!("import({args}) is very dynamic{hints}",),
                                    DiagnosticId::Lint(
                                        errors::failed_to_analyse::ecmascript::DYNAMIC_IMPORT
                                            .to_string(),
                                    ),
                                )
                            }
                            references.push(
                                EsmAssetReferenceVc::new(
                                    context,
                                    RequestVc::parse(Value::new(pat)),
                                    is_typescript,
                                )
                                .into(),
                            );
                            return Ok(());
                        }
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            *span,
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
                                    *span,
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
                            *span,
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
                                    *span,
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
                            *span,
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
                                    *span,
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
                            *span,
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
                                parent_path.path.as_str().into(),
                            )),
                            args,
                        ))
                        .await?;

                        let pat = js_value_to_pattern(&linked_func_call);
                        if !pat.has_constant_parts() {
                            let (args, hints) = explain_args(&linked_args().await?);
                            handler.span_warn_with_code(
                                *span,
                                &format!("path.resolve({args}) is very dynamic{hints}",),
                                DiagnosticId::Lint(
                                    errors::failed_to_analyse::ecmascript::PATH_METHOD.to_string(),
                                ),
                            )
                        }
                        references.push(DirAssetReferenceVc::new(source, pat.into()).into());
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
                                *span,
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
                                    *span,
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
                            *span,
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
                                    *span,
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
                            *span,
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
                                    *span,
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
                            *span,
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
                        use crate::analyzer::ConstantValue;
                        use crate::resolve::node_native_binding::NodeGypBuildReferenceVc;

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
                            *span,
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
                        use crate::analyzer::ConstantValue;
                        use crate::resolve::node_native_binding::NodeBindingsReferenceVc;

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
                            *span,
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
                                        *span,
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
                            *span,
                            &format!(
                                "require('express')().set({args}) is not statically \
                                 analyse-able{hints}",
                            ),
                            DiagnosticId::Error(
                                errors::failed_to_analyse::ecmascript::NODE_GYP_BUILD.to_string(),
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
                            *span,
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
                        println!("{:?}, {:?}", func, this);
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
                            *span,
                            &format!(
                                "require('resolve-from')({args}) is not statically \
                                 analyse-able{hints}",
                            ),
                            DiagnosticId::Error(
                                errors::failed_to_analyse::ecmascript::NODE_GYP_BUILD.to_string(),
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
                    Effect::Call { func, args, span } => {
                        if let Some(ignored) = &ignore_effect_span {
                            if ignored == span {
                                continue;
                            }
                        }
                        let func = link_value(func.clone()).await?;

                        handle_call(
                            &handler,
                            source,
                            context,
                            &span,
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
                        span,
                    } => {
                        if let Some(ignored) = &ignore_effect_span {
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
                            &span,
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
    Ok(Vc::slot(references))
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
    is_typescript: bool,
    old_analyser: StaticAnalyser,
    references: &'a mut Vec<AssetReferenceVc>,
    webpack_runtime: Option<(String, Span)>,
    webpack_entry: bool,
    webpack_chunks: Vec<Lit>,
}
impl<'a> AssetReferencesVisitor<'a> {
    fn new(
        context: AssetContextVc,
        is_typescript: bool,
        references: &'a mut Vec<AssetReferenceVc>,
    ) -> Self {
        Self {
            context,
            is_typescript,
            old_analyser: StaticAnalyser::default(),
            references,
            webpack_runtime: None,
            webpack_entry: false,
            webpack_chunks: Vec::new(),
        }
    }
}

impl<'a> Visit for AssetReferencesVisitor<'a> {
    fn visit_export_all(&mut self, export: &ExportAll) {
        let src = export.src.value.to_string();
        self.references.push(
            EsmAssetReferenceVc::new(
                self.context,
                RequestVc::parse(Value::new(src.into())),
                self.is_typescript,
            )
            .into(),
        );
        visit::visit_export_all(self, export);
    }
    fn visit_named_export(&mut self, export: &NamedExport) {
        if let Some(src) = &export.src {
            let src = src.value.to_string();
            self.references.push(
                EsmAssetReferenceVc::new(
                    self.context,
                    RequestVc::parse(Value::new(src.into())),
                    self.is_typescript,
                )
                .into(),
            );
        }
        visit::visit_named_export(self, export);
    }
    fn visit_import_decl(&mut self, import: &ImportDecl) {
        let src = import.src.value.to_string();
        self.references.push(
            EsmAssetReferenceVc::new(
                self.context,
                RequestVc::parse(Value::new(src.clone().into())),
                self.is_typescript,
            )
            .into(),
        );
        visit::visit_import_decl(self, import);
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

    fn visit_var_declarator(&mut self, decl: &VarDeclarator) {
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
        visit::visit_var_declarator(self, decl);
    }

    fn visit_call_expr(&mut self, call: &CallExpr) {
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
        visit::visit_call_expr(self, call);
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

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Clone, Debug, PartialEq, Eq)]
pub struct PackageJsonReference {
    pub package_json: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl PackageJsonReferenceVc {
    #[turbo_tasks::function]
    pub fn new(package_json: FileSystemPathVc) -> Self {
        Self::slot(PackageJsonReference { package_json })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for PackageJsonReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::Single(SourceAssetVc::new(self.package_json).into(), Vec::new()).into()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<String>> {
        Ok(Vc::slot(format!(
            "package.json {}",
            self.package_json.to_string().await?,
        )))
    }
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Clone, Debug, PartialEq, Eq)]
pub struct TsConfigReference {
    pub tsconfig: FileSystemPathVc,
    pub context: AssetContextVc,
}

#[turbo_tasks::value_impl]
impl TsConfigReferenceVc {
    #[turbo_tasks::function]
    pub fn new(tsconfig: FileSystemPathVc, context: AssetContextVc) -> Self {
        Self::slot(TsConfigReference { tsconfig, context })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsConfigReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        let context = self.context.with_context_path(self.tsconfig.parent());
        ResolveResult::Single(
            TsConfigModuleAssetVc::new(SourceAssetVc::new(self.tsconfig).into(), context).into(),
            Vec::new(),
        )
        .into()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<String>> {
        Ok(Vc::slot(format!(
            "tsconfig {}",
            self.tsconfig.to_string().await?,
        )))
    }
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Debug, PartialEq, Eq)]
pub struct EsmAssetReference {
    pub context: AssetContextVc,
    pub request: RequestVc,
}

#[turbo_tasks::value_impl]
impl EsmAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, request: RequestVc, from_typescript: bool) -> Self {
        Self::slot(EsmAssetReference { context, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for EsmAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        esm_resolve(self.request, self.context)
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<String>> {
        Ok(Vc::slot(format!(
            "import {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Debug, PartialEq, Eq)]
pub struct CjsAssetReference {
    pub context: AssetContextVc,
    pub request: RequestVc,
}

#[turbo_tasks::value_impl]
impl CjsAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, request: RequestVc) -> Self {
        Self::slot(CjsAssetReference { context, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for CjsAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        cjs_resolve(self.request, self.context)
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<String>> {
        Ok(Vc::slot(format!(
            "require {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Debug, PartialEq, Eq)]
pub struct TsReferencePathAssetReference {
    pub context: AssetContextVc,
    pub path: String,
}

#[turbo_tasks::value_impl]
impl TsReferencePathAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, path: String) -> Self {
        Self::slot(TsReferencePathAssetReference { context, path })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsReferencePathAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        Ok(
            if let Some(path) = &*self.context.context_path().try_join(&self.path).await? {
                ResolveResult::Single(
                    self.context.process(SourceAssetVc::new(*path).into()),
                    Vec::new(),
                )
                .into()
            } else {
                ResolveResult::unresolveable().into()
            },
        )
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<String>> {
        Ok(Vc::slot(format!(
            "typescript reference path comment {}",
            self.path,
        )))
    }
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Debug, PartialEq, Eq)]
pub struct TsReferenceTypeAssetReference {
    pub context: AssetContextVc,
    pub module: String,
}

#[turbo_tasks::value_impl]
impl TsReferenceTypeAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, module: String) -> Self {
        Self::slot(TsReferenceTypeAssetReference { context, module })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsReferenceTypeAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        type_resolve(
            RequestVc::module(self.module.clone(), Value::new("".to_string().into())),
            self.context,
        )
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<String>> {
        Ok(Vc::slot(format!(
            "typescript reference type comment {}",
            self.module,
        )))
    }
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Debug, PartialEq, Eq)]
pub struct SourceAssetReference {
    pub source: AssetVc,
    pub path: PatternVc,
}

#[turbo_tasks::value_impl]
impl SourceAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, path: PatternVc) -> Self {
        Self::slot(SourceAssetReference { source, path })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for SourceAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        let context = self.source.path().parent();

        Ok(resolve_raw(context, self.path, false))
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<String>> {
        Ok(Vc::slot(format!(
            "raw asset {}",
            self.path.to_string().await?,
        )))
    }
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Debug, PartialEq, Eq)]
pub struct DirAssetReference {
    pub source: AssetVc,
    pub path: PatternVc,
}

#[turbo_tasks::value_impl]
impl DirAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, path: PatternVc) -> Self {
        Self::slot(DirAssetReference { source, path })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for DirAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        let context_path = self.source.path().await?;
        // ignore path.join in `node-gyp`, it will includes too many files
        if context_path.path.contains("node_modules/node-gyp") {
            return Ok(ResolveResult::Alternatives(HashSet::default(), vec![]).into());
        }
        let context = self.source.path().parent();
        let pat = self.path.await?;
        let mut result = HashSet::default();
        let fs = context.fs();
        match &*pat {
            Pattern::Constant(p) => {
                let dest_file_path = FileSystemPathVc::new(fs, p.trim_start_matches("/ROOT/"));
                // ignore error
                if let Ok(entry_type) = dest_file_path.get_type().await {
                    match &*entry_type {
                        FileSystemEntryType::Directory => {
                            result = read_dir(dest_file_path).await?;
                        }
                        FileSystemEntryType::File => {
                            result.insert(SourceAssetVc::new(dest_file_path).into());
                        }
                        _ => {}
                    }
                }
            }
            Pattern::Alternatives(alternatives) => {
                for alternative_pattern in alternatives {
                    let mut pat = alternative_pattern.clone();
                    pat.normalize();
                    if let Pattern::Constant(p) = pat {
                        let dest_file_path =
                            FileSystemPathVc::new(fs, p.trim_start_matches("/ROOT/"));
                        // ignore error
                        if let Ok(entry_type) = dest_file_path.get_type().await {
                            match &*entry_type {
                                FileSystemEntryType::Directory => {
                                    result.extend(read_dir(dest_file_path).await?);
                                }
                                FileSystemEntryType::File => {
                                    result.insert(SourceAssetVc::new(dest_file_path).into());
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(ResolveResult::Alternatives(result, vec![]).into())
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<String>> {
        Ok(Vc::slot(format!(
            "directory assets {}",
            self.path.to_string().await?,
        )))
    }
}

async fn read_dir(p: FileSystemPathVc) -> Result<HashSet<AssetVc>> {
    let mut result = HashSet::default();
    let dir_entries = p.read_dir().await?;
    if let DirectoryContent::Entries(entries) = &*dir_entries {
        for (_, entry) in entries.iter() {
            match entry {
                DirectoryEntry::File(file) => {
                    result.insert(SourceAssetVc::new(*file).into());
                }
                DirectoryEntry::Directory(dir) => {
                    let sub = read_dir_boxed(*dir).await?;
                    result.extend(sub);
                }
                _ => {}
            }
        }
    }
    Ok(result)
}

fn read_dir_boxed(
    p: FileSystemPathVc,
) -> Pin<Box<dyn Future<Output = Result<HashSet<AssetVc>>> + Send>> {
    Box::pin(read_dir(p))
}
