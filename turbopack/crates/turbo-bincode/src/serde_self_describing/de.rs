use std::{
    error::Error as StdError,
    fmt::{self, Display},
};

use bincode::{Decode, de::Decoder, error::DecodeError};
use serde::{
    Deserializer,
    de::{DeserializeSeed, EnumAccess, MapAccess, SeqAccess, VariantAccess, Visitor},
};

use crate::serde_self_describing::TypeTag;

#[derive(Debug)]
pub struct Error(pub DecodeError);

impl serde::de::Error for Error {
    fn custom<T>(msg: T) -> Self
    where
        T: Display,
    {
        Self(DecodeError::OtherString(msg.to_string()))
    }
}

impl StdError for Error {
    fn source(&self) -> Option<&(dyn StdError + 'static)> {
        Some(&self.0)
    }
}

impl Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

impl From<DecodeError> for Error {
    fn from(err: DecodeError) -> Self {
        Self(err)
    }
}

type Result<T, E = Error> = std::result::Result<T, E>;

fn decode_tag(decoder: &mut impl Decoder) -> Result<TypeTag> {
    let tag_byte: u8 = Decode::decode(decoder)?;
    Ok(TypeTag::try_from(tag_byte)?)
}

pub struct BincodeDeserializer<'a, D> {
    decoder: &'a mut D,
}

impl<'a, D> BincodeDeserializer<'a, D> {
    pub fn new(decoder: &'a mut D) -> Self {
        Self { decoder }
    }
}

impl<'a, 'de, D: Decoder> Deserializer<'de> for BincodeDeserializer<'a, D> {
    type Error = Error;

    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value>
    where
        V: Visitor<'de>,
    {
        let tag = decode_tag(self.decoder)?;
        BincodeTaggedDeserializer {
            tag,
            decoder: self.decoder,
        }
        .deserialize_any(visitor)
    }

    serde::forward_to_deserialize_any! {
        bool i8 i16 i32 i64 u8 u16 u32 u64 f32 f64 char str string bytes
        byte_buf option unit unit_struct newtype_struct seq tuple
        tuple_struct map struct enum identifier ignored_any
    }
}

/// Helper type used when we have already consumed the type tag
struct BincodeTaggedDeserializer<'a, D> {
    tag: TypeTag,
    decoder: &'a mut D,
}

impl<'a, D> BincodeTaggedDeserializer<'a, D> {
    fn new(tag: TypeTag, decoder: &'a mut D) -> Self {
        Self { tag, decoder }
    }
}

impl<'a, 'de, D: Decoder> Deserializer<'de> for BincodeTaggedDeserializer<'a, D> {
    type Error = Error;

    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value>
    where
        V: Visitor<'de>,
    {
        match self.tag {
            TypeTag::BoolTrue => visitor.visit_bool(true),
            TypeTag::BoolFalse => visitor.visit_bool(false),
            TypeTag::U8 => visitor.visit_u8(Decode::decode(self.decoder)?),
            TypeTag::U16 => visitor.visit_u16(Decode::decode(self.decoder)?),
            TypeTag::U32 => visitor.visit_u32(Decode::decode(self.decoder)?),
            TypeTag::U64 => visitor.visit_u64(Decode::decode(self.decoder)?),
            TypeTag::I8 => visitor.visit_i8(Decode::decode(self.decoder)?),
            TypeTag::I16 => visitor.visit_i16(Decode::decode(self.decoder)?),
            TypeTag::I32 => visitor.visit_i32(Decode::decode(self.decoder)?),
            TypeTag::I64 => visitor.visit_i64(Decode::decode(self.decoder)?),
            TypeTag::F32 => visitor.visit_f32(Decode::decode(self.decoder)?),
            TypeTag::F64 => visitor.visit_f64(Decode::decode(self.decoder)?),
            TypeTag::Char => visitor.visit_char(Decode::decode(self.decoder)?),
            TypeTag::String => visitor.visit_string(Decode::decode(self.decoder)?),
            TypeTag::Bytes => visitor.visit_byte_buf(Decode::decode(self.decoder)?),
            TypeTag::OptionNone => visitor.visit_none(),
            TypeTag::OptionSome => visitor.visit_some(BincodeDeserializer::new(self.decoder)),
            TypeTag::Unit | TypeTag::UnitStruct => visitor.visit_unit(),
            TypeTag::NewtypeStruct => {
                visitor.visit_newtype_struct(BincodeDeserializer::new(self.decoder))
            }
            TypeTag::SeqSized | TypeTag::Tuple | TypeTag::TupleStruct => {
                let len = Decode::decode(self.decoder)?;
                visitor.visit_seq(BincodeSizedAccess::new(self.decoder, len))
            }
            TypeTag::SeqUnsizedStart => visitor.visit_seq(BincodeUnsizedAccess::new(self.decoder)),
            TypeTag::MapSized => {
                let len = Decode::decode(self.decoder)?;
                visitor.visit_map(BincodeSizedAccess::new(self.decoder, len))
            }
            TypeTag::MapUnsizedStart => visitor.visit_map(BincodeUnsizedAccess::new(self.decoder)),
            TypeTag::Struct => {
                let len = Decode::decode(self.decoder)?;
                visitor.visit_map(BincodeStructAccess::new(self.decoder, len))
            }
            TypeTag::UnitVariant
            | TypeTag::NewtypeVariant
            | TypeTag::TupleVariant
            | TypeTag::StructVariant => {
                visitor.visit_enum(BincodeEnumAccess::new(self.decoder, self.tag))
            }
            TypeTag::CollectionEnd => {
                Err(DecodeError::Other("unexpected CollectionEnd tag").into())
            }
        }
    }

