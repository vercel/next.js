use std::sync::Arc;

use anyhow::{Result, bail};
use async_trait::async_trait;
use bincode::{Decode, Encode};
use either::Either;
use rustc_hash::FxHashSet;
use strsim::jaro;
use swc_core::{
    common::{
        BytePos, DUMMY_SP, Span, SyntaxContext,
        source_map::{PURE_SP, SmallPos},
    },
    ecma::ast::{
        ArrayLit, CallExpr, Callee, ComputedPropName, Decl, Expr, ExprOrSpread, ExprStmt, Ident,
        Lit, MemberExpr, MemberProp, Number, SeqExpr, Stmt, Str,
    },
    quote,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat, turbobail,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkingContext, ChunkingType, ModuleChunkItemIdExt, ModuleId},
    issue::{
        Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, StyledString,
        code_gen::CodeGenerationIssue,
    },
    loader::{ResolvedWebpackLoaderItem, WebpackLoaderItem},
    module::{Module, ModuleSideEffects},
    module_graph::binding_usage_info::ModuleExportUsageInfo,
    reference::ModuleReference,
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{
        BindingUsage, ExportUsage, ExternalType, ImportUsage, ModulePart, ModuleResolveResult,
        ModuleResolveResultItem, RequestKey, ResolveErrorMode,
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
        resolve,
    },
    source::Source,
};
use turbopack_resolve::ecmascript::esm_resolve;

use crate::{
    EcmascriptModuleAsset, EcmascriptParsable, ScopeHoistingContext,
    analyzer::imports::{ImportAnnotations, ImportedSymbol},
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    code_gen::{CodeGeneration, CodeGenerationHoistedStmt},
    export::Liveness,
    magic_identifier,
    module_fragments::{TURBOPACK_PART_IMPORT_SOURCE, part::module::EcmascriptModulePartAsset},
    parse::ParseResult,
    references::{
        esm::{
            EsmExport,
            export::{SubsumedImports, all_known_export_names, is_export_missing},
            mangle::generated_export_key,
        },
        util::{SpecifiedChunkingType, throw_module_not_found_expr},
    },
    runtime_functions::{
        TURBOPACK_DEFER_NAMESPACE, TURBOPACK_EXTERNAL_IMPORT, TURBOPACK_EXTERNAL_REQUIRE,
        TURBOPACK_IMPORT, TURBOPACK_IMPORT_DEFER,
    },
    utils::module_id_to_lit,
};

#[derive(PartialEq, Eq)]
pub enum ReferencedAsset {
    Some(ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>),
    External(RcStr, ExternalType),
    /// The request resolved to a module that can't be placed in an ECMAScript
    /// chunk (e.g. a stylesheet or a raw module), so it has no bindings to
    /// import. Importing it for its side effects is fine, reading a binding off
    /// it is not.
    NonPlaceable(ResolvedVc<Box<dyn Module>>),
    None,
    /// The module was aliased to `false`, resolving to an empty module.
    Empty,
    Unresolvable,
}

#[derive(Clone, Debug)]
pub enum ReferencedAssetIdent {
    /// The given export (or namespace) is a local binding in the current scope hoisting group.
    LocalBinding {
        ident: RcStr,
        ctxt: SyntaxContext,
        liveness: Liveness,
    },
    /// The given export (or namespace) should be imported and accessed as `export` on the
    /// `import_source.namespace_ident()` variable.
    Module {
        ctxt: Option<SyntaxContext>,
        export: Option<RcStr>,
        /// What to import to populate the variable that will hold the imported namespace.
        ///
        /// When the ident was resolved through a re-export chain (e.g. `export * as X from
        /// './inner'`), this is the final module in that chain, not the directly referenced
        /// asset.
        import_source: ImportSource,
        /// Set for a deferred import (`import defer * as ns from '...'`). The variable then
        /// holds a function returning the namespace (evaluating the module on first call), and is
        /// named `deferred.namespace_ident`.
        deferred: Option<DeferredImport>,
    },
}

/// Details of a deferred import, see [`ReferencedAssetIdent::Module::deferred`].
#[derive(Clone, Debug)]
pub struct DeferredImport {
    /// The name of the variable holding the function that evaluates the module and returns its
    /// namespace. Unused when `eager`.
    pub namespace_ident: String,
    /// A module that has to be evaluated before the imported module, as the namespace import was
    /// resolved through re-exports of this module (which might have side effects).
    pub evaluate_first: Option<ModuleId>,
    /// The export names of the target module, when they are statically known. Used to create
    /// the deferred namespace object (with getters) when the namespace is used as a value. With
    /// `None`, a `Proxy` is used instead.
    pub namespace_exports: Option<Arc<[RcStr]>>,
    /// The evaluation is not actually deferred (the module is async, or also imported eagerly):
    /// the module is imported like a regular import, but the namespace is still a deferred
    /// namespace object when used as a value.
    pub eager: bool,
    /// Identifies the module for the runtime, which creates one deferred namespace object per
    /// module. Only set when the namespace is used as a value.
    pub key: Option<DeferredNamespaceKey>,
}

/// See [`DeferredImport::key`].
#[derive(Clone, Debug)]
pub enum DeferredNamespaceKey {
    Module(ModuleId),
    External(RcStr),
}

impl DeferredNamespaceKey {
    pub fn to_expr(&self) -> Expr {
        match self {
            DeferredNamespaceKey::Module(id) => module_id_to_lit(id),
            DeferredNamespaceKey::External(request) => {
                Expr::Lit(Lit::Str(format!("external {request}").into()))
            }
        }
    }
}

/// The source to import when initializing a `ReferencedAssetIdent::Module` variable.
#[derive(Clone, Debug)]
pub enum ImportSource {
    /// Import an in-graph module.
    Module {
        asset: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        /// The name of the variable that should hold the imported namespace.
        namespace_ident: String,
    },
    /// Import an external dependency. The emitting site decides between
    /// `__turbopack_external_import` and `__turbopack_external_require` based on its own
    /// `import_externals` flag.
    External {
        request: RcStr,
        ty: ExternalType,
        /// The name of the variable that should hold the imported namespace.
        namespace_ident: String,
    },
}

