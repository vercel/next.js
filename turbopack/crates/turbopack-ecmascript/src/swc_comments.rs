use std::{borrow::Cow, cell::RefCell, mem::take, rc::Rc, sync::Arc};

use parking_lot::Mutex;
use rustc_hash::FxHashMap;
use swc_core::{
    atoms::atom,
    common::{
        BytePos, DUMMY_SP,
        comments::{Comment, CommentKind, Comments, SingleThreadedComments},
    },
};

use crate::source_map::extract_source_mapping_url;

type CommentMap = FxHashMap<BytePos, Vec<Comment>>;

#[derive(Default)]
struct CommentMaps {
    leading: CommentMap,
    trailing: CommentMap,
}

/// A thread-safe, mutable store of comments, used while parsing, transforming and generating
/// code for a module.
///
/// Clones share the same storage. This replaces `swc_core::base::SwcComments`, whose two
/// `DashMap`s use a shard count that scales with the number of CPUs (`4 * available_parallelism`
/// cache-padded locks each). That makes every `SwcComments` expensive to create, iterate and drop
/// on machines with many cores, although the comments of a module are only accessed by one thread
/// at a time. This store is a single allocation holding plain hash maps behind one uncontended
/// lock.
#[derive(Clone, Default)]
pub struct MutableComments {
    maps: Arc<Mutex<CommentMaps>>,
}

impl MutableComments {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns `true` if there are no leading comment entries.
    pub fn is_leading_empty(&self) -> bool {
        self.maps.lock().leading.is_empty()
    }

    /// Returns `true` if there are no trailing comment entries.
    pub fn is_trailing_empty(&self) -> bool {
        self.maps.lock().trailing.is_empty()
    }

    /// Moves all leading and trailing comments out of the store, leaving it (and all of its
    /// clones) empty. Avoids copying the maps when this is the last reference.
    pub fn take_all(self) -> (CommentMap, CommentMap) {
        let CommentMaps { leading, trailing } = match Arc::try_unwrap(self.maps) {
            Ok(maps) => maps.into_inner(),
            Err(maps) => take(&mut *maps.lock()),
        };
        (leading, trailing)
    }
}

/// Removes empty entries and releases excess capacity, as the maps of [`ImmutableComments`] are
/// kept in memory with the parse result. This is a no-op for the allocation when the capacity
/// already fits.
fn compact(map: &mut CommentMap) {
    map.retain(|_, c| !c.is_empty());
    map.shrink_to_fit();
}

fn move_comments(map: &mut CommentMap, from: BytePos, to: BytePos) {
    // Same semantics as `SwcComments::move_leading`/`move_trailing`.
    if let Some(mut cmt) = map.remove(&from) {
        if from < to
            && let Some(existing) = map.remove(&to)
        {
            cmt.extend(existing);
        }
        map.entry(to).or_default().extend(cmt);
    }
}

impl Comments for MutableComments {
    fn add_leading(&self, pos: BytePos, cmt: Comment) {
        self.maps.lock().leading.entry(pos).or_default().push(cmt);
    }

    fn add_leading_comments(&self, pos: BytePos, comments: Vec<Comment>) {
        self.maps
            .lock()
            .leading
            .entry(pos)
            .or_default()
            .extend(comments);
    }

    fn has_leading(&self, pos: BytePos) -> bool {
        self.maps
            .lock()
            .leading
            .get(&pos)
            .is_some_and(|c| !c.is_empty())
    }

    fn move_leading(&self, from: BytePos, to: BytePos) {
        move_comments(&mut self.maps.lock().leading, from, to);
    }

    fn take_leading(&self, pos: BytePos) -> Option<Vec<Comment>> {
        self.maps.lock().leading.remove(&pos)
    }

    fn get_leading(&self, pos: BytePos) -> Option<Vec<Comment>> {
        self.maps.lock().leading.get(&pos).cloned()
    }

