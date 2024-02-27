use std::{
    collections::{BTreeMap, HashSet},
    ops::ControlFlow,
};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        self, ComputedPropName, Expr, ExprStmt, Ident, KeyValueProp, Lit, MemberExpr, MemberProp,
        ModuleItem, ObjectLit, Program, Prop, PropName, PropOrSpread, Script, Stmt, Str,
    },
    quote, quote_expr,
};
use turbo_tasks::{trace::TraceRawVcs, ValueToString, Vc};
use turbopack_core::{
    ident::AssetIdent,
    issue::{analyze::AnalyzeIssue, IssueExt, IssueSeverity, StyledString},
    module::Module,
    reference::ModuleReference,
};

use super::base::ReferencedAsset;
use crate::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptChunkingContext, EcmascriptExports},
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
    references::esm::base::insert_hoisted_stmt,
};

#[derive(Clone, Hash, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs)]
pub enum EsmExport {
    /// A local binding that is exported (export { a } or export const a = 1)
    LocalBinding(String),
    /// An imported binding that is exported (export { a as b } from "...")
    ImportedBinding(Vc<Box<dyn ModuleReference>>, String),
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
    pub export_name: Option<String>,
    pub ty: FoundExportType,
}

#[turbo_tasks::function]
pub fn follow_reexports(
    module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    export_name: String,
) -> Vc<FollowExportsResult> {
    follow_reexports_internal(module, export_name, true)
}

