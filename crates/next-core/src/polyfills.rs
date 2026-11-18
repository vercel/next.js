//! Selects the browser polyfills that the configured browserslist targets need.
//!
//! There are two kinds of polyfills:
//!
//! - `polyfill-nomodule.js`: a large core-js based bundle for browsers without ES module support.
//!   It is emitted as a separate file, listed in the build manifest's `polyfillFiles` and loaded
//!   with `<script nomodule>`, so only browsers that don't support ES modules execute it.
//! - `module/*.js`: small polyfills for features that are missing in some browsers that do support
//!   ES modules. They replace the full `next/dist/build/polyfills/polyfill-module.js` that the
//!   client runtime imports first (see `get_next_client_resolved_map`), so they are part of the
//!   regular client bundle and run in every browser before any other code.

use anyhow::Result;
use swc_core::ecma::preset_env::{Version, Versions};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{
    asset::AssetContent, chunk::ChunkingContext, environment::RuntimeVersions,
    file_source::FileSource, output::OutputAsset, source::Source, virtual_source::VirtualSource,
};
use turbopack_ecmascript::single_file_ecmascript_output::SingleFileEcmascriptOutput;

use crate::next_import_map::get_next_package;

/// The minimum version of each browser that natively supports the feature a polyfill provides.
/// `None` means the browser never supports it. Internet Explorer supports none of them.
#[derive(Debug, Clone, Copy)]
struct PolyfillDefinition {
    filename: &'static str,
    chrome: Option<Version>,
    firefox: Option<Version>,
    safari: Option<Version>,
    edge: Option<Version>,
    opera: Option<Version>,
    ios: Option<Version>,
    samsung: Option<Version>,
    /// Android WebView, versioned like Chrome since Android 5.
    android: Option<Version>,
}

impl PolyfillDefinition {
    fn is_needed(&self, target: &Versions) -> bool {
        fn polyfill_needed_for_browser(
            polyfill_min: Option<Version>,
            target_version: Option<Version>,
        ) -> bool {
            match (polyfill_min, target_version) {
                // No target for this browser - don't need polyfill for it
                (_, None) => false,
                // Browser never supports this feature
                (None, Some(_)) => true,
                // Check if target version is below the minimum required
                (Some(min), Some(target)) => target < min,
            }
        }

        target.ie.is_some()
            || polyfill_needed_for_browser(self.chrome, target.chrome)
            || polyfill_needed_for_browser(self.firefox, target.firefox)
            || polyfill_needed_for_browser(self.safari, target.safari)
            || polyfill_needed_for_browser(self.edge, target.edge)
            || polyfill_needed_for_browser(self.opera, target.opera)
            || polyfill_needed_for_browser(self.ios, target.ios)
            || polyfill_needed_for_browser(self.samsung, target.samsung)
            || polyfill_needed_for_browser(self.android, target.android)
    }
}

const fn v(major: u32, minor: u32) -> Version {
    Version {
        major,
        minor,
        patch: 0,
    }
}

/// A blanket polyfill for browsers without ES module support.
/// <https://caniuse.com/es6-module>
static NOMODULE_POLYFILL: PolyfillDefinition = PolyfillDefinition {
    filename: "polyfill-nomodule.js",
    chrome: Some(v(61, 0)),
    firefox: Some(v(60, 0)),
    safari: Some(v(10, 1)),
    edge: Some(v(16, 0)),
    opera: Some(v(48, 0)),
    ios: Some(v(10, 3)),
    samsung: Some(v(8, 2)),
    android: Some(v(61, 0)),
};

