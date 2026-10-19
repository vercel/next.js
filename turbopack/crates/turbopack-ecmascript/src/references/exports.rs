use anyhow::{Result, bail};
use rustc_hash::FxHashSet;
use swc_core::{
    common::{GLOBALS, source_map::SmallPos},
    ecma::ast::{Expr, Ident, ImportDecl, MemberProp, Program, Stmt},
};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    issue::{IssueExt, IssueSource},
    reference::ModuleReference,
    resolve::ModulePart,
};

use crate::{
    AnalyzeMode, EcmascriptModuleAsset, EcmascriptParsable, ModuleTypeResult, SpecifiedModuleType,
    analyzer::{
        Bump,
        graph::{EvalContext, create_graph},
        imports::{ImportAnnotations, ImportedSymbol},
    },
    chunk::{CjsStaticExports, EcmascriptExports},
    module_fragments::{part_of_module, split_module},
    parse::ParseResult,
    references::{
        TURBOPACK_HELPER_WTF8,
        esm::{EsmAssetReference, EsmAssetReferenceOptions, EsmExports},
        type_issue::SpecifiedModuleTypeIssue,
    },
    runtime_functions::{TURBOPACK_EXPORT_NAMESPACE, TURBOPACK_EXPORT_VALUE},
};

#[turbo_tasks::value]
pub struct EcmascriptExportsAnalysis {
    pub exports: ResolvedVc<EcmascriptExports>,
    pub import_references: Box<[ResolvedVc<EsmAssetReference>]>,
    pub esm_reexport_reference_idxs: Box<[usize]>,
    pub esm_evaluation_reference_idxs: Box<[usize]>,
}

