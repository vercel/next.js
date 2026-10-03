use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::{DUMMY_SP, SyntaxContext, source_map::PURE_SP},
    ecma::{
        ast::{
            ComputedPropName, Decl, Expr, Ident, KeyValueProp, Lit, MemberExpr, MemberProp, Pat,
            Prop, PropName, SimpleAssignTarget, Stmt, Str, VarDecl, VarDeclKind, VarDeclarator,
        },
        visit::{AstParentKind, fields::PropField},
    },
};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, Vc};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    ScopeHoistingContext,
    analyzer::graph::{
        NamespaceAccess,
        namespace_access::{enclosing_position, is_this_receiver_position},
    },
    ast_path_trie::{AstPathId, AstPathTrie},
    code_gen::{CodeGen, CodeGeneration, CodeGenerationHoistedStmt, HoistedStmtKey},
    create_visitor,
    references::esm::{
        EsmAssetReference,
        base::{ImportSource, ReferencedAsset, ReferencedAssetIdent, can_capture_export_value},
    },
};

#[derive(Hash, Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub struct EsmBinding {
    reference: ResolvedVc<EsmAssetReference>,
    export: Option<RcStr>,
    ast_path: AstPathId,
    namespace_access: Option<NamespaceAccess>,
}

impl EsmBinding {
    /// `namespace_access` says how a namespace member access such as `ns.f` is used, which decides
    /// whether it can read a captured local. It is `None` when the binding is not one.
    pub fn new(
        reference: ResolvedVc<EsmAssetReference>,
        export: Option<RcStr>,
        ast_path: AstPathId,
        namespace_access: Option<NamespaceAccess>,
    ) -> Self {
        EsmBinding {
            reference,
            export,
            ast_path,
            namespace_access,
        }
    }

