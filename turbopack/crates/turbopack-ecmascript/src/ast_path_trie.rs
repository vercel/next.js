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
//! referred to by a [`AstPathId`], and the chain in the example above collapses from
//! `O(N^2)` elements to `O(N)` nodes.
//!
//! The trie is built lazily by interning only the paths that are actually requested, so it
//! stays sparse: it holds the handful of nodes leading to code-generated locations, not
//! every node in the file.

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

/// An arena of [`AstParentKind`] paths that share their common prefixes.
///
/// Paths are added with [`AstPathTrie::intern`] and read back via [`AstPathId`]. Node 0 is
/// implicit and represents the empty path, so a default trie already holds
/// [`AstPathId::ROOT`].
#[derive(Debug, Default, Clone, Encode)]
pub struct AstPathTrie {
    /// Indexed by `AstPathId`, minus one: `AstPathId::ROOT` has no entry.
    nodes: Vec<Node>,
    /// Deduplicates children so that interning is idempotent. Effects are processed out of
    /// AST order, so we can't rely on a walk position and have to look edges up.
    ///
    /// Derived from `nodes`, so it is neither serialized nor compared.
    #[bincode(skip)]
    edges: FxHashMap<(AstPathId, AstParentKind), AstPathId>,
}

impl<C> Decode<C> for AstPathTrie {
    fn decode<D: bincode::de::Decoder<Context = C>>(
        decoder: &mut D,
    ) -> Result<Self, bincode::error::DecodeError> {
        Ok(Self::from_nodes(Vec::<Node>::decode(decoder)?))
    }
}
bincode::impl_borrow_decode!(AstPathTrie);

// `edges` is a derived index, so identity is decided by `nodes` alone.
impl PartialEq for AstPathTrie {
    fn eq(&self, other: &Self) -> bool {
        self.nodes == other.nodes
    }
}
impl Eq for AstPathTrie {}

impl std::hash::Hash for AstPathTrie {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.nodes.hash(state);
    }
}

unsafe impl NonLocalValue for AstPathTrie {}
impl TraceRawVcs for AstPathTrie {
    fn trace_raw_vcs(&self, _trace_context: &mut turbo_tasks::trace::TraceRawVcsContext) {}
}

impl AstPathTrie {
    pub fn new() -> Self {
        Self::default()
    }

    /// Rebuilds the derived edge index from a node list (used when decoding).
    fn from_nodes(nodes: Vec<Node>) -> Self {
        let mut edges = FxHashMap::with_capacity_and_hasher(nodes.len(), rustc_hash::FxBuildHasher);
        for (index, node) in nodes.iter().enumerate() {
            edges.insert((node.parent, node.kind), AstPathId(index as u32 + 1));
        }
        Self { nodes, edges }
    }

    /// Interns `path`, returning a handle to its last element.
    ///
    /// Interning the same path twice returns the same id.
    pub fn intern(&mut self, path: &[AstParentKind]) -> AstPathId {
        let mut id = AstPathId::ROOT;
        for &kind in path {
            id = self.push(id, kind);
        }
        id
    }

    /// Extends the path `parent` by one element, as [`AstPathId`] of the result.
    pub fn push(&mut self, parent: AstPathId, kind: AstParentKind) -> AstPathId {
        if let Some(&existing) = self.edges.get(&(parent, kind)) {
            return existing;
        }
        let depth = self.depth(parent) + 1;
        let id = AstPathId(u32::try_from(self.nodes.len() + 1).expect("too many ast path nodes"));
        self.nodes.push(Node {
            parent,
            kind,
            depth,
        });
        self.edges.insert((parent, kind), id);
        id
    }

    fn node(&self, id: AstPathId) -> Option<&Node> {
        if id.is_root() {
            // `AstPathId::ROOT` is implicit and has no node.
            return None;
        }
        let index = id.0 as usize - 1;
        Some(self.nodes.get(index).unwrap_or_else(|| {
            // An id only means anything against the trie that minted it. Reading one from
            // a different trie is a wiring bug, so say that rather than index out of bounds.
            panic!(
                "{id:?} does not belong to this trie ({} nodes); an AstPath was interned into a \
                 different one",
                self.nodes.len(),
            )
        }))
    }

