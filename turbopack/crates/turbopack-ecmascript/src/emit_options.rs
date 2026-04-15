use std::{ops::Deref, sync::LazyLock};

use anyhow::Result;
use either::Either;
use swc_core::{
    atoms::atom,
    ecma::minifier::option::{CompressOptions, MangleOptions, MinifyOptions as SwcMinifyOptions},
};
use turbo_tasks::Vc;
use turbopack_core::chunk::{ChunkingContext, EmitOption, chunking_context::find_emit_option};

/// Ecmascript-specific emit options for controlling minification, indentation,
/// and other code generation settings.
///
/// When no `EcmascriptEmitOptions` is present in the chunking context's emit options,
/// callers should use `EcmascriptEmitOptions::default()` (no minification, indent enabled,
/// merged module comments enabled).
#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct EcmascriptEmitOptions {
    /// Full SWC minify options. `None` means no minification.
    #[turbo_tasks(trace_ignore)]
    pub swc_minify_options: Option<SwcMinifyOptions>,
    /// Whether to indent JS output (pretty-print).
    pub indent: bool,
    /// Whether to emit `// MERGED MODULE: ...` comments in scope-hoisted output.
    pub merged_module_comments: bool,
}

impl Default for EcmascriptEmitOptions {
    fn default() -> Self {
        Self {
            swc_minify_options: None,
            indent: true,
            merged_module_comments: true,
        }
    }
}

#[turbo_tasks::value_impl]
impl EmitOption for EcmascriptEmitOptions {}

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

    /// Look up `EcmascriptEmitOptions` from a chunking context's emit options,
    /// falling back to a static default (no minification, indent enabled, comments enabled).
    ///
    /// Returns an `impl Deref<Target = EcmascriptEmitOptions>` — either a `ReadRef` from the
    /// chunking context or a reference to the static default, without allocating.
    pub async fn get_or_default(
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<impl Deref<Target = EcmascriptEmitOptions>> {
        static DEFAULT: LazyLock<EcmascriptEmitOptions> =
            LazyLock::new(EcmascriptEmitOptions::default);
        let opts =
            find_emit_option::<EcmascriptEmitOptions>(chunking_context.emit_options()).await?;
        Ok(match opts {
            Some(vc) => Either::Left(vc.await?),
            None => Either::Right(&*DEFAULT),
        })
    }
}

impl EcmascriptEmitOptionsBuilder {
    /// Common settings applied by all minification presets.
    fn apply_minify_defaults(&mut self) {
        self.options.indent = false;
        self.options.merged_module_comments = false;
    }

    /// Set full SWC minify options directly.
    pub fn swc_minify_options(mut self, opts: SwcMinifyOptions) -> Self {
        self.options.swc_minify_options = Some(opts);
        self
    }

    /// Preset: minify with optimal-size mangling (char-freq enabled).
    /// Disables indent and merged module comments.
    pub fn preset_minify_optimal_size(mut self) -> Self {
        self.options.swc_minify_options = Some(SwcMinifyOptions {
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
        self.apply_minify_defaults();
        self
    }

    /// Preset: minify with deterministic mangling (disable_char_freq=true).
    /// For React SSR contexts that need stable function names across renders.
    /// Disables indent and merged module comments.
    pub fn preset_minify_deterministic(mut self) -> Self {
        self.options.swc_minify_options = Some(SwcMinifyOptions {
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
        self.apply_minify_defaults();
        self
    }

    /// Preset: compress only, no mangling.
    /// Keeps class names and function names.
    /// Disables indent and merged module comments.
    pub fn preset_minify_no_mangle(mut self) -> Self {
        self.options.swc_minify_options = Some(SwcMinifyOptions {
            compress: Some(CompressOptions {
                passes: 2,
                keep_classnames: true,
                keep_fnames: true,
                ..Default::default()
            }),
            mangle: None,
            ..Default::default()
        });
        self.apply_minify_defaults();
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