    serde::forward_to_deserialize_any! {
        bool i8 i16 i32 i64 u8 u16 u32 u64 f32 f64 char str string bytes
        byte_buf option unit unit_struct newtype_struct seq tuple
        tuple_struct map struct enum identifier ignored_any
    }
}

struct BincodeSizedAccess<'a, D> {
    decoder: &'a mut D,
    remaining: usize,
}

impl<'a, D> BincodeSizedAccess<'a, D> {
    fn new(decoder: &'a mut D, len: usize) -> Self {
        Self {
            decoder,
            remaining: len,
        }
    }
}

impl<'a, 'de, D: Decoder> SeqAccess<'de> for BincodeSizedAccess<'a, D> {
    type Error = Error;

    fn next_element_seed<T>(&mut self, seed: T) -> Result<Option<T::Value>>
    where
        T: DeserializeSeed<'de>,
    {
        if self.remaining > 0 {
            self.remaining -= 1;
            Ok(Some(
                seed.deserialize(BincodeDeserializer::new(self.decoder))?,
            ))
        } else {
            Ok(None)
        }
    }

    fn size_hint(&self) -> Option<usize> {
        Some(self.remaining)
    }
}

impl<'a, 'de, D: Decoder> MapAccess<'de> for BincodeSizedAccess<'a, D> {
    type Error = Error;

    fn next_key_seed<K>(&mut self, seed: K) -> Result<Option<K::Value>>
    where
        K: DeserializeSeed<'de>,
    {
        // behaves the same as `SeqAccess`
        SeqAccess::next_element_seed(self, seed)
    }

    fn next_value_seed<V>(&mut self, seed: V) -> Result<V::Value>
    where
        V: DeserializeSeed<'de>,
    {
        // we already decremented `remaining` in `next_key_seed`, just decode the value
        seed.deserialize(BincodeDeserializer::new(self.decoder))
    }

    fn size_hint(&self) -> Option<usize> {
        Some(self.remaining)
    }
}

struct BincodeUnsizedAccess<'a, D> {
    decoder: &'a mut D,
}

impl<'a, D> BincodeUnsizedAccess<'a, D> {
    fn new(decoder: &'a mut D) -> Self {
        Self { decoder }
    }
}

impl<'a, 'de, D: Decoder> SeqAccess<'de> for BincodeUnsizedAccess<'a, D> {
    type Error = Error;

    fn next_element_seed<T>(&mut self, seed: T) -> Result<Option<T::Value>>
    where
        T: DeserializeSeed<'de>,
    {
        let tag = decode_tag(self.decoder)?;
        if tag == TypeTag::CollectionEnd {
            return Ok(None);
        }
        Ok(Some(seed.deserialize(BincodeTaggedDeserializer::new(
            tag,
            self.decoder,
        ))?))
    }
}

impl<'a, 'de, D: Decoder> MapAccess<'de> for BincodeUnsizedAccess<'a, D> {
    type Error = Error;

