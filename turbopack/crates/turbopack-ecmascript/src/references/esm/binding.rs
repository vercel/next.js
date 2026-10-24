use anyhow::Result;
use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use swc_core::ecma::{
    ast::{Expr, KeyValueProp, Prop, PropName, SimpleAssignTarget},
    visit::fields::{CalleeField, PropField},
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, NonLocalValue, ResolvedVc, Vc};
use turbopack_core::{chunk::ChunkingContext, module::Module};

use crate::{
    ScopeHoistingContext,
    ast_path_trie::{AstPathId, AstPathTrie},
    code_gen::CodeGeneration,
    create_visitor,
    references::{
        esm::{
            EsmAssetReference,
            base::{ReferencedAsset, ReferencedAssetIdent},
        },
        removal::RemovalCodeGen,
    },
    utils::AstPathRange,
};

#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode, Hash)]
struct EsmBinding {
    export: Option<RcStr>,
    ast_path: AstPathId,
    keep_this: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode, Hash)]
struct PureInitializer {
    ast_path: AstPathId,
    used_by_exports: Vec<RcStr>,
}

#[derive(Default, Clone, Debug)]
pub struct EsmBindingsBuilder {
    bindings: FxIndexMap<ResolvedVc<EsmAssetReference>, Vec<EsmBinding>>,
    pure_initializers: Vec<PureInitializer>,
}

#[derive(Default, Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode, Hash)]
pub struct EsmBindings {
    #[allow(clippy::type_complexity)]
    bindings: Box<[(ResolvedVc<EsmAssetReference>, Box<[EsmBinding]>)]>,
    pure_initializers: Box<[PureInitializer]>,
}

impl EsmBindingsBuilder {
    pub fn add_pure_initializer(&mut self, ast_path: AstPathId, used_by_exports: Vec<RcStr>) {
        self.pure_initializers.push(PureInitializer {
            ast_path,
            used_by_exports,
        });
    }

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
                ast_path,
                keep_this: true,
            });
    }

    pub fn build(self) -> Option<EsmBindings> {
        if self.bindings.is_empty() && self.pure_initializers.is_empty() {
            return None;
        }

        Some(EsmBindings {
            bindings: self
                .bindings
                .into_iter()
                .map(|(k, v)| (k, v.into_boxed_slice()))
                .collect(),
            pure_initializers: self.pure_initializers.into_boxed_slice(),
        })
    }
}

impl EsmBindings {
    pub(crate) async fn pure_initializers_code_generation(
        &self,
        trie: &AstPathTrie,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module: Vc<Box<dyn Module>>,
    ) -> Result<Vec<CodeGeneration>> {
        if self.pure_initializers.is_empty()
            || chunking_context.unused_references().await?.is_empty()
        {
            return Ok(vec![]);
        }

        let module_usage = chunking_context.module_export_usage(module).await?;
        let used_exports = module_usage.export_usage.await?;
        let mut code_gens = vec![];
        for initializer in &self.pure_initializers {
            if initializer
                .used_by_exports
                .iter()
                .any(|export| used_exports.is_export_used(export))
            {
                continue;
            }
            code_gens.push(
                RemovalCodeGen::new(
                    rcstr!("TURBOPACK unused pure initializer"),
                    AstPathRange::Exact(initializer.ast_path),
                )
                .code_generation(trie, chunking_context)
                .await?,
            );
        }
        Ok(code_gens)
    }

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
            for EsmBinding {
                export,
                ast_path,
                keep_this,
            } in bindings
            {
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
                            let in_call = !keep_this
                                && matches!(
                                    trie.get(ast_path),
                                    Some(swc_core::ecma::visit::AstParentKind::Callee(
                                        CalleeField::Expr
                                    ))
                                );

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

        Ok(CodeGeneration::visitors(visitors))
    }
}