impl ImportSource {
    async fn new_module(
        asset: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Self> {
        Ok(ImportSource::Module {
            asset,
            namespace_ident: ReferencedAsset::get_ident_from_placeable(*asset, chunking_context)
                .await?,
        })
    }

    fn new_external(request: RcStr, ty: ExternalType) -> Self {
        let namespace_ident = magic_identifier::mangle(&format!("{ty} external {request}"));
        ImportSource::External {
            request,
            ty,
            namespace_ident,
        }
    }

    /// The name of the variable that should hold the imported namespace.
    pub fn namespace_ident(&self) -> &str {
        match self {
            ImportSource::Module {
                namespace_ident, ..
            }
            | ImportSource::External {
                namespace_ident, ..
            } => namespace_ident,
        }
    }

    /// Like [`ImportSource::namespace_ident`], but takes ownership of the name.
    pub fn into_namespace_ident(self) -> String {
        match self {
            ImportSource::Module {
                namespace_ident, ..
            }
            | ImportSource::External {
                namespace_ident, ..
            } => namespace_ident,
        }
    }

    /// The name of the variable that holds the function returning the namespace of a deferred
    /// import (`import defer * as ns from '...'`). `evaluate_first` is the id of the module that
    /// has to be evaluated first, if any (see [`DeferredImport::evaluate_first`]).
    fn deferred_namespace_ident(&self, evaluate_first: Option<&ModuleId>) -> String {
        let namespace_ident = self.namespace_ident();
        // `__TURBOPACK__imported__module__...` -> `__TURBOPACK__deferred__module__...`
        let ident = if let Some(rest) = namespace_ident.strip_prefix(IMPORTED_MODULE_IDENT_PREFIX) {
            format!("{DEFERRED_MODULE_IDENT_PREFIX}{rest}")
        } else {
            format!("{namespace_ident}deferred__")
        };
        match evaluate_first {
            Some(id) => format!(
                "{ident}{}",
                magic_identifier::mangle(&format!("after {id}"))
            ),
            None => ident,
        }
    }
}

/// `magic_identifier::mangle("imported module ")`
const IMPORTED_MODULE_IDENT_PREFIX: &str = "__TURBOPACK__imported__module__";
/// `magic_identifier::mangle("deferred module ")`
const DEFERRED_MODULE_IDENT_PREFIX: &str = "__TURBOPACK__deferred__module__";

impl ReferencedAssetIdent {
    pub fn into_module_namespace_ident(self) -> Option<(String, Option<SyntaxContext>)> {
        match self {
            ReferencedAssetIdent::Module {
                import_source,
                ctxt,
                deferred: None,
                ..
            } => Some((import_source.into_namespace_ident(), ctxt)),
            ReferencedAssetIdent::Module {
                import_source,
                ctxt,
                deferred: Some(deferred),
                ..
            } => Some(if deferred.eager {
                (import_source.into_namespace_ident(), ctxt)
            } else {
                (deferred.namespace_ident, ctxt)
            }),
            ReferencedAssetIdent::LocalBinding { .. } => None,
        }
    }

    /// Marks a `Module` ident as a deferred import. Has no effect on local bindings: a module in
    /// the same scope hoisting group is evaluated with the group anyway.
    fn into_deferred(self, deferred: DeferredImport) -> Self {
        match self {
            ReferencedAssetIdent::Module {
                ctxt,
                export,
                import_source,
                deferred: _,
            } => ReferencedAssetIdent::Module {
                ctxt,
                export,
                import_source,
                deferred: Some(deferred),
            },
            ident @ ReferencedAssetIdent::LocalBinding { .. } => ident,
        }
    }

    /// Removes the deferred marker of an ident whose evaluation isn't deferred (see
    /// [`DeferredImport::eager`]): the module is imported like a regular import.
    fn without_eager_deferred(self) -> Self {
        match self {
            ReferencedAssetIdent::Module {
                ctxt,
                export,
                import_source,
                deferred: Some(DeferredImport { eager: true, .. }),
            } => ReferencedAssetIdent::Module {
                ctxt,
                export,
                import_source,
                deferred: None,
            },
            ident => ident,
        }
    }

    pub fn as_expr_individual(&self, span: Span) -> Either<Ident, MemberExpr> {
        match self {
            ReferencedAssetIdent::LocalBinding {
                ident,
                ctxt,
                liveness: _,
            } => Either::Left(Ident::new(ident.as_str().into(), span, *ctxt)),
            ReferencedAssetIdent::Module {
                ctxt,
                export,
                import_source,
                deferred,
            } => {
                let (namespace_ident, namespace_expr) = if let Some(deferred) = deferred
                    && !deferred.eager
                {
                    let namespace_ident = deferred.namespace_ident.as_str();
                    // `__TURBOPACK__deferred__module__...()` evaluates the module (once) and
                    // returns the namespace.
                    let namespace_expr = Expr::Call(CallExpr {
                        span: DUMMY_SP,
                        callee: Callee::Expr(Box::new(Expr::Ident(Ident::new(
                            namespace_ident.into(),
                            DUMMY_SP,
                            ctxt.unwrap_or_default(),
                        )))),
                        args: vec![],
                        ..Default::default()
                    });
                    (namespace_ident, namespace_expr)
                } else {
                    let namespace_ident = import_source.namespace_ident();
                    (
                        namespace_ident,
                        Expr::Ident(Ident::new(
                            namespace_ident.into(),
                            DUMMY_SP,
                            ctxt.unwrap_or_default(),
                        )),
                    )
                };
                if let Some(export) = export {
                    Either::Right(MemberExpr {
                        span,
                        obj: Box::new(namespace_expr),
                        prop: MemberProp::Computed(ComputedPropName {
                            span: DUMMY_SP,
                            expr: Box::new(Expr::Lit(Lit::Str(Str {
                                span: DUMMY_SP,
                                value: export.as_str().into(),
                                raw: None,
                            }))),
                        }),
                    })
                } else {
                    Either::Left(Ident::new(
                        namespace_ident.into(),
                        span,
                        ctxt.unwrap_or_default(),
                    ))
                }
            }
        }
    }
    pub fn as_expr(&self, span: Span, is_callee: bool) -> Expr {
        if let ReferencedAssetIdent::Module {
            ctxt,
            export: None,
            import_source,
            deferred: Some(deferred),
        } = self
        {
            // The namespace of a deferred import is used as a value: create (or reuse) the
            // deferred namespace object of the module, which evaluates the module on first access
            // to one of its properties.
            let deferred_fn = if deferred.eager {
                // The module was already evaluated, only the namespace object is deferred.
                quote!(
                    "() => $namespace" as Expr,
                    namespace = Ident::new(
                        import_source.namespace_ident().into(),
                        DUMMY_SP,
                        ctxt.unwrap_or_default(),
                    ),
                )
            } else {
                Expr::Ident(Ident::new(
                    deferred.namespace_ident.as_str().into(),
                    DUMMY_SP,
                    ctxt.unwrap_or_default(),
                ))
            };
            let exports = match &deferred.namespace_exports {
                Some(exports) => Expr::Array(ArrayLit {
                    span: DUMMY_SP,
                    elems: exports
                        .iter()
                        .map(|export| {
                            Some(ExprOrSpread {
                                spread: None,
                                expr: Box::new(Expr::Lit(Lit::Str(export.as_str().into()))),
                            })
                        })
                        .collect(),
                }),
                None => quote!("void 0" as Expr),
            };
            let mut args: Vec<ExprOrSpread> = vec![deferred_fn.into(), exports.into()];
            if let Some(key) = &deferred.key {
                args.push(key.to_expr().into());
            }
            return Expr::Call(CallExpr {
                span,
                callee: Callee::Expr(Box::new(TURBOPACK_DEFER_NAMESPACE.into())),
                args,
                ..Default::default()
            });
        }
        match self.as_expr_individual(span) {
            Either::Left(ident) => ident.into(),
            Either::Right(member) => {
                if is_callee {
                    Expr::Seq(SeqExpr {
                        exprs: vec![
                            Box::new(Expr::Lit(Lit::Num(Number {
                                span: DUMMY_SP,
                                value: 0.0,
                                raw: None,
                            }))),
                            Box::new(member.into()),
                        ],
                        span: DUMMY_SP,
                    })
                } else {
                    member.into()
                }
            }
        }
    }
}

impl ReferencedAsset {
    pub async fn get_ident(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        export: Option<RcStr>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
    ) -> Result<Option<ReferencedAssetIdent>> {
        self.get_ident_inner(chunking_context, export, scope_hoisting_context, None)
            .await
    }

