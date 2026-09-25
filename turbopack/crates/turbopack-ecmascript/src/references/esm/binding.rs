use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::{DUMMY_SP, SyntaxContext, source_map::PURE_SP},
    ecma::{
        ast::{
            ComputedPropName, Decl, Expr, Ident, KeyValueProp, Lit, MemberExpr, MemberProp, Pat,
            Prop, PropName, SimpleAssignTarget, Stmt, Str, VarDecl, VarDeclKind, VarDeclarator,
        },
        visit::{
            AstParentKind,
            fields::{
                CalleeField, ExprField, OptCallField, ParenExprField, PatField, PropField,
                TaggedTplField, UnaryExprField, UpdateExprField,
            },
        },
    },
};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, Vc};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    ScopeHoistingContext,
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
    namespace_access: NamespaceAccess,
}

/// How a namespace member access such as `ns.f` is used, which decides whether it can read a
/// captured local or has to keep going through the namespace.
///
/// Decided during analysis from the position of the access. Whether a call needs the namespace
/// also depends on the export, which is only known during code generation.
#[derive(Hash, Clone, Copy, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
enum NamespaceAccess {
    /// A plain read, or not a namespace member access at all. It can use a captured local.
    Read,
    /// `ns.f()`, which calls `f` with `ns` as the receiver. The namespace is kept when `f` may
    /// observe `this`.
    Call,
    /// `ns.f = …` and similar. Source-level writes to ESM imports are illegal, but SWC still parses
    /// them. The write has to reach the namespace so that writing to the read-only export still
    /// throws, rather than silently writing to a local.
    ///
    /// Also any unary operand, for the sake of `delete ns.f`: `delete <identifier>` is a syntax
    /// error in strict code, so a captured operand would break the whole chunk. The path does not
    /// say which operator it is, and the other unary operators are not worth telling apart.
    Write,
}

impl NamespaceAccess {
    /// Classifies a namespace member access from its path, which ends at the namespace object
    /// inside the member expression (`.., MemberExpr(Obj)`).
    fn of_member_path(raw_path: &[AstParentKind]) -> Self {
        let mut parents = raw_path.iter().rev().copied();
        parents.next();
        // Above that is the member expression itself.
        match parents.next() {
            // `ns.a = 1`, where the member expression is the assignment target itself.
            Some(AstParentKind::SimpleAssignTarget(_)) => NamespaceAccess::Write,
            // `ns?.f`: an `OptChainBase(Member)` inside `OptChainExpr(Base)` inside
            // `Expr(OptChain)`.
            Some(AstParentKind::OptChainBase(_)) => {
                parents.next();
                parents.next();
                NamespaceAccess::of_position(enclosing_position(parents))
            }
            // `Expr(Member)`
            _ => NamespaceAccess::of_position(enclosing_position(parents)),
        }
    }

    /// Classifies the position a namespace member access sits in, from [`enclosing_position`].
    fn of_position(enclosing: Option<AstParentKind>) -> Self {
        if is_this_receiver_position(enclosing) {
            return NamespaceAccess::Call;
        }
        match enclosing {
            // `(ns.a) = 1`
            Some(AstParentKind::SimpleAssignTarget(_))
            // `ns.a++` and `ns.a--` write back to the export just as an assignment does.
            | Some(AstParentKind::UpdateExpr(UpdateExprField::Arg))
            // An expression in a pattern is a write target: destructuring assignments like
            // `[ns.a] = v`, `({ k: ns.a } = o)` and `[...ns.a] = v`, and `for (ns.a of xs)`.
            | Some(AstParentKind::Pat(PatField::Expr))
            // `delete ns.a`, see `NamespaceAccess::Write`.
            | Some(AstParentKind::UnaryExpr(UnaryExprField::Arg)) => NamespaceAccess::Write,
            _ => NamespaceAccess::Read,
        }
    }

