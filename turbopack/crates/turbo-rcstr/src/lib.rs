// Allow the `rcstr!` proc macro's emitted `::turbo_rcstr::...` paths to
// resolve when used inside this crate's own source (e.g. tests, doctests).
extern crate self as turbo_rcstr;

use std::{
    borrow::{Borrow, Cow},
    collections::HashMap,
    ffi::OsStr,
    fmt::{Debug, Display},
    hash::{Hash, Hasher},
    mem::{ManuallyDrop, forget},
    num::NonZeroU8,
    ops::Deref,
    path::{Path, PathBuf},
    sync::LazyLock,
};

use bincode::{
    Decode, Encode,
    de::{Decoder, read::Reader},
    enc::Encoder,
    error::{DecodeError, EncodeError},
    impl_borrow_decode,
};
use bytes_str::BytesStr;
use debug_unreachable::debug_unreachable;
use rustc_hash::FxBuildHasher;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use shrink_to_fit::ShrinkToFit;
use smallvec::SmallVec;
use triomphe::Arc;
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher};

use crate::{
    dynamic::{
        DynamicPrehashedString, deref_dynamic, deref_static, hash_bytes, new_atom,
        new_atom_from_prehashed, new_static_atom,
    },
    tagged_value::{MAX_INLINE_LEN, TaggedValue},
};

mod dynamic;
mod tagged_value;

/// An immutable reference counted [`String`], similar to [`Arc<String>`][std::sync::Arc].
///
/// This is the preferred immutable string type for [`turbo_tasks::function`][func] arguments and
/// inside of [`turbo_tasks::value`][value].
///
/// As turbo-tasks must store copies of function arguments to enable caching, non-reference counted
/// [`String`]s would incur frequent cloning. Reference counting typically decreases memory
/// consumption and CPU time in these cases.
///
/// [func]: https://turbopack-rust-docs.vercel.sh/rustdoc/turbo_tasks/attr.function.html
/// [value]: https://turbopack-rust-docs.vercel.sh/rustdoc/turbo_tasks/attr.value.html
///
/// ## Conversion
///
/// Converting a `String` or `&str` to an `RcStr` can be performed using `.into()`,
/// `RcStr::from(...)`, or the `rcstr!` macro.
///
/// ```
/// # use turbo_rcstr::{RcStr, rcstr};
/// #
/// let s = "foo";
/// let rc_s1: RcStr = s.into();
/// let rc_s2 = RcStr::from(s);
/// let rc_s3 = rcstr!("foo");
/// assert_eq!(rc_s1, rc_s2);
/// ```
///
/// Generally speaking you should
///  * use `rcstr!` when converting a `const`-compatible `str`
///  * use `RcStr::from` for readability
///  * use `.into()` when context makes it clear.
///
/// Converting from an [`RcStr`] to a `&str` should be done with [`RcStr::as_str`]. Converting to a
/// `String` should be done with [`RcStr::into_owned`].
///
/// ## Future Optimizations
///
/// This type is intentionally opaque to allow for optimizations to the underlying representation.
/// Future implementations may use inline representations or interning.
//
// If you want to change the underlying string type to `Arc<str>`, please ensure that you profile
// performance. The current implementation offers very cheap `String -> RcStr -> String`, meaning we
// only pay for the allocation for `Arc` when we pass `format!("").into()` to a function.
pub struct RcStr {
    unsafe_data: TaggedValue,
}

const _: () = {
    // Enforce that RcStr triggers the non-zero size optimization.
    assert!(std::mem::size_of::<RcStr>() == std::mem::size_of::<Option<RcStr>>());
};

unsafe impl Send for RcStr {}
unsafe impl Sync for RcStr {}

// Marks a payload that is stored in an Arc
const DYNAMIC_TAG: u8 = 0b_10;
// Marks a payload that has been leaked since it has a static lifetime
const STATIC_TAG: u8 = 0b_00;
// The payload is stored inline
const INLINE_TAG: u8 = 0b_01; // len in upper nybble
const INLINE_TAG_INIT: NonZeroU8 = NonZeroU8::new(INLINE_TAG).unwrap();
const TAG_MASK: u8 = 0b_11;
// For inline tags the length is stored in the upper 4 bits of the tag byte
const LEN_OFFSET: usize = 4;
const LEN_MASK: u8 = 0xf0;

