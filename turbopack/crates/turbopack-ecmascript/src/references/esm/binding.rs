use anyhow::Result;
use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use swc_core::{
    atoms::atom,
    base::SwcComments,
    common::{
        DUMMY_SP, Spanned,
        comments::{Comment, CommentKind, Comments},
    },
    ecma::{
        ast::{Expr, KeyValueProp, Prop, PropName, SimpleAssignTarget},
        visit::fields::{
            CalleeField, ExprField, MemberExprField, ParenExprField, PropField, TaggedTplField,
            VarDeclaratorField,
        },
    },
};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, NonLocalValue, ResolvedVc, Vc};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    ScopeHoistingContext,
    ast_path_trie::{AstPathId, AstPathTrie},
    code_gen::CodeGeneration,
    create_visitor,
    references::esm::{
        EsmAssetReference,
        base::{ReferencedAsset, ReferencedAssetIdent},
        export::is_export_no_side_effects,
    },
};

#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode, Hash)]
struct EsmBinding {
    export: Option<RcStr>,
    namespace_member: Option<RcStr>,
    ast_path: AstPathId,
    keep_this: bool,
}

#[derive(Default, Clone, Debug)]
pub struct EsmBindingsBuilder {
    bindings: FxIndexMap<ResolvedVc<EsmAssetReference>, Vec<EsmBinding>>,
}

#[derive(Default, Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode, Hash)]
pub struct EsmBindings {
    #[allow(clippy::type_complexity)]
    bindings: Box<[(ResolvedVc<EsmAssetReference>, Box<[EsmBinding]>)]>,
}

impl EsmBindingsBuilder {
    pub fn add(
        &mut self,
        reference: ResolvedVc<EsmAssetReference>,
        export: Option<RcStr>,
        ast_path: AstPathId,
    ) {
        self.bindings
            .entry(reference)
            .or_default()
            .push(EsmBinding {
                export,
                namespace_member: None,
                ast_path,
                keep_this: false,
            });
    }

    pub fn add_with_namespace_member(
        &mut self,
        reference: ResolvedVc<EsmAssetReference>,
        export: Option<RcStr>,
        namespace_member: Option<RcStr>,
        ast_path: AstPathId,
    ) {
        self.bindings
            .entry(reference)
            .or_default()
            .push(EsmBinding {
                export,
                namespace_member,
                ast_path,
                keep_this: false,
            });
    }

    /// Where possible, bind the namespace to `this` when the named import is called.
    pub fn add_keep_this(
        &mut self,
        reference: ResolvedVc<EsmAssetReference>,
        export: Option<RcStr>,
        ast_path: AstPathId,
    ) {
        self.bindings
            .entry(reference)
            .or_default()
            .push(EsmBinding {
                export,
                namespace_member: None,
                ast_path,
                keep_this: true,
            });
    }

    pub fn build(self) -> Option<EsmBindings> {
        if self.bindings.is_empty() {
            return None;
        }

        Some(EsmBindings {
            bindings: self
                .bindings
                .into_iter()
                .map(|(k, v)| (k, v.into_boxed_slice()))
                .collect(),
        })
    }
}

