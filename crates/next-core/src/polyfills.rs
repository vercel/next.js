use anyhow::Result;
use swc_core::ecma::preset_env::{Version, Versions};
use turbo_rcstr::rcstr;
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
    pub filename: &'static str,
    pub chrome: Option<Version>,
    pub firefox: Option<Version>,
    pub safari: Option<Version>,
    pub edge: Option<Version>,
    pub opera: Option<Version>,
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

        polyfill_needed_for_browser(self.chrome, target.chrome)
            || polyfill_needed_for_browser(self.firefox, target.firefox)
            || polyfill_needed_for_browser(self.safari, target.safari)
            || polyfill_needed_for_browser(self.edge, target.edge)
            || polyfill_needed_for_browser(self.opera, target.opera)
    }
}

const fn v(major: u32, minor: u32) -> Version {
    Version {
        major,
        minor,
        patch: 0,
    }
}

// https://caniuse.com/es6-module
static NOMODULE_POLYFILL: PolyfillDefinition = PolyfillDefinition {
    filename: "polyfill-nomodule.js",
    edge: Some(v(16, 0)),
    firefox: Some(v(60, 0)),
    chrome: Some(v(61, 0)),
    safari: Some(v(10, 1)),
    opera: Some(v(48, 0)),
};

static MODULE_POLYFILLS: &[PolyfillDefinition] = &[
    // String.prototype.trimStart/trimEnd
    // https://caniuse.com/mdn-javascript_builtins_string_trimstart
    PolyfillDefinition {
        filename: "module/string-trim.js",
        chrome: Some(v(66, 0)),
        firefox: Some(v(61, 0)),
        safari: Some(v(12, 0)),
        edge: Some(v(79, 0)),
        opera: Some(v(53, 0)),
    },
    // Symbol.prototype.description
    // https://caniuse.com/mdn-javascript_builtins_symbol_description
    PolyfillDefinition {
        filename: "module/symbol-description.js",
        chrome: Some(v(70, 0)),
        firefox: Some(v(63, 0)),
        safari: Some(v(12, 1)),
        edge: Some(v(79, 0)),
        opera: Some(v(57, 0)),
    },
    // Array.prototype.flat/flatMap
    // https://caniuse.com/array-flat
    PolyfillDefinition {
        filename: "module/array-flat.js",
        chrome: Some(v(69, 0)),
        firefox: Some(v(62, 0)),
        safari: Some(v(12, 0)),
        edge: Some(v(79, 0)),
        opera: Some(v(56, 0)),
    },
    // Promise.prototype.finally
    // https://caniuse.com/promise-finally
    PolyfillDefinition {
        filename: "module/promise-finally.js",
        chrome: Some(v(63, 0)),
        firefox: Some(v(58, 0)),
        safari: Some(v(11, 1)),
        edge: Some(v(18, 0)),
        opera: Some(v(50, 0)),
    },
    // Object.fromEntries
    // https://caniuse.com/mdn-javascript_builtins_object_fromentries
    PolyfillDefinition {
        filename: "module/object-fromentries.js",
        chrome: Some(v(73, 0)),
        firefox: Some(v(63, 0)),
        safari: Some(v(12, 1)),
        edge: Some(v(79, 0)),
        opera: Some(v(60, 0)),
    },
    // Array.prototype.at
    // https://caniuse.com/mdn-javascript_builtins_array_at
    PolyfillDefinition {
        filename: "module/array-at.js",
        chrome: Some(v(92, 0)),
        firefox: Some(v(90, 0)),
        safari: Some(v(15, 4)),
        edge: Some(v(92, 0)),
        opera: Some(v(78, 0)),
    },
    // Object.hasOwn
    // https://caniuse.com/mdn-javascript_builtins_object_hasown
    PolyfillDefinition {
        filename: "module/object-hasown.js",
        chrome: Some(v(93, 0)),
        firefox: Some(v(92, 0)),
        safari: Some(v(15, 4)),
        edge: Some(v(93, 0)),
        opera: Some(v(79, 0)),
    },
    // URL.canParse
    // https://caniuse.com/mdn-api_url_canparse_static
    PolyfillDefinition {
        filename: "module/url-canparse.js",
        chrome: Some(v(120, 0)),
        firefox: Some(v(115, 0)),
        safari: Some(v(17, 0)),
        edge: Some(v(120, 0)),
        opera: Some(v(106, 0)),
    },
];

pub fn get_required_polyfills(versions: &Versions) -> Vec<&'static str> {
    if NOMODULE_POLYFILL.is_needed(versions) {
        // NOMODULE_POLYFILL includes everything in MODULE_POLYFILLS
        vec![NOMODULE_POLYFILL.filename]
    } else {
        MODULE_POLYFILLS
            .iter()
            .filter(|polyfill| polyfill.is_needed(versions))
            .map(|d| d.filename)
            .collect()
    }
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
            let path = next_package.join(&format!("dist/build/polyfills/{}", polyfill))?;
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
    fn test_modern_browsers_need_few_polyfills() {
        // Chrome 120+ should not need any of these polyfills
        let versions = Versions {
            chrome: Some(v(120, 0)),
            ..Default::default()
        };
        let required = get_required_polyfills(&versions);
        assert_eq!(required, Vec::<&str>::new());
    }

    #[test]
    fn test_old_browsers_need_more_polyfills() {
        let versions = Versions {
            chrome: Some(v(80, 0)),
            ..Default::default()
        };
        let required = get_required_polyfills(&versions);
        assert_eq!(
            required,
            vec![
                "module/array-at.js",
                "module/object-hasown.js",
                "module/url-canparse.js"
            ]
        );
    }

    #[test]
    fn test_oldest_browsers_need_all_polyfills() {
        let versions = Versions {
            chrome: Some(v(61, 0)),
            ..Default::default()
        };
        let required = get_required_polyfills(&versions);
        assert_eq!(
            required,
            vec![
                "module/string-trim.js",
                "module/symbol-description.js",
                "module/array-flat.js",
                "module/promise-finally.js",
                "module/object-fromentries.js",
                "module/array-at.js",
                "module/object-hasown.js",
                "module/url-canparse.js"
            ]
        );
    }

    #[test]
    fn test_ancient_browsers_need_nomodule_polyfills() {
        let versions = Versions {
            chrome: Some(v(50, 0)),
            ..Default::default()
        };
        let required = get_required_polyfills(&versions);
        assert_eq!(required, vec!["polyfill-nomodule.js"]);
    }
}
