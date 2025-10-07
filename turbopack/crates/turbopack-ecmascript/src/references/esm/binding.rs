use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::ecma::{
    ast::{Expr, KeyValueProp, Prop, PropName, SimpleAssignTarget},
    visit::fields::{CalleeField, PropField},
};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, Vc, trace::TraceRawVcs};
use turbopack_core::chunk::ChunkingContext;

use super::EsmAssetReference;
use crate::{
    ScopeHoistingContext,
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
    references::{
        AstPath,
        esm::base::{ReferencedAsset, ReferencedAssetIdent},
    },
};

#[derive(Hash, Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TraceRawVcs, NonLocalValue)]
pub struct EsmBinding {
    reference: ResolvedVc<EsmAssetReference>,
    export: Option<RcStr>,
    ast_path: AstPath,
    keep_this: bool,
}

impl EsmBinding {
    pub fn new(
        reference: ResolvedVc<EsmAssetReference>,
        export: Option<RcStr>,
        ast_path: AstPath,
    ) -> Self {
        EsmBinding {
            reference,
            export,
            ast_path,
            keep_this: false,
        }
    }

    /// Where possible, bind the namespace to `this` when the named import is called.
    pub fn new_keep_this(
        reference: ResolvedVc<EsmAssetReference>,
        export: Option<RcStr>,
        ast_path: AstPath,
    ) -> Self {
        EsmBinding {
            reference,
            export,
            ast_path,
            keep_this: true,
        }
    }

    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
    ) -> Result<CodeGeneration> {
        let mut visitors = vec![];

        let export = self.export.clone();
        let imported_module = self.reference.get_referenced_asset().await?;

        enum ImportedIdent {
            Module(ReferencedAssetIdent),
            None,
            Unresolvable,
        }

        let imported_ident = match &*imported_module {
            ReferencedAsset::None => ImportedIdent::None,
            imported_module => imported_module
                .get_ident(chunking_context, export, scope_hoisting_context)
                .await?
                .map_or(ImportedIdent::Unresolvable, ImportedIdent::Module),
        };

        let mut ast_path = self.ast_path.0.clone();
        loop {
            match ast_path.last() {
                // Shorthand properties get special treatment because we need to rewrite them to
                // normal key-value pairs.
                Some(swc_core::ecma::visit::AstParentKind::Prop(PropField::Shorthand)) => {
                    ast_path.pop();
                    visitors.push(create_visitor!(
                        exact,
                        ast_path,
                        visit_mut_prop,
                        |prop: &mut Prop| {
                            if let Prop::Shorthand(ident) = prop {
                                match &imported_ident {
                                    ImportedIdent::Module(imported_ident) => {
                                        *prop = Prop::KeyValue(KeyValueProp {
                                            key: PropName::Ident(ident.clone().into()),
                                            value: Box::new(
                                                imported_ident.as_expr(ident.span, false),
                                            ),
                                        });
                                    }
                                    ImportedIdent::None => {
                                        *prop = Prop::KeyValue(KeyValueProp {
                                            key: PropName::Ident(ident.clone().into()),
                                            value: Expr::undefined(ident.span),
                                        });
                                    }
                                    ImportedIdent::Unresolvable => {
                                        // Do nothing, the reference will insert a throw
                                    }
                                }
                            }
                        }
                    ));
                    break;
                }
                // Any other expression can be replaced with the import accessor.
                Some(swc_core::ecma::visit::AstParentKind::Expr(_)) => {
                    ast_path.pop();
                    let in_call = !self.keep_this
                        && matches!(
                            ast_path.last(),
                            Some(swc_core::ecma::visit::AstParentKind::Callee(
                                CalleeField::Expr
                            ))
                        );

                    visitors.push(create_visitor!(
                        exact,
                        ast_path,
                        visit_mut_expr,
                        |expr: &mut Expr| {
                            use swc_core::common::Spanned;
                            match &imported_ident {
                                ImportedIdent::Module(imported_ident) => {
                                    *expr = imported_ident.as_expr(expr.span(), in_call);
                                }
                                ImportedIdent::None => {
                                    *expr = *Expr::undefined(expr.span());
                                }
                                ImportedIdent::Unresolvable => {
                                    // Do nothing, the reference will insert a throw
                                }
                            }
                        }
                    ));
                    break;
                }
                // We need to handle LHS because of code like
                // (function (RouteKind1){})(RouteKind || RouteKind = {})
                Some(swc_core::ecma::visit::AstParentKind::SimpleAssignTarget(_)) => {
                    ast_path.pop();

                    visitors.push(create_visitor!(
                        exact,
                        ast_path,
                        visit_mut_simple_assign_target,
                        |l: &mut SimpleAssignTarget| {
                            use swc_core::common::Spanned;
                            match &imported_ident {
                                ImportedIdent::Module(imported_ident) => {
                                    *l = imported_ident
                                        .as_expr_individual(l.span())
                                        .map_either(
                                            |i| SimpleAssignTarget::Ident(i.into()),
                                            SimpleAssignTarget::Member,
                                        )
                                        .into_inner();
                                }
                                ImportedIdent::None => {
                                    // Do nothing, cannot assign to `undefined`
                                }
                                ImportedIdent::Unresolvable => {
                                    // Do nothing, the reference will insert a throw
                                }
                            }
                        }
                    ));
                    break;
                }
                Some(_) => {
                    ast_path.pop();
                }
                None => break,
            }
        }

        Ok(CodeGeneration::visitors(visitors))
    }
}

impl From<EsmBinding> for CodeGen {
    fn from(val: EsmBinding) -> Self {
        CodeGen::EsmBinding(val)
    }
}