impl EsmBindings {
    pub async fn code_generation(
        &self,
        trie: &AstPathTrie,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
    ) -> Result<CodeGeneration> {
        let mut visitors = vec![];
        let generated_comments = SwcComments::default();
        let mut has_no_side_effects = false;

        let unused_references = chunking_context.unused_references();

        for (reference, bindings) in &self.bindings {
            if unused_references
                .contains_key(&ResolvedVc::upcast(*reference))
                .await?
            {
                continue;
            }
            let imported_module = reference.get_referenced_asset().await?;

            let mut exports_cache: FxHashMap<Option<RcStr>, _> = FxHashMap::default();
            let mut purity_cache: FxHashMap<(RcStr, Option<RcStr>), bool> = FxHashMap::default();
            #[derive(Clone)]
            enum ImportedIdent {
                Module(ReferencedAssetIdent),
                None,
                /// Empty module (alias set to `false`): namespace imports resolve to `{}`.
                Empty,
                Unresolvable,
            }
            for EsmBinding {
                export,
                namespace_member,
                ast_path,
                keep_this,
            } in bindings
            {
                let no_side_effects = if let (ReferencedAsset::Some(module), Some(export)) =
                    (&imported_module, export)
                {
                    match purity_cache.entry((export.clone(), namespace_member.clone())) {
                        std::collections::hash_map::Entry::Vacant(entry) => {
                            let pure = *is_export_no_side_effects(
                                **module,
                                export.clone(),
                                namespace_member.clone(),
                            )
                            .await?;
                            entry.insert(pure);
                            pure
                        }
                        std::collections::hash_map::Entry::Occupied(entry) => *entry.get(),
                    }
                } else {
                    false
                };
                has_no_side_effects |= no_side_effects;
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
                    imported_module => match exports_cache.entry(export.clone()) {
                        std::collections::hash_map::Entry::Vacant(entry) => {
                            let ident: ImportedIdent = imported_module
                                .get_ident(chunking_context, export.clone(), scope_hoisting_context)
                                .await?
                                .map_or(ImportedIdent::Unresolvable, ImportedIdent::Module);
                            entry.insert(ident.clone());
                            ident
                        }
                        std::collections::hash_map::Entry::Occupied(entry) => entry.get().clone(),
                    },
                };

                // Walk up from the binding towards the root, stopping at the innermost node kind we
                // know how to rewrite.
                let mut ast_path = *ast_path;
                loop {
                    match trie.get(ast_path) {
                        // Shorthand properties get special treatment because we need to rewrite
                        // them to normal key-value pairs.
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
                            let is_invocation_of = |path| {
                                let kind = trie.get(path);
                                (
                                    matches!(
                                        kind,
                                        Some(swc_core::ecma::visit::AstParentKind::Callee(
                                            CalleeField::Expr
                                        ))
                                    ),
                                    matches!(
                                        kind,
                                        Some(swc_core::ecma::visit::AstParentKind::TaggedTpl(
                                            TaggedTplField::Tag
                                        ))
                                    ),
                                )
                            };
                            // Only a directly replaced callee/tag may need a `this`-less accessor.
                            let (direct_is_call, direct_is_tag) = is_invocation_of(ast_path);
                            // Classify the enclosing use while replacing only the imported base.
                            let mut usage_path = ast_path;
                            if namespace_member.is_some() {
                                usage_path = walk_up_through(
                                    trie,
                                    usage_path,
                                    swc_core::ecma::visit::AstParentKind::MemberExpr(
                                        MemberExprField::Obj,
                                    ),
                                    swc_core::ecma::visit::AstParentKind::Expr(ExprField::Member),
                                );
                            }
                            loop {
                                let next = walk_up_through(
                                    trie,
                                    usage_path,
                                    swc_core::ecma::visit::AstParentKind::ParenExpr(
                                        ParenExprField::Expr,
                                    ),
                                    swc_core::ecma::visit::AstParentKind::Expr(ExprField::Paren),
                                );
                                if next == usage_path {
                                    break;
                                }
                                usage_path = next;
                            }
                            let (is_call, is_tag) = is_invocation_of(usage_path);
                            let in_var_initializer = matches!(
                                trie.get(usage_path),
                                Some(swc_core::ecma::visit::AstParentKind::VarDeclarator(
                                    VarDeclaratorField::Init
                                ))
                            );
                            // Namespace members retain their object as the `this` receiver.
                            let preserve_this = *keep_this || namespace_member.is_some();
                            let in_invocation = !preserve_this && (direct_is_call || direct_is_tag);
                            let generated_comments = generated_comments.clone();

                            visitors.push(create_visitor!(
                                exact,
                                trie,
                                ast_path,
                                visit_mut_expr,
                                |expr: &mut Expr| {
                                    if no_side_effects && (is_call || is_tag || in_var_initializer)
                                    {
                                        generated_comments.add_leading(
                                            expr.span().lo,
                                            Comment {
                                                kind: CommentKind::Block,
                                                span: DUMMY_SP,
                                                text: if is_call || is_tag {
                                                    atom!("#__PURE__")
                                                } else {
                                                    atom!("#__NO_SIDE_EFFECTS__")
                                                },
                                            },
                                        );
                                    }
                                    match &imported_ident {
                                        ImportedIdent::Module(imported_ident) => {
                                            *expr =
                                                imported_ident.as_expr(expr.span(), in_invocation);
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
            }
        }

        Ok(if has_no_side_effects {
            CodeGeneration::visitors_with_comments(visitors, generated_comments)
        } else {
            CodeGeneration::visitors(visitors)
        })
    }
}

/// Skip a known wrapper around a binding when classifying its use site.
fn walk_up_through(
    trie: &AstPathTrie,
    path: AstPathId,
    field: swc_core::ecma::visit::AstParentKind,
    wrapper: swc_core::ecma::visit::AstParentKind,
) -> AstPathId {
    if trie.get(path) != Some(field) {
        return path;
    }
    let parent = trie.parent_or_root(path);
    if trie.get(parent) == Some(wrapper) {
        trie.parent_or_root(parent)
    } else {
        parent
    }
}
