//! Prefix-sharing AST paths.
//!
//! The ECMAScript analyzer records the [`AstParentKind`] path from the module root to a node for
//! every effect it finds, and every retained code generation entry keeps such a path until the
//! module is code generated. Storing each path as its own `Vec<AstParentKind>` costs
//! `O(paths * depth)` memory, which is quadratic for code where the nesting depth grows with the
//! number of interesting nodes (for example a long `a + b + c + …` chain: the `n`-th term sits
//! `n` binary expressions deep). A module with a few thousand such terms then needs tens of MB
//! for its paths alone, and hundreds of such modules kept alive at once (the whole app module
//! graph is analyzed before any code generation happens) add up to many GB.
//!
//! [`AstPath`] instead stores a path as a persistent linked list from the leaf towards the root,
//! so paths that share a prefix share the nodes of that prefix. [`AstPathInterner`] builds paths
//! incrementally while the analyzer walks the AST in DFS order, which makes sharing close to
//! optimal: the total memory is proportional to the number of distinct AST nodes on any recorded
//! path instead of the sum of all path lengths.

use std::{
    fmt,
    hash::{Hash, Hasher},
    sync::Arc,
};

use bincode::{
    Decode, Encode,
    de::{BorrowDecoder, Decoder},
    enc::Encoder,
    error::{DecodeError, EncodeError},
};
use swc_core::ecma::visit::AstParentKind;
use turbo_tasks::{
    NonLocalValue, TaskInput,
    trace::{TraceRawVcs, TraceRawVcsContext},
};

/// The path from the root of an AST to a node, as the sequence of [`AstParentKind`]s that are
/// entered on the way down. See the module documentation for the representation.
#[derive(Clone, Default)]
pub struct AstPath(Option<Arc<AstPathNode>>);

struct AstPathNode {
    parent: Option<Arc<AstPathNode>>,
    kind: AstParentKind,
    /// The number of kinds in the path that ends at this node (always at least 1).
    len: u32,
}

impl Drop for AstPathNode {
    fn drop(&mut self) {
        // Drop the chain iteratively: a recursive drop would need one stack frame per path entry,
        // and paths can be thousands of entries deep.
        let mut next = self.parent.take();
        while let Some(node) = next {
            match Arc::try_unwrap(node) {
                Ok(mut node) => next = node.parent.take(),
                // Still shared with another path, it will drop the rest later.
                Err(_) => break,
            }
        }
    }
}

impl AstPath {
    /// The empty path (the module root).
    pub const fn root() -> Self {
        Self(None)
    }

    /// Builds a path without sharing any prefix. Prefer [`AstPathInterner`] when creating many
    /// related paths.
    pub fn from_slice(kinds: &[AstParentKind]) -> Self {
        let mut path = Self::root();
        for &kind in kinds {
            path = path.push(kind);
        }
        path
    }

    /// The number of entries in the path.
    pub fn len(&self) -> usize {
        self.0.as_ref().map_or(0, |node| node.len as usize)
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_none()
    }

    /// The last entry of the path (the innermost parent kind), if any.
    pub fn last(&self) -> Option<AstParentKind> {
        self.0.as_ref().map(|node| node.kind)
    }

    /// The path without its last entry. Returns the root for the root.
    pub fn parent(&self) -> Self {
        Self(self.0.as_ref().and_then(|node| node.parent.clone()))
    }

    /// Returns a new path with `kind` appended. This shares all of `self` with the new path.
    pub fn push(&self, kind: AstParentKind) -> Self {
        Self(Some(Arc::new(AstPathNode {
            parent: self.0.clone(),
            kind,
            len: self.len() as u32 + 1,
        })))
    }

    /// Whether the path ends with the given entries (`suffix` is in root-to-leaf order).
    pub fn ends_with(&self, suffix: &[AstParentKind]) -> bool {
        let mut suffix = suffix.iter().rev();
        for kind in self.iter_rev() {
            match suffix.next() {
                Some(expected) => {
                    if *expected != kind {
                        return false;
                    }
                }
                None => return true,
            }
        }
        suffix.next().is_none()
    }

