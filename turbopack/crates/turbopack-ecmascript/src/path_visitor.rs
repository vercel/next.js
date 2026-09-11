use rustc_hash::{FxHashMap, FxHashSet};
use swc_core::{
    common::pass::AstKindPath,
    ecma::{
        ast::*,
        visit::{AstParentKind, VisitMutAstPath, VisitMutWithAstPath},
    },
};

use crate::{
    ast_path_trie::{AstPathId, AstPathTrie},
    code_gen::{AstModifier, ModifiableAst},
};

/// The modifiers to run at each node of an [`AstPathTrie`], plus which subtrees are worth
/// descending into.
///
/// Built once per code generation pass. Paths are located by walking the trie alongside the
/// AST, so matching a node costs one hash lookup per level instead of a binary search over
/// a sorted list of full paths.
pub struct Visitors<'a> {
    trie: &'a AstPathTrie,
    /// Modifiers to apply at a node, for nodes that have any.
    at: FxHashMap<AstPathId, Vec<&'a dyn AstModifier>>,
    /// Nodes that lie on the path to some entry in `at`. A node in neither this nor `at`
    /// has no modifier below it, so its subtree is skipped.
    on_path_to: FxHashSet<AstPathId>,
}

impl<'a> Visitors<'a> {
    /// Indexes `visitors` by trie node. Paths that are empty (the program root) are not
    /// accepted here; those are applied directly by the caller.
    pub fn new(
        trie: &'a AstPathTrie,
        visitors: impl IntoIterator<Item = (AstPathId, &'a dyn AstModifier)>,
    ) -> Self {
        let mut at: FxHashMap<AstPathId, Vec<&'a dyn AstModifier>> = FxHashMap::default();
        let mut on_path_to: FxHashSet<AstPathId> = FxHashSet::default();
        for (id, visitor) in visitors {
            debug_assert!(
                !id.is_root(),
                "a root path should be applied as a root visitor, not matched by descent",
            );
            at.entry(id).or_default().push(visitor);
            // Mark the ancestors so the descent knows this subtree is worth entering.
            let mut current = trie.parent(id);
            while let Some(ancestor) = current {
                // Once an ancestor is marked, everything above it already is.
                if !on_path_to.insert(ancestor) {
                    break;
                }
                current = trie.parent(ancestor);
            }
        }
        Self {
            trie,
            at,
            on_path_to,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.at.is_empty()
    }
}

/// Applies the modifiers in [`Visitors`] to the nodes their paths point at.
///
/// Holds the trie node matching the AST node currently being visited; each visit step looks
/// up the child for the kind the AST walk reports and recurses with it.
pub struct ApplyVisitors<'a, 'b> {
    visitors: &'b Visitors<'a>,
    /// The trie node corresponding to the node being visited.
    current: AstPathId,
    /// How far along `ast_path` `current` accounts for.
    index: usize,
}

impl<'a, 'b> ApplyVisitors<'a, 'b> {
    pub fn new(visitors: &'b Visitors<'a>) -> Self {
        Self {
            visitors,
            current: AstPathId::ROOT,
            index: 0,
        }
    }

    #[inline(never)]
    fn visit_if_required<N>(&mut self, n: &mut N, ast_path: &mut AstKindPath<AstParentKind>)
    where
        N: ModifiableAst + for<'aa, 'bb> VisitMutWithAstPath<ApplyVisitors<'aa, 'bb>>,
    {
        // The AST walk only reports a subset of node types, so `ast_path` may have grown by
        // several elements since the last call. Step the trie down each of them.
        let mut current = self.current;
        for index in self.index..ast_path.len() {
            let Some(child) = self.visitors.trie.child(current, ast_path[index]) else {
                // No interned path goes through here, so nothing in this subtree matches.
                return;
            };
            current = child;
        }

        let modifiers = self.visitors.at.get(&current);
        let descend = self.visitors.on_path_to.contains(&current);

        if descend {
            n.visit_mut_children_with_ast_path(
                &mut ApplyVisitors {
                    visitors: self.visitors,
                    current,
                    index: ast_path.len(),
                },
                ast_path,
            );
        }

        // Modifiers run after descending, so a modifier that rewrites this node cannot
        // invalidate the paths of the nodes below it.
        if let Some(modifiers) = modifiers {
            for visitor in modifiers {
                n.modify(*visitor);
            }
        }
    }
}

macro_rules! method {
    ($name:ident, $T:ty) => {
        fn $name(&mut self, n: &mut $T, ast_path: &mut AstKindPath<AstParentKind>) {
            self.visit_if_required(n, ast_path);
        }
    };
}

impl VisitMutAstPath for ApplyVisitors<'_, '_> {
    // TODO: we need a macro to apply that for all methods
    method!(visit_mut_prop, Prop);
    method!(visit_mut_simple_assign_target, SimpleAssignTarget);
    method!(visit_mut_expr, Expr);
    method!(visit_mut_member_expr, MemberExpr);
    method!(visit_mut_pat, Pat);
    method!(visit_mut_stmt, Stmt);
    method!(visit_mut_module_decl, ModuleDecl);
    method!(visit_mut_module_item, ModuleItem);
    method!(visit_mut_call_expr, CallExpr);
    method!(visit_mut_lit, Lit);
    method!(visit_mut_str, Str);
    method!(visit_mut_block_stmt, BlockStmt);
    method!(visit_mut_function_body, FunctionBody);
    method!(visit_mut_switch_case, SwitchCase);
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use swc_core::{
        common::{FileName, Mark, SourceFile, SourceMap, errors::HANDLER},
        ecma::{
            ast::*,
            codegen::{Emitter, text_writer::JsWriter},
            parser::parse_file_as_module,
            transforms::base::resolver,
            visit::{AstParentKind, VisitMutWith, VisitMutWithAstPath, fields::*},
        },
        testing::run_test,
    };

    use super::{ApplyVisitors, AstModifier, Visitors};
    use crate::ast_path_trie::AstPathTrie;

    fn parse(fm: &SourceFile) -> Module {
        let mut m = parse_file_as_module(
            fm,
            Default::default(),
            EsVersion::latest(),
            None,
            &mut vec![],
        )
        .map_err(|err| HANDLER.with(|handler| err.into_diagnostic(handler).emit()))
        .unwrap();

        let unresolved_mark = Mark::new();
        let top_level_mark = Mark::new();
        m.visit_mut_with(&mut resolver(unresolved_mark, top_level_mark, false));

        m
    }

    struct StrReplacer<'a> {
        from: &'a str,
        to: &'a str,
    }

    impl AstModifier for StrReplacer<'_> {
        fn visit_mut_str(&self, s: &mut Str) {
            s.value = s.value.to_string_lossy().replace(self.from, self.to).into();
            s.raw = None;
        }
    }

