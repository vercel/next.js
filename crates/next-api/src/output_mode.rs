use anyhow::Result;
use bincode::{Decode, Encode};
use rustc_hash::FxHashSet;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    NonLocalValue, OperationVc, ResolvedVc, State, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
};

use crate::{app::mark_as_ssr_operation, operation::OptionEndpoint};

#[turbo_tasks::value]
pub struct OutputModeState {
    /// App pages that must emit full HTML output, including Client Component
    /// SSR chunks. Insert-only: once a page has been rendered as a document it
    /// never downgrades to the SSR-free output.
    ssr_pages: State<FxHashSet<RcStr>>,
}

impl OutputModeState {
    /// This must not be a `#[turbo_tasks::function]` because it should be a
    /// singleton for each project.
    pub fn new() -> ResolvedVc<Self> {
        OutputModeState {
            ssr_pages: State::new(FxHashSet::default()),
        }
        .resolved_cell()
    }

    fn mark_ssr(&self, page: RcStr) {
        self.ssr_pages
            .update_conditionally(|pages| pages.insert(page));
    }
}

#[turbo_tasks::value_impl]
impl OutputModeState {
    #[turbo_tasks::function]
    pub fn is_ssr_page(&self, page: RcStr) -> Vc<bool> {
        Vc::cell(self.ssr_pages.get().contains(&page))
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionOutputModeState(Option<ResolvedVc<OutputModeState>>);

#[derive(
    TraceRawVcs, PartialEq, Eq, ValueDebugFormat, Clone, Debug, NonLocalValue, Encode, Decode,
)]
pub struct SsrMarkTarget {
    pub state: ResolvedVc<OutputModeState>,
    pub page: RcStr,
}

#[turbo_tasks::value(transparent)]
pub struct OptionSsrMarkTarget(Option<SsrMarkTarget>);

/// Marks the app page served by `endpoint_op` as requiring full HTML output
/// from now on. No-op for endpoints other than app page HTML endpoints.
pub async fn mark_as_ssr(endpoint_op: OperationVc<OptionEndpoint>) -> Result<()> {
    let target = mark_as_ssr_operation(endpoint_op)
        .read_strongly_consistent()
        .await?;
    if let Some(target) = &*target {
        target.state.await?.mark_ssr(target.page.clone());
    }
    Ok(())
}