    fn add_trailing(&self, pos: BytePos, cmt: Comment) {
        self.maps.lock().trailing.entry(pos).or_default().push(cmt);
    }

    fn add_trailing_comments(&self, pos: BytePos, comments: Vec<Comment>) {
        self.maps
            .lock()
            .trailing
            .entry(pos)
            .or_default()
            .extend(comments);
    }

    fn has_trailing(&self, pos: BytePos) -> bool {
        self.maps
            .lock()
            .trailing
            .get(&pos)
            .is_some_and(|c| !c.is_empty())
    }

    fn move_trailing(&self, from: BytePos, to: BytePos) {
        move_comments(&mut self.maps.lock().trailing, from, to);
    }

    fn take_trailing(&self, pos: BytePos) -> Option<Vec<Comment>> {
        self.maps.lock().trailing.remove(&pos)
    }

    fn get_trailing(&self, pos: BytePos) -> Option<Vec<Comment>> {
        self.maps.lock().trailing.get(&pos).cloned()
    }

    fn add_pure_comment(&self, pos: BytePos) {
        let mut maps = self.maps.lock();
        let leading = maps.leading.entry(pos).or_default();
        if !leading.iter().any(|c| &*c.text == "#__PURE__") {
            leading.push(Comment {
                kind: CommentKind::Block,
                span: DUMMY_SP,
                text: atom!("#__PURE__"),
            });
        }
    }

    fn with_leading<F, Ret>(&self, pos: BytePos, f: F) -> Ret
    where
        Self: Sized,
        F: FnOnce(&[Comment]) -> Ret,
    {
        // Don't hold the lock while calling `f`, as `f` may access the comments again.
        f(self.get_leading(pos).as_deref().unwrap_or_default())
    }

    fn with_trailing<F, Ret>(&self, pos: BytePos, f: F) -> Ret
    where
        Self: Sized,
        F: FnOnce(&[Comment]) -> Ret,
    {
        // Don't hold the lock while calling `f`, as `f` may access the comments again.
        f(self.get_trailing(pos).as_deref().unwrap_or_default())
    }

    fn has_flag(&self, lo: BytePos, flag: &str) -> bool {
        // Same as `SwcComments::has_flag`. (The default implementation of the trait would move
        // the leading comments to the trailing comments.)
        let maps = self.maps.lock();
        let Some(comments) = maps.leading.get(&lo) else {
            return false;
        };
        comments.iter().any(|c| {
            c.kind == CommentKind::Block
                && c.text.lines().any(|line| {
                    // jsdoc
                    let line = line.trim_start_matches(['*', ' ']).trim();
                    line.len() == flag.len() + 5
                        && (line.starts_with("#__") || line.starts_with("@__"))
                        && line.ends_with("__")
                        && flag == &line[3..line.len() - 2]
                })
        })
    }
}

/// Converts [`MutableComments`] into [`SingleThreadedComments`] by
/// copying all entries. Required when APIs (e.g. `swc_ecma_react_compiler`)
/// only accept the single-threaded variant.
pub fn swc_comments_to_single_threaded(comments: &MutableComments) -> SingleThreadedComments {
    let maps = comments.maps.lock();
    let leading = maps.leading.clone();
    let trailing = maps.trailing.clone();
    drop(maps);

    SingleThreadedComments::from_leading_and_trailing(
        Rc::new(RefCell::new(leading)),
        Rc::new(RefCell::new(trailing)),
    )
}

/// Immutable version of [MutableComments] which doesn't allow mutation. The `take`
/// variants are still implemented, but do not mutate the content. They are used
/// by the SWC Emitter.
#[derive(Default)]
pub struct ImmutableComments {
    pub leading: FxHashMap<BytePos, Vec<Comment>>,
    pub trailing: FxHashMap<BytePos, Vec<Comment>>,
}

