use byteorder::ByteOrder;
use serde::{Deserialize, Serialize};

#[derive(Debug)]
pub struct SortableIndex(pub u64);

impl std::ops::Deref for SortableIndex {
    type Target = u64;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl Serialize for SortableIndex {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut buf = [0; 8];
        byteorder::BigEndian::write_u64(&mut buf, self.0);
        serializer.serialize_bytes(&buf)
    }
}

impl<'de> Deserialize<'de> for SortableIndex {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct Visitor;

        impl<'de> serde::de::Visitor<'de> for Visitor {
            type Value = SortableIndex;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                write!(f, "big endian u64")
            }

            fn visit_borrowed_bytes<E>(self, v: &'de [u8]) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                let v = byteorder::BigEndian::read_u64(v);
                Ok(SortableIndex(v))
            }
        }

        deserializer.deserialize_bytes(Visitor)
    }
}
