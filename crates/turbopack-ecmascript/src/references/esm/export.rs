use std::{
    borrow::Cow,
    collections::{BTreeMap, HashSet},
};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        ComputedPropName, Expr, ExprStmt, Ident, KeyValueProp, Lit, MemberExpr, MemberProp, Module,
        ModuleItem, ObjectLit, Program, Prop, PropName, PropOrSpread, Script, Stmt, Str,
    },
    quote, quote_expr,
};
use turbo_tasks::{primitives::StringVc, trace::TraceRawVcs, ValueToString};
use turbopack_core::{
    asset::Asset,
    issue::{analyze::AnalyzeIssue, IssueSeverity},
};

use super::{base::ReferencedAsset, EsmAssetReferenceVc};
use crate::{
    chunk::{
        EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptChunkingContextVc,
        EcmascriptExports,
    },
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor,
    references::esm::base::insert_hoisted_stmt,
};

#[derive(Clone, Hash, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs)]
pub enum EsmExport {
    LocalBinding(String),
    ImportedBinding(EsmAssetReferenceVc, String),
    ImportedNamespace(EsmAssetReferenceVc),
    Error,
}

#[turbo_tasks::value]
struct ExpandResults {
    star_exports: Vec<String>,
    has_cjs_exports: bool,
}

#[turbo_tasks::function]
async fn expand_star_exports(root_asset: EcmascriptChunkPlaceableVc) -> Result<ExpandResultsVc> {
    let mut set = HashSet::new();
    let mut has_cjs_exports = false;
    let mut checked_assets = HashSet::new();
    checked_assets.insert(root_asset);
    let mut queue = vec![(root_asset, root_asset.get_exports())];
    while let Some((asset, exports)) = queue.pop() {
        match &*exports.await? {
            EcmascriptExports::EsmExports(exports) => {
                let exports = exports.await?;
                set.extend(exports.exports.keys().filter(|n| *n != "default").cloned());
                for esm_ref in exports.star_exports.iter() {
                    if let ReferencedAsset::Some(asset) = &*esm_ref.get_referenced_asset().await? {
                        if checked_assets.insert(*asset) {
                            queue.push((*asset, asset.get_exports()));
                        }
                    }
                }
            }
            EcmascriptExports::None => AnalyzeIssue {
                code: None,
                category: StringVc::cell("analyze".to_string()),
                message: StringVc::cell(format!(
                    "export * used with module {} which has no exports\nTypescript only: Did you \
                     want to export only types with `export type * from \"...\"`?\nNote: Using \
                     `export type` is more efficient than `export *` as it won't emit any runtime \
                     code.",
                    asset.ident().to_string().await?
                )),
                source_ident: asset.ident(),
                severity: IssueSeverity::Warning.into(),
                source: None,
                title: StringVc::cell("unexpected export *".to_string()),
            }
            .cell()
            .as_issue()
            .emit(),
            EcmascriptExports::Value => AnalyzeIssue {
                code: None,
                category: StringVc::cell("analyze".to_string()),
                message: StringVc::cell(format!(
                    "export * used with module {} which only has a default export (default export \
                     is not exported with export *)\nDid you want to use `export {{ default }} \
                     from \"...\";` instead?",
                    asset.ident().to_string().await?
                )),
                source_ident: asset.ident(),
                severity: IssueSeverity::Warning.into(),
                source: None,
                title: StringVc::cell("unexpected export *".to_string()),
            }
            .cell()
            .as_issue()
            .emit(),
            EcmascriptExports::CommonJs => {
                has_cjs_exports = true;
                AnalyzeIssue {
                    code: None,
                    category: StringVc::cell("analyze".to_string()),
                    message: StringVc::cell(format!(
                        "export * used with module {} which is a CommonJS module with exports \
                         only available at runtime\nList all export names manually (`export {{ a, \
                         b, c }} from \"...\") or rewrite the module to ESM, to avoid the \
                         additional runtime code.`",
                        asset.ident().to_string().await?
                    )),
                    source_ident: asset.ident(),
                    severity: IssueSeverity::Warning.into(),
                    source: None,
                    title: StringVc::cell("unexpected export *".to_string()),
                }
                .cell()
                .as_issue()
                .emit()
            }
        }
    }
    Ok(ExpandResultsVc::cell(ExpandResults {
        star_exports: set.into_iter().collect(),
        has_cjs_exports,
    }))
}

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug)]
pub struct EsmExports {
    pub exports: BTreeMap<String, EsmExport>,
    pub star_exports: Vec<EsmAssetReferenceVc>,
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmExports {
    #[turbo_tasks::function]
    async fn code_generation(
        self_vc: EsmExportsVc,
        _context: EcmascriptChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        let this = self_vc.await?;
        let mut visitors = Vec::new();

        let mut all_exports: BTreeMap<Cow<str>, Cow<EsmExport>> = this
            .exports
            .iter()
            .map(|(k, v)| (Cow::<str>::Borrowed(k), Cow::Borrowed(v)))
            .collect();
        let mut props = Vec::new();
        let mut cjs_exports = Vec::<Box<Expr>>::new();

        for esm_ref in this.star_exports.iter() {
            if let ReferencedAsset::Some(asset) = &*esm_ref.get_referenced_asset().await? {
                let export_info = expand_star_exports(*asset).await?;
                let export_names = &export_info.star_exports;
                for export in export_names.iter() {
                    if !all_exports.contains_key(&Cow::<str>::Borrowed(export)) {
                        all_exports.insert(
                            Cow::Owned(export.clone()),
                            Cow::Owned(EsmExport::ImportedBinding(*esm_ref, export.to_string())),
                        );
                    }
                }

                if export_info.has_cjs_exports {
                    let ident = ReferencedAsset::get_ident_from_placeable(asset).await?;

                    cjs_exports.push(quote_expr!(
                        "__turbopack_cjs__($arg)",
                        arg: Expr = Ident::new(ident.into(), DUMMY_SP).into()
                    ));
                }
            }
        }
        for (exported, local) in all_exports.into_iter() {
            let expr = match local.as_ref() {
                EsmExport::Error => Some(quote!(
                    "(() => { throw new Error(\"Failed binding. See build errors!\"); })" as Expr,
                )),
                EsmExport::LocalBinding(name) => Some(quote!(
                    "(() => $local)" as Expr,
                    local = Ident::new((name as &str).into(), DUMMY_SP)
                )),
                EsmExport::ImportedBinding(esm_ref, name) => {
                    let referenced_asset = esm_ref.get_referenced_asset().await?;
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
                    let referenced_asset = esm_ref.get_referenced_asset().await?;
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
                        value: exported.as_ref().into(),
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
        let cjs_stmt = if !cjs_exports.is_empty() {
            Some(Stmt::Expr(ExprStmt {
                span: DUMMY_SP,
                expr: Expr::from_exprs(cjs_exports),
            }))
        } else {
            None
        };

        visitors.push(create_visitor!(visit_mut_program(program: &mut Program) {
            let stmt = quote!("__turbopack_esm__($getters);" as Stmt,
                getters: Expr = getters.clone()
            );
            match program {
                Program::Module(Module { body, .. }) => {
                    body.insert(0, ModuleItem::Stmt(stmt));
                }
                Program::Script(Script { body, .. }) => {
                    body.insert(0, stmt);
                }
            }
            if let Some(cjs_stmt) = cjs_stmt.clone() {
                insert_hoisted_stmt(program, cjs_stmt);
            }
        }));

        Ok(CodeGeneration { visitors }.into())
    }
}
