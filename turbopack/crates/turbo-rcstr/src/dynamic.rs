use std::{num::NonZeroU8, ptr::NonNull, sync::LazyLock};

use dashmap::DashMap;
use smallvec::SmallVec;
use triomphe::Arc;

use crate::{
    INLINE_TAG, INLINE_TAG_INIT, LEN_OFFSET, RcStr, STATIC_TAG, TAG_MASK,
    tagged_value::{MAX_INLINE_LEN, TaggedValue},
};

/// A wrapper around `TaggedValue` that implements `Send` and `Sync`.
///
/// This is safe because the `TaggedValue` in the intern table always points to
/// either:
/// - A `triomphe::Arc<PrehashedString>` (DYNAMIC_TAG), which is `Send + Sync`
/// - A `&'static PrehashedString` (STATIC_TAG), which is `Send + Sync`
///
/// The wrapper is `Copy` and has no `Drop`, avoiding recursive drop issues.
#[derive(Copy, Clone, PartialEq, Eq)]
struct InternEntry(TaggedValue);

// Safety: InternEntry wraps either an Arc pointer (Send+Sync via Arc) or a
// static reference (inherently Send+Sync). See the doc comment above.
unsafe impl Send for InternEntry {}
unsafe impl Sync for InternEntry {}

/// Global intern table for deduplicating RcStr values.
///
/// Keyed by the precomputed u64 hash of the string content. Values are SmallVec
/// of `InternEntry`s to handle the (extremely rare) case of hash collisions.
/// Using `InternEntry` (a `Copy` wrapper around `TaggedValue`) instead of
/// `RcStr` avoids recursive Drop calls when evicting entries.
///
/// The table entries may be either DYNAMIC-tagged (heap-allocated Arc) or
/// STATIC-tagged (compile-time constant). When a static string is registered,
/// subsequent `RcStr::from()` calls for the same content return a static clone,
/// avoiding heap allocation and refcounting entirely.
///
/// Dynamic entries are self-evicting: when an RcStr is dropped and the only
/// remaining reference is the intern table's copy (refcount == 2), the entry is
/// removed.
static INTERN_TABLE: LazyLock<DashMap<u64, SmallVec<[InternEntry; 1]>>> =
    LazyLock::new(DashMap::new);

/// Returns the number of unique strings currently in the intern table.
pub fn interned_count() -> usize {
    INTERN_TABLE.iter().map(|e| e.value().len()).sum()
}

/// Look up a string in the intern table by hash and content.
/// Returns a clone of the existing entry as an RcStr if found.
fn intern_lookup(hash: u64, text: &str) -> Option<RcStr> {
    let entry = INTERN_TABLE.get(&hash)?;
    for &InternEntry(tv) in entry.value().iter() {
        // Safety: all entries in the intern table point to valid
        // PrehashedString allocations (either Arc-managed or static).
        let phs = unsafe { deref_from(tv) };
        if phs.value.as_str() == text {
            // Clone the entry — for DYNAMIC entries this increments the Arc
            // refcount, for STATIC entries it's free.
            return Some(clone_intern_entry(tv));
        }
    }
    None
}

/// Clone an interned TaggedValue into a new RcStr, incrementing the Arc
/// refcount for DYNAMIC entries.
fn clone_intern_entry(tv: TaggedValue) -> RcStr {
    let tag = tv.tag_byte() & TAG_MASK;
    if tag == crate::DYNAMIC_TAG {
        unsafe {
            let arc = restore_arc(tv);
            std::mem::forget(arc.clone()); // increment refcount
            std::mem::forget(arc); // don't decrement
        }
    }
    // For STATIC and INLINE (though INLINE should never be in the table),
    // just copy the TaggedValue.
    RcStr { unsafe_data: tv }
}

/// Register a static RcStr in the intern table so that future `RcStr::from()`
/// calls for the same content return the static version (avoiding heap
/// allocation and refcounting).
pub(crate) fn intern_static(tv: TaggedValue, hash: u64) {
    debug_assert!(tv.tag_byte() & TAG_MASK == STATIC_TAG);
    let new_entry = InternEntry(tv);
    INTERN_TABLE
        .entry(hash)
        .and_modify(|entries| {
            let text = unsafe { deref_from(tv) }.value.as_str();
            // Replace any existing dynamic entry with the static one
            if let Some(pos) = entries
                .iter()
                .position(|&InternEntry(e)| unsafe { deref_from(e) }.value.as_str() == text)
            {
                let InternEntry(old) = entries[pos];
                entries[pos] = new_entry;
                // If the old entry was DYNAMIC, drop the table's Arc reference
                drop_intern_entry(old);
            } else {
                entries.push(new_entry);
            }
        })
        .or_insert_with(|| SmallVec::from_elem(new_entry, 1));
}

