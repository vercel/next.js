use anyhow::Result;
// This specific macro identifier is detected by turbo-tasks-build.
use turbo_tasks_macros::generic_type as __turbo_tasks_internal_generic_type;

use crate::{
    self as turbo_tasks,
    debug::{ValueDebug, ValueDebugFormat, ValueDebugString},
    ValueDefault, Vc,
};

__turbo_tasks_internal_generic_type!(<T>, Option<Vc<T>>);

#[turbo_tasks::function]
async fn option_is_none(option: Vc<Option<Vc<()>>>) -> Result<Vc<bool>> {
    let option = option.await?;
    Ok(Vc::cell(option.is_none()))
}

#[turbo_tasks::function]
async fn option_is_some(option: Vc<Option<Vc<()>>>) -> Result<Vc<bool>> {
    let option = option.await?;
    Ok(Vc::cell(option.is_some()))
}

impl<T> Vc<Option<Vc<T>>>
where
    T: Send,
{
    /// See [`Option::is_none`].
    pub fn is_none(self) -> Vc<bool> {
        option_is_none(Self::to_repr(self))
    }

    /// See [`Option::is_some`].
    pub fn is_some(self) -> Vc<bool> {
        option_is_some(Self::to_repr(self))
    }
}

#[turbo_tasks::function]
fn option_default() -> Vc<Option<Vc<()>>> {
    Vc::cell(Default::default())
}

impl<T> ValueDefault for Option<Vc<T>>
where
    T: Send,
{
    fn value_default() -> Vc<Self> {
        // Safety: `option_default` creates a None variant, which is a valid
        // representation of any option of `Vc`.
        unsafe { Vc::<Self>::from_repr(option_default()) }
    }
}

#[turbo_tasks::function]
async fn option_dbg_depth(
    option: Vc<Option<Vc<()>>>,
    depth: usize,
) -> Result<Vc<ValueDebugString>> {
    option
        .await?
        .value_debug_format(depth)
        .try_to_value_debug_string()
        .await
}

impl<T> ValueDebug for Option<Vc<T>>
where
    T: Send,
{
    fn dbg(self: Vc<Self>) -> Vc<ValueDebugString> {
        option_dbg_depth(Vc::<Self>::to_repr(self), usize::MAX)
    }

    fn dbg_depth(self: Vc<Self>, depth: usize) -> Vc<ValueDebugString> {
        option_dbg_depth(Vc::<Self>::to_repr(self), depth)
    }
}
