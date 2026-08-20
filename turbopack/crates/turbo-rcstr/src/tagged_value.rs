#![allow(clippy::missing_transmute_annotations)]

use std::{num::NonZeroU8, os::raw::c_void, ptr::NonNull, slice};

use self::raw_types::*;
// On 32-bit targets the tagged value is a `u64`, which means `new_ptr` has to cast the pointer
// to an integer. That is not permitted in a `const` context, and `rcstr!` expands to a
// `const`, so every `rcstr!` with a non-inline string would fail to compile with
// `error[E0080]: unable to turn pointer into integer`.
//
// wasm is 32-bit but has no use for the wider tag space, so give it the same pointer-based
// representation 64-bit targets use. `MAX_INLINE_LEN` drops from 7 to 3 there, so slightly
// more strings take the static path, but `rcstr!` keeps working and behaves identically on
// every target.
//
// Native 32-bit targets still select the `u64` representation and still cannot use `rcstr!`;
// fixing that needs the same treatment (or a representation that avoids the cast entirely).
#[cfg(not(any(
    all(target_pointer_width = "32", not(target_family = "wasm")),
    target_pointer_width = "16",
    feature = "atom_size_64",
    feature = "atom_size_128"
)))]
use crate::TAG_MASK;

#[cfg(feature = "atom_size_128")]
mod raw_types {
    pub type RawTaggedValue = u128;
    pub type RawTaggedNonZeroValue = std::num::NonZeroU128;
}

#[cfg(all(
    any(
        all(target_pointer_width = "32", not(target_family = "wasm")),
        target_pointer_width = "16",
        feature = "atom_size_64"
    ),
    not(feature = "atom_size_128")
))]
mod raw_types {
    pub type RawTaggedValue = u64;
    pub type RawTaggedNonZeroValue = std::num::NonZeroU64;
}

#[cfg(not(any(
    all(target_pointer_width = "32", not(target_family = "wasm")),
    target_pointer_width = "16",
    feature = "atom_size_64",
    feature = "atom_size_128"
)))]
mod raw_types {
    pub type RawTaggedValue = usize;
    pub type RawTaggedNonZeroValue = std::ptr::NonNull<()>;
}

pub(crate) const MAX_INLINE_LEN: usize = std::mem::size_of::<TaggedValue>() - 1;

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(transparent)]
pub(crate) struct TaggedValue {
    value: RawTaggedNonZeroValue,
}

impl TaggedValue {
    #[inline(always)]
    pub const fn new_ptr<T>(value: NonNull<T>) -> Self {
        #[cfg(any(
            all(target_pointer_width = "32", not(target_family = "wasm")),
            target_pointer_width = "16",
            feature = "atom_size_64",
            feature = "atom_size_128"
        ))]
        unsafe {
            let value: std::num::NonZeroUsize = std::mem::transmute(value);
            Self {
                value: RawTaggedNonZeroValue::new_unchecked(value.get() as _),
            }
        }

        #[cfg(not(any(
            all(target_pointer_width = "32", not(target_family = "wasm")),
            target_pointer_width = "16",
            feature = "atom_size_64",
            feature = "atom_size_128"
        )))]
        {
            Self {
                value: value.cast(),
            }
        }
    }

    #[inline(always)]
    pub const fn new_tag(value: NonZeroU8) -> Self {
        let value = value.get() as RawTaggedValue;
        Self {
            #[allow(clippy::transmute_int_to_non_zero)]
            value: unsafe { std::mem::transmute(value) },
        }
    }

    #[inline(always)]
    pub fn get_ptr(&self) -> *const c_void {
        #[cfg(any(
            all(target_pointer_width = "32", not(target_family = "wasm")),
            target_pointer_width = "16",
            feature = "atom_size_64",
            feature = "atom_size_128"
        ))]
        {
            use crate::TAG_MASK;

            (self.value.get() as usize & !(TAG_MASK as usize)) as _
        }
        #[cfg(not(any(
            all(target_pointer_width = "32", not(target_family = "wasm")),
            target_pointer_width = "16",
            feature = "atom_size_64",
            feature = "atom_size_128"
        )))]
        {
            (self.value.as_ptr() as usize & !(TAG_MASK as usize)) as _
        }
    }

    #[inline(always)]
    fn get_value(&self) -> RawTaggedValue {
        unsafe { std::mem::transmute(Some(self.value)) }
    }

    #[inline(always)]
    pub fn tag_byte(&self) -> u8 {
        (self.get_value() & 0xff) as u8
    }

    pub fn data(&self) -> &[u8] {
        let x: *const _ = &self.value;
        let mut data = x as *const u8;
        // All except the lowest byte, which is first in little-endian, last in
        // big-endian.
        if cfg!(target_endian = "little") {
            unsafe {
                data = data.offset(1);
            }
        }
        let len = std::mem::size_of::<TaggedValue>() - 1;
        unsafe { slice::from_raw_parts(data, len) }
    }

    /// The `TaggedValue` is a non-zero number or pointer, so caution must be
    /// used when setting the untagged slice part of this value. If tag is
    /// zero and the slice is zeroed out, using this `TaggedValue` will be
    /// UB!
    pub const unsafe fn data_mut(&mut self) -> &mut [u8] {
        let x: *mut _ = &mut self.value;
        let mut data = x as *mut u8;
        // All except the lowest byte, which is first in little-endian, last in
        // big-endian.
        if cfg!(target_endian = "little") {
            data = unsafe { data.offset(1) };
        }
        let len = std::mem::size_of::<TaggedValue>() - 1;
        unsafe { slice::from_raw_parts_mut(data, len) }
    }
}
