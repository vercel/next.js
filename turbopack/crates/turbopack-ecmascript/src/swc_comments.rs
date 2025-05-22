use std::{borrow::Cow, cell::RefCell, mem::take};

use rustc_hash::FxHashMap;
use swc_core::{
    base::SwcComments,
    common::{
        BytePos,
        comments::{Comment, CommentKind, Comments},
    },
};

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
