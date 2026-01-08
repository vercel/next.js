use std::{fmt::Display, mem::replace, sync::Arc};

use bincode::{Decode, Encode};
use indexmap::map::Entry;
use turbo_dyn_eq_hash::{
    DynEq, DynHash, impl_eq_for_dyn, impl_hash_for_dyn, impl_partial_eq_for_dyn,
};

use crate::{
    FxIndexMap, FxIndexSet, TaskId, TurboTasksApi,
    manager::{current_task_if_available, mark_invalidator},
    trace::TraceRawVcs,
    util::StaticOrArc,
};

/// Get an [`Invalidator`] that can be used to invalidate the current task
/// based on external events.
/// Returns `None` if called outside of a task context.
pub fn get_invalidator() -> Option<Invalidator> {
    if let Some(task) = current_task_if_available("turbo_tasks::get_invalidator()") {
        mark_invalidator();
        Some(Invalidator { task })
    } else {
        None
    }
}

/// A lightweight handle to invalidate a task. Only stores the task ID.
/// The caller must provide the `TurboTasksApi` when calling invalidation methods.
#[derive(Clone, Copy, Hash, PartialEq, Eq, Encode, Decode)]
pub struct Invalidator {
    task: TaskId,
}

impl Invalidator {
    pub fn invalidate(self, turbo_tasks: &dyn TurboTasksApi) {
        turbo_tasks.invalidate(self.task);
    }

    pub fn invalidate_with_reason<T: InvalidationReason>(
        self,
        turbo_tasks: &dyn TurboTasksApi,
        reason: T,
    ) {
        turbo_tasks.invalidate_with_reason(
            self.task,
            (Arc::new(reason) as Arc<dyn InvalidationReason>).into(),
        );
    }

    pub fn invalidate_with_static_reason<T: InvalidationReason>(
        self,
        turbo_tasks: &dyn TurboTasksApi,
        reason: &'static T,
    ) {
        turbo_tasks.invalidate_with_reason(
            self.task,
            (reason as &'static dyn InvalidationReason).into(),
        );
    }
}

impl TraceRawVcs for Invalidator {
    fn trace_raw_vcs(&self, _context: &mut crate::trace::TraceRawVcsContext) {
        // nothing here
    }
}

/// A user-facing reason why a task was invalidated. This should only be used
/// for invalidation that were triggered by the user.
///
/// Reasons are deduplicated, so this need to implement [Eq] and [Hash]
pub trait InvalidationReason: DynEq + DynHash + Display + Send + Sync + 'static {
    fn kind(&self) -> Option<StaticOrArc<dyn InvalidationReasonKind>> {
        None
    }
}

/// Invalidation reason kind. This is used to merge multiple reasons of the same
/// kind into a combined description.
///
/// Reason kinds are used a hash map key, so this need to implement [Eq] and
/// [Hash]
pub trait InvalidationReasonKind: DynEq + DynHash + Send + Sync + 'static {
    /// Displays a description of multiple invalidation reasons of the same
    /// kind. It is only called with two or more reasons.
    fn fmt(
        &self,
        data: &FxIndexSet<StaticOrArc<dyn InvalidationReason>>,
        f: &mut std::fmt::Formatter<'_>,
    ) -> std::fmt::Result;
}

impl_partial_eq_for_dyn!(dyn InvalidationReason);
impl_eq_for_dyn!(dyn InvalidationReason);
impl_hash_for_dyn!(dyn InvalidationReason);

impl_partial_eq_for_dyn!(dyn InvalidationReasonKind);
impl_eq_for_dyn!(dyn InvalidationReasonKind);
impl_hash_for_dyn!(dyn InvalidationReasonKind);

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
        reasons: FxIndexSet<StaticOrArc<dyn InvalidationReason>>,
    },
}

/// A set of [InvalidationReason]s. They are automatically deduplicated and
/// merged by kind during insertion. It implements [Display] to get a readable
/// representation.
#[derive(Default)]
pub struct InvalidationReasonSet {
    next_unique_tag: usize,
    // We track typed and untyped entries in the same map to keep the occurrence order of entries.
    map: FxIndexMap<MapKey, MapEntry>,
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
                            reasons: FxIndexSet::default(),
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
                            let mut reasons = FxIndexSet::default();
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
                    write!(f, "{reason}")?;
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
