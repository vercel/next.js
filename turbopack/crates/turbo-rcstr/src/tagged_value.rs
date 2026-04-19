#![allow(clippy::missing_transmute_annotations)]

use std::{num::NonZeroU8, os::raw::c_void, ptr::NonNull, slice};

use self::raw_types::*;
#[cfg(not(any(
    target_pointer_width = "32",
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
        target_pointer_width = "32",
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
    target_pointer_width = "32",
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
    pub fn new_ptr<T>(value: NonNull<T>) -> Self {
        #[cfg(any(
            target_pointer_width = "32",
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
            target_pointer_width = "32",
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
            target_pointer_width = "32",
            target_pointer_width = "16",
            feature = "atom_size_64",
            feature = "atom_size_128"
        ))]
        {
            use crate::TAG_MASK;

            (self.value.get() as usize & !(TAG_MASK as usize)) as _
        }
        #[cfg(not(any(
            target_pointer_width = "32",
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
