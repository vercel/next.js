pub mod app_client_references_chunks;
pub mod app_client_shared_chunks;
pub mod app_entry;
pub mod app_page_entry;
pub mod app_route_entry;
pub mod include_modules_module;
pub mod metadata;

use std::{
    cmp::Ordering,
    fmt::{Display, Formatter, Write},
    ops::Deref,
};

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, TaskInput};

pub use crate::next_app::{
    app_client_references_chunks::{get_app_client_references_chunks, ClientReferencesChunks},
    app_client_shared_chunks::get_app_client_shared_chunk_group,
    app_entry::AppEntry,
    app_page_entry::get_app_page_entry,
    app_route_entry::get_app_route_entry,
};

/// See [AppPage].
#[derive(
    Clone,
    Debug,
    Hash,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    TaskInput,
    TraceRawVcs,
    NonLocalValue,
)]
pub enum PageSegment {
    /// e.g. `/dashboard`
    Static(RcStr),
    /// e.g. `/[id]`
    Dynamic(RcStr),
    /// e.g. `/[...slug]`
    CatchAll(RcStr),
    /// e.g. `/[[...slug]]`
    OptionalCatchAll(RcStr),
    /// e.g. `/(shop)`
    Group(RcStr),
    /// e.g. `/@auth`
    Parallel(RcStr),
    /// The final page type appended. (e.g. `/dashboard/page`,
    /// `/api/hello/route`)
    PageType(PageType),
}

impl PageSegment {
    pub fn parse(segment: &str) -> Result<Self> {
        if segment.is_empty() {
            bail!("empty segments are not allowed");
        }

        if segment.contains('/') {
            bail!("slashes are not allowed in segments");
        }

        if let Some(s) = segment.strip_prefix('(').and_then(|s| s.strip_suffix(')')) {
            return Ok(PageSegment::Group(s.into()));
        }

        if let Some(s) = segment.strip_prefix('@') {
            return Ok(PageSegment::Parallel(s.into()));
        }

        if let Some(s) = segment
            .strip_prefix("[[...")
            .and_then(|s| s.strip_suffix("]]"))
        {
            return Ok(PageSegment::OptionalCatchAll(s.into()));
        }

        if let Some(s) = segment
            .strip_prefix("[...")
            .and_then(|s| s.strip_suffix(']'))
        {
            return Ok(PageSegment::CatchAll(s.into()));
        }

        if let Some(s) = segment.strip_prefix('[').and_then(|s| s.strip_suffix(']')) {
            return Ok(PageSegment::Dynamic(s.into()));
        }

        Ok(PageSegment::Static(segment.into()))
    }
}

impl Display for PageSegment {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            PageSegment::Static(s) => f.write_str(s),
            PageSegment::Dynamic(s) => {
                f.write_char('[')?;
                f.write_str(s)?;
                f.write_char(']')
            }
            PageSegment::CatchAll(s) => {
                f.write_str("[...")?;
                f.write_str(s)?;
                f.write_char(']')
            }
            PageSegment::OptionalCatchAll(s) => {
                f.write_str("[[...")?;
                f.write_str(s)?;
                f.write_str("]]")
            }
            PageSegment::Group(s) => {
                f.write_char('(')?;
                f.write_str(s)?;
                f.write_char(')')
            }
            PageSegment::Parallel(s) => {
                f.write_char('@')?;
                f.write_str(s)
            }
            PageSegment::PageType(s) => Display::fmt(s, f),
        }
    }
}

#[derive(
    Clone,
    Debug,
    Hash,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    TaskInput,
    TraceRawVcs,
    NonLocalValue,
)]
pub enum PageType {
    Page,
    Route,
}

impl Display for PageType {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            PageType::Page => "page",
            PageType::Route => "route",
        })
    }
}

