use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::{DUMMY_SP, SyntaxContext, source_map::PURE_SP},
    ecma::{
        ast::{
            ComputedPropName, Decl, Expr, Ident, KeyValueProp, Lit, MemberExpr, MemberProp, Pat,
            Prop, PropName, SimpleAssignTarget, Stmt, Str, VarDecl, VarDeclKind, VarDeclarator,
        },
        visit::fields::{
            CalleeField, ForInStmtField, ForOfStmtField, OptCallField, PropField, TaggedTplField,
            UpdateExprField,
        },
    },
};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, NonLocalValue, ResolvedVc, Vc};
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    ScopeHoistingContext,
    ast_path_trie::{AstPathId, AstPathTrie},
    code_gen::{CodeGen, CodeGeneration, CodeGenerationHoistedStmt, HoistedStmtKey},
    create_visitor, magic_identifier,
    references::esm::{
        EsmAssetReference,
        base::{ReferencedAsset, ReferencedAssetIdent},
    },
};

#[derive(Hash, Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub struct EsmBinding {
    reference: ResolvedVc<EsmAssetReference>,
    export: Option<RcStr>,
    ast_path: AstPathId,
    caller_propagates_this: bool,
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
            caller_propagates_this: false,
        }
    }

    /// A binding using a namespace access such as `import * as ns from "m"; ns.f()`.
    ///
    /// Static analysis determines whether we can capture the import into a local or need to
    /// preserve the `ns` receiver to propagate `this`
    pub fn new_maybe_keep_this(
        reference: ResolvedVc<EsmAssetReference>,
        export: Option<RcStr>,
        ast_path: AstPathId,
        // The raw path, since the receiver question is about the position the member expression
        // sits in and the trie is not readable during analysis.
        raw_path: &[swc_core::ecma::visit::AstParentKind],
    ) -> Self {
        // `raw_path` ends at the namespace object inside the member expression
        // (`.., <enclosing>, Expr(Member), MemberExpr(Obj)`). Drop those two trailing entries so
        // the enclosing position is the last element.
        let enclosing = raw_path
            .len()
            .checked_sub(3)
            .and_then(|index| raw_path.get(index))
            .copied();
        let caller_propagates_this = is_this_receiver_position(enclosing);
        EsmBinding {
            reference,
            export,
            ast_path,
            caller_propagates_this,
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
        let mut captures = vec![];
        let imported_module = &self.reference.get_referenced_asset().await?;
        let export = self.export.clone();

        enum ImportedIdent {
            Module(ReferencedAssetIdent, Option<Ident>),
            None,
            /// Empty module (alias set to `false`): namespace imports resolve to `{}`.
            Empty,
            Unresolvable,
        }

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
                    // Capturing an import is only safe when it does not need the namespace as a
                    // call receiver. Source-level assignments to ESM imports are illegal, but SWC
                    // still parses them; retain namespace access for those assignment targets so
                    // assigning to the non-writable export continues to throw.
                    let value_binding =
                        if !propagates_this(self.caller_propagates_this, &imported_ident)
                            && let ReferencedAssetIdent::Module {
                                namespace_ident,
                                ctxt,
                                export: Some(export),
                                can_value_bind: true,
                                ..
                            } = &imported_ident
                            && !is_assignment_target(trie, self.ast_path)
                        {
                            // A unique name for the local binding
                            let binding_name = {
                                let imported_name = self.export.as_deref().unwrap_or(export);
                                magic_identifier::mangle(&format!(
                                    "imported binding {imported_name} {}",
                                    encode_hex(hash_xxh3_hash64((
                                        /* namespace */ namespace_ident,
                                        /* export */ export,
                                    )))
                                ))
                                .into()
                            };
                            let binding_ident = Ident::new(
                                binding_name,
                                DUMMY_SP,
                                // This is a synthetic local in the consuming module, not an export
                                // of the module whose syntax
                                // context the namespace accessor carries.
                                Default::default(),
                            );
                            captures.push(ValueBindingCapture {
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
                Some(swc_core::ecma::visit::AstParentKind::Expr(_)) => {
                    ast_path = trie.parent_or_root(ast_path);
                    // `ast_path` no longer names the trailing `Expr`, so it already describes the
                    // enclosing position that `is_this_receiver_position` inspects.
                    let in_call = match &imported_ident {
                        ImportedIdent::Module(imported_ident, _) => {
                            !propagates_this(self.caller_propagates_this, imported_ident)
                        }
                        _ => !self.caller_propagates_this,
                    } && is_this_receiver_position(trie.get(ast_path));

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
            value_binding_stmts(captures),
            vec![],
            vec![],
            vec![],
        ))
    }
}

/// The bindings captured from one namespace, as `(export name, local binding)` pairs.
type NamespaceBindings = Vec<(RcStr, Ident)>;

/// A named export captured into a local value binding by one or more use sites.
struct ValueBindingCapture {
    namespace_ident: RcStr,
    ctxt: Option<SyntaxContext>,
    export: RcStr,
    binding: Ident,
}

/// Builds the hoisted declarations for the value bindings captured from one import.
///
/// All captures that read the same namespace share a single declaration, so an import whose
/// bindings are each used once costs one declaration rather than one per binding.
fn value_binding_stmts(captures: Vec<ValueBindingCapture>) -> Vec<CodeGenerationHoistedStmt> {
    let mut buckets: FxIndexMap<(RcStr, Option<SyntaxContext>), NamespaceBindings> =
        FxIndexMap::default();
    for capture in captures {
        let members = buckets
            .entry((capture.namespace_ident, capture.ctxt))
            .or_default();
        // Several use sites of one binding capture it under the same name; declare it once.
        if !members
            .iter()
            .any(|(_, binding)| binding.sym == capture.binding.sym)
        {
            members.push((capture.export, capture.binding));
        }
    }

    buckets
        .into_iter()
        .map(|((namespace_ident, ctxt), members)| {
            let namespace = Ident::new(
                namespace_ident.as_str().into(),
                DUMMY_SP,
                ctxt.unwrap_or_default(),
            );
            // Always one declarator per binding. Declarations reading the same namespace are
            // combined later, and only then is it known whether there are enough of them for a
            // destructuring to be worth it.
            let decl = VarDecl {
                span: DUMMY_SP,
                kind: VarDeclKind::Var,
                declare: false,
                ctxt: Default::default(),
                decls: members
                    .into_iter()
                    .map(|(export, binding)| VarDeclarator {
                        span: DUMMY_SP,
                        name: Pat::Ident(binding.into()),
                        init: Some(Box::new(Expr::Member(MemberExpr {
                            // Marked pure so the declaration can be dropped when the binding is
                            // unused.
                            span: PURE_SP,
                            obj: Box::new(Expr::Ident(namespace.clone())),
                            prop: MemberProp::Computed(ComputedPropName {
                                span: DUMMY_SP,
                                expr: Box::new(Expr::Lit(Lit::Str(Str {
                                    span: DUMMY_SP,
                                    value: export.as_str().into(),
                                    raw: None,
                                }))),
                            }),
                        }))),
                        definite: false,
                    })
                    .collect(),
            };

            // Keyed only by the namespace, so every declaration reading it merges into one
            // statement — including those from sibling code gens, since one source import can be
            // split into a separate reference per named export.
            CodeGenerationHoistedStmt::new(
                HoistedStmtKey::ValueBindings {
                    namespace_ident,
                    ctxt,
                },
                Stmt::Decl(Decl::Var(Box::new(decl))),
            )
        })
        .collect()
}

/// Whether a member call has to keep the namespace as the `this` receiver.
///
/// Only calls need a receiver at all, and only a callee that could observe `this` cares which one
/// it gets.
fn propagates_this(is_member_call: bool, imported_ident: &ReferencedAssetIdent) -> bool {
    is_member_call
        && match imported_ident {
            ReferencedAssetIdent::Module {
                maybe_uses_this, ..
            } => *maybe_uses_this,
            ReferencedAssetIdent::LocalBinding { .. } => true,
        }
}

fn is_assignment_target(trie: &AstPathTrie, ast_path: AstPathId) -> bool {
    use swc_core::ecma::visit::AstParentKind;

    trie.iter_rev(ast_path).any(|parent| {
        matches!(
            parent,
            // `ns.a = 1`, and the target of a destructuring assignment.
            AstParentKind::SimpleAssignTarget(_)
                // `ns.a++` and `ns.a--` write back to the export just as an assignment does.
                | AstParentKind::UpdateExpr(UpdateExprField::Arg)
                // `for (ns.a in o)` and `for (ns.a of xs)` assign on every iteration.
                | AstParentKind::ForInStmt(ForInStmtField::Left)
                | AstParentKind::ForOfStmt(ForOfStmtField::Left)
        )
    })
}

/// Whether `parents` describes a position where the member expression is invoked with its object
/// as the `this` receiver, i.e. `ns.f()` or ``ns.f`...` ``.
///
/// `parents` must be the path of the enclosing node, with any trailing entries that describe the
/// member expression itself already removed. Both the `caller_propagates_this` decision made when
/// the binding is created and the `in_call` decision made during code generation go through this
/// function so the two can never disagree.
fn is_this_receiver_position(enclosing: Option<swc_core::ecma::visit::AstParentKind>) -> bool {
    use swc_core::ecma::visit::AstParentKind;

    matches!(
        enclosing,
        // `ns.f()` calls `f` with `ns` as the receiver.
        Some(AstParentKind::Callee(CalleeField::Expr))
            // `ns.f?.()` does too, when it calls at all.
            | Some(AstParentKind::OptCall(OptCallField::Callee))
            // ``ns.tag`...` `` also calls `tag` with `ns` as the receiver. `NewExpr::Callee` is
            // deliberately absent: `new ns.C()` does not pass `ns` as `this`.
            | Some(AstParentKind::TaggedTpl(TaggedTplField::Tag))
    )
}

impl From<EsmBinding> for CodeGen {
    fn from(val: EsmBinding) -> Self {
        CodeGen::EsmBinding(val)
    }
}
