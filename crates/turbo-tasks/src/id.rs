use std::{
    fmt::{Debug, Display},
    mem::transmute_copy,
    num::{NonZero, NonZeroU64, TryFromIntError},
    ops::Deref,
};

use serde::{de::Visitor, Deserialize, Serialize};

use crate::registry;

macro_rules! define_id {
    ($name:ident : $primitive:ty $(,derive($($derive:ty),*))?) => {
        #[derive(Hash, Clone, Copy, PartialEq, Eq, PartialOrd, Ord $($(,$derive)*)? )]
        pub struct $name {
            id: NonZero<$primitive>,
        }

        impl $name {
            /// Constructs a wrapper type from the numeric identifier.
            ///
            /// # Safety
            ///
            /// The passed `id` must not be zero.
            pub unsafe fn new_unchecked(id: $primitive) -> Self {
                Self { id: unsafe { NonZero::<$primitive>::new_unchecked(id) } }
            }
        }

        impl Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(f, concat!(stringify!($name), " {}"), self.id)
            }
        }

        impl Deref for $name {
            type Target = $primitive;

            fn deref(&self) -> &Self::Target {
                unsafe { transmute_copy(&&self.id) }
            }
        }

        /// Converts a numeric identifier to the wrapper type.
        ///
        /// Panics if the given id value is zero.
        impl From<$primitive> for $name {
            fn from(id: $primitive) -> Self {
                Self {
                    id: NonZero::<$primitive>::new(id)
                        .expect("Ids can only be created from non zero values")
                }
            }
        }

        /// Converts a numeric identifier to the wrapper type.
        impl TryFrom<NonZeroU64> for $name {
            type Error = TryFromIntError;

            fn try_from(id: NonZeroU64) -> Result<Self, Self::Error> {
                Ok(Self { id: NonZero::try_from(id)? })
            }
        }
    };
}

define_id!(TaskId: u32);
define_id!(FunctionId: u32);
define_id!(ValueTypeId: u32);
define_id!(TraitTypeId: u32);
define_id!(BackendJobId: u32);
define_id!(ExecutionId: u64, derive(Debug));

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