/// Polyfills for browsers that support ES modules. The order matches
/// `packages/next-polyfill-module/src/index.js`.
static MODULE_POLYFILLS: &[PolyfillDefinition] = &[
    // String.prototype.trimStart/trimEnd
    // https://caniuse.com/mdn-javascript_builtins_string_trimstart
    PolyfillDefinition {
        filename: "string-trim.js",
        chrome: Some(v(66, 0)),
        firefox: Some(v(61, 0)),
        safari: Some(v(12, 0)),
        edge: Some(v(79, 0)),
        opera: Some(v(53, 0)),
        ios: Some(v(12, 0)),
        samsung: Some(v(9, 0)),
        android: Some(v(66, 0)),
    },
    // Symbol.prototype.description
    // https://caniuse.com/mdn-javascript_builtins_symbol_description
    PolyfillDefinition {
        filename: "symbol-description.js",
        chrome: Some(v(70, 0)),
        firefox: Some(v(63, 0)),
        safari: Some(v(12, 1)),
        edge: Some(v(79, 0)),
        opera: Some(v(57, 0)),
        ios: Some(v(12, 2)),
        samsung: Some(v(10, 0)),
        android: Some(v(70, 0)),
    },
    // Array.prototype.flat/flatMap
    // https://caniuse.com/array-flat
    PolyfillDefinition {
        filename: "array-flat.js",
        chrome: Some(v(69, 0)),
        firefox: Some(v(62, 0)),
        safari: Some(v(12, 0)),
        edge: Some(v(79, 0)),
        opera: Some(v(56, 0)),
        ios: Some(v(12, 0)),
        samsung: Some(v(10, 0)),
        android: Some(v(69, 0)),
    },
    // Promise.prototype.finally
    // https://caniuse.com/promise-finally
    PolyfillDefinition {
        filename: "promise-finally.js",
        chrome: Some(v(63, 0)),
        firefox: Some(v(58, 0)),
        safari: Some(v(11, 1)),
        edge: Some(v(18, 0)),
        opera: Some(v(50, 0)),
        ios: Some(v(11, 3)),
        samsung: Some(v(8, 0)),
        android: Some(v(63, 0)),
    },
    // Object.fromEntries
    // https://caniuse.com/mdn-javascript_builtins_object_fromentries
    PolyfillDefinition {
        filename: "object-fromentries.js",
        chrome: Some(v(73, 0)),
        firefox: Some(v(63, 0)),
        safari: Some(v(12, 1)),
        edge: Some(v(79, 0)),
        opera: Some(v(60, 0)),
        ios: Some(v(12, 2)),
        samsung: Some(v(11, 0)),
        android: Some(v(73, 0)),
    },
    // Array.prototype.at
    // https://caniuse.com/mdn-javascript_builtins_array_at
    PolyfillDefinition {
        filename: "array-at.js",
        chrome: Some(v(92, 0)),
        firefox: Some(v(90, 0)),
        safari: Some(v(15, 4)),
        edge: Some(v(92, 0)),
        opera: Some(v(78, 0)),
        ios: Some(v(15, 4)),
        samsung: Some(v(16, 0)),
        android: Some(v(92, 0)),
    },
    // Object.hasOwn
    // https://caniuse.com/mdn-javascript_builtins_object_hasown
    PolyfillDefinition {
        filename: "object-hasown.js",
        chrome: Some(v(93, 0)),
        firefox: Some(v(92, 0)),
        safari: Some(v(15, 4)),
        edge: Some(v(93, 0)),
        opera: Some(v(79, 0)),
        ios: Some(v(15, 4)),
        samsung: Some(v(17, 0)),
        android: Some(v(93, 0)),
    },
    // URL.canParse
    // https://caniuse.com/mdn-api_url_canparse_static
    PolyfillDefinition {
        filename: "url-canparse.js",
        chrome: Some(v(120, 0)),
        firefox: Some(v(115, 0)),
        safari: Some(v(17, 0)),
        edge: Some(v(120, 0)),
        opera: Some(v(106, 0)),
        ios: Some(v(17, 0)),
        samsung: Some(v(25, 0)),
        android: Some(v(120, 0)),
    },
];

/// Whether any of the targets lacks ES module support and therefore needs `polyfill-nomodule.js`.
fn nomodule_polyfill_needed(versions: &Versions) -> bool {
    NOMODULE_POLYFILL.is_needed(versions)
}

/// The `module/*.js` polyfills (file names relative to `dist/build/polyfills/module/`) that at
/// least one of the targets needs.
fn required_module_polyfills(versions: &Versions) -> Vec<&'static str> {
    MODULE_POLYFILLS
        .iter()
        .filter(|polyfill| polyfill.is_needed(versions))
        .map(|d| d.filename)
        .collect()
}

/// A module that replaces `next/dist/build/polyfills/polyfill-module.js` in the client bundle and
/// only loads the polyfills that the targets need.
#[turbo_tasks::function]
pub async fn selected_module_polyfills_source(
    project_path: FileSystemPath,
    runtime_versions: Vc<RuntimeVersions>,
) -> Result<Vc<Box<dyn Source>>> {
    let required = required_module_polyfills(&*runtime_versions.await?);
    let next_package = get_next_package(project_path).await?;

    let mut code = String::new();
    for polyfill in required {
        code.push_str(&format!(
            "require({});\n",
            serde_json::to_string(&format!("./module/{polyfill}"))?
        ));
    }

    // Placed next to the module it replaces so the relative requests above resolve to the
    // individual polyfills shipped in `next/dist/build/polyfills/module/`.
    Ok(Vc::upcast(VirtualSource::new(
        next_package.join("dist/build/polyfills/polyfill-module.selected.js")?,
        AssetContent::file(FileContent::Content(code.into()).cell()),
    )))
}