    /// Whether the access has to go through the namespace rather than a captured local, see
    /// [`NamespaceAccess::keeps_namespace`]. Anything but a namespace member access never does.
    fn keeps_namespace(&self, maybe_uses_this: bool) -> bool {
        self.namespace_access
            .is_some_and(|access| access.keeps_namespace(maybe_uses_this))
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
        let mut capture = None;
        let imported_module = &self.reference.get_referenced_asset().await?;
        let export = self.export.clone();

        enum ImportedIdent {
            Module(ReferencedAssetIdent, Option<Ident>),
            None,
            /// Empty module (alias set to `false`): namespace imports resolve to `{}`.
            Empty,
            Unresolvable,
        }

        // Whether calling the export could observe `this`, conservatively true until the capture
        // analysis below says otherwise.
        let mut maybe_uses_this = true;
        let imported_ident = match imported_module {
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
            imported_module => match imported_module
                .get_ident(chunking_context, export, scope_hoisting_context)
                .await?
            {
                Some(imported_ident) => {
                    let export_capture = match (imported_module, &imported_ident, &self.export) {
                        // A write keeps the namespace whatever the export is, so it is not worth
                        // asking.
                        _ if self.namespace_access == Some(NamespaceAccess::Write) => None,
                        (
                            ReferencedAsset::Some(module),
                            ReferencedAssetIdent::Module {
                                import_source: ImportSource::Module { asset },
                                export: Some(_),
                                ..
                            },
                            Some(export),
                        ) => Some(
                            can_capture_export_value(
                                *asset,
                                *module,
                                export.clone(),
                                chunking_context,
                            )
                            .await?,
                        ),
                        _ => None,
                    };
                    // Nothing is known about anything else, so it is read through the namespace
                    // and called with it as the receiver.
                    maybe_uses_this = export_capture.as_ref().is_none_or(|c| c.maybe_uses_this);
                    // Capturing an import is only safe when the access does not need to go
                    // through the namespace, see `NamespaceAccess`.
                    let value_binding = if !self.keeps_namespace(maybe_uses_this)
                        && let Some(binding_name) = export_capture
                            .as_ref()
                            .and_then(|c| c.value_binding_name.as_ref())
                        && let ReferencedAssetIdent::Module {
                            namespace_ident,
                            ctxt,
                            export: Some(export),
                            ..
                        } = &imported_ident
                    {
                        let binding_ident = Ident::new(
                            binding_name.as_str().into(),
                            DUMMY_SP,
                            // The name is unique to the value, see
                            // `ExportCapture::value_binding_name`, so it needs no syntax context
                            // even when several merged modules declare it.
                            Default::default(),
                        );
                        capture = Some(ValueBindingCapture {
                            namespace_ident: namespace_ident.as_str().into(),
                            ctxt: *ctxt,
                            export: export.clone(),
                            binding: binding_ident.clone(),
                        });
                        Some(binding_ident)
                    } else {
                        None
                    };
                    ImportedIdent::Module(imported_ident, value_binding)
                }
                None => ImportedIdent::Unresolvable,
            },
        };

        // Walk up from the binding towards the root, stopping at the innermost node kind we
        // know how to rewrite.
        let mut ast_path = self.ast_path;
        loop {
            match trie.get(ast_path) {
                // Shorthand properties get special treatment because we need to rewrite them to
                // normal key-value pairs.
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
                    // `ast_path` no longer names the trailing `Expr`, so it starts at the position
                    // the expression sits in.
                    let in_call =
                        match &imported_ident {
                            ImportedIdent::Module(..) => !self.keeps_namespace(maybe_uses_this),
                            // Only the module case builds an expression that could be called.
                            _ => false,
                        } && is_this_receiver_position(enclosing_position(trie.iter_rev(ast_path)));

                    visitors.push(create_visitor!(
                        exact,
                        trie,
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
                                ImportedIdent::Module(imported_ident, _) => {
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

        Ok(CodeGeneration::new(
            visitors,
            capture
                .map(ValueBindingCapture::into_hoisted_stmt)
                .into_iter()
                .collect(),
            vec![],
            vec![],
            vec![],
        ))
    }
}

/// A named export captured into a local value binding by a use site.
struct ValueBindingCapture {
    namespace_ident: RcStr,
    ctxt: Option<SyntaxContext>,
    export: RcStr,
    binding: Ident,
}

impl ValueBindingCapture {
    /// The hoisted `var <binding> = <namespace>["<export>"]` declaration.
    fn into_hoisted_stmt(self) -> CodeGenerationHoistedStmt {
        let namespace = Ident::new(
            self.namespace_ident.as_str().into(),
            DUMMY_SP,
            self.ctxt.unwrap_or_default(),
        );
        // Always a single declarator. Declarations reading the same namespace are combined later,
        // and only then is it known whether there are enough of them for a destructuring to be
        // worth it.
        let decl = VarDecl {
            span: DUMMY_SP,
            kind: VarDeclKind::Var,
            declare: false,
            ctxt: Default::default(),
            decls: vec![VarDeclarator {
                span: DUMMY_SP,
                name: Pat::Ident(self.binding.into()),
                init: Some(Box::new(Expr::Member(MemberExpr {
                    // `PURE_SP` emits a `/*#__PURE__*/` annotation, see `namespace_read_decl` in
                    // `lib.rs` and https://github.com/javascript-compiler-hints/compiler-notations-spec/issues/16.
                    span: PURE_SP,
                    obj: Box::new(Expr::Ident(namespace)),
                    prop: MemberProp::Computed(ComputedPropName {
                        span: DUMMY_SP,
                        expr: Box::new(Expr::Lit(Lit::Str(Str {
                            span: DUMMY_SP,
                            value: self.export.as_str().into(),
                            raw: None,
                        }))),
                    }),
                }))),
                definite: false,
            }],
        };

        // Keyed only by the namespace, so every declaration reading it merges into one statement,
        // including those from other use sites and sibling code gens: one source import can be
        // split into a separate reference per named export.
        CodeGenerationHoistedStmt::new(
            HoistedStmtKey::MergedValueBindings {
                namespace_ident: self.namespace_ident,
                ctxt: self.ctxt,
            },
            Stmt::Decl(Decl::Var(Box::new(decl))),
        )
    }
}

impl From<EsmBinding> for CodeGen {
    fn from(val: EsmBinding) -> Self {
        CodeGen::EsmBinding(val)
    }
}
