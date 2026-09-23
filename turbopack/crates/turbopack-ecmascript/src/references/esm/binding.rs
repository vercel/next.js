use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    atoms::atom,
    base::SwcComments,
    common::{
        DUMMY_SP, Spanned,
        comments::{Comment, CommentKind, Comments},
    },
    ecma::{
        ast::{Expr, KeyValueProp, Prop, PropName, SimpleAssignTarget},
        visit::fields::{CalleeField, PropField, VarDeclaratorField},
    },
};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, Vc};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    ScopeHoistingContext,
    ast_path_trie::{AstPathId, AstPathTrie},
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
    references::esm::{
        EsmAssetReference,
        base::{ReferencedAsset, ReferencedAssetIdent},
        export::is_export_no_side_effects,
    },
};

#[derive(Hash, Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub struct EsmBinding {
    reference: ResolvedVc<EsmAssetReference>,
    export: Option<RcStr>,
    ast_path: AstPathId,
    keep_this: bool,
}

impl EsmBinding {
    pub fn new(
        reference: ResolvedVc<EsmAssetReference>,
        export: Option<RcStr>,
        ast_path: AstPathId,
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
        ast_path: AstPathId,
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
        trie: &AstPathTrie,
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

        let export = self.export.clone();
        let imported_module = self.reference.get_referenced_asset().await?;
        let no_side_effects =
            if let (ReferencedAsset::Some(module), Some(export)) = (&imported_module, &export) {
                *is_export_no_side_effects(**module, export.clone()).await?
            } else {
                false
            };
        let generated_comments = SwcComments::default();

        enum ImportedIdent {
            Module(ReferencedAssetIdent),
            None,
            /// Empty module (alias set to `false`): namespace imports resolve to `{}`.
            Empty,
            Unresolvable,
        }

        let imported_ident = match &imported_module {
            ReferencedAsset::None => ImportedIdent::None,
            ReferencedAsset::Empty => {
                if export.is_some() {
                    // Named/default binding from an empty module → `undefined`
                    ImportedIdent::None
                } else {
                    // Namespace import from an empty module → `{}`
                    ImportedIdent::Empty
                }
            }
            imported_module => imported_module
                .get_ident(chunking_context, export, scope_hoisting_context)
                .await?
                .map_or(ImportedIdent::Unresolvable, ImportedIdent::Module),
        };

        // Walk up from the binding towards the root, stopping at the innermost node kind we
        // know how to rewrite.
        let mut ast_path = self.ast_path;
        loop {
            match trie.get(ast_path) {
                // Shorthand properties get special treatment because we need to rewrite them to
                // normal key-value pairs.
                Some(swc_core::ecma::visit::AstParentKind::Prop(PropField::Shorthand)) => {
                    ast_path = trie.parent_or_root(ast_path);
                    visitors.push(create_visitor!(
                        exact,
                        trie,
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
                                    ImportedIdent::Empty => {
                                        use swc_core::quote;
                                        *prop = Prop::KeyValue(KeyValueProp {
                                            key: PropName::Ident(ident.clone().into()),
                                            value: Box::new(quote!("{}" as Expr)),
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
                    ast_path = trie.parent_or_root(ast_path);
                    let is_call = matches!(
                        trie.get(ast_path),
                        Some(swc_core::ecma::visit::AstParentKind::Callee(
                            CalleeField::Expr
                        ))
                    );
                    let in_call = !self.keep_this && is_call;
                    let in_var_initializer = matches!(
                        trie.get(ast_path),
                        Some(swc_core::ecma::visit::AstParentKind::VarDeclarator(
                            VarDeclaratorField::Init
                        ))
                    );
                    let generated_comments = generated_comments.clone();

                    visitors.push(create_visitor!(
                        exact,
                        trie,
                        ast_path,
                        visit_mut_expr,
                        |expr: &mut Expr| {
                            if no_side_effects && (is_call || in_var_initializer) {
                                generated_comments.add_leading(
                                    expr.span().lo,
                                    Comment {
                                        kind: CommentKind::Block,
                                        span: DUMMY_SP,
                                        text: if is_call {
                                            atom!("#__PURE__")
                                        } else {
                                            atom!("#__NO_SIDE_EFFECTS__")
                                        },
                                    },
                                );
                            }
                            match &imported_ident {
                                ImportedIdent::Module(imported_ident) => {
                                    *expr = imported_ident.as_expr(expr.span(), in_call);
                                }
                                ImportedIdent::None => {
                                    *expr = *Expr::undefined(expr.span());
                                }
                                ImportedIdent::Empty => {
                                    use swc_core::quote;
                                    *expr = quote!("{}" as Expr);
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
                    ast_path = trie.parent_or_root(ast_path);

                    visitors.push(create_visitor!(
                        exact,
                        trie,
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
                                ImportedIdent::None | ImportedIdent::Empty => {
                                    // Do nothing, cannot assign to `undefined` or `{}`
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
                    ast_path = trie.parent_or_root(ast_path);
                }
                None => break,
            }
        }

        Ok(if no_side_effects {
            CodeGeneration::visitors_with_comments(visitors, generated_comments)
        } else {
            CodeGeneration::visitors(visitors)
        })
    }
}

impl From<EsmBinding> for CodeGen {
    fn from(val: EsmBinding) -> Self {
        CodeGen::EsmBinding(val)
    }
}