impl ImmutableComments {
    pub fn new(comments: MutableComments) -> Self {
        let (mut leading, mut trailing) = comments.take_all();
        compact(&mut leading);
        compact(&mut trailing);
        Self { leading, trailing }
    }

    /// Creates a new ImmutableComments from MutableComments, extracting and removing
    /// any sourceMappingURL comment. Returns the comments and the extracted URL if found.
    /// If multiple sourceMappingURL comments exist, the one with the highest position
    /// (last in the file) is selected per the ECMAScript spec.
    pub fn new_with_source_mapping_url(comments: MutableComments) -> (Self, Option<String>) {
        let mut source_mapping_url_by_pos: Vec<(BytePos, String)> = Vec::new();

        let (mut leading, mut trailing) = comments.take_all();
        for map in [&mut leading, &mut trailing] {
            for (&pos, c) in map.iter_mut() {
                // Extract and remove sourceMappingURL comments
                c.retain(|comment| {
                    if let Some(url) = extract_source_mapping_url(comment) {
                        source_mapping_url_by_pos.push((pos, url.to_string()));
                        false
                    } else {
                        true
                    }
                });
            }
            compact(map);
        }

        // Select the sourceMappingURL with the highest position (last one in the file)
        let source_mapping_url = source_mapping_url_by_pos
            .into_iter()
            .max_by_key(|&(pos, _)| pos)
            .map(|(_, url)| url);

        (Self { leading, trailing }, source_mapping_url)
    }

    pub fn into_consumable(self) -> CowComments<'static> {
        CowComments::owned(self)
    }

    pub fn consumable(&self) -> CowComments<'_> {
        CowComments::borrowed(self)
    }
}

impl Comments for ImmutableComments {
    fn add_leading(
        &self,
        _pos: swc_core::common::BytePos,
        _cmt: swc_core::common::comments::Comment,
    ) {
        panic!("Comments are immutable after parsing")
    }

    fn add_leading_comments(
        &self,
        _pos: swc_core::common::BytePos,
        _comments: Vec<swc_core::common::comments::Comment>,
    ) {
        panic!("Comments are immutable after parsing")
    }

    fn has_leading(&self, pos: swc_core::common::BytePos) -> bool {
        self.leading.contains_key(&pos)
    }

    fn move_leading(&self, _from: swc_core::common::BytePos, _to: swc_core::common::BytePos) {
        panic!("Comments are immutable after parsing")
    }

    fn take_leading(
        &self,
        _pos: swc_core::common::BytePos,
    ) -> Option<Vec<swc_core::common::comments::Comment>> {
        panic!(
            "Comments are immutable after parsing (Use ImmutableComments::consumable() to allow \
             taking out values)"
        )
    }

    fn get_leading(
        &self,
        pos: swc_core::common::BytePos,
    ) -> Option<Vec<swc_core::common::comments::Comment>> {
        self.leading.get(&pos).map(|v| v.to_owned())
    }

    fn add_trailing(
        &self,
        _pos: swc_core::common::BytePos,
        _cmt: swc_core::common::comments::Comment,
    ) {
        panic!("Comments are immutable after parsing")
    }

    fn add_trailing_comments(
        &self,
        _pos: swc_core::common::BytePos,
        _comments: Vec<swc_core::common::comments::Comment>,
    ) {
        panic!("Comments are immutable after parsing")
    }

    fn has_trailing(&self, pos: swc_core::common::BytePos) -> bool {
        self.trailing.contains_key(&pos)
    }

    fn move_trailing(&self, _from: swc_core::common::BytePos, _to: swc_core::common::BytePos) {
        panic!("Comments are immutable after parsing")
    }

    fn take_trailing(
        &self,
        _pos: swc_core::common::BytePos,
    ) -> Option<Vec<swc_core::common::comments::Comment>> {
        panic!(
            "Comments are immutable after parsing (Use ImmutableComments::consumable() to allow \
             taking out values)"
        )
    }

