use turbo_rcstr::RcStr;
use turbo_tasks::ResolvedVc;
use turbopack_core::module::Module;

use crate::segment_config::NextSegmentConfig;

/// The entry module asset for a Next.js app route or page.
#[turbo_tasks::value(shared)]
pub struct AppEntry {
    /// The pathname of the route or page.
    pub pathname: RcStr,
    /// The original Next.js name of the route or page. This is used instead of
    /// the pathname to refer to this entry.
    pub original_name: RcStr,
    /// The RSC module asset for the route or page.
    pub rsc_entry: ResolvedVc<Box<dyn Module>>,
    /// The source code config for this entry.
    pub config: ResolvedVc<NextSegmentConfig>,
}
