use std::ops::Deref;

use anyhow::Result;
use either::Either;
use swc_core::{
    atoms::atom,
    ecma::minifier::option::{CompressOptions, MangleOptions, MinifyOptions as SwcMinifyOptions},
};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::chunk::{ChunkingContext, EmitOption, chunking_context::find_emit_option};

/// Ecmascript-specific emit options for controlling minification, indentation,
/// and other code generation settings.
///
/// When no `EcmascriptEmitOptions` is present in the chunking context's emit options,
/// callers should use `EcmascriptEmitOptions::default()` (no minification, indent enabled,
/// merged module comments enabled).
///
/// Minification is configured per kind of output, each slot being independent:
/// - `chunk_item_minify_options` minifies each chunk item (module factory) on its own, before the
///   chunk is assembled. Per-item results are cached per chunk item.
/// - `chunk_minify_options` minifies the assembled chunk in one pass.
/// - `standalone_minify_options` minifies generated assets that aren't made of chunk items (runtime
///   chunks, evaluate chunks, worker bootstrap code).
///
/// Setting both item and chunk options minifies every item first and the chunk again afterwards.
#[turbo_tasks::value(shared, serialization = "skip", eq = "manual")]
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct EcmascriptEmitOptions {
    /// SWC minify options for assembled chunks. `None` means chunks aren't minified as a whole.
    #[turbo_tasks(unsafe_ignore)] // holds no `Vc`
    pub chunk_minify_options: Option<SwcMinifyOptions>,
    /// SWC minify options for each chunk item, applied before the chunk is assembled. `None`
    /// means chunk items aren't minified on their own.
    #[turbo_tasks(unsafe_ignore)] // holds no `Vc`
    pub chunk_item_minify_options: Option<SwcMinifyOptions>,
    /// SWC minify options for standalone assets that aren't made of chunk items. `None` means
    /// they aren't minified.
    #[turbo_tasks(unsafe_ignore)] // holds no `Vc`
    pub standalone_minify_options: Option<SwcMinifyOptions>,
    /// Whether to indent JS output (pretty-print).
    pub indent: bool,
    /// Whether to emit `// MERGED MODULE: ...` comments in scope-hoisted output.
    pub merged_module_comments: bool,
}

impl EcmascriptEmitOptions {
    /// The options used when a chunking context has no `EcmascriptEmitOptions`: no
    /// minification, indent enabled, merged module comments enabled.
    pub const DEFAULT: EcmascriptEmitOptions = EcmascriptEmitOptions {
        chunk_minify_options: None,
        chunk_item_minify_options: None,
        standalone_minify_options: None,
        indent: true,
        merged_module_comments: true,
    };
}

impl Default for EcmascriptEmitOptions {
    fn default() -> Self {
        Self::DEFAULT
    }
}

#[turbo_tasks::value_impl]
impl EmitOption for EcmascriptEmitOptions {}

/// The chunk item minify options of an [`EcmascriptEmitOptions`], in a cell of their own.
///
/// Per-item minification tasks take this cell as input instead of the whole emit options, so
/// changing only the chunk or standalone options doesn't invalidate cached per-item results.
#[turbo_tasks::value(shared, serialization = "skip", eq = "manual")]
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct ChunkItemMinifyOptions {
    #[turbo_tasks(unsafe_ignore)] // holds no `Vc`
    pub options: Option<SwcMinifyOptions>,
}

#[turbo_tasks::value_impl]
impl EcmascriptEmitOptions {
    /// Projects the chunk item minify options into their own cell. See
    /// [`ChunkItemMinifyOptions`].
    #[turbo_tasks::function]
    pub fn chunk_item_minify(&self) -> Vc<ChunkItemMinifyOptions> {
        ChunkItemMinifyOptions {
            options: self.chunk_item_minify_options.clone(),
        }
        .cell()
    }
}

/// Builder for `EcmascriptEmitOptions`.
pub struct EcmascriptEmitOptionsBuilder {
    options: EcmascriptEmitOptions,
}

impl EcmascriptEmitOptions {
    pub fn builder() -> EcmascriptEmitOptionsBuilder {
        EcmascriptEmitOptionsBuilder {
            options: EcmascriptEmitOptions::default(),
        }
    }