    /// The number of elements in the path ending at `id`.
    pub fn len(&self, id: AstPathId) -> usize {
        self.depth(id) as usize
    }

    fn depth(&self, id: AstPathId) -> u32 {
        self.node(id).map_or(0, |n| n.depth)
    }

    /// The last element of the path, or `None` for the root.
    pub fn last(&self, id: AstPathId) -> Option<AstParentKind> {
        self.node(id).map(|n| n.kind)
    }

    /// The path with its last element removed, or `None` for the root.
    pub fn parent(&self, id: AstPathId) -> Option<AstPathId> {
        self.node(id).map(|n| n.parent)
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

    /// Materializes the path as a flat vector, root first.
    ///
    /// Prefer the walking accessors where possible; this allocates and is `O(len)`.
    pub fn to_vec(&self, id: AstPathId) -> Vec<AstParentKind> {
        let mut path: Vec<AstParentKind> = self.iter_rev(id).collect();
        path.reverse();
        path
    }

    /// Drops elements from the end of the path while `f` returns true.
    ///
    /// Returns the first path whose last element doesn't match, or the root.
    pub fn trim_end_while(
        &self,
        mut id: AstPathId,
        mut f: impl FnMut(&AstParentKind) -> bool,
    ) -> AstPathId {
        while let Some(node) = self.node(id) {
            if !f(&node.kind) {
                break;
            }
            id = node.parent;
        }
        id
    }

    /// The path with its last element removed, as an [`AstPathId`]. Returns the root when
    /// already at the root.
    pub fn parent_or_root(&self, id: AstPathId) -> AstPathId {
        self.parent(id).unwrap_or(AstPathId::ROOT)
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

    #[test]
    fn root_is_empty() {
        let trie = AstPathTrie::new();
        assert_eq!(trie.len(AstPathId::ROOT), 0);
        assert_eq!(trie.last(AstPathId::ROOT), None);
        assert_eq!(trie.parent(AstPathId::ROOT), None);
        assert_eq!(trie.to_vec(AstPathId::ROOT), vec![]);
        assert_eq!(trie.node_count(), 0);
    }

    #[test]
    fn roundtrips_a_path() {
        let mut trie = AstPathTrie::new();
        let path = vec![module_body(3), module_item(), expr_bin()];
        let id = trie.intern(&path);
        assert_eq!(trie.to_vec(id), path);
        assert_eq!(trie.len(id), 3);
        assert_eq!(trie.last(id), Some(expr_bin()));
    }

    #[test]
    fn interning_is_idempotent() {
        let mut trie = AstPathTrie::new();
        let path = vec![module_body(0), module_item()];
        assert_eq!(trie.intern(&path), trie.intern(&path));
        assert_eq!(trie.node_count(), 2);
    }

    #[test]
    fn shares_prefixes() {
        let mut trie = AstPathTrie::new();
        let a = trie.intern(&[module_body(0), module_item(), expr_bin()]);
        let b = trie.intern(&[module_body(0), module_item(), bin_left()]);
        // The 2-element common prefix is stored once; only the last elements differ.
        assert_eq!(trie.node_count(), 4);
        assert_eq!(trie.parent(a), trie.parent(b));
        assert_ne!(a, b);
    }

    #[test]
    fn distinct_indices_are_distinct_nodes() {
        let mut trie = AstPathTrie::new();
        let a = trie.intern(&[module_body(0)]);
        let b = trie.intern(&[module_body(1)]);
        assert_ne!(a, b, "Body(0) and Body(1) address different children");
    }

    /// The motivating case: a left-leaning `a + b + c + ...` chain. Flat storage is
    /// quadratic in the number of terms; the trie must stay linear.
    #[test]
    fn left_leaning_chain_is_linear() {
        const TERMS: usize = 500;
        let mut trie = AstPathTrie::new();

        // Build the spine, interning the path to each term as we descend.
        let mut spine = Vec::new();
        let mut flat_elements = 0;
        for _ in 0..TERMS {
            spine.push(expr_bin());
            spine.push(bin_left());
            trie.intern(&spine);
            flat_elements += spine.len();
        }

        assert_eq!(trie.node_count(), TERMS * 2);
        assert_eq!(flat_elements, TERMS * (TERMS + 1));
        assert!(
            (trie.node_count() as f64) < (flat_elements as f64) / 100.0,
            "expected a large saving, got {} nodes for {flat_elements} elements",
            trie.node_count(),
        );
    }

    #[test]
    fn walks_up_from_a_leaf() {
        let mut trie = AstPathTrie::new();
        let id = trie.intern(&[module_body(0), module_item(), expr_bin()]);

        let parent = trie.parent(id).unwrap();
        assert_eq!(trie.to_vec(parent), vec![module_body(0), module_item()]);
        assert_eq!(
            trie.iter_rev(id).collect::<Vec<_>>(),
            vec![expr_bin(), module_item(), module_body(0)],
        );
    }

    #[test]
    fn trims_matching_suffix() {
        let mut trie = AstPathTrie::new();
        let id = trie.intern(&[module_body(0), expr_bin(), bin_left(), bin_left()]);

        let trimmed = trie.trim_end_while(id, |k| matches!(k, AstParentKind::BinExpr(_)));
        assert_eq!(trie.to_vec(trimmed), vec![module_body(0), expr_bin()]);

        // Nothing matches: the path is returned unchanged.
        assert_eq!(trie.trim_end_while(id, |_| false), id);
        // Everything matches: we end at the root.
        assert_eq!(trie.trim_end_while(id, |_| true), AstPathId::ROOT);
    }

    /// Ids are only meaningful against the trie that minted them, so a trie that adopts
    /// another one must keep that one's ids valid. This is the shape of the analyzer
    /// handing its trie to effect processing.
    #[test]
    fn adopted_trie_keeps_its_ids_valid() {
        let mut first = AstPathTrie::new();
        let a = first.intern(&[module_body(0), module_item()]);
        let b = first.intern(&[module_body(1), expr_bin(), bin_left()]);

        // Continue interning into the adopted trie, as effect processing does.
        let mut second = first.clone();
        let c = second.intern(&[module_body(2), module_item()]);

        assert_eq!(second.to_vec(a), vec![module_body(0), module_item()]);
        assert_eq!(
            second.to_vec(b),
            vec![module_body(1), expr_bin(), bin_left()],
        );
        assert_eq!(second.to_vec(c), vec![module_body(2), module_item()]);
        // The new path must not collide with an existing id.
        assert_ne!(c, a);
        assert_ne!(c, b);
    }

    /// Every id must address a node that exists; an id from a *different* trie is a bug
    /// we want to fail loudly rather than read the wrong path.
    #[test]
    fn ids_stay_within_the_trie() {
        let mut trie = AstPathTrie::new();
        let id = trie.intern(&[module_body(0), module_item(), expr_bin()]);
        // Walking any valid id must terminate at the root without going out of bounds.
        assert_eq!(trie.iter_rev(id).count(), trie.len(id));
        let mut current = Some(id);
        while let Some(c) = current {
            assert!(
                c.is_root() || (c.0 as usize) <= trie.node_count(),
                "id {c:?} is outside a trie of {} nodes",
                trie.node_count(),
            );
            current = trie.parent(c);
        }
    }

    #[test]
    fn decoding_rebuilds_the_edge_index() {
        let mut trie = AstPathTrie::new();
        let id = trie.intern(&[module_body(0), module_item(), expr_bin()]);

        let config = bincode::config::standard();
        let bytes = bincode::encode_to_vec(&trie, config).unwrap();
        let (mut decoded, _): (AstPathTrie, _) =
            bincode::decode_from_slice(&bytes, config).unwrap();

        assert_eq!(decoded, trie);
        assert_eq!(decoded.to_vec(id), trie.to_vec(id));
        // The rebuilt index must still dedupe, rather than appending a duplicate node.
        assert_eq!(
            decoded.intern(&[module_body(0), module_item(), expr_bin()]),
            id
        );
        assert_eq!(decoded.node_count(), trie.node_count());
    }
}
