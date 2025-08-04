use std::{fmt::Write, mem::replace};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ReadRef, ResolvedVc, TaskInput, TryJoinIterExt, ValueToString, Vc,
    fxindexmap, trace::TraceRawVcs,
};

use super::{GetContentSourceContent, GetContentSourceContents};

/// The type of the route. This will decide about the remaining segments of the
/// route after the base.
#[derive(
    TaskInput, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TraceRawVcs, NonLocalValue,
)]
pub enum RouteType {
    Exact,
    CatchAll,
    Fallback,
    NotFound,
}

/// Some normal segment of a route.
#[derive(
    TaskInput, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TraceRawVcs, NonLocalValue,
)]
pub enum BaseSegment {
    Static(RcStr),
    Dynamic,
}

impl BaseSegment {
    pub fn from_static_pathname(str: &str) -> impl Iterator<Item = BaseSegment> + '_ {
        str.split('/')
            .filter(|s| !s.is_empty())
            .map(|s| BaseSegment::Static(s.into()))
    }
}

/// This struct allows to cell a list of RouteTrees and merge them into one.
///
/// This can't be a single method `fn merge(Vec<Vc<RouteTree>>)` as this would
/// lead to creating new tasks over and over. A celled list leads to task reuse
/// and faster operation.
#[turbo_tasks::value(transparent)]
pub struct RouteTrees(Vec<ResolvedVc<RouteTree>>);

#[turbo_tasks::value_impl]
impl RouteTrees {
    /// Merges the list of RouteTrees into one RouteTree.
    #[turbo_tasks::function]
    pub async fn merge(self: Vc<Self>) -> Result<Vc<RouteTree>> {
        let trees = &*self.await?;
        if trees.is_empty() {
            return Ok(RouteTree::default().cell());
        }
        if trees.len() == 1 {
            return Ok(**trees.iter().next().unwrap());
        }

        // Find common base
        let mut tree_values = trees.iter().try_join().await?;
        let mut common_base = 0;
        let last_tree = tree_values.pop().unwrap();
        'outer: while common_base < last_tree.base.len() {
            for tree in tree_values.iter() {
                if tree.base.len() <= common_base {
                    break 'outer;
                }
                if tree.base[common_base] != last_tree.base[common_base] {
                    break 'outer;
                }
            }
            common_base += 1;
        }
        tree_values.push(last_tree);

        // Normalize bases to common base
        let trees = trees
            .iter()
            .enumerate()
            .map(|(i, tree)| {
                if tree_values[i].base.len() > common_base {
                    tree.with_base_len(common_base)
                } else {
                    **tree
                }
            })
            .collect::<Vec<_>>();

        // Flat merge trees
        let tree_values = trees.into_iter().try_join().await?;
        let mut iter = tree_values.iter().map(|rr| &**rr);
        let mut merged = iter.next().unwrap().clone();
        merged.flat_merge(iter).await?;

        Ok(merged.cell())
    }
}

/// The prefix tree of routes. Also handling dynamic and catch all segments.
#[turbo_tasks::value]
#[derive(Default, Clone, Debug)]
pub struct RouteTree {
    base: Vec<BaseSegment>,
    sources: Vec<ResolvedVc<Box<dyn GetContentSourceContent>>>,
    static_segments: FxIndexMap<RcStr, ResolvedVc<RouteTree>>,
    dynamic_segments: Vec<ResolvedVc<RouteTree>>,
    catch_all_sources: Vec<ResolvedVc<Box<dyn GetContentSourceContent>>>,
    fallback_sources: Vec<ResolvedVc<Box<dyn GetContentSourceContent>>>,
    not_found_sources: Vec<ResolvedVc<Box<dyn GetContentSourceContent>>>,
}

impl RouteTree {
    /// Creates a route tree for a single route.
    pub fn new_route_ref(
        base_segments: Vec<BaseSegment>,
        route_type: RouteType,
        source: ResolvedVc<Box<dyn GetContentSourceContent>>,
    ) -> Self {
        match route_type {
            RouteType::Exact => Self {
                base: base_segments,
                sources: vec![source],
                ..Default::default()
            },
            RouteType::CatchAll => Self {
                base: base_segments,
                catch_all_sources: vec![source],
                ..Default::default()
            },
            RouteType::Fallback => Self {
                base: base_segments,
                fallback_sources: vec![source],
                ..Default::default()
            },
            RouteType::NotFound => Self {
                base: base_segments,
                not_found_sources: vec![source],
                ..Default::default()
            },
        }
    }

