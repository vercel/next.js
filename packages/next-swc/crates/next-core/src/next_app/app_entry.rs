use turbo_tasks::Vc;
use turbopack_binding::turbopack::ecmascript::chunk::EcmascriptChunkPlaceable;

/// The entry module asset for a Next.js app route or page.
#[turbo_tasks::value(shared)]
pub struct AppEntry {
    /// The pathname of the route or page.
    pub pathname: String,
    /// The original Next.js name of the route or page. This is used instead of
    /// the pathname to refer to this entry.
    pub original_name: String,
    /// The RSC module asset for the route or page.
    pub rsc_entry: Vc<Box<dyn EcmascriptChunkPlaceable>>,
}