    /// Iterates the entries from the leaf towards the root.
    pub fn iter_rev(&self) -> impl Iterator<Item = AstParentKind> + '_ {
        let mut node = self.0.as_deref();
        std::iter::from_fn(move || {
            let current = node?;
            node = current.parent.as_deref();
            Some(current.kind)
        })
    }

    /// Materializes the path as a vector from the root to the leaf. This is what the code
    /// generation visitors need, but it should only be done transiently.
    pub fn to_vec(&self) -> Vec<AstParentKind> {
        let mut vec: Vec<_> = self.iter_rev().collect();
        vec.reverse();
        vec
    }
}

impl From<Vec<AstParentKind>> for AstPath {
    fn from(kinds: Vec<AstParentKind>) -> Self {
        Self::from_slice(&kinds)
    }
}

impl From<&[AstParentKind]> for AstPath {
    fn from(kinds: &[AstParentKind]) -> Self {
        Self::from_slice(kinds)
    }
}

impl PartialEq for AstPath {
    fn eq(&self, other: &Self) -> bool {
        let (mut a, mut b) = (self.0.as_ref(), other.0.as_ref());
        loop {
            match (a, b) {
                (None, None) => return true,
                (Some(x), Some(y)) => {
                    if Arc::ptr_eq(x, y) {
                        // Shared prefix, so the rest is identical.
                        return true;
                    }
                    if x.len != y.len || x.kind != y.kind {
                        return false;
                    }
                    a = x.parent.as_ref();
                    b = y.parent.as_ref();
                }
                _ => return false,
            }
        }
    }
}

impl Eq for AstPath {}

impl Hash for AstPath {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.len().hash(state);
        for kind in self.iter_rev() {
            kind.hash(state);
        }
    }
}

impl fmt::Debug for AstPath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.to_vec(), f)
    }
}

impl Encode for AstPath {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        bincode::serde::Compat(self.to_vec()).encode(encoder)
    }
}

impl<Context> Decode<Context> for AstPath {
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        let kinds: bincode::serde::Compat<Vec<AstParentKind>> = Decode::decode(decoder)?;
        Ok(Self::from(kinds.0))
    }
}

impl<'de, Context> bincode::BorrowDecode<'de, Context> for AstPath {
    fn borrow_decode<D: BorrowDecoder<'de, Context = Context>>(
        decoder: &mut D,
    ) -> Result<Self, DecodeError> {
        let kinds: bincode::serde::Compat<Vec<AstParentKind>> =
            bincode::BorrowDecode::borrow_decode(decoder)?;
        Ok(Self::from(kinds.0))
    }
}

impl TraceRawVcs for AstPath {
    fn trace_raw_vcs(&self, _trace_context: &mut TraceRawVcsContext) {
        // Contains no Vcs.
    }
}

unsafe impl NonLocalValue for AstPath {}

impl TaskInput for AstPath {
    fn is_transient(&self) -> bool {
        false
    }
}

/// Creates [`AstPath`]s for the current position of an AST walk, sharing prefixes between
/// consecutive paths.
///
/// The analyzer visits the AST depth first, so consecutive paths usually differ only in their
/// last few entries. The interner keeps the last path it built and only allocates nodes for the
/// suffix that changed.
#[derive(Default)]
pub struct AstPathInterner {
    /// The kinds of the last interned path.
    kinds: Vec<AstParentKind>,
    /// `paths[i]` is the path for `kinds[..=i]`.
    paths: Vec<AstPath>,
}

impl AstPathInterner {
    /// Returns the path for `kinds`, sharing as much as possible with the previously interned
    /// path.
    pub fn intern(&mut self, kinds: &[AstParentKind]) -> AstPath {
        let common = self
            .kinds
            .iter()
            .zip(kinds)
            .take_while(|(a, b)| a == b)
            .count();
        self.kinds.truncate(common);
        self.paths.truncate(common);
        for &kind in &kinds[common..] {
            let parent = self.paths.last().cloned().unwrap_or_default();
            self.kinds.push(kind);
            self.paths.push(parent.push(kind));
        }
        self.paths.last().cloned().unwrap_or_default()
    }

    /// Like [`Self::intern`], but with `additional` appended to the path.
    pub fn intern_with(&mut self, kinds: &[AstParentKind], additional: AstParentKind) -> AstPath {
        self.intern(kinds).push(additional)
    }

    /// Like [`Self::intern`], but skipping the last `skip` entries of `kinds`.
    pub fn intern_skip(&mut self, kinds: &[AstParentKind], skip: usize) -> AstPath {
        self.intern(&kinds[..kinds.len() - skip])
    }
}

