use std::{
    borrow::Cow,
    hash::{Hash, Hasher},
    ptr::NonNull,
};

use triomphe::Arc;

use crate::{
    tagged_value::{TaggedValue, MAX_INLINE_LEN},
    RcStr, INLINE_TAG_INIT, LEN_OFFSET, TAG_MASK,
};

#[derive(Debug)]
pub(crate) struct Entry {
    pub string: Arc<str>,
}

impl Entry {
    pub unsafe fn cast(ptr: TaggedValue) -> *const Entry {
        ptr.get_ptr().cast()
    }

    pub unsafe fn deref_from<'i>(ptr: TaggedValue) -> &'i Entry {
        &*Self::cast(ptr)
    }

    pub unsafe fn restore_arc(v: TaggedValue) -> Arc<Entry> {
        let ptr = v.get_ptr() as *const Entry;
        Arc::from_raw(ptr)
    }
}

impl PartialEq for Entry {
    fn eq(&self, other: &Self) -> bool {
        self.string == other.string
    }
}

impl Eq for Entry {}

impl Hash for Entry {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.string.hash(state);
    }
}

/// This can create any kind of [Atom], although this lives in the `dynamic`
/// module.
pub(crate) fn new_atom(text: Cow<str>) -> RcStr {
    let len = text.len();

    if len < MAX_INLINE_LEN {
        // INLINE_TAG ensures this is never zero
        let tag = INLINE_TAG_INIT | ((len as u8) << LEN_OFFSET);
        let mut unsafe_data = TaggedValue::new_tag(tag);
        unsafe {
            unsafe_data.data_mut()[..len].copy_from_slice(text.as_bytes());
        }
        return RcStr { unsafe_data };
    }

    let entry = Arc::new(Entry {
        string: text.into(),
    });
    let entry = Arc::into_raw(entry);

    let ptr: NonNull<Entry> = unsafe {
        // Safety: Arc::into_raw returns a non-null pointer
        NonNull::new_unchecked(entry as *mut Entry)
    };
    debug_assert!(0 == ptr.as_ptr() as u8 & TAG_MASK);
    RcStr {
        unsafe_data: TaggedValue::new_ptr(ptr),
    }
}