impl RcStr {
    #[inline(always)]
    fn tag(&self) -> u8 {
        self.unsafe_data.tag_byte() & TAG_MASK
    }

    #[inline(never)]
    pub fn as_str(&self) -> &str {
        match self.tag() {
            STATIC_TAG => unsafe { deref_static(self.unsafe_data).value },
            DYNAMIC_TAG => unsafe { &deref_dynamic(self.unsafe_data).value },
            INLINE_TAG => self.inline_as_str(),
            _ => unsafe { debug_unreachable!() },
        }
    }

    fn inline_as_str(&self) -> &str {
        debug_assert!(self.tag() == INLINE_TAG);
        let len = (self.unsafe_data.tag_byte() & LEN_MASK) >> LEN_OFFSET;
        let src = self.unsafe_data.data();
        unsafe { std::str::from_utf8_unchecked(&src[..(len as usize)]) }
    }

    /// Returns an owned mutable [`String`].
    ///
    /// This implementation is more efficient than [`ToString::to_string`]:
    ///
    /// - If the reference count is 1, the `Arc` can be unwrapped, giving ownership of the
    ///   underlying string without cloning in `O(1)` time.
    /// - This avoids some of the potential overhead of the `Display` trait.
    pub fn into_owned(self) -> String {
        match self.tag() {
            DYNAMIC_TAG => {
                // convert `self` into `arc`
                let arc = unsafe { dynamic::restore_arc(ManuallyDrop::new(self).unsafe_data) };
                match Arc::try_unwrap(arc) {
                    // `String::from(Box<str>)` reuses the boxed allocation, so this is O(1).
                    Ok(v) => String::from(v.value),
                    Err(arc) => arc.value.to_string(),
                }
            }
            INLINE_TAG => self.inline_as_str().to_string(),
            STATIC_TAG => unsafe { deref_static(self.unsafe_data).value.to_string() },
            _ => unsafe { debug_unreachable!() },
        }
    }

    pub fn map(self, f: impl FnOnce(String) -> String) -> Self {
        RcStr::from(Cow::Owned(f(self.into_owned())))
    }

    /// Create an RcStr from a deserialized string, checking the static constant
    /// table first. If the string matches an `rcstr!` constant, returns a
    /// zero-cost static copy instead of allocating a new Arc.
    ///
    /// Accepts `&str` so that borrow-decode paths can avoid heap allocation
    /// entirely for inline strings (≤7 bytes) and static table hits.
    fn from_deserialized(s: &str) -> Self {
        if !is_atom_inlineable(s) {
            let hash = hash_bytes(s.as_bytes());
            // Check the static table
            if let Some(entries) = STATIC_TABLE.get(&hash)
                && let Some(static_phs) = entries.iter().find(|phs| phs.value == s)
            {
                new_static_atom(static_phs)
            } else {
                new_atom_from_prehashed(DynamicPrehashedString {
                    hash,
                    value: s.into(),
                })
            }
        } else {
            inline_atom(s).unwrap()
        }
    }
}

impl DeterministicHash for RcStr {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        state.write_usize(self.len());
        state.write_bytes(self.as_bytes());
    }
}

impl Deref for RcStr {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        self.as_str()
    }
}

impl Borrow<str> for RcStr {
    fn borrow(&self) -> &str {
        self.as_str()
    }
}

impl AsRef<str> for RcStr {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl From<BytesStr> for RcStr {
    fn from(s: BytesStr) -> Self {
        let bytes: Vec<u8> = s.into_bytes().into();
        RcStr::from(unsafe {
            // Safety: BytesStr are valid utf-8
            String::from_utf8_unchecked(bytes)
        })
    }
}

impl From<Arc<String>> for RcStr {
    fn from(s: Arc<String>) -> Self {
        match Arc::try_unwrap(s) {
            Ok(v) => new_atom(Cow::Owned(v)),
            Err(arc) => new_atom(Cow::Borrowed(&**arc)),
        }
    }
}

impl From<String> for RcStr {
    fn from(s: String) -> Self {
        new_atom(Cow::Owned(s))
    }
}

impl From<&'_ str> for RcStr {
    fn from(s: &str) -> Self {
        new_atom(Cow::Borrowed(s))
    }
}