    fn get_trailing(
        &self,
        pos: swc_core::common::BytePos,
    ) -> Option<Vec<swc_core::common::comments::Comment>> {
        self.trailing.get(&pos).map(|v| v.to_owned())
    }

    fn add_pure_comment(&self, _pos: swc_core::common::BytePos) {
        panic!("Comments are immutable after parsing")
    }

    fn has_flag(&self, pos: BytePos, flag: &str) -> bool {
        self.with_leading(pos, |cmts| comments_have_flag(cmts, flag))
    }

    fn with_leading<F, Ret>(&self, pos: BytePos, f: F) -> Ret
    where
        Self: Sized,
        F: FnOnce(&[Comment]) -> Ret,
    {
        let cmts = self.get_leading(pos);

        if let Some(cmts) = &cmts {
            f(cmts)
        } else {
            f(&[])
        }
    }

    fn with_trailing<F, Ret>(&self, pos: BytePos, f: F) -> Ret
    where
        Self: Sized,
        F: FnOnce(&[Comment]) -> Ret,
    {
        let cmts = self.get_trailing(pos);

        if let Some(cmts) = &cmts {
            f(cmts)
        } else {
            f(&[])
        }
    }
}

/// Checks whether `comments` contain a `@__FLAG__` / `#__FLAG__` block comment, using the same
/// matching rules as SWC's default [Comments::has_flag], but without mutating anything.
fn comments_have_flag(comments: &[Comment], flag: &str) -> bool {
    for c in comments {
        if c.kind == CommentKind::Block {
            for line in c.text.lines() {
                // jsdoc
                let line = line.trim_start_matches(['*', ' ']);
                let line = line.trim();

                //
                if line.len() == (flag.len() + 5)
                    && (line.starts_with("#__") || line.starts_with("@__"))
                    && line.ends_with("__")
                    && flag == &line[3..line.len() - 2]
                {
                    return true;
                }
            }
        }
    }

    false
}

/// A read-only [Comments] view over several comment stores.
///
/// Some SWC transforms (e.g. the fixer) need to *read* comments to make correct decisions: the
/// fixer keeps the parentheses around a `/* @__PURE__ */`-annotated callee, which would otherwise
/// move the annotation onto the outer call. The comment stores at that point must not be changed
/// ([ImmutableComments] can't be), so this adapter:
///
/// - answers `has_*` / `get_*` / `has_flag` by looking at every store and concatenating the results
///   (`has_flag` is overridden because SWC's default implementation uses `take_leading` followed by
///   `add_trailing_comments`),
/// - ignores `move_*`: the fixer calls them for every pair of parentheses it removes, to move the
///   comments from the paren span to the inner expression. Ignoring them keeps the comments at
///   their original positions, which is what happened before the fixer saw any comments,
/// - panics on every other mutation (`add_*`, `take_*`, `add_pure_comment`) to make sure it is
///   never used where comments actually need to be changed.
pub struct ReadOnlyComments<'a> {
    stores: &'a [&'a dyn Comments],
}

impl<'a> ReadOnlyComments<'a> {
    pub fn new(stores: &'a [&'a dyn Comments]) -> Self {
        Self { stores }
    }

    fn collect(&self, f: impl Fn(&dyn Comments) -> Option<Vec<Comment>>) -> Option<Vec<Comment>> {
        let mut result: Option<Vec<Comment>> = None;
        for store in self.stores {
            if let Some(c) = f(*store) {
                result.get_or_insert_with(Vec::new).extend(c);
            }
        }
        result
    }
}

