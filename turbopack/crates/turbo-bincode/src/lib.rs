#[doc(hidden)]
pub mod macro_helpers;

use std::{any::Any, ptr::copy_nonoverlapping};

use ::smallvec::SmallVec;
use bincode::{
    BorrowDecode, Decode, Encode,
    de::{BorrowDecoder, Decoder, DecoderImpl, read::Reader},
    enc::{Encoder, EncoderImpl, write::Writer},
    error::{DecodeError, EncodeError},
};

pub const TURBO_BINCODE_CONFIG: bincode::config::Configuration = bincode::config::standard();
pub type TurboBincodeBuffer = SmallVec<[u8; 16]>;
pub type TurboBincodeEncoder<'a> =
    EncoderImpl<TurboBincodeWriter<'a>, bincode::config::Configuration>;
pub type TurboBincodeDecoder<'a> =
    DecoderImpl<TurboBincodeReader<'a>, bincode::config::Configuration, ()>;
pub type AnyEncodeFn = fn(&dyn Any, &mut TurboBincodeEncoder<'_>) -> Result<(), EncodeError>;
pub type AnyDecodeFn<T> = fn(&mut TurboBincodeDecoder<'_>) -> Result<T, DecodeError>;

fn new_turbo_bincode_encoder(buf: &mut TurboBincodeBuffer) -> TurboBincodeEncoder<'_> {
    EncoderImpl::new(TurboBincodeWriter::new(buf), TURBO_BINCODE_CONFIG)
}

fn new_turbo_bincode_decoder(buffer: &[u8]) -> TurboBincodeDecoder<'_> {
    DecoderImpl::new(TurboBincodeReader::new(buffer), TURBO_BINCODE_CONFIG, ())
}

/// Encode the value into a new [`SmallVec`] using a [`TurboBincodeEncoder`].
///
/// Note: If you can re-use a buffer, you should. That will always be cheaper than creating a new
/// [`SmallVec`].
pub fn turbo_bincode_encode<T: Encode>(value: &T) -> Result<TurboBincodeBuffer, EncodeError> {
    let mut buffer = TurboBincodeBuffer::new();
    turbo_bincode_encode_into(value, &mut buffer)?;
    Ok(buffer)
}

pub fn turbo_bincode_encode_into<T: Encode>(
    value: &T,
    buffer: &mut TurboBincodeBuffer,
) -> Result<(), EncodeError> {
    let mut encoder = new_turbo_bincode_encoder(buffer);
    value.encode(&mut encoder)?;
    Ok(())
}

/// Decode using a [`TurboBincodeDecoder`] and check that the entire slice was consumed. Returns a
/// [`DecodeError::ArrayLengthMismatch`] if some of the slice is not consumed during decoding.
pub fn turbo_bincode_decode<T: Decode<()>>(buf: &[u8]) -> Result<T, DecodeError> {
    let mut decoder = new_turbo_bincode_decoder(buf);
    let val = T::decode(&mut decoder)?;
    let remaining_buf = decoder.reader().buffer;
    if !remaining_buf.is_empty() {
        return Err(DecodeError::ArrayLengthMismatch {
            required: buf.len() - remaining_buf.len(),
            found: buf.len(),
        });
    }
    Ok(val)
}

pub struct TurboBincodeWriter<'a> {
    pub buffer: &'a mut TurboBincodeBuffer,
}

impl<'a> TurboBincodeWriter<'a> {
    pub fn new(buffer: &'a mut TurboBincodeBuffer) -> Self {
        Self { buffer }
    }
}

impl Writer for TurboBincodeWriter<'_> {
    fn write(&mut self, bytes: &[u8]) -> Result<(), EncodeError> {
        self.buffer.extend_from_slice(bytes);
        Ok(())
    }
}

/// This is equivalent to [`bincode::de::read::SliceReader`], but with a little `unsafe` code to
/// avoid some redundant bounds checks, and `pub` access to the underlying `buffer`.
pub struct TurboBincodeReader<'a> {
    pub buffer: &'a [u8],
}