impl From<Cow<'_, str>> for RcStr {
    fn from(s: Cow<str>) -> Self {
        new_atom(s)
    }
}

/// Mimic `&str`
impl AsRef<Path> for RcStr {
    fn as_ref(&self) -> &Path {
        self.as_str().as_ref()
    }
}

/// Mimic `&str`
impl AsRef<OsStr> for RcStr {
    fn as_ref(&self) -> &OsStr {
        self.as_str().as_ref()
    }
}

/// Mimic `&str`
impl AsRef<[u8]> for RcStr {
    fn as_ref(&self) -> &[u8] {
        self.as_str().as_ref()
    }
}

impl From<RcStr> for BytesStr {
    fn from(value: RcStr) -> Self {
        Self::from_str_slice(value.as_str())
    }
}

impl PartialEq<str> for RcStr {
    fn eq(&self, other: &str) -> bool {
        self.as_str() == other
    }
}

impl PartialEq<&'_ str> for RcStr {
    fn eq(&self, other: &&str) -> bool {
        self.as_str() == *other
    }
}

impl PartialEq<String> for RcStr {
    fn eq(&self, other: &String) -> bool {
        self.as_str() == other.as_str()
    }
}

impl Debug for RcStr {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Debug::fmt(&self.as_str(), f)
    }
}

impl Display for RcStr {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Display::fmt(&self.as_str(), f)
    }
}

impl From<RcStr> for String {
    fn from(s: RcStr) -> Self {
        s.into_owned()
    }
}

impl From<RcStr> for PathBuf {
    fn from(s: RcStr) -> Self {
        String::from(s).into()
    }
}

impl Clone for RcStr {
    #[inline(always)]
    fn clone(&self) -> Self {
        // We only need to increment the ref count for DYNAMIC_TAG values.
        // For STATIC_TAG and INLINE_TAG we can just copy the value.
        if self.tag() == DYNAMIC_TAG {
            unsafe {
                let arc = dynamic::restore_arc(self.unsafe_data);
                forget(arc.clone());
                forget(arc);
            }
        }

        RcStr {
            unsafe_data: self.unsafe_data,
        }
    }
}

impl Default for RcStr {
    fn default() -> Self {
        rcstr!("")
    }
}

impl PartialEq for RcStr {
    fn eq(&self, other: &Self) -> bool {
        // For inline RcStrs this is sufficient and for out of line values it handles a simple
        // identity cases
        if self.unsafe_data == other.unsafe_data {
            return true;
        }
        // If either side is inline, they can't be equal: an inline string is always shorter than
        // any heap-allocated one (construction splits on length), and two inline strings would
        // have been caught by the `unsafe_data == unsafe_data` check above.
        if self.tag() == INLINE_TAG || other.tag() == INLINE_TAG {
            return false;
        }

        // slow path compare precomputed hashes and string refs
        let (l_hash, l_str) = unsafe { heap_hash_and_str(self) };
        let (r_hash, r_str) = unsafe { heap_hash_and_str(other) };
        l_hash == r_hash && l_str == r_str
    }
}

/// Caller must ensure `s.tag()` is `STATIC_TAG` or `DYNAMIC_TAG`.
#[inline]
unsafe fn heap_hash_and_str(s: &RcStr) -> (u64, &str) {
    match s.tag() {
        STATIC_TAG => {
            let p = unsafe { deref_static(s.unsafe_data) };
            (p.hash, p.value)
        }
        DYNAMIC_TAG => {
            let p = unsafe { deref_dynamic(s.unsafe_data) };
            (p.hash, &p.value)
        }
        _ => unsafe { debug_unreachable!() },
    }
}

impl Eq for RcStr {}

impl PartialOrd for RcStr {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for RcStr {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.as_str().cmp(other.as_str())
    }
}

