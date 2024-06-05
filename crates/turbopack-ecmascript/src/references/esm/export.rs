use std::{
    collections::{BTreeMap, HashSet},
    ops::ControlFlow,
};

use anyhow::Result;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        self, ComputedPropName, Expr, ExprStmt, Ident, KeyValueProp, Lit, MemberExpr, MemberProp,
        ModuleItem, ObjectLit, Program, Prop, PropName, PropOrSpread, Script, Stmt, Str,
    },
    quote, quote_expr,
};
use turbo_tasks::{trace::TraceRawVcs, RcStr, TryFlatJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::glob::Glob;
use turbopack_core::{
    chunk::ChunkingContext,
    ident::AssetIdent,
    issue::{analyze::AnalyzeIssue, IssueExt, IssueSeverity, StyledString},
    module::Module,
    reference::ModuleReference,
};

use super::base::ReferencedAsset;
use crate::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
    references::esm::base::insert_hoisted_stmt,
};

#[derive(Clone, Hash, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs)]
pub enum EsmExport {
    /// A local binding that is exported (export { a } or export const a = 1)
    ///
    /// The last bool is true if the binding is a mutable binding
    LocalBinding(RcStr, bool),
    /// An imported binding that is exported (export { a as b } from "...")
    ///
    /// The last bool is true if the binding is a mutable binding
    ImportedBinding(Vc<Box<dyn ModuleReference>>, RcStr, bool),
    /// An imported namespace that is exported (export * from "...")
    ImportedNamespace(Vc<Box<dyn ModuleReference>>),
    /// An error occurred while resolving the export
    Error,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs)]
pub enum FoundExportType {
    Found,
    Dynamic,
    NotFound,
    SideEffects,
    Unknown,
}

#[turbo_tasks::value]
pub struct FollowExportsResult {
    pub module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    pub export_name: Option<RcStr>,
    pub ty: FoundExportType,
}

