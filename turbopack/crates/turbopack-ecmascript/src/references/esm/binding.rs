use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{Expr, Ident, KeyValueProp, Prop, PropName, SimpleAssignTarget},
        visit::fields::{CalleeField, PropField},
    },
    quote,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, Vc, trace::TraceRawVcs};
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    ScopeHoistingContext,
    code_gen::{CodeGen, CodeGeneration, CodeGenerationHoistedStmt},
    create_visitor, magic_identifier,
    references::{
        AstPath,
        esm::{
            EsmAssetReference,
            base::{ReferencedAsset, ReferencedAssetIdent},
        },
    },
};

#[derive(Hash, Clone, Debug, PartialEq, Eq, TraceRawVcs, NonLocalValue, Encode, Decode)]
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
        if chunking_context
            .unused_references()
            .contains_key(&ResolvedVc::upcast(self.reference))
            .await?
        {
            return Ok(CodeGeneration::empty());
        }

        let mut visitors = vec![];
        let mut hoisted_stmts = vec![];

        let export = self.export.clone();
        let imported_module = self.reference.get_referenced_asset().await?;

        enum ImportedIdent {
            Module(ReferencedAssetIdent, Option<Ident>),
            None,
            Unresolvable,
        }

        let imported_ident = match &imported_module {
            ReferencedAsset::None => ImportedIdent::None,
            imported_module => match imported_module
                .get_ident(chunking_context, export, scope_hoisting_context)
                .await?
            {
                Some(imported_ident) => {
                    let value_binding = if !self.keep_this
                        && !self.ast_path.0.iter().any(|parent| {
                            matches!(
                                parent,
                                swc_core::ecma::visit::AstParentKind::SimpleAssignTarget(_)
                            )
                        })
                        && let ReferencedAssetIdent::Module {
                            namespace_ident,
                            ctxt,
                            export: Some(export),
                            can_value_bind: true,
                            ..
                        } = &imported_ident
                    {
                        let binding_ident = Ident::new(
                            magic_identifier::mangle(&format!(
                                "imported binding {}",
                                encode_hex(hash_xxh3_hash64((namespace_ident, export)))
                            ))
                            .into(),
                            DUMMY_SP,
                            ctxt.unwrap_or_default(),
                        );
                        let value = imported_ident
                            .as_expr_individual(DUMMY_SP)
                            .map_either(Expr::from, Expr::from)
                            .into_inner();
                        hoisted_stmts.push(CodeGenerationHoistedStmt::new(
                            format!("value binding {} {:?}", binding_ident.sym, ctxt).into(),
                            quote!(
                                "var $binding = $value;" as Stmt,
                                binding = binding_ident.clone(),
                                value: Expr = value,
                            ),
                        ));
                        Some(binding_ident)
                    } else {
                        None
                    };
                    ImportedIdent::Module(imported_ident, value_binding)
                }
                None => ImportedIdent::Unresolvable,
            },
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
                                    ImportedIdent::Module(imported_ident, value_binding) => {
                                        *prop = Prop::KeyValue(KeyValueProp {
                                            key: PropName::Ident(ident.clone().into()),
                                            value: Box::new(value_binding.as_ref().map_or_else(
                                                || imported_ident.as_expr(ident.span, false),
                                                |binding| Expr::Ident(binding.clone()),
                                            )),
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
                                ImportedIdent::Module(imported_ident, value_binding) => {
                                    *expr = value_binding.as_ref().map_or_else(
                                        || imported_ident.as_expr(expr.span(), in_call),
                                        |binding| Expr::Ident(binding.clone()),
                                    );
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
                                ImportedIdent::Module(imported_ident, _) => {
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

        Ok(CodeGeneration::new(
            visitors,
            hoisted_stmts,
            vec![],
            vec![],
            vec![],
        ))
    }
}

impl From<EsmBinding> for CodeGen {
    fn from(val: EsmBinding) -> Self {
        CodeGen::EsmBinding(val)
    }
}