impl Comments for ReadOnlyComments<'_> {
    fn add_leading(&self, _pos: BytePos, _cmt: Comment) {
        panic!("ReadOnlyComments can't be mutated")
    }

    fn add_leading_comments(&self, _pos: BytePos, _comments: Vec<Comment>) {
        panic!("ReadOnlyComments can't be mutated")
    }

    fn has_leading(&self, pos: BytePos) -> bool {
        self.stores.iter().any(|s| s.has_leading(pos))
    }

    fn move_leading(&self, _from: BytePos, _to: BytePos) {
        // Intentionally ignored, see the type's documentation.
    }

    fn take_leading(&self, _pos: BytePos) -> Option<Vec<Comment>> {
        panic!("ReadOnlyComments can't be mutated")
    }

    fn get_leading(&self, pos: BytePos) -> Option<Vec<Comment>> {
        self.collect(|s| s.get_leading(pos))
    }

    fn add_trailing(&self, _pos: BytePos, _cmt: Comment) {
        panic!("ReadOnlyComments can't be mutated")
    }

    fn add_trailing_comments(&self, _pos: BytePos, _comments: Vec<Comment>) {
        panic!("ReadOnlyComments can't be mutated")
    }

    fn has_trailing(&self, pos: BytePos) -> bool {
        self.stores.iter().any(|s| s.has_trailing(pos))
    }

    fn move_trailing(&self, _from: BytePos, _to: BytePos) {
        // Intentionally ignored, see the type's documentation.
    }

    fn take_trailing(&self, _pos: BytePos) -> Option<Vec<Comment>> {
        panic!("ReadOnlyComments can't be mutated")
    }

    fn get_trailing(&self, pos: BytePos) -> Option<Vec<Comment>> {
        self.collect(|s| s.get_trailing(pos))
    }

    fn add_pure_comment(&self, _pos: BytePos) {
        panic!("ReadOnlyComments can't be mutated")
    }

    fn has_flag(&self, pos: BytePos, flag: &str) -> bool {
        self.stores.iter().any(|s| {
            s.get_leading(pos)
                .is_some_and(|cmts| comments_have_flag(&cmts, flag))
        })
    }
}

pub struct CowComments<'a> {
    leading: RefCell<FxHashMap<BytePos, Cow<'a, [Comment]>>>,
    trailing: RefCell<FxHashMap<BytePos, Cow<'a, [Comment]>>>,
}

impl<'a> CowComments<'a> {
    fn borrowed(comments: &'a ImmutableComments) -> Self {
        Self {
            leading: RefCell::new(
                comments
                    .leading
                    .iter()
                    .map(|(&key, value)| (key, Cow::Borrowed(&value[..])))
                    .collect(),
            ),
            trailing: RefCell::new(
                comments
                    .trailing
                    .iter()
                    .map(|(&key, value)| (key, Cow::Borrowed(&value[..])))
                    .collect(),
            ),
        }
    }

    fn owned(comments: ImmutableComments) -> Self {
        Self {
            leading: RefCell::new(
                comments
                    .leading
                    .into_iter()
                    .map(|(key, value)| (key, Cow::Owned(value)))
                    .collect(),
            ),
            trailing: RefCell::new(
                comments
                    .trailing
                    .into_iter()
                    .map(|(key, value)| (key, Cow::Owned(value)))
                    .collect(),
            ),
        }
    }
}

