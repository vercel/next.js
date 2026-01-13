use anyhow::Result;
use swc_core::ecma::preset_env::Version;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystem, FileSystemPath, VirtualFileSystem};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    code_builder::{Code, CodeBuilder},
    environment::RuntimeVersions,
    ident::AssetIdent,
    output::{OutputAsset, OutputAssetsReference, OutputAssetsWithReferenced},
    source_map::{GenerateSourceMap, SourceMapAsset},
};

use crate::next_import_map::get_next_package;

#[derive(Debug, Clone, Copy)]
pub struct PolyfillDefinition {
    /// Identifier for the polyfill
    pub name: &'static str,
    /// Path to the polyfill file relative to next/dist/build/polyfills/module/
    pub filename: &'static str,
    /// Minimum Chrome version that natively supports this feature (None = never)
    pub chrome_min: Option<Version>,
    /// Minimum Firefox version
    pub firefox_min: Option<Version>,
    /// Minimum Safari version
    pub safari_min: Option<Version>,
    /// Minimum Edge version (Chromium-based, None = not in legacy Edge)
    pub edge_min: Option<Version>,
    /// Minimum Opera version
    pub opera_min: Option<Version>,
}

const fn v(major: u32, minor: u32) -> Version {
    Version {
        major,
        minor,
        patch: 0,
    }
}

/// All available module polyfills with their browser support requirements.
///
/// These polyfills target ES Modules supporting browsers:
/// Edge 16+, Firefox 60+, Chrome 61+, Safari 10.1+
pub static MODULE_POLYFILLS: &[PolyfillDefinition] = &[
    // String.prototype.trimStart/trimEnd
    // https://caniuse.com/mdn-javascript_builtins_string_trimstart
    PolyfillDefinition {
        name: "string-trim",
        filename: "string-trim.js",
        chrome_min: Some(v(66, 0)),
        firefox_min: Some(v(61, 0)),
        safari_min: Some(v(12, 0)),
        edge_min: Some(v(79, 0)),
        opera_min: Some(v(53, 0)),
    },
    // Symbol.prototype.description
    // https://caniuse.com/mdn-javascript_builtins_symbol_description
    PolyfillDefinition {
        name: "symbol-description",
        filename: "symbol-description.js",
        chrome_min: Some(v(70, 0)),
        firefox_min: Some(v(63, 0)),
        safari_min: Some(v(12, 1)),
        edge_min: Some(v(79, 0)),
        opera_min: Some(v(57, 0)),
    },
    // Array.prototype.flat/flatMap
    // https://caniuse.com/array-flat
    PolyfillDefinition {
        name: "array-flat",
        filename: "array-flat.js",
        chrome_min: Some(v(69, 0)),
        firefox_min: Some(v(62, 0)),
        safari_min: Some(v(12, 0)),
        edge_min: Some(v(79, 0)),
        opera_min: Some(v(56, 0)),
    },
    // Promise.prototype.finally
    // https://caniuse.com/promise-finally
    PolyfillDefinition {
        name: "promise-finally",
        filename: "promise-finally.js",
        chrome_min: Some(v(63, 0)),
        firefox_min: Some(v(58, 0)),
        safari_min: Some(v(11, 1)),
        edge_min: Some(v(18, 0)),
        opera_min: Some(v(50, 0)),
    },
    // Object.fromEntries
    // https://caniuse.com/mdn-javascript_builtins_object_fromentries
    PolyfillDefinition {
        name: "object-fromentries",
        filename: "object-fromentries.js",
        chrome_min: Some(v(73, 0)),
        firefox_min: Some(v(63, 0)),
        safari_min: Some(v(12, 1)),
        edge_min: Some(v(79, 0)),
        opera_min: Some(v(60, 0)),
    },
    // Array.prototype.at
    // https://caniuse.com/mdn-javascript_builtins_array_at
    PolyfillDefinition {
        name: "array-at",
        filename: "array-at.js",
        chrome_min: Some(v(92, 0)),
        firefox_min: Some(v(90, 0)),
        safari_min: Some(v(15, 4)),
        edge_min: Some(v(92, 0)),
        opera_min: Some(v(78, 0)),
    },
    // Object.hasOwn
    // https://caniuse.com/mdn-javascript_builtins_object_hasown
    PolyfillDefinition {
        name: "object-hasown",
        filename: "object-hasown.js",
        chrome_min: Some(v(93, 0)),
        firefox_min: Some(v(92, 0)),
        safari_min: Some(v(15, 4)),
        edge_min: Some(v(93, 0)),
        opera_min: Some(v(79, 0)),
    },
    // URL.canParse
    // https://caniuse.com/mdn-api_url_canparse_static
    PolyfillDefinition {
        name: "url-canparse",
        filename: "url-canparse.js",
        chrome_min: Some(v(120, 0)),
        firefox_min: Some(v(115, 0)),
        safari_min: Some(v(17, 0)),
        edge_min: Some(v(120, 0)),
        opera_min: Some(v(106, 0)),
    },
];

/// Check if a polyfill is needed for a specific browser and target version.
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

/// Determines which polyfills are needed for the given runtime versions.
pub fn get_required_polyfills(
    versions: &swc_core::ecma::preset_env::Versions,
) -> Vec<&'static PolyfillDefinition> {
    MODULE_POLYFILLS
        .iter()
        .filter(|polyfill| {
            // Need polyfill if ANY target browser needs it
            polyfill_needed_for_browser(polyfill.chrome_min, versions.chrome)
                || polyfill_needed_for_browser(polyfill.firefox_min, versions.firefox)
                || polyfill_needed_for_browser(polyfill.safari_min, versions.safari)
                || polyfill_needed_for_browser(polyfill.edge_min, versions.edge)
                || polyfill_needed_for_browser(polyfill.opera_min, versions.opera)
        })
        .collect()
}

