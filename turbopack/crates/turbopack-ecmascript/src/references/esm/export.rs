use std::{collections::BTreeMap, ops::ControlFlow};

use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use indexmap::map::Entry;
use rustc_hash::FxHashSet;
use swc_core::{
    common::{DUMMY_SP, Span, SyntaxContext},
    ecma::ast::{
        ArrayLit, AssignTarget, Expr, ExprOrSpread, ExprStmt, Ident, Lit, Number,
        SimpleAssignTarget, Stmt, Str,
    },
    quote, quote_expr,
};
use turbo_frozenmap::FrozenMap;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, NonLocalValue, ResolvedVc, TryFlatJoinIterExt, Vc, turbofmt};
use turbopack_core::{
    chunk::{ChunkingContext, ModuleChunkItemIdExt},
    ident::AssetIdent,
    issue::{IssueExt, IssueSeverity, analyze::AnalyzeIssue},
    module::{Module, ModuleSideEffects},
    module_graph::binding_usage_info::ModuleExportUsageInfo,
    reference::ModuleReference,
    resolve::ModulePart,
};

use crate::{
    EcmascriptModuleAsset, ScopeHoistingContext,
    analyzer::{
        graph::EvalContext,
        imports::{Export, ExportRegistrationMode},
    },
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    code_gen::{CodeGeneration, CodeGenerationHoistedStmt},
    magic_identifier::MAGIC_IDENTIFIER_DEFAULT_EXPORT_ATOM,
    module_fragments::part::module::EcmascriptModulePartAsset,
    references::esm::{
        base::{EsmAssetReference, ImportSource, ReferencedAsset, ReferencedAssetIdent},
        mangle::mangled_export_names,
    },
    runtime_functions::{TURBOPACK_DYNAMIC, TURBOPACK_ESM, TURBOPACK_ESM_REEXPORT},
    side_effect_optimization::reference::EcmascriptModulePartReference,
    utils::module_id_to_lit,
};

/// Models the 'liveness' of an esm export
/// All ESM exports are technically live but many never change and we can optimize representation to
/// support that, this enum tracks the actual behavior of the export binding.
#[derive(Copy, Clone, Hash, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub enum Liveness {
    // The binding never changes after module evaluation
    Constant,
    // The binding may change after module evaluation
    Live,
    // The binding needs to be exposed as mutable to callers.  This isn't part of the spec but is
    // part of our module-fragments optimization where we split modules into parts and preserve
    // mutability of variables via mutable exports.
    Mutable,
}

/// An exported local binding.
#[derive(Clone, Hash, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub struct LocalBinding {
    /// The name the binding has inside the module.
    pub name: RcStr,
    pub liveness: Liveness,
    /// Whether calling this export could maybe observe `this` passed by the caller.
    pub maybe_uses_this: bool,
}

impl LocalBinding {
    /// A binding whose value has not been analyzed, so it must be treated as live and as able to
    /// observe `this`.
    pub fn unanalyzed(name: RcStr) -> Self {
        LocalBinding {
            name,
            liveness: Liveness::Live,
            maybe_uses_this: true,
        }
    }
}

#[derive(Clone, Hash, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub enum EsmExport {
    /// A local binding that is exported (export { a } or export const a = 1)
    LocalBinding(LocalBinding),
    /// An imported binding that is exported (export { a as b } from "...")
    ///
    /// Fields: (module_reference, name, is_mutable)
    ImportedBinding(ResolvedVc<Box<dyn ModuleReference>>, RcStr, bool),
    /// An imported namespace that is exported (export * from "...")
    ImportedNamespace(ResolvedVc<Box<dyn ModuleReference>>),
    /// An error occurred while resolving the export
    Error,
}

#[turbo_tasks::function]
pub async fn is_export_missing(
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    export_name: RcStr,
) -> Result<Vc<bool>> {
    if export_name == "__turbopack_module_id__" {
        return Ok(Vc::cell(false));
    }

    let exports = module.get_exports().await?;
    let exports = match &*exports {
        EcmascriptExports::None => return Ok(Vc::cell(true)),
        EcmascriptExports::Unknown => return Ok(Vc::cell(false)),
        EcmascriptExports::Value => return Ok(Vc::cell(false)),
        EcmascriptExports::CommonJs(_) => return Ok(Vc::cell(false)),
        EcmascriptExports::EmptyCommonJs => return Ok(Vc::cell(export_name != "default")),
        EcmascriptExports::DynamicNamespace => return Ok(Vc::cell(false)),
        EcmascriptExports::EsmExports(exports) => *exports,
    };

    let exports = exports.await?;
    if exports.exports.contains_key(&export_name) {
        return Ok(Vc::cell(false));
    }
    if export_name == "default" {
        return Ok(Vc::cell(true));
    }

    if exports.star_exports.is_empty() {
        return Ok(Vc::cell(true));
    }

    let all_export_names = get_all_export_names(*module).await?;
    if all_export_names.esm_exports.contains_key(&export_name) {
        return Ok(Vc::cell(false));
    }

    for &dynamic_module in &all_export_names.dynamic_exporting_modules {
        let exports = dynamic_module.get_exports().await?;
        match &*exports {
            EcmascriptExports::Value
            | EcmascriptExports::CommonJs(_)
            | EcmascriptExports::DynamicNamespace
            | EcmascriptExports::Unknown => {
                return Ok(Vc::cell(false));
            }
            EcmascriptExports::None
            | EcmascriptExports::EmptyCommonJs
            | EcmascriptExports::EsmExports(_) => {}
        }
    }

    Ok(Vc::cell(true))
}

#[turbo_tasks::function]
pub async fn all_known_export_names(
    module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
) -> Result<Vc<Vec<RcStr>>> {
    let export_names = get_all_export_names(module).await?;
    Ok(Vc::cell(export_names.esm_exports.keys().cloned().collect()))
}

#[derive(Copy, Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub enum FoundExportType {
    Found,
    Dynamic,
    NotFound,
    SideEffects,
    Unknown,
}

#[turbo_tasks::value]
pub struct FollowExportsResult {
    pub module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    pub export_name: Option<RcStr>,
    pub ty: FoundExportType,
}

