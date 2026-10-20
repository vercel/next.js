use bincode::{Decode, Encode};
use swc_core::ecma::{
    ast::UnaryOp,
    visit::{
        AstParentKind, AstParentNodeRef,
        fields::{
            CalleeField, ExprField, MemberExprField, OptCallField, ParenExprField, PatField,
            TaggedTplField, UnaryExprField, UpdateExprField,
        },
    },
};
use turbo_tasks::NonLocalValue;

/// How a namespace member access such as `ns.f` is used, which decides whether it can read a
/// captured local or has to keep going through the namespace.
///
/// Decided during analysis from the position of the access, see [`Self::of_member_access`].
/// Whether a call needs the namespace also depends on the export, which is only known during code
/// generation.
#[derive(Hash, Clone, Copy, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub enum NamespaceAccess {
    /// A plain read. It can use a captured local.
    Read,
    /// `ns.f()`, which calls `f` with `ns` as the receiver. The namespace is kept when `f` may
    /// observe `this`.
    Call,
    /// `ns.f = …` and similar. Source-level writes to ESM imports are illegal, but SWC still parses
    /// them. The write has to reach the namespace so that writing to the read-only export still
    /// throws, rather than silently writing to a local.
    ///
    /// Also `delete ns.f`: `delete <identifier>` is a syntax error in strict code, so a captured
    /// operand would break the whole chunk.
    Write,
}

impl NamespaceAccess {
    /// Classifies a namespace member access from its path, which ends at the namespace object
    /// inside the member expression (`.., MemberExpr(Obj)`).
    ///
    /// The path holds the nodes rather than just their kinds, so that the operator of an enclosing
    /// unary expression can be told apart: `delete ns.f` writes, `typeof ns.f` reads.
    pub fn of_member_access(path: &[AstParentNodeRef<'_>]) -> Self {
        let mut parents = path.iter().rev();
        debug_assert_eq!(
            parents.next().map(|parent| parent.kind()),
            Some(AstParentKind::MemberExpr(MemberExprField::Obj)),
            "a namespace member access path must end at the member expression's object"
        );
        // Above that is the member expression itself.
        match parents.next().map(|parent| parent.kind()) {
            // `ns.a = 1`, where the member expression is the assignment target itself.
            Some(AstParentKind::SimpleAssignTarget(_)) => return NamespaceAccess::Write,
            // `ns?.f`: an `OptChainBase(Member)` inside `OptChainExpr(Base)` inside
            // `Expr(OptChain)`.
            Some(AstParentKind::OptChainBase(_)) => {
                parents.next();
                parents.next();
            }
            // `Expr(Member)`
            _ => {}
        }
        NamespaceAccess::of_position(parents.find(|parent| !is_parenthesized(parent.kind())))
    }

    /// Classifies the position a namespace member access sits in, with parentheses already looked
    /// through.
    fn of_position(enclosing: Option<&AstParentNodeRef<'_>>) -> Self {
        if is_this_receiver_position(enclosing.map(|parent| parent.kind())) {
            return NamespaceAccess::Call;
        }
        match enclosing {
            // `(ns.a) = 1`
            Some(AstParentNodeRef::SimpleAssignTarget(..))
            // `ns.a++` and `ns.a--` write back to the export just as an assignment does.
            | Some(AstParentNodeRef::UpdateExpr(_, UpdateExprField::Arg))
            // An expression in a pattern is a write target: destructuring assignments like
            // `[ns.a] = v`, `({ k: ns.a } = o)` and `[...ns.a] = v`, and `for (ns.a of xs)`.
            | Some(AstParentNodeRef::Pat(_, PatField::Expr)) => NamespaceAccess::Write,
            // `delete ns.a`, see `NamespaceAccess::Write`. Every other unary operator reads.
            Some(AstParentNodeRef::UnaryExpr(unary, UnaryExprField::Arg))
                if unary.op == UnaryOp::Delete =>
            {
                NamespaceAccess::Write
            }
            _ => NamespaceAccess::Read,
        }
    }

    /// Whether the access has to go through the namespace rather than a captured local, given
    /// whether calling the export could observe `this`.
    pub fn keeps_namespace(self, maybe_uses_this: bool) -> bool {
        match self {
            NamespaceAccess::Read => false,
            NamespaceAccess::Write => true,
            NamespaceAccess::Call => maybe_uses_this,
        }
    }
}

/// The position an expression is used in, looking through parentheses.
///
/// `parents` walks outwards from the position the expression sits in. Parentheses do not change
/// what an expression is: `(ns.f)()` still calls `f` with `ns` as the receiver, and `(ns.a) = 1`
/// still writes to `ns.a`.
pub fn enclosing_position(parents: impl Iterator<Item = AstParentKind>) -> Option<AstParentKind> {
    parents
        .into_iter()
        .find(|&parent| !is_parenthesized(parent))
}

/// Whether `parent` is one of the two path entries a parenthesized expression adds.
fn is_parenthesized(parent: AstParentKind) -> bool {
    matches!(
        parent,
        AstParentKind::ParenExpr(ParenExprField::Expr) | AstParentKind::Expr(ExprField::Paren)
    )
}

/// Whether `enclosing` is a position where the member expression is invoked with its object as
/// the `this` receiver, i.e. `ns.f()` or ``ns.f`...` ``.
///
/// Both the [`NamespaceAccess`] decided during analysis and the decision during code generation of
/// whether to call through `(0, …)` go through this function, so the two can never disagree.
pub fn is_this_receiver_position(enclosing: Option<AstParentKind>) -> bool {
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
    /// The path is passed the way the analyzer passes it for a namespace member effect: the path to
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
                    self.0.push(NamespaceAccess::of_member_access(
                        &ast_path[..ast_path.len() - 1],
                    ));
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
    // `delete` removes the property, so it has to reach the namespace. Every other unary operator
    // only reads its operand.
    #[case::unary_delete("delete ns.a", &[Write])]
    #[case::unary_parenthesized_delete("delete (ns.a)", &[Write])]
    #[case::unary_typeof("typeof ns.a", &[Read])]
    #[case::unary_not("!ns.a", &[Read])]
    #[case::unary_void("void ns.a", &[Read])]
    #[case::unary_minus("-ns.a", &[Read])]
    fn classifies_namespace_access(#[case] source: &str, #[case] expected: &[NamespaceAccess]) {
        assert_eq!(classify(source), expected);
    }
}
