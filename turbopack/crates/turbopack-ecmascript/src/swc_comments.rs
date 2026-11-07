use std::{borrow::Cow, cell::RefCell, mem::take, rc::Rc};

use rustc_hash::FxHashMap;
use swc_core::{
    base::SwcComments,
    common::{
        BytePos,
        comments::{Comment, CommentKind, Comments, SingleThreadedComments},
    },
};

use crate::source_map::extract_source_mapping_url;

/// Converts multi-threaded [`SwcComments`] into [`SingleThreadedComments`] by
/// copying all entries. Required when APIs (e.g. `swc_ecma_react_compiler`)
/// only accept the single-threaded variant.
pub fn swc_comments_to_single_threaded(comments: &SwcComments) -> SingleThreadedComments {
    let mut leading = FxHashMap::default();
    for entry in comments.leading.as_ref() {
        leading.insert(*entry.key(), entry.value().clone());
    }

    let mut trailing = FxHashMap::default();
    for entry in comments.trailing.as_ref() {
        trailing.insert(*entry.key(), entry.value().clone());
    }

    SingleThreadedComments::from_leading_and_trailing(
        Rc::new(RefCell::new(leading)),
        Rc::new(RefCell::new(trailing)),
    )
}

/// Immutable version of [SwcComments] which doesn't allow mutation. The `take`
/// variants are still implemented, but do not mutate the content. They are used
/// by the SWC Emitter.
#[derive(Default)]
pub struct ImmutableComments {
    pub leading: FxHashMap<BytePos, Vec<Comment>>,
    pub trailing: FxHashMap<BytePos, Vec<Comment>>,
}

impl ImmutableComments {
    pub fn new(comments: SwcComments) -> Self {
        Self {
            leading: comments
                .leading
                .iter_mut()
                .filter_map(|mut r| {
                    let c = take(r.value_mut());
                    (!c.is_empty()).then_some((*r.key(), c))
                })
                .collect(),
            trailing: comments
                .trailing
                .iter_mut()
                .filter_map(|mut r| {
                    let c = take(r.value_mut());
                    (!c.is_empty()).then_some((*r.key(), c))
                })
                .collect(),
        }
    }

    /// Creates a new ImmutableComments from SwcComments, extracting and removing
    /// any sourceMappingURL comment. Returns the comments and the extracted URL if found.
    /// If multiple sourceMappingURL comments exist, the one with the highest position
    /// (last in the file) is selected per the ECMAScript spec.
    pub fn new_with_source_mapping_url(comments: SwcComments) -> (Self, Option<String>) {
        let mut source_mapping_url_by_pos: Vec<(BytePos, String)> = Vec::new();

        let leading: FxHashMap<BytePos, Vec<Comment>> = comments
            .leading
            .iter_mut()
            .filter_map(|mut r| {
                let pos = *r.key();
                let mut c = take(r.value_mut());
                // Extract and remove sourceMappingURL comments
                c.retain(|comment| {
                    if let Some(url) = extract_source_mapping_url(comment) {
                        source_mapping_url_by_pos.push((pos, url.to_string()));
                        false
                    } else {
                        true
                    }
                });
                (!c.is_empty()).then_some((pos, c))
            })
            .collect();

        let trailing: FxHashMap<BytePos, Vec<Comment>> = comments
            .trailing
            .iter_mut()
            .filter_map(|mut r| {
                let pos = *r.key();
                let mut c = take(r.value_mut());
                // Extract and remove sourceMappingURL comments
                c.retain(|comment| {
                    if let Some(url) = extract_source_mapping_url(comment) {
                        source_mapping_url_by_pos.push((pos, url.to_string()));
                        false
                    } else {
                        true
                    }
                });
                (!c.is_empty()).then_some((pos, c))
            })
            .collect();

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