#[turbo_tasks::function]
pub async fn follow_reexports(
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    export_name: RcStr,
    ignore_side_effect_of_entry: bool,
) -> Result<Vc<FollowExportsResult>> {
    let mut ignore_side_effects = ignore_side_effect_of_entry;

    let mut module = module;
    let mut export_name = export_name;
    loop {
        if !ignore_side_effects
            && *module.side_effects().await? != ModuleSideEffects::SideEffectFree
        {
            // TODO It's unfortunate that we have to use the whole module here.
            // This is often the Facade module, which includes all reexports.
            // Often we could use Locals + the followed reexports instead.
            return Ok(FollowExportsResult::cell(FollowExportsResult {
                module,
                export_name: Some(export_name),
                ty: FoundExportType::SideEffects,
            }));
        }
        ignore_side_effects = false;

        let exports = module.get_exports().await?;
        let EcmascriptExports::EsmExports(exports) = &*exports else {
            return Ok(FollowExportsResult::cell(FollowExportsResult {
                module,
                export_name: Some(export_name),
                ty: FoundExportType::Dynamic,
            }));
        };

        // Try to find the export in the local exports
        let exports_ref = exports.await?;
        if let Some(export) = exports_ref.exports.get(&export_name) {
            match handle_declared_export(module, export_name, export).await? {
                ControlFlow::Continue((m, n)) => {
                    module = m.to_resolved().await?;
                    export_name = n;
                    continue;
                }
                ControlFlow::Break(result) => {
                    return Ok(result.cell());
                }
            }
        }

        // Try to find the export in the star exports
        if !exports_ref.star_exports.is_empty() && &*export_name != "default" {
            let result = find_export_from_reexports(*module, export_name.clone()).await?;
            match &*result {
                FindExportFromReexportsResult::NotFound => {
                    return Ok(FollowExportsResult::cell(FollowExportsResult {
                        module,
                        export_name: Some(export_name),
                        ty: FoundExportType::NotFound,
                    }));
                }
                FindExportFromReexportsResult::EsmExport(esm_export) => {
                    match handle_declared_export(module, export_name, esm_export).await? {
                        ControlFlow::Continue((m, n)) => {
                            module = m.to_resolved().await?;
                            export_name = n;
                            continue;
                        }
                        ControlFlow::Break(result) => {
                            return Ok(result.cell());
                        }
                    }
                }
                FindExportFromReexportsResult::Dynamic(dynamic_exporting_modules) => {
                    return match &dynamic_exporting_modules[..] {
                        [] => unreachable!(),
                        [module] => Ok(FollowExportsResult {
                            module: *module,
                            export_name: Some(export_name),
                            ty: FoundExportType::Dynamic,
                        }
                        .cell()),
                        _ => Ok(FollowExportsResult {
                            module,
                            export_name: Some(export_name),
                            ty: FoundExportType::Dynamic,
                        }
                        .cell()),
                    };
                }
            }
        }

        return Ok(FollowExportsResult::cell(FollowExportsResult {
            module,
            export_name: Some(export_name),
            ty: FoundExportType::NotFound,
        }));
    }
}

async fn handle_declared_export(
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    export_name: RcStr,
    export: &EsmExport,
) -> Result<ControlFlow<FollowExportsResult, (Vc<Box<dyn EcmascriptChunkPlaceable>>, RcStr)>> {
    match export {
        EsmExport::ImportedBinding(reference, name, _) => {
            if let ReferencedAsset::Some(module) =
                ReferencedAsset::from_resolve_result(reference.resolve_reference()).await?
            {
                return Ok(ControlFlow::Continue((*module, name.clone())));
            }
        }
        EsmExport::ImportedNamespace(reference) => {
            if let ReferencedAsset::Some(module) =
                ReferencedAsset::from_resolve_result(reference.resolve_reference()).await?
            {
                return Ok(ControlFlow::Break(FollowExportsResult {
                    module,
                    export_name: None,
                    ty: FoundExportType::Found,
                }));
            }
        }
        EsmExport::LocalBinding(..) => {
            return Ok(ControlFlow::Break(FollowExportsResult {
                module,
                export_name: Some(export_name),
                ty: FoundExportType::Found,
            }));
        }
        EsmExport::Error => {
            return Ok(ControlFlow::Break(FollowExportsResult {
                module,
                export_name: Some(export_name),
                ty: FoundExportType::Unknown,
            }));
        }
    }
    Ok(ControlFlow::Break(FollowExportsResult {
        module,
        export_name: Some(export_name),
        ty: FoundExportType::Unknown,
    }))
}

#[turbo_tasks::value]
enum FindExportFromReexportsResult {
    NotFound,
    EsmExport(EsmExport),
    Dynamic(Vec<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>),
}

#[turbo_tasks::function]
async fn find_export_from_reexports(
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    export_name: RcStr,
) -> Result<Vc<FindExportFromReexportsResult>> {
    // TODO why do we need a special case for this?
    if let Some(module) = ResolvedVc::try_downcast_type::<EcmascriptModulePartAsset>(module)
        && matches!(module.await?.part, ModulePart::Exports)
    {
        let module_part = EcmascriptModulePartAsset::select_part(
            *module.await?.full_module,
            ModulePart::export(export_name.clone()),
        );

        // If we apply this logic to EcmascriptModuleAsset, we will resolve everything in the
        // target module.
        if (ResolvedVc::try_downcast_type::<EcmascriptModuleAsset>(
            module_part.to_resolved().await?,
        ))
        .is_none()
        {
            return Ok(find_export_from_reexports(module_part, export_name));
        }
    }

    let all_export_names = get_all_export_names(*module).await?;
    Ok(
        if let Some(esm_export) = all_export_names.esm_exports.get(&export_name) {
            FindExportFromReexportsResult::EsmExport(esm_export.clone())
        } else if all_export_names.dynamic_exporting_modules.is_empty() {
            FindExportFromReexportsResult::NotFound
        } else {
            FindExportFromReexportsResult::Dynamic(
                all_export_names.dynamic_exporting_modules.clone(),
            )
        }
        .cell(),
    )
}

