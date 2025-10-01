use std::{borrow::Cow, collections::BTreeMap, ops::ControlFlow};

use anyhow::{Result, bail};
use rustc_hash::FxHashSet;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::{DUMMY_SP, SyntaxContext},
    ecma::ast::{
        ArrayLit, AssignTarget, Expr, ExprStmt, Ident, Lit, Number, SimpleAssignTarget, Stmt, Str,
    },
    quote, quote_expr,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ResolvedVc, TryFlatJoinIterExt, ValueToString, Vc,
    trace::TraceRawVcs,
};
use turbo_tasks_fs::glob::Glob;
use turbopack_core::{
    chunk::{ChunkingContext, ModuleChunkItemIdExt},
    ident::AssetIdent,
    issue::{IssueExt, IssueSeverity, StyledString, analyze::AnalyzeIssue},
    module::Module,
    module_graph::export_usage::ModuleExportUsageInfo,
    reference::ModuleReference,
    resolve::ModulePart,
};

use super::base::ReferencedAsset;
use crate::{
    EcmascriptModuleAsset, ScopeHoistingContext,
    analyzer::graph::EvalContext,
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    code_gen::{CodeGeneration, CodeGenerationHoistedStmt},
    magic_identifier,
    runtime_functions::{TURBOPACK_DYNAMIC, TURBOPACK_ESM},
    tree_shake::asset::EcmascriptModulePartAsset,
    utils::module_id_to_lit,
};

/// Models the 'liveness' of an esm export
/// All ESM exports are technically live but many never change and we can optimize representation to
/// support that, this enum tracks the actual behavior of the export binding.
#[derive(
    Copy, Clone, Hash, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue,
)]
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

