//! A compact, shared representation of [`AstParentKind`] paths.
//!
//! Code generation identifies the AST node it wants to patch by the path of
//! [`AstParentKind`]s leading to it from the program root. Stored flat, those paths are
//! quadratic in expression nesting depth: a left-leaning `a() + b() + c() + ...` chain of
//! `N` terms produces `N` paths of lengths `2, 4, ..., 2N`, because every additional term
//! nests one level deeper. Real-world generated code hits this — a 1200-term chain costs
//! ~35MB of paths for a single module.
//!
//! Those paths are also highly redundant: each one is a prefix of the next. This module
//! stores them as a trie instead, so shared prefixes are stored once. Each path is
//! referred to by an [`AstPathId`], and the chain in the example above collapses from
//! `O(N^2)` elements to `O(N)` nodes.
//!
//! Paths are added through [`AstPathTrieBuilder`], which holds the index needed to
//! deduplicate them, and it is then frozen into an immutable [`AstPathTrie`]. Only
//! requested paths are interned, so the trie stays sparse: it holds the handful of nodes
//! leading to code-generated locations, not every node in the file.

use std::collections::hash_map::Entry;

use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use swc_core::ecma::visit::AstParentKind;
use turbo_tasks::{NonLocalValue, trace::TraceRawVcs};

/// A reference to a path interned in an [`AstPathTrie`].
///
/// Only meaningful together with the trie that produced it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Encode, Decode)]
pub struct AstPathId(u32);

impl AstPathId {
    /// The empty path, i.e. the program root. Present in every trie without interning.
    pub const ROOT: AstPathId = AstPathId(0);

    pub fn is_root(self) -> bool {
        self == Self::ROOT
    }

    /// Index into the node list. The root is implicit, so ids are offset by one.
    fn index(self) -> usize {
        debug_assert!(!self.is_root(), "the root has no node");
        self.0 as usize - 1
    }
}

// `AstPathId` is a plain index, so it holds no `Vc`s to trace and is trivially non-local.
unsafe impl NonLocalValue for AstPathId {}
impl TraceRawVcs for AstPathId {
    fn trace_raw_vcs(&self, _trace_context: &mut turbo_tasks::trace::TraceRawVcsContext) {}
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Encode, Decode)]
struct Node {
    parent: AstPathId,
    #[bincode(with_serde)]
    kind: AstParentKind,
    /// Length of the path ending at this node, so `len()` doesn't have to walk to the root.
    depth: u32,
}

/// Accumulates [`AstParentKind`] paths, sharing their common prefixes.
///
/// Holds the child index that deduplicating requires; [`AstPathTrieBuilder::build`] drops
/// it and yields the immutable [`AstPathTrie`] that code generation reads.
#[derive(Debug, Default)]
pub struct AstPathTrieBuilder {
    nodes: Vec<Node>,
    /// Maps a node and a child kind to that child, so interning the same path twice yields
    /// the same id. Effects are processed out of AST order, so there is no walk position to
    /// extend and edges have to be looked up.
    edges: FxHashMap<(AstPathId, AstParentKind), AstPathId>,
}