#[turbo_tasks::value]
struct AllExportNamesResult {
    /// A map from export name to how each export is defined.
    #[bincode(with = "turbo_bincode::indexmap")]
    esm_exports: FxIndexMap<RcStr, EsmExport>,
    /// A list of all direct or indirectly referenced modules that are dynamically exporting
    dynamic_exporting_modules: Vec<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
}

#[turbo_tasks::function]
async fn get_all_export_names(
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
) -> Result<Vc<AllExportNamesResult>> {
    let exports = module.get_exports().await?;
    let EcmascriptExports::EsmExports(exports) = &*exports else {
        return Ok(AllExportNamesResult {
            esm_exports: FxIndexMap::default(),
            dynamic_exporting_modules: vec![module],
        }
        .cell());
    };

    let exports = exports.await?;
    let mut esm_exports = FxIndexMap::default();
    let mut dynamic_exporting_modules = Vec::new();
    esm_exports.extend(
        exports
            .exports
            .iter()
            .map(|(name, esm_export)| (name.clone(), esm_export.clone())),
    );
    let star_export_names = exports
        .star_exports
        .iter()
        .map(async |esm_ref| {
            Ok(
                if let ReferencedAsset::Some(m) =
                    ReferencedAsset::from_resolve_result(esm_ref.resolve_reference()).await?
                {
                    Some(expand_star_exports(**esm_ref, *m))
                } else {
                    None
                },
            )
        })
        .try_flat_join()
        .await?;
    for star_export_names in star_export_names {
        let star_export_names = star_export_names.await?;
        esm_exports.extend(
            star_export_names
                .esm_exports
                .iter()
                .map(|(k, v)| (k.clone(), v.clone())),
        );
        dynamic_exporting_modules
            .extend(star_export_names.dynamic_exporting_modules.iter().copied());
    }

    Ok(AllExportNamesResult {
        esm_exports,
        dynamic_exporting_modules,
    }
    .cell())
}

#[turbo_tasks::value]
pub struct ExpandStarResult {
    #[bincode(with = "turbo_bincode::indexmap")]
    pub esm_exports: FxIndexMap<RcStr, EsmExport>,
    pub dynamic_exporting_modules: Vec<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
}

#[turbo_tasks::function]
pub async fn expand_star_exports(
    root_reference: ResolvedVc<Box<dyn ModuleReference>>,
    root_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
) -> Result<Vc<ExpandStarResult>> {
    let mut esm_exports = FxIndexMap::default();
    let mut dynamic_exporting_modules = Vec::new();
    let mut checked_modules = FxHashSet::default();
    checked_modules.insert(root_module);
    let mut queue = vec![(root_reference, root_module, root_module.get_exports())];
    while let Some((reference, asset, exports)) = queue.pop() {
        match &*exports.await? {
            EcmascriptExports::EsmExports(exports) => {
                let exports = exports.await?;
                for (key, esm_export) in exports.exports.iter() {
                    if key == "default" {
                        continue;
                    }
                    if let Entry::Vacant(entry) = esm_exports.entry(key.clone()) {
                        entry.insert(match esm_export {
                            // `maybe_uses_this` has no place on an imported binding, so the
                            // conservative default applies again from here.
                            EsmExport::LocalBinding(binding) => EsmExport::ImportedBinding(
                                reference,
                                key.clone(),
                                binding.liveness == Liveness::Mutable,
                            ),
                            _ => esm_export.clone(),
                        });
                    }
                }
                for esm_ref in exports.star_exports.iter() {
                    if let ReferencedAsset::Some(asset) =
                        &ReferencedAsset::from_resolve_result(esm_ref.resolve_reference()).await?
                        && checked_modules.insert(*asset)
                    {
                        queue.push((*esm_ref, *asset, asset.get_exports()));
                    }
                }
            }
            EcmascriptExports::None | EcmascriptExports::EmptyCommonJs => {
                emit_star_exports_issue(
                    asset.ident(),
                    turbofmt!(
                        "export * used with module {} which has no exports\nTypescript only: Did \
                         you want to export only types with `export type * from \"...\"`?\nNote: \
                         Using `export type` is more efficient than `export *` as it won't emit \
                         any runtime code.",
                        asset.ident()
                    )
                    .await?,
                )
                .await?
            }
            EcmascriptExports::Value => {
                emit_star_exports_issue(
                    asset.ident(),
                    turbofmt!(
                        "export * used with module {} which only has a default export (default \
                         export is not exported with export *)\nDid you want to use `export {{ \
                         default }} from \"...\";` instead?",
                        asset.ident()
                    )
                    .await?,
                )
                .await?
            }
            EcmascriptExports::CommonJs(_) => {
                dynamic_exporting_modules.push(asset);
                emit_star_exports_issue(
                    asset.ident(),
                    turbofmt!(
                        "export * used with module {} which is a CommonJS module with exports \
                         only available at runtime\nList all export names manually (`export {{ a, \
                         b, c }} from \"...\") or rewrite the module to ESM, to avoid the \
                         additional runtime code.`",
                        asset.ident()
                    )
                    .await?,
                )
                .await?;
            }
            EcmascriptExports::DynamicNamespace => {
                dynamic_exporting_modules.push(asset);
            }
            EcmascriptExports::Unknown => {
                // Propagate the Unknown export type to a certain extent.
                dynamic_exporting_modules.push(asset);
            }
        }
    }

    Ok(ExpandStarResult {
        esm_exports,
        dynamic_exporting_modules,
    }
    .cell())
}

async fn emit_star_exports_issue(source_ident: Vc<AssetIdent>, message: RcStr) -> Result<()> {
    AnalyzeIssue::new(
        IssueSeverity::Warning,
        source_ident,
        rcstr!("unexpected export *"),
        message,
        None,
        None,
    )
    .to_resolved()
    .await?
    .emit();
    Ok(())
}

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug)]
pub struct EsmExports {
    /// Explicit exports
    pub exports: FrozenMap<RcStr, EsmExport>,
    /// Unexpanded `export * from ...` statements (expanded in `expand_star_exports`)
    pub star_exports: Vec<ResolvedVc<Box<dyn ModuleReference>>>,
    /// Whether the keys these exports are emitted under may be shortened. Carried with the exports
    /// so a module deriving its exports from another (facade, locals, part, rename) inherits it.
    /// `mangle::mangled_export_names` decides whether they actually are.
    pub mangle_export_names: bool,
}