/// Remove a dynamic entry from the intern table by pointer identity.
/// Called from RcStr::Drop or into_owned when the refcount indicates only
/// the caller and the intern table hold references.
///
/// This also drops the table's Arc reference (decrementing the refcount).
pub(crate) fn intern_remove(tagged_value: TaggedValue) {
    let phs = unsafe { deref_from(tagged_value) };
    let hash = phs.hash;
    let needle = InternEntry(tagged_value);
    if let Some(mut entry) = INTERN_TABLE.get_mut(&hash) {
        let entries = entry.value_mut();
        if let Some(pos) = entries.iter().position(|&e| e == needle) {
            let InternEntry(removed) = entries.swap_remove(pos);
            if entries.is_empty() {
                drop(entry);
                INTERN_TABLE.remove_if(&hash, |_, entries| entries.is_empty());
            } else {
                drop(entry);
            }
            // Drop the table's Arc reference — InternEntry is Copy so removing
            // from the SmallVec didn't decrement the refcount.
            drop_intern_entry(removed);
        }
    }
}

/// Drop the Arc refcount for a DYNAMIC TaggedValue. No-op for STATIC/INLINE.
fn drop_intern_entry(tv: TaggedValue) {
    let tag = tv.tag_byte() & TAG_MASK;
    if tag == crate::DYNAMIC_TAG {
        unsafe {
            drop(restore_arc(tv));
        }
    }
}

pub enum Payload {
    String(String),
    Ref(&'static str),
}

impl Payload {
    pub(crate) fn as_str(&self) -> &str {
        match self {
            Payload::String(s) => s,
            Payload::Ref(s) => s,
        }
    }
    pub(crate) fn into_string(self) -> String {
        match self {
            Payload::String(s) => s,
            Payload::Ref(r) => r.to_string(),
        }
    }
}
impl PartialEq for Payload {
    fn eq(&self, other: &Self) -> bool {
        self.as_str() == other.as_str()
    }
}

pub struct PrehashedString {
    pub value: Payload,
    /// This is not the actual `fxhash`, but rather it's a value that passed to
    /// `write_u64` of [rustc_hash::FxHasher].
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
///
/// For strings longer than the inline threshold, this checks the global intern
/// table and returns a clone of an existing Arc if the string is already
/// interned, avoiding a new heap allocation.
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

    let hash = hash_bytes(text.as_ref().as_bytes());

    // Fast path: read lock only. Most hits go through here.
    if let Some(existing) = intern_lookup(hash, text.as_ref()) {
        return existing;
    }

