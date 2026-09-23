use auto_hash_map::AutoMap;
use rustc_hash::{FxBuildHasher, FxHashMap};
use smallvec::SmallVec;
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

/// The root of the walk, i.e. the program itself.
const ROOT: u32 = 0;

/// The modifiers to run, indexed for a single downward walk of the AST.
pub struct Visitors<'a> {
    /// Indexed by [`NodeId`]
    /// Maps kinds to indices in children and modifiers
    /// Traversal starts from `[ROOT]`
    /// This structure is a little memory intensive but the visitors are short lived.
    children: Vec<AutoMap<AstParentKind, u32, FxBuildHasher, 1>>,
    /// Modifiers to run at the nodes that have any. Rarely more than one per node, and only
    /// as many entries as there are code generation visitors.
    modifiers: AutoMap<u32, SmallVec<[&'a dyn AstModifier; 1]>, FxBuildHasher, 1>,
}

impl<'a> Visitors<'a> {
    /// Indexes `visitors` for the walk. Root paths are applied directly by the caller and
    /// are not accepted here.
    pub fn new(
        trie: &AstPathTrie,
        visitors: impl IntoIterator<Item = (AstPathId, &'a dyn AstModifier)>,
    ) -> Self {
        // The root always has a slot, so `ROOT` indexes in bounds even with no visitors.
        let mut this = Self {
            children: vec![AutoMap::default()],
            modifiers: Default::default(),
        };
        // Maps the trie's numbering onto the dense one. Only needed while building.
        let mut dense: FxHashMap<AstPathId, u32> = FxHashMap::default();

        for (id, visitor) in visitors {
            debug_assert!(
                !id.is_root(),
                "a root path should be applied as a root visitor, not matched by descent",
            );
            let node = this.intern(&mut dense, trie, id);
            this.modifiers.entry(node).or_default().push(visitor);
        }
        this
    }

    /// The dense id for `id`, linking it and any unlinked ancestors back to the root.
    ///
    /// Ascends to the nearest already-interned ancestor, giving each node it passes a slot.
    /// A slot does not depend on the parent's, so each step carries the node it just made
    /// and writes the edge into it as soon as the step above yields the parent. Paths can be
    /// very long, so this is iterative.
    fn intern(
        &mut self,
        dense: &mut FxHashMap<AstPathId, u32>,
        trie: &AstPathTrie,
        id: AstPathId,
    ) -> u32 {
        if let Some(&node) = dense.get(&id) {
            return node;
        }
        fn new_node(
            this: &mut Visitors<'_>,
            dense: &mut FxHashMap<AstPathId, u32>,
            id: AstPathId,
        ) -> u32 {
            let node = u32::try_from(this.children.len()).expect("too many visitor nodes");
            this.children.push(AutoMap::default());
            dense.insert(id, node);
            node
        }

        let interned = new_node(self, dense, id);
        // The node whose incoming edge has not been written yet, and where it sits.
        let mut child = interned;
        let mut current = id;

        loop {
            let (kind, parent) = trie
                .split_last(current)
                .expect("the root is interned up front and never reaches here");

            // Stop at the root or at an ancestor that is already linked; either way it is
            // `child`'s parent and nothing above it needs touching.
            let parent = if parent.is_root() {
                ROOT
            } else if let Some(&existing) = dense.get(&parent) {
                existing
            } else {
                let node = new_node(self, dense, parent);
                self.children[node as usize].insert(kind, child);
                child = node;
                current = parent;
                continue;
            };

            self.children[parent as usize].insert(kind, child);
            return interned;
        }
    }

    pub fn is_empty(&self) -> bool {
        self.modifiers.is_empty()
    }
}

/// Applies the modifiers in [`Visitors`] to the nodes they address.
///
/// Holds the indexed node matching the AST node being visited; each step looks up the child
/// for the kind the walk reports and recurses with it.
pub struct ApplyVisitors<'a, 'b> {
    visitors: &'b Visitors<'a>,
    current: u32,
    /// How far along `ast_path` `current` accounts for.
    index: usize,
}

impl<'a, 'b> ApplyVisitors<'a, 'b> {
    pub fn new(visitors: &'b Visitors<'a>) -> Self {
        Self {
            visitors,
            current: ROOT,
            index: 0,
        }
    }

