use swc_core::common::{source_map::SourceMapGenConfig, FileName};
use turbopack_core::SOURCE_MAP_PREFIX;

/// A config to generate a source map which includes the source content of every
/// source file. SWC doesn't inline sources content by default when generating a
/// sourcemap, so we need to provide a custom config to do it.
pub struct InlineSourcesContentConfig {}

impl SourceMapGenConfig for InlineSourcesContentConfig {
    fn file_name_to_source(&self, f: &FileName) -> String {
        match f {
            FileName::Custom(s) => format!("{SOURCE_MAP_PREFIX}{s}"),
            _ => f.to_string(),
        }
    }

    fn inline_sources_content(&self, _f: &FileName) -> bool {
        true
    }
}
