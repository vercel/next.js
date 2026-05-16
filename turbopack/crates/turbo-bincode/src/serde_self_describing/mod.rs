//! Helpers for serializing serde-compatible types inside of a bincode [`Encode`] or [`Decode`]
//! implementation using a self-describing format. This works with [types that
//! `#[bincode(serde)]` does not support][bincode::serde#known-issues].
//!
//! These helper functions can be used in the [`Encode`] and [`Decode`] derive macros with the
//! `#[bincode(with = "turbo_bincode]` attribute.
//!
//! [`Encode`]: bincode::Encode
//! [`Decode`]: bincode::Decode

use bincode::{
    de::{BorrowDecoder, Decoder},
    enc::Encoder,
    error::{DecodeError, EncodeError},
};
use serde::{Serialize, de::DeserializeOwned};

mod de;
mod ser;

/// Uses a u8 representation, which is slightly more efficient than bincode's default u32 varint
/// approach for enum discriminants:
/// https://docs.rs/bincode/latest/bincode/spec/index.html#discriminant-representation
#[derive(Copy, Clone, PartialEq, Eq)]
#[repr(u8)]
enum TypeTag {
    BoolTrue = 1,
    BoolFalse,
    U8,
    U16,
    U32,
    U64,
    I8,
    I16,
    I32,
    I64,
    F32,
    F64,
    Char,
    String,
    Bytes,
    OptionNone,
    OptionSome,
    Unit,
    UnitStruct,
    UnitVariant,
    NewtypeStruct,
    NewtypeVariant,
    SeqSized,
    SeqUnsizedStart,
    Tuple,
    TupleStruct,
    TupleVariant,
    MapSized,
    MapUnsizedStart,
    Struct,
    StructVariant,
    CollectionEnd,
}

impl TryFrom<u8> for TypeTag {
    type Error = DecodeError;

    fn try_from(num: u8) -> Result<Self, DecodeError> {
        let tag = match num {
            1 => TypeTag::BoolTrue,
            2 => TypeTag::BoolFalse,
            3 => TypeTag::U8,
            4 => TypeTag::U16,
            5 => TypeTag::U32,
            6 => TypeTag::U64,
            7 => TypeTag::I8,
            8 => TypeTag::I16,
            9 => TypeTag::I32,
            10 => TypeTag::I64,
            11 => TypeTag::F32,
            12 => TypeTag::F64,
            13 => TypeTag::Char,
            14 => TypeTag::String,
            15 => TypeTag::Bytes,
            16 => TypeTag::OptionNone,
            17 => TypeTag::OptionSome,
            18 => TypeTag::Unit,
            19 => TypeTag::UnitStruct,
            20 => TypeTag::UnitVariant,
            21 => TypeTag::NewtypeStruct,
            22 => TypeTag::NewtypeVariant,
            23 => TypeTag::SeqSized,
            24 => TypeTag::SeqUnsizedStart,
            25 => TypeTag::Tuple,
            26 => TypeTag::TupleStruct,
            27 => TypeTag::TupleVariant,
            28 => TypeTag::MapSized,
            29 => TypeTag::MapUnsizedStart,
            30 => TypeTag::Struct,
            31 => TypeTag::StructVariant,
            32 => TypeTag::CollectionEnd,
            _ => {
                return Err(DecodeError::OtherString(format!("invalid type tag: {num}")));
            }
        };
        debug_assert_eq!(tag as u8, num);
        Ok(tag)
    }
}

pub fn encode<E: Encoder, T: Serialize>(value: &T, encoder: &mut E) -> Result<(), EncodeError> {
    value
        .serialize(&mut ser::BincodeSerializer::new(encoder))
        .map_err(|e| e.0)
}

pub fn decode<Context, D: Decoder<Context = Context>, T: DeserializeOwned>(
    decoder: &mut D,
) -> Result<T, DecodeError> {
    T::deserialize(de::BincodeDeserializer::new(decoder)).map_err(|e| e.0)
}

pub fn borrow_decode<
    'de,
    Context,
    D: BorrowDecoder<'de, Context = Context>,
    T: serde::de::Deserialize<'de>,