impl<'a> TurboBincodeReader<'a> {
    pub fn new(buffer: &'a [u8]) -> Self {
        Self { buffer }
    }
}

impl Reader for TurboBincodeReader<'_> {
    fn read(&mut self, target_buffer: &mut [u8]) -> Result<(), DecodeError> {
        let len = target_buffer.len();
        let (head, rest) =
            self.buffer
                .split_at_checked(len)
                .ok_or_else(|| DecodeError::UnexpectedEnd {
                    additional: len - self.buffer.len(),
                })?;
        // SAFETY:
        // - We already checked the bounds.
        // - These memory ranges can't overlap because it would violate rust aliasing rules.
        // - `u8` is `Copy`.
        unsafe {
            copy_nonoverlapping(head.as_ptr(), target_buffer.as_mut_ptr(), len);
        }
        self.buffer = rest;
        Ok(())
    }

    fn peek_read(&mut self, n: usize) -> Option<&[u8]> {
        self.buffer.get(..n)
    }

    fn consume(&mut self, n: usize) {
        self.buffer = &self.buffer[n..];
    }
}

/// Represents a type that can only be encoded with a [`TurboBincodeEncoder`].
///
/// All traits implementing this must also implement the more generic [`Encode`] trait, but they
/// should panic if any other encoder is used.
///
/// Use [`impl_encode_for_turbo_bincode_encode`] to automatically implement the [`Encode`] trait
/// from this one.
pub trait TurboBincodeEncode: Encode {
    fn encode(&self, encoder: &mut TurboBincodeEncoder) -> Result<(), EncodeError>;
}

/// Represents a type that can only be decoded with a [`TurboBincodeDecoder`] and an empty `()`
/// context.
///
/// All traits implementing this must also implement the more generic [`Decode`] trait, but they
/// should panic if any other encoder is used.
///
/// Use [`impl_decode_for_turbo_bincode_decode`] to automatically implement the [`Decode`] trait
/// from this one.
pub trait TurboBincodeDecode<Context>: Decode<Context> {
    fn decode(decoder: &mut TurboBincodeDecoder) -> Result<Self, DecodeError>;
}

#[macro_export]
macro_rules! impl_encode_for_turbo_bincode_encode {
    ($ty:ty) => {
        impl $crate::macro_helpers::bincode::Encode for $ty {
            fn encode<'a, E: $crate::macro_helpers::bincode::enc::Encoder>(
                &self,
                encoder: &'a mut E,
            ) -> ::std::result::Result<(), $crate::macro_helpers::bincode::error::EncodeError> {
                $crate::macro_helpers::encode_for_turbo_bincode_encode_impl(self, encoder)
            }
        }
    };
}

#[macro_export]
macro_rules! impl_decode_for_turbo_bincode_decode {
    ($ty:ty) => {
        impl<Context> $crate::macro_helpers::bincode::Decode<Context> for $ty {
            fn decode<D: $crate::macro_helpers::bincode::de::Decoder<Context = Context>>(
                decoder: &mut D,
            ) -> ::std::result::Result<Self, $crate::macro_helpers::bincode::error::DecodeError>
            {
                $crate::macro_helpers::decode_for_turbo_bincode_decode_impl(decoder)
            }
        }
    };
}

pub mod indexmap {
    use std::hash::{BuildHasher, Hash};

    use ::indexmap::IndexMap;

    use super::*;

    pub fn encode<E, K, V, S>(map: &IndexMap<K, V, S>, encoder: &mut E) -> Result<(), EncodeError>
    where
        E: Encoder,
        K: Encode,
        V: Encode,
    {
        usize::encode(&map.len(), encoder)?;
        for (k, v) in map {
            K::encode(k, encoder)?;
            V::encode(v, encoder)?;
        }
        Ok(())
    }

    pub fn decode<Context, D, K, V, S>(decoder: &mut D) -> Result<IndexMap<K, V, S>, DecodeError>
    where
        D: Decoder<Context = Context>,
        K: Decode<Context> + Eq + Hash,
        V: Decode<Context>,
        S: BuildHasher + Default,
    {
        let len = usize::decode(decoder)?;
        let mut map = IndexMap::with_capacity_and_hasher(len, Default::default());
        for _i in 0..len {
            map.insert(K::decode(decoder)?, V::decode(decoder)?);
        }
        Ok(map)
    }

