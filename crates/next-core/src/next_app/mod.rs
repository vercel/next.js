pub mod app_client_references_chunks;
pub mod app_client_shared_chunks;
pub mod app_entry;
pub mod app_page_entry;
pub mod app_route_entry;
pub mod metadata;

use std::{
    cmp::Ordering,
    fmt::{Display, Formatter, Write},
    ops::Deref,
};

use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use turbo_rcstr::RcStr;
use turbo_tasks::trace::TraceRawVcs;

pub use crate::next_app::{
    app_client_references_chunks::{
        ClientReferencesChunks, get_app_client_references_chunks,
        get_client_references_chunks_for_hmr,
    },
    app_client_shared_chunks::get_app_client_shared_chunk_group,
    app_entry::AppEntry,
    app_page_entry::get_app_page_entry,
    app_route_entry::get_app_route_entry,
};

/// See [AppPage].
#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, PartialOrd, Ord, TraceRawVcs, Encode, Decode)]
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

#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, PartialOrd, Ord, TraceRawVcs, Encode, Decode)]
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
#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, Default, TraceRawVcs, Encode, Decode)]
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

        if let Some(last) = app_page.0.last_mut()
            && let PageSegment::Static(last_name) = &*last
        {
            // Next.js internals sometimes omit extensions when creating synthetic page entries
            if last_name == "page" || last_name.starts_with("page.") {
                *last = PageSegment::PageType(PageType::Page);
            } else if last_name == "route" || last_name.starts_with("route.") {
                *last = PageSegment::PageType(PageType::Route);
            }
            // can also be metadata (and be neither Page nor Route)
        }

        Ok(app_page)
    }

    pub fn is_root(&self) -> bool {
        self.0.is_empty()
    }

    pub fn is_complete(&self) -> bool {
        matches!(self.0.last(), Some(PageSegment::PageType(..)))
    }

    /// The `PageType` is the last segment for completed pages. We need to find
    /// the last segment that is not a `PageType`, `Group`, or `Parallel`
    /// segment, because these do not inform the routing structure.
    pub fn get_last_routing_segment(&self) -> Option<&PageSegment> {
        self.0.iter().rev().find(|segment| {
            !matches!(
                segment,
                PageSegment::PageType(_) | PageSegment::Group(_) | PageSegment::Parallel(_)
            )
        })
    }

    pub fn is_catchall(&self) -> bool {
        matches!(
            self.get_last_routing_segment(),
            Some(PageSegment::CatchAll(_) | PageSegment::OptionalCatchAll(_))
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

    /// Returns true if there is only one segment and it is a group.
    pub fn is_first_layer_group_route(&self) -> bool {
        self.0.len() == 1 && matches!(self.0.last(), Some(PageSegment::Group(_)))
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
#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, PartialOrd, Ord, TraceRawVcs, Encode, Decode)]
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
#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, Default, TraceRawVcs, Encode, Decode)]
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

    /// Returns true if any segment in the path is an interception route.
    /// Unlike `AppPage::is_intercepting()`, this also identifies descendants
    /// below the interception marker.
    pub fn contains_interception(&self) -> bool {
        self.iter().any(|segment| {
            matches!(
                segment,
                PathSegment::Static(s) if s.starts_with("(.)") || s.starts_with("(..)") || s.starts_with("(...)")
            )
        })
    }

    /// Returns the ordinary route that an interception route substitutes for.
    /// This is the route that must handle a direct request or hard refresh.
    pub fn intercepted_path(&self) -> Option<AppPath> {
        let (interception_index, segment) =
            self.iter().enumerate().find_map(|(index, segment)| {
                let PathSegment::Static(segment) = segment else {
                    return None;
                };

                let (marker, target) =
                    ["(..)(..)", "(...)", "(..)", "(.)"]
                        .into_iter()
                        .find_map(|marker| {
                            segment.strip_prefix(marker).map(|target| (marker, target))
                        })?;
                Some((index, (marker, target)))
            })?;

        let (marker, target) = segment;
        if target.is_empty() {
            return None;
        }

        let mut canonical_segments = match marker {
            "(...)" => Vec::new(),
            _ => self.0[..interception_index].to_vec(),
        };
        let levels_to_pop = match marker {
            "(..)(..)" => 2,
            "(..)" => 1,
            _ => 0,
        };
        for _ in 0..levels_to_pop {
            canonical_segments.pop()?;
        }
        let target = if let Some(target) = target
            .strip_prefix("[[...")
            .and_then(|target| target.strip_suffix("]]"))
        {
            PathSegment::OptionalCatchAll(target.into())
        } else if let Some(target) = target
            .strip_prefix("[...")
            .and_then(|target| target.strip_suffix(']'))
        {
            PathSegment::CatchAll(target.into())
        } else if let Some(target) = target
            .strip_prefix('[')
            .and_then(|target| target.strip_suffix(']'))
        {
            PathSegment::Dynamic(target.into())
        } else {
            PathSegment::Static(target.into())
        };
        canonical_segments.push(target);
        canonical_segments.extend_from_slice(&self.0[interception_index + 1..]);

        Some(AppPath(canonical_segments))
    }

    /// Returns whether the supplied ordinary route patterns cover every URL matched by this
    /// route pattern.
    pub fn is_route_pattern_covered_by<'a>(
        &self,
        ordinary_routes: impl IntoIterator<Item = &'a AppPath>,
    ) -> bool {
        let route = RoutePattern::new(self);
        let ordinary_routes = ordinary_routes
            .into_iter()
            .map(RoutePattern::new)
            .collect::<Vec<_>>();

        if !route.unbounded {
            return ordinary_routes
                .iter()
                .any(|ordinary| pattern_covers_at_length(ordinary, &route, route.min_length));
        }

        let Some(unbounded_coverage_start) = ordinary_routes
            .iter()
            .filter(|ordinary| ordinary.unbounded && prefix_covers(ordinary, &route))
            .map(|ordinary| ordinary.min_length.max(route.min_length))
            .min()
        else {
            return false;
        };

        // An optional or required catchall can have its shorter paths covered by fixed routes
        // before another catchall takes over the remaining suffix.
        (route.min_length..unbounded_coverage_start).all(|length| {
            ordinary_routes
                .iter()
                .any(|ordinary| pattern_covers_at_length(ordinary, &route, length))
        })
    }
}

struct RoutePattern<'a> {
    prefix: &'a [PathSegment],
    min_length: usize,
    unbounded: bool,
}