>(
    decoder: &mut D,
) -> Result<T, DecodeError> {
    T::deserialize(de::BincodeDeserializer::new(decoder)).map_err(|e| e.0)
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, fmt::Debug};

    use bincode::{Decode, Encode, decode_from_slice, encode_to_vec};
    use serde::{Deserialize, Serialize, de::DeserializeOwned};

    fn round_trip<T: Serialize + DeserializeOwned + PartialEq + Debug>(value: T) -> T {
        #[derive(Encode)]
        #[bincode(encode_bounds = "T: Serialize")]
        struct EncodeWrapper<'a, T>(#[bincode(with = "crate::serde_self_describing")] &'a T);

        #[derive(Decode)]
        #[bincode(
            decode_bounds = "T: DeserializeOwned",
            borrow_decode_bounds = "T: Deserialize<'__de>"
        )]
        struct DecodeWrapper<T>(#[bincode(with = "crate::serde_self_describing")] T);

        let config = bincode::config::standard();

        let encoded = encode_to_vec(EncodeWrapper(&value), config).unwrap();
        let (DecodeWrapper(decoded), len) = decode_from_slice(&encoded, config).unwrap();
        assert_eq!(value, decoded);
        assert_eq!(len, encoded.len(), "the entire buffer must be decoded");
        decoded
    }

    #[test]
    fn test_primitives() {
        round_trip(true);
        round_trip(false);
        round_trip(42u8);
        round_trip(42u16);
        round_trip(42u32);
        round_trip(42u64);
        round_trip(-42i8);
        round_trip(-42i16);
        round_trip(-42i32);
        round_trip(-42i64);
        round_trip(1.23f32);
        round_trip(1.23f64);
        round_trip('a');
    }

    #[test]
    fn test_string() {
        round_trip(String::new());
        round_trip(String::from("hello world"));
    }

    #[test]
    fn test_option() {
        round_trip(Option::<i32>::None);
        round_trip(Some(42));
        round_trip(Some(String::from("hello")));
        round_trip(Some(Some(42)));
    }

    #[test]
    fn test_vec() {
        round_trip(Vec::<i32>::new());
        round_trip(vec![String::from("a"), String::from("b")]);
        round_trip(vec![vec![1, 2], vec![3, 4]]);
        round_trip(b"abc\0def".to_vec());
    }

    #[test]
    fn test_tuple() {
        round_trip(());
        round_trip((vec![1, 2], "hello".to_string(), Some(42), false, true));
    }

    #[test]
    fn test_hashmap() {
        let mut map = HashMap::new();
        map.insert("key1".to_string(), 1);
        map.insert("key2".to_string(), 2);
        round_trip(map);

        let empty: HashMap<String, i32> = HashMap::new();
        round_trip(empty);
    }

    #[test]
    fn test_struct() {
        #[derive(Debug, PartialEq, Serialize, Deserialize)]
        struct Struct {
            a: String,
            b: Option<i32>,
            #[serde(flatten)]
            flattened: Flattened,
        }

        #[derive(Debug, PartialEq, Serialize, Deserialize)]
        struct Flattened {
            d: i32,
        }

        round_trip(Struct {
            a: "hello".to_string(),
            b: None,
            flattened: Flattened { d: 42 },
        });
        round_trip(Struct {
            a: "hello".to_string(),
            b: Some(42),
            flattened: Flattened { d: 43 },
        });
    }

    #[test]
    fn test_unit_struct() {
        #[derive(Debug, PartialEq, Serialize, Deserialize)]
        struct UnitStruct;

        round_trip(UnitStruct);
    }

    #[test]
    fn test_newtype_struct() {
        #[derive(Debug, PartialEq, Serialize, Deserialize)]
        struct NewtypeStruct(i32);

        round_trip(NewtypeStruct(42));
    }

    #[test]
    fn test_tuple_struct() {
        #[derive(Debug, PartialEq, Serialize, Deserialize)]
        struct TupleStruct(i32, String, bool);

        round_trip(TupleStruct(42, "hello".to_string(), true));
    }

    #[test]
    fn test_enum_unit_variants() {
        #[derive(Debug, PartialEq, Serialize, Deserialize)]
        enum Color {
            Red,
            Green,
            Blue,
        }

        round_trip(Color::Red);
        round_trip(Color::Green);
        round_trip(Color::Blue);
    }

    #[test]
    fn test_enum_newtype_variants() {
        #[derive(Debug, PartialEq, Serialize, Deserialize)]
        enum Value {
            #[allow(unused)]
            #[serde(skip)]
            Empty(()),
            Int(i32),
            Text(String),
        }

        round_trip(Value::Int(42));
        round_trip(Value::Text("hello".to_string()));
    }

    #[test]
    fn test_enum_tuple_variants() {
        #[derive(Debug, PartialEq, Serialize, Deserialize)]
        enum Point {
            TwoD(i32, i32),
            ThreeD(i32, i32, i32),
        }

        round_trip(Point::TwoD(1, 2));
        round_trip(Point::ThreeD(1, 2, 3));
    }

    #[test]
    fn test_enum_struct_variants() {
        #[derive(Debug, PartialEq, Serialize, Deserialize)]
        enum Message {
            Request { id: u32, method: String },
            Response { id: u32, result: Option<String> },
        }

        round_trip(Message::Request {
            id: 1,
            method: "get".to_string(),
        });
        round_trip(Message::Response {
            id: 1,
            result: Some("ok".to_string()),
        });
        round_trip(Message::Response {
            id: 2,
            result: None,
        });
    }
}