    async fn get_ident_inner(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        export: Option<RcStr>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
        initial: Option<&ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
    ) -> Result<Option<ReferencedAssetIdent>> {
        Ok(match self {
            ReferencedAsset::Some(asset) => {
                if let Some(ctxt) = scope_hoisting_context.get_module_syntax_context(*asset)
                    && let Some(export) = &export
                    && let EcmascriptExports::EsmExports(exports) = *asset.get_exports().await?
                {
                    let exports = exports.expand_exports(ModuleExportUsageInfo::all()).await?;
                    let esm_export = exports.exports.get(export);
                    match esm_export {
                        Some(EsmExport::LocalBinding(_name, liveness)) => {
                            // A local binding in a module that is merged in the same group. Use the
                            // export name as identifier, it will be replaced with the actual
                            // variable name during AST merging.
                            return Ok(Some(ReferencedAssetIdent::LocalBinding {
                                ident: export.clone(),
                                ctxt,
                                liveness: *liveness,
                            }));
                        }
                        Some(b @ EsmExport::ImportedBinding(esm_ref, _, _))
                        | Some(b @ EsmExport::ImportedNamespace(esm_ref)) => {
                            let imported = if let EsmExport::ImportedBinding(_, export, _) = b {
                                Some(export.clone())
                            } else {
                                None
                            };

                            let referenced_asset =
                                ReferencedAsset::from_resolve_result(esm_ref.resolve_reference())
                                    .await?;

                            if let Some(&initial) = initial
                                && referenced_asset == ReferencedAsset::Some(initial)
                            {
                                // `initial` reexports from `asset` reexports from
                                // `referenced_asset` (which is `initial`)
                                CircularReExport {
                                    export: export.clone(),
                                    import: imported.clone(),
                                    module: *asset,
                                    module_cycle: initial,
                                }
                                .resolved_cell()
                                .emit();
                                return Ok(None);
                            }

                            // If the target module is still in the same group, we can
                            // refer it locally, otherwise it will be imported
                            return Ok(
                                match Box::pin(referenced_asset.get_ident_inner(
                                    chunking_context,
                                    imported,
                                    scope_hoisting_context,
                                    Some(asset),
                                ))
                                .await?
                                {
                                    Some(ReferencedAssetIdent::Module {
                                        // Overwrite the context. This import isn't
                                        // inserted in the module that uses the import,
                                        // but in the module containing the reexport
                                        ctxt: None,
                                        export,
                                        import_source,
                                        deferred,
                                    }) => Some(ReferencedAssetIdent::Module {
                                        ctxt: Some(ctxt),
                                        export,
                                        import_source,
                                        deferred,
                                    }),
                                    ident => ident,
                                },
                            );
                        }
                        Some(EsmExport::Error) => {
                            // The export has failed to resolve. The module is merged into this
                            // scope hoisting group, so it might not have a module factory that
                            // could be imported. There is nothing to bind to, so the binding
                            // evaluates to `undefined`.
                            return Ok(None);
                        }
                        None if exports.dynamic_exports.is_empty() => {
                            // The export is statically known to not exist. The module is merged
                            // into this scope hoisting group, so it might not have a module
                            // factory that could be imported. There is nothing to bind to, so the
                            // binding evaluates to `undefined`.
                            return Ok(None);
                        }
                        None => {
                            // Export not found, this is some dynamic (CJS) (re)export situation.
                        }
                    }
                }

                let import_source = ImportSource::new_module(*asset, chunking_context).await?;
                Some(ReferencedAssetIdent::Module {
                    ctxt: None,
                    // The target module may emit its exports under shortened keys. This is the
                    // only place a cross-module export access is materialized, and it resolves
                    // the same map the producing module uses (see
                    // `EsmExports::code_generation`), so the two always agree.
                    export: match &export {
                        Some(export) => {
                            Some(generated_export_key(*asset, chunking_context, export).await?)
                        }
                        None => None,
                    },
                    import_source,
                    deferred: None,
                })
            }
            ReferencedAsset::External(request, ty) => Some(ReferencedAssetIdent::Module {
                ctxt: None,
                export,
                import_source: ImportSource::new_external(request.clone(), *ty),
                deferred: None,
            }),
            ReferencedAsset::NonPlaceable(module) => {
                // The module exists but has no ECMAScript bindings, so there is
                // nothing this identifier could refer to. Report it instead of
                // silently evaluating to `undefined`.
                CodeGenerationIssue {
                    severity: IssueSeverity::Error,
                    title: StyledString::Text(rcstr!("non-ecmascript placeable asset"))
                        .resolved_cell(),
                    message: StyledString::Text(
                        format!(
                            "{} has no ECMAScript exports, so {} can't be read from it. It can \
                             only be imported for its side effects.",
                            module.ident().to_string().await?,
                            match &export {
                                Some(export) => format!("the export {export:?}"),
                                None => "a namespace".to_string(),
                            }
                        )
                        .into(),
                    )
                    .resolved_cell(),
                    path: module.ident().await?.path.clone(),
                    source: None,
                }
                .resolved_cell()
                .emit();
                None
            }
            ReferencedAsset::None | ReferencedAsset::Empty | ReferencedAsset::Unresolvable => None,
        })
    }

    pub(crate) async fn get_ident_from_placeable(
        asset: Vc<Box<dyn EcmascriptChunkPlaceable>>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<String> {
        let id = asset.chunk_item_id(chunking_context).await?;
        // There are a number of places in `next` that match on this prefix.
        // See `packages/next/src/shared/lib/magic-identifier.ts`
        Ok(magic_identifier::mangle(&format!("imported module {id}")))
    }
}

impl ReferencedAsset {
    pub async fn from_resolve_result(resolve_result: Vc<ModuleResolveResult>) -> Result<Self> {
        // TODO handle multiple keyed results
        let result = resolve_result.await?;
        if result.is_unresolvable() {
            return Ok(ReferencedAsset::Unresolvable);
        }
        let mut non_placeable = None;
        for (_, result) in result.primary.iter() {
            match result {
                ModuleResolveResultItem::External {
                    name: request, ty, ..
                } => {
                    return Ok(ReferencedAsset::External(request.clone(), *ty));
                }
                ModuleResolveResultItem::Module(module) => {
                    if let Some(placeable) =
                        ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkPlaceable>>(*module)
                    {
                        return Ok(ReferencedAsset::Some(placeable));
                    }
                    non_placeable = non_placeable.or(Some(*module));
                }
                ModuleResolveResultItem::Empty => {
                    return Ok(ReferencedAsset::Empty);
                }
                // TODO ignore should probably be handled differently
                _ => {}
            }
        }
        Ok(match non_placeable {
            Some(module) => ReferencedAsset::NonPlaceable(module),
            None => ReferencedAsset::None,
        })
    }
}

#[turbo_tasks::value(transparent)]
pub struct EsmAssetReferences(Vec<ResolvedVc<EsmAssetReference>>);

#[turbo_tasks::value_impl]
impl EsmAssetReferences {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Vec::new())
    }
}

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("import {request}")]
pub struct EsmAssetReference {
    pub module: ResolvedVc<EcmascriptModuleAsset>,
    /// The resolve origin, with any annotation-driven transition already applied at construction.
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    // Request is a string to avoid eagerly parsing into a `Request` VC
    pub request: RcStr,
    pub issue_source: IssueSource,
    pub export_name: Option<ModulePart>,
    pub import_usage: ImportUsage,
    pub import_externals: bool,
    pub module_fragments_enabled: bool,
    pub is_pure_import: bool,
    /// Created by an `import defer * as ns from "..."` declaration: the referenced module is
    /// loaded with the importer, but only evaluated on first access to the namespace (see
    /// [`EsmAssetReference::is_effectively_deferred`]).
    pub deferred: bool,
    /// Created by an `import defer` declaration, even when the evaluation isn't deferred (because
    /// the module is also imported eagerly). The namespace is a deferred namespace object when
    /// used as a value.
    pub deferred_namespace: bool,
    /// For the binding references of a deferred import: the evaluation reference of the same
    /// declaration, whose target has to be evaluated first.
    pub deferred_evaluation: Option<ResolvedVc<EsmAssetReference>>,
    /// Rarely-present, slightly-large fields (import-annotation overrides and a resolve override),
    /// boxed off the common path so the typical reference stays small. `None` whenever every field
    /// would be empty.
    extras: Option<Box<EsmReferenceExtras>>,
}