/// The `polyfill-nomodule.js` output asset, if any of the targets lacks ES module support.
pub async fn nomodule_polyfill_output_asset(
    project_path: FileSystemPath,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    runtime_versions: Vc<RuntimeVersions>,
) -> Result<Option<ResolvedVc<Box<dyn OutputAsset>>>> {
    if !*needs_nomodule_polyfill(runtime_versions).await? {
        return Ok(None);
    }

    // polyfill-nomodule.js is a pre-compiled asset distributed as part of next
    let next_package = get_next_package(project_path).await?;
    let polyfill_source =
        FileSource::new(next_package.join("dist/build/polyfills/polyfill-nomodule.js")?);

    Ok(Some(ResolvedVc::upcast(
        SingleFileEcmascriptOutput::new(chunking_context, Vc::upcast(polyfill_source))
            .to_resolved()
            .await?,
    )))
}

#[turbo_tasks::function]
async fn needs_nomodule_polyfill(runtime_versions: Vc<RuntimeVersions>) -> Result<Vc<bool>> {
    Ok(Vc::cell(nomodule_polyfill_needed(
        &*runtime_versions.await?,
    )))
}

#[cfg(test)]
mod tests {
    use swc_core::ecma::preset_env::Versions;

    use super::*;

    const ALL_MODULE_POLYFILLS: [&str; 8] = [
        "string-trim.js",
        "symbol-description.js",
        "array-flat.js",
        "promise-finally.js",
        "object-fromentries.js",
        "array-at.js",
        "object-hasown.js",
        "url-canparse.js",
    ];

    #[test]
    fn test_modern_browsers_need_no_polyfills() {
        let versions = Versions {
            chrome: Some(v(120, 0)),
            ..Default::default()
        };
        assert_eq!(required_module_polyfills(&versions), Vec::<&str>::new());
        assert!(!nomodule_polyfill_needed(&versions));
    }

    #[test]
    fn test_old_browsers_need_more_polyfills() {
        let versions = Versions {
            chrome: Some(v(80, 0)),
            ..Default::default()
        };
        assert_eq!(
            required_module_polyfills(&versions),
            vec!["array-at.js", "object-hasown.js", "url-canparse.js"]
        );
        assert!(!nomodule_polyfill_needed(&versions));
    }

    #[test]
    fn test_oldest_module_browsers_need_all_module_polyfills() {
        let versions = Versions {
            chrome: Some(v(61, 0)),
            ..Default::default()
        };
        assert_eq!(required_module_polyfills(&versions), ALL_MODULE_POLYFILLS);
        assert!(!nomodule_polyfill_needed(&versions));
    }

    #[test]
    fn test_nomodule_browsers_need_nomodule_polyfill() {
        let versions = Versions {
            chrome: Some(v(50, 0)),
            ..Default::default()
        };
        assert!(nomodule_polyfill_needed(&versions));
        // The module polyfills are still needed by module-supporting browsers in the same range.
        assert_eq!(required_module_polyfills(&versions), ALL_MODULE_POLYFILLS);
    }

    #[test]
    fn test_mobile_browsers() {
        let ios = Versions {
            ios: Some(v(9, 0)),
            ..Default::default()
        };
        assert!(nomodule_polyfill_needed(&ios));
        assert_eq!(required_module_polyfills(&ios), ALL_MODULE_POLYFILLS);

        let ios = Versions {
            ios: Some(v(16, 0)),
            ..Default::default()
        };
        assert!(!nomodule_polyfill_needed(&ios));
        assert_eq!(required_module_polyfills(&ios), vec!["url-canparse.js"]);

        let samsung = Versions {
            samsung: Some(v(16, 0)),
            ..Default::default()
        };
        assert!(!nomodule_polyfill_needed(&samsung));
        assert_eq!(
            required_module_polyfills(&samsung),
            vec!["object-hasown.js", "url-canparse.js"]
        );

        let android = Versions {
            android: Some(v(4, 4)),
            ..Default::default()
        };
        assert!(nomodule_polyfill_needed(&android));
    }

    #[test]
    fn test_ie_needs_everything() {
        let versions = Versions {
            ie: Some(v(11, 0)),
            ..Default::default()
        };
        assert!(nomodule_polyfill_needed(&versions));
        assert_eq!(required_module_polyfills(&versions), ALL_MODULE_POLYFILLS);
    }

    #[test]
    fn test_mixed_targets_take_the_oldest() {
        let versions = Versions {
            chrome: Some(v(120, 0)),
            safari: Some(v(15, 0)),
            ..Default::default()
        };
        assert_eq!(
            required_module_polyfills(&versions),
            vec!["array-at.js", "object-hasown.js", "url-canparse.js"]
        );
    }
}
