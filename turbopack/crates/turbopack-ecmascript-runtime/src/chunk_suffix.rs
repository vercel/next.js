use turbo_rcstr::RcStr;

#[turbo_tasks::value(shared)]
pub enum ChunkSuffix {
    /// No suffix.
    None,
    /// A constant suffix to append to chunk URLs.
    Constant(RcStr),
    /// Read the chunk suffix from the `src` attribute of the current script tag.
    FromScriptSrc,
}
