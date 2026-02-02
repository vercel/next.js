use std::{fmt::Debug, ops::Deref, sync::Arc};

use bincode::{
    Decode, Encode,
    de::Decoder,
    error::{DecodeError, EncodeError},
    impl_borrow_decode_with_context,
};

#[derive(Clone)]
pub enum ArcOrOwned<T> {
    Arc(Arc<T>),
    Owned(T),
}

impl<T> ArcOrOwned<T> {}

impl<T> Deref for ArcOrOwned<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        match self {
            Self::Arc(arc) => arc.deref(),
            Self::Owned(value) => value,
        }
    }
}

impl<T> AsRef<T> for ArcOrOwned<T> {
    fn as_ref(&self) -> &T {
        self.deref()
    }
}

impl<T> From<T> for ArcOrOwned<T> {
    fn from(value: T) -> Self {
        Self::Owned(value)
    }
}

impl<T> From<Arc<T>> for ArcOrOwned<T> {
    fn from(arc: Arc<T>) -> Self {
        Self::Arc(arc)
    }
}

impl<T> From<ArcOrOwned<T>> for Arc<T> {
    fn from(value: ArcOrOwned<T>) -> Self {
        match value {
            ArcOrOwned::Arc(arc) => arc,
            ArcOrOwned::Owned(value) => Arc::new(value),
        }
    }
}

impl<T> Encode for ArcOrOwned<T>
where
    T: Encode,
{
    fn encode<E: bincode::enc::Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        match self {
            ArcOrOwned::Arc(arc) => arc.encode(encoder),
            ArcOrOwned::Owned(value) => value.encode(encoder),
        }
    }
}

impl<T, Context> Decode<Context> for ArcOrOwned<T>
where
    T: Decode<Context>,
{
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        let value = T::decode(decoder)?;
        Ok(ArcOrOwned::Owned(value))
    }
}

impl_borrow_decode_with_context!(ArcOrOwned<T>, Context, Context, T: Decode<Context>);

impl<T> Debug for ArcOrOwned<T>
where
    T: Debug,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.as_ref().fmt(f)
    }
}