impl AstPathTrieBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Interns a path, returning a handle to its last element.
    pub fn intern(&mut self, path: impl IntoIterator<Item = AstParentKind>) -> AstPathId {
        self.intern_from(AstPathId::ROOT, path)
    }

    /// Interns a path relative to `parent`, so a suffix can be appended to an
    /// already-interned prefix without copying or re-walking it.
    pub fn intern_from(
        &mut self,
        parent: AstPathId,
        path: impl IntoIterator<Item = AstParentKind>,
    ) -> AstPathId {
        let mut id = parent;
        for kind in path {
            id = self.push(id, kind);
        }
        id
    }

    /// Extends the path `parent` by one element.
    pub fn push(&mut self, parent: AstPathId, kind: AstParentKind) -> AstPathId {
        // Computed up front so the entry below doesn't hold a borrow across them; this is
        // the hot path of interning, so the key is hashed once rather than on both a
        // lookup and an insert.
        let depth = self.depth(parent) + 1;
        let next_id =
            AstPathId(u32::try_from(self.nodes.len() + 1).expect("too many ast path nodes"));

        match self.edges.entry((parent, kind)) {
            Entry::Occupied(entry) => *entry.get(),
            Entry::Vacant(entry) => {
                entry.insert(next_id);
                self.nodes.push(Node {
                    parent,
                    kind,
                    depth,
                });
                next_id
            }
        }
    }

    /// The path with its last element removed, or the root when already there.
    pub fn parent_or_root(&self, id: AstPathId) -> AstPathId {
        if id.is_root() {
            AstPathId::ROOT
        } else {
            self.nodes[id.index()].parent
        }
    }

    fn depth(&self, id: AstPathId) -> u32 {
        if id.is_root() {
            0
        } else {
            self.nodes[id.index()].depth
        }
    }

    /// Takes over an already-built trie, so ids minted against it stay valid.
    ///
    /// Must happen before anything is interned here.
    pub fn adopt(&mut self, trie: AstPathTrie) {
        debug_assert!(
            self.nodes.is_empty(),
            "adopting a trie would invalidate the paths already interned here",
        );
        self.edges = trie
            .nodes
            .iter()
            .enumerate()
            .map(|(index, node)| ((node.parent, node.kind), AstPathId(index as u32 + 1)))
            .collect();
        self.nodes = trie.nodes.into_vec();
    }

    /// Freezes the paths interned so far.
    pub fn build(self) -> AstPathTrie {
        AstPathTrie {
            nodes: self.nodes.into_boxed_slice(),
        }
    }

    /// The number of interned nodes, excluding the implicit root.
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }
}

/// An immutable arena of [`AstParentKind`] paths that share their common prefixes.
///
/// Built by [`AstPathTrieBuilder`] and read back via [`AstPathId`]. Node 0 is implicit and
/// represents the empty path, so every trie contains [`AstPathId::ROOT`].
#[derive(Debug, Default, Clone, PartialEq, Eq, Hash, Encode, Decode)]
pub struct AstPathTrie {
    nodes: Box<[Node]>,
}

unsafe impl NonLocalValue for AstPathTrie {}
impl TraceRawVcs for AstPathTrie {
    fn trace_raw_vcs(&self, _trace_context: &mut turbo_tasks::trace::TraceRawVcsContext) {}
}

impl AstPathTrie {
    fn node(&self, id: AstPathId) -> Option<&Node> {
        if id.is_root() {
            // `AstPathId::ROOT` is implicit and has no node.
            return None;
        }
        Some(self.nodes.get(id.index()).unwrap_or_else(|| {
            // An id only means anything against the trie that minted it. Reading one from a
            // different trie is a wiring bug, so say that rather than index out of bounds.
            panic!(
                "{id:?} does not belong to this trie ({} nodes); it was interned into a different \
                 one",
                self.nodes.len(),
            )
        }))
    }

    /// The number of elements in the path ending at `id`.
    pub fn len(&self, id: AstPathId) -> usize {
        self.node(id).map_or(0, |n| n.depth) as usize
    }

    /// The last element of the path, or `None` for the root.
    pub fn get(&self, id: AstPathId) -> Option<AstParentKind> {
        self.node(id).map(|n| n.kind)
    }

    /// The path with its last element removed, or `None` for the root.
    pub fn get_parent(&self, id: AstPathId) -> Option<AstPathId> {
        self.node(id).map(|n| n.parent)
    }

    /// The path with its last element removed, or the root when already there.
    pub fn parent_or_root(&self, id: AstPathId) -> AstPathId {
        self.get_parent(id).unwrap_or(AstPathId::ROOT)
    }