    #[inline(never)]
    fn visit_if_required<N>(&mut self, n: &mut N, ast_path: &mut AstKindPath<AstParentKind>)
    where
        N: ModifiableAst + for<'aa, 'bb> VisitMutWithAstPath<ApplyVisitors<'aa, 'bb>>,
    {
        // The walk only reports a subset of node types, so `ast_path` may have grown by
        // several elements since the last call. Step down each of them.
        let mut current = self.current;
        for index in self.index..ast_path.len() {
            let Some(&child) = self.visitors.children[current as usize].get(&ast_path[index])
            else {
                // Nothing below here is addressed, so skip the whole subtree.
                return;
            };
            current = child;
        }

        let children = &self.visitors.children[current as usize];
        if !children.is_empty() {
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
        if let Some(modifiers) = self.visitors.modifiers.get(&current) {
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
    use crate::ast_path_trie::AstPathTrieBuilder;

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
        let mut builder = AstPathTrieBuilder::new();
        let id = builder.intern(path.iter().copied());
        let trie = builder.build();
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

            let mut builder = AstPathTrieBuilder::new();
            let id = builder.intern(seq_path());
            let trie = builder.build();
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
            let mut builder = AstPathTrieBuilder::new();
            let leaf = builder.intern(full.iter().copied());
            // Intern the ancestor too, so it exists in the trie but has no modifier.
            let _ancestor = builder.intern(full[..full.len() - 1].iter().copied());
            let trie = builder.build();

            let r = replacer("bar", "bar-success");
            let visitors = Visitors::new(&trie, [(leaf, &*r)]);
            let mut m = m.clone();
            m.visit_mut_with_ast_path(&mut ApplyVisitors::new(&visitors), &mut Default::default());

            assert_eq!(to_js(&m, &cm), r#"("foo","bar-success",["baz"]);"#);
            Ok(())
        })
        .unwrap();
    }

    /// With nothing to apply the walk still starts at the root, which must be addressable.
    #[test]
    fn empty_visitors_walk_cleanly() {
        run_test(false, |cm, _handler| {
            let fm = cm.new_source_file(FileName::Anon.into(), "('foo', 'bar', ['baz']);");
            let m = parse(&fm);

            let trie = AstPathTrieBuilder::new().build();
            let visitors = Visitors::new(&trie, []);
            assert!(visitors.is_empty());

            let mut m = m.clone();
            m.visit_mut_with_ast_path(&mut ApplyVisitors::new(&visitors), &mut Default::default());

            assert_eq!(to_js(&m, &cm), r#"("foo","bar",["baz"]);"#);
            Ok(())
        })
        .unwrap();
    }

    /// Two targets under a shared prefix: the common ancestors are interned once and both
    /// leaves stay reachable through them.
    #[test]
    fn applies_at_two_targets_sharing_a_prefix() {
        run_test(false, |cm, _handler| {
            let fm = cm.new_source_file(FileName::Anon.into(), "('foo', 'bar', 'baz');");
            let m = parse(&fm);

            // Same path, differing only in which element of the sequence it addresses.
            let path_to = |i: usize| {
                let mut path = seq_path();
                let n = path.len();
                path[n - 3] = AstParentKind::SeqExpr(SeqExprField::Exprs(i));
                path
            };

            let mut builder = AstPathTrieBuilder::new();
            let first = builder.intern(path_to(0));
            let second = builder.intern(path_to(2));
            let trie = builder.build();

            let foo = replacer("foo", "FOO");
            let baz = replacer("baz", "BAZ");
            let visitors = Visitors::new(&trie, [(first, &*foo), (second, &*baz)]);

            let mut m = m.clone();
            m.visit_mut_with_ast_path(&mut ApplyVisitors::new(&visitors), &mut Default::default());

            // Both applied; the untouched middle element proves the edges are distinct.
            assert_eq!(to_js(&m, &cm), r#"("FOO","bar","BAZ");"#);
            Ok(())
        })
        .unwrap();
    }

    /// The motivating case for interning iteratively: a left-leaning `a + b + c + ...`
    /// chain nests one level per term, so paths get very long. Recursing per element
    /// overflows the stack well before this depth.
    #[test]
    fn interns_a_very_deep_path() {
        const DEPTH: usize = 100_000;

        let mut builder = AstPathTrieBuilder::new();
        let mut path = vec![AstParentKind::Module(ModuleField::Body(0))];
        path.extend(
            std::iter::repeat_n(
                [
                    AstParentKind::Expr(ExprField::Bin),
                    AstParentKind::BinExpr(BinExprField::Left),
                ],
                DEPTH,
            )
            .flatten(),
        );
        let id = builder.intern(path.iter().copied());
        let trie = builder.build();

        let modifier = replacer("unused", "unused");
        let visitors = Visitors::new(&trie, [(id, &*modifier)]);
        assert!(!visitors.is_empty());
        // Every element of the path got a node, plus the root.
        assert_eq!(visitors.children.len(), path.len() + 1);
    }
}
