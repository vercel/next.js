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
        self.with_leading(pos, |cmts| {
            for c in cmts {
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
        })
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

/// A read-only [Comments] view over several comment stores.
///
/// Some SWC transforms (e.g. the fixer) need to *read* comments to make correct decisions -- the
/// fixer keeps the parentheses around a `/* @__PURE__ */`-annotated callee, which would otherwise
/// move the annotation onto the outer call -- but they also try to move comments around as they
/// rewrite the AST. The comment stores at that point are either immutable ([ImmutableComments]
/// panics on mutation) or must not be changed, so this adapter:
///
/// - answers `has_*` / `get_*` by looking at every store and concatenating the results,
/// - implements `take_*` as a non-destructive copy (like `get_*`), because SWC's default
///   [Comments::has_flag] uses `take_leading` followed by `add_leading_comments`,
/// - ignores every mutation (`add_*`, `move_*`, `add_pure_comment`).
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
    fn add_leading(&self, _pos: BytePos, _cmt: Comment) {}

    fn add_leading_comments(&self, _pos: BytePos, _comments: Vec<Comment>) {}

    fn has_leading(&self, pos: BytePos) -> bool {
        self.stores.iter().any(|s| s.has_leading(pos))
    }

    fn move_leading(&self, _from: BytePos, _to: BytePos) {}

    fn take_leading(&self, pos: BytePos) -> Option<Vec<Comment>> {
        self.get_leading(pos)
    }

    fn get_leading(&self, pos: BytePos) -> Option<Vec<Comment>> {
        self.collect(|s| s.get_leading(pos))
    }

    fn add_trailing(&self, _pos: BytePos, _cmt: Comment) {}

    fn add_trailing_comments(&self, _pos: BytePos, _comments: Vec<Comment>) {}

    fn has_trailing(&self, pos: BytePos) -> bool {
        self.stores.iter().any(|s| s.has_trailing(pos))
    }

    fn move_trailing(&self, _from: BytePos, _to: BytePos) {}

    fn take_trailing(&self, pos: BytePos) -> Option<Vec<Comment>> {
        self.get_trailing(pos)
    }

    fn get_trailing(&self, pos: BytePos) -> Option<Vec<Comment>> {
        self.collect(|s| s.get_trailing(pos))
    }

    fn add_pure_comment(&self, _pos: BytePos) {}
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

    use super::{ImmutableComments, ReadOnlyComments};

    fn block(text: &str) -> Comment {
        Comment {
            kind: CommentKind::Block,
            span: DUMMY_SP,
            text: text.into(),
        }
    }

    fn texts(comments: Option<Vec<Comment>>) -> Option<Vec<String>> {
        comments.map(|c| c.into_iter().map(|c| c.text.to_string()).collect())
    }

    /// An [ImmutableComments] store with `a` leading and `b` trailing at position 1, plus a
    /// [SwcComments] store with `@__PURE__` leading at position 1 and `c` leading at position 2.
    fn stores() -> (ImmutableComments, SwcComments) {
        let mut immutable = ImmutableComments::default();
        immutable.leading.insert(BytePos(1), vec![block("a")]);
        immutable.trailing.insert(BytePos(1), vec![block("b")]);

        let extra = SwcComments::default();
        extra.add_leading(BytePos(1), block(" @__PURE__ "));
        extra.add_leading(BytePos(2), block("c"));

        (immutable, extra)
    }

    #[test]
    fn reads_and_concatenates_all_stores() {
        let (immutable, extra) = stores();
        let stores: [&dyn Comments; 2] = [&immutable, &extra];
        let comments = ReadOnlyComments::new(&stores);

        assert_eq!(
            texts(comments.get_leading(BytePos(1))),
            Some(vec!["a".to_string(), " @__PURE__ ".to_string()])
        );
        assert_eq!(
            texts(comments.get_leading(BytePos(2))),
            Some(vec!["c".to_string()])
        );
        assert_eq!(
            texts(comments.get_trailing(BytePos(1))),
            Some(vec!["b".to_string()])
        );
        assert_eq!(comments.get_leading(BytePos(3)), None);
        assert_eq!(comments.get_trailing(BytePos(2)), None);

        assert!(comments.has_leading(BytePos(1)));
        assert!(comments.has_leading(BytePos(2)));
        assert!(!comments.has_leading(BytePos(3)));
        assert!(comments.has_trailing(BytePos(1)));
        assert!(!comments.has_trailing(BytePos(2)));
    }

    #[test]
    fn take_does_not_consume() {
        let (immutable, extra) = stores();
        let stores: [&dyn Comments; 2] = [&immutable, &extra];
        let comments = ReadOnlyComments::new(&stores);

        let first = texts(comments.take_leading(BytePos(1)));
        assert_eq!(first, texts(comments.take_leading(BytePos(1))));
        assert_eq!(first, texts(comments.get_leading(BytePos(1))));
        assert_eq!(
            texts(comments.take_trailing(BytePos(1))),
            texts(comments.take_trailing(BytePos(1)))
        );
        assert!(comments.has_trailing(BytePos(1)));

        // The underlying stores are untouched.
        assert!(extra.has_leading(BytePos(1)));
        assert_eq!(immutable.leading[&BytePos(1)].len(), 1);
    }

    #[test]
    fn mutations_are_ignored() {
        let (immutable, extra) = stores();
        let stores: [&dyn Comments; 2] = [&immutable, &extra];
        let comments = ReadOnlyComments::new(&stores);

        // None of these may panic, even though `ImmutableComments` panics on mutation.
        comments.add_leading(BytePos(5), block("x"));
        comments.add_leading_comments(BytePos(5), vec![block("x")]);
        comments.add_trailing(BytePos(5), block("x"));
        comments.add_trailing_comments(BytePos(5), vec![block("x")]);
        comments.add_pure_comment(BytePos(5));
        comments.move_leading(BytePos(1), BytePos(6));
        comments.move_trailing(BytePos(1), BytePos(6));

        assert!(!comments.has_leading(BytePos(5)));
        assert!(!comments.has_trailing(BytePos(5)));
        assert!(!comments.has_leading(BytePos(6)));
        assert!(!comments.has_trailing(BytePos(6)));
        assert!(comments.has_leading(BytePos(1)));
        assert!(comments.has_trailing(BytePos(1)));
        assert_eq!(extra.get_leading(BytePos(1)).map(|c| c.len()), Some(1));
    }

    #[test]
    fn has_flag_sees_every_store() {
        let mut immutable = ImmutableComments::default();
        immutable
            .leading
            .insert(BytePos(1), vec![block(" #__NO_SIDE_EFFECTS__ ")]);
        let extra = SwcComments::default();
        extra.add_leading(BytePos(2), block(" @__PURE__ "));
        let stores: [&dyn Comments; 2] = [&immutable, &extra];
        let comments = ReadOnlyComments::new(&stores);

        // `has_flag` uses the default implementation (`take_leading` + `add_leading_comments`),
        // so calling it repeatedly must keep returning the same answer.
        for _ in 0..2 {
            assert!(comments.has_flag(BytePos(1), "NO_SIDE_EFFECTS"));
            assert!(!comments.has_flag(BytePos(1), "PURE"));
            assert!(comments.has_flag(BytePos(2), "PURE"));
            assert!(!comments.has_flag(BytePos(3), "PURE"));
        }
    }
}
