use std::{
    error::Error as StdError,
    fmt::{self, Display},
};

use bincode::{Encode, enc::Encoder, error::EncodeError};
use serde::{
    Serialize, Serializer,
    ser::{
        self, SerializeSeq, SerializeStruct, SerializeStructVariant, SerializeTuple,
        SerializeTupleStruct,
    },
};

use crate::serde_self_describing::TypeTag;

#[derive(Debug)]
pub struct Error(pub EncodeError);

impl serde::ser::Error for Error {
    fn custom<T>(msg: T) -> Self
    where
        T: Display,
    {
        Self(EncodeError::OtherString(msg.to_string()))
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

impl From<EncodeError> for Error {
    fn from(err: EncodeError) -> Self {
        Self(err)
    }
}

type Result<T, E = Error> = std::result::Result<T, E>;

pub struct BincodeSerializer<E> {
    encoder: E,
}

impl<E> BincodeSerializer<E> {
    pub fn new(encoder: E) -> Self {
        Self { encoder }
    }
}

impl<E: Encoder> BincodeSerializer<E> {
    fn encode_tag(&mut self, tag: TypeTag) -> Result<()> {
        Ok(Encode::encode(&(tag as u8), &mut self.encoder)?)
    }

    fn encode_primitive<T: Encode>(&mut self, value: T) -> Result<()> {
        Ok(Encode::encode(&value, &mut self.encoder)?)
    }
}

impl<'a, E: Encoder> Serializer for &'a mut BincodeSerializer<E> {
    type Ok = ();
    type Error = Error;

    type SerializeSeq = BincodeCollectionSerializer<'a, E>;
    type SerializeTuple = BincodeCollectionSerializer<'a, E>;
    type SerializeTupleStruct = BincodeCollectionSerializer<'a, E>;
    type SerializeTupleVariant = BincodeCollectionSerializer<'a, E>;
    type SerializeMap = BincodeCollectionSerializer<'a, E>;
    type SerializeStruct = BincodeCollectionSerializer<'a, E>;
    type SerializeStructVariant = BincodeCollectionSerializer<'a, E>;

    fn serialize_bool(self, v: bool) -> Result<()> {
        if v {
            self.encode_tag(TypeTag::BoolTrue)
        } else {
            self.encode_tag(TypeTag::BoolFalse)
        }
    }

    fn serialize_u8(self, v: u8) -> Result<()> {
        self.encode_tag(TypeTag::U8)?;
        self.encode_primitive(v)
    }

    fn serialize_u16(self, v: u16) -> Result<()> {
        self.encode_tag(TypeTag::U16)?;
        self.encode_primitive(v)
    }

    fn serialize_u32(self, v: u32) -> Result<()> {
        self.encode_tag(TypeTag::U32)?;
        self.encode_primitive(v)
    }

    fn serialize_u64(self, v: u64) -> Result<()> {
        self.encode_tag(TypeTag::U64)?;
        self.encode_primitive(v)
    }

    fn serialize_i8(self, v: i8) -> Result<()> {
        self.encode_tag(TypeTag::I8)?;
        self.encode_primitive(v)
    }

    fn serialize_i16(self, v: i16) -> Result<()> {
        self.encode_tag(TypeTag::I16)?;
        self.encode_primitive(v)
    }

    fn serialize_i32(self, v: i32) -> Result<()> {
        self.encode_tag(TypeTag::I32)?;
        self.encode_primitive(v)
    }

    fn serialize_i64(self, v: i64) -> Result<()> {
        self.encode_tag(TypeTag::I64)?;
        self.encode_primitive(v)
    }

    fn serialize_f32(self, v: f32) -> Result<()> {
        self.encode_tag(TypeTag::F32)?;
        self.encode_primitive(v)
    }

    fn serialize_f64(self, v: f64) -> Result<()> {
        self.encode_tag(TypeTag::F64)?;
        self.encode_primitive(v)
    }

    fn serialize_char(self, v: char) -> Result<()> {
        self.encode_tag(TypeTag::Char)?;
        self.encode_primitive(v)
    }

    fn serialize_str(self, v: &str) -> Result<()> {
        self.encode_tag(TypeTag::String)?;
        self.encode_primitive(v)
    }

    fn serialize_bytes(self, v: &[u8]) -> Result<()> {
        self.encode_tag(TypeTag::Bytes)?;
        self.encode_primitive(v)
    }

    fn serialize_none(self) -> Result<()> {
        self.encode_tag(TypeTag::OptionNone)
    }

    fn serialize_some<T>(self, value: &T) -> Result<()>
    where
        T: ?Sized + Serialize,
    {
        self.encode_tag(TypeTag::OptionSome)?;
        value.serialize(self)
    }

    fn serialize_unit(self) -> Result<()> {
        self.encode_tag(TypeTag::Unit)
    }

    fn serialize_unit_struct(self, _name: &'static str) -> Result<()> {
        self.encode_tag(TypeTag::UnitStruct)
    }

    fn serialize_unit_variant(
        self,
        _name: &'static str,
        _variant_index: u32,
        variant: &'static str,
    ) -> Result<()> {
        // We must store enum variants by name, otherwise there's a bug in serde that skipped
        // variants are deserialized with the wrong index:
        // - https://github.com/serde-rs/serde/issues/2614
        // - https://github.com/bincode-org/bincode/issues/184
        self.encode_tag(TypeTag::UnitVariant)?;
        self.encode_primitive(variant)
    }

    fn serialize_newtype_struct<T>(self, _name: &'static str, value: &T) -> Result<()>
    where
        T: ?Sized + Serialize,
    {
        self.encode_tag(TypeTag::NewtypeStruct)?;
        value.serialize(self)
    }

    fn serialize_newtype_variant<T>(
        self,
        _name: &'static str,
        _variant_index: u32,
        variant: &'static str,
        value: &T,
    ) -> Result<()>
    where
        T: ?Sized + Serialize,
    {
        self.encode_tag(TypeTag::NewtypeVariant)?;
        self.encode_primitive(variant)?;
        value.serialize(self)
    }

    fn serialize_seq(self, len: Option<usize>) -> Result<Self::SerializeSeq> {
        if let Some(len) = len {
            self.encode_tag(TypeTag::SeqSized)?;
            self.encode_primitive(len)?;
            Ok(BincodeCollectionSerializer::new(self, false))
        } else {
            self.encode_tag(TypeTag::SeqUnsizedStart)?;
            Ok(BincodeCollectionSerializer::new(self, true))
        }
    }

    fn serialize_tuple(self, len: usize) -> Result<Self::SerializeTuple> {
        self.encode_tag(TypeTag::Tuple)?;
        self.encode_primitive(len)?;
        Ok(BincodeCollectionSerializer::new(self, false))
    }

    fn serialize_tuple_struct(
        self,
        _name: &'static str,
        len: usize,
    ) -> Result<Self::SerializeTupleStruct> {
        self.encode_tag(TypeTag::TupleStruct)?;
        self.encode_primitive(len)?;
        Ok(BincodeCollectionSerializer::new(self, false))
    }

    fn serialize_tuple_variant(
        self,
        _name: &'static str,
        _variant_index: u32,
        variant: &'static str,
        len: usize,
    ) -> Result<Self::SerializeTupleVariant> {
        self.encode_tag(TypeTag::TupleVariant)?;
        self.encode_primitive(variant)?;
        self.encode_primitive(len)?;
        Ok(BincodeCollectionSerializer::new(self, false))
    }

    fn serialize_map(self, len: Option<usize>) -> Result<Self::SerializeMap> {
        if let Some(len) = len {
            self.encode_tag(TypeTag::MapSized)?;
            self.encode_primitive(len)?;
            Ok(BincodeCollectionSerializer::new(self, false))
        } else {
            self.encode_tag(TypeTag::MapUnsizedStart)?;
            Ok(BincodeCollectionSerializer::new(self, true))
        }
    }

    fn serialize_struct(self, _name: &'static str, len: usize) -> Result<Self::SerializeStruct> {
        self.encode_tag(TypeTag::Struct)?;
        self.encode_primitive(len)?;
        Ok(BincodeCollectionSerializer::new(self, false))
    }

    fn serialize_struct_variant(
        self,
        _name: &'static str,
        _variant_index: u32,
        variant: &'static str,
        len: usize,
    ) -> Result<Self::SerializeStructVariant> {
        self.encode_tag(TypeTag::StructVariant)?;
        self.encode_primitive(variant)?;
        self.encode_primitive(len)?;
        Ok(BincodeCollectionSerializer::new(self, false))
    }
}

pub struct BincodeCollectionSerializer<'a, E> {
    inner: &'a mut BincodeSerializer<E>,
    emit_end_tag: bool,
}

impl<'a, E: Encoder> BincodeCollectionSerializer<'a, E> {
    fn new(inner: &'a mut BincodeSerializer<E>, emit_end_tag: bool) -> Self {
        Self {
            inner,
            emit_end_tag,
        }
    }

    fn maybe_emit_end(&mut self) -> Result<()> {
        if self.emit_end_tag {
            self.inner.encode_tag(TypeTag::CollectionEnd)?;
        }
        Ok(())
    }
}

impl<E: Encoder> SerializeSeq for BincodeCollectionSerializer<'_, E> {
    type Ok = ();
    type Error = Error;

    fn serialize_element<T>(&mut self, value: &T) -> Result<()>
    where
        T: ?Sized + Serialize,
    {
        value.serialize(&mut *self.inner)
    }

    fn end(mut self) -> Result<()> {
        self.maybe_emit_end()
    }
}

impl<E: Encoder> SerializeTuple for BincodeCollectionSerializer<'_, E> {
    type Ok = ();
    type Error = Error;

