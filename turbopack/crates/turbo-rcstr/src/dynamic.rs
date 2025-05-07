use std::{
    hash::{Hash, Hasher},
    num::NonZeroU8,
    ptr::NonNull,
};

use rustc_hash::FxHasher;
use triomphe::Arc;

use crate::{
    INLINE_TAG, INLINE_TAG_INIT, LEN_OFFSET, RcStr, TAG_MASK,
    tagged_value::{MAX_INLINE_LEN, TaggedValue},
};

pub(crate) struct PrehashedString {
    pub value: String,
    pub hash: u64,
}

pub unsafe fn cast(ptr: TaggedValue) -> *const PrehashedString {
    ptr.get_ptr().cast()
}

pub(crate) unsafe fn deref_from<'i>(ptr: TaggedValue) -> &'i PrehashedString {
    unsafe { &*cast(ptr) }
}

/// Caller should call `forget` (or `clone`) on the returned `Arc`
pub unsafe fn restore_arc(v: TaggedValue) -> Arc<PrehashedString> {
    let ptr = v.get_ptr() as *const PrehashedString;
    unsafe { Arc::from_raw(ptr) }
}

/// This can create any kind of [Atom], although this lives in the `dynamic`
/// module.
pub(crate) fn new_atom<T: AsRef<str> + Into<String>>(text: T) -> RcStr {
    let len = text.as_ref().len();

    if len < MAX_INLINE_LEN {
        // INLINE_TAG ensures this is never zero
        let tag = INLINE_TAG_INIT | ((len as u8) << LEN_OFFSET);
        let mut unsafe_data = TaggedValue::new_tag(tag);
        unsafe {
            unsafe_data.data_mut()[..len].copy_from_slice(text.as_ref().as_bytes());
        }
        return RcStr { unsafe_data };
    }

    let hash = compute_fxhash(text.as_ref());

    let entry: Arc<PrehashedString> = Arc::new(PrehashedString {
        value: text.into(),
        hash,
    });
    let entry = Arc::into_raw(entry);

    let ptr: NonNull<PrehashedString> = unsafe {
        // Safety: Arc::into_raw returns a non-null pointer
        NonNull::new_unchecked(entry as *mut _)
    };
    debug_assert!(0 == ptr.as_ptr() as u8 & TAG_MASK);
    RcStr {
        unsafe_data: TaggedValue::new_ptr(ptr),
    }
}

/// Attempts to construct an RcStr but only if it can be constructed inline.
/// This is primarily useful in constant contexts.
#[doc(hidden)]
pub(crate) const fn inline_atom(text: &str) -> Option<RcStr> {
    let len = text.len();
    if len < MAX_INLINE_LEN {
        let tag = INLINE_TAG | ((len as u8) << LEN_OFFSET);
        let mut unsafe_data = TaggedValue::new_tag(NonZeroU8::new(tag).unwrap());

        // This odd pattern is needed because we cannot create slices from ranges in constant
        // context.
        unsafe {
            unsafe_data
                .data_mut()
                .split_at_mut(len)
                .0
                .copy_from_slice(text.as_bytes());
        }
        return Some(RcStr { unsafe_data });
    }
    None
}

fn compute_fxhash(s: &str) -> u64 {
    let mut hasher = FxHasher::default();
    s.hash(&mut hasher);
    hasher.finish()
}
