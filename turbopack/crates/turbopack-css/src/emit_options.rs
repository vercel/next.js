use anyhow::Result;
use turbo_tasks::{ReadRef, Vc};
use turbopack_core::chunk::{ChunkingContext, EmitOption, chunking_context::find_emit_option};

/// CSS-specific emit options for controlling minification and comment output.
///
/// When no `CssEmitOptions` is present in the chunking context's emit options,
/// callers should use `CssEmitOptions::default()` (no minification, comments enabled).
#[turbo_tasks::value(shared)]
#[derive(Clone, Copy)]
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

    /// Look up `CssEmitOptions` from a chunking context's emit options,
    /// falling back to defaults (no minification, comments enabled).
    pub async fn get_or_default(
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<ReadRef<CssEmitOptions>> {
        let opts = find_emit_option::<CssEmitOptions>(chunking_context.emit_options()).await?;
        Ok(match opts {
            Some(vc) => vc.await?,
            None => ReadRef::new_owned(CssEmitOptions::default()),
        })
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