    fn serialize_element<T>(&mut self, value: &T) -> Result<()>
    where
        T: ?Sized + Serialize,
    {
        value.serialize(&mut *self.inner)
    }

    fn end(mut self) -> Result<()> {
        self.maybe_emit_end()
    }
}

impl<E: Encoder> SerializeTupleStruct for BincodeCollectionSerializer<'_, E> {
    type Ok = ();
    type Error = Error;

    fn serialize_field<T>(&mut self, value: &T) -> Result<()>
    where
        T: ?Sized + Serialize,
    {
        value.serialize(&mut *self.inner)
    }

    fn end(mut self) -> Result<()> {
        self.maybe_emit_end()
    }
}

impl<E: Encoder> ser::SerializeTupleVariant for BincodeCollectionSerializer<'_, E> {
    type Ok = ();
    type Error = Error;

    fn serialize_field<T>(&mut self, value: &T) -> Result<()>
    where
        T: ?Sized + Serialize,
    {
        value.serialize(&mut *self.inner)
    }

    fn end(mut self) -> Result<()> {
        self.maybe_emit_end()
    }
}

impl<E: Encoder> ser::SerializeMap for BincodeCollectionSerializer<'_, E> {
    type Ok = ();
    type Error = Error;

    fn serialize_key<T>(&mut self, key: &T) -> Result<()>
    where
        T: ?Sized + Serialize,
    {
        key.serialize(&mut *self.inner)
    }

    fn serialize_value<T>(&mut self, value: &T) -> Result<()>
    where
        T: ?Sized + Serialize,
    {
        value.serialize(&mut *self.inner)
    }

    fn end(mut self) -> Result<()> {
        self.maybe_emit_end()
    }
}

impl<E: Encoder> SerializeStruct for BincodeCollectionSerializer<'_, E> {
    type Ok = ();
    type Error = Error;

    fn serialize_field<T>(&mut self, key: &'static str, value: &T) -> Result<()>
    where
        T: ?Sized + Serialize,
    {
        self.inner.encode_primitive(key)?;
        value.serialize(&mut *self.inner)
    }

    fn end(mut self) -> Result<()> {
        self.maybe_emit_end()
    }
}

impl<E: Encoder> SerializeStructVariant for BincodeCollectionSerializer<'_, E> {
    type Ok = ();
    type Error = Error;

    fn serialize_field<T>(&mut self, key: &'static str, value: &T) -> Result<()>
    where
        T: ?Sized + Serialize,
    {
        self.inner.encode_primitive(key)?;
        value.serialize(&mut *self.inner)
    }

    fn end(mut self) -> Result<()> {
        self.maybe_emit_end()
    }
}
