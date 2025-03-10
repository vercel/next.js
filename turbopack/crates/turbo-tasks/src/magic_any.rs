use core::fmt;
use std::{
    any::{Any, TypeId},
    fmt::Debug,
    hash::{Hash, Hasher},
    ops::DerefMut,
    sync::Arc,
};

use serde::{de::DeserializeSeed, Deserialize, Serialize};

pub trait MagicAny: mopa::Any + Send + Sync {
    fn magic_any_arc(self: Arc<Self>) -> Arc<dyn Any + Sync + Send>;

    fn magic_debug(&self, f: &mut fmt::Formatter) -> fmt::Result;

    fn magic_eq(&self, other: &dyn MagicAny) -> bool;

    fn magic_hash(&self, hasher: &mut dyn Hasher);

    #[cfg(debug_assertions)]
    fn magic_type_name(&self) -> &'static str;
}

#[allow(clippy::transmute_ptr_to_ref)] // can't fix as it's in the macro
mod clippy {
    use mopa::mopafy;

    use super::MagicAny;

    mopafy!(MagicAny);
}

impl<T: Debug + Eq + Hash + Send + Sync + 'static> MagicAny for T {
    fn magic_any_arc(self: Arc<Self>) -> Arc<dyn Any + Sync + Send> {
        self
    }

    fn magic_debug(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let mut d = f.debug_tuple("MagicAny");
        d.field(&TypeId::of::<Self>());

        #[cfg(debug_assertions)]
        d.field(&std::any::type_name::<Self>());

        d.field(&(self as &Self));
        d.finish()
    }

    fn magic_eq(&self, other: &dyn MagicAny) -> bool {
        match other.downcast_ref::<Self>() {
            None => false,
            Some(other) => self == other,
        }
    }

    fn magic_hash(&self, hasher: &mut dyn Hasher) {
        Hash::hash(&(TypeId::of::<Self>(), self), &mut HasherMut(hasher))
    }

    #[cfg(debug_assertions)]
    fn magic_type_name(&self) -> &'static str {
        std::any::type_name::<T>()
    }
}

impl fmt::Debug for dyn MagicAny {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        self.magic_debug(f)
    }
}

impl PartialEq for dyn MagicAny {
    fn eq(&self, other: &Self) -> bool {
        self.magic_eq(other)
    }
}

impl Eq for dyn MagicAny {}

impl Hash for dyn MagicAny {
    fn hash<H: Hasher>(&self, hasher: &mut H) {
        self.magic_hash(hasher)
    }
}

pub struct HasherMut<H: ?Sized>(pub H);

impl<H: DerefMut + ?Sized> Hasher for HasherMut<H>
where
    H::Target: Hasher,
{
    fn finish(&self) -> u64 {
        self.0.finish()
    }

    fn write(&mut self, bytes: &[u8]) {
        self.0.write(bytes)
    }
}

impl dyn MagicAny {
    pub fn as_serialize<T: Debug + Eq + Hash + Serialize + Send + Sync + 'static>(
        &self,
    ) -> &dyn erased_serde::Serialize {
        if let Some(r) = self.downcast_ref::<T>() {
            r
        } else {
            #[cfg(debug_assertions)]
            panic!(
                "MagicAny::as_serializable broken: got {} but expected {}",
                self.magic_type_name(),
                std::any::type_name::<T>()
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
    pub fn new<T: Debug + Eq + Hash + Serialize + Send + Sync + 'static>() -> Self {
        fn serialize<T: Debug + Eq + Hash + Serialize + Send + Sync + 'static>(
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
        T: for<'de> Deserialize<'de> + Debug + Eq + Hash + Send + Sync + 'static,
    {
        fn deserialize<T: Debug + Eq + Hash + for<'de> Deserialize<'de> + Send + Sync + 'static>(
            deserializer: &mut dyn erased_serde::Deserializer<'_>,
        ) -> Result<Box<dyn MagicAny>, erased_serde::Error> {
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

type AnyDeserializeSeedFunctor = fn(
    &mut dyn erased_serde::Deserializer<'_>,
) -> Result<Box<dyn Any + Sync + Send>, erased_serde::Error>;

#[derive(Clone, Copy)]
pub struct AnyDeserializeSeed {
    functor: AnyDeserializeSeedFunctor,
}

impl AnyDeserializeSeed {
    pub fn new<T>() -> Self
    where
        T: for<'de> Deserialize<'de> + Any + Send + Sync + 'static,
    {
        fn deserialize<T: Any + for<'de> Deserialize<'de> + Send + Sync + 'static>(
            deserializer: &mut dyn erased_serde::Deserializer<'_>,
        ) -> Result<Box<dyn Any + Sync + Send>, erased_serde::Error> {
            let value: T = erased_serde::deserialize(deserializer)?;
            Ok(Box::new(value))
        }
        Self {
            functor: deserialize::<T>,
        }
    }
}

impl<'de> DeserializeSeed<'de> for AnyDeserializeSeed {
    type Value = Box<dyn Any + Sync + Send>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let mut deserializer = <dyn erased_serde::Deserializer>::erase(deserializer);
        (self.functor)(&mut deserializer).map_err(serde::de::Error::custom)
    }
}