    /// Whether the access has to go through the namespace rather than a captured local, given
    /// whether calling the export could observe `this`.
    fn keeps_namespace(self, maybe_uses_this: bool) -> bool {
        match self {
            NamespaceAccess::Read => false,
            NamespaceAccess::Write => true,
            NamespaceAccess::Call => maybe_uses_this,
        }
    }
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
            namespace_access: NamespaceAccess::Read,
        }
    }

    /// A binding using a namespace member access such as `import * as ns from "m"; ns.f`.
    ///
    /// Whether the access can read a captured local or has to keep going through `ns` depends on
    /// how it is used, see [`NamespaceAccess`].
    pub fn new_maybe_keep_namespace(
        reference: ResolvedVc<EsmAssetReference>,
        export: Option<RcStr>,
        ast_path: AstPathId,
        // The raw path, since the question is about the position the member expression sits in
        // and the trie is not readable during analysis.
        raw_path: &[AstParentKind],
    ) -> Self {
        EsmBinding {
            reference,
            export,
            ast_path,
            namespace_access: NamespaceAccess::of_member_path(raw_path),
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
                        _ if self.namespace_access == NamespaceAccess::Write => None,
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
                                **asset,
                                **module,
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
                    let value_binding = if !self.namespace_access.keeps_namespace(maybe_uses_this)
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
                            ImportedIdent::Module(..) => {
                                !self.namespace_access.keeps_namespace(maybe_uses_this)
                            }
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
                    // Marked pure so the declaration can be dropped when the binding is unused.
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
            HoistedStmtKey::ValueBindings {
                namespace_ident: self.namespace_ident,
                ctxt: self.ctxt,
            },
            Stmt::Decl(Decl::Var(Box::new(decl))),
        )
    }
}

/// The position an expression is used in, looking through parentheses.
///
/// `parents` walks outwards from the position the expression sits in. Parentheses do not change
/// what an expression is: `(ns.f)()` still calls `f` with `ns` as the receiver, and `(ns.a) = 1`
/// still writes to `ns.a`.
fn enclosing_position(parents: impl Iterator<Item = AstParentKind>) -> Option<AstParentKind> {
    parents.into_iter().find(|parent| {
        !matches!(
            parent,
            AstParentKind::ParenExpr(ParenExprField::Expr) | AstParentKind::Expr(ExprField::Paren)
        )
    })
}