/// Construction options for an [`EsmAssetReference`].
///
/// The module, origin, and request stay as constructor arguments because they identify the
/// reference. The remaining behavior is named here so call sites don't depend on argument order.
pub struct EsmAssetReferenceOptions {
    pub issue_source: IssueSource,
    pub annotations: Option<ImportAnnotations>,
    pub export_name: Option<ModulePart>,
    pub import_usage: ImportUsage,
    pub import_externals: bool,
    pub module_fragments_enabled: bool,
    /// Explicit export-usage passthrough mode for syntax-driven forwarding. `Some(false)` forwards
    /// used names without exposing the target namespace's original property names.
    pub export_usage_passthrough: Option<bool>,
    pub resolve_override: Option<ResolvedVc<Box<dyn Module>>>,
    /// See [`EsmAssetReference::deferred`].
    pub deferred: bool,
    /// See [`EsmAssetReference::deferred_namespace`].
    pub deferred_namespace: bool,
    /// See [`EsmAssetReference::deferred_evaluation`].
    pub deferred_evaluation: Option<ResolvedVc<EsmAssetReference>>,
}

/// Optional extra state for an [`EsmAssetReference`] that is rarely present: the few values
/// extracted from `ImportAnnotations` (the full `ImportAnnotations` — a `BTreeMap` plus several
/// `Option`s — is not retained) plus a `resolve_override` from matched inner assets.
#[derive(
    Clone, Default, PartialEq, Eq, Hash, Debug, ValueDebugFormat, NonLocalValue, Encode, Decode,
)]
struct EsmReferenceExtras {
    /// `turbopackLoader` configuration (drives `ImportWithTurbopackUse`).
    turbopack_loader: Option<WebpackLoaderItem>,
    /// `turbopackAs` rename configuration.
    turbopack_rename_as: Option<RcStr>,
    /// `turbopackModuleType` override (distinct from the `with { type: ... }` attribute).
    turbopack_module_type: Option<RcStr>,
    /// The `with { type: ... }` attribute (drives `ImportWithType`).
    module_type: Option<RcStr>,
    /// The chunking-type annotation (drives `chunking_type`).
    chunking_type: Option<SpecifiedChunkingType>,
    /// Whether the importing module's used exports should be forwarded to the target. The boolean
    /// records whether this edge itself exposes the target namespace's original property names.
    export_usage_passthrough: Option<bool>,
    /// A module to resolve to directly, bypassing resolution (from a matched inner asset).
    resolve_override: Option<ResolvedVc<Box<dyn Module>>>,
}

fn merge_export_usage_passthrough(
    explicit: Option<bool>,
    annotation_passthrough: bool,
) -> Option<bool> {
    // An annotation is an explicit request to expose the namespace's original names, so it must
    // not be weakened by a syntax-driven passthrough mode on the same reference.
    annotation_passthrough.then_some(true).or(explicit)
}

impl EsmReferenceExtras {
    /// Builds the extras from import annotations and a resolve override, returning `None` (rather
    /// than an all-empty box) when nothing relevant is present — the common case.
    fn new(
        annotations: Option<&ImportAnnotations>,
        export_usage_passthrough: Option<bool>,
        resolve_override: Option<ResolvedVc<Box<dyn Module>>>,
    ) -> Option<Box<Self>> {
        let extras = EsmReferenceExtras {
            turbopack_loader: annotations.and_then(|a| a.turbopack_loader().cloned()),
            turbopack_rename_as: annotations.and_then(|a| a.turbopack_rename_as().cloned()),
            turbopack_module_type: annotations.and_then(|a| a.turbopack_module_type().cloned()),
            module_type: annotations
                .and_then(|a| a.module_type())
                .map(|m| RcStr::from(&*m.to_string_lossy())),
            chunking_type: annotations.and_then(|a| a.chunking_type()),
            export_usage_passthrough: merge_export_usage_passthrough(
                export_usage_passthrough,
                annotations.is_some_and(|a| a.export_usage_passthrough()),
            ),
            resolve_override,
        };
        (extras != EsmReferenceExtras::default()).then(|| Box::new(extras))
    }
}

#[cfg(test)]
mod tests {
    use super::merge_export_usage_passthrough;

    #[test]
    fn annotation_passthrough_cannot_be_weakened() {
        assert_eq!(merge_export_usage_passthrough(None, false), None);
        assert_eq!(
            merge_export_usage_passthrough(Some(false), false),
            Some(false)
        );
        assert_eq!(
            merge_export_usage_passthrough(Some(true), false),
            Some(true)
        );
        assert_eq!(merge_export_usage_passthrough(None, true), Some(true));
        assert_eq!(
            merge_export_usage_passthrough(Some(false), true),
            Some(true)
        );
        assert_eq!(merge_export_usage_passthrough(Some(true), true), Some(true));
    }
}

impl EsmAssetReference {
    async fn new_inner(
        module: ResolvedVc<EcmascriptModuleAsset>,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: RcStr,
        options: EsmAssetReferenceOptions,
        is_pure_import: bool,
    ) -> Result<Self> {
        let EsmAssetReferenceOptions {
            issue_source,
            annotations,
            export_name,
            import_usage,
            import_externals,
            module_fragments_enabled,
            export_usage_passthrough,
            resolve_override,
            deferred,
            deferred_namespace,
            deferred_evaluation,
        } = options;

        // Apply any annotation-driven transition eagerly so the stored origin is final and the
        // `annotations` don't need to be retained on the reference.
        let origin = if let Some(transition) = annotations.as_ref().and_then(|a| a.transition()) {
            origin
                .with_transition(transition.into())
                .await?
                .to_resolved()
                .await?
        } else {
            origin
        };
        Ok(EsmAssetReference {
            module,
            origin,
            request,
            issue_source,
            export_name,
            import_usage,
            import_externals,
            module_fragments_enabled,
            is_pure_import,
            deferred,
            deferred_namespace,
            deferred_evaluation,
            extras: EsmReferenceExtras::new(
                annotations.as_ref(),
                export_usage_passthrough,
                resolve_override,
            ),
        })
    }

