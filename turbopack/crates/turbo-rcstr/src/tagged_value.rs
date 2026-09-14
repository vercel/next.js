//! The tagged value that backs [`crate::RcStr`].
//!
//! An `RcStr` is a single 8-byte value (16 with `atom_size_128`) that packs a 2-bit tag with a
//! payload: a pointer to a static or `Arc`'d string, or up to [`MAX_INLINE_LEN`] bytes of string
//! data stored inline. The tag lives in the low 2 bits of the value's least significant byte,
//! which is why pointers must be at least 4-byte aligned.
//!
//! # Why the narrow-pointer targets use a struct rather than an integer
//!
//! `rcstr!` expands to a `const`, so both constructors below have to be usable during const
//! evaluation. Const evaluation is asymmetric about pointer/integer conversions:
//!
//! * **pointer → integer is forbidden.** During const evaluation a pointer is an abstract
//!   (allocation, offset) pair; the numeric address does not exist yet because the linker chooses
//!   it. No spelling avoids this — `transmute`, `as`, `expose_provenance` and `repr(C)` union
//!   punning are all rejected.
//! * **integer → pointer is allowed.** The result simply carries no provenance, which is fine so
//!   long as it is never dereferenced.
//!
//! On 64-bit targets the payload is a `NonNull`, so [`TaggedValue::new_ptr`] is a pointer→pointer
//! cast and [`TaggedValue::new_tag`] is an integer→pointer transmute: both permitted. If narrower
//! targets stored a bare `u64` instead, `new_ptr` would need the one conversion that is impossible
//! and every `rcstr!` taking the static path would fail to compile with
//! `error[E0080]: unable to turn pointer into integer`.
//!
//! So those targets keep the value 8 bytes wide — giving the same [`MAX_INLINE_LEN`] as
//! everywhere else — but hold the address in a real pointer field paired with a byte payload. The
//! payload is sized to the pointer width so there is no padding: padding bytes would be
//! uninitialised, which would make the whole-value transmute in `new_tag` invalid.
//!
//! The field order follows endianness so that the pointer's least significant byte always lands
//! where the value's least significant byte lives — offset 0 on little-endian, the last byte on
//! big-endian. That is where [`TaggedValue::tag_byte`] reads the tag. With a fixed field
//! order, a big-endian dynamic pointer's tag bits would be read out of the payload (always zero)
//! and misread as `STATIC_TAG`.
//!
//! Reading the value back as an integer (`get_ptr`, `get_value`, `tag_byte`) only ever happens at
//! run time, where pointer → integer is perfectly legal.

use std::{num::NonZeroU8, os::raw::c_void, ptr::NonNull, slice};

use self::raw_types::*;
use crate::TAG_MASK;

#[cfg(feature = "atom_size_128")]
mod raw_types {
    pub type RawTaggedValue = u128;
    pub type RawTaggedNonZeroValue = std::num::NonZeroU128;
}

/// The narrow-pointer arm: an 8-byte value built from a real pointer plus a byte payload, so that
/// both constructors stay const-evaluable. See the module docs.
#[cfg(all(
    any(target_pointer_width = "32", target_pointer_width = "16"),
    not(feature = "atom_size_128")
))]
mod raw_types {
    use std::ptr::NonNull;

    pub type RawTaggedValue = u64;

    /// Padding that brings the value up to 8 bytes, sized so that there is none left over.
    #[cfg(target_pointer_width = "32")]
    pub type Payload = [u8; 4];
    #[cfg(target_pointer_width = "16")]
    pub type Payload = [u8; 6];

    // Both layouts are declared unconditionally so that the layout assertions for *both* are
    // compiled on every target; only the alias below is conditional. Otherwise the big-endian
    // invariant would never be checked on a little-endian host.
    //
    // `align(8)` is required, not cosmetic: a pointer field only forces 4-byte (or 2-byte)
    // alignment, but the value is read back as a `u64` to extract the tag, and wasm traps on an
    // unaligned 64-bit load with `RuntimeError: operation does not support unaligned accesses`.
    // Aligning to the width of the integer view keeps that read legal without adding padding.
    #[repr(C, align(8))]
    #[derive(Copy, Clone, Debug, PartialEq, Eq)]
    pub struct RawLittle {
        pub ptr: NonNull<()>,
        pub pad: Payload,
    }

    #[repr(C, align(8))]
    #[derive(Copy, Clone, Debug, PartialEq, Eq)]
    pub struct RawBig {
        pub pad: Payload,
        pub ptr: NonNull<()>,
    }

    #[cfg(target_endian = "little")]
    pub type RawTaggedNonZeroValue = RawLittle;
    #[cfg(target_endian = "big")]
    pub type RawTaggedNonZeroValue = RawBig;

