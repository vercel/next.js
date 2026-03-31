use std::{
    any::Any,
    fmt::{Display, Formatter},
    hash::Hash,
};

use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexSet, InvalidationReason, InvalidationReasonKind, util::StaticOrArc};

/// Invalidation was caused by a file change detected by the file watcher
#[derive(PartialEq, Eq, Hash)]
pub(crate) struct WatchChange {
    pub path: String,
}

impl InvalidationReason for WatchChange {
    fn kind(&self) -> Option<StaticOrArc<dyn InvalidationReasonKind>> {
        Some(StaticOrArc::Static(&WATCH_CHANGE_KIND))
    }
}

impl Display for WatchChange {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} changed", self.path)
    }
}

/// Invalidation kind for [WatchChange]
#[derive(PartialEq, Eq, Hash)]
struct WatchChangeKind;

static WATCH_CHANGE_KIND: WatchChangeKind = WatchChangeKind;

impl InvalidationReasonKind for WatchChangeKind {
    fn fmt(
        &self,
        reasons: &FxIndexSet<StaticOrArc<dyn InvalidationReason>>,
        f: &mut Formatter<'_>,
    ) -> std::fmt::Result {
        let first_reason: &dyn InvalidationReason = &*reasons[0];
        write!(
            f,
            "{} files changed ({}, ...)",
            reasons.len(),
            (first_reason as &dyn Any)
                .downcast_ref::<WatchChange>()
                .unwrap()
                .path
        )
    }
}

/// Invalidation was caused by a directory starting to watch from which was read
/// before.
#[derive(PartialEq, Eq, Hash, Clone)]
pub(crate) struct WatchStart {
    pub name: RcStr,
    pub path: RcStr,
}

impl InvalidationReason for WatchStart {
    fn kind(&self) -> Option<StaticOrArc<dyn InvalidationReasonKind>> {
        Some(StaticOrArc::Static(&WATCH_START_KIND))
    }
}

impl Display for WatchStart {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "started watching {} in {}", self.path, self.name)
    }
}

/// Invalidation kind for [WatchStart]
#[derive(PartialEq, Eq, Hash)]
struct WatchStartKind;

static WATCH_START_KIND: WatchStartKind = WatchStartKind;

impl InvalidationReasonKind for WatchStartKind {
    fn fmt(
        &self,
        reasons: &FxIndexSet<StaticOrArc<dyn InvalidationReason>>,
        f: &mut Formatter<'_>,
    ) -> std::fmt::Result {
        let first_reason: &dyn InvalidationReason = &*reasons[0];
        let example = (first_reason as &dyn Any)
            .downcast_ref::<WatchStart>()
            .unwrap();
        write!(
            f,
            "{} items started watching (e.g. {} in {})",
            reasons.len(),
            example.path,
            example.name
        )
    }
}

/// Invalidation was caused by initialization of a project or filesystem.
#[derive(PartialEq, Eq, Hash, Clone)]
pub struct Initialize {
    pub path: RcStr,
}

impl InvalidationReason for Initialize {
    fn kind(&self) -> Option<StaticOrArc<dyn InvalidationReasonKind>> {
        Some(StaticOrArc::Static(&INITIALIZE_KIND))
    }
}

impl Display for Initialize {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "initialized project or filesystem with path {}",
            self.path
        )
    }
}

/// [Invalidation kind][InvalidationReasonKind] for [`Initialize`].
#[derive(PartialEq, Eq, Hash)]
struct InitializeKind;

static INITIALIZE_KIND: InitializeKind = InitializeKind;

impl InvalidationReasonKind for InitializeKind {
    fn fmt(
        &self,
        reasons: &FxIndexSet<StaticOrArc<dyn InvalidationReason>>,
        f: &mut Formatter<'_>,
    ) -> std::fmt::Result {
        let first_reason: &dyn InvalidationReason = &*reasons[0];
        let example = (first_reason as &dyn Any)
            .downcast_ref::<Initialize>()
            .unwrap();
        write!(
            f,
            "{} items invalidated as part of project or filesystem initialization ({}, ...)",
            reasons.len(),
            example.path,
        )
    }
}

/// Invalidation was caused by a write operation on the filesystem
#[derive(PartialEq, Eq, Hash)]
pub(crate) struct Write {
    pub path: String,
}

impl InvalidationReason for Write {
    fn kind(&self) -> Option<StaticOrArc<dyn InvalidationReasonKind>> {
        Some(StaticOrArc::Static(&WRITE_KIND))
    }
}

impl Display for Write {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} written", self.path)
    }
}

/// Invalidation kind for [Write]
#[derive(PartialEq, Eq, Hash)]
struct WriteKind;

static WRITE_KIND: WriteKind = WriteKind;

impl InvalidationReasonKind for WriteKind {
    fn fmt(
        &self,
        reasons: &FxIndexSet<StaticOrArc<dyn InvalidationReason>>,
        f: &mut Formatter<'_>,
    ) -> std::fmt::Result {
        let first_reason: &dyn InvalidationReason = &*reasons[0];
        write!(
            f,
            "{} files written ({}, ...)",
            reasons.len(),
            (first_reason as &dyn Any)
                .downcast_ref::<Write>()
                .unwrap()
                .path
        )
    }
}