#[derive(Clone, Hash, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
pub enum EsmExport {
    /// A local binding that is exported (export { a } or export const a = 1)
    ///
    /// The last bool is true if the binding is a mutable binding
    LocalBinding(RcStr, Liveness),
    /// An imported binding that is exported (export { a as b } from "...")
    ///
    /// The last bool is true if the binding is a mutable binding
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
        EcmascriptExports::CommonJs => return Ok(Vc::cell(false)),
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
            | EcmascriptExports::CommonJs
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

#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
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
    side_effect_free_packages: Vc<Glob>,
    ignore_side_effect_of_entry: bool,
) -> Result<Vc<FollowExportsResult>> {
    let mut ignore_side_effects = ignore_side_effect_of_entry;

    let mut module = module;
    let mut export_name = export_name;
    loop {
        let exports = module.get_exports().await?;
        let EcmascriptExports::EsmExports(exports) = &*exports else {
            return Ok(FollowExportsResult::cell(FollowExportsResult {
                module,
                export_name: Some(export_name),
                ty: FoundExportType::Dynamic,
            }));
        };

        if !ignore_side_effects
            && !*module
                .is_marked_as_side_effect_free(side_effect_free_packages)
                .await?
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
            if let Some(m) = result.esm_export {
                module = m;
                continue;
            }
            return match &result.dynamic_exporting_modules[..] {
                [] => Ok(FollowExportsResult {
                    module,
                    export_name: Some(export_name),
                    ty: FoundExportType::NotFound,
                }
                .cell()),
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
                *ReferencedAsset::from_resolve_result(reference.resolve_reference()).await?
            {
                return Ok(ControlFlow::Continue((*module, name.clone())));
            }
        }
        EsmExport::ImportedNamespace(reference) => {
            if let ReferencedAsset::Some(module) =
                *ReferencedAsset::from_resolve_result(reference.resolve_reference()).await?
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
struct FindExportFromReexportsResult {
    esm_export: Option<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
    dynamic_exporting_modules: Vec<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
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
        if (Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(module_part).await?).is_none() {
            return Ok(find_export_from_reexports(module_part, export_name));
        }
    }

    let all_export_names = get_all_export_names(*module).await?;
    let esm_export = all_export_names.esm_exports.get(&export_name).copied();
    Ok(FindExportFromReexportsResult {
        esm_export,
        dynamic_exporting_modules: all_export_names.dynamic_exporting_modules.clone(),
    }
    .cell())
}

#[turbo_tasks::value]
struct AllExportNamesResult {
    esm_exports: FxIndexMap<RcStr, ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
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
    esm_exports.extend(exports.exports.keys().cloned().map(|n| (n, module)));
    let star_export_names = exports
        .star_exports
        .iter()
        .map(|esm_ref| async {
            Ok(
                if let ReferencedAsset::Some(m) =
                    *ReferencedAsset::from_resolve_result(esm_ref.resolve_reference()).await?
                {
                    Some(expand_star_exports(*m))
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
                .map(|(k, &v)| (k.clone(), v)),
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
    pub esm_exports: FxIndexMap<RcStr, ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
    pub dynamic_exporting_modules: Vec<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
}

#[turbo_tasks::function]
pub async fn expand_star_exports(
    root_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
) -> Result<Vc<ExpandStarResult>> {
    let mut esm_exports = FxIndexMap::default();
    let mut dynamic_exporting_modules = Vec::new();
    let mut checked_modules = FxHashSet::default();
    checked_modules.insert(root_module);
    let mut queue = vec![(root_module, root_module.get_exports())];
    while let Some((asset, exports)) = queue.pop() {
        match &*exports.await? {
            EcmascriptExports::EsmExports(exports) => {
                let exports = exports.await?;
                for key in exports.exports.keys() {
                    if key == "default" {
                        continue;
                    }
                    esm_exports.entry(key.clone()).or_insert_with(|| asset);
                }
                for esm_ref in exports.star_exports.iter() {
                    if let ReferencedAsset::Some(asset) =
                        &*ReferencedAsset::from_resolve_result(esm_ref.resolve_reference()).await?
                        && checked_modules.insert(*asset)
                    {
                        queue.push((*asset, asset.get_exports()));
                    }
                }
            }
            EcmascriptExports::None | EcmascriptExports::EmptyCommonJs => {
                emit_star_exports_issue(
                    asset.ident(),
                    format!(
                        "export * used with module {} which has no exports\nTypescript only: Did \
                         you want to export only types with `export type * from \"...\"`?\nNote: \
                         Using `export type` is more efficient than `export *` as it won't emit \
                         any runtime code.",
                        asset.ident().to_string().await?
                    )
                    .into(),
                )
                .await?
            }
            EcmascriptExports::Value => {
                emit_star_exports_issue(
                    asset.ident(),
                    format!(
                        "export * used with module {} which only has a default export (default \
                         export is not exported with export *)\nDid you want to use `export {{ \
                         default }} from \"...\";` instead?",
                        asset.ident().to_string().await?
                    )
                    .into(),
                )
                .await?
            }
            EcmascriptExports::CommonJs => {
                dynamic_exporting_modules.push(asset);
                emit_star_exports_issue(
                    asset.ident(),
                    format!(
                        "export * used with module {} which is a CommonJS module with exports \
                         only available at runtime\nList all export names manually (`export {{ a, \
                         b, c }} from \"...\") or rewrite the module to ESM, to avoid the \
                         additional runtime code.`",
                        asset.ident().to_string().await?
                    )
                    .into(),
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
        Vc::cell(rcstr!("unexpected export *")),
        StyledString::Text(message).cell(),
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
    pub exports: BTreeMap<RcStr, EsmExport>,
    pub star_exports: Vec<ResolvedVc<Box<dyn ModuleReference>>>,
}

/// The expanded version of [`EsmExports`], the `exports` field here includes all exports that could
/// be expanded from `star_exports`.
///
/// [`EsmExports::star_exports`] that could not be (fully) expanded end up in `dynamic_exports`.
#[turbo_tasks::value(shared)]
#[derive(Hash, Debug)]
pub struct ExpandedExports {
    pub exports: BTreeMap<RcStr, EsmExport>,
    /// Modules we couldn't analyze all exports of.
    pub dynamic_exports: Vec<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
}

#[turbo_tasks::value_impl]
impl EsmExports {
    #[turbo_tasks::function]
    pub async fn expand_exports(
        &self,
        export_usage_info: Vc<ModuleExportUsageInfo>,
    ) -> Result<Vc<ExpandedExports>> {
        let mut exports: BTreeMap<RcStr, EsmExport> = self.exports.clone();
        let mut dynamic_exports = vec![];
        let export_usage_info = export_usage_info.await?;

        if !matches!(*export_usage_info, ModuleExportUsageInfo::All) {
            exports.retain(|export, _| export_usage_info.is_export_used(export));
        }

        for &esm_ref in self.star_exports.iter() {
            // TODO(PACK-2176): we probably need to handle re-exporting from external
            // modules.
            let ReferencedAsset::Some(asset) =
                &*ReferencedAsset::from_resolve_result(esm_ref.resolve_reference()).await?
            else {
                continue;
            };

            let export_info = expand_star_exports(**asset).await?;

            for export in export_info.esm_exports.keys() {
                if export == "default" {
                    continue;
                }
                if !export_usage_info.is_export_used(export) {
                    continue;
                }

                if !exports.contains_key(export) {
                    exports.insert(
                        export.clone(),
                        EsmExport::ImportedBinding(esm_ref, export.clone(), false),
                    );
                }
            }

            if !export_info.dynamic_exporting_modules.is_empty() {
                dynamic_exports.push(*asset);
            }
        }

        Ok(ExpandedExports {
            exports,
            dynamic_exports,
        }
        .cell())
    }
}

impl EsmExports {
    pub async fn code_generation(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
        eval_context: &EvalContext,
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    ) -> Result<CodeGeneration> {
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
            return Ok(CodeGeneration::empty());
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
        for (exported, local) in &expanded.exports {
            let exprs: ExportBinding = match local {
                EsmExport::Error => ExportBinding::Getter(quote!(
                    "(() => { throw new Error(\"Failed binding. See build errors!\"); })" as Expr,
                )),
                EsmExport::LocalBinding(name, liveness) => {
                    // TODO ideally, this information would just be stored in
                    // EsmExport::LocalBinding and we wouldn't have to re-correlated this
                    // information with eval_context.imports.exports to get the syntax context.
                    let binding =
                        if let Some((local, ctxt)) = eval_context.imports.exports.get(exported) {
                            Some((Cow::Borrowed(local.as_str()), *ctxt))
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
                                Cow::Owned(magic_identifier::mangle("default export"))
                            } else {
                                Cow::Borrowed(name.as_str())
                            },
                            SyntaxContext::empty(),
                        )
                    });

                    let local = Ident::new(local.into(), DUMMY_SP, ctxt);
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
                                ReferencedAssetIdent::Module { namespace_ident:_, ctxt:_, export:_ } => {
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
                        value: exported.as_str().into(),
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

        let esm_exports = vec![CodeGenerationHoistedStmt::new(
            rcstr!("__turbopack_esm__"),
            if let Some(module) = scope_hoisting_context.module() {
                let id = module.chunk_item_id(chunking_context).await?;
                quote!("$turbopack_esm($getters, $id);" as Stmt,
                    turbopack_esm: Expr = TURBOPACK_ESM.into(),
                    getters: Expr = getters,
                    id: Expr = module_id_to_lit(&id)
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
            CodeGeneration::new(vec![], dynamic_stmt, esm_exports, vec![], vec![])
        } else {
            CodeGeneration::new(vec![], vec![], vec![], dynamic_stmt, esm_exports)
        })
    }
}
