use turbo_tasks::Vc;

/// Records which optional runtime features are actually used by a module graph, so the
/// generated runtime can omit the code for features the application does not use (e.g.
/// WebAssembly loading).
///
/// This is computed per module graph. In production the graph spans the whole app, so the
/// result is effectively the union of features used across all entries.
#[turbo_tasks::value(shared)]
#[derive(Debug, Default, Clone, Copy)]
pub struct RuntimeFeatures {
    /// Whether any module in the graph is a WebAssembly module.
    pub has_wasm: bool,
}

#[turbo_tasks::value_impl]
impl RuntimeFeatures {
    /// All features enabled. Used in development, where bundle size is not a concern and the
    /// full runtime should always be available regardless of what the app uses.
    #[turbo_tasks::function]
    pub fn all() -> Vc<Self> {
        RuntimeFeatures { has_wasm: true }.cell()
    }
}