    fn next_key_seed<K>(&mut self, seed: K) -> Result<Option<K::Value>>
    where
        K: DeserializeSeed<'de>,
    {
        // behaves the same as `SeqAccess`
        SeqAccess::next_element_seed(self, seed)
    }

    fn next_value_seed<V>(&mut self, seed: V) -> Result<V::Value>
    where
        V: DeserializeSeed<'de>,
    {
        seed.deserialize(BincodeDeserializer::new(self.decoder))
    }
}

struct BincodeStructAccess<'a, D> {
    decoder: &'a mut D,
    remaining: usize,
}

impl<'a, D> BincodeStructAccess<'a, D> {
    fn new(decoder: &'a mut D, len: usize) -> Self {
        Self {
            decoder,
            remaining: len,
        }
    }
}

impl<'a, 'de, D: Decoder> MapAccess<'de> for BincodeStructAccess<'a, D> {
    type Error = Error;

    fn next_key_seed<K>(&mut self, seed: K) -> Result<Option<K::Value>>
    where
        K: DeserializeSeed<'de>,
    {
        if self.remaining > 0 {
            self.remaining -= 1;
            Ok(Some(seed.deserialize(BincodeTaggedDeserializer::new(
                TypeTag::String,
                self.decoder,
            ))?))
        } else {
            Ok(None)
        }
    }

    fn next_value_seed<V>(&mut self, seed: V) -> Result<V::Value>
    where
        V: DeserializeSeed<'de>,
    {
        seed.deserialize(BincodeDeserializer::new(self.decoder))
    }

    fn size_hint(&self) -> Option<usize> {
        Some(self.remaining)
    }
}

struct BincodeEnumAccess<'a, D> {
    decoder: &'a mut D,
    tag: TypeTag,
}

impl<'a, D> BincodeEnumAccess<'a, D> {
    fn new(decoder: &'a mut D, tag: TypeTag) -> Self {
        Self { decoder, tag }
    }
}

impl<'a, 'de, D: Decoder> EnumAccess<'de> for BincodeEnumAccess<'a, D> {
    type Error = Error;
    type Variant = Self;

    fn variant_seed<V>(self, seed: V) -> Result<(V::Value, Self::Variant)>
    where
        V: DeserializeSeed<'de>,
    {
        let variant_name = seed.deserialize(BincodeTaggedDeserializer::new(
            TypeTag::String,
            self.decoder,
        ))?;
        Ok((variant_name, self))
    }
}

impl<'a, 'de, D: Decoder> VariantAccess<'de> for BincodeEnumAccess<'a, D> {
    type Error = Error;

    fn unit_variant(self) -> Result<()> {
        match self.tag {
            TypeTag::UnitVariant => Ok(()),
            _ => Err(DecodeError::Other("expected unit variant").into()),
        }
    }

    fn newtype_variant_seed<T>(self, seed: T) -> Result<T::Value>
    where
        T: DeserializeSeed<'de>,
    {
        match self.tag {
            TypeTag::NewtypeVariant => seed.deserialize(BincodeDeserializer::new(self.decoder)),
            _ => Err(DecodeError::Other("expected newtype variant").into()),
        }
    }

    fn tuple_variant<V>(self, expected_len: usize, visitor: V) -> Result<V::Value>
    where
        V: Visitor<'de>,
    {
        match self.tag {
            TypeTag::TupleVariant => {
                let len: usize = Decode::decode(self.decoder)?;
                if len != expected_len {
                    return Err(DecodeError::OtherString(format!(
                        "tuple variant length mismatch: expected {expected_len}, got {len}"
                    ))
                    .into());
                }
                visitor.visit_seq(BincodeSizedAccess::new(self.decoder, len))
            }
            _ => Err(DecodeError::Other("expected tuple variant").into()),
        }
    }

    fn struct_variant<V>(self, fields: &'static [&'static str], visitor: V) -> Result<V::Value>
    where
        V: Visitor<'de>,
    {
        match self.tag {
            TypeTag::StructVariant => {
                let len: usize = Decode::decode(self.decoder)?;
                if len != fields.len() {
                    return Err(DecodeError::OtherString(format!(
                        "struct variant field count mismatch: expected {}, got {len}",
                        fields.len()
                    ))
                    .into());
                }
                visitor.visit_map(BincodeStructAccess::new(self.decoder, len))
            }
            _ => Err(DecodeError::Other("expected struct variant").into()),
        }
    }
}