    // Slow path: take the write lock via entry() and double-check.
    // This eliminates the race where two threads both miss the read lock
    // and both insert duplicate entries.
    intern_insert_or_lookup(hash, text)
}

/// Slow path for `new_atom`: acquires the write lock on the DashMap shard via
/// `entry()`, double-checks for an existing entry (another thread may have
/// inserted between our read-lock miss and this write-lock acquisition), and
/// either returns the existing entry or inserts a new one.
fn intern_insert_or_lookup<T: AsRef<str> + Into<String>>(hash: u64, text: T) -> RcStr {
    match INTERN_TABLE.entry(hash) {
        dashmap::Entry::Occupied(entry) => {
            // Double-check: another thread may have inserted while we were
            // waiting for the write lock.
            for &InternEntry(tv) in entry.get().iter() {
                let phs = unsafe { deref_from(tv) };
                if phs.value.as_str() == text.as_ref() {
                    return clone_intern_entry(tv);
                }
            }
            // Hash bucket exists but no content match (hash collision).
            // Insert our new entry alongside the existing ones.
            let arc: Arc<PrehashedString> = Arc::new(PrehashedString {
                value: Payload::String(text.into()),
                hash,
            });
            let table_arc = arc.clone();
            let rcstr = arc_to_rcstr(arc);
            let table_rcstr = arc_to_rcstr(table_arc);
            entry
                .into_ref()
                .value_mut()
                .push(InternEntry(table_rcstr.unsafe_data));
            std::mem::forget(table_rcstr);
            rcstr
        }
        dashmap::Entry::Vacant(entry) => {
            let arc: Arc<PrehashedString> = Arc::new(PrehashedString {
                value: Payload::String(text.into()),
                hash,
            });
            let table_arc = arc.clone();
            let rcstr = arc_to_rcstr(arc);
            let table_rcstr = arc_to_rcstr(table_arc);
            entry.insert(SmallVec::from_elem(InternEntry(table_rcstr.unsafe_data), 1));
            std::mem::forget(table_rcstr);
            rcstr
        }
    }
}

/// Convert a `triomphe::Arc<PrehashedString>` into an `RcStr` with DYNAMIC_TAG.
fn arc_to_rcstr(arc: Arc<PrehashedString>) -> RcStr {
    let entry = Arc::into_raw(arc);
    let ptr: NonNull<PrehashedString> = unsafe {
        // Safety: Arc::into_raw returns a non-null pointer
        NonNull::new_unchecked(entry as *mut _)
    };
    debug_assert!(0 == ptr.as_ptr() as u8 & TAG_MASK);
    RcStr {
        unsafe_data: TaggedValue::new_ptr(ptr),
    }
}

#[inline(always)]
pub(crate) fn new_static_atom(string: &'static PrehashedString) -> RcStr {
    let mut entry = string as *const PrehashedString;
    debug_assert!(0 == entry as u8 & TAG_MASK);
    // Tag it as a static pointer
    entry = ((entry as usize) | STATIC_TAG as usize) as *mut PrehashedString;
    let ptr: NonNull<PrehashedString> = unsafe {
        // Safety: references always return a non-null pointers
        NonNull::new_unchecked(entry as *mut _)
    };

    let tv = TaggedValue::new_ptr(ptr);
    // Register in the intern table so that future RcStr::from() calls for
    // the same content return this static version instead of allocating.
    intern_static(tv, string.hash);
    RcStr { unsafe_data: tv }
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

// Nothing special, digits of pi.
const SEED1: u64 = 0x243f6a8885a308d3;
const SEED2: u64 = 0x13198a2e03707344;
const PREVENT_TRIVIAL_ZERO_COLLAPSE: u64 = 0xa4093822299f31d0;

#[inline]
const fn multiply_mix(x: u64, y: u64) -> u64 {
    #[cfg(target_pointer_width = "64")]
    {
        // We compute the full u64 x u64 -> u128 product, this is a single mul
        // instruction on x86-64, one mul plus one mulhi on ARM64.
        let full = (x as u128) * (y as u128);
        let lo = full as u64;
        let hi = (full >> 64) as u64;

        // The middle bits of the full product fluctuate the most with small
        // changes in the input. This is the top bits of lo and the bottom bits
        // of hi. We can thus make the entire output fluctuate with small
        // changes to the input by XOR'ing these two halves.
        lo ^ hi

        // Unfortunately both 2^64 + 1 and 2^64 - 1 have small prime factors,
        // otherwise combining with + or - could result in a really strong hash, as:
        //     x * y = 2^64 * hi + lo = (-1) * hi + lo = lo - hi,   (mod 2^64 + 1)
        //     x * y = 2^64 * hi + lo =    1 * hi + lo = lo + hi,   (mod 2^64 - 1)
        // Multiplicative hashing is universal in a field (like mod p).
    }

    #[cfg(target_pointer_width = "32")]
    {
        // u64 x u64 -> u128 product is prohibitively expensive on 32-bit.
        // Decompose into 32-bit parts.
        let lx = x as u32;
        let ly = y as u32;
        let hx = (x >> 32) as u32;
        let hy = (y >> 32) as u32;

        // u32 x u32 -> u64 the low bits of one with the high bits of the other.
        let afull = (lx as u64) * (hy as u64);
        let bfull = (hx as u64) * (ly as u64);

        // Combine, swapping low/high of one of them so the upper bits of the
        // product of one combine with the lower bits of the other.
        afull ^ bfull.rotate_right(32)
    }
}

// Const compatible helper function to read a u64 from a byte array at a given
// offset
// SAFETY: The caller must ensure that `bytes.len() >= offset + 8`
#[inline(always)]
const unsafe fn read_u64_le(bytes: &[u8], offset: usize) -> u64 {
    debug_assert!(offset + 8 <= bytes.len());
    // Reinterpret the pointer as an array of length 8 at the given offset
    // SAFETY: it is our callers responsibility to ensure the offset is in range
    let array = unsafe { bytes.as_ptr().add(offset) } as *const [u8; 8];
    // SAFETY: this dereference is safe since we started with a reference (non-null) and an in range
    // offset (callers responsibility)
    u64::from_le_bytes(unsafe { *array })
}

// Const compatible helper function to read a u32 from a byte array at a given
// offset
// SAFETY: The caller must ensure that `bytes.len() >= offset + 4`
#[inline(always)]
const unsafe fn read_u32_le(bytes: &[u8], offset: usize) -> u32 {
    debug_assert!(offset + 4 <= bytes.len());
    // SAFETY: it is our callers responsibility to ensure the offset is in range
    let array = unsafe { bytes.as_ptr().add(offset) } as *const [u8; 4];
    // SAFETY: this dereference is safe since we started with a reference (non-null) and an in range
    // offset (callers responsibility)
    u32::from_le_bytes(unsafe { *array })
}

/// Copied from `hash_bytes` of `rustc-hash`.
///
/// See: https://github.com/rust-lang/rustc-hash/blob/dc5c33f1283de2da64d8d7a06401d91aded03ad4/src/lib.rs#L252-L297
///
/// ---
///
/// A wyhash-inspired non-collision-resistant hash for strings/slices designed
/// by Orson Peters, with a focus on small strings and small codesize.
///
/// The 64-bit version of this hash passes the SMHasher3 test suite on the full
/// 64-bit output, that is, f(hash_bytes(b) ^ f(seed)) for some good avalanching
/// permutation f() passed all tests with zero failures. When using the 32-bit
/// version of multiply_mix this hash has a few non-catastrophic failures where
/// there are a handful more collisions than an optimal hash would give.
///
/// We don't bother avalanching here as we'll feed this hash into a
/// multiplication after which we take the high bits, which avalanches for us.
#[inline]
#[doc(hidden)]
pub const fn hash_bytes(bytes: &[u8]) -> u64 {
    let len = bytes.len();
    let mut s0 = SEED1;
    let mut s1 = SEED2;

    if len <= 16 {
        // XOR the input into s0, s1.
        if len >= 8 {
            // SAFETY: we just checked that len is `>= 8` so these offsets are in range
            s0 ^= unsafe { read_u64_le(bytes, 0) };
            s1 ^= unsafe { read_u64_le(bytes, len - 8) };
        } else if len >= 4 {
            // SAFETY: we just checked that len is `>= 4` so these offsets are in range
            s0 ^= unsafe { read_u32_le(bytes, 0) } as u64;
            s1 ^= unsafe { read_u32_le(bytes, len - 4) } as u64;
        } else if len > 0 {
            let lo = bytes[0];
            let mid = bytes[len / 2];
            let hi = bytes[len - 1];
            s0 ^= lo as u64;
            s1 ^= ((hi as u64) << 8) | mid as u64;
        }
    } else {
        // Handle bulk (can partially overlap with suffix).
        let mut off = 0;
        while off < len - 16 {
            // SAFETY: we just checked that `off >= 16`` away from the end
            // so these offsets are in range.
            let x = unsafe { read_u64_le(bytes, off) };
            let y = unsafe { read_u64_le(bytes, off + 8) };

            // Replace s1 with a mix of s0, x, and y, and s0 with s1.
            // This ensures the compiler can unroll this loop into two
            // independent streams, one operating on s0, the other on s1.
            //
            // Since zeroes are a common input we prevent an immediate trivial
            // collapse of the hash function by XOR'ing a constant with y.
            let t = multiply_mix(s0 ^ x, PREVENT_TRIVIAL_ZERO_COLLAPSE ^ y);
            s0 = s1;
            s1 = t;
            off += 16;
        }

        // SAFETY:At this point `len >16` so both these sutractions are >0 and more than 8 away from
        // the end.`
        s0 ^= unsafe { read_u64_le(bytes, len - 16) };
        s1 ^= unsafe { read_u64_le(bytes, len - 8) };
    }

    multiply_mix(s0, s1) ^ (len as u64)
}

#[cfg(test)]
mod tests {
    use std::hash::{Hash, Hasher};

    use rustc_hash::FxHasher;

    use crate::RcStr;

    // Ensure that the hash value is the same as the one generated by FxHasher.
    //
    // This is important for `Borrow<str>` implementation to be correct.
    // Note that if we enable `nightly` feature of `rustc-hash`, we need to remove
    // `state.write_u8(0xff);` from the hash implementation of `RcStr`.
    #[test]
    fn test_hash() {
        let long_string = "A very long long long string that would not be inlined";

        {
            let u64_value = super::hash_bytes(long_string.as_bytes());
            dbg!(u64_value);
            let mut hasher = FxHasher::default();
            hasher.write_u64(u64_value);
            let expected = hasher.finish();

            println!("Expected: {expected:?}");
        }

        let str = RcStr::from(long_string);
        assert_eq!(fxhash(str.clone()), fxhash(long_string));
        assert_eq!(fxhash((1, str, 1)), fxhash((1, long_string, 1)));
    }

    fn fxhash<T: Hash>(value: T) -> u64 {
        let mut hasher = FxHasher::default();
        value.hash(&mut hasher);
        hasher.finish()
    }
}