    /// Look up the `EcmascriptEmitOptions` set on a chunking context, if any.
    pub async fn find(
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Option<ResolvedVc<EcmascriptEmitOptions>>> {
        find_emit_option::<EcmascriptEmitOptions>(chunking_context.emit_options()).await
    }

    /// Look up `EcmascriptEmitOptions` from a chunking context's emit options,
    /// falling back to a static default (no minification, indent enabled, comments enabled).
    ///
    /// Returns an `impl Deref<Target = EcmascriptEmitOptions>` — either a `ReadRef` from the
    /// chunking context or a reference to the static default, without allocating.
    pub async fn get_or_default(
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<impl Deref<Target = EcmascriptEmitOptions>> {
        static DEFAULT: EcmascriptEmitOptions = EcmascriptEmitOptions::DEFAULT;
        Ok(match Self::find(chunking_context).await? {
            Some(vc) => Either::Left(vc.await?),
            None => Either::Right(&DEFAULT),
        })
    }
}

/// Adapts minify options for use on a single chunk item.
///
/// Mangling with character-frequency ordering (optimal size) orders mangled names by the
/// character frequency of the code being minified. Per item, that order differs from factory to
/// factory, which hurts gzip across the chunk. A fixed order keeps names consistent between
/// factories, so character-frequency ordering is disabled.
fn for_chunk_items(mut options: SwcMinifyOptions) -> SwcMinifyOptions {
    if let Some(mangle) = &mut options.mangle {
        mangle.disable_char_freq = true;
    }
    options
}

impl EcmascriptEmitOptionsBuilder {
    /// Applies `options` to chunks and standalone assets, and the settings shared by all
    /// minification presets.
    fn apply_minify_preset(&mut self, options: SwcMinifyOptions) {
        self.options.chunk_minify_options = Some(options.clone());
        self.options.standalone_minify_options = Some(options);
        self.options.indent = false;
        self.options.merged_module_comments = false;
    }

    /// Set the SWC minify options for assembled chunks.
    pub fn chunk_minify_options(mut self, opts: Option<SwcMinifyOptions>) -> Self {
        self.options.chunk_minify_options = opts;
        self
    }

    /// Set the SWC minify options for each chunk item, applied before chunk assembly.
    pub fn chunk_item_minify_options(mut self, opts: Option<SwcMinifyOptions>) -> Self {
        self.options.chunk_item_minify_options = opts;
        self
    }

    /// Set the SWC minify options for standalone assets (runtime, evaluate and worker code).
    pub fn standalone_minify_options(mut self, opts: Option<SwcMinifyOptions>) -> Self {
        self.options.standalone_minify_options = opts;
        self
    }

    /// EXPERIMENTAL: minify each chunk item on its own, before the chunk is assembled, instead of
    /// minifying the assembled chunk. Moves the chunk minify options to the chunk items, with
    /// character-frequency mangling disabled. Standalone options are unchanged.
    ///
    /// Per-item results are cached per chunk item, so an incremental build only re-minifies the
    /// items that changed. Call after a minification preset.
    pub fn minify_per_chunk_item(mut self) -> Self {
        self.options.chunk_item_minify_options = self
            .options
            .chunk_minify_options
            .take()
            .map(for_chunk_items);
        self
    }

    /// EXPERIMENTAL: minify each chunk item on its own (like [`Self::minify_per_chunk_item`]),
    /// and minify the assembled chunk again afterwards. Call after a minification preset.
    pub fn minify_chunk_items_and_chunks(mut self) -> Self {
        self.options.chunk_item_minify_options = self
            .options
            .chunk_minify_options
            .clone()
            .map(for_chunk_items);
        self
    }

    /// Preset: minify with optimal-size mangling (char-freq enabled).
    /// Disables indent and merged module comments.
    pub fn preset_minify_optimal_size(mut self) -> Self {
        self.apply_minify_preset(SwcMinifyOptions {
            compress: Some(CompressOptions {
                passes: 2,
                ..Default::default()
            }),
            mangle: Some(MangleOptions {
                reserved: vec![atom!("AbortSignal")],
                ..Default::default()
            }),
            ..Default::default()
        });
        self
    }

    /// Preset: minify with deterministic mangling (disable_char_freq=true).
    /// For React SSR contexts that need stable function names across renders.
    /// Disables indent and merged module comments.
    pub fn preset_minify_deterministic(mut self) -> Self {
        self.apply_minify_preset(SwcMinifyOptions {
            compress: Some(CompressOptions {
                passes: 2,
                ..Default::default()
            }),
            mangle: Some(MangleOptions {
                reserved: vec![atom!("AbortSignal")],
                disable_char_freq: true,
                ..Default::default()
            }),
            ..Default::default()
        });
        self
    }

    /// Preset: compress only, no mangling.
    /// Keeps class names and function names.
    /// Disables indent and merged module comments.
    pub fn preset_minify_no_mangle(mut self) -> Self {
        self.apply_minify_preset(SwcMinifyOptions {
            compress: Some(CompressOptions {
                passes: 2,
                keep_classnames: true,
                keep_fnames: true,
                ..Default::default()
            }),
            mangle: None,
            ..Default::default()
        });
        self
    }

    pub fn indent(mut self, indent: bool) -> Self {
        self.options.indent = indent;
        self
    }

    pub fn merged_module_comments(mut self, comments: bool) -> Self {
        self.options.merged_module_comments = comments;
        self
    }

    pub fn build(self) -> EcmascriptEmitOptions {
        self.options
    }
}