    fn replacer(from: &'static str, to: &'static str) -> Box<dyn AstModifier + 'static> {
        Box::new(StrReplacer { from, to })
    }

    fn to_js(m: &Module, cm: &Arc<SourceMap>) -> String {
        let mut bytes = Vec::new();
        let mut emitter = Emitter {
            cfg: swc_core::ecma::codegen::Config::default().with_minify(true),
            cm: cm.clone(),
            comments: None,
            wr: JsWriter::new(cm.clone(), "\n", &mut bytes, None),
        };

        emitter.emit_module(m).unwrap();

        String::from_utf8(bytes).unwrap()
    }

    /// Interns `path` into a fresh trie and applies `modifier` at it.
    fn apply(m: &Module, path: &[AstParentKind], modifier: &dyn AstModifier) -> Module {
        let mut trie = AstPathTrie::new();
        let id = trie.intern(path);
        let visitors = Visitors::new(&trie, [(id, modifier)]);
        let mut m = m.clone();
        m.visit_mut_with_ast_path(&mut ApplyVisitors::new(&visitors), &mut Default::default());
        m
    }

    fn seq_path() -> Vec<AstParentKind> {
        vec![
            AstParentKind::Module(ModuleField::Body(0)),
            AstParentKind::ModuleItem(ModuleItemField::Stmt),
            AstParentKind::Stmt(StmtField::Expr),
            AstParentKind::ExprStmt(ExprStmtField::Expr),
            AstParentKind::Expr(ExprField::Paren),
            AstParentKind::ParenExpr(ParenExprField::Expr),
            AstParentKind::Expr(ExprField::Seq),
            AstParentKind::SeqExpr(SeqExprField::Exprs(1)),
            AstParentKind::Expr(ExprField::Lit),
            AstParentKind::Lit(LitField::Str),
        ]
    }

    #[test]
    fn path_visitor() {
        run_test(false, |cm, _handler| {
            let fm = cm.new_source_file(FileName::Anon.into(), "('foo', 'bar', ['baz']);");
            let m = parse(&fm);

            {
                let bar_replacer = replacer("bar", "bar-success");
                let m = apply(&m, &seq_path(), &*bar_replacer);
                assert_eq!(to_js(&m, &cm), r#"("foo","bar-success",["baz"]);"#);
            }

            {
                // A path missing an element addresses nothing, so nothing is rewritten.
                let mut wrong_path = seq_path();
                wrong_path.remove(4);
                let bar_replacer = replacer("bar", "bar-success");
                let m = apply(&m, &wrong_path, &*bar_replacer);
                assert!(!to_js(&m, &cm).contains("bar-success"));
            }

            drop(m);
            Ok(())
        })
        .unwrap();
    }

    /// Only the addressed node is modified, even when a sibling has the same node type.
    #[test]
    fn applies_only_at_the_addressed_node() {
        run_test(false, |cm, _handler| {
            let fm = cm.new_source_file(FileName::Anon.into(), "('a', 'a', 'a');");
            let m = parse(&fm);

            let mut path = seq_path();
            // Target the third element of the sequence rather than the second.
            path[7] = AstParentKind::SeqExpr(SeqExprField::Exprs(2));
            let r = replacer("a", "hit");
            let m = apply(&m, &path, &*r);

            assert_eq!(to_js(&m, &cm), r#"("a","a","hit");"#);
            Ok(())
        })
        .unwrap();
    }

    /// Several modifiers can address the same node; all of them run.
    #[test]
    fn applies_every_modifier_at_a_node() {
        run_test(false, |cm, _handler| {
            let fm = cm.new_source_file(FileName::Anon.into(), "('foo', 'bar', ['baz']);");
            let m = parse(&fm);

            let mut trie = AstPathTrie::new();
            let id = trie.intern(&seq_path());
            let first = replacer("bar", "one");
            let second = replacer("one", "two");
            let visitors = Visitors::new(&trie, [(id, &*first), (id, &*second)]);

            let mut m = m.clone();
            m.visit_mut_with_ast_path(&mut ApplyVisitors::new(&visitors), &mut Default::default());

            // Applied in order: "bar" -> "one" -> "two".
            assert_eq!(to_js(&m, &cm), r#"("foo","two",["baz"]);"#);
            Ok(())
        })
        .unwrap();
    }

    /// A path whose prefix is shared with a real target must not be treated as a target
    /// itself - descending past a node is not the same as matching it.
    #[test]
    fn does_not_modify_ancestors_of_a_target() {
        run_test(false, |cm, _handler| {
            let fm = cm.new_source_file(FileName::Anon.into(), "('foo', 'bar', ['baz']);");
            let m = parse(&fm);

            // Address the Str under the Lit; the Lit itself is only an ancestor.
            let full = seq_path();
            let mut trie = AstPathTrie::new();
            let leaf = trie.intern(&full);
            // Intern the ancestor too, so it exists in the trie but has no modifier.
            let _ancestor = trie.intern(&full[..full.len() - 1]);

            let r = replacer("bar", "bar-success");
            let visitors = Visitors::new(&trie, [(leaf, &*r)]);
            let mut m = m.clone();
            m.visit_mut_with_ast_path(&mut ApplyVisitors::new(&visitors), &mut Default::default());

            assert_eq!(to_js(&m, &cm), r#"("foo","bar-success",["baz"]);"#);
            Ok(())
        })
        .unwrap();
    }
}
