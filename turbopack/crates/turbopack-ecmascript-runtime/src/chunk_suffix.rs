use turbo_rcstr::RcStr;

#[turbo_tasks::value(shared)]
pub enum ChunkSuffix {
    /// No suffix.
    None,
    /// A constant suffix to append to chunk URLs.
    Constant(RcStr),
    /// Use the query string of the `src` attribute of the current script tag as a suffix for chunk
    /// loading.
    FromScriptSrc,
}