    pub fn borrow_decode<'de, Context, D, K, V, S>(
        decoder: &mut D,
    ) -> Result<IndexMap<K, V, S>, DecodeError>
    where
        D: BorrowDecoder<'de, Context = Context>,
        K: BorrowDecode<'de, Context> + Eq + Hash,
        V: BorrowDecode<'de, Context>,
        S: BuildHasher + Default,
    {
        let len = usize::decode(decoder)?;
        let mut map = IndexMap::with_capacity_and_hasher(len, Default::default());
        for _i in 0..len {
            map.insert(K::borrow_decode(decoder)?, V::borrow_decode(decoder)?);
        }
        Ok(map)
    }

    #[cfg(test)]
    mod tests {
        use bincode::{decode_from_slice, encode_to_vec};

        use super::*;

        #[test]
        fn test_roundtrip() {
            let cfg = bincode::config::standard();

            #[derive(Encode, Decode)]
            struct Wrapper(#[bincode(with = "crate::indexmap")] IndexMap<String, u32>);

            let map1 = Wrapper(IndexMap::from([
                ("key1".to_string(), 12345u32),
                ("key2".to_string(), 23456u32),
            ]));

            let map2: Wrapper = decode_from_slice(&encode_to_vec(&map1, cfg).unwrap(), cfg)
                .unwrap()
                .0;

            assert_eq!(map1.0, map2.0);
        }
    }
}

pub mod indexset {
    use std::hash::{BuildHasher, Hash};

    use ::indexmap::IndexSet;

    use super::*;

    pub fn encode<E, T, S>(set: &IndexSet<T, S>, encoder: &mut E) -> Result<(), EncodeError>
    where
        E: Encoder,
        T: Encode,
    {
        usize::encode(&set.len(), encoder)?;
        for item in set {
            T::encode(item, encoder)?;
        }
        Ok(())
    }

    pub fn decode<Context, D, T, S>(decoder: &mut D) -> Result<IndexSet<T, S>, DecodeError>
    where
        D: Decoder<Context = Context>,
        T: Decode<Context> + Eq + Hash,
        S: BuildHasher + Default,
    {
        let len = usize::decode(decoder)?;
        let mut set = IndexSet::with_capacity_and_hasher(len, Default::default());
        for _i in 0..len {
            set.insert(T::decode(decoder)?);
        }
        Ok(set)
    }

    pub fn borrow_decode<'de, Context, D, T, S>(
        decoder: &mut D,
    ) -> Result<IndexSet<T, S>, DecodeError>
    where
        D: BorrowDecoder<'de, Context = Context>,
        T: BorrowDecode<'de, Context> + Eq + Hash,
        S: BuildHasher + Default,
    {
        let len = usize::decode(decoder)?;
        let mut set = IndexSet::with_capacity_and_hasher(len, Default::default());
        for _i in 0..len {
            set.insert(T::borrow_decode(decoder)?);
        }
        Ok(set)
    }

    #[cfg(test)]
    mod tests {
        use bincode::{decode_from_slice, encode_to_vec};

        use super::*;

        #[test]
        fn test_roundtrip() {
            let cfg = bincode::config::standard();

            #[derive(Encode, Decode)]
            struct Wrapper(#[bincode(with = "crate::indexset")] IndexSet<String>);

            let set1 = Wrapper(IndexSet::from([
                "value1".to_string(),
                "value2".to_string(),
                "value3".to_string(),
            ]));

            let set2: Wrapper = decode_from_slice(&encode_to_vec(&set1, cfg).unwrap(), cfg)
                .unwrap()
                .0;

            assert_eq!(set1.0, set2.0);
        }
    }
}

pub mod ringset {
    use std::hash::{BuildHasher, Hash};

    use ::ringmap::RingSet;

    use super::*;

