use std::{
    fmt::{Debug, Display},
    mem::transmute_copy,
    num::{NonZero, NonZeroU64, TryFromIntError},
    ops::Deref,
};

use serde::{Deserialize, Serialize, de::Visitor};

use crate::{
    TaskPersistence, registry,
    trace::{TraceRawVcs, TraceRawVcsContext},
};

macro_rules! define_id {
    (
        $name:ident : $primitive:ty
        $(,derive($($derive:ty),*))?
        $(,serde($serde:tt))?
        $(,doc = $doc:literal)*
        $(,)?
    ) => {
        $(#[doc = $doc])*
        #[derive(Hash, Clone, Copy, PartialEq, Eq, PartialOrd, Ord $($(,$derive)*)? )]
        $(#[serde($serde)])?
        pub struct $name {
            id: NonZero<$primitive>,
        }

        impl $name {
            pub const MIN: Self = Self { id: NonZero::<$primitive>::MIN };
            pub const MAX: Self = Self { id: NonZero::<$primitive>::MAX };

            /// Constructs a wrapper type from the numeric identifier.
            ///
            /// # Safety
            ///
            /// The passed `id` must not be zero.
            pub const unsafe fn new_unchecked(id: $primitive) -> Self {
                Self { id: unsafe { NonZero::<$primitive>::new_unchecked(id) } }
            }
            /// Constructs a wrapper type from the numeric identifier.
            ///
            /// Returns `None` if the provided `id` is zero, otherwise returns
            /// `Some(Self)` containing the wrapped non-zero identifier.
            pub fn new(id: $primitive) -> Option<Self> {
                NonZero::<$primitive>::new(id).map(|id| Self{id})
            }
            /// Allows `const` conversion to a [`NonZeroU64`], useful with
            /// [`crate::id_factory::IdFactory::new_const`].
            pub const fn to_non_zero_u64(self) -> NonZeroU64 {
                const {
                    assert!(<$primitive>::BITS <= u64::BITS);
                }
                unsafe { NonZeroU64::new_unchecked(self.id.get() as u64) }
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

        define_id!(@impl_try_from_primitive_conversion $name $primitive);

        impl From<NonZero<$primitive>> for $name {
            fn from(id: NonZero::<$primitive>) -> Self {
                Self {
                    id,
                }
            }
        }

        impl From<$name> for NonZeroU64 {
            fn from(id: $name) -> Self {
                id.to_non_zero_u64()
            }
        }

        impl TraceRawVcs for $name {
            fn trace_raw_vcs(&self, _trace_context: &mut TraceRawVcsContext) {}
        }
    };
    (
        @impl_try_from_primitive_conversion $name:ident u64
    ) => {
        // we get a `TryFrom` blanket impl for free via the `From` impl
    };
    (
        @impl_try_from_primitive_conversion $name:ident $primitive:ty
    ) => {
        impl TryFrom<$primitive> for $name {
            type Error = TryFromIntError;

            fn try_from(id: $primitive) -> Result<Self, Self::Error> {
                Ok(Self {
                    id: NonZero::try_from(id)?
                })
            }
        }

        impl TryFrom<NonZeroU64> for $name {
            type Error = TryFromIntError;

            fn try_from(id: NonZeroU64) -> Result<Self, Self::Error> {
                Ok(Self { id: NonZero::try_from(id)? })
            }
        }
    };
}

define_id!(TaskId: u32, derive(Serialize, Deserialize), serde(transparent));
define_id!(FunctionId: u16);
define_id!(ValueTypeId: u16);
define_id!(TraitTypeId: u16);
define_id!(SessionId: u32, derive(Debug, Serialize, Deserialize), serde(transparent));
define_id!(
    LocalTaskId: u32,
    derive(Debug, Serialize, Deserialize),
    serde(transparent),
    doc = "Represents the nth `local` function call inside a task.",
);
define_id!(
    ExecutionId: u16,
    derive(Debug, Serialize, Deserialize),
    serde(transparent),
    doc = "An identifier for a specific task execution. Used to assert that local `Vc`s don't \
        leak. This value may overflow and re-use old values.",
);

impl Debug for TaskId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TaskId").field("id", &self.id).finish()
    }
}

pub const TRANSIENT_TASK_BIT: u32 = 0x8000_0000;

impl TaskId {
    pub fn is_transient(&self) -> bool {
        **self & TRANSIENT_TASK_BIT != 0
    }
    pub fn persistence(&self) -> TaskPersistence {
        // tasks with `TaskPersistence::LocalCells` have no `TaskId`, so we can ignore that case
        if self.is_transient() {
            TaskPersistence::Transient
        } else {
            TaskPersistence::Persistent
        }
    }
}

macro_rules! make_serializable {
    ($ty:ty, $get_object:path, $validate_type_id:path, $visitor_name:ident) => {
        impl Serialize for $ty {
            fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: serde::Serializer,
            {
                serializer.serialize_u16(self.id.into())
            }
        }

        impl<'de> Deserialize<'de> for $ty {
            fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                deserializer.deserialize_u16($visitor_name)
            }
        }

        struct $visitor_name;

        impl<'de> Visitor<'de> for $visitor_name {
            type Value = $ty;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str(concat!("an id of a registered ", stringify!($ty)))
            }

            fn visit_u16<E>(self, v: u16) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match Self::Value::new(v) {
                    Some(value) => {
                        if let Some(error) = $validate_type_id(value) {
                            Err(E::custom(error))
                        } else {
                            Ok(value)
                        }
                    }
                    None => Err(E::unknown_variant(&format!("{v}"), &["a non zero u16"])),
                }
            }
        }

        impl Debug for $ty {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.debug_struct(stringify!($ty))
                    .field("id", &self.id)
                    .field("name", &$get_object(*self))
                    .finish()
            }
        }
    };
}

make_serializable!(
    ValueTypeId,
    registry::get_value_type,
    registry::validate_value_type_id,
    ValueTypeVisitor
);
make_serializable!(
    TraitTypeId,
    registry::get_trait,
    registry::validate_trait_type_id,
    TraitTypeVisitor
);
make_serializable!(
    FunctionId,
    registry::get_native_function,
    registry::validate_function_id,
    FunctionTypeVisitor
);