#[turbo_tasks::function]
pub async fn follow_reexports_internal(
    mut module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    mut export_name: String,
    stop_on_side_effects: bool,
) -> Result<Vc<FollowExportsResult>> {
    if stop_on_side_effects && !*module.is_marked_as_side_effect_free().await? {
        return Ok(FollowExportsResult::cell(FollowExportsResult {
            module,
            export_name: Some(export_name),
            ty: FoundExportType::SideEffects,
        }));
    }
    loop {
        let exports = module.get_exports().await?;
        let EcmascriptExports::EsmExports(exports) = &*exports else {
            return Ok(FollowExportsResult::cell(FollowExportsResult {
                module,
                export_name: Some(export_name),
                ty: FoundExportType::Dynamic,
            }));
        };

        let exports = exports.await?;

        // Try to find the export in the local exports
        if let Some(export) = exports.exports.get(&export_name) {
            match handle_declared_export(module, export_name, export, stop_on_side_effects).await? {
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
        if export_name != "default" {
            return handle_star_reexports(
                module,
                export_name,
                &exports.star_exports,
                stop_on_side_effects,
            )
            .await;
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
    export_name: String,
    export: &EsmExport,
    stop_on_side_effects: bool,
) -> Result<ControlFlow<FollowExportsResult, (Vc<Box<dyn EcmascriptChunkPlaceable>>, String)>> {
    match export {
        EsmExport::ImportedBinding(reference, name) => {
            if let ReferencedAsset::Some(module) =
                *ReferencedAsset::from_resolve_result(reference.resolve_reference()).await?
            {
                if stop_on_side_effects && !*module.is_marked_as_side_effect_free().await? {
                    return Ok(ControlFlow::Break(FollowExportsResult {
                        module,
                        export_name: Some(name.to_string()),
                        ty: FoundExportType::SideEffects,
                    }));
                }
                return Ok(ControlFlow::Continue((module, name.to_string())));
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
        EsmExport::LocalBinding(_) => {
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

async fn handle_star_reexports(
    module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    export_name: String,
    star_exports: &[Vc<Box<dyn ModuleReference>>],
    stop_on_side_effects: bool,
) -> Result<Vc<FollowExportsResult>> {
    let mut potential_modules = Vec::new();
    for star_export in star_exports {
        if let ReferencedAsset::Some(m) =
            *ReferencedAsset::from_resolve_result(star_export.resolve_reference()).await?
        {
            let result = follow_reexports_internal(m, export_name.clone(), false);
            let result_ref = result.await?;
            match result_ref.ty {
                FoundExportType::Found => {
                    if stop_on_side_effects {
                        return Ok(follow_reexports(m, export_name.clone()));
                    } else {
                        return Ok(result);
                    }
                }
                FoundExportType::SideEffects => {
                    unreachable!();
                }
                FoundExportType::Dynamic => {
                    potential_modules.push(result);
                }
                FoundExportType::NotFound => {}
                FoundExportType::Unknown => {
                    return Ok(FollowExportsResult::cell(FollowExportsResult {
                        module,
                        export_name: Some(export_name),
                        ty: FoundExportType::Unknown,
                    }));
                }
            }
        } else {
            return Ok(FollowExportsResult::cell(FollowExportsResult {
                module,
                export_name: Some(export_name),
                ty: FoundExportType::Unknown,
            }));
        }
    }
    match potential_modules.len() {
        0 => Ok(FollowExportsResult::cell(FollowExportsResult {
            module,
            export_name: Some(export_name),
            ty: FoundExportType::NotFound,
        })),
        1 => Ok(potential_modules.into_iter().next().unwrap()),
        _ => Ok(FollowExportsResult::cell(FollowExportsResult {
            module,
            export_name: Some(export_name),
            ty: FoundExportType::Dynamic,
        })),
    }
}

#[turbo_tasks::value]
pub struct ExpandStarResult {
    pub star_exports: Vec<String>,
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
                ),
            ),
            EcmascriptExports::Value => emit_star_exports_issue(
                asset.ident(),
                format!(
                    "export * used with module {} which only has a default export (default export \
                     is not exported with export *)\nDid you want to use `export {{ default }} \
                     from \"...\";` instead?",
                    asset.ident().to_string().await?
                ),
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
                    ),
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

fn emit_star_exports_issue(source_ident: Vc<AssetIdent>, message: String) {
    AnalyzeIssue {
        code: None,
        message: StyledString::Text(message).cell(),
        source_ident,
        severity: IssueSeverity::Warning.into(),
        source: None,
        title: Vc::cell("unexpected export *".to_string()),
    }
    .cell()
    .emit();
}

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug)]
pub struct EsmExports {
    pub exports: BTreeMap<String, EsmExport>,
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
    pub exports: BTreeMap<String, EsmExport>,
    /// Modules we couldn't analyse all exports of.
    pub dynamic_exports: Vec<Vc<Box<dyn EcmascriptChunkPlaceable>>>,
}

#[turbo_tasks::value_impl]
impl EsmExports {
    #[turbo_tasks::function]
    pub async fn expand_exports(&self) -> Result<Vc<ExpandedExports>> {
        let mut exports: BTreeMap<String, EsmExport> = self.exports.clone();
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
                        EsmExport::ImportedBinding(Vc::upcast(*esm_ref), export.to_string()),
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
        _context: Vc<Box<dyn EcmascriptChunkingContext>>,
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
                EsmExport::LocalBinding(name) => Some(quote!(
                    "(() => $local)" as Expr,
                    local = Ident::new((name as &str).into(), DUMMY_SP)
                )),
                EsmExport::ImportedBinding(esm_ref, name) => {
                    let referenced_asset =
                        ReferencedAsset::from_resolve_result(esm_ref.resolve_reference()).await?;
                    referenced_asset.get_ident().await?.map(|ident| {
                        quote!(
                            "(() => $expr)" as Expr,
                            expr: Expr = Expr::Member(MemberExpr {
                                span: DUMMY_SP,
                                obj: Box::new(Expr::Ident(Ident::new(ident.into(), DUMMY_SP))),
                                prop: MemberProp::Computed(ComputedPropName {
                                    span: DUMMY_SP,
                                    expr: Box::new(Expr::Lit(Lit::Str(Str {
                                        span: DUMMY_SP,
                                        value: (name as &str).into(),
                                        raw: None,
                                    })))
                                })
                            })
                        )
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
                        value: exported.clone().into(),
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