impl Hash for RcStr {
    fn hash<H: Hasher>(&self, state: &mut H) {
        match self.tag() {
            STATIC_TAG => {
                state.write_u64(unsafe { deref_static(self.unsafe_data).hash });
                state.write_u8(0xff); // matches the implementation of the `str` Hash impl
            }
            DYNAMIC_TAG => {
                state.write_u64(unsafe { deref_dynamic(self.unsafe_data).hash });
                state.write_u8(0xff); // matches the implementation of the `str` Hash impl
            }
            INLINE_TAG => {
                self.inline_as_str().hash(state);
            }
            _ => unsafe { debug_unreachable!() },
        }
    }
}

impl Serialize for RcStr {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for RcStr {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct RcStrVisitor;

        impl serde::de::Visitor<'_> for RcStrVisitor {
            type Value = RcStr;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("a string")
            }

            fn visit_str<E: serde::de::Error>(self, v: &str) -> Result<RcStr, E> {
                Ok(RcStr::from_deserialized(v))
            }

            fn visit_string<E: serde::de::Error>(self, v: String) -> Result<RcStr, E> {
                Ok(RcStr::from_deserialized(&v))
            }
        }

        deserializer.deserialize_str(RcStrVisitor)
    }
}

impl Encode for RcStr {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        self.as_str().encode(encoder)
    }
}

impl<Context> Decode<Context> for RcStr {
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        // Decode the length prefix
        let len = u64::decode(decoder)?;
        let len: usize = len
            .try_into()
            .map_err(|_| DecodeError::OutsideUsizeRange(len))?;

        if unty::type_equal::<D::R, turbo_bincode::TurboBincodeReader>() {
            // We know the reader is a TurboBincodeReader backed by &[u8], so peek_read
            // returning None means data corruption (not enough bytes), not "unsupported".
            let bytes = decoder
                .reader()
                .peek_read(len)
                .ok_or(DecodeError::UnexpectedEnd { additional: len })?;
            let s = core::str::from_utf8(bytes).map_err(|inner| DecodeError::Utf8 { inner })?;
            let rcstr = RcStr::from_deserialized(s);
            decoder.reader().consume(len);
            Ok(rcstr)
        } else {
            unreachable!(
                "RcStr::decode expected TurboBincodeReader, but was called with a {} reader",
                std::any::type_name::<D::R>(),
            )
        }
    }
}

impl_borrow_decode!(RcStr);

impl Drop for RcStr {
    fn drop(&mut self) {
        match self.tag() {
            DYNAMIC_TAG => unsafe { drop(dynamic::restore_arc(self.unsafe_data)) },
            INLINE_TAG | STATIC_TAG => {
                // no-ops
            }
            _ => unsafe { debug_unreachable!() },
        }
    }
}

// Exports for our macro
#[doc(hidden)]
pub const fn inline_atom(s: &str) -> Option<RcStr> {
    dynamic::inline_atom(s)
}

// Exports for our macro
#[doc(hidden)]
pub const fn is_atom_inlineable(s: &str) -> bool {
    s.len() <= MAX_INLINE_LEN
}

#[doc(hidden)]
#[inline(always)]
pub const fn from_static(s: &'static StaticPrehashedString) -> RcStr {
    dynamic::new_static_atom(s)
}
#[doc(hidden)]
pub use dynamic::StaticPrehashedString;

#[doc(hidden)]
pub const fn make_const_prehashed_string(text: &'static str) -> StaticPrehashedString {
    StaticPrehashedString {
        value: text,
        hash: hash_bytes(text.as_bytes()),
    }
}

// Re-export inventory so the rcstr! macro can reference it via $crate::inventory
#[doc(hidden)]
pub use inventory;