    pub async fn new(
        module: ResolvedVc<EcmascriptModuleAsset>,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: RcStr,
        options: EsmAssetReferenceOptions,
    ) -> Result<Self> {
        Self::new_inner(
            module, origin, request, options, /* is_pure_import */ false,
        )
        .await
    }

    pub async fn new_pure(
        module: ResolvedVc<EcmascriptModuleAsset>,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: RcStr,
        options: EsmAssetReferenceOptions,
    ) -> Result<Self> {
        Self::new_inner(
            module, origin, request, options, /* is_pure_import */ true,
        )
        .await
    }

    /// Builds a copy of this reference for a single resolved namespace export
    /// (`import * as ns from 'foo'; ns.bar` → behave like `import { bar } from 'foo'`).
    ///
    /// Reuses the already-transitioned `origin` and the `extras` (annotation values + resolve
    /// override), overriding only the `export_name`. Stays synchronous (no transition / annotation
    /// re-extraction) so it can be called from the synchronous namespace-rewrite path.
    pub fn rewrite_for_export(&self, export_name: ModulePart) -> Self {
        EsmAssetReference {
            module: self.module,
            origin: self.origin,
            request: self.request.clone(),
            issue_source: self.issue_source,
            export_name: Some(export_name),
            // TODO this is correct, but an overapproximation. We should have individual
            // import_usage data for each export. This would be fixed by moving this
            // logic earlier.
            import_usage: self.import_usage.clone(),
            import_externals: self.import_externals,
            module_fragments_enabled: self.module_fragments_enabled,
            is_pure_import: self.is_pure_import,
            deferred: self.deferred,
            deferred_namespace: self.deferred_namespace,
            deferred_evaluation: self.deferred_evaluation,
            extras: self.extras.clone(),
        }
    }

    pub(crate) fn get_referenced_asset(
        self: Vc<Self>,
    ) -> impl Future<Output = Result<ReferencedAsset>> {
        ReferencedAsset::from_resolve_result(self.resolve_reference())
    }

    /// Whether this reference was created by an `import defer` declaration and is handled as a
    /// deferred import. Module fragments (which split modules into parts imported by internal
    /// references) don't support deferred imports, they are evaluated eagerly.
    pub fn is_deferred_import(&self) -> bool {
        self.deferred && !self.module_fragments_enabled
    }

    /// Whether the namespace of this reference is a deferred namespace object when used as a
    /// value (see [`EsmAssetReference::deferred_namespace`]).
    pub fn is_deferred_namespace(&self) -> bool {
        (self.deferred || self.deferred_namespace) && !self.module_fragments_enabled
    }

    /// Whether the evaluation of the referenced module is actually deferred until the namespace
    /// is accessed.
    ///
    /// Async modules (with top-level await, or with async dependencies) are evaluated eagerly
    /// even when imported with `import defer`, like the proposal specifies for modules with
    /// top-level await. (For a sync module with async dependencies, the proposal only evaluates
    /// the async dependencies eagerly. Turbopack evaluates the whole module eagerly in that case.)
    pub(crate) async fn is_effectively_deferred(
        &self,
        referenced_asset: &ReferencedAsset,
        async_module_info: Option<&AsyncModuleInfo>,
    ) -> Result<bool> {
        if !self.is_deferred_import() {
            return Ok(false);
        }
        if !is_deferrable_asset(referenced_asset, async_module_info) {
            return Ok(false);
        }
        // The evaluation reference of the same declaration has to be deferrable too, otherwise it
        // evaluates the module eagerly anyway.
        if let Some(evaluation) = self.deferred_evaluation {
            let evaluation_asset = evaluation.get_referenced_asset().await?;
            if !matches!(evaluation_asset, ReferencedAsset::None)
                && !is_deferrable_asset(&evaluation_asset, async_module_info)
            {
                return Ok(false);
            }
        }
        Ok(true)
    }

    /// Like [`ReferencedAsset::get_ident`], but marks the ident as deferred when the reference is
    /// effectively deferred (see [`EsmAssetReference::is_effectively_deferred`]).
    pub(crate) async fn get_ident(
        &self,
        referenced_asset: &ReferencedAsset,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        export: Option<RcStr>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
        async_module_info: Option<&AsyncModuleInfo>,
    ) -> Result<Option<ReferencedAssetIdent>> {
        let is_namespace = export.is_none();
        let is_then = export.as_deref() == Some("then");
        let ident = referenced_asset
            .get_ident(chunking_context, export, scope_hoisting_context)
            .await?;
        if !self.is_deferred_namespace() {
            return Ok(ident);
        }
        if is_then {
            // A deferred namespace never exposes `then` (so that awaiting it doesn't evaluate the
            // module): `ns.then` is `undefined`.
            return Ok(None);
        }
        let eager = !self
            .is_effectively_deferred(referenced_asset, async_module_info)
            .await?;
        if eager && !is_namespace {
            // A property access on an evaluated module is a regular access
            return Ok(ident);
        }
        let Some(ident) = ident else {
            return Ok(None);
        };
        let ReferencedAssetIdent::Module { import_source, .. } = &ident else {
            // A local binding of a module in the same scope hoisting group
            return Ok(Some(ident));
        };
        let (namespace_exports, key) = match import_source {
            ImportSource::Module { asset, .. } if is_namespace => (
                known_namespace_exports(*asset).await?,
                Some(DeferredNamespaceKey::Module(
                    asset.chunk_item_id(chunking_context).await?,
                )),
            ),
            ImportSource::External { request, .. } if is_namespace => {
                (None, Some(DeferredNamespaceKey::External(request.clone())))
            }
            _ => (None, None),
        };
        // When the import was resolved to another module (by following re-exports), the
        // directly imported module has to be evaluated first, as it might have side effects.
        // (Side effect free modules resolve to `ReferencedAsset::None` here.)
        let evaluate_first = if !eager
            && let Some(evaluation) = self.deferred_evaluation
            && let ReferencedAsset::Some(evaluated) = evaluation.get_referenced_asset().await?
            && !matches!(import_source, ImportSource::Module { asset, .. } if *asset == evaluated)
        {
            Some(evaluated.chunk_item_id(chunking_context).await?)
        } else {
            None
        };
        let namespace_ident = import_source.deferred_namespace_ident(evaluate_first.as_ref());
        Ok(Some(ident.into_deferred(DeferredImport {
            namespace_ident,
            evaluate_first,
            namespace_exports,
            eager,
            key,
        })))
    }
}

/// Whether a deferred import of this asset can actually be deferred, see
/// [`EsmAssetReference::is_effectively_deferred`].
fn is_deferrable_asset(
    referenced_asset: &ReferencedAsset,
    async_module_info: Option<&AsyncModuleInfo>,
) -> bool {
    match referenced_asset {
        ReferencedAsset::Some(placeable) => !async_module_info.is_some_and(|info| {
            info.referenced_async_modules
                .contains(&ResolvedVc::upcast(*placeable))
        }),
        // A CommonJS external is required synchronously, so it can be deferred. ESM externals
        // are async modules.
        ReferencedAsset::External(_, ExternalType::CommonJs) => true,
        ReferencedAsset::External(..)
        | ReferencedAsset::NonPlaceable(_)
        | ReferencedAsset::None
        | ReferencedAsset::Empty
        | ReferencedAsset::Unresolvable => false,
    }
}