impl<'a> RoutePattern<'a> {
    fn new(path: &'a AppPath) -> Self {
        match path.last() {
            Some(PathSegment::CatchAll(_)) => Self {
                prefix: &path[..path.len() - 1],
                min_length: path.len(),
                unbounded: true,
            },
            Some(PathSegment::OptionalCatchAll(_)) => Self {
                prefix: &path[..path.len() - 1],
                min_length: path.len() - 1,
                unbounded: true,
            },
            _ => Self {
                prefix: path,
                min_length: path.len(),
                unbounded: false,
            },
        }
    }
}

fn accepts_length(pattern: &RoutePattern<'_>, length: usize) -> bool {
    if pattern.unbounded {
        length >= pattern.min_length
    } else {
        length == pattern.min_length
    }
}

fn prefix_covers(canonical: &RoutePattern<'_>, intercepted: &RoutePattern<'_>) -> bool {
    canonical
        .prefix
        .iter()
        .enumerate()
        .all(|(index, canonical_segment)| match canonical_segment {
            PathSegment::Dynamic(_) => true,
            PathSegment::Static(canonical_segment) => matches!(
                intercepted.prefix.get(index),
                Some(PathSegment::Static(intercepted_segment))
                    if canonical_segment == intercepted_segment
            ),
            PathSegment::CatchAll(_) | PathSegment::OptionalCatchAll(_) => {
                unreachable!("catchall segments are excluded from the route prefix")
            }
        })
}