#[turbo_tasks::function]
pub async fn compute_ecmascript_module_exports(
    module: ResolvedVc<EcmascriptModuleAsset>,
    part: Option<ModulePart>,
) -> Result<Vc<EcmascriptExportsAnalysis>> {
    let raw_module = module.await?;
    let source = raw_module.source;
    let options = raw_module.options.await?;
    let import_externals = options.import_externals;

    let parsed = if let Some(part) = part {
        let split_data = split_module(*module);
        part_of_module(split_data, part)
    } else {
        module.failsafe_parse()
    };

    let parsed = parsed.await?;
    let ParseResult::Ok {
        program,
        eval_context,
        ..
    } = &*parsed
    else {
        return Ok(EcmascriptExportsAnalysis {
            exports: EcmascriptExports::Unknown.resolved_cell(),
            import_references: Box::new([]),
            esm_reexport_reference_idxs: Box::new([]),
            esm_evaluation_reference_idxs: Box::new([]),
        }
        .cell());
    };

    let ModuleTypeResult {
        module_type: specified_type,
        ..
    } = *module.determine_module_type().await?;

    let inner_assets = if let Some(assets) = raw_module.inner_assets {
        Some(assets.await?)
    } else {
        None
    };

    let mut esm_reexport_reference_idxs: Vec<usize> = vec![];
    let mut esm_evaluation_reference_idxs: Vec<usize> = vec![];
    let namespace_reexports: FxHashSet<usize> =
        eval_context.imports.reexport_namespaces().collect();

    let span = tracing::trace_span!("esm import references");
    let import_references = async {
        let mut import_references = Vec::with_capacity(eval_context.imports.references().len());
        for (i, r) in eval_context.imports.references().enumerate() {
            let mut should_add_evaluation = false;

            let resolve_override = if let Some(inner_assets) = &inner_assets
                && let Some(req) = r.module_path.as_str()
                && let Some(a) = inner_assets.get(req)
            {
                Some(*a)
            } else {
                None
            };

            let reference = EsmAssetReference::new(
                module,
                ResolvedVc::upcast(module),
                RcStr::from(&*r.module_path.to_string_lossy()),
                EsmAssetReferenceOptions {
                    issue_source: IssueSource::from_swc_offsets(
                        source,
                        r.span.lo.to_u32(),
                        r.span.hi.to_u32(),
                    ),
                    annotations: r.annotations.as_ref().map(|a| (**a).clone()),
                    export_name: match &r.imported_symbol {
                        &ImportedSymbol::ModuleEvaluation => {
                            should_add_evaluation = true;
                            Some(ModulePart::evaluation())
                        }
                        ImportedSymbol::Symbol(name) => Some(ModulePart::export((&**name).into())),
                        ImportedSymbol::PartEvaluation(part_id) | ImportedSymbol::Part(part_id) => {
                            if !options.module_fragments_enabled {
                                bail!(
                                    "Internal imports only exist in reexports only mode when \
                                     importing {:?} from {}",
                                    r.imported_symbol,
                                    r.module_path.to_string_lossy()
                                );
                            }
                            if matches!(&r.imported_symbol, ImportedSymbol::PartEvaluation(_)) {
                                should_add_evaluation = true;
                            }
                            Some(ModulePart::internal(*part_id))
                        }
                        ImportedSymbol::Exports => {
                            options.module_fragments_enabled.then(ModulePart::exports)
                        }
                    },
                    import_usage: eval_context
                        .imports
                        .import_usage
                        .get(&i)
                        .cloned()
                        .unwrap_or_default(),
                    import_externals,
                    module_fragments_enabled: options.module_fragments_enabled,
                    export_usage_passthrough: namespace_reexports.contains(&i).then_some(false),
                    resolve_override,
                },
            )
            .await?
            .resolved_cell();

            import_references.push(reference);
            if should_add_evaluation {
                esm_evaluation_reference_idxs.push(i);
            }
        }
        anyhow::Ok(import_references)
    }
    .instrument(span)
    .await?;

    let span = tracing::trace_span!("exports");
    let exports = async {
        let esm_star_exports: Vec<ResolvedVc<Box<dyn ModuleReference>>> = eval_context
            .imports
            .reexport_namespaces()
            .map(|i| ResolvedVc::upcast(import_references[i]))
            .collect();
        let esm_exports = eval_context
            .imports
            .as_esm_exports(&import_references, eval_context)?;

        for idx in eval_context.imports.reexports_reference_idxs() {
            esm_reexport_reference_idxs.push(idx);
        }

        anyhow::Ok(
            if !esm_exports.is_empty() || !esm_star_exports.is_empty() {
                if specified_type == SpecifiedModuleType::CommonJs {
                    SpecifiedModuleTypeIssue {
                        // TODO(PACK-4879): this should point at one of the exports
                        source: IssueSource::from_source_only(source),
                        specified_type,
                    }
                    .resolved_cell()
                    .emit();
                }

                let esm_exports = EsmExports {
                    exports: esm_exports,
                    star_exports: esm_star_exports,
                    mangle_export_names: options.mangle_export_names,
                }
                .cell();

                EcmascriptExports::EsmExports(esm_exports.to_resolved().await?)
            } else if specified_type == SpecifiedModuleType::EcmaScript {
                match detect_dynamic_export(program) {
                    DetectedDynamicExportType::CommonJs => {
                        SpecifiedModuleTypeIssue {
                            // TODO(PACK-4879): this should point at the source location of the
                            // commonjs export
                            source: IssueSource::from_source_only(source),
                            specified_type,
                        }
                        .resolved_cell()
                        .emit();

                        EcmascriptExports::EsmExports(
                            EsmExports {
                                exports: Default::default(),
                                star_exports: Default::default(),
                                mangle_export_names: options.mangle_export_names,
                            }
                            .resolved_cell(),
                        )
                    }
                    DetectedDynamicExportType::Namespace => EcmascriptExports::DynamicNamespace,
                    DetectedDynamicExportType::Value => EcmascriptExports::Value,
                    DetectedDynamicExportType::UsingModuleDeclarations
                    | DetectedDynamicExportType::None => EcmascriptExports::EsmExports(
                        EsmExports {
                            exports: Default::default(),
                            star_exports: Default::default(),
                            mangle_export_names: options.mangle_export_names,
                        }
                        .resolved_cell(),
                    ),
                }
            } else {
                match detect_dynamic_export(program) {
                    DetectedDynamicExportType::CommonJs => EcmascriptExports::CommonJs(None),
                    DetectedDynamicExportType::Namespace => EcmascriptExports::DynamicNamespace,
                    DetectedDynamicExportType::Value => EcmascriptExports::Value,
                    DetectedDynamicExportType::UsingModuleDeclarations => {
                        EcmascriptExports::EsmExports(
                            EsmExports {
                                exports: Default::default(),
                                star_exports: Default::default(),
                                mangle_export_names: options.mangle_export_names,
                            }
                            .resolved_cell(),
                        )
                    }
                    DetectedDynamicExportType::None => EcmascriptExports::EmptyCommonJs,
                }
            }
            .resolved_cell(),
        )
    }
    .instrument(span)
    .await?;

    Ok(EcmascriptExportsAnalysis {
        exports,
        import_references: import_references.into_boxed_slice(),
        esm_reexport_reference_idxs: esm_reexport_reference_idxs.into_boxed_slice(),
        esm_evaluation_reference_idxs: esm_evaluation_reference_idxs.into_boxed_slice(),
    }
    .cell())
}

