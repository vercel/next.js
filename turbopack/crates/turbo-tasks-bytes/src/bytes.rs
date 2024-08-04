use std::{
    ops::Deref,
    str::{from_utf8, Utf8Error},
};

use anyhow::Result;
use bytes::Bytes as CBytes;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// Bytes is a thin wrapper around [bytes::Bytes], implementing easy
/// conversion to/from, ser/de support, and Vc containers.
#[derive(Clone, Debug, Default)]
#[turbo_tasks::value(transparent, serialization = "custom")]
pub struct Bytes(#[turbo_tasks(trace_ignore)] CBytes);

impl Bytes {
    pub fn to_str(&self) -> Result<&'_ str, Utf8Error> {
        from_utf8(&self.0)
    }
}

impl Serialize for Bytes {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serde_bytes::Bytes::new(&self.0).serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for Bytes {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let bytes = serde_bytes::ByteBuf::deserialize(deserializer)?;
        Ok(Bytes(bytes.into_vec().into()))
    }
}

impl Deref for Bytes {
    type Target = CBytes;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// Types that implement From<X> for Bytes {}
/// Unfortunately, we cannot just use the more generic `Into<Bytes>` without
/// running afoul of the `From<X> for X` base case, causing conflicting impls.
pub trait IntoBytes: Into<CBytes> {}
impl IntoBytes for &'static [u8] {}
impl IntoBytes for &'static str {}
impl IntoBytes for Vec<u8> {}
impl IntoBytes for Box<[u8]> {}
impl IntoBytes for String {}

impl<T: IntoBytes> From<T> for Bytes {
    fn from(value: T) -> Self {
        Bytes(value.into())
    }
}

impl From<CBytes> for Bytes {
    fn from(value: CBytes) -> Self {
        Bytes(value)
    }
}

impl From<Bytes> for CBytes {
    fn from(value: Bytes) -> Self {
        value.0
    }
}

#[cfg(test)]
mod tests {
    use bytes::Bytes as CBytes;
    use serde_test::{assert_tokens, Token};

    use super::Bytes;
    impl PartialEq<&str> for Bytes {
        fn eq(&self, other: &&str) -> bool {
            self.0 == other
        }
    }

    #[test]
    fn into_bytes() {
        let s = "foo".to_string();
        assert_eq!(Bytes::from(b"foo" as &'static [u8]), "foo");
        assert_eq!(Bytes::from("foo"), "foo");
        assert_eq!(Bytes::from(s.as_bytes().to_vec()), "foo");
        assert_eq!(Bytes::from(s.as_bytes().to_vec().into_boxed_slice()), "foo");
        assert_eq!(Bytes::from(s), "foo");
    }

    #[test]
    fn serde() {
        let s = Bytes::from("test");
        assert_tokens(&s, &[Token::Bytes(b"test")])
    }

    #[test]
    fn from_into() {
        let b = Bytes::from("foo");
        let cb = CBytes::from("foo");
        assert_eq!(Bytes::from(cb), "foo");
        assert_eq!(CBytes::from(b), "foo");
    }

    #[test]
    fn deref() {
        let b = Bytes::from("foo");
        assert_eq!(*b, CBytes::from("foo"));
    }

    #[test]
    fn to_str() {
        let cb = Bytes::from("foo");
        assert_eq!(cb.to_str(), Ok("foo"));

        let b = Bytes::from("💩".as_bytes()[0..3].to_vec());
        assert!(b.to_str().is_err());
    }
}
