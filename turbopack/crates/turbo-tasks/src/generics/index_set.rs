use anyhow::Result;
use indexmap::IndexSet;
// This specific macro identifier is detected by turbo-tasks-build.
use turbo_tasks_macros::generic_type as __turbo_tasks_internal_generic_type;

use crate::{
    self as turbo_tasks,
    debug::{ValueDebug, ValueDebugFormat, ValueDebugString},
    ValueDefault, Vc,
};

__turbo_tasks_internal_generic_type!(<T>, IndexSet<Vc<T>>);

#[turbo_tasks::function]
async fn index_set_len(index_set: Vc<IndexSet<Vc<()>>>) -> Result<Vc<usize>> {
    let index_set = index_set.await?;
    Ok(Vc::cell(index_set.len()))
}

#[turbo_tasks::function]
async fn index_set_is_empty(index_set: Vc<IndexSet<Vc<()>>>) -> Result<Vc<bool>> {
    let index_set = index_set.await?;
    Ok(Vc::cell(index_set.is_empty()))
}

impl<T> Vc<IndexSet<Vc<T>>>
where
    T: Send,
{
    /// See [`IndexSet::len`].
    pub fn len(self) -> Vc<usize> {
        index_set_len(Self::to_repr(self))
    }

    /// See [`IndexSet::is_empty`].
    pub fn is_empty(self) -> Vc<bool> {
        index_set_is_empty(Self::to_repr(self))
    }
}

#[turbo_tasks::function]
fn index_set_default() -> Vc<IndexSet<Vc<()>>> {
    Vc::cell(Default::default())
}

impl<T> ValueDefault for IndexSet<Vc<T>>
where
    T: Send,
{
    fn value_default() -> Vc<Self> {
        // Safety: `index_set_default` creates an empty set, which is a valid
        // representation of any index set of `Vc`.
        unsafe { Vc::<Self>::from_repr(index_set_default()) }
    }
}

#[turbo_tasks::function]
async fn index_set_dbg_depth(
    index_set: Vc<IndexSet<Vc<()>>>,
    depth: usize,
) -> Result<Vc<ValueDebugString>> {
    index_set
        .await?
        .value_debug_format(depth)
        .try_to_value_debug_string()
        .await
}

impl<T> ValueDebug for IndexSet<Vc<T>>
where
    T: Send,
{
    fn dbg(self: Vc<Self>) -> Vc<ValueDebugString> {
        index_set_dbg_depth(Vc::<Self>::to_repr(self), usize::MAX)
    }

    fn dbg_depth(self: Vc<Self>, depth: usize) -> Vc<ValueDebugString> {
        index_set_dbg_depth(Vc::<Self>::to_repr(self), depth)
    }
}