/// Returns the list of required polyfill filenames for the given runtime versions.
#[turbo_tasks::function]
pub async fn get_required_polyfill_paths(
    runtime_versions: Vc<RuntimeVersions>,
) -> Result<Vc<Vec<RcStr>>> {
    let versions = runtime_versions.await?;
    let required = get_required_polyfills(&versions);
    let paths: Vec<RcStr> = required.iter().map(|p| RcStr::from(p.filename)).collect();

    Ok(Vc::cell(paths))
}

#[turbo_tasks::value]
pub struct PolyfillsAsset {
    project_path: FileSystemPath,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    runtime_versions: ResolvedVc<RuntimeVersions>,
}

#[turbo_tasks::value_impl]
impl PolyfillsAsset {
    #[turbo_tasks::function]
    pub fn new(
        project_path: FileSystemPath,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        runtime_versions: ResolvedVc<RuntimeVersions>,
    ) -> Vc<PolyfillsAsset> {
        PolyfillsAsset {
            project_path,
            chunking_context,
            runtime_versions,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn code(&self) -> Result<Vc<Code>> {
        let required = get_required_polyfills(&*self.runtime_versions.await?);
        let next_package = get_next_package(self.project_path.clone()).await?;

        let mut builder = CodeBuilder::default();
        for polyfill in required {
            let path = next_package.join(&format!(
                "dist/build/polyfills/module/{}",
                polyfill.filename
            ))?;
            if let FileContent::Content(file) = &*path.read().await? {
                let content = file.content();
                let source_map = serde_json::json!({
                    "version": 3,
                    // TODO: Encode using `urlencoding`, so that these
                    // are valid URLs. However, `project_trace_source_operation` (and
                    // `uri_from_file`) need to handle percent encoding correctly first.
                    //
                    // See turbopack/crates/turbopack-core/src/source_map/utils.rs as well
                    "sources": [format!("turbopack:///{}", path.path)],
                    "sourcesContent": [content.to_str()?],
                    "names": [],
                    // Maps 0:0 in the output code to 0:0 in the `source_code`. Sufficient for
                    // bundle analyzers to attribute the bytes in the output chunks
                    "mappings": "AAAA",
                })
                .to_string()
                .into();

                builder.push_source(content, Some(source_map));
                builder += "\n";
            } else {
                panic!("Couldn't find polyfill file in {}", path.path);
            }
        }

        let code = builder.build();
        Ok(code.cell())
    }

    #[turbo_tasks::function]
    async fn source_map(self: Vc<Self>) -> Result<Vc<SourceMapAsset>> {
        let this = self.await?;
        Ok(SourceMapAsset::new(
            *this.chunking_context,
            polyfills_ident(),
            Vc::upcast(self),
        ))
    }
}

#[turbo_tasks::function]
async fn polyfills_ident() -> Result<Vc<AssetIdent>> {
    Ok(AssetIdent::from_path(
        VirtualFileSystem::new_with_name(rcstr!("polyfills"))
            .root()
            .owned()
            .await?,
    ))
}

#[turbo_tasks::value_impl]
impl OutputAsset for PolyfillsAsset {
    #[turbo_tasks::function]
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        Ok(this.chunking_context.chunk_path(
            Some(Vc::upcast(self)),
            polyfills_ident(),
            Some(rcstr!("polyfills")),
            rcstr!(".js"),
        ))
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for PolyfillsAsset {
    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        Ok(OutputAssetsWithReferenced::from_assets(Vc::cell(vec![
            ResolvedVc::upcast(self.source_map().to_resolved().await?),
        ])))
    }
}

#[turbo_tasks::value_impl]
impl Asset for PolyfillsAsset {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        Ok(AssetContent::file(
            FileContent::Content(File::from(
                self.code()
                    .to_rope_with_magic_comments(|| self.source_map())
                    .await?,
            ))
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for PolyfillsAsset {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<FileContent> {
        self.code().generate_source_map()
    }
}

#[cfg(test)]
mod tests {
    use swc_core::ecma::preset_env::Versions;

    use super::*;

    #[test]
    fn test_polyfill_needed_for_browser() {
        // Target below minimum - needs polyfill
        assert!(polyfill_needed_for_browser(
            Some(v(120, 0)),
            Some(v(119, 0))
        ));
        // Target at minimum - doesn't need polyfill
        assert!(!polyfill_needed_for_browser(
            Some(v(120, 0)),
            Some(v(120, 0))
        ));
        // Target above minimum - doesn't need polyfill
        assert!(!polyfill_needed_for_browser(
            Some(v(120, 0)),
            Some(v(121, 0))
        ));
        // No target - doesn't need polyfill
        assert!(!polyfill_needed_for_browser(Some(v(120, 0)), None));
        // Browser never supports - needs polyfill
        assert!(polyfill_needed_for_browser(None, Some(v(100, 0))));
    }

    #[test]
    fn test_modern_browsers_need_few_polyfills() {
        // Chrome 120+ should not need any of these polyfills
        let versions = Versions {
            chrome: Some(v(120, 0)),
            ..Default::default()
        };
        let required = get_required_polyfills(&versions);
        assert!(
            required.is_empty(),
            "Expected no polyfills for Chrome 120+, got: {:?}",
            required.iter().map(|p| p.name).collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_older_browsers_need_more_polyfills() {
        // Chrome 61 should need most polyfills
        let versions = Versions {
            chrome: Some(v(61, 0)),
            ..Default::default()
        };
        let required = get_required_polyfills(&versions);
        assert!(
            required.len() >= 6,
            "Expected at least 6 polyfills for Chrome 61, got: {:?}",
            required.iter().map(|p| p.name).collect::<Vec<_>>()
        );
    }
}