    pub fn encode<E, T, S>(set: &RingSet<T, S>, encoder: &mut E) -> Result<(), EncodeError>
    where
        E: Encoder,
        T: Encode,
    {
        usize::encode(&set.len(), encoder)?;
        for item in set {
            T::encode(item, encoder)?;
        }
        Ok(())
    }

    pub fn decode<Context, D, T, S>(decoder: &mut D) -> Result<RingSet<T, S>, DecodeError>
    where
        D: Decoder<Context = Context>,
        T: Decode<Context> + Eq + Hash,
        S: BuildHasher + Default,
    {
        let len = usize::decode(decoder)?;
        let mut set = RingSet::with_capacity_and_hasher(len, Default::default());
        for _i in 0..len {
            set.insert(T::decode(decoder)?);
        }
        Ok(set)
    }

    pub fn borrow_decode<'de, Context, D, T, S>(
        decoder: &mut D,
    ) -> Result<RingSet<T, S>, DecodeError>
    where
        D: BorrowDecoder<'de, Context = Context>,
        T: BorrowDecode<'de, Context> + Eq + Hash,
        S: BuildHasher + Default,
    {
        let len = usize::decode(decoder)?;
        let mut set = RingSet::with_capacity_and_hasher(len, Default::default());
        for _i in 0..len {
            set.insert(T::borrow_decode(decoder)?);
        }
        Ok(set)
    }

    #[cfg(test)]
    mod tests {
        use bincode::{decode_from_slice, encode_to_vec};

        use super::*;

        #[test]
        fn test_roundtrip() {
            let cfg = bincode::config::standard();

            #[derive(Encode, Decode)]
            struct Wrapper(#[bincode(with = "crate::ringset")] RingSet<String>);

            let set1 = Wrapper(RingSet::from([
                "value1".to_string(),
                "value2".to_string(),
                "value3".to_string(),
            ]));

            let set2: Wrapper = decode_from_slice(&encode_to_vec(&set1, cfg).unwrap(), cfg)
                .unwrap()
                .0;

            assert_eq!(set1.0, set2.0);
        }
    }
}

pub mod mime_option {
    use std::str::FromStr;

    use mime::Mime;

    use super::*;

    pub fn encode<E: Encoder>(mime: &Option<Mime>, encoder: &mut E) -> Result<(), EncodeError> {
        let mime_str: Option<&str> = mime.as_ref().map(AsRef::as_ref);
        Encode::encode(&mime_str, encoder)
    }

    pub fn decode<Context, D: Decoder<Context = Context>>(
        decoder: &mut D,
    ) -> Result<Option<Mime>, DecodeError> {
        if let Some(mime_str) = <Option<String> as Decode<Context>>::decode(decoder)? {
            Ok(Some(
                Mime::from_str(&mime_str).map_err(|e| DecodeError::OtherString(e.to_string()))?,
            ))
        } else {
            Ok(None)
        }
    }

    pub fn borrow_decode<'de, Context, D: BorrowDecoder<'de, Context = Context>>(
        decoder: &mut D,
    ) -> Result<Option<Mime>, DecodeError> {
        decode(decoder)
    }

    #[cfg(test)]
    mod tests {
        use bincode::{decode_from_slice, encode_to_vec};

        use super::*;

        #[derive(Encode, Decode)]
        struct Wrapper(#[bincode(with = "crate::mime_option")] Option<Mime>);

        #[test]
        fn test_roundtrip() {
            let cfg = bincode::config::standard();

            let mime1 = Wrapper(Some("text/html; charset=utf-8".parse().unwrap()));

            let mime2: Wrapper = decode_from_slice(&encode_to_vec(&mime1, cfg).unwrap(), cfg)
                .unwrap()
                .0;

            assert_eq!(mime1.0, mime2.0);
        }

        #[test]
        fn test_roundtrip_none() {
            let cfg = bincode::config::standard();

            let mime1 = Wrapper(None);

            let mime2: Wrapper = decode_from_slice(&encode_to_vec(&mime1, cfg).unwrap(), cfg)
                .unwrap()
                .0;

            assert_eq!(mime1.0, mime2.0);
        }
    }
}

/// Encode/decode as a serialized string encoded using `serde_json`.
///
/// This encodes less efficiently than `#[bincode(with_serde)]` would, but avoids [bincode's known
/// compatibility issues][serde-issues]. Use this for infrequently-serialized types and when you're
/// unsure if the underlying type may trigger a serde compatibility issue.
///
/// In the future this could be replaced with a more efficient serde-compatible self-describing
/// format with a compact binary representation (e.g. pot or MessagePack), but `serde_json` is
/// convenient because it avoids introducing additional dependencies.
///
/// [serde-issues]: https://docs.rs/bincode/latest/bincode/serde/index.html#known-issues
pub mod serde_json {
    use super::*;

