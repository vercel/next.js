use anyhow::Result;
use indexmap::IndexMap;
// This specific macro identifier is detected by turbo-tasks-build.
use turbo_tasks_macros::generic_type as __turbo_tasks_internal_generic_type;

use crate::{
    self as turbo_tasks,
    debug::{ValueDebug, ValueDebugFormat, ValueDebugString},
    ValueDefault, Vc,
};

__turbo_tasks_internal_generic_type!(<K, V>, IndexMap<Vc<K>, Vc<V>>);

#[turbo_tasks::function]
async fn index_map_len(index_map: Vc<IndexMap<Vc<()>, Vc<()>>>) -> Result<Vc<usize>> {
    let index_map = index_map.await?;
    Ok(Vc::cell(index_map.len()))
}

#[turbo_tasks::function]
async fn index_map_is_empty(index_map: Vc<IndexMap<Vc<()>, Vc<()>>>) -> Result<Vc<bool>> {
    let index_map = index_map.await?;
    Ok(Vc::cell(index_map.is_empty()))
}

impl<K, V> Vc<IndexMap<Vc<K>, Vc<V>>>
where
    K: Send,
    V: Send,
{
    /// See [`IndexMap::len`].
    pub fn len(self) -> Vc<usize> {
        index_map_len(Self::to_repr(self))
    }

    /// See [`IndexMap::is_empty`].
    pub fn is_empty(self) -> Vc<bool> {
        index_map_is_empty(Self::to_repr(self))
    }
}

#[turbo_tasks::function]
fn index_map_default() -> Vc<IndexMap<Vc<()>, Vc<()>>> {
    Vc::cell(Default::default())
}

impl<K, V> ValueDefault for IndexMap<Vc<K>, Vc<V>>
where
    K: Send,
    V: Send,
{
    fn value_default() -> Vc<Self> {
        // Safety: `index_map_default` creates an empty map, which is a valid
        // representation of any index set of `Vc`.
        unsafe { Vc::<Self>::from_repr(index_map_default()) }
    }
}

#[turbo_tasks::function]
async fn index_map_dbg_depth(
    index_map: Vc<IndexMap<Vc<()>, Vc<()>>>,
    depth: usize,
) -> Result<Vc<ValueDebugString>> {
    index_map
        .await?
        .value_debug_format(depth)
        .try_to_value_debug_string()
        .await
}

impl<K, V> ValueDebug for IndexMap<Vc<K>, Vc<V>>
where
    K: Send,
    V: Send,
{
    fn dbg(self: Vc<Self>) -> Vc<ValueDebugString> {
        index_map_dbg_depth(Vc::<Self>::to_repr(self), usize::MAX)
    }

    fn dbg_depth(self: Vc<Self>, depth: usize) -> Vc<ValueDebugString> {
        index_map_dbg_depth(Vc::<Self>::to_repr(self), depth)
    }
}
