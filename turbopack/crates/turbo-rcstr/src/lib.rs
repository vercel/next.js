use std::{
    borrow::{Borrow, Cow},
    ffi::OsStr,
    fmt::{Debug, Display},
    hash::{Hash, Hasher},
    mem::{ManuallyDrop, forget},
    num::NonZeroU8,
    ops::Deref,
    path::{Path, PathBuf},
};

use bytes_str::BytesStr;
use debug_unreachable::debug_unreachable;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use shrink_to_fit::ShrinkToFit;
use triomphe::Arc;
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher};

use crate::{
    dynamic::{deref_from, new_atom},
    tagged_value::TaggedValue,
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
/// Converting a `String` or `&str` to an `RcStr` can be perfomed using `.into()`,
/// `RcStr::from(...)`, or the `rcstr!` macro.
///
/// ```
/// # use turbo_rcstr::RcStr;
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

unsafe impl Send for RcStr {}
unsafe impl Sync for RcStr {}

const DYNAMIC_TAG: u8 = 0b_00;
const INLINE_TAG: u8 = 0b_01; // len in upper nybble
const INLINE_TAG_INIT: NonZeroU8 = NonZeroU8::new(INLINE_TAG).unwrap();
const TAG_MASK: u8 = 0b_11;
const LEN_OFFSET: usize = 4;
const LEN_MASK: u8 = 0xf0;

impl RcStr {
    #[inline(always)]
    fn tag(&self) -> u8 {
        self.unsafe_data.tag() & TAG_MASK
    }

    #[inline(never)]
    pub fn as_str(&self) -> &str {
        match self.tag() {
            DYNAMIC_TAG => unsafe { dynamic::deref_from(self.unsafe_data).value.as_str() },
            INLINE_TAG => {
                let len = (self.unsafe_data.tag() & LEN_MASK) >> LEN_OFFSET;
                let src = self.unsafe_data.data();
                unsafe { std::str::from_utf8_unchecked(&src[..(len as usize)]) }
            }
            _ => unsafe { debug_unreachable!() },
        }
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
                    Ok(v) => v.value,
                    Err(arc) => arc.value.to_string(),
                }
            }
            INLINE_TAG => self.as_str().to_string(),
            _ => unsafe { debug_unreachable!() },
        }
    }

    pub fn map(self, f: impl FnOnce(String) -> String) -> Self {
        RcStr::from(Cow::Owned(f(self.into_owned())))
    }

    #[inline]
    pub(crate) fn from_alias(alias: TaggedValue) -> Self {
        if alias.tag() & TAG_MASK == DYNAMIC_TAG {
            unsafe {
                let arc = dynamic::restore_arc(alias);
                forget(arc.clone());
                forget(arc);
            }
        }

        Self { unsafe_data: alias }
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
        Self::from_alias(self.unsafe_data)
    }
}

impl Default for RcStr {
    fn default() -> Self {
        rcstr!("")
    }
}

impl PartialEq for RcStr {
    fn eq(&self, other: &Self) -> bool {
        match (self.tag(), other.tag()) {
            (DYNAMIC_TAG, DYNAMIC_TAG) => {
                let l = unsafe { deref_from(self.unsafe_data) };
                let r = unsafe { deref_from(other.unsafe_data) };
                l.hash == r.hash && l.value == r.value
            }
            (INLINE_TAG, INLINE_TAG) => self.unsafe_data == other.unsafe_data,
            _ => false,
        }
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
            DYNAMIC_TAG => {
                let l = unsafe { deref_from(self.unsafe_data) };
                state.write_u64(l.hash);
                state.write_u8(0xff);
            }
            INLINE_TAG => {
                self.as_str().hash(state);
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
        let s = String::deserialize(deserializer)?;
        Ok(RcStr::from(s))
    }
}

impl Drop for RcStr {
    fn drop(&mut self) {
        if self.tag() == DYNAMIC_TAG {
            unsafe { drop(dynamic::restore_arc(self.unsafe_data)) }
        }
    }
}

#[doc(hidden)]
pub const fn inline_atom(s: &str) -> Option<RcStr> {
    dynamic::inline_atom(s)
}

/// Create an rcstr from a string literal.
/// allocates the RcStr inline when possible otherwise uses a `LazyLock` to manage the allocation.
#[macro_export]
macro_rules! rcstr {
    ($s:expr) => {{
        const INLINE: core::option::Option<$crate::RcStr> = $crate::inline_atom($s);
        // this condition should be able to be compile time evaluated and inlined.
        if INLINE.is_some() {
            INLINE.unwrap()
        } else {
            #[inline(never)]
            fn get_rcstr() -> $crate::RcStr {
                static CACHE: std::sync::LazyLock<$crate::RcStr> =
                    std::sync::LazyLock::new(|| $crate::RcStr::from($s));

                (*CACHE).clone()
            }
            get_rcstr()
        }
    }};
}

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
}