    pub fn encode<E: Encoder, T: serde::Serialize>(
        value: &T,
        encoder: &mut E,
    ) -> Result<(), EncodeError> {
        let json_str =
            ::serde_json::to_string(value).map_err(|e| EncodeError::OtherString(e.to_string()))?;
        Encode::encode(&json_str, encoder)
    }

    pub fn decode<Context, D: Decoder<Context = Context>, T: serde::de::DeserializeOwned>(
        decoder: &mut D,
    ) -> Result<T, DecodeError> {
        let json_str: String = Decode::decode(decoder)?;
        ::serde_json::from_str(&json_str).map_err(|e| DecodeError::OtherString(e.to_string()))
    }

    pub fn borrow_decode<
        'de,
        Context,
        D: BorrowDecoder<'de, Context = Context>,
        T: serde::de::Deserialize<'de>,
    >(
        decoder: &mut D,
    ) -> Result<T, DecodeError> {
        let json_str: &str = BorrowDecode::borrow_decode(decoder)?;
        ::serde_json::from_str(json_str).map_err(|e| DecodeError::OtherString(e.to_string()))
    }

    #[cfg(test)]
    mod tests {
        use ::serde_json::{Value, json};
        use bincode::{decode_from_slice, encode_to_vec};

        use super::*;

        #[test]
        fn test_roundtrip() {
            let cfg = bincode::config::standard();

            #[derive(Encode, Decode)]
            struct Wrapper(#[bincode(with = "crate::serde_json")] Value);

            let value1 = Wrapper(json!({
                "key1": [1, 2, 3],
                "key2": [4, 5, 6]
            }));

            let value2: Wrapper = decode_from_slice(&encode_to_vec(&value1, cfg).unwrap(), cfg)
                .unwrap()
                .0;

            assert_eq!(value1.0, value2.0);
        }
    }
}

pub mod either {
    use ::either::Either;

    use super::*;

    pub fn encode<E: Encoder, L: Encode, R: Encode>(
        value: &Either<L, R>,
        encoder: &mut E,
    ) -> Result<(), EncodeError> {
        value.is_left().encode(encoder)?;
        ::either::for_both!(value, v => Encode::encode(v, encoder))
    }

    pub fn decode<
        Context,
        D: Decoder<Context = Context>,
        L: Decode<Context>,
        R: Decode<Context>,
    >(
        decoder: &mut D,
    ) -> Result<Either<L, R>, DecodeError> {
        let is_left = bool::decode(decoder)?;
        Ok(if is_left {
            Either::Left(L::decode(decoder)?)
        } else {
            Either::Right(R::decode(decoder)?)
        })
    }

    pub fn borrow_decode<
        'de,
        Context,
        D: BorrowDecoder<'de, Context = Context>,
        L: BorrowDecode<'de, Context>,
        R: BorrowDecode<'de, Context>,
    >(
        decoder: &mut D,
    ) -> Result<Either<L, R>, DecodeError> {
        let is_left = bool::borrow_decode(decoder)?;
        Ok(if is_left {
            Either::Left(L::borrow_decode(decoder)?)
        } else {
            Either::Right(R::borrow_decode(decoder)?)
        })
    }

    #[cfg(test)]
    mod tests {
        use bincode::{decode_from_slice, encode_to_vec};

        use super::*;