impl Comments for CowComments<'_> {
    fn add_leading(
        &self,
        _pos: swc_core::common::BytePos,
        _cmt: swc_core::common::comments::Comment,
    ) {
        panic!("Comments are immutable after parsing")
    }

    fn add_leading_comments(
        &self,
        _pos: swc_core::common::BytePos,
        _comments: Vec<swc_core::common::comments::Comment>,
    ) {
        panic!("Comments are immutable after parsing")
    }

    fn has_leading(&self, pos: swc_core::common::BytePos) -> bool {
        self.leading.borrow().contains_key(&pos)
    }

    fn move_leading(&self, _from: swc_core::common::BytePos, _to: swc_core::common::BytePos) {
        panic!("Comments are immutable after parsing")
    }

    fn take_leading(
        &self,
        pos: swc_core::common::BytePos,
    ) -> Option<Vec<swc_core::common::comments::Comment>> {
        self.leading
            .borrow_mut()
            .remove(&pos)
            .map(|v| v.into_owned())
    }

    fn get_leading(
        &self,
        pos: swc_core::common::BytePos,
    ) -> Option<Vec<swc_core::common::comments::Comment>> {
        self.leading.borrow().get(&pos).map(|v| (**v).to_vec())
    }

    fn add_trailing(
        &self,
        _pos: swc_core::common::BytePos,
        _cmt: swc_core::common::comments::Comment,
    ) {
        panic!("Comments are immutable after parsing")
    }

    fn add_trailing_comments(
        &self,
        _pos: swc_core::common::BytePos,
        _comments: Vec<swc_core::common::comments::Comment>,
    ) {
        panic!("Comments are immutable after parsing")
    }

    fn has_trailing(&self, pos: swc_core::common::BytePos) -> bool {
        self.trailing.borrow().contains_key(&pos)
    }

    fn move_trailing(&self, _from: swc_core::common::BytePos, _to: swc_core::common::BytePos) {
        panic!("Comments are immutable after parsing")
    }

    fn take_trailing(
        &self,
        pos: swc_core::common::BytePos,
    ) -> Option<Vec<swc_core::common::comments::Comment>> {
        self.trailing
            .borrow_mut()
            .remove(&pos)
            .map(|v| v.into_owned())
    }

    fn get_trailing(
        &self,
        pos: swc_core::common::BytePos,
    ) -> Option<Vec<swc_core::common::comments::Comment>> {
        self.trailing.borrow().get(&pos).map(|v| (**v).to_vec())
    }

    fn add_pure_comment(&self, _pos: swc_core::common::BytePos) {
        panic!("Comments are immutable after parsing")
    }

    fn with_leading<F, Ret>(&self, pos: BytePos, f: F) -> Ret
    where
        Self: Sized,
        F: FnOnce(&[Comment]) -> Ret,
    {
        let cmts = self.get_leading(pos);

        if let Some(cmts) = &cmts {
            f(cmts)
        } else {
            f(&[])
        }
    }

    fn with_trailing<F, Ret>(&self, pos: BytePos, f: F) -> Ret
    where
        Self: Sized,
        F: FnOnce(&[Comment]) -> Ret,
    {
        let cmts = self.get_trailing(pos);

        if let Some(cmts) = &cmts {
            f(cmts)
        } else {
            f(&[])
        }
    }
}

#[cfg(test)]
mod tests {
    use swc_core::{
        base::SwcComments,
        common::{
            BytePos, DUMMY_SP,
            comments::{Comment, CommentKind, Comments},
        },
    };

    use crate::swc_comments::{
        ImmutableComments, MutableComments, swc_comments_to_single_threaded,
    };

    fn comment(kind: CommentKind, text: &str) -> Comment {
        Comment {
            kind,
            span: DUMMY_SP,
            text: text.into(),
        }
    }