/// The export names of the namespace object of `asset`, when all of them are statically known.
pub(crate) async fn known_namespace_exports(
    asset: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
) -> Result<Option<Arc<[RcStr]>>> {
    let EcmascriptExports::EsmExports(exports) = *asset.get_exports().await? else {
        // CommonJS and other dynamic exports
        return Ok(None);
    };
    let exports = exports.expand_exports(ModuleExportUsageInfo::all()).await?;
    if !exports.dynamic_exports.is_empty() {
        // e.g. `export * from './commonjs.js'`
        return Ok(None);
    }
    Ok(Some(exports.exports.keys().cloned().collect()))
}

#[turbo_tasks::value_impl]
impl ModuleReference for EsmAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let extras = self.extras.as_deref();
        if let Some(resolved) = extras.and_then(|e| e.resolve_override) {
            return Ok(*ModuleResolveResult::module(resolved));
        }
        let ty = if let Some(loader) = extras.and_then(|e| e.turbopack_loader.as_ref()) {
            // Resolve the loader path relative to the importing file
            let origin_ref = self.origin.into_trait_ref().await?;
            let origin_path = origin_ref.origin_path();
            let loader_request = Request::parse(loader.loader.clone().into());
            let resolved = resolve(
                origin_path.parent(),
                ReferenceType::Loader,
                loader_request,
                origin_ref.resolve_options(),
            );
            let loader_fs_path = if let Some(source) = resolved.await?.first_source() {
                source.ident().await?.path.clone()
            } else {
                bail!("Unable to resolve turbopackLoader '{}'", loader.loader);
            };

            EcmaScriptModulesReferenceSubType::ImportWithTurbopackUse {
                loader: ResolvedWebpackLoaderItem {
                    loader: loader_fs_path,
                    options: loader.options.clone(),
                },
                rename_as: extras.and_then(|e| e.turbopack_rename_as.clone()),
                module_type: extras.and_then(|e| e.turbopack_module_type.clone()),
            }
        } else if let Some(module_type) = extras.and_then(|e| e.module_type.as_ref()) {
            EcmaScriptModulesReferenceSubType::ImportWithType(module_type.clone())
        } else if let Some(part) = &self.export_name {
            EcmaScriptModulesReferenceSubType::ImportPart(part.clone())
        } else {
            EcmaScriptModulesReferenceSubType::Import
        };

        let request = Request::parse(self.request.clone().into());

        if self.module_fragments_enabled {
            if let Some(ModulePart::Evaluation) = &self.export_name
                && *self.module.side_effects().await? == ModuleSideEffects::SideEffectFree
            {
                return Ok(ModuleResolveResult {
                    primary: Box::new([(RequestKey::default(), ModuleResolveResultItem::Ignore)]),
                    affecting_sources: Default::default(),
                }
                .cell());
            }

            if let Request::Module { module, .. } = &*request.await?
                && module.is_match(TURBOPACK_PART_IMPORT_SOURCE)
            {
                if let Some(part) = &self.export_name {
                    return Ok(*ModuleResolveResult::module(ResolvedVc::upcast(
                        EcmascriptModulePartAsset::select_part(*self.module, part.clone())
                            .to_resolved()
                            .await?,
                    )));
                }
                bail!("export_name is required for part import")
            }
        }

        let result = esm_resolve(
            *self.origin,
            request,
            ty,
            ResolveErrorMode::Error,
            Some(self.issue_source),
        )
        .await?;

        if let Some(export_name) = self.export_name.as_ref().and_then(ModulePart::get_export) {
            for &module in result.await?.primary_modules().await?.iter() {
                if let Some(module) = ResolvedVc::try_downcast(module)
                    && *is_export_missing(*module, export_name.clone()).await?
                {
                    InvalidExport {
                        export: export_name.clone(),
                        module,
                        source: self.issue_source,
                        importing_module: self.module,
                        request: self.request.clone(),
                    }
                    .resolved_cell()
                    .emit();
                }
            }
        }

        Ok(result)
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        // A deferred import is not executed before the parent module, so it must not be hoisted
        // (and merged into the parent's scope hoisting group). It still inherits async-ness: an
        // async module is evaluated eagerly even when imported with `import defer`.
        let hoisted = !self.is_deferred_import();
        self.extras
            .as_deref()
            .and_then(|e| e.chunking_type)
            .map_or_else(
                || {
                    Some(ChunkingType::Parallel {
                        inherit_async: true,
                        hoisted,
                    })
                },
                |c| c.as_chunking_type(true, hoisted),
            )
    }

    fn binding_usage(&self) -> BindingUsage {
        let export_usage_passthrough = self
            .extras
            .as_deref()
            .and_then(|extras| extras.export_usage_passthrough);
        BindingUsage {
            import: self.import_usage.clone(),
            export: match (&self.export_name, export_usage_passthrough) {
                // Evaluation references preserve their side-effect-only semantics even when the
                // corresponding import forwards export usage.
                (Some(ModulePart::Evaluation), _) => ExportUsage::Evaluation,
                (_, Some(namespace_object_may_escape)) => ExportUsage::Passthrough {
                    namespace_object_may_escape,
                },
                (
                    Some(
                        ModulePart::Export(export_name)
                        | ModulePart::PartialExport {
                            export: export_name,
                            ..
                        },
                    ),
                    _,
                ) => {
                    // Until resolution proves a partial export is a namespace, it is still an
                    // ordinary named read of the outer module. The synthesized namespace rename
                    // reference records the member read on the resolved target.
                    ExportUsage::Named(export_name.clone())
                }
                _ => ExportUsage::All,
            },
        }
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.issue_source)
    }
}