    async fn flat_merge(&mut self, others: impl IntoIterator<Item = &Self> + '_) -> Result<()> {
        let mut static_segments = FxIndexMap::default();
        for other in others {
            debug_assert_eq!(self.base, other.base);
            self.sources.extend(other.sources.iter().copied());
            self.catch_all_sources
                .extend(other.catch_all_sources.iter().copied());
            self.fallback_sources
                .extend(other.fallback_sources.iter().copied());
            self.not_found_sources
                .extend(other.not_found_sources.iter().copied());
            for (key, value) in other.static_segments.iter() {
                if let Some((key, self_value)) = self.static_segments.swap_remove_entry(key) {
                    static_segments.insert(key, vec![self_value, *value]);
                } else if let Some(list) = static_segments.get_mut(key) {
                    list.push(*value);
                } else {
                    static_segments.insert(key.clone(), vec![*value]);
                }
            }
            self.dynamic_segments
                .extend(other.dynamic_segments.iter().copied());
        }
        self.static_segments.extend(
            static_segments
                .into_iter()
                .map(|(key, value)| async {
                    Ok((
                        key,
                        if value.len() == 1 {
                            value.into_iter().next().unwrap()
                        } else {
                            Vc::<RouteTrees>::cell(value).merge().to_resolved().await?
                        },
                    ))
                })
                .try_join()
                .await?,
        );
        Ok(())
    }

    fn prepend_base(&mut self, segments: Vec<BaseSegment>) {
        self.base.splice(..0, segments);
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for RouteTree {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        let RouteTree {
            base,
            sources,
            static_segments,
            dynamic_segments,
            catch_all_sources,
            fallback_sources,
            not_found_sources,
        } = self;
        let mut result = "RouteTree(".to_string();
        for segment in base {
            match segment {
                BaseSegment::Static(str) => write!(result, "/{str}")?,
                BaseSegment::Dynamic => result.push_str("/[dynamic]"),
            }
        }
        if !base.is_empty() {
            result.push_str(", ");
        }
        for (key, tree) in static_segments {
            let tree = tree.to_string().await?;
            write!(result, "{key}: {tree}, ")?;
        }
        if !sources.is_empty() {
            write!(result, "{} x source, ", sources.len())?;
        }
        if !dynamic_segments.is_empty() {
            write!(result, "{} x dynamic, ", dynamic_segments.len())?;
        }
        if !catch_all_sources.is_empty() {
            write!(result, "{} x catch-all, ", catch_all_sources.len())?;
        }
        if !fallback_sources.is_empty() {
            write!(result, "{} x fallback, ", fallback_sources.len())?;
        }
        if !not_found_sources.is_empty() {
            write!(result, "{} x not-found, ", not_found_sources.len())?;
        }
        if result.ends_with(", ") {
            result.truncate(result.len() - 2);
        }
        result.push(')');
        Ok(Vc::cell(result.into()))
    }
}

#[turbo_tasks::value_impl]
impl RouteTree {
    /// Creates an empty route tree.
    #[turbo_tasks::function]
    pub fn empty() -> Vc<RouteTree> {
        RouteTree::default().cell()
    }

    /// Creates a route tree for a single route.
    #[turbo_tasks::function]
    pub fn new_route(
        base_segments: Vec<BaseSegment>,
        route_type: RouteType,
        source: ResolvedVc<Box<dyn GetContentSourceContent>>,
    ) -> Vc<Self> {
        RouteTree::new_route_ref(base_segments, route_type, source).cell()
    }