/// Read the actual post-transform CommonJS export analysis without changing
/// execution options. Consumers must treat `None` as an uncertified namespace.
/// The disposable graph's effects/codegens are never returned or emitted.
pub async fn read_static_cjs_exports(
    module: ResolvedVc<EcmascriptModuleAsset>,
) -> Result<Option<CjsStaticExports>> {
    let parsed = module.failsafe_parse().await?;
    let ParseResult::Ok {
        program,
        eval_context,
        globals,
        ..
    } = &*parsed
    else {
        return Ok(None);
    };
    let raw_module = module.await?;
    let mode = raw_module.options.await?.analyze_mode;
    let supports_block_scoping = *raw_module
        .compile_time_info
        .environment()
        .runtime_versions()
        .supports_block_scoping()
        .await?;
    let specified_type = module.determine_module_type().await?.module_type;
    Ok(GLOBALS.set(globals, || {
        project_static_cjs_exports(
            program,
            eval_context,
            mode,
            supports_block_scoping,
            specified_type,
        )
    }))
}

fn project_static_cjs_exports(
    program: &Program,
    eval_context: &EvalContext,
    mode: AnalyzeMode,
    supports_block_scoping: bool,
    specified_type: SpecifiedModuleType,
) -> Option<CjsStaticExports> {
    if !mode.is_codegen || !eval_context.is_cjs(specified_type) {
        return None;
    }
    let arena = Bump::default();
    // Scope-hoisting enables the existing collector in this temporary analysis.
    // No module/context options are mutated; require narrowing is disabled and
    // every effect, binding and suggested export-drop codegen is discarded.
    create_graph(
        &arena,
        program,
        eval_context,
        mode,
        supports_block_scoping,
        specified_type,
        false,
        true,
    )
    .cjs_static_exports
}

#[derive(Debug)]
enum DetectedDynamicExportType {
    CommonJs,
    Namespace,
    Value,
    None,
    UsingModuleDeclarations,
}