/// Describes the pathname including all internal modifiers such as
/// intercepting routes, parallel routes and route/page suffixes that are not
/// part of the pathname.
#[derive(
    Clone,
    Debug,
    Hash,
    PartialEq,
    Eq,
    Default,
    Serialize,
    Deserialize,
    TaskInput,
    TraceRawVcs,
    NonLocalValue,
)]
pub struct AppPage(pub Vec<PageSegment>);

impl AppPage {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, segment: PageSegment) -> Result<()> {
        let has_catchall = self.0.iter().any(|segment| {
            matches!(
                segment,
                PageSegment::CatchAll(..) | PageSegment::OptionalCatchAll(..)
            )
        });

        if has_catchall
            && matches!(
                segment,
                PageSegment::Static(..)
                    | PageSegment::Dynamic(..)
                    | PageSegment::CatchAll(..)
                    | PageSegment::OptionalCatchAll(..)
            )
        {
            bail!(
                "Invalid segment {:?}, catch all segment must be the last segment modifying the \
                 path (segments: {:?})",
                segment,
                self.0
            )
        }

        if self.is_complete() {
            bail!(
                "Invalid segment {:?}, this page path already has the final PageType appended \
                 (segments: {:?})",
                segment,
                self.0
            )
        }

        self.0.push(segment);
        Ok(())
    }

    pub fn push_str(&mut self, segment: &str) -> Result<()> {
        if segment.is_empty() {
            return Ok(());
        }

        self.push(PageSegment::parse(segment)?)
    }

    pub fn clone_push(&self, segment: PageSegment) -> Result<Self> {
        let mut cloned = self.clone();
        cloned.push(segment)?;
        Ok(cloned)
    }

    pub fn clone_push_str(&self, segment: &str) -> Result<Self> {
        let mut cloned = self.clone();
        cloned.push_str(segment)?;
        Ok(cloned)
    }

    pub fn parse(page: &str) -> Result<Self> {
        let mut app_page = Self::new();

        for segment in page.split('/') {
            app_page.push_str(segment)?;
        }

        Ok(app_page)
    }

    pub fn is_root(&self) -> bool {
        self.0.is_empty()
    }

    pub fn is_complete(&self) -> bool {
        matches!(self.0.last(), Some(PageSegment::PageType(..)))
    }

    pub fn is_catchall(&self) -> bool {
        let segment = if self.is_complete() {
            // The `PageType` is the last segment for completed pages.
            self.0.iter().nth_back(1)
        } else {
            self.0.last()
        };

        matches!(
            segment,
            Some(PageSegment::CatchAll(..) | PageSegment::OptionalCatchAll(..))
        )
    }

    pub fn is_intercepting(&self) -> bool {
        let segment = if self.is_complete() {
            // The `PageType` is the last segment for completed pages.
            self.0.iter().nth_back(1)
        } else {
            self.0.last()
        };

        matches!(
            segment,
            Some(PageSegment::Static(segment))
                if segment.starts_with("(.)")
                    || segment.starts_with("(..)")
                    || segment.starts_with("(...)")
        )
    }

    pub fn complete(&self, page_type: PageType) -> Result<Self> {
        self.clone_push(PageSegment::PageType(page_type))
    }
}

impl Display for AppPage {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        if self.0.is_empty() {
            return f.write_char('/');
        }

        for segment in &self.0 {
            f.write_char('/')?;
            Display::fmt(segment, f)?;
        }

        Ok(())
    }
}

impl Deref for AppPage {
    type Target = [PageSegment];

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl Ord for AppPage {
    fn cmp(&self, other: &Self) -> Ordering {
        // next.js does some weird stuff when looking up routes, so we have to emit the
        // correct path (shortest segments, but alphabetically the last).
        // https://github.com/vercel/next.js/blob/194311d8c96144d68e65cd9abb26924d25978da7/packages/next/src/server/base-server.ts#L3003
        self.len().cmp(&other.len()).then(other.0.cmp(&self.0))
    }
}

impl PartialOrd for AppPage {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Path segments for a router path (not including parallel routes and groups).
///
/// Also see [AppPath].
#[derive(
    Clone,
    Debug,
    Hash,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    TaskInput,
    TraceRawVcs,
    NonLocalValue,
)]
pub enum PathSegment {
    /// e.g. `/dashboard`
    Static(RcStr),
    /// e.g. `/[id]`
    Dynamic(RcStr),
    /// e.g. `/[...slug]`
    CatchAll(RcStr),
    /// e.g. `/[[...slug]]`
    OptionalCatchAll(RcStr),
}