    /// Gets the [`GetContentSourceContent`]s for the given path.
    // TODO(WEB-1252) It's unnecessary to compute all [`GetContentSourceContent`]s at once, we could
    // return some lazy iterator to make it more efficient.
    #[turbo_tasks::function]
    pub async fn get(self: Vc<Self>, path: RcStr) -> Result<Vc<GetContentSourceContents>> {
        let RouteTree {
            base,
            sources,
            static_segments,
            dynamic_segments,
            catch_all_sources,
            fallback_sources,
            not_found_sources,
        } = &*self.await?;
        let mut results = Vec::new();
        if path.is_empty() {
            if !base.is_empty() {
                return Ok(Vc::cell(vec![]));
            }
            results.extend(sources.iter().copied());
        } else {
            let mut segments = path.split('/');
            for base in base.iter() {
                let Some(segment) = segments.next() else {
                    return Ok(Vc::cell(vec![]));
                };
                match base {
                    BaseSegment::Static(str) => {
                        if str != segment {
                            return Ok(Vc::cell(vec![]));
                        }
                    }
                    BaseSegment::Dynamic => {
                        // always matching
                    }
                }
            }

            if let Some(segment) = segments.next() {
                let remainder = segments.remainder().unwrap_or("");
                if let Some(tree) = static_segments.get(segment) {
                    results.extend(tree.get(remainder.into()).await?.iter().copied());
                }
                for tree in dynamic_segments.iter() {
                    results.extend(tree.get(remainder.into()).await?.iter().copied());
                }
            } else {
                results.extend(sources.iter().copied());
            };
        }
        results.extend(catch_all_sources.iter().copied());
        results.extend(fallback_sources.iter().copied());
        results.extend(not_found_sources.iter().copied());
        Ok(Vc::cell(results))
    }

    /// Prepends a base path to all routes.
    #[turbo_tasks::function]
    pub async fn with_prepended_base(
        self: Vc<Self>,
        segments: Vec<BaseSegment>,
    ) -> Result<Vc<RouteTree>> {
        let mut this = self.owned().await?;
        this.prepend_base(segments);
        Ok(this.cell())
    }

    #[turbo_tasks::function]
    async fn with_base_len(self: Vc<Self>, base_len: usize) -> Result<Vc<RouteTree>> {
        let this = self.await?;
        if this.base.len() > base_len {
            let mut inner = ReadRef::into_owned(this);
            let mut drain = inner.base.drain(base_len..);
            let selector_segment = drain.next().unwrap();
            let inner_base = drain.collect();
            let base = replace(&mut inner.base, inner_base);
            debug_assert!(base.len() == base_len);
            match selector_segment {
                BaseSegment::Static(value) => Ok(RouteTree {
                    base,
                    static_segments: fxindexmap! { value => inner.resolved_cell() },
                    ..Default::default()
                }
                .cell()),
                BaseSegment::Dynamic => Ok(RouteTree {
                    base,
                    dynamic_segments: vec![inner.resolved_cell()],
                    ..Default::default()
                }
                .cell()),
            }
        } else {
            Ok(self)
        }
    }

    /// Applies a transformation on all [`GetContentSourceContent`]s in the
    /// tree.
    #[turbo_tasks::function]
    pub async fn map_routes(
        self: Vc<Self>,
        mapper: Vc<Box<dyn MapGetContentSourceContent>>,
    ) -> Result<Vc<Self>> {
        let mut this = self.owned().await?;
        let RouteTree {
            base: _,
            static_segments,
            dynamic_segments,
            sources,
            catch_all_sources,
            fallback_sources,
            not_found_sources,
        } = &mut this;

        for s in sources.iter_mut() {
            *s = mapper.map_get_content(**s).to_resolved().await?;
        }
        for s in catch_all_sources.iter_mut() {
            *s = mapper.map_get_content(**s).to_resolved().await?;
        }
        for s in fallback_sources.iter_mut() {
            *s = mapper.map_get_content(**s).to_resolved().await?;
        }
        for s in not_found_sources.iter_mut() {
            *s = mapper.map_get_content(**s).to_resolved().await?;
        }
        for r in static_segments.values_mut() {
            *r = r.map_routes(mapper).to_resolved().await?;
        }
        for r in dynamic_segments.iter_mut() {
            *r = r.map_routes(mapper).to_resolved().await?;
        }

        Ok(this.cell())
    }
}

/// Transformation functor
#[turbo_tasks::value_trait]
pub trait MapGetContentSourceContent {
    #[turbo_tasks::function]
    fn map_get_content(
        self: Vc<Self>,
        get_content: Vc<Box<dyn GetContentSourceContent>>,
    ) -> Vc<Box<dyn GetContentSourceContent>>;
}
