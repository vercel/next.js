use std::sync::Arc;

use swc_core::{
    atoms::atom,
    ecma::minifier::option::{CompressOptions, MangleOptions, MinifyOptions as SwcMinifyOptions},
};
use turbopack_core::chunk::EmitOption;

/// Ecmascript-specific emit options for controlling minification, indentation,
/// and other code generation settings.
///
/// When no `EcmascriptEmitOptions` is present in the chunking context's emit options,
/// callers should use `EcmascriptEmitOptions::default()` (no minification, indent enabled,
/// merged module comments enabled).
#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
#[derive(Clone)]
pub struct EcmascriptEmitOptions {
    /// Full SWC minify options. `None` means no minification.
    /// Wrapped in Arc because `SwcMinifyOptions` doesn't implement Clone.
    #[turbo_tasks(trace_ignore)]
    pub swc_minify_options: Option<Arc<SwcMinifyOptions>>,
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

impl PartialEq for EcmascriptEmitOptions {
    fn eq(&self, other: &Self) -> bool {
        // SwcMinifyOptions doesn't implement PartialEq, so compare by debug representation.
        let opts_eq = match (&self.swc_minify_options, &other.swc_minify_options) {
            (Some(a), Some(b)) => Arc::ptr_eq(a, b) || format!("{a:?}") == format!("{b:?}"),
            (None, None) => true,
            _ => false,
        };
        opts_eq
            && self.indent == other.indent
            && self.merged_module_comments == other.merged_module_comments
    }
}

impl Eq for EcmascriptEmitOptions {}

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
}

impl EcmascriptEmitOptionsBuilder {
    /// Set full SWC minify options directly.
    pub fn swc_minify_options(mut self, opts: SwcMinifyOptions) -> Self {
        self.options.swc_minify_options = Some(Arc::new(opts));
        self
    }

    /// Convenience: minify with optimal-size mangling (char-freq enabled).
    /// Sets indent=false, merged_module_comments=false.
    pub fn mangle_optimal_size(mut self) -> Self {
        self.options.swc_minify_options = Some(Arc::new(SwcMinifyOptions {
            compress: Some(CompressOptions {
                passes: 2,
                ..Default::default()
            }),
            mangle: Some(MangleOptions {
                reserved: vec![atom!("AbortSignal")],
                ..Default::default()
            }),
            ..Default::default()
        }));
        self.options.indent = false;
        self.options.merged_module_comments = false;
        self
    }

    /// Convenience: minify with deterministic mangling (disable_char_freq=true).
    /// For React SSR contexts that need stable function names across renders.
    pub fn mangle_deterministic(mut self) -> Self {
        self.options.swc_minify_options = Some(Arc::new(SwcMinifyOptions {
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
        }));
        self.options.indent = false;
        self.options.merged_module_comments = false;
        self
    }

    /// Convenience: compress only, no mangling.
    /// Keeps class names and function names.
    pub fn no_mangle(mut self) -> Self {
        self.options.swc_minify_options = Some(Arc::new(SwcMinifyOptions {
            compress: Some(CompressOptions {
                passes: 2,
                keep_classnames: true,
                keep_fnames: true,
                ..Default::default()
            }),
            mangle: None,
            ..Default::default()
        }));
        self.options.indent = false;
        self.options.merged_module_comments = false;
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