#[turbo_tasks::function]
pub async fn follow_reexports(
    module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    export_name: RcStr,
    side_effect_free_packages: Vc<Glob>,
) -> Result<Vc<FollowExportsResult>> {
    if !*module
        .is_marked_as_side_effect_free(side_effect_free_packages)
        .await?
    {
        return Ok(FollowExportsResult::cell(FollowExportsResult {
            module,
            export_name: Some(export_name),
            ty: FoundExportType::SideEffects,
        }));
    }
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

        // Try to find the export in the local exports
        let exports_ref = exports.await?;
        if let Some(export) = exports_ref.exports.get(&export_name) {
            match handle_declared_export(module, export_name, export, side_effect_free_packages)
                .await?
            {
                ControlFlow::Continue((m, n)) => {
                    module = m;
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
            let result = get_all_export_names(module).await?;
            if let Some(m) = result.esm_exports.get(&export_name) {
                module = *m;
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
    module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    export_name: RcStr,
    export: &EsmExport,
    side_effect_free_packages: Vc<Glob>,
) -> Result<ControlFlow<FollowExportsResult, (Vc<Box<dyn EcmascriptChunkPlaceable>>, RcStr)>> {
    match export {
        EsmExport::ImportedBinding(reference, name, _) => {
            if let ReferencedAsset::Some(module) =
                *ReferencedAsset::from_resolve_result(reference.resolve_reference()).await?
            {
                if !*module
                    .is_marked_as_side_effect_free(side_effect_free_packages)
                    .await?
                {
                    return Ok(ControlFlow::Break(FollowExportsResult {
                        module,
                        export_name: Some(name.clone()),
                        ty: FoundExportType::SideEffects,
                    }));
                }
                return Ok(ControlFlow::Continue((module, name.clone())));
            }
        }
        EsmExport::ImportedNamespace(reference) => {
            if let ReferencedAsset::Some(m) =
                *ReferencedAsset::from_resolve_result(reference.resolve_reference()).await?
            {
                return Ok(ControlFlow::Break(FollowExportsResult {
                    module: m,
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
struct AllExportNamesResult {
    esm_exports: IndexMap<RcStr, Vc<Box<dyn EcmascriptChunkPlaceable>>>,
    dynamic_exporting_modules: Vec<Vc<Box<dyn EcmascriptChunkPlaceable>>>,
}

#[turbo_tasks::function]
async fn get_all_export_names(
    module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
) -> Result<Vc<AllExportNamesResult>> {
    let exports = module.get_exports().await?;
    let EcmascriptExports::EsmExports(exports) = &*exports else {
        return Ok(AllExportNamesResult {
            esm_exports: IndexMap::new(),
            dynamic_exporting_modules: vec![module],
        }
        .cell());
    };

    let exports = exports.await?;
    let mut esm_exports = IndexMap::new();
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
                    Some(get_all_export_names(m))
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
    pub star_exports: Vec<RcStr>,
    pub has_dynamic_exports: bool,
}

#[turbo_tasks::function]
pub async fn expand_star_exports(
    root_module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
) -> Result<Vc<ExpandStarResult>> {
    let mut set = HashSet::new();
    let mut has_dynamic_exports = false;
    let mut checked_modules = HashSet::new();
    checked_modules.insert(root_module);
    let mut queue = vec![(root_module, root_module.get_exports())];
    while let Some((asset, exports)) = queue.pop() {
        match &*exports.await? {
            EcmascriptExports::EsmExports(exports) => {
                let exports = exports.await?;
                set.extend(exports.exports.keys().filter(|n| *n != "default").cloned());
                for esm_ref in exports.star_exports.iter() {
                    if let ReferencedAsset::Some(asset) =
                        &*ReferencedAsset::from_resolve_result(esm_ref.resolve_reference()).await?
                    {
                        if checked_modules.insert(*asset) {
                            queue.push((*asset, asset.get_exports()));
                        }
                    }
                }
            }
            EcmascriptExports::None => emit_star_exports_issue(
                asset.ident(),
                format!(
                    "export * used with module {} which has no exports\nTypescript only: Did you \
                     want to export only types with `export type * from \"...\"`?\nNote: Using \
                     `export type` is more efficient than `export *` as it won't emit any runtime \
                     code.",
                    asset.ident().to_string().await?
                )
                .into(),
            ),
            EcmascriptExports::Value => emit_star_exports_issue(
                asset.ident(),
                format!(
                    "export * used with module {} which only has a default export (default export \
                     is not exported with export *)\nDid you want to use `export {{ default }} \
                     from \"...\";` instead?",
                    asset.ident().to_string().await?
                )
                .into(),
            ),
            EcmascriptExports::CommonJs => {
                has_dynamic_exports = true;
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
                );
            }
            EcmascriptExports::DynamicNamespace => {
                has_dynamic_exports = true;
            }
        }
    }

    Ok(ExpandStarResult {
        star_exports: set.into_iter().collect(),
        has_dynamic_exports,
    }
    .cell())
}

fn emit_star_exports_issue(source_ident: Vc<AssetIdent>, message: RcStr) {
    AnalyzeIssue {
        code: None,
        message: StyledString::Text(message).cell(),
        source_ident,
        severity: IssueSeverity::Warning.into(),
        source: None,
        title: Vc::cell("unexpected export *".into()),
    }
    .cell()
    .emit();
}

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug)]
pub struct EsmExports {
    pub exports: BTreeMap<RcStr, EsmExport>,
    pub star_exports: Vec<Vc<Box<dyn ModuleReference>>>,
}

/// The expanded version of [EsmExports], the `exports` field here includes all
/// exports that could be expanded from `star_exports`.
///
/// `star_exports` that could not be (fully) expanded end up in
/// `dynamic_exports`.
#[turbo_tasks::value(shared)]
#[derive(Hash, Debug)]
pub struct ExpandedExports {
    pub exports: BTreeMap<RcStr, EsmExport>,
    /// Modules we couldn't analyse all exports of.
    pub dynamic_exports: Vec<Vc<Box<dyn EcmascriptChunkPlaceable>>>,
}

#[turbo_tasks::value_impl]
impl EsmExports {
    #[turbo_tasks::function]
    pub async fn expand_exports(&self) -> Result<Vc<ExpandedExports>> {
        let mut exports: BTreeMap<RcStr, EsmExport> = self.exports.clone();
        let mut dynamic_exports = vec![];

        for esm_ref in self.star_exports.iter() {
            // TODO(PACK-2176): we probably need to handle re-exporting from external
            // modules.
            let ReferencedAsset::Some(asset) =
                &*ReferencedAsset::from_resolve_result(esm_ref.resolve_reference()).await?
            else {
                continue;
            };

            let export_info = expand_star_exports(*asset).await?;

            for export in &export_info.star_exports {
                if !exports.contains_key(export) {
                    exports.insert(
                        export.clone(),
                        EsmExport::ImportedBinding(Vc::upcast(*esm_ref), export.clone(), false),
                    );
                }
            }

            if export_info.has_dynamic_exports {
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

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmExports {
    #[turbo_tasks::function]
    async fn code_generation(
        self: Vc<Self>,
        _context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let mut visitors = Vec::new();

        let expanded = self.expand_exports().await?;

        let mut dynamic_exports = Vec::<Box<Expr>>::new();
        for dynamic_export_asset in &expanded.dynamic_exports {
            let ident = ReferencedAsset::get_ident_from_placeable(dynamic_export_asset).await?;

            dynamic_exports.push(quote_expr!(
                "__turbopack_dynamic__($arg)",
                arg: Expr = Ident::new(ident.into(), DUMMY_SP).into()
            ));
        }

        let mut props = Vec::new();
        for (exported, local) in &expanded.exports {
            let expr = match local {
                EsmExport::Error => Some(quote!(
                    "(() => { throw new Error(\"Failed binding. See build errors!\"); })" as Expr,
                )),
                EsmExport::LocalBinding(name, mutable) => {
                    if *mutable {
                        Some(quote!(
                            "([() => $local, (v) => $local = v])" as Expr,
                            local = Ident::new((name as &str).into(), DUMMY_SP)
                        ))
                    } else {
                        Some(quote!(
                            "(() => $local)" as Expr,
                            local = Ident::new((name as &str).into(), DUMMY_SP)
                        ))
                    }
                }
                EsmExport::ImportedBinding(esm_ref, name, mutable) => {
                    let referenced_asset =
                        ReferencedAsset::from_resolve_result(esm_ref.resolve_reference()).await?;
                    referenced_asset.get_ident().await?.map(|ident| {
                        let expr = Expr::Member(MemberExpr {
                            span: DUMMY_SP,
                            obj: Box::new(Expr::Ident(Ident::new(ident.into(), DUMMY_SP))),
                            prop: MemberProp::Computed(ComputedPropName {
                                span: DUMMY_SP,
                                expr: Box::new(Expr::Lit(Lit::Str(Str {
                                    span: DUMMY_SP,
                                    value: (name as &str).into(),
                                    raw: None,
                                }))),
                            }),
                        });
                        if *mutable {
                            quote!(
                                "([() => $expr, (v) => $expr = v])" as Expr,
                                expr: Expr = expr,
                            )
                        } else {
                            quote!(
                                "(() => $expr)" as Expr,
                                expr: Expr = expr,
                            )
                        }
                    })
                }
                EsmExport::ImportedNamespace(esm_ref) => {
                    let referenced_asset =
                        ReferencedAsset::from_resolve_result(esm_ref.resolve_reference()).await?;
                    referenced_asset.get_ident().await?.map(|ident| {
                        quote!(
                            "(() => $imported)" as Expr,
                            imported = Ident::new(ident.into(), DUMMY_SP)
                        )
                    })
                }
            };
            if let Some(expr) = expr {
                props.push(PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                    key: PropName::Str(Str {
                        span: DUMMY_SP,
                        value: exported.as_str().into(),
                        raw: None,
                    }),
                    value: Box::new(expr),
                }))));
            }
        }
        let getters = Expr::Object(ObjectLit {
            span: DUMMY_SP,
            props,
        });
        let dynamic_stmt = if !dynamic_exports.is_empty() {
            Some(Stmt::Expr(ExprStmt {
                span: DUMMY_SP,
                expr: Expr::from_exprs(dynamic_exports),
            }))
        } else {
            None
        };

        visitors.push(create_visitor!(visit_mut_program(program: &mut Program) {
            let stmt = quote!("__turbopack_esm__($getters);" as Stmt,
                getters: Expr = getters.clone()
            );
            match program {
                Program::Module(ast::Module { body, .. }) => {
                    body.insert(0, ModuleItem::Stmt(stmt));
                }
                Program::Script(Script { body, .. }) => {
                    body.insert(0, stmt);
                }
            }
            if let Some(dynamic_stmt) = dynamic_stmt.clone() {
                insert_hoisted_stmt(program, dynamic_stmt);
            }
        }));

        Ok(CodeGeneration { visitors }.into())
    }
}