    /// Applies the same operations to `MutableComments` and swc's `SwcComments` and checks that
    /// every observable result is identical.
    #[test]
    fn behaves_like_swc_comments() {
        let ours = MutableComments::new();
        let swc = SwcComments::default();
        let a = comment(CommentKind::Block, "a");
        let b = comment(CommentKind::Line, "b");
        let c = comment(CommentKind::Block, "c");

        macro_rules! both {
            ($($op:tt)*) => {{
                let x = ours.$($op)*;
                let y = swc.$($op)*;
                assert_eq!(x, y, "{}", stringify!($($op)*));
            }};
        }
        let positions = [0, 1, 2, 3, 4, 5, 10, 11, 20].map(BytePos);
        let check_all = || {
            for pos in positions {
                let ctx = |what: &str| format!("{what} at {pos:?}");
                assert_eq!(
                    ours.has_leading(pos),
                    swc.has_leading(pos),
                    "{}",
                    ctx("has_leading")
                );
                assert_eq!(
                    ours.has_trailing(pos),
                    swc.has_trailing(pos),
                    "{}",
                    ctx("has_trailing")
                );
                assert_eq!(
                    ours.get_leading(pos),
                    swc.get_leading(pos),
                    "{}",
                    ctx("get_leading")
                );
                assert_eq!(
                    ours.get_trailing(pos),
                    swc.get_trailing(pos),
                    "{}",
                    ctx("get_trailing")
                );
                assert_eq!(
                    ours.with_leading(pos, |c| c.to_vec()),
                    swc.with_leading(pos, |c| c.to_vec()),
                    "{}",
                    ctx("with_leading")
                );
                assert_eq!(
                    ours.with_trailing(pos, |c| c.to_vec()),
                    swc.with_trailing(pos, |c| c.to_vec()),
                    "{}",
                    ctx("with_trailing")
                );
                assert_eq!(
                    ours.has_flag(pos, "PURE"),
                    swc.has_flag(pos, "PURE"),
                    "{}",
                    ctx("has_flag")
                );
            }
        };

        check_all();
        both!(add_leading(BytePos(1), a.clone()));
        both!(add_leading_comments(BytePos(1), vec![b.clone(), c.clone()]));
        both!(add_leading_comments(BytePos(2), vec![]));
        both!(add_trailing(BytePos(3), b.clone()));
        both!(add_trailing_comments(
            BytePos(4),
            vec![a.clone(), c.clone()]
        ));
        both!(add_leading(BytePos(5), c.clone()));
        both!(add_trailing(BytePos(5), a.clone()));
        check_all();

        // Moves forwards (prepends to existing comments), backwards (appends) and to an empty
        // position, plus moving from a position without comments.
        both!(move_leading(BytePos(1), BytePos(5)));
        both!(move_leading(BytePos(5), BytePos(2)));
        both!(move_trailing(BytePos(3), BytePos(4)));
        both!(move_trailing(BytePos(4), BytePos(10)));
        both!(move_trailing(BytePos(11), BytePos(0)));
        check_all();

        // Backwards trailing move onto existing comments, moves to the same position and from a
        // position that only has an empty entry.
        both!(add_trailing(BytePos(1), c.clone()));
        both!(move_trailing(BytePos(10), BytePos(1)));
        both!(move_leading(BytePos(2), BytePos(2)));
        both!(move_trailing(BytePos(1), BytePos(1)));
        both!(add_trailing_comments(BytePos(11), vec![]));
        both!(move_trailing(BytePos(11), BytePos(3)));
        check_all();

        // Flags: jsdoc style and `@__` prefix match, line comments and other flags don't.
        both!(add_leading(
            BytePos(0),
            comment(CommentKind::Block, "*\n * @__PURE__\n ")
        ));
        both!(add_leading(
            BytePos(10),
            comment(CommentKind::Line, "#__PURE__")
        ));
        both!(add_leading(
            BytePos(11),
            comment(CommentKind::Block, "#__NOINLINE__")
        ));
        check_all();

        both!(add_pure_comment(BytePos(20)));
        both!(add_pure_comment(BytePos(20)));
        both!(add_pure_comment(BytePos(2)));
        check_all();

        both!(take_leading(BytePos(2)));
        both!(take_leading(BytePos(2)));
        both!(take_trailing(BytePos(10)));
        both!(take_trailing(BytePos(11)));
        check_all();
    }

    #[test]
    fn with_leading_allows_reentrant_access() {
        let comments = MutableComments::new();
        comments.add_leading(BytePos(1), comment(CommentKind::Block, "a"));
        let len = comments.with_leading(BytePos(1), |c| {
            comments.add_leading(BytePos(2), c[0].clone());
            comments.get_leading(BytePos(2)).unwrap().len()
        });
        assert_eq!(len, 1);
        let len = comments.with_trailing(BytePos(1), |c| {
            comments.add_trailing(BytePos(1), comment(CommentKind::Line, "b"));
            c.len()
        });
        assert_eq!(len, 0);
        assert!(comments.has_trailing(BytePos(1)));
    }