/// The expanded version of [`EsmExports`], the `exports` field here includes all exports that could
/// be expanded from `star_exports`.
///
/// [`EsmExports::star_exports`] that could not be (fully) expanded end up in `dynamic_exports`.
#[turbo_tasks::value(shared)]
#[derive(Hash, Debug)]
pub struct ExpandedExports {
    pub exports: FrozenMap<RcStr, EsmExport>,
    /// Modules we couldn't analyze all exports of.
    pub dynamic_exports: Vec<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
}

#[turbo_tasks::value_impl]
impl EsmExports {
    /// Creates an EsmExports that re-exports all exports from another module.
    /// This is useful for wrapper modules that simply forward all exports.
    ///
    /// The resulting exports will have:
    /// - A default export binding to the module's default
    /// - A star export that re-exports all named exports
    #[turbo_tasks::function]
    pub async fn reexport_including_default(
        module_reference: Vc<Box<dyn ModuleReference>>,
    ) -> Result<Vc<EcmascriptExports>> {
        let module_reference = module_reference.to_resolved().await?;
        let mut exports = Vec::new();
        let default = rcstr!("default");
        exports.push((
            default.clone(),
            EsmExport::ImportedBinding(module_reference, default, false),
        ));

        Ok(EcmascriptExports::EsmExports(
            EsmExports {
                exports: FrozenMap::from(exports),
                star_exports: vec![module_reference],
                // These facades exist so that a host framework can find the wrapped module's
                // exports by name, so their keys have to stay as written.
                mangle_export_names: false,
            }
            .resolved_cell(),
        )
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn expand_exports(
        &self,
        export_usage_info: Vc<ModuleExportUsageInfo>,
    ) -> Result<Vc<ExpandedExports>> {
        let mut exports: BTreeMap<_, _> = self
            .exports
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        let mut dynamic_exports = vec![];
        let export_usage_info = export_usage_info.await?;

        if !matches!(*export_usage_info, ModuleExportUsageInfo::All) {
            exports.retain(|export, _| export_usage_info.is_export_used(export));
        }

        for &esm_ref in self.star_exports.iter() {
            // TODO(PACK-2176): we probably need to handle re-exporting from external
            // modules.
            let ReferencedAsset::Some(asset) =
                &ReferencedAsset::from_resolve_result(esm_ref.resolve_reference()).await?
            else {
                continue;
            };

            let export_info = expand_star_exports(*esm_ref, **asset).await?;

            for export in export_info.esm_exports.keys() {
                if export == "default" {
                    continue;
                }
                if !export_usage_info.is_export_used(export) {
                    continue;
                }

                // the spec indicates first-one-wins: https://tc39.es/ecma262/#_ref_9060
                exports
                    .entry(export.clone())
                    .or_insert_with(|| EsmExport::ImportedBinding(esm_ref, export.clone(), false));
            }

            if !export_info.dynamic_exporting_modules.is_empty() {
                dynamic_exports.push(*asset);
            }
        }

        Ok(ExpandedExports {
            exports: FrozenMap::from(exports),
            dynamic_exports,
        }
        .cell())
    }
}

/// Resolves a synthetic facade reference to the namespace key and module used by a compact group.
async fn compact_reference_target(
    reference: ResolvedVc<Box<dyn ModuleReference>>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    scope_hoisting_context: ScopeHoistingContext<'_>,
) -> Result<Option<(NamespaceKey, ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>)>> {
    let referenced_asset =
        ReferencedAsset::from_resolve_result(reference.resolve_reference()).await?;
    let Some(ReferencedAssetIdent::Module {
        namespace_ident,
        ctxt,
        import_source: ImportSource::Module { asset },
        ..
    }) = referenced_asset
        .get_ident(chunking_context, None, scope_hoisting_context)
        .await?
    else {
        return Ok(None);
    };
    Ok(Some(((namespace_ident, ctxt), asset)))
}

/// Collects the exports into one group per source module, or returns `None` if any export does not
/// fit the compact shape (a plain, immutable forward of a named binding out of an in-graph module)
/// so the caller falls back to the general registration.
async fn build_compact_reexports(
    exports: &FrozenMap<RcStr, EsmExport>,
    mangled_names: Option<&FrozenMap<RcStr, RcStr>>,
    eval_context: &EvalContext,
    mode: ExportRegistrationMode,
    synthetic_references: Option<SyntheticReexportReferences<'_>>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    scope_hoisting_context: ScopeHoistingContext<'_>,
) -> Result<Option<CompactReexports>> {
    let unused_references = chunking_context.unused_references().await?;
    let locally_bound: FxHashSet<usize> = eval_context
        .imports
        .locally_bound_reference_idxs()
        .collect();

    // Keyed by the namespace variable, which names the resolved module: two exports forwarded from
    // the same module share a group even when they came from different `export ... from` clauses.
    let mut groups: FxIndexMap<NamespaceKey, ReexportGroup> = FxIndexMap::default();
    let mut synthetic_order: FxIndexMap<NamespaceKey, usize> = FxIndexMap::default();
    let mut positions_known = true;

    if let Some((part_references, esm_references)) = synthetic_references {
        // Structural part references run first. A retained facade locals reference may have no
        // forwarded names at all, but the empty group still imports it for evaluation. Do not add
        // a group for a reference the usage graph pruned: its target may not exist in this chunk,
        // and its code generation deliberately emits no namespace binding either.
        for (order, reference) in part_references.iter().enumerate() {
            if unused_references.contains_key(&ResolvedVc::upcast(*reference)) {
                continue;
            }

            let evaluation_only = reference.await?.is_evaluation_only();
            if let Some((key, asset)) = compact_reference_target(
                ResolvedVc::upcast(*reference),
                chunking_context,
                scope_hoisting_context,
            )
            .await?
            {
                // A merged evaluation reference only contributes the in-factory ordering
                // placeholder; it intentionally creates no namespace variable for `a.S` to read.
                if evaluation_only && scope_hoisting_context.get_module_index(asset).is_some() {
                    continue;
                }

                synthetic_order.entry(key.clone()).or_insert(order);
                groups.entry(key.clone()).or_insert_with(|| ReexportGroup {
                    order,
                    namespace_ident: key.0,
                    ctxt: key.1,
                    asset,
                    locally_bound: false,
                    reference_spans: FxHashSet::default(),
                    pairs: Vec::new(),
                });
            }
        }

        let offset = part_references.len();
        for (index, reference) in esm_references.iter().enumerate() {
            // Unused re-exports are absent from the module ID map and cannot contribute
            // an import or a source-order position to the compact registration.
            if unused_references.contains_key(&ResolvedVc::upcast(*reference)) {
                continue;
            }

            if let Some((key, _)) = compact_reference_target(
                ResolvedVc::upcast(*reference),
                chunking_context,
                scope_hoisting_context,
            )
            .await?
            {
                synthetic_order.entry(key).or_insert(offset + index);
            }
        }
    }

    for (exported, local) in exports {
        let EsmExport::ImportedBinding(esm_ref, imported_name, mutable) = local else {
            return Ok(None);
        };
        // The usage graph can prune a re-export's target even though its name is still
        // present in the facade's expanded export list. Do not generate a module ID for
        // a target that was excluded from chunking.
        if unused_references.contains_key(esm_ref) {
            continue;
        }
        if *mutable {
            // A mutable re-export needs a setter, which the compact form cannot express.
            return Ok(None);
        }

        // An ordinary module gets source order from its analysis-time import map. A synthetic
        // facade has no import map, so its explicit reference list supplies the same ordering.
        let idx = match eval_context.imports.exports.get(exported) {
            Some(Export::ImportedBinding(idx, _, _)) => Some(*idx),
            Some(_) => return Ok(None),
            None => None,
        };

        let referenced_asset =
            ReferencedAsset::from_resolve_result(esm_ref.resolve_reference()).await?;
        let Some(ReferencedAssetIdent::Module {
            namespace_ident,
            ctxt,
            export: Some(imported_key),
            import_source: ImportSource::Module { asset },
            ..
        }) = referenced_asset
            .get_ident(
                chunking_context,
                Some(imported_name.clone()),
                scope_hoisting_context,
            )
            .await?
        else {
            // Scope-hoisted into a local binding, an external, or a namespace re-export: none of
            // these are a property read off an imported namespace.
            return Ok(None);
        };

        let exported_key = mangled_names
            .and_then(|names| names.get(exported))
            .unwrap_or(exported)
            .clone();
        let key = (namespace_ident.clone(), ctxt);
        let order = if let Some(idx) = idx {
            idx
        } else if let Some(order) = synthetic_order.get(&key) {
            *order
        } else {
            positions_known = false;
            0
        };

        let group = groups.entry(key).or_insert_with(|| ReexportGroup {
            order,
            namespace_ident,
            ctxt,
            asset,
            locally_bound: false,
            reference_spans: FxHashSet::default(),
            pairs: Vec::new(),
        });
        group.order = group.order.min(order);
        if let Some(idx) = idx {
            group.locally_bound |= locally_bound.contains(&idx);
            group
                .reference_spans
                .insert(eval_context.imports.reference_span(idx));
        }
        group.pairs.push((exported_key, imported_key));
    }

    if groups.is_empty() {
        return Ok(None);
    }

    let mut groups: Vec<ReexportGroup> = groups.into_values().collect();
    groups.sort_by_key(|g| g.order);

    // A scope-hoisted factory contains several logical modules. Another registration in the same
    // factory may still read a namespace imported by this one, so suppression is only safe when
    // this module owns its factory. Unknown relative order is safe only for one group.
    let subsume_imports = mode == ExportRegistrationMode::Reexport
        && scope_hoisting_context.module().is_none()
        && (positions_known || groups.len() == 1)
        && !groups.iter().any(|group| group.locally_bound);

    Ok(Some(CompactReexports {
        groups,
        subsume_imports,
    }))
}

/// Builds the `TURBOPACK_ESM_REEXPORT` call and reports which references it subsumes.
async fn emit_compact_reexports(
    compact: CompactReexports,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    scope_hoisting_context: ScopeHoistingContext<'_>,
) -> Result<(CodeGeneration, SubsumedImports)> {
    let mut elems: Vec<Option<ExprOrSpread>> = Vec::new();
    let mut subsumed = SubsumedImports::default();

    for (i, group) in compact.groups.iter().enumerate() {
        // Both names of every pair are recovered by splitting on commas in the compact spelling,
        // so select that spelling independently for each group whose names are all comma-free.
        let comma_free = group
            .pairs
            .iter()
            .all(|(a, b)| !a.contains(',') && !b.contains(','));

        if i > 0 {
            // Separates this group from the previous one.
            elems.push(Some(Expr::Lit(Lit::Num(Number::from(0))).into()));
        }

        if compact.subsume_imports {
            let id = group.asset.chunk_item_id(chunking_context).await?;
            elems.push(Some(module_id_to_lit(&id).into()));
            subsumed
                .namespaces
                .insert((group.namespace_ident.clone(), group.ctxt));
            subsumed
                .evaluation_spans
                .extend(group.reference_spans.iter().copied());
        } else {
            elems.push(Some(
                Expr::Ident(Ident::new(
                    group.namespace_ident.clone().into(),
                    DUMMY_SP,
                    group.ctxt.unwrap_or_default(),
                ))
                .into(),
            ));
        }

        if group.pairs.is_empty() {
            // An evaluation-only group is represented by its head followed immediately by the
            // next group's sentinel (or the end of the list).
            continue;
        }

        if comma_free {
            let joined = group
                .pairs
                .iter()
                .flat_map(|(a, b)| [a.as_str(), b.as_str()])
                .collect::<Vec<_>>()
                .join(",");
            elems.push(Some(Expr::Lit(Lit::Str(joined.into())).into()));
        } else {
            for (exported, imported) in &group.pairs {
                elems.push(Some(Expr::Lit(Lit::Str(exported.as_str().into())).into()));
                elems.push(Some(Expr::Lit(Lit::Str(imported.as_str().into())).into()));
            }
        }
    }

    let list = Expr::Array(ArrayLit {
        span: DUMMY_SP,
        elems,
    });

    let stmt = if let Some(module) = scope_hoisting_context.module() {
        let id = module.chunk_item_id(chunking_context).await?;
        quote!("$reexport($list, $id);" as Stmt,
            reexport: Expr = TURBOPACK_ESM_REEXPORT.into(),
            list: Expr = list,
            id: Expr = module_id_to_lit(&id)
        )
    } else {
        quote!("$reexport($list);" as Stmt,
            reexport: Expr = TURBOPACK_ESM_REEXPORT.into(),
            list: Expr = list
        )
    };

    // Emitted as a normal hoisted statement so it lands after the imports that are kept -- the
    // namespace variables it reads must already exist, and any import that was *not* subsumed must
    // still run first.
    Ok((
        CodeGeneration::hoisted_stmt(rcstr!("__turbopack_esm_reexport__"), stmt),
        subsumed,
    ))
}

/// One source module's contribution to a compact re-export registration: the module the exports
/// come from, and the `exported name -> name on that module` pairs taken from it.
struct ReexportGroup {
    /// Lowest binding-reference index among this group's exports. Binding references retain their
    /// relative declaration order even though evaluation references occupy a separate index range.
    order: usize,
    /// The variable an already-generated import bound to this module's namespace.
    namespace_ident: String,
    ctxt: Option<SyntaxContext>,
    /// The module itself, used when the head is emitted as a module id.
    asset: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    /// Whether any reference to this module also binds a name the module's own code uses.
    locally_bound: bool,
    /// Source spans of the re-export declarations whose evaluation references are subsumed.
    reference_spans: FxHashSet<Span>,
    pairs: Vec<(RcStr, RcStr)>,
}

/// Identifies the namespace variable a group reads from. The syntax context is part of the key
/// because two merged modules can import the same target under the same generated name in
/// different hygiene contexts, which the import code generation also keys on -- merging those into
/// one group would read the wrong variable and suppress both declarations.
pub(crate) type NamespaceKey = (String, Option<SyntaxContext>);

type SyntheticReexportReferences<'a> = (
    &'a [ResolvedVc<EcmascriptModulePartReference>],
    &'a [ResolvedVc<EsmAssetReference>],
);

struct CompactRegistrationSafety {
    mode: ExportRegistrationMode,
    is_circuit_breaker: bool,
    is_async_module: bool,
}

fn compact_registration_is_safe(options: CompactRegistrationSafety) -> bool {
    matches!(
        options.mode,
        ExportRegistrationMode::Mixed | ExportRegistrationMode::Reexport
    ) && !options.is_circuit_breaker
        && !options.is_async_module
}

/// Imports performed by one compact registration. Binding references are identified by namespace;
/// evaluation references also need their source span so an earlier independent `import './x'` of
/// the same module is retained rather than being suppressed with a later re-export declaration.
#[derive(Default)]
pub(crate) struct SubsumedImports {
    pub namespaces: FxHashSet<NamespaceKey>,
    pub evaluation_spans: FxHashSet<Span>,
}

/// A compact registration, ready to emit.
struct CompactReexports {
    groups: Vec<ReexportGroup>,
    /// Whether the group heads are module ids (the registration performs the imports itself) or
    /// namespace objects (the imports stay where they are).
    subsume_imports: bool,
}

impl EsmExports {
    pub(crate) async fn code_generation(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
        eval_context: &EvalContext,
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        export_registration_mode: ExportRegistrationMode,
        synthetic_references: Option<SyntheticReexportReferences<'_>>,
        is_async_module: bool,
    ) -> Result<(CodeGeneration, SubsumedImports)> {
        let unused_references = chunking_context.unused_references().await?;
        let export_usage_info = chunking_context
            .module_export_usage(*ResolvedVc::upcast(module))
            .await?;
        let expanded = self.expand_exports(*export_usage_info.export_usage).await?;

        if scope_hoisting_context.skip_module_exports() && expanded.dynamic_exports.is_empty() {
            // If the current module is not exposed, no need to generate exports.
            //
            // If there are dynamic_exports, we still need to export everything because it wasn't
            // possible to determine statically where a reexport is coming from which will instead
            // be handled at runtime via property access, e.g. `export * from "./some-dynamic-cjs"`
            return Ok((CodeGeneration::empty(), Default::default()));
        }

        let mut dynamic_exports = Vec::<Box<Expr>>::new();
        {
            let id = if let Some(module) = scope_hoisting_context.module()
                && !expanded.dynamic_exports.is_empty()
            {
                Some(module.chunk_item_id(chunking_context).await?)
            } else {
                None
            };

            for dynamic_export_asset in &expanded.dynamic_exports {
                let ident = ReferencedAsset::get_ident_from_placeable(
                    dynamic_export_asset,
                    chunking_context,
                )
                .await?;

                if let Some(id) = &id {
                    dynamic_exports.push(quote_expr!(
                        "$turbopack_dynamic($arg, $id)",
                        turbopack_dynamic: Expr = TURBOPACK_DYNAMIC.into(),
                        arg: Expr = Ident::new(ident.into(), DUMMY_SP, Default::default()).into(),
                        id: Expr = module_id_to_lit(id)
                    ));
                } else {
                    dynamic_exports.push(quote_expr!(
                        "$turbopack_dynamic($arg)",
                        turbopack_dynamic: Expr = TURBOPACK_DYNAMIC.into(),
                        arg: Expr = Ident::new(ident.into(), DUMMY_SP, Default::default()).into()
                    ));
                }
            }
        }

        #[derive(Eq, PartialEq)]
        enum ExportBinding {
            Getter(Expr),
            GetterSetter(Expr, Expr),
            Value(Expr),
            None,
        }

        let mut getters = Vec::new();
        // The keys this module's exports are emitted under. Consumers resolve the same map for this
        // module (see `ReferencedAsset::get_ident_inner`), so both sides always agree.
        let mangled_names = mangled_export_names(*module, chunking_context).await?;

        // A module whose exports are *only* forwarded from other modules can register them all in
        // one compact call instead of one arrow function per binding. `export_registration_mode`
        // decided during analysis whether that is possible without reordering evaluation. Async
        // modules may yield a promise from `i()`. A known circuit breaker must expose its getters
        // before importing the other side of the cycle, and a module without analysis must do the
        // same conservatively, so all three stay on the general registration.
        let compact = if compact_registration_is_safe(CompactRegistrationSafety {
            mode: export_registration_mode,
            is_circuit_breaker: export_usage_info.is_circuit_breaker,
            is_async_module,
        }) && expanded.dynamic_exports.is_empty()
            && !expanded.exports.is_empty()
        {
            build_compact_reexports(
                &expanded.exports,
                mangled_names.as_ref(),
                eval_context,
                export_registration_mode,
                synthetic_references,
                chunking_context,
                scope_hoisting_context,
            )
            .await?
        } else {
            None
        };

        if let Some(compact) = compact {
            return emit_compact_reexports(compact, chunking_context, scope_hoisting_context).await;
        }

        for (exported, local) in &expanded.exports {
            if let EsmExport::ImportedBinding(reference, ..)
            | EsmExport::ImportedNamespace(reference) = local
                && unused_references.contains_key(reference)
            {
                continue;
            }
            let exprs: ExportBinding = match local {
                EsmExport::Error => ExportBinding::Getter(quote!(
                    "(() => { throw new Error(\"Failed binding. See build errors!\"); })" as Expr,
                )),
                EsmExport::LocalBinding(LocalBinding { name, liveness, .. }) => {
                    // TODO ideally, this information would just be stored in
                    // EsmExport::LocalBinding and we wouldn't have to re-correlated this
                    // information with eval_context.imports.exports to get the syntax context.
                    let binding = if let Some((local, ctxt)) = eval_context
                        .imports
                        .exports_ids
                        .get(exported)
                        .map(|(id, _)| id)
                    {
                        Some((local.clone(), *ctxt))
                    } else {
                        bail!(
                            "Expected export to be in eval context {:?} {:?}",
                            exported,
                            eval_context.imports,
                        )
                    };
                    let (local, ctxt) = binding.unwrap_or_else(|| {
                        // Fallback, shouldn't happen in practice
                        (
                            if name == "default" {
                                MAGIC_IDENTIFIER_DEFAULT_EXPORT_ATOM.clone()
                            } else {
                                name.as_str().into()
                            },
                            SyntaxContext::empty(),
                        )
                    });

                    let local = Ident::new(local, DUMMY_SP, ctxt);
                    match (liveness, export_usage_info.is_circuit_breaker) {
                        (Liveness::Constant, false) => ExportBinding::Value(Expr::Ident(local)),
                        // If the value might change or we are a circuit breaker we must bind a
                        // getter to avoid capturing the value at the wrong time.
                        (Liveness::Live, _) | (Liveness::Constant, true) => {
                            ExportBinding::Getter(quote!("() => $local" as Expr, local = local))
                        }
                        (Liveness::Mutable, _) => ExportBinding::GetterSetter(
                            quote!("() => $local" as Expr, local = local.clone()),
                            quote!(
                                "($new) => $local = $new" as Expr,
                                local: AssignTarget = AssignTarget::Simple(local.into()),
                                new = Ident::new(format!("new_{name}").into(), DUMMY_SP, ctxt),
                            ),
                        ),
                    }
                }
                EsmExport::ImportedBinding(esm_ref, name, mutable) => {
                    let referenced_asset =
                        ReferencedAsset::from_resolve_result(esm_ref.resolve_reference()).await?;
                    referenced_asset
                        .get_ident(chunking_context, Some(name.clone()), scope_hoisting_context)
                        .await?
                        .map(|ident| {
                            let expr = ident.as_expr_individual(DUMMY_SP);
                            let read_expr = expr.map_either(Expr::from, Expr::from).into_inner();
                            use crate::references::esm::base::ReferencedAssetIdent;
                            match &ident {
                                ReferencedAssetIdent::LocalBinding {ctxt, liveness,.. } => {
                                    debug_assert!(*mutable == (*liveness == Liveness::Mutable), "If the re-export is mutable, the merged local must be too");
                                    // If we are re-exporting something but got merged with it we can treat it like a local export
                                     match (liveness, export_usage_info.is_circuit_breaker) {
                                        (Liveness::Constant, false) => {
                                            ExportBinding::Value(read_expr)
                                        }
                                        // If the value might change or we are a circuit breaker we must bind a
                                        // getter to avoid capturing the value at the wrong time.
                                        (Liveness::Live, _) | (Liveness::Constant, true) => {
                                            // In the constant case, we could still export as a value if we knew that the module
                                            // came _before_ us, but we don't at this point.
                                            ExportBinding::Getter(quote!("() => $local" as Expr, local: Expr = read_expr))
                                        }
                                        (Liveness::Mutable, _) => {
                                            let assign_target = AssignTarget::Simple(
                                                        ident.as_expr_individual(DUMMY_SP).map_either(|i| SimpleAssignTarget::Ident(i.into()), SimpleAssignTarget::Member).into_inner());
                                            ExportBinding::GetterSetter(
                                                quote!("() => $local" as Expr, local: Expr= read_expr.clone()),
                                                quote!(
                                                    "($new) => $lhs = $new" as Expr,
                                                    lhs: AssignTarget = assign_target,
                                                    new = Ident::new(format!("new_{name}").into(), DUMMY_SP, *ctxt),
                                                )
                                            )
                                        }
                                    }
                                },
                                ReferencedAssetIdent::Module { .. } => {
                                    // Otherwise we need to bind as a getter to preserve the 'liveness' of the other modules bindings.
                                    // TODO: If this becomes important it might be faster to use the runtime to copy PropertyDescriptors across modules
                                    // since that would reduce allocations and optimize access. We could do this by passing the module-id up.
                                    let getter = quote!("() => $expr" as Expr, expr: Expr = read_expr);
                                    let assign_target = AssignTarget::Simple(
                                                    ident.as_expr_individual(DUMMY_SP).map_either(|i| SimpleAssignTarget::Ident(i.into()), SimpleAssignTarget::Member).into_inner());
                                    if *mutable {
                                        ExportBinding::GetterSetter(
                                            getter,
                                            quote!(
                                                "($new) => $lhs = $new" as Expr,
                                                lhs: AssignTarget = assign_target,
                                                new = Ident::new(
                                                    format!("new_{name}").into(),
                                                    DUMMY_SP,
                                                    Default::default()
                                                ),
                                            ))
                                    } else {
                                        ExportBinding::Getter(getter)
                                    }
                                }
                            }
                        }).unwrap_or(ExportBinding::None)
                }
                EsmExport::ImportedNamespace(esm_ref) => {
                    let referenced_asset =
                        ReferencedAsset::from_resolve_result(esm_ref.resolve_reference()).await?;
                    referenced_asset
                        .get_ident(chunking_context, None, scope_hoisting_context)
                        .await?
                        .map(|ident| {
                            let imported = ident.as_expr(DUMMY_SP, false);
                            if export_usage_info.is_circuit_breaker {
                                ExportBinding::Getter(quote!(
                                    "(() => $imported)" as Expr,
                                    imported: Expr = imported
                                ))
                            } else {
                                ExportBinding::Value(imported)
                            }
                        })
                        .unwrap_or(ExportBinding::None)
                }
            };
            if exprs != ExportBinding::None {
                getters.push(Some(
                    Expr::Lit(Lit::Str(Str {
                        span: DUMMY_SP,
                        // The key this export is emitted under: the mangled one when this module's
                        // names are shortened, otherwise the original.
                        value: mangled_names
                            .as_ref()
                            .and_then(|names| names.get(exported))
                            .unwrap_or(exported)
                            .as_str()
                            .into(),
                        raw: None,
                    }))
                    .into(),
                ));
                match exprs {
                    ExportBinding::Getter(getter) => {
                        getters.push(Some(getter.into()));
                    }
                    ExportBinding::GetterSetter(getter, setter) => {
                        getters.push(Some(getter.into()));
                        getters.push(Some(setter.into()));
                    }
                    ExportBinding::Value(value) => {
                        // We need to push a discriminator in this case to make the fact that we are
                        // binding a value unambiguous to the runtime.
                        getters.push(Some(Expr::Lit(Lit::Num(Number::from(0))).into()));
                        getters.push(Some(value.into()));
                    }
                    ExportBinding::None => {}
                };
            }
        }
        let getters = Expr::Array(ArrayLit {
            span: DUMMY_SP,
            elems: getters,
        });
        let dynamic_stmt = if !dynamic_exports.is_empty() {
            vec![CodeGenerationHoistedStmt::new(
                rcstr!("__turbopack_dynamic__"),
                Stmt::Expr(ExprStmt {
                    span: DUMMY_SP,
                    expr: Expr::from_exprs(dynamic_exports),
                }),
            )]
        } else {
            vec![]
        };

        // When a module has dynamic re-exports (`export *` from a module whose
        // exports are only known at runtime), its namespace object must stay
        // extensible so the dynamic export proxy can surface those keys. Signal
        // that to the runtime so it skips sealing the namespace.
        let has_dynamic_exports = !expanded.dynamic_exports.is_empty();
        let esm_exports = vec![CodeGenerationHoistedStmt::new(
            rcstr!("__turbopack_esm__"),
            if let Some(module) = scope_hoisting_context.module() {
                let id = module.chunk_item_id(chunking_context).await?;
                if has_dynamic_exports {
                    quote!("$turbopack_esm($getters, $id, true);" as Stmt,
                        turbopack_esm: Expr = TURBOPACK_ESM.into(),
                        getters: Expr = getters,
                        id: Expr = module_id_to_lit(&id)
                    )
                } else {
                    quote!("$turbopack_esm($getters, $id);" as Stmt,
                        turbopack_esm: Expr = TURBOPACK_ESM.into(),
                        getters: Expr = getters,
                        id: Expr = module_id_to_lit(&id)
                    )
                }
            } else if has_dynamic_exports {
                quote!("$turbopack_esm($getters, undefined, true);" as Stmt,
                    turbopack_esm: Expr = TURBOPACK_ESM.into(),
                    getters: Expr = getters
                )
            } else {
                quote!("$turbopack_esm($getters);" as Stmt,
                    turbopack_esm: Expr = TURBOPACK_ESM.into(),
                    getters: Expr = getters
                )
            },
        )];
        // If we are a circuit breaker module we need to expose exports first so they are available
        // to a cyclic importer otherwise we put them at the bottom of the module factory.
        Ok(if export_usage_info.is_circuit_breaker {
            (
                CodeGeneration::new(vec![], dynamic_stmt, esm_exports, vec![], vec![]),
                Default::default(),
            )
        } else {
            (
                CodeGeneration::new(vec![], vec![], vec![], dynamic_stmt, esm_exports),
                Default::default(),
            )
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{CompactRegistrationSafety, ExportRegistrationMode, compact_registration_is_safe};

    #[test]
    fn compact_registration_rejects_async_modules_and_cycle_breakers() {
        assert!(compact_registration_is_safe(CompactRegistrationSafety {
            mode: ExportRegistrationMode::Reexport,
            is_circuit_breaker: false,
            is_async_module: false,
        }));
        assert!(!compact_registration_is_safe(CompactRegistrationSafety {
            mode: ExportRegistrationMode::Reexport,
            is_circuit_breaker: false,
            is_async_module: true,
        }));
        // A known cycle breaker and the conservative unknown-analysis fallback both set this flag.
        assert!(!compact_registration_is_safe(CompactRegistrationSafety {
            mode: ExportRegistrationMode::Reexport,
            is_circuit_breaker: true,
            is_async_module: false,
        }));
        assert!(!compact_registration_is_safe(CompactRegistrationSafety {
            mode: ExportRegistrationMode::Normal,
            is_circuit_breaker: false,
            is_async_module: false,
        }));
    }
}