    // The pointer's least significant byte must coincide with the value's least significant byte.
    const _: () = assert!(
        std::mem::offset_of!(RawLittle, ptr) == 0,
        "little-endian: the pointer must start at offset 0"
    );
    const _: () = assert!(
        std::mem::offset_of!(RawBig, ptr) == std::mem::size_of::<Payload>(),
        "big-endian: the pointer must follow the payload"
    );
    // No padding: `new_tag` transmutes the whole value, and padding bytes are uninitialised.
    // With `align(8)` and a payload sized to the pointer width, the fields fill the value exactly.
    const _: () = assert!(
        std::mem::size_of::<RawLittle>()
            == std::mem::size_of::<NonNull<()>>() + std::mem::size_of::<Payload>(),
        "the layout must not contain padding"
    );
    const _: () = assert!(
        std::mem::size_of::<RawBig>()
            == std::mem::size_of::<NonNull<()>>() + std::mem::size_of::<Payload>(),
        "the layout must not contain padding"
    );
    // The integer view of the value must be legal to load, i.e. at least as aligned as a `u64`.
    const _: () = assert!(
        std::mem::align_of::<RawLittle>() >= std::mem::align_of::<u64>(),
        "the value is read back as a u64, which wasm requires to be aligned"
    );
    const _: () = assert!(
        std::mem::align_of::<RawBig>() >= std::mem::align_of::<u64>(),
        "the value is read back as a u64, which wasm requires to be aligned"
    );
}

#[cfg(not(any(
    target_pointer_width = "32",
    target_pointer_width = "16",
    feature = "atom_size_128"
)))]
mod raw_types {
    pub type RawTaggedValue = usize;
    pub type RawTaggedNonZeroValue = std::ptr::NonNull<()>;
}

pub(crate) const MAX_INLINE_LEN: usize = std::mem::size_of::<TaggedValue>() - 1;

// The inline capacity must not depend on the target, or `turbo-rcstr-macros` (which runs on the
// host) could not decide inline-vs-static on the target's behalf.
#[cfg(not(feature = "atom_size_128"))]
const _: () = assert!(
    std::mem::size_of::<TaggedValue>() == 8,
    "TaggedValue must be 8 bytes on every target so MAX_INLINE_LEN is uniformly 7"
);
#[cfg(feature = "atom_size_128")]
const _: () = assert!(
    std::mem::size_of::<TaggedValue>() == 16 && MAX_INLINE_LEN == 15,
    "atom_size_128 must stay a 16-byte value with 15 inline bytes"
);

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(transparent)]
pub(crate) struct TaggedValue {
    value: RawTaggedNonZeroValue,
}

impl TaggedValue {
    #[inline(always)]
    pub const fn new_ptr<T>(value: NonNull<T>) -> Self {
        // A pointer → pointer cast, which const evaluation permits. See the module docs for why
        // the narrow-pointer arm cannot store a bare integer here.
        #[cfg(all(
            any(target_pointer_width = "32", target_pointer_width = "16"),
            not(feature = "atom_size_128")
        ))]
        {
            #[cfg(target_endian = "little")]
            {
                Self {
                    value: RawTaggedNonZeroValue {
                        ptr: value.cast(),
                        pad: [0; std::mem::size_of::<Payload>()],
                    },
                }
            }
            #[cfg(target_endian = "big")]
            {
                Self {
                    value: RawTaggedNonZeroValue {
                        pad: [0; std::mem::size_of::<Payload>()],
                        ptr: value.cast(),
                    },
                }
            }
        }

        #[cfg(feature = "atom_size_128")]
        unsafe {
            // `atom_size_128` keeps its integer representation, so this arm still cannot be used
            // in a const context. It is not enabled anywhere in this workspace.
            let value: std::num::NonZeroUsize = std::mem::transmute(value);
            Self {
                value: RawTaggedNonZeroValue::new_unchecked(value.get() as _),
            }
        }

        #[cfg(not(any(
            target_pointer_width = "32",
            target_pointer_width = "16",
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
        // An integer → pointer transmute, which const evaluation permits.
        let value = value.get() as RawTaggedValue;
        Self {
            #[allow(clippy::transmute_int_to_non_zero)]
            value: unsafe { std::mem::transmute::<RawTaggedValue, RawTaggedNonZeroValue>(value) },
        }
    }

    #[inline(always)]
    pub fn get_ptr(&self) -> *const c_void {
        #[cfg(all(
            any(target_pointer_width = "32", target_pointer_width = "16"),
            not(feature = "atom_size_128")
        ))]
        {
            // The tag lives in the low bits of the pointer itself (`DYNAMIC_TAG` sets one), so
            // mask it before use — otherwise a dynamic string's `Arc` is dereferenced two bytes
            // off, which traps on wasm as an unaligned atomic access.
            // Reading the address is fine here: this only ever runs at run time.
            (self.value.ptr.as_ptr() as usize & !(TAG_MASK as usize)) as _
        }
        #[cfg(feature = "atom_size_128")]
        {
            (self.value.get() as usize & !(TAG_MASK as usize)) as _
        }
        #[cfg(not(any(
            target_pointer_width = "32",
            target_pointer_width = "16",
            feature = "atom_size_128"
        )))]
        {
            (self.value.as_ptr() as usize & !(TAG_MASK as usize)) as _
        }
    }

    #[inline(always)]
    fn get_value(&self) -> RawTaggedValue {
        #[cfg(all(
            any(target_pointer_width = "32", target_pointer_width = "16"),
            not(feature = "atom_size_128")
        ))]
        {
            // The layout is guaranteed padding-free and 8-aligned above, so reading the whole
            // value as an integer is well defined. Again, run time only.
            unsafe { std::mem::transmute::<RawTaggedNonZeroValue, RawTaggedValue>(self.value) }
        }
        #[cfg(not(all(
            any(target_pointer_width = "32", target_pointer_width = "16"),
            not(feature = "atom_size_128")
        )))]
        {
            unsafe {
                std::mem::transmute::<Option<RawTaggedNonZeroValue>, RawTaggedValue>(Some(
                    self.value,
                ))
            }
        }
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
