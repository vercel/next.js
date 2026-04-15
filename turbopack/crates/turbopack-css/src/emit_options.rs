use turbopack_core::chunk::EmitOption;

/// CSS-specific emit options for controlling minification and comment output.
///
/// When no `CssEmitOptions` is present in the chunking context's emit options,
/// callers should use `CssEmitOptions::default()` (no minification, comments enabled).
#[turbo_tasks::value(shared)]
pub struct CssEmitOptions {
    /// Whether to minify CSS output.
    pub minify: bool,
    /// Whether to emit `/* <asset-ident> */` comments in CSS chunks.
    pub chunk_item_comments: bool,
}

impl Default for CssEmitOptions {
    fn default() -> Self {
        Self {
            minify: false,
            chunk_item_comments: true,
        }
    }
}

#[turbo_tasks::value_impl]
impl EmitOption for CssEmitOptions {}

/// Builder for `CssEmitOptions`.
pub struct CssEmitOptionsBuilder {
    options: CssEmitOptions,
}

impl CssEmitOptions {
    pub fn builder() -> CssEmitOptionsBuilder {
        CssEmitOptionsBuilder {
            options: CssEmitOptions::default(),
        }
    }
}

impl CssEmitOptionsBuilder {
    /// Preset: enable CSS minification.
    /// Disables chunk item comments.
    pub fn preset_minify(mut self) -> Self {
        self.options.minify = true;
        self.options.chunk_item_comments = false;
        self
    }

    pub fn minify(mut self, minify: bool) -> Self {
        self.options.minify = minify;
        self
    }

    pub fn chunk_item_comments(mut self, comments: bool) -> Self {
        self.options.chunk_item_comments = comments;
        self
    }

    pub fn build(self) -> CssEmitOptions {
        self.options
    }
}