impl Display for PathSegment {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            PathSegment::Static(s) => f.write_str(s),
            PathSegment::Dynamic(s) => {
                f.write_char('[')?;
                f.write_str(s)?;
                f.write_char(']')
            }
            PathSegment::CatchAll(s) => {
                f.write_str("[...")?;
                f.write_str(s)?;
                f.write_char(']')
            }
            PathSegment::OptionalCatchAll(s) => {
                f.write_str("[[...")?;
                f.write_str(s)?;
                f.write_str("]]")
            }
        }
    }
}

/// The pathname (including dynamic placeholders) for the next.js router to
/// resolve.
///
/// Does not include internal modifiers as it's the equivalent of the http
/// request path.
#[derive(
    Clone,
    Debug,
    Hash,
    PartialEq,
    Eq,
    Default,
    Serialize,
    Deserialize,
    TaskInput,
    TraceRawVcs,
    NonLocalValue,
)]
pub struct AppPath(pub Vec<PathSegment>);

impl AppPath {
    pub fn is_dynamic(&self) -> bool {
        self.iter().any(|segment| {
            matches!(
                (segment,),
                (PathSegment::Dynamic(_)
                    | PathSegment::CatchAll(_)
                    | PathSegment::OptionalCatchAll(_),)
            )
        })
    }

    pub fn is_root(&self) -> bool {
        self.0.is_empty()
    }

    pub fn is_catchall(&self) -> bool {
        // can only be the last segment.
        matches!(
            self.last(),
            Some(PathSegment::CatchAll(_) | PathSegment::OptionalCatchAll(_))
        )
    }

    pub fn contains(&self, other: &AppPath) -> bool {
        // TODO: handle OptionalCatchAll properly.
        for (i, segment) in other.0.iter().enumerate() {
            let Some(self_segment) = self.0.get(i) else {
                // other is longer than self
                return false;
            };

            if self_segment == segment {
                continue;
            }

            if matches!(
                segment,
                PathSegment::CatchAll(_) | PathSegment::OptionalCatchAll(_)
            ) {
                return true;
            }

            return false;
        }

        true
    }
}

impl Deref for AppPath {
    type Target = [PathSegment];

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl Display for AppPath {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        if self.0.is_empty() {
            return f.write_char('/');
        }

        for segment in &self.0 {
            f.write_char('/')?;
            Display::fmt(segment, f)?;
        }

        Ok(())
    }
}

impl Ord for AppPath {
    fn cmp(&self, other: &Self) -> Ordering {
        // next.js does some weird stuff when looking up routes, so we have to emit the
        // correct path (shortest segments, but alphabetically the last).
        // https://github.com/vercel/next.js/blob/194311d8c96144d68e65cd9abb26924d25978da7/packages/next/src/server/base-server.ts#L3003
        self.len().cmp(&other.len()).then(other.0.cmp(&self.0))
    }
}

impl PartialOrd for AppPath {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl From<AppPage> for AppPath {
    fn from(value: AppPage) -> Self {
        AppPath(
            value
                .0
                .into_iter()
                .filter_map(|segment| match segment {
                    PageSegment::Static(s) => Some(PathSegment::Static(s)),
                    PageSegment::Dynamic(s) => Some(PathSegment::Dynamic(s)),
                    PageSegment::CatchAll(s) => Some(PathSegment::CatchAll(s)),
                    PageSegment::OptionalCatchAll(s) => Some(PathSegment::OptionalCatchAll(s)),
                    _ => None,
                })
                .collect(),
        )
    }
}