    /// Walks from `id` towards the root, yielding each element in reverse order.
    pub fn iter_rev(&self, id: AstPathId) -> impl Iterator<Item = AstParentKind> + '_ {
        let mut current = id;
        std::iter::from_fn(move || {
            let node = self.node(current)?;
            current = node.parent;
            Some(node.kind)
        })
    }

    /// The innermost ancestor of `id` (or `id` itself) whose last element matches `f`.
    ///
    /// Returns `None` when nothing up to the root matches. Callers wanting the node *above*
    /// the match can follow with [`AstPathTrie::parent_or_root`].
    pub fn find_last(
        &self,
        id: AstPathId,
        mut f: impl FnMut(&AstParentKind) -> bool,
    ) -> Option<AstPathId> {
        let mut current = id;
        while let Some(node) = self.node(current) {
            if f(&node.kind) {
                return Some(current);
            }
            current = node.parent;
        }
        None
    }

    /// Materializes the path as a flat vector, root first.
    ///
    /// Prefer the walking accessors where possible; this allocates and is `O(len)`.
    pub fn to_vec(&self, id: AstPathId) -> Vec<AstParentKind> {
        let mut path = Vec::with_capacity(self.len(id));
        path.extend(self.iter_rev(id));
        path.reverse();
        path
    }

    /// The number of interned nodes, excluding the implicit root.
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }
}

#[cfg(test)]
mod tests {
    use swc_core::ecma::visit::{
        AstParentKind,
        fields::{BinExprField, ExprField, ModuleField, ModuleItemField},
    };

    use super::*;

    fn expr_bin() -> AstParentKind {
        AstParentKind::Expr(ExprField::Bin)
    }
    fn bin_left() -> AstParentKind {
        AstParentKind::BinExpr(BinExprField::Left)
    }
    fn module_body(i: usize) -> AstParentKind {
        AstParentKind::Module(ModuleField::Body(i))
    }
    fn module_item() -> AstParentKind {
        AstParentKind::ModuleItem(ModuleItemField::Stmt)
    }

    /// Interns one path and freezes the trie.
    fn trie_of(path: &[AstParentKind]) -> (AstPathTrie, AstPathId) {
        let mut builder = AstPathTrieBuilder::new();
        let id = builder.intern(path.iter().copied());
        (builder.build(), id)
    }

    #[test]
    fn root_is_empty() {
        let trie = AstPathTrieBuilder::new().build();
        assert_eq!(trie.len(AstPathId::ROOT), 0);
        assert_eq!(trie.get(AstPathId::ROOT), None);
        assert_eq!(trie.get_parent(AstPathId::ROOT), None);
        assert_eq!(trie.to_vec(AstPathId::ROOT), vec![]);
        assert_eq!(trie.node_count(), 0);
    }

    #[test]
    fn roundtrips_a_path() {
        let path = vec![module_body(3), module_item(), expr_bin()];
        let (trie, id) = trie_of(&path);
        assert_eq!(trie.to_vec(id), path);
        assert_eq!(trie.len(id), 3);
        assert_eq!(trie.get(id), Some(expr_bin()));
    }

    #[test]
    fn interning_is_idempotent() {
        let mut builder = AstPathTrieBuilder::new();
        let path = [module_body(0), module_item()];
        assert_eq!(
            builder.intern(path.iter().copied()),
            builder.intern(path.iter().copied()),
        );
        assert_eq!(builder.node_count(), 2);
    }

    #[test]
    fn shares_prefixes() {
        let mut builder = AstPathTrieBuilder::new();
        let a = builder.intern([module_body(0), module_item(), expr_bin()]);
        let b = builder.intern([module_body(0), module_item(), bin_left()]);
        // The 2-element common prefix is stored once; only the last elements differ.
        assert_eq!(builder.node_count(), 4);
        let trie = builder.build();
        assert_eq!(trie.get_parent(a), trie.get_parent(b));
        assert_ne!(a, b);
    }

    #[test]
    fn distinct_indices_are_distinct_nodes() {
        let mut builder = AstPathTrieBuilder::new();
        let a = builder.intern([module_body(0)]);
        let b = builder.intern([module_body(1)]);
        assert_ne!(a, b, "Body(0) and Body(1) address different children");
    }

    /// Extending an interned prefix must not copy or re-walk it.
    #[test]
    fn interns_a_suffix_onto_a_prefix() {
        let mut builder = AstPathTrieBuilder::new();
        let prefix = builder.intern([module_body(0), module_item()]);
        let extended = builder.push(prefix, expr_bin());
        let via_full = builder.intern([module_body(0), module_item(), expr_bin()]);
        assert_eq!(extended, via_full, "both spellings address the same node");

        let from_iter = builder.intern_from(prefix, [expr_bin(), bin_left()]);
        let trie = builder.build();
        assert_eq!(
            trie.to_vec(from_iter),
            vec![module_body(0), module_item(), expr_bin(), bin_left()],
        );
    }