fn pattern_covers_at_length(
    canonical: &RoutePattern<'_>,
    intercepted: &RoutePattern<'_>,
    length: usize,
) -> bool {
    accepts_length(canonical, length)
        && accepts_length(intercepted, length)
        && prefix_covers(canonical, intercepted)
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

#[cfg(test)]
mod test {
    use crate::next_app::{AppPage, AppPath, PageSegment, PageType};

    #[test]
    fn resolves_intercepted_app_paths() {
        for (interception, canonical) in [
            ("/(.)photo/[id]", "/photo/[id]"),
            ("/feed/(.)photo/[id]", "/feed/photo/[id]"),
            ("/feed/(..)photo/[id]", "/photo/[id]"),
            ("/feed/nested/(..)(..)photo/[id]", "/photo/[id]"),
            ("/feed/(...)photo/[id]", "/photo/[id]"),
            ("/(.)[username]/[id]", "/[username]/[id]"),
            ("/(.)[...slug]", "/[...slug]"),
            ("/(.)[[...slug]]", "/[[...slug]]"),
        ] {
            let interception =
                AppPath::from(AppPage::parse(interception.trim_start_matches('/')).unwrap());
            let canonical =
                AppPath::from(AppPage::parse(canonical.trim_start_matches('/')).unwrap());

            assert_eq!(interception.intercepted_path(), Some(canonical));
        }
    }

    #[test]
    fn checks_route_pattern_coverage() {
        for (route, ordinary_routes, expected) in [
            ("/photo/[id]", &["/photo/[slug]"][..], true),
            ("/showcase/[...parts]", &["/[...slug]"][..], true),
            (
                "/items/[...parts]",
                &["/items/[id]", "/items/[id]/[...rest]"][..],
                true,
            ),
            (
                "/items/[[...parts]]",
                &["/items", "/items/[...rest]"][..],
                true,
            ),
            ("/photo/[id]", &[][..], false),
            ("/items/[...parts]", &["/items/[id]"][..], false),
            ("/items/[[...parts]]", &["/items/[...rest]"][..], false),
            ("/items/[id]", &["/items/one", "/items/two"][..], false),
        ] {
            let route = AppPath::from(AppPage::parse(route.trim_start_matches('/')).unwrap());
            let ordinary_routes = ordinary_routes
                .iter()
                .map(|route| AppPath::from(AppPage::parse(route.trim_start_matches('/')).unwrap()))
                .collect::<Vec<_>>();

            assert_eq!(
                route.is_route_pattern_covered_by(ordinary_routes.iter()),
                expected,
                "coverage for {route} from {ordinary_routes:?}"
            );
        }
    }

    #[test]
    fn test_normalize_metadata_route() {
        assert_eq!(
            AppPage::parse("(group)/foo/@par/bar/page.tsx").unwrap(),
            AppPage(vec![
                PageSegment::Group("group".into()),
                PageSegment::Static("foo".into()),
                PageSegment::Parallel("par".into()),
                PageSegment::Static("bar".into()),
                PageSegment::PageType(PageType::Page),
            ])
        );
        assert_eq!(
            AppPage::parse("(group)/foo/@par/bar/page").unwrap(),
            AppPage(vec![
                PageSegment::Group("group".into()),
                PageSegment::Static("foo".into()),
                PageSegment::Parallel("par".into()),
                PageSegment::Static("bar".into()),
                PageSegment::PageType(PageType::Page),
            ])
        );

        assert_eq!(
            AppPage::parse("(group)/foo/@par/bar/route.tsx").unwrap(),
            AppPage(vec![
                PageSegment::Group("group".into()),
                PageSegment::Static("foo".into()),
                PageSegment::Parallel("par".into()),
                PageSegment::Static("bar".into()),
                PageSegment::PageType(PageType::Route),
            ])
        );
        assert_eq!(
            AppPage::parse("(group)/foo/@par/bar/route").unwrap(),
            AppPage(vec![
                PageSegment::Group("group".into()),
                PageSegment::Static("foo".into()),
                PageSegment::Parallel("par".into()),
                PageSegment::Static("bar".into()),
                PageSegment::PageType(PageType::Route),
            ])
        );

        assert_eq!(
            AppPage::parse("foo/sitemap").unwrap(),
            AppPage(vec![
                PageSegment::Static("foo".into()),
                PageSegment::Static("sitemap".into()),
            ])
        );

        assert_eq!(
            AppPage::parse("foo/robots.txt").unwrap(),
            AppPage(vec![
                PageSegment::Static("foo".into()),
                PageSegment::Static("robots.txt".into()),
            ])
        );
    }
}
