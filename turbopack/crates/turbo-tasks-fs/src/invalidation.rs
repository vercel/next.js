use std::{
    fmt::{Display, Formatter},
    hash::Hash,
};

use turbo_rcstr::RcStr;
use turbo_tasks::{util::StaticOrArc, FxIndexSet, InvalidationReason, InvalidationReasonKind};

/// Invalidation was caused by a file change detected by the file watcher
#[derive(PartialEq, Eq, Hash)]
pub struct WatchChange {
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
        write!(
            f,
            "{} files changed ({}, ...)",
            reasons.len(),
            reasons[0]
                .as_any()
                .downcast_ref::<WatchChange>()
                .unwrap()
                .path
        )
    }
}

/// Invalidation was caused by a directory starting to watch from which was read
/// before.
#[derive(PartialEq, Eq, Hash, Clone)]
pub struct WatchStart {
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
        let example = reasons[0].as_any().downcast_ref::<WatchStart>().unwrap();
        write!(
            f,
            "{} items started watching (e. g. {} in {})",
            reasons.len(),
            example.path,
            example.name
        )
    }
}

/// Invalidation was caused by a write operation on the filesystem
#[derive(PartialEq, Eq, Hash)]
pub struct Write {
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
        write!(
            f,
            "{} files written ({}, ...)",
            reasons.len(),
            reasons[0].as_any().downcast_ref::<Write>().unwrap().path
        )
    }
}

/// Invalidation was caused by a invalidate operation on the filesystem
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct InvalidateFilesystem {
    pub path: RcStr,
}

impl InvalidationReason for InvalidateFilesystem {
    fn kind(&self) -> Option<StaticOrArc<dyn InvalidationReasonKind>> {
        Some(StaticOrArc::Static(&INVALIDATE_FILESYSTEM_KIND))
    }
}

impl Display for InvalidateFilesystem {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} in filesystem invalidated", self.path)
    }
}

/// Invalidation kind for [InvalidateFilesystem]
#[derive(PartialEq, Eq, Hash)]
struct InvalidateFilesystemKind;

static INVALIDATE_FILESYSTEM_KIND: InvalidateFilesystemKind = InvalidateFilesystemKind;

impl InvalidationReasonKind for InvalidateFilesystemKind {
    fn fmt(
        &self,
        reasons: &FxIndexSet<StaticOrArc<dyn InvalidationReason>>,
        f: &mut Formatter<'_>,
    ) -> std::fmt::Result {
        write!(
            f,
            "{} items in filesystem invalidated ({}, ...)",
            reasons.len(),
            reasons[0]
                .as_any()
                .downcast_ref::<InvalidateFilesystem>()
                .unwrap()
                .path
        )
    }
}