impl EsmAssetReference {
    pub(crate) async fn code_generation(
        self: ResolvedVc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
        // References a compact re-export registration (`TURBOPACK_ESM_REEXPORT`) already imports
        // for itself. Emitting them here too would instantiate the module twice.
        subsumed_imports: &SubsumedImports,
        // The async modules referenced by the importing module, `None` when it isn't async.
        async_module_info: Option<&AsyncModuleInfo>,
    ) -> Result<CodeGeneration> {
        let this = &*self.await?;

        if chunking_context
            .unused_references()
            .contains_key(&ResolvedVc::upcast(self))
            .await?
        {
            return Ok(CodeGeneration::empty());
        }

        // only chunked references can be imported
        if this
            .extras
            .as_deref()
            .and_then(|e| e.chunking_type)
            .is_none_or(|v| v != SpecifiedChunkingType::None)
        {
            let import_externals = this.import_externals;
            let referenced_asset = self.get_referenced_asset().await?;

            match &referenced_asset {
                ReferencedAsset::Unresolvable => {
                    // Insert code that throws immediately at time of import if a request is
                    // unresolvable
                    let request = &this.request;
                    let stmt = Stmt::Expr(ExprStmt {
                        expr: Box::new(throw_module_not_found_expr(request)),
                        span: DUMMY_SP,
                    });
                    return Ok(CodeGeneration::hoisted_stmt(
                        format!("throw {request}").into(),
                        stmt,
                    ));
                }
                // A module without ECMAScript bindings (e.g. a stylesheet) may still
                // be imported for its side effects, which needs no code generation.
                ReferencedAsset::None
                | ReferencedAsset::Empty
                | ReferencedAsset::NonPlaceable(_) => {}
                _ => {
                    let mut result = vec![];

                    let merged_index = if let ReferencedAsset::Some(asset) = &referenced_asset {
                        scope_hoisting_context.get_module_index(*asset)
                    } else {
                        None
                    };

                    if let Some(merged_index) = merged_index {
                        // Insert a placeholder to inline the merged module at the right place
                        // relative to the other references (so to keep reference order).
                        result.push(CodeGenerationHoistedStmt::new(
                            format!("hoisted {merged_index}").into(),
                            quote!(
                                "__turbopack_merged_esm__($id);" as Stmt,
                                id: Expr = Lit::Num(merged_index.into()).into(),
                            ),
                        ));
                    }

                    if merged_index.is_some()
                        && matches!(this.export_name, Some(ModulePart::Evaluation))
                    {
                        // No need to import, the module was already executed and is available in
                        // the same scope hoisting group (unless it's a
                        // namespace import)
                    } else if matches!(this.export_name, Some(ModulePart::Evaluation))
                        && this
                            .is_effectively_deferred(&referenced_asset, async_module_info)
                            .await?
                    {
                        // The evaluation of a deferred import happens on first access of the
                        // namespace, the binding references create the deferred namespace.
                    } else {
                        'import: {
                            let ident = this
                                .get_ident(
                                    &referenced_asset,
                                    chunking_context,
                                    this.export_name
                                        .as_ref()
                                        .and_then(ModulePart::get_export)
                                        .cloned(),
                                    scope_hoisting_context,
                                    async_module_info,
                                )
                                .await?
                                // An eagerly evaluated `import defer` is imported like a regular
                                // import
                                .map(ReferencedAssetIdent::without_eager_deferred);
                            // `referenced_asset` must not be used past this point: the ident
                            // carries everything about the import
                            // target (see `ImportSource`) — notably,
                            // when the ident was resolved through a re-export chain, the
                            // directly-referenced asset is the outer (rename) module, not the one
                            // the emitted variable actually holds.
                            drop(referenced_asset);
                            let span = this
                                .issue_source
                                .to_swc_offsets()
                                .await?
                                .map_or(DUMMY_SP, |(start, end)| {
                                    Span::new(BytePos(start), BytePos(end))
                                });
                            match ident {
                                Some(ReferencedAssetIdent::LocalBinding { .. }) => {
                                    // no need to import
                                }
                                Some(ReferencedAssetIdent::Module {
                                    ctxt,
                                    export: _,
                                    import_source,
                                    deferred: Some(deferred),
                                }) => {
                                    // `var __TURBOPACK__deferred__module__... =
                                    //      __turbopack_import_defer__(id)`
                                    // creates a function that evaluates the module on first call.
                                    let name = Ident::new(
                                        deferred.namespace_ident.as_str().into(),
                                        DUMMY_SP,
                                        ctxt.unwrap_or_default(),
                                    );
                                    let arg = match &import_source {
                                        ImportSource::Module { asset, .. } => module_id_to_lit(
                                            &asset.chunk_item_id(chunking_context).await?,
                                        ),
                                        ImportSource::External {
                                            request,
                                            ty: ExternalType::CommonJs,
                                            ..
                                        } => {
                                            if !*chunking_context
                                                .environment()
                                                .supports_commonjs_externals()
                                                .await?
                                            {
                                                turbobail!(
                                                    "the chunking context ({}) does not support \
                                                     external modules (request: {request})",
                                                    chunking_context.name()
                                                );
                                            }
                                            quote!(
                                                "() => $turbopack_external_require($id, () => require($id), true)" as Expr,
                                                turbopack_external_require: Expr = TURBOPACK_EXTERNAL_REQUIRE.into(),
                                                id: Expr = Expr::Lit(request.to_string().into())
                                            )
                                        }
                                        ImportSource::External { request, ty, .. } => {
                                            bail!(
                                                "Unsupported external type {:?} for deferred ESM \
                                                 reference with request: {:?}",
                                                ty,
                                                request
                                            )
                                        }
                                    };
                                    let mut call_expr = match &deferred.evaluate_first {
                                        Some(evaluate_first) => quote!(
                                            "$turbopack_import_defer($arg, $evaluate_first)" as Expr,
                                            turbopack_import_defer: Expr = TURBOPACK_IMPORT_DEFER.into(),
                                            arg: Expr = arg,
                                            evaluate_first: Expr = module_id_to_lit(evaluate_first),
                                        ),
                                        None => quote!(
                                            "$turbopack_import_defer($arg)" as Expr,
                                            turbopack_import_defer: Expr = TURBOPACK_IMPORT_DEFER.into(),
                                            arg: Expr = arg,
                                        ),
                                    };
                                    if this.is_pure_import {
                                        call_expr.set_span(PURE_SP);
                                    }
                                    result.push(CodeGenerationHoistedStmt::new(
                                        format!("{} {:?}", name.sym, ctxt).into(),
                                        var_decl_with_span(
                                            quote!(
                                                "var $name = $call;" as Stmt,
                                                name = name,
                                                call: Expr = call_expr
                                            ),
                                            span,
                                        ),
                                    ));
                                }
                                Some(ReferencedAssetIdent::Module {
                                    ctxt,
                                    export: _,
                                    import_source,
                                    deferred: None,
                                }) => {
                                    let namespace_key =
                                        (import_source.namespace_ident().to_owned(), ctxt);
                                    if subsumed_imports.namespaces.contains(&namespace_key)
                                        && (!matches!(
                                            this.export_name,
                                            Some(ModulePart::Evaluation)
                                        ) || subsumed_imports.evaluation_spans.contains(&span))
                                    {
                                        // A compact re-export registration performs this import.
                                        // An evaluation import with a different span is a separate
                                        // earlier declaration of the same module and stays in
                                        // place.
                                        break 'import;
                                    }
                                    let name = Ident::new(
                                        namespace_key.0.into(),
                                        DUMMY_SP,
                                        ctxt.unwrap_or_default(),
                                    );
                                    let (key, mut call_expr) = match import_source {
                                        ImportSource::Module { asset, .. } => {
                                            let id = asset.chunk_item_id(chunking_context).await?;
                                            // Include ctxt in the key to prevent incorrect
                                            // deduplication when multiple merged modules import the
                                            // same target but have different syntax contexts (which
                                            // would cause hygiene to rename one of them).
                                            (
                                                format!("{} {:?}", id, ctxt).into(),
                                                quote!(
                                                    "$turbopack_import($id)" as Expr,
                                                    turbopack_import: Expr = TURBOPACK_IMPORT.into(),
                                                    id: Expr = module_id_to_lit(&id),
                                                ),
                                            )
                                        }
                                        ImportSource::External {
                                            request,
                                            ty: ExternalType::EcmaScriptModule,
                                            ..
                                        } => {
                                            if !*chunking_context
                                                .environment()
                                                .supports_esm_externals()
                                                .await?
                                            {
                                                turbobail!(
                                                    "the chunking context ({}) does not support \
                                                     external modules (esm request: {request})",
                                                    chunking_context.name()
                                                );
                                            }
                                            let call = if import_externals {
                                                quote!(
                                                    "$turbopack_external_import($id)" as Expr,
                                                    turbopack_external_import: Expr = TURBOPACK_EXTERNAL_IMPORT.into(),
                                                    id: Expr = Expr::Lit(request.to_string().into())
                                                )
                                            } else {
                                                quote!(
                                                    "$turbopack_external_require($id, () => require($id), true)" as Expr,
                                                    turbopack_external_require: Expr = TURBOPACK_EXTERNAL_REQUIRE.into(),
                                                    id: Expr = Expr::Lit(request.to_string().into())
                                                )
                                            };
                                            (name.sym.as_str().into(), call)
                                        }
                                        ImportSource::External {
                                            request,
                                            ty: ExternalType::CommonJs | ExternalType::Url,
                                            ..
                                        } => {
                                            if !*chunking_context
                                                .environment()
                                                .supports_commonjs_externals()
                                                .await?
                                            {
                                                turbobail!(
                                                    "the chunking context ({}) does not support \
                                                     external modules (request: {request})",
                                                    chunking_context.name()
                                                );
                                            }
                                            let call = quote!(
                                                "$turbopack_external_require($id, () => require($id), true)" as Expr,
                                                turbopack_external_require: Expr = TURBOPACK_EXTERNAL_REQUIRE.into(),
                                                id: Expr = Expr::Lit(request.to_string().into())
                                            );
                                            (name.sym.as_str().into(), call)
                                        }
                                        // fallback in case we introduce a new `ExternalType`
                                        #[allow(unreachable_patterns)]
                                        ImportSource::External { request, ty, .. } => {
                                            bail!(
                                                "Unsupported external type {:?} for ESM reference \
                                                 with request: {:?}",
                                                ty,
                                                request
                                            )
                                        }
                                    };
                                    if this.is_pure_import {
                                        call_expr.set_span(PURE_SP);
                                    }
                                    result.push(CodeGenerationHoistedStmt::new(
                                        key,
                                        var_decl_with_span(
                                            quote!(
                                                "var $name = $call;" as Stmt,
                                                name = name,
                                                call: Expr = call_expr
                                            ),
                                            span,
                                        ),
                                    ));
                                }
                                None => {
                                    // Nothing to import.
                                }
                            }
                        }
                    }
                    return Ok(CodeGeneration::hoisted_stmts(result));
                }
            }
        };

