#![allow(clippy::missing_transmute_annotations)]

use std::{num::NonZeroU8, os::raw::c_void, ptr::NonNull, slice};

#[cfg(feature = "atom_size_128")]
type RawTaggedValue = u128;
#[cfg(any(
    target_pointer_width = "32",
    target_pointer_width = "16",
    feature = "atom_size_64"
))]
type RawTaggedValue = u64;
#[cfg(not(any(
    target_pointer_width = "32",
    target_pointer_width = "16",
    feature = "atom_size_64",
    feature = "atom_size_128"
)))]
type RawTaggedValue = usize;

#[cfg(feature = "atom_size_128")]
type RawTaggedNonZeroValue = std::num::NonZeroU128;
#[cfg(any(
    target_pointer_width = "32",
    target_pointer_width = "16",
    feature = "atom_size_64"
))]
type RawTaggedNonZeroValue = std::num::NonZeroU64;
#[cfg(not(any(
    target_pointer_width = "32",
    target_pointer_width = "16",
    feature = "atom_size_64",
    feature = "atom_size_128"
)))]
type RawTaggedNonZeroValue = std::ptr::NonNull<()>;

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
    pub fn new_tag(value: NonZeroU8) -> Self {
        let value = value.get() as RawTaggedValue;
        Self {
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
            self.value.get() as usize as _
        }
        #[cfg(not(any(
            target_pointer_width = "32",
            target_pointer_width = "16",
            feature = "atom_size_64",
            feature = "atom_size_128"
        )))]
        unsafe {
            std::mem::transmute(Some(self.value))
        }
    }

    #[inline(always)]
    fn get_value(&self) -> RawTaggedValue {
        unsafe { std::mem::transmute(Some(self.value)) }
    }

    #[inline(always)]
    pub fn tag(&self) -> u8 {
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
    pub unsafe fn data_mut(&mut self) -> &mut [u8] {
        let x: *mut _ = &mut self.value;
        let mut data = x as *mut u8;
        // All except the lowest byte, which is first in little-endian, last in
        // big-endian.
        if cfg!(target_endian = "little") {
            data = data.offset(1);
        }
        let len = std::mem::size_of::<TaggedValue>() - 1;
        slice::from_raw_parts_mut(data, len)
    }
}
