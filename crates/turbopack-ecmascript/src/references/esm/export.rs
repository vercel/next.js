use std::{
    borrow::Cow,
    collections::{BTreeMap, HashSet},
};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_common::DUMMY_SP;
use swc_ecma_ast::{
    ComputedPropName, Expr, Ident, KeyValueProp, Lit, MemberExpr, MemberProp, Module, ModuleItem,
    ObjectLit, Program, Prop, PropName, PropOrSpread, Script, Str,
};
use swc_ecma_quote::quote;
use turbo_tasks::{
    primitives::{StringVc, StringsVc},
    trace::TraceRawVcs,
    ValueToString,
};
use turbopack_core::{
    asset::Asset,
    chunk::ChunkingContextVc,
    issue::{analyze::AnalyzeIssue, IssueSeverity},
};

use super::{
    base::{get_ident, ReferencedAsset},
    EsmAssetReferenceVc,
};
use crate::{
    chunk::{EcmascriptChunkContextVc, EcmascriptChunkPlaceableVc, EcmascriptExports},
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor,
};

#[derive(Clone, Hash, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs)]
pub enum EsmExport {
    LocalBinding(String),
    ImportedBinding(EsmAssetReferenceVc, String),
    ImportedNamespace(EsmAssetReferenceVc),
    Error,
}

#[turbo_tasks::function]
async fn expand_star_exports(root_asset: EcmascriptChunkPlaceableVc) -> Result<StringsVc> {
    let mut set = HashSet::new();
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
                message: StringVc::cell(format!(
                    "export * used with module {} which has no exports\nTypescipt only: Did you \
                     want to import only types with `export type * from \"...\"`?",
                    asset.to_string().await?
                )),
                path: asset.path(),
                severity: IssueSeverity::Warning.into(),
                source: None,
                title: StringVc::cell("unexpected export *".to_string()),
            }
            .cell()
            .as_issue()
            .emit(),
            EcmascriptExports::Value => AnalyzeIssue {
                code: None,
                message: StringVc::cell(format!(
                    "export * used with module {} which only has a default export (default export \
                     is not exported with export *)\nDid you want to use `export {{ default }} \
                     from \"...\";` instead?",
                    asset.to_string().await?
                )),
                path: asset.path(),
                severity: IssueSeverity::Warning.into(),
                source: None,
                title: StringVc::cell("unexpected export *".to_string()),
            }
            .cell()
            .as_issue()
            .emit(),
            EcmascriptExports::CommonJs => AnalyzeIssue {
                code: None,
                message: StringVc::cell(format!(
                    "export * used with module {} which is a CommonJs module with exports only \
                     available at runtime\nList all export names manually (`export {{ a, b, c }} \
                     from \"...\") or rewrite the module to ESM.`",
                    asset.to_string().await?
                )),
                path: asset.path(),
                severity: IssueSeverity::Warning.into(),
                source: None,
                title: StringVc::cell("unexpected export *".to_string()),
            }
            .cell()
            .as_issue()
            .emit(),
        }
    }
    Ok(StringsVc::cell(set.into_iter().collect()))
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
        _chunk_context: EcmascriptChunkContextVc,
        _context: ChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        let this = self_vc.await?;
        let mut visitors = Vec::new();

        let mut all_exports: BTreeMap<Cow<str>, Cow<EsmExport>> = this
            .exports
            .iter()
            .map(|(k, v)| (Cow::<str>::Borrowed(k), Cow::Borrowed(v)))
            .collect();
        let mut props = Vec::new();
        for esm_ref in this.star_exports.iter() {
            if let ReferencedAsset::Some(asset) = &*esm_ref.get_referenced_asset().await? {
                let export_names = expand_star_exports(*asset).await?;
                for export in export_names.iter() {
                    if !all_exports.contains_key(&Cow::<str>::Borrowed(export)) {
                        all_exports.insert(
                            Cow::Owned(export.clone()),
                            Cow::Owned(EsmExport::ImportedBinding(*esm_ref, export.to_string())),
                        );
                    }
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
                    if let ReferencedAsset::Some(asset) = &*esm_ref.get_referenced_asset().await? {
                        let ident = get_ident(*asset).await?;
                        Some(quote!(
                            "(() => $expr)" as Expr,
                            expr: Expr = Expr::Member(MemberExpr {
                                span: DUMMY_SP,
                                obj: box Expr::Ident(Ident::new(ident.into(), DUMMY_SP)),
                                prop: MemberProp::Computed(ComputedPropName {
                                    span: DUMMY_SP,
                                    expr: box Expr::Lit(Lit::Str(Str {
                                        span: DUMMY_SP,
                                        value: (name as &str).into(),
                                        raw: None,
                                    }))
                                })
                            })
                        ))
                    } else {
                        None
                    }
                }
                EsmExport::ImportedNamespace(esm_ref) => {
                    if let ReferencedAsset::Some(asset) = &*esm_ref.get_referenced_asset().await? {
                        let ident = get_ident(*asset).await?;
                        Some(quote!(
                            "(() => $imported)" as Expr,
                            imported = Ident::new(ident.into(), DUMMY_SP)
                        ))
                    } else {
                        None
                    }
                }
            };
            if let Some(expr) = expr {
                props.push(PropOrSpread::Prop(box Prop::KeyValue(KeyValueProp {
                    key: PropName::Str(Str {
                        span: DUMMY_SP,
                        value: exported.as_ref().into(),
                        raw: None,
                    }),
                    value: box expr,
                })));
            }
        }
        let getters = Expr::Object(ObjectLit {
            span: DUMMY_SP,
            props,
        });

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
        }));

        Ok(CodeGeneration { visitors }.into())
    }
}