    /// The motivating case: a left-leaning `a + b + c + ...` chain. Flat storage is
    /// quadratic in the number of terms; the trie must stay linear.
    #[test]
    fn left_leaning_chain_is_linear() {
        const TERMS: usize = 500;
        let mut builder = AstPathTrieBuilder::new();

        // Build the spine, interning the path to each term as we descend.
        let mut spine = Vec::new();
        let mut flat_elements = 0;
        for _ in 0..TERMS {
            spine.push(expr_bin());
            spine.push(bin_left());
            builder.intern(spine.iter().copied());
            flat_elements += spine.len();
        }

        assert_eq!(builder.node_count(), TERMS * 2);
        assert_eq!(flat_elements, TERMS * (TERMS + 1));
        assert!(
            (builder.node_count() as f64) < (flat_elements as f64) / 100.0,
            "expected a large saving, got {} nodes for {flat_elements} elements",
            builder.node_count(),
        );
    }

    #[test]
    fn walks_up_from_a_leaf() {
        let (trie, id) = trie_of(&[module_body(0), module_item(), expr_bin()]);

        let parent = trie.get_parent(id).unwrap();
        assert_eq!(trie.to_vec(parent), vec![module_body(0), module_item()]);
        assert_eq!(
            trie.iter_rev(id).collect::<Vec<_>>(),
            vec![expr_bin(), module_item(), module_body(0)],
        );
    }

    #[test]
    fn finds_the_innermost_match() {
        let (trie, id) = trie_of(&[module_body(0), expr_bin(), bin_left(), bin_left()]);

        // The innermost `Expr`, skipping the two `BinExpr`s below it.
        let found = trie
            .find_last(id, |k| matches!(k, AstParentKind::Expr(_)))
            .unwrap();
        assert_eq!(trie.to_vec(found), vec![module_body(0), expr_bin()]);

        // `id` itself can be the match.
        assert_eq!(trie.find_last(id, |_| true), Some(id));
        // Nothing matches.
        assert_eq!(trie.find_last(id, |_| false), None);
    }

    /// Ids only mean anything against the trie that minted them, so a builder that adopts a
    /// trie must keep that trie's ids valid. This is the shape of the analyzer handing its
    /// paths to effect processing.
    #[test]
    fn adopted_trie_keeps_its_ids_valid() {
        let mut first = AstPathTrieBuilder::new();
        let a = first.intern([module_body(0), module_item()]);
        let b = first.intern([module_body(1), expr_bin(), bin_left()]);

        let mut second = AstPathTrieBuilder::new();
        second.adopt(first.build());
        let c = second.intern([module_body(2), module_item()]);
        let trie = second.build();

        assert_eq!(trie.to_vec(a), vec![module_body(0), module_item()]);
        assert_eq!(trie.to_vec(b), vec![module_body(1), expr_bin(), bin_left()]);
        assert_eq!(trie.to_vec(c), vec![module_body(2), module_item()]);
        assert_ne!(c, a);
        assert_ne!(c, b);
    }

    /// An adopted trie must still dedupe rather than appending a duplicate node.
    #[test]
    fn adopting_preserves_deduplication() {
        let mut first = AstPathTrieBuilder::new();
        let id = first.intern([module_body(0), module_item()]);
        let count = first.node_count();

        let mut second = AstPathTrieBuilder::new();
        second.adopt(first.build());
        assert_eq!(second.intern([module_body(0), module_item()]), id);
        assert_eq!(second.node_count(), count);
    }

    #[test]
    fn encodes_and_decodes() {
        let (trie, id) = trie_of(&[module_body(0), module_item(), expr_bin()]);

        let config = bincode::config::standard();
        let bytes = bincode::encode_to_vec(&trie, config).unwrap();
        let (decoded, _): (AstPathTrie, _) = bincode::decode_from_slice(&bytes, config).unwrap();

        assert_eq!(decoded, trie);
        assert_eq!(decoded.to_vec(id), trie.to_vec(id));
        assert_eq!(decoded.node_count(), trie.node_count());
    }
}