#[cfg(test)]
mod tests {
    use swc_core::ecma::visit::{
        AstParentKind,
        fields::{BinExprField, ExprField, ModuleField, ModuleItemField, StmtField},
    };

    use super::*;

    fn kinds(n: usize) -> Vec<AstParentKind> {
        let mut kinds = vec![
            AstParentKind::Module(ModuleField::Body(0)),
            AstParentKind::ModuleItem(ModuleItemField::Stmt),
            AstParentKind::Stmt(StmtField::Expr),
        ];
        for _ in 0..n {
            kinds.push(AstParentKind::Expr(ExprField::Bin));
            kinds.push(AstParentKind::BinExpr(BinExprField::Left));
        }
        kinds
    }

    #[test]
    fn roundtrip() {
        let kinds = kinds(5);
        let path = AstPath::from_slice(&kinds);
        assert_eq!(path.len(), kinds.len());
        assert_eq!(path.to_vec(), kinds);
        assert_eq!(path.last(), kinds.last().copied());
        assert_eq!(path.parent().to_vec(), kinds[..kinds.len() - 1]);
        assert!(path.ends_with(&kinds[kinds.len() - 3..]));
        assert!(path.ends_with(&kinds));
        assert!(path.ends_with(&[]));
        assert!(!path.ends_with(&kinds[..kinds.len() - 1]));
        assert!(!AstPath::root().ends_with(&kinds[..1]));
        assert_eq!(AstPath::root().to_vec(), Vec::<AstParentKind>::new());
        assert!(AstPath::root().is_empty());
        assert_eq!(AstPath::root().parent(), AstPath::root());
        assert_eq!(
            path.iter_rev().collect::<Vec<_>>(),
            kinds.iter().rev().copied().collect::<Vec<_>>()
        );
    }

    #[test]
    fn equality_and_hash() {
        use std::collections::hash_map::DefaultHasher;
        let a = AstPath::from_slice(&kinds(3));
        let b = AstPath::from_slice(&kinds(3));
        let c = AstPath::from_slice(&kinds(4));
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_ne!(a, a.parent());
        let hash = |p: &AstPath| {
            let mut h = DefaultHasher::new();
            p.hash(&mut h);
            h.finish()
        };
        assert_eq!(hash(&a), hash(&b));
        // Sharing a prefix does not make paths equal.
        let mut interner = AstPathInterner::default();
        let x = interner.intern(&kinds(3));
        let y = interner.intern_with(&kinds(3), AstParentKind::BinExpr(BinExprField::Right));
        assert_ne!(x, y);
        assert_eq!(y.parent(), x);
    }

    #[test]
    fn interner_shares_prefixes() {
        let mut interner = AstPathInterner::default();
        let long = kinds(100);
        let a = interner.intern(&long);
        let b = interner.intern(&long[..long.len() - 1]);
        let c = interner.intern(&long);
        assert_eq!(a.to_vec(), long);
        assert_eq!(b.to_vec(), long[..long.len() - 1]);
        assert_eq!(c, a);
        // `b` is the parent of `a`, and `c` shares its prefix with `a`.
        assert!(Arc::ptr_eq(
            a.parent().0.as_ref().unwrap(),
            b.0.as_ref().unwrap()
        ));
        assert!(Arc::ptr_eq(
            c.parent().0.as_ref().unwrap(),
            b.0.as_ref().unwrap()
        ));
        let mut sibling = long.clone();
        *sibling.last_mut().unwrap() = AstParentKind::BinExpr(BinExprField::Right);
        let d = interner.intern(&sibling);
        assert_eq!(d.to_vec(), sibling);
        assert!(Arc::ptr_eq(
            d.parent().0.as_ref().unwrap(),
            b.0.as_ref().unwrap()
        ));
        assert_eq!(
            interner.intern_skip(&long, 2).to_vec(),
            long[..long.len() - 2]
        );
    }

    #[test]
    fn deep_paths_drop_without_overflowing() {
        let path = AstPath::from_slice(&kinds(200_000));
        assert_eq!(path.len(), 400_003);
        drop(path);
    }

    #[test]
    fn encode_decode() {
        let path = AstPath::from_slice(&kinds(4));
        let config = bincode::config::standard();
        let bytes = bincode::encode_to_vec(&path, config).unwrap();
        let (decoded, _): (AstPath, usize) = bincode::decode_from_slice(&bytes, config).unwrap();
        assert_eq!(decoded, path);
    }
}