        #[derive(Encode, Decode)]
        struct Wrapper(#[bincode(with = "crate::either")] Either<String, u32>);

        #[test]
        fn test_roundtrip_left() {
            let cfg = bincode::config::standard();

            let either1 = Wrapper(Either::Left("hello".to_string()));

            let either2: Wrapper = decode_from_slice(&encode_to_vec(&either1, cfg).unwrap(), cfg)
                .unwrap()
                .0;

            assert_eq!(either1.0, either2.0);
        }

        #[test]
        fn test_roundtrip_right() {
            let cfg = bincode::config::standard();

            let either1 = Wrapper(Either::Right(42u32));

            let either2: Wrapper = decode_from_slice(&encode_to_vec(&either1, cfg).unwrap(), cfg)
                .unwrap()
                .0;

            assert_eq!(either1.0, either2.0);
        }
    }
}

pub mod smallvec {
    use ::smallvec::Array;

    use super::*;

    pub fn encode<E: Encoder, A: Array<Item = impl Encode>>(
        vec: &SmallVec<A>,
        encoder: &mut E,
    ) -> Result<(), EncodeError> {
        usize::encode(&vec.len(), encoder)?;
        for item in vec {
            Encode::encode(item, encoder)?;
        }
        Ok(())
    }

    pub fn decode<Context, D: Decoder<Context = Context>, A: Array<Item = impl Decode<Context>>>(
        decoder: &mut D,
    ) -> Result<SmallVec<A>, DecodeError> {
        let len = usize::decode(decoder)?;
        let mut vec = SmallVec::with_capacity(len);
        for _ in 0..len {
            vec.push(Decode::decode(decoder)?);
        }
        Ok(vec)
    }

    pub fn borrow_decode<
        'de,
        Context,
        D: BorrowDecoder<'de, Context = Context>,
        A: Array<Item = impl BorrowDecode<'de, Context>>,
    >(
        decoder: &mut D,
    ) -> Result<SmallVec<A>, DecodeError> {
        let len = usize::decode(decoder)?;
        let mut vec = SmallVec::with_capacity(len);
        for _ in 0..len {
            vec.push(BorrowDecode::borrow_decode(decoder)?);
        }
        Ok(vec)
    }

    #[cfg(test)]
    mod tests {
        use bincode::{decode_from_slice, encode_to_vec};

        use super::*;

        #[test]
        fn test_roundtrip() {
            let cfg = bincode::config::standard();

            #[derive(Encode, Decode)]
            struct Wrapper(#[bincode(with = "crate::smallvec")] SmallVec<[u32; 4]>);

            let vec1 = Wrapper(SmallVec::from_slice(&[1u32, 2, 3, 4, 5]));

            let vec2: Wrapper = decode_from_slice(&encode_to_vec(&vec1, cfg).unwrap(), cfg)
                .unwrap()
                .0;

            assert_eq!(vec1.0, vec2.0);
        }
    }
}

pub mod owned_cow {
    //! Overrides the default [`BorrowDecode`] implementation to always use the owned representation
    //! of [`Cow`], so that the resulting [`BorrowDecode`] type is independent of the [`Cow`]'s
    //! lifetime.

    use std::borrow::Cow;

    use super::*;

    #[allow(clippy::ptr_arg)]
    pub fn encode<E, T>(cow: &Cow<'_, T>, encoder: &mut E) -> Result<(), EncodeError>
    where
        E: Encoder,
        T: ToOwned + ?Sized,
        for<'a> &'a T: Encode,
    {
        cow.encode(encoder)
    }

    pub fn decode<'cow, Context, D, T>(decoder: &mut D) -> Result<Cow<'cow, T>, DecodeError>
    where
        D: Decoder<Context = Context>,
        T: ToOwned + ?Sized,
        <T as ToOwned>::Owned: Decode<Context>,
    {
        Decode::decode(decoder)
    }

    pub fn borrow_decode<'de, 'cow, Context, D, T>(
        decoder: &mut D,
    ) -> Result<Cow<'cow, T>, DecodeError>
    where
        D: BorrowDecoder<'de, Context = Context>,
        T: ToOwned + ?Sized,
        <T as ToOwned>::Owned: Decode<Context>,
    {
        Decode::decode(decoder)
    }
}
