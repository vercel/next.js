use std::{
    fmt::{Debug, Display},
    mem::transmute_copy,
    num::NonZeroU32,
    ops::Deref,
};

use serde::{de::Visitor, Deserialize, Serialize};

use crate::registry;

macro_rules! define_id {
    (internal $name:ident $(,$derive:ty)*) => {
        #[derive(Hash, Clone, Copy, PartialEq, Eq, PartialOrd, Ord $(,$derive)*)]
        pub struct $name {
            id: NonZeroU32,
        }

        impl $name {
            /// # Safety
            ///
            /// The passed `id` must not be zero.
            pub unsafe fn new_unchecked(id: u32) -> Self {
                Self { id: unsafe { NonZeroU32::new_unchecked(id) } }
            }
        }

        impl Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(f, concat!(stringify!($name), " {}"), self.id)
            }
        }

        impl Deref for $name {
            type Target = u32;

            fn deref(&self) -> &Self::Target {
                unsafe { transmute_copy(&&self.id) }
            }
        }

        impl From<u32> for $name {
            fn from(id: u32) -> Self {
                Self { id: NonZeroU32::new(id).expect("Ids can only be created from non zero values") }
            }
        }

        impl nohash_hasher::IsEnabled for $name {}
    };
    ($name:ident) => {
        define_id!(internal $name);
    };
    ($name:ident, derive($($derive:ty),*)) => {
        define_id!(internal $name $(,$derive)*);
    };
}

define_id!(TaskId);
define_id!(FunctionId);
define_id!(ValueTypeId);
define_id!(TraitTypeId);
define_id!(BackendJobId);

impl Debug for TaskId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TaskId").field("id", &self.id).finish()
    }
}

macro_rules! make_serializable {
    ($ty:ty, $get_global_name:path, $get_id:path, $visitor_name:ident) => {
        impl Serialize for $ty {
            fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: serde::Serializer,
            {
                serializer.serialize_str($get_global_name(*self))
            }
        }

        impl<'de> Deserialize<'de> for $ty {
            fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                deserializer.deserialize_str($visitor_name)
            }
        }

        struct $visitor_name;

        impl<'de> Visitor<'de> for $visitor_name {
            type Value = $ty;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str(concat!("a name of a registered ", stringify!($ty)))
            }

            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                $get_id(v).ok_or_else(|| E::unknown_variant(v, &[]))
            }
        }

        impl Debug for $ty {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.debug_struct(stringify!($ty))
                    .field("id", &self.id)
                    .field("name", &$get_global_name(*self))
                    .finish()
            }
        }
    };
}

make_serializable!(
    FunctionId,
    registry::get_function_global_name,
    registry::get_function_id_by_global_name,
    FunctionIdVisitor
);
make_serializable!(
    ValueTypeId,
    registry::get_value_type_global_name,
    registry::get_value_type_id_by_global_name,
    ValueTypeVisitor
);
make_serializable!(
    TraitTypeId,
    registry::get_trait_type_global_name,
    registry::get_trait_type_id_by_global_name,
    TraitTypeVisitor
);

impl Serialize for TaskId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_u32(**self)
    }
}

impl<'de> Deserialize<'de> for TaskId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct V;

        impl Visitor<'_> for V {
            type Value = TaskId;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                write!(f, "task id")
            }

            fn visit_u32<E>(self, v: u32) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(TaskId::from(v))
            }
        }

        deserializer.deserialize_u64(V)
    }
}