/// Wrapper for collecting `rcstr!` static constants via `inventory`.
#[doc(hidden)]
pub struct StaticRcStr(pub &'static StaticPrehashedString);

inventory::collect!(StaticRcStr);

/// Forwarder around [`inventory::submit!`] that lets the `rcstr!` proc macro
/// emit a single path it can rely on, without depending on whether
/// `turbo_rcstr::inventory` is reachable as a macro path in the call site
/// crate. Macros emitted from a proc macro lose access to the proc macro
/// crate's deps, so the submission has to bounce through this declarative
/// macro defined where `inventory::submit!` is in scope.
#[doc(hidden)]
#[macro_export]
macro_rules! __rcstr_inventory_submit {
    ($value:expr) => {
        $crate::inventory::submit!($value);
    };
}

/// Read-only lookup table mapping precomputed hash -> static StaticPrehashedString.
/// Built once on first access from all `rcstr!` constants collected by `inventory`.
///
/// Multiple `rcstr!` calls with the same string content will each submit to
/// inventory, but we deduplicate by content here so only one entry per unique
/// string is stored.
static STATIC_TABLE: LazyLock<
    HashMap<u64, SmallVec<[&'static StaticPrehashedString; 1]>, FxBuildHasher>,
> = LazyLock::new(|| {
    let mut map: HashMap<u64, SmallVec<[&'static StaticPrehashedString; 1]>, FxBuildHasher> =
        HashMap::with_hasher(FxBuildHasher);
    for StaticRcStr(phs) in inventory::iter::<StaticRcStr> {
        if phs.value.len() <= MAX_INLINE_LEN {
            // This is rare, but possible if our macro cannot determine the length of the string at
            // macro time we may end up with a wasted StaticPrehashedString submitted to inventory.

            // Just skip it
            continue;
        }
        let entries = map.entry(phs.hash).or_default();
        // Deduplicate: skip if an entry with the same string content exists
        // Mostly linkers will merge static strings but this isn't guaranteed so we cannot just rely
        // on pointer equality.
        if !entries.iter().any(|e| e.value == phs.value) {
            entries.push(phs);
        }
    }
    map.shrink_to_fit(); // this map will never change again
    map
});

/// Create an rcstr from a string literal.
/// Allocates the RcStr inline when possible, otherwise uses a static `PrehashedString`.  In
/// either case this is a compile time constant
pub use turbo_rcstr_macros::rcstr;

/// noop
impl ShrinkToFit for RcStr {
    #[inline(always)]
    fn shrink_to_fit(&mut self) {}
}

#[cfg(all(feature = "napi", target_family = "wasm"))]
compile_error!("The napi feature cannot be enabled for wasm targets");

#[cfg(all(feature = "napi", not(target_family = "wasm")))]
mod napi_impl {
    use napi::{
        bindgen_prelude::{FromNapiValue, ToNapiValue, TypeName, ValidateNapiValue},
        sys::{napi_env, napi_value},
    };

    use super::*;

    impl TypeName for RcStr {
        fn type_name() -> &'static str {
            String::type_name()
        }

        fn value_type() -> napi::ValueType {
            String::value_type()
        }
    }

    impl ToNapiValue for RcStr {
        unsafe fn to_napi_value(env: napi_env, val: Self) -> napi::Result<napi_value> {
            unsafe { ToNapiValue::to_napi_value(env, val.as_str()) }
        }
    }

    impl FromNapiValue for RcStr {
        unsafe fn from_napi_value(env: napi_env, napi_val: napi_value) -> napi::Result<Self> {
            Ok(RcStr::from(unsafe {
                String::from_napi_value(env, napi_val)
            }?))
        }
    }

    impl ValidateNapiValue for RcStr {
        unsafe fn validate(env: napi_env, napi_val: napi_value) -> napi::Result<napi_value> {
            unsafe { String::validate(env, napi_val) }
        }
    }
}

/// Runtime string interning table.
///
/// Deduplicates strings by storing them in an `FxHashSet<RcStr>`. Strings
/// shorter than the inline threshold are already zero-allocation, so only
/// longer strings benefit from interning.
pub struct RcStrInterning {
    set: rustc_hash::FxHashSet<RcStr>,
}

impl Default for RcStrInterning {
    fn default() -> Self {
        Self::new()
    }
}

impl RcStrInterning {
    /// Create a new empty interning table.
    pub fn new() -> Self {
        Self {
            set: rustc_hash::FxHashSet::default(),
        }
    }

    /// Intern a string slice. Returns a cheap-to-clone [`RcStr`].
    ///
    /// Strings below the inline threshold are returned directly (they are
    /// already zero-allocation inline atoms). Longer strings are looked up
    /// in the interning table and deduplicated.
    pub fn intern(&mut self, s: &str) -> RcStr {
        if is_atom_inlineable(s) {
            // Inline atom — no allocation needed, don't bother with the set.
            return RcStr::from(s);
        }
        if let Some(existing) = self.set.get(s) {
            return existing.clone();
        }
        let rc = RcStr::from(s);
        self.set.insert(rc.clone());
        rc
    }

    /// Intern an owned `String`. When the string is not yet interned, avoids
    /// an extra copy compared to [`intern`](Self::intern).
    fn intern_owned(&mut self, s: String) -> RcStr {
        if is_atom_inlineable(&s) {
            return RcStr::from(s);
        }
        if let Some(existing) = self.set.get(s.as_str()) {
            return existing.clone();
        }
        let rc = RcStr::from(s);
        self.set.insert(rc.clone());
        rc
    }

    /// Intern a `Cow<str>`. When the cow is `Owned`, avoids an extra copy
    /// if the string is not yet interned.
    pub fn intern_cow(&mut self, s: std::borrow::Cow<'_, str>) -> RcStr {
        match s {
            std::borrow::Cow::Borrowed(s) => self.intern(s),
            std::borrow::Cow::Owned(s) => self.intern_owned(s),
        }
    }

    /// Intern the [`Display`](std::fmt::Display) output of a value.
    pub fn intern_display(&mut self, v: &impl std::fmt::Display) -> RcStr {
        self.intern_owned(v.to_string())
    }
}

#[cfg(test)]
mod tests {
    use std::mem::ManuallyDrop;

    use super::*;

    #[test]
    fn test_refcount() {
        fn refcount(str: &RcStr) -> usize {
            assert!(str.tag() == DYNAMIC_TAG);
            let arc = ManuallyDrop::new(unsafe { dynamic::restore_arc(str.unsafe_data) });
            triomphe::Arc::count(&arc)
        }

        let str = RcStr::from("this is a long string that won't be inlined");

        assert_eq!(refcount(&str), 1);
        assert_eq!(refcount(&str), 1); // refcount should not modify the refcount itself

        let cloned_str = str.clone();
        assert_eq!(refcount(&str), 2);

        drop(cloned_str);
        assert_eq!(refcount(&str), 1);

        let _ = str.clone().into_owned();
        assert_eq!(refcount(&str), 1);
    }

    #[test]
    fn test_rcstr() {
        // Test enough to exceed the small string optimization
        assert_eq!(rcstr!(""), RcStr::default());
        assert_eq!(rcstr!(""), RcStr::from(""));
        assert_eq!(rcstr!("a"), RcStr::from("a"));
        assert_eq!(rcstr!("ab"), RcStr::from("ab"));
        assert_eq!(rcstr!("abc"), RcStr::from("abc"));
        assert_eq!(rcstr!("abcd"), RcStr::from("abcd"));
        assert_eq!(rcstr!("abcde"), RcStr::from("abcde"));
        assert_eq!(rcstr!("abcdef"), RcStr::from("abcdef"));
        assert_eq!(rcstr!("abcdefg"), RcStr::from("abcdefg"));
        assert_eq!(rcstr!("abcdefgh"), RcStr::from("abcdefgh"));
        assert_eq!(rcstr!("abcdefghi"), RcStr::from("abcdefghi"));
    }

    #[test]
    fn test_static_atom() {
        const LONG: &str = "a very long string that lives forever";
        let leaked = rcstr!(LONG);
        let not_leaked = RcStr::from(LONG);
        assert_ne!(leaked.tag(), not_leaked.tag());
        assert_eq!(leaked, not_leaked);
    }

    #[test]
    fn test_inline_atom() {
        // This is a silly test, just asserts that we can evaluate this in a constant context.
        const STR: RcStr = {
            let inline = inline_atom("hello");
            if inline.is_some() {
                inline.unwrap()
            } else {
                unreachable!();
            }
        };
        assert_eq!(STR, RcStr::from("hello"));
    }

    #[test]
    fn test_hash_matches_str() {
        use std::hash::{Hash, Hasher};

        use rustc_hash::FxHasher;

        fn fxhash<T: Hash>(value: T) -> u64 {
            let mut hasher = FxHasher::default();
            value.hash(&mut hasher);
            hasher.finish()
        }

        // Test various string lengths covering inline and prehashed storage
        let test_strings = [
            "",
            "a",
            "ab",
            "abc",
            "abcdef",  // max inline (6 chars)
            "abcdefg", // just beyond inline (7 chars)
            "abcdefgh",
            "a very long string that exceeds sixteen bytes",
        ];

        // Test RcStr vs &str
        for s in test_strings {
            let rcstr = RcStr::from(s);
            assert_eq!(
                fxhash(&rcstr),
                fxhash(s),
                "Hash mismatch for string of length {}: {:?}",
                s.len(),
                s
            );
        }

        // Test (RcStr, RcStr) vs (&str, &str)
        for s1 in test_strings {
            for s2 in test_strings {
                let rcstr1 = RcStr::from(s1);
                let rcstr2 = RcStr::from(s2);
                assert_eq!(
                    fxhash((&rcstr1, &rcstr2)),
                    fxhash((s1, s2)),
                    "Tuple hash mismatch for ({:?}, {:?})",
                    s1,
                    s2
                );
            }
        }
    }

    #[test]
    fn test_bincode_roundtrip() {
        use turbo_bincode::{turbo_bincode_decode, turbo_bincode_encode};

        // Test inline string
        let short = RcStr::from("hi");
        let encoded = turbo_bincode_encode(&short).unwrap();
        let decoded: RcStr = turbo_bincode_decode(&encoded).unwrap();
        assert_eq!(decoded, short);
        assert_eq!(decoded.tag(), INLINE_TAG);

        // Test dynamic string (no static match)
        let long = RcStr::from("bincode_roundtrip: no matching rcstr constant");
        let encoded = turbo_bincode_encode(&long).unwrap();
        let decoded: RcStr = turbo_bincode_decode(&encoded).unwrap();
        assert_eq!(decoded, long);
        assert_eq!(decoded.tag(), DYNAMIC_TAG);

        // Test static dedup via decode
        const STATIC_STR: &str = "bincode_roundtrip: a static constant for testing";
        let _register = rcstr!(STATIC_STR);
        let original = RcStr::from(STATIC_STR); // DYNAMIC since from() doesn't check
        let encoded = turbo_bincode_encode(&original).unwrap();
        let decoded: RcStr = turbo_bincode_decode(&encoded).unwrap();
        assert_eq!(decoded.as_str(), STATIC_STR);
        // Decoded via peek_read path should find the static constant
        assert_eq!(decoded.tag(), STATIC_TAG);
    }

    #[test]
    fn test_interning() {
        let mut interner = RcStrInterning::new();

        // Short strings are always inline (no interning needed)
        let a = interner.intern("hi");
        let b = interner.intern("hi");
        assert_eq!(a, b);

        // Long strings should be deduplicated to the same allocation.
        let long = "this is a long string that exceeds inline threshold";
        let c = interner.intern(long);
        let d = interner.intern(long);
        assert_eq!(c, d);
        assert!(std::ptr::eq(c.as_str().as_ptr(), d.as_str().as_ptr()));

        // intern_cow with borrowed — same allocation as c
        let e = interner.intern_cow(std::borrow::Cow::Borrowed(long));
        assert_eq!(e, c);
        assert!(std::ptr::eq(e.as_str().as_ptr(), c.as_str().as_ptr()));

        // intern_cow with owned — same allocation as c (no new alloc)
        let f = interner.intern_cow(std::borrow::Cow::Owned(long.to_string()));
        assert_eq!(f, c);
        assert!(std::ptr::eq(f.as_str().as_ptr(), c.as_str().as_ptr()));

        // intern_display — a fresh long string, verify it is interned too
        let long2 = "another long string that exceeds the inline threshold here";
        let g = interner.intern_display(&long2);
        let h = interner.intern_display(&long2);
        assert_eq!(g, h);
        assert!(std::ptr::eq(g.as_str().as_ptr(), h.as_str().as_ptr()));
    }
}