/// Whether `enclosing` is a position where the member expression is invoked with its object as
/// the `this` receiver, i.e. `ns.f()` or ``ns.f`...` ``.
///
/// `enclosing` comes from [`enclosing_position`]. Both the [`NamespaceAccess`] decided when the
/// binding is created and the `in_call` decision made during code generation go through both
/// functions so the two can never disagree.
fn is_this_receiver_position(enclosing: Option<AstParentKind>) -> bool {
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

#[cfg(test)]
mod tests {
    use rstest::rstest;
    use swc_core::{
        common::{FileName, SourceMap, pass::AstNodePath},
        ecma::{
            ast::{EsVersion, Ident},
            parser::parse_file_as_module,
            visit::{
                AstParentKind, AstParentNodeRef, VisitAstPath, VisitWithAstPath,
                fields::MemberExprField,
            },
        },
    };

    use super::NamespaceAccess::{self, Call, Read, Write};

    /// Classifies every `ns.<member>` access in `source`, in source order.
    ///
    /// The path is built the way the analyzer builds it for a namespace member effect: the path to
    /// the `ns` identifier with its last entry dropped, so it ends at `MemberExpr(Obj)`.
    fn classify(source: &str) -> Vec<NamespaceAccess> {
        struct Finder(Vec<NamespaceAccess>);

        impl VisitAstPath for Finder {
            fn visit_ident<'ast: 'r, 'r>(
                &mut self,
                ident: &'ast Ident,
                ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
            ) {
                let kinds = ast_path.kinds();
                // Only `ns` as the object of a member expression becomes a namespace member
                // effect, see `member_access_parent` in the analyzer.
                if &*ident.sym == "ns"
                    && let Some(member_index) = kinds.len().checked_sub(2)
                    && kinds[member_index] == AstParentKind::MemberExpr(MemberExprField::Obj)
                {
                    self.0
                        .push(NamespaceAccess::of_member_path(&kinds[..kinds.len() - 1]));
                }
            }
        }

        let source_map = SourceMap::default();
        let file = source_map.new_source_file(FileName::Anon.into(), source.to_string());
        let module = parse_file_as_module(
            &file,
            Default::default(),
            EsVersion::latest(),
            None,
            &mut vec![],
        )
        .unwrap_or_else(|err| panic!("failed to parse {source:?}: {err:?}"));
        let mut finder = Finder(Vec::new());
        module.visit_with_ast_path(&mut finder, &mut Default::default());
        finder.0
    }

    #[rstest]
    // Reads.
    #[case::read("ns.a", &[Read])]
    #[case::read_assigned("x = ns.a", &[Read])]
    #[case::read_argument("f(ns.a)", &[Read])]
    #[case::read_template("`${ns.a}`", &[Read])]
    #[case::read_condition("x = ns.a ? 1 : 2", &[Read])]
    #[case::read_array_literal("[ns.a]", &[Read])]
    #[case::read_object_literal("({ k: ns.a })", &[Read])]
    // `new` does not pass `ns` as `this`.
    #[case::read_new("new ns.C()", &[Read])]
    // An indirect call drops the receiver.
    #[case::read_indirect_call("(0, ns.f)()", &[Read])]
    // The receiver of the call is `ns.a`, not `ns`.
    #[case::read_nested_member_call("ns.a.b()", &[Read])]
    // Writing a property of the export, or using it as a key, is not a write to it.
    #[case::read_property_write("ns.a.b = 1", &[Read])]
    #[case::read_computed_key_write("obj[ns.a] = 1", &[Read])]
    // A default value in a pattern is read, not written.
    #[case::read_array_pattern_default("[x = ns.a] = arr", &[Read])]
    #[case::read_object_pattern_default("({ k: x = ns.a } = obj)", &[Read])]
    // Only what is iterated over, not the loop head.
    #[case::read_for_of_iterable("for (x of ns.a);", &[Read])]
    // Calls that pass `ns` as the receiver.
    #[case::call("ns.f()", &[Call])]
    #[case::call_optional("ns.f?.()", &[Call])]
    // `ns` cannot be nullish, so this calls `f` with `ns` as the receiver.
    #[case::call_optional_namespace("ns?.f()", &[Call])]
    // Parentheses keep `ns.f` a reference.
    #[case::call_parenthesized("(ns.f)()", &[Call])]
    #[case::call_double_parenthesized("((ns.f))()", &[Call])]
    #[case::call_tagged_template("ns.tag`x`", &[Call])]
    #[case::call_with_read_argument("ns.f(ns.a)", &[Call, Read])]
    // Writes to the export itself.
    #[case::write("ns.a = 1", &[Write])]
    #[case::write_compound("ns.a += 1", &[Write])]
    #[case::write_logical("ns.a ??= 1", &[Write])]
    #[case::write_postfix_update("ns.a++", &[Write])]
    #[case::write_prefix_update("--ns.a", &[Write])]
    #[case::write_parenthesized("(ns.a) = 1", &[Write])]
    #[case::write_array_pattern("[ns.a] = arr", &[Write])]
    #[case::write_rest_pattern("[...ns.a] = arr", &[Write])]
    #[case::write_pattern_with_default("[ns.a = 1] = arr", &[Write])]
    #[case::write_object_pattern("({ k: ns.a } = obj)", &[Write])]
    #[case::write_for_of_head("for (ns.a of xs);", &[Write])]
    #[case::write_for_in_head("for (ns.a in obj);", &[Write])]
    #[case::write_from_read("ns.a = ns.b", &[Write, Read])]
    // Any unary operand, since the path does not say whether the operator is `delete`.
    #[case::unary_delete("delete ns.a", &[Write])]
    #[case::unary_parenthesized_delete("delete (ns.a)", &[Write])]
    #[case::unary_typeof("typeof ns.a", &[Write])]
    #[case::unary_not("!ns.a", &[Write])]
    #[case::unary_void("void ns.a", &[Write])]
    fn classifies_namespace_access(#[case] source: &str, #[case] expected: &[NamespaceAccess]) {
        assert_eq!(classify(source), expected);
    }
}