    #[test]
    fn take_all_empties_shared_storage() {
        let comments = MutableComments::new();
        assert!(comments.is_leading_empty() && comments.is_trailing_empty());
        comments.add_leading(BytePos(1), comment(CommentKind::Block, "a"));
        comments.add_trailing(BytePos(2), comment(CommentKind::Block, "b"));
        assert!(!comments.is_leading_empty() && !comments.is_trailing_empty());

        let single_threaded = swc_comments_to_single_threaded(&comments);
        assert!(single_threaded.has_leading(BytePos(1)));
        assert!(single_threaded.has_trailing(BytePos(2)));

        let clone = comments.clone();
        let (leading, trailing) = comments.take_all();
        assert_eq!(leading.len(), 1);
        assert_eq!(trailing.len(), 1);
        assert!(clone.is_leading_empty() && clone.is_trailing_empty());
        // The converted copy is independent.
        assert!(single_threaded.has_leading(BytePos(1)));
    }

    #[test]
    fn immutable_comments_drop_empty_entries() {
        let comments = MutableComments::new();
        comments.add_leading_comments(BytePos(1), vec![]);
        comments.add_leading(BytePos(2), comment(CommentKind::Block, "a"));
        comments.add_trailing_comments(BytePos(3), vec![]);
        let immutable = ImmutableComments::new(comments);
        assert_eq!(immutable.leading.len(), 1);
        assert!(immutable.trailing.is_empty());
    }

    #[test]
    fn immutable_comments_release_excess_capacity() {
        let comments = MutableComments::new();
        for i in 0..1000 {
            comments.add_leading_comments(BytePos(i), vec![]);
        }
        comments.add_leading(BytePos(0), comment(CommentKind::Block, "a"));
        let immutable = ImmutableComments::new(comments);
        assert_eq!(immutable.leading.len(), 1);
        assert!(immutable.leading.capacity() < 10);
    }

    #[test]
    fn immutable_comments_extract_source_mapping_url() {
        let comments = MutableComments::new();
        let pure = comment(CommentKind::Block, "#__PURE__");
        let note = comment(CommentKind::Line, " note");
        let url = comment(CommentKind::Line, "# sourceMappingURL=index.js.map");

        comments.add_leading(BytePos(1), pure.clone());
        comments.add_leading_comments(BytePos(1), vec![note.clone()]);
        comments.add_trailing(BytePos(2), note.clone());
        comments.add_trailing(BytePos(100), url);
        // Only the last sourceMappingURL is used; all of them are removed.
        comments.add_leading(
            BytePos(50),
            comment(CommentKind::Line, "# sourceMappingURL=old.js.map"),
        );
        assert!(comments.has_leading(BytePos(1)));
        assert!(!comments.has_leading(BytePos(2)));

        // Clones share the same maps.
        let clone = comments.clone();
        clone.add_leading(BytePos(3), pure.clone());
        assert_eq!(comments.get_leading(BytePos(3)), Some(vec![pure.clone()]));
        drop(clone);

        let (immutable, source_mapping_url) =
            ImmutableComments::new_with_source_mapping_url(comments);
        assert_eq!(source_mapping_url.as_deref(), Some("index.js.map"));
        assert_eq!(immutable.leading.len(), 2);
        assert_eq!(
            immutable.leading[&BytePos(1)],
            vec![pure.clone(), note.clone()]
        );
        assert_eq!(immutable.leading[&BytePos(3)], vec![pure]);
        // The sourceMappingURL comment was removed, leaving no entry at its position.
        assert_eq!(immutable.trailing.len(), 1);
        assert_eq!(immutable.trailing[&BytePos(2)], vec![note]);
    }
}
