use std::{
    any::{Any, TypeId},
    fmt::Display,
    hash::{Hash, Hasher},
    mem::replace,
};

use indexmap::{map::Entry, IndexMap, IndexSet};

use crate::{magic_any::HasherMut, util::StaticOrArc};

pub trait DynamicEqHash {
    fn as_any(&self) -> &dyn Any;
    fn dyn_eq(&self, other: &dyn Any) -> bool;
    fn dyn_hash(&self, state: &mut dyn Hasher);
}

impl<T: Any + PartialEq + Eq + Hash> DynamicEqHash for T {
    fn as_any(&self) -> &dyn Any {
        self
    }

    fn dyn_eq(&self, other: &dyn Any) -> bool {
        other
            .downcast_ref::<Self>()
            .map(|other| self.eq(other))
            .unwrap_or(false)
    }

    fn dyn_hash(&self, state: &mut dyn Hasher) {
        Hash::hash(&(TypeId::of::<Self>(), self), &mut HasherMut(state));
    }
}

/// A user-facing reason why a task was invalidated. This should only be used
/// for invalidation that were triggered by the user.
///
/// Reasons are deduplicated, so this need to implement [Eq] and [Hash]
pub trait InvalidationReason: DynamicEqHash + Display + Send + Sync + 'static {
    fn kind(&self) -> Option<StaticOrArc<dyn InvalidationReasonKind>> {
        None
    }
}

/// Invalidation reason kind. This is used to merge multiple reasons of the same
/// kind into a combined description.
///
/// Reason kinds are used a hash map key, so this need to implement [Eq] and
/// [Hash]
pub trait InvalidationReasonKind: DynamicEqHash + Send + Sync + 'static {
    /// Displays a description of multiple invalidation reasons of the same
    /// kind. It is only called with two or more reasons.
    fn fmt(
        &self,
        data: &IndexSet<StaticOrArc<dyn InvalidationReason>>,
        f: &mut std::fmt::Formatter<'_>,
    ) -> std::fmt::Result;
}

macro_rules! impl_eq_hash {
    ($ty:ty) => {
        impl PartialEq for $ty {
            fn eq(&self, other: &Self) -> bool {
                DynamicEqHash::dyn_eq(self, other.as_any())
            }
        }

        impl Eq for $ty {}

        impl Hash for $ty {
            fn hash<H: Hasher>(&self, state: &mut H) {
                self.as_any().type_id().hash(state);
                DynamicEqHash::dyn_hash(self, state as &mut dyn Hasher)
            }
        }
    };
}

impl_eq_hash!(dyn InvalidationReason);
impl_eq_hash!(dyn InvalidationReasonKind);

#[derive(PartialEq, Eq, Hash)]
enum MapKey {
    Untyped {
        unique_tag: usize,
    },
    Typed {
        kind: StaticOrArc<dyn InvalidationReasonKind>,
    },
}

enum MapEntry {
    Single {
        reason: StaticOrArc<dyn InvalidationReason>,
    },
    Multiple {
        reasons: IndexSet<StaticOrArc<dyn InvalidationReason>>,
    },
}

/// A set of [InvalidationReason]s. They are automatically deduplicated and
/// merged by kind during insertion. It implements [Display] to get a readable
/// representation.
#[derive(Default)]
pub struct InvalidationReasonSet {
    next_unique_tag: usize,
    // We track typed and untyped entries in the same map to keep the occurence order of entries.
    map: IndexMap<MapKey, MapEntry>,
}

impl InvalidationReasonSet {
    pub(crate) fn insert(&mut self, reason: StaticOrArc<dyn InvalidationReason>) {
        if let Some(kind) = reason.kind() {
            let key = MapKey::Typed { kind };
            match self.map.entry(key) {
                Entry::Occupied(mut entry) => {
                    let entry = &mut *entry.get_mut();
                    match replace(
                        entry,
                        MapEntry::Multiple {
                            reasons: IndexSet::new(),
                        },
                    ) {
                        MapEntry::Single {
                            reason: existing_reason,
                        } => {
                            if reason == existing_reason {
                                *entry = MapEntry::Single {
                                    reason: existing_reason,
                                };
                                return;
                            }
                            let mut reasons = IndexSet::new();
                            reasons.insert(existing_reason);
                            reasons.insert(reason);
                            *entry = MapEntry::Multiple { reasons };
                        }
                        MapEntry::Multiple { mut reasons } => {
                            reasons.insert(reason);
                            *entry = MapEntry::Multiple { reasons };
                        }
                    }
                }
                Entry::Vacant(entry) => {
                    entry.insert(MapEntry::Single { reason });
                }
            }
        } else {
            let key = MapKey::Untyped {
                unique_tag: self.next_unique_tag,
            };
            self.next_unique_tag += 1;
            self.map.insert(key, MapEntry::Single { reason });
        }
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    pub fn len(&self) -> usize {
        self.map.len()
    }
}

impl Display for InvalidationReasonSet {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let count = self.map.len();
        for (i, (key, entry)) in self.map.iter().enumerate() {
            if i > 0 {
                write!(f, ", ")?;
                if i == count - 1 {
                    write!(f, "and ")?;
                }
            }
            match entry {
                MapEntry::Single { reason } => {
                    write!(f, "{}", reason)?;
                }
                MapEntry::Multiple { reasons } => {
                    let MapKey::Typed { kind } = key else {
                        unreachable!("An untyped reason can't collect more than one reason");
                    };
                    kind.fmt(reasons, f)?
                }
            }
        }
        Ok(())
    }
}