// TODO move into ImportMap
fn detect_dynamic_export(p: &Program) -> DetectedDynamicExportType {
    use swc_core::ecma::visit::{Visit, VisitWith, visit_obj_and_computed};

    if let Program::Module(m) = p {
        // Check for imports/exports
        if m.body.iter().any(|item| {
            item.as_module_decl().is_some_and(|module_decl| {
                module_decl.as_import().is_none_or(|import| {
                    !is_turbopack_helper_import(import) && !is_swc_helper_import(import)
                })
            })
        }) {
            return DetectedDynamicExportType::UsingModuleDeclarations;
        }
    }

    struct Visitor {
        cjs: bool,
        value: bool,
        namespace: bool,
        found: bool,
    }

    impl Visit for Visitor {
        visit_obj_and_computed!();

        fn visit_ident(&mut self, i: &Ident) {
            // The detection is not perfect, it might have some false positives, e. g. in
            // cases where `module` is used in some other way. e. g. `const module = 42;`.
            // But a false positive doesn't break anything, it only opts out of some
            // optimizations, which is acceptable.
            if &*i.sym == "module" || &*i.sym == "exports" {
                self.cjs = true;
                self.found = true;
            }
            if &*i.sym == "__turbopack_export_value__" {
                self.value = true;
                self.found = true;
            }
            if &*i.sym == "__turbopack_export_namespace__" {
                self.namespace = true;
                self.found = true;
            }
        }

        fn visit_expr(&mut self, n: &Expr) {
            if self.found {
                return;
            }

            if let Expr::Member(member) = n
                && member.obj.is_ident_ref_to("__turbopack_context__")
                && let MemberProp::Ident(prop) = &member.prop
            {
                const TURBOPACK_EXPORT_VALUE_SHORTCUT: &str = TURBOPACK_EXPORT_VALUE.shortcut;
                const TURBOPACK_EXPORT_NAMESPACE_SHORTCUT: &str =
                    TURBOPACK_EXPORT_NAMESPACE.shortcut;
                match &*prop.sym {
                    TURBOPACK_EXPORT_VALUE_SHORTCUT => {
                        self.value = true;
                        self.found = true;
                    }
                    TURBOPACK_EXPORT_NAMESPACE_SHORTCUT => {
                        self.namespace = true;
                        self.found = true;
                    }
                    _ => {}
                }
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

    let mut v = Visitor {
        cjs: false,
        value: false,
        namespace: false,
        found: false,
    };
    p.visit_with(&mut v);
    if v.cjs {
        DetectedDynamicExportType::CommonJs
    } else if v.value {
        DetectedDynamicExportType::Value
    } else if v.namespace {
        DetectedDynamicExportType::Namespace
    } else {
        DetectedDynamicExportType::None
    }
}

pub fn is_turbopack_helper_import(import: &ImportDecl) -> bool {
    let annotations = ImportAnnotations::parse(import.with.as_deref());

    annotations.is_some_and(|a| a.get(&TURBOPACK_HELPER_WTF8).is_some())
}

pub fn is_swc_helper_import(import: &ImportDecl) -> bool {
    import.src.value.starts_with("@swc/helpers/")
}

#[cfg(test)]
mod static_cjs_export_projection_tests {
    use swc_core::{
        common::{FileName, GLOBALS, Globals, Mark, SourceMap},
        ecma::{
            ast::EsVersion, parser::parse_file_as_program, transforms::base::resolver,
            visit::VisitMutWith,
        },
    };

    use crate::{
        AnalyzeMode, SpecifiedModuleType, analyzer::graph::EvalContext, chunk::CjsStaticExports,
        references::exports::project_static_cjs_exports,
    };

    fn project(source: &str, mode: AnalyzeMode) -> Option<CjsStaticExports> {
        GLOBALS.set(&Globals::new(), || {
            let cm = SourceMap::default();
            let file = cm.new_source_file(
                FileName::Custom("implementation.cjs".into()).into(),
                source.to_owned(),
            );
            let mut errors = Vec::new();
            let mut program = parse_file_as_program(
                &file,
                Default::default(),
                EsVersion::latest(),
                None,
                &mut errors,
            )
            .unwrap();
            assert!(errors.is_empty());
            let unresolved = Mark::new();
            let top_level = Mark::new();
            program.visit_mut_with(&mut resolver(unresolved, top_level, false));
            let context = EvalContext::new(
                Some(&program),
                unresolved,
                top_level,
                Default::default(),
                None,
            );
            project_static_cjs_exports(
                &program,
                &context,
                mode,
                true,
                SpecifiedModuleType::CommonJs,
            )
        })
    }

    #[test]
    fn cjs_projection_retains_native_names_and_interop_without_emitting_codegen() {
        let names = project(
            "const implementation=()=>42;exports.arbitrary=implementation;module.exports.\
             other=implementation",
            AnalyzeMode::code_generation(),
        )
        .unwrap();
        assert_eq!(
            names
                .export_names
                .iter()
                .map(|name| name.as_str())
                .collect::<Vec<_>>(),
            ["arbitrary", "other"]
        );
        assert!(!names.has_es_module);
        let replaced = project(
            "module.exports={first:()=>1,second:()=>2}",
            AnalyzeMode::code_generation(),
        )
        .unwrap();
        assert_eq!(replaced.export_names.len(), 2);
        let interop = project(
            "exports.__esModule=true;exports.arbitrary=()=>42",
            AnalyzeMode::code_generation(),
        )
        .unwrap();
        assert!(interop.has_es_module);
        assert!(
            project(
                "exports.arbitrary=()=>42",
                AnalyzeMode::tracing_import_only()
            )
            .is_none()
        );
    }

    #[test]
    fn cjs_projection_preserves_unknown_getter_nested_and_escape_taints() {
        for source in [
            "exports[name]=()=>42",
            "exports['arbitrary']=()=>42",
            "Object.defineProperty(exports,'arbitrary',{get(){return ()=>42}})",
            "exports.arbitrary=()=>42;exports.change=()=>{exports.arbitrary=()=>43}",
            "if(flag){exports.arbitrary=()=>42}",
            "exports.arbitrary=()=>42;globalThis.escaped=exports",
            "module.exports={...unknown}",
        ] {
            assert!(
                project(source, AnalyzeMode::code_generation()).is_none(),
                "{source}"
            );
        }
        let shadowed = project(
            "const exports={};exports.arbitrary=()=>42",
            AnalyzeMode::code_generation(),
        )
        .unwrap();
        assert!(shadowed.export_names.is_empty());
    }
}
