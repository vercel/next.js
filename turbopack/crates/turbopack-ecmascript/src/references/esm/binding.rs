use anyhow::Result;
use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use swc_core::ecma::{
    ast::{Expr, KeyValueProp, Prop, PropName, SimpleAssignTarget},
    visit::{AstParentKind, fields::PropField},
};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, NonLocalValue, ResolvedVc, Vc};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    ScopeHoistingContext,
    analyzer::graph::{
        NamespaceAccess,
        namespace_access::{enclosing_position, is_this_receiver_position},
    },
    ast_path_trie::{AstPathId, AstPathTrie},
    code_gen::CodeGeneration,
    create_visitor,
    references::esm::{
        EsmAssetReference,
        base::{ReferencedAsset, ReferencedAssetIdent},
    },
};

#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode, Hash)]
struct EsmBinding {
    export: Option<RcStr>,
    ast_path: AstPathId,
    namespace_access: Option<NamespaceAccess>,
}

impl EsmBinding {
    /// Whether the access has to go through the namespace, see
    /// [`NamespaceAccess::keeps_namespace`]. Anything but a namespace member access never does.
    fn keeps_namespace(&self, maybe_uses_this: bool) -> bool {
        self.namespace_access
            .is_some_and(|access| access.keeps_namespace(maybe_uses_this))
    }
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
    /// `namespace_access` says how a namespace member access such as `ns.f` is used, which decides
    /// whether it has to keep going through the namespace. It is `None` when the binding is not
    /// one.
    pub fn add(
        &mut self,
        reference: ResolvedVc<EsmAssetReference>,
        export: Option<RcStr>,
        ast_path: AstPathId,
        namespace_access: Option<NamespaceAccess>,
    ) {
        self.bindings
            .entry(reference)
            .or_default()
            .push(EsmBinding {
                export,
                ast_path,
                namespace_access,
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
            #[derive(Clone)]
            enum ImportedIdent {
                Module(ReferencedAssetIdent),
                None,
                /// Empty module (alias set to `false`): namespace imports resolve to `{}`.
                Empty,
                Unresolvable,
            }
            for binding in bindings {
                let EsmBinding {
                    export, ast_path, ..
                } = binding;
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
                        Some(AstParentKind::Prop(PropField::Shorthand)) => {
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
                        Some(AstParentKind::Expr(_)) => {
                            ast_path = trie.parent_or_root(ast_path);
                            // `ast_path` no longer names the trailing `Expr`, so it starts at the
                            // position the expression sits in. Nothing is known yet about whether
                            // the export observes `this`, so a namespace member call keeps the
                            // namespace as its receiver.
                            let in_call = !binding.keeps_namespace(true)
                                && is_this_receiver_position(enclosing_position(
                                    trie.iter_rev(ast_path),
                                ));

                            visitors.push(create_visitor!(
                                exact,
                                trie,
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
                        Some(AstParentKind::SimpleAssignTarget(_)) => {
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

        Ok(CodeGeneration::visitors(visitors))
    }
}
