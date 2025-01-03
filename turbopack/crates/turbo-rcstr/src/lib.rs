use std::{
    borrow::{Borrow, Cow},
    ffi::OsStr,
    fmt::{Debug, Display},
    num::NonZeroU8,
    ops::Deref,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use triomphe::Arc;
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher};

use crate::{dynamic::Entry, tagged_value::TaggedValue};

mod dynamic;
mod tagged_value;

/// An immutable reference counted [`String`], similar to [`Arc<String>`][std::sync::Arc].
///
/// This is the preferred immutable string type for [`turbo_task::function`][macro@crate::function]
/// arguments and inside of [`turbo_task::value`][macro@crate::value].
///
/// As turbo-tasks must store copies of function arguments to enable caching, non-reference counted
/// [`String`]s would incur frequent cloning. Reference counting typically decreases memory
/// consumption and CPU time in these cases.
///
/// ## Conversion
///
/// Converting a `String` or `&str` to an `RcStr` can be perfomed using `.into()` or
/// `RcStr::from(...)`:
///
/// ```
/// # use turbo_rcstr::RcStr;
/// #
/// let s = "foo";
/// let rc_s1: RcStr = s.into();
/// let rc_s2 = RcStr::from(s);
/// assert_eq!(rc_s1, rc_s2);
/// ```
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
const INLINE_TAG_INIT: NonZeroU8 = unsafe { NonZeroU8::new_unchecked(INLINE_TAG) };
const TAG_MASK: u8 = 0b_11;
const LEN_OFFSET: usize = 4;
const LEN_MASK: u8 = 0xf0;

impl RcStr {
    #[inline(always)]
    fn tag(&self) -> u8 {
        self.unsafe_data.tag() & TAG_MASK
    }

    /// Return true if this is a dynamic Atom.
    #[inline(always)]
    fn is_dynamic(&self) -> bool {
        self.tag() == DYNAMIC_TAG
    }

    #[inline(never)]
    pub fn as_str(&self) -> &str {
        match self.tag() {
            DYNAMIC_TAG => &unsafe { Entry::deref_from(self.unsafe_data) }.string,
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
        match Arc::try_unwrap(self.0) {
            Ok(v) => v,
            Err(arc) => (*arc).clone(),
        }
    }

    pub fn map(self, f: impl FnOnce(String) -> String) -> Self {
        RcStr(Arc::new(f(self.into_owned())))
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
        self.0.as_str()
    }
}

impl Borrow<str> for RcStr {
    fn borrow(&self) -> &str {
        self.0.as_str()
    }
}

impl From<Arc<String>> for RcStr {
    fn from(s: Arc<String>) -> Self {
        RcStr(s)
    }
}

impl From<String> for RcStr {
    fn from(s: String) -> Self {
        RcStr(Arc::new(s))
    }
}

impl From<&'_ str> for RcStr {
    fn from(s: &str) -> Self {
        RcStr(Arc::new(s.to_string()))
    }
}

impl From<Cow<'_, str>> for RcStr {
    fn from(s: Cow<str>) -> Self {
        RcStr(Arc::new(s.into_owned()))
    }
}

/// Mimic `&str`
impl AsRef<Path> for RcStr {
    fn as_ref(&self) -> &Path {
        (*self.0).as_ref()
    }
}

/// Mimic `&str`
impl AsRef<OsStr> for RcStr {
    fn as_ref(&self) -> &OsStr {
        (*self.0).as_ref()
    }
}

/// Mimic `&str`
impl AsRef<[u8]> for RcStr {
    fn as_ref(&self) -> &[u8] {
        (*self.0).as_ref()
    }
}

impl PartialEq<str> for RcStr {
    fn eq(&self, other: &str) -> bool {
        self.0.as_str() == other
    }
}

impl PartialEq<&'_ str> for RcStr {
    fn eq(&self, other: &&str) -> bool {
        self.0.as_str() == *other
    }
}

impl PartialEq<String> for RcStr {
    fn eq(&self, other: &String) -> bool {
        self.as_str() == other.as_str()
    }
}

impl Debug for RcStr {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Debug::fmt(&self.0, f)
    }
}

impl Display for RcStr {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Display::fmt(&self.0, f)
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
    fn clone(&self) -> Self {}
}

impl Default for RcStr {}

impl PartialEq for RcStr {}

impl Eq for RcStr {}

impl PartialOrd for RcStr {}

impl Ord for RcStr {}

impl Hash for RcStr {}

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