        Ok(CodeGeneration::empty())
    }
}

fn var_decl_with_span(mut decl: Stmt, span: Span) -> Stmt {
    match &mut decl {
        Stmt::Decl(Decl::Var(decl)) => decl.span = span,
        _ => panic!("Expected Stmt::Decl::Var"),
    };
    decl
}

#[turbo_tasks::value(shared)]
pub struct InvalidExport {
    export: RcStr,
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    source: IssueSource,
    /// The module containing the import declaration, used to find the other names imported by the
    /// same declaration (so they aren't suggested as alternatives).
    importing_module: ResolvedVc<EcmascriptModuleAsset>,
    /// The request of the import declaration.
    request: RcStr,
}

impl InvalidExport {
    /// Returns the export names referenced by the other specifiers of the import (or re-export)
    /// declaration that requested the missing export. All specifiers of one declaration share the
    /// declaration's span and request.
    ///
    /// This reads the importing module's parse result, so it's only meant to be called when the
    /// issue is rendered.
    async fn names_imported_by_same_declaration(&self) -> Result<FxHashSet<RcStr>> {
        let ParseResult::Ok { eval_context, .. } = &*self.importing_module.failsafe_parse().await?
        else {
            return Ok(FxHashSet::default());
        };
        let source = self.importing_module.await?.source;
        Ok(eval_context
            .imports
            .references()
            .filter_map(|r| {
                let ImportedSymbol::Symbol(name) = &r.imported_symbol else {
                    return None;
                };
                (IssueSource::from_swc_offsets(source, r.span.lo.to_u32(), r.span.hi.to_u32())
                    == self.source
                    && *r.module_path.to_string_lossy() == *self.request)
                    .then(|| RcStr::from(&**name))
            })
            .collect())
    }
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for InvalidExport {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Line(vec![
            StyledString::Text(rcstr!("Export ")),
            StyledString::Code(self.export.clone()),
            StyledString::Text(rcstr!(" doesn't exist in target module")),
        ]))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Bindings
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        self.source.file_path().await
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        let export_names = all_known_export_names(*self.module).await?;
        let already_imported = self.names_imported_by_same_declaration().await?;
        let did_you_mean = export_names
            .iter()
            .filter(|s| !already_imported.contains(*s))
            .map(|s| (s, jaro(self.export.as_str(), s.as_str())))
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
            .map(|(s, _)| s);
        let mut lines = vec![StyledString::Line(vec![
            StyledString::Text(rcstr!("The export ")),
            StyledString::Code(self.export.clone()),
            StyledString::Text(rcstr!(" was not found in module ")),
            StyledString::Strong(self.module.ident().to_string().owned().await?),
            StyledString::Text(rcstr!(".")),
        ])];
        if let Some(did_you_mean) = did_you_mean {
            lines.push(StyledString::Line(vec![
                StyledString::Text(rcstr!("Did you mean to import ")),
                StyledString::Code(did_you_mean.clone()),
                StyledString::Text(rcstr!("?")),
            ]));
        } else if export_names.is_empty() {
            lines.push(StyledString::Strong(rcstr!(
                "The module has no exports at all."
            )));
        }
        // Otherwise all exports are already imported by the same declaration, so there is nothing
        // to suggest.
        lines.push(StyledString::Text(
            "All exports of the module are statically known (It doesn't have dynamic exports). So \
             it's known statically that the requested export doesn't exist."
                .into(),
        ));
        Ok(Some(StyledString::Stack(lines)))
    }

    async fn detail(&self) -> Result<Option<StyledString>> {
        let export_names = all_known_export_names(*self.module).await?;
        Ok(Some(StyledString::Line(vec![
            StyledString::Text(rcstr!("These are the exports of the module:\n")),
            StyledString::Code(
                export_names
                    .iter()
                    .map(|s| s.as_str())
                    .intersperse(", ")
                    .collect::<String>()
                    .into(),
            ),
        ])))
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.source)
    }
}

#[turbo_tasks::value(shared)]
pub struct CircularReExport {
    export: RcStr,
    import: Option<RcStr>,
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    module_cycle: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for CircularReExport {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Line(vec![
            StyledString::Text(rcstr!("Export ")),
            StyledString::Code(self.export.clone()),
            StyledString::Text(rcstr!(" is a circular re-export")),
        ]))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Bindings
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.module.ident().await?.path.clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Stack(vec![
            StyledString::Line(vec![StyledString::Text(rcstr!("The export"))]),
            StyledString::Line(vec![
                StyledString::Code(self.export.clone()),
                StyledString::Text(rcstr!(" of module ")),
                StyledString::Strong(self.module.ident().to_string().owned().await?),
            ]),
            StyledString::Line(vec![StyledString::Text(rcstr!(
                "is a re-export of the export"
            ))]),
            StyledString::Line(vec![
                StyledString::Code(self.import.clone().unwrap_or_else(|| rcstr!("*"))),
                StyledString::Text(rcstr!(" of module ")),
                StyledString::Strong(self.module_cycle.ident().to_string().owned().await?),
                StyledString::Text(rcstr!(".")),
            ]),
        ])))
    }

    fn source(&self) -> Option<IssueSource> {
        // TODO(PACK-4879): This should point at the buggy export by querying for the source
        // location
        None
    }
}
