use std::ptr::NonNull;

use triomphe::Arc;

use crate::{
    tagged_value::{TaggedValue, MAX_INLINE_LEN},
    RcStr, INLINE_TAG_INIT, LEN_OFFSET, TAG_MASK,
};

pub unsafe fn cast(ptr: TaggedValue) -> *const String {
    ptr.get_ptr().cast()
}

pub unsafe fn deref_from<'i>(ptr: TaggedValue) -> &'i String {
    &*cast(ptr)
}

/// Caller should call `forget` (or `clone`) on the returned `Arc`
pub unsafe fn restore_arc(v: TaggedValue) -> Arc<String> {
    let ptr = v.get_ptr() as *const String;
    Arc::from_raw(ptr)
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

    let entry = Arc::new(text.into());
    let entry = Arc::into_raw(entry);

    let ptr: NonNull<String> = unsafe {
        // Safety: Arc::into_raw returns a non-null pointer
        NonNull::new_unchecked(entry as *mut String)
    };
    debug_assert!(0 == ptr.as_ptr() as u8 & TAG_MASK);
    RcStr {
        unsafe_data: TaggedValue::new_ptr(ptr),
    }
}
