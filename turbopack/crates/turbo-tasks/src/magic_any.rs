use std::{any::Any, fmt::Debug, hash::Hash};

use serde::{Deserialize, Serialize, de::DeserializeSeed};
use turbo_dyn_eq_hash::{
    DynEq, DynHash, impl_eq_for_dyn, impl_hash_for_dyn, impl_partial_eq_for_dyn,
};

use crate::trace::TraceRawVcs;

pub trait MagicAny: Debug + DynEq + DynHash + TraceRawVcs + Send + Sync + 'static {
    #[cfg(debug_assertions)]
    fn magic_type_name(&self) -> &'static str;
}

impl<T> MagicAny for T
where
    T: Debug + Eq + Hash + Send + Sync + TraceRawVcs + 'static,
{
    #[cfg(debug_assertions)]
    fn magic_type_name(&self) -> &'static str {
        std::any::type_name::<T>()
    }
}

impl_partial_eq_for_dyn!(dyn MagicAny);
impl_eq_for_dyn!(dyn MagicAny);
impl_hash_for_dyn!(dyn MagicAny);

impl dyn MagicAny {
    pub fn as_serialize<T: Debug + Eq + Hash + Serialize + Send + Sync + TraceRawVcs + 'static>(
        &self,
    ) -> &dyn erased_serde::Serialize {
        if let Some(r) = (self as &dyn Any).downcast_ref::<T>() {
            r
        } else {
            #[cfg(debug_assertions)]
            panic!(
                "MagicAny::as_serializable broken: got {} but expected {}",
                self.magic_type_name(),
                std::any::type_name::<T>(),
            );
            #[cfg(not(debug_assertions))]
            panic!("MagicAny::as_serializable bug");
        }
    }
}

type MagicAnySerializeFunctor = fn(&dyn MagicAny) -> &dyn erased_serde::Serialize;

#[derive(Clone, Copy)]
pub struct MagicAnySerializeSeed {
    functor: MagicAnySerializeFunctor,
}

impl MagicAnySerializeSeed {
    pub fn new<T: Debug + Eq + Hash + Serialize + Send + Sync + TraceRawVcs + 'static>() -> Self {
        fn serialize<T: Debug + Eq + Hash + Serialize + Send + Sync + TraceRawVcs + 'static>(
            value: &dyn MagicAny,
        ) -> &dyn erased_serde::Serialize {
            value.as_serialize::<T>()
        }
        Self {
            functor: serialize::<T>,
        }
    }

    pub fn as_serialize<'a>(&self, value: &'a dyn MagicAny) -> &'a dyn erased_serde::Serialize {
        (self.functor)(value)
    }
}

type MagicAnyDeserializeSeedFunctor =
    fn(&mut dyn erased_serde::Deserializer<'_>) -> Result<Box<dyn MagicAny>, erased_serde::Error>;

#[derive(Clone, Copy)]
pub struct MagicAnyDeserializeSeed {
    functor: MagicAnyDeserializeSeedFunctor,
}

impl MagicAnyDeserializeSeed {
    pub fn new<T>() -> Self
    where
        T: for<'de> Deserialize<'de> + Debug + Eq + Hash + Send + Sync + TraceRawVcs + 'static,
    {
        fn deserialize<T>(
            deserializer: &mut dyn erased_serde::Deserializer<'_>,
        ) -> Result<Box<dyn MagicAny>, erased_serde::Error>
        where
            T: for<'de> Deserialize<'de> + Debug + Eq + Hash + Send + Sync + TraceRawVcs + 'static,
        {
            let value: T = erased_serde::deserialize(deserializer)?;
            Ok(Box::new(value))
        }
        Self {
            functor: deserialize::<T>,
        }
    }
}

impl<'de> DeserializeSeed<'de> for MagicAnyDeserializeSeed {
    type Value = Box<dyn MagicAny>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let mut deserializer = <dyn erased_serde::Deserializer>::erase(deserializer);
        (self.functor)(&mut deserializer).map_err(serde::de::Error::custom)
    }
}
