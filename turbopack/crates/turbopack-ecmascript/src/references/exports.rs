use anyhow::{Result, bail};
use rustc_hash::FxHashSet;
use swc_core::{
    common::source_map::SmallPos,
    ecma::ast::{Class, Expr, Function, Ident, ImportDecl, MemberProp, Program, Stmt, ThisExpr},
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
    EcmascriptModuleAsset, EcmascriptParsable, ModuleTypeResult, SpecifiedModuleType,
    analyzer::imports::{ImportAnnotations, ImportedSymbol},
    chunk::EcmascriptExports,
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
                // A top-level `this` is `undefined` in ESM, so it doesn't indicate CommonJS.
                match detect_dynamic_export(program, false) {
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
                // A top-level `this` is `module.exports` in CommonJS.
                match detect_dynamic_export(program, true) {
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

#[derive(Debug)]
enum DetectedDynamicExportType {
    CommonJs,
    Namespace,
    Value,
    None,
    UsingModuleDeclarations,
}

// TODO move into ImportMap
/// Detects how a module without ESM exports exposes its exports. When
/// `top_level_this_is_exports` is set, a `this` bound to the module scope counts as a
/// CommonJS `exports` reference.
fn detect_dynamic_export(
    p: &Program,
    top_level_this_is_exports: bool,
) -> DetectedDynamicExportType {
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
        top_level_this_is_exports: bool,
        /// How many enclosing scopes rebind `this` (non-arrow functions and classes).
        this_binding_depth: usize,
    }

    impl Visitor {
        fn with_this_binding(&mut self, visit: impl FnOnce(&mut Self)) {
            self.this_binding_depth += 1;
            visit(self);
            self.this_binding_depth -= 1;
        }
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

        fn visit_this_expr(&mut self, _: &ThisExpr) {
            // A free `this` aliases `module.exports`.
            if self.top_level_this_is_exports && self.this_binding_depth == 0 {
                self.cjs = true;
                self.found = true;
            }
        }

        // Arrow functions keep the outer `this`; non-arrow functions (including object
        // methods, getters and setters) and classes rebind it. A class is treated as a
        // whole: `this` in a computed member key is missed, which is acceptable.
        fn visit_function(&mut self, n: &Function) {
            self.with_this_binding(|this| n.visit_children_with(this));
        }

        fn visit_class(&mut self, n: &Class) {
            self.with_this_binding(|this| n.visit_children_with(this));
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
        top_level_this_is_exports,
        this_binding_depth: 0,
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
mod tests {
    use swc_core::{
        common::{FileName, SourceMap, sync::Lrc},
        ecma::{
            ast::EsVersion,
            parser::{Syntax, parse_file_as_program},
        },
    };

    use super::{DetectedDynamicExportType, detect_dynamic_export};

    fn is_cjs(code: &str, top_level_this_is_exports: bool) -> bool {
        let cm = Lrc::new(SourceMap::default());
        let fm = cm.new_source_file(Lrc::new(FileName::Anon), code.to_string());
        let program = parse_file_as_program(
            &fm,
            Syntax::Es(Default::default()),
            EsVersion::latest(),
            None,
            &mut vec![],
        )
        .expect("Failed to parse");
        matches!(
            detect_dynamic_export(&program, top_level_this_is_exports),
            DetectedDynamicExportType::CommonJs
        )
    }

    #[test]
    fn module_scope_this_is_cjs() {
        assert!(is_cjs("this.a = 1", true));
        assert!(is_cjs("const f = () => { this.a = 1 }", true));
        assert!(is_cjs("function f() {} f(this)", true));
    }

    #[test]
    fn module_scope_this_is_not_cjs_in_esm() {
        assert!(!is_cjs("this.a = 1", false));
    }

    #[test]
    fn rebound_this_is_not_cjs() {
        assert!(!is_cjs("function f() { this.a = 1 }", true));
        assert!(!is_cjs("const f = function () { this.a = 1 }", true));
        assert!(!is_cjs("const o = { m() { this.a = 1 } }", true));
        assert!(!is_cjs("const o = { get a() { return this.b } }", true));
        assert!(!is_cjs("const o = { set a(v) { this.b = v } }", true));
        assert!(!is_cjs("class A { constructor() { this.a = 1 } }", true));
        assert!(!is_cjs(
            "class A { a = this.b; static { this.c = 1 } }",
            true
        ));
        assert!(!is_cjs("function f() { const g = () => this.a }", true));
    }
}
