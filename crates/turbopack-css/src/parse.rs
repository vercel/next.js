use std::sync::Arc;

use anyhow::{Context, Result};
use indexmap::IndexMap;
use once_cell::sync::Lazy;
use regex::Regex;
use swc_core::{
    common::{
        errors::Handler, source_map::SourceMapGenConfig, BytePos, FileName, LineCol, SourceMap,
    },
    css::{
        ast::Stylesheet,
        modules::{CssClassName, TransformConfig},
        parser::{parse_file, parser::ParserConfig},
    },
    ecma::atoms::JsWord,
};
use turbo_tasks::{Value, ValueToString};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent, AssetVc},
    source_map::{GenerateSourceMap, GenerateSourceMapVc, OptionSourceMapVc},
    SOURCE_MAP_ROOT_NAME,
};
use turbopack_swc_utils::emitter::IssueEmitter;

use crate::{
    transform::{CssInputTransform, CssInputTransformsVc, TransformContext},
    CssModuleAssetType,
};

// Capture up until the first "."
static BASENAME_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[^.]*").unwrap());

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
pub enum ParseResult {
    Ok {
        #[turbo_tasks(trace_ignore)]
        stylesheet: Stylesheet,
        #[turbo_tasks(debug_ignore, trace_ignore)]
        source_map: Arc<SourceMap>,
        #[turbo_tasks(debug_ignore, trace_ignore)]
        imports: Vec<JsWord>,
        #[turbo_tasks(debug_ignore, trace_ignore)]
        exports: IndexMap<JsWord, Vec<CssClassName>>,
    },
    Unparseable,
    NotFound,
}

impl PartialEq for ParseResult {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Ok { .. }, Self::Ok { .. }) => false,
            _ => core::mem::discriminant(self) == core::mem::discriminant(other),
        }
    }
}

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
pub struct ParseResultSourceMap {
    #[turbo_tasks(debug_ignore, trace_ignore)]
    source_map: Arc<SourceMap>,

    /// The position mappings that can generate a real source map given a (SWC)
    /// SourceMap.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    mappings: Vec<(BytePos, LineCol)>,
}

impl PartialEq for ParseResultSourceMap {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.source_map, &other.source_map) && self.mappings == other.mappings
    }
}

impl ParseResultSourceMap {
    pub fn new(source_map: Arc<SourceMap>, mappings: Vec<(BytePos, LineCol)>) -> Self {
        ParseResultSourceMap {
            source_map,
            mappings,
        }
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for ParseResultSourceMap {
    #[turbo_tasks::function]
    fn generate_source_map(&self) -> OptionSourceMapVc {
        let map = self.source_map.build_source_map_with_config(
            &self.mappings,
            None,
            InlineSourcesContentConfig {},
        );
        OptionSourceMapVc::cell(Some(
            turbopack_core::source_map::SourceMap::new_regular(map).cell(),
        ))
    }
}

/// A config to generate a source map which includes the source content of every
/// source file. SWC doesn't inline sources content by default when generating a
/// sourcemap, so we need to provide a custom config to do it.
struct InlineSourcesContentConfig {}

impl SourceMapGenConfig for InlineSourcesContentConfig {
    fn file_name_to_source(&self, f: &FileName) -> String {
        match f {
            FileName::Custom(s) => format!("/{SOURCE_MAP_ROOT_NAME}/{s}"),
            _ => f.to_string(),
        }
    }

    fn inline_sources_content(&self, _f: &FileName) -> bool {
        true
    }
}

#[turbo_tasks::function]
pub async fn parse(
    source: AssetVc,
    ty: Value<CssModuleAssetType>,
    transforms: CssInputTransformsVc,
) -> Result<ParseResultVc> {
    let content = source.content();
    let fs_path = &*source.ident().path().await?;
    let ident_str = &*source.ident().to_string().await?;
    let ty = ty.into_value();
    Ok(match &*content.await? {
        AssetContent::Redirect { .. } => ParseResult::Unparseable.cell(),
        AssetContent::File(file) => match &*file.await? {
            FileContent::NotFound => ParseResult::NotFound.cell(),
            FileContent::Content(file) => match file.content().to_str() {
                Err(_err) => ParseResult::Unparseable.cell(),
                Ok(string) => {
                    let transforms = &*transforms.await?;
                    parse_content(
                        string.into_owned(),
                        fs_path,
                        ident_str,
                        source,
                        ty,
                        transforms,
                    )
                    .await?
                }
            },
        },
    })
}

async fn parse_content(
    string: String,
    fs_path: &FileSystemPath,
    ident_str: &str,
    source: AssetVc,
    ty: CssModuleAssetType,
    transforms: &[CssInputTransform],
) -> Result<ParseResultVc> {
    let source_map: Arc<SourceMap> = Default::default();
    let handler = Handler::with_emitter(
        true,
        false,
        Box::new(IssueEmitter {
            source,
            source_map: source_map.clone(),
            title: Some("Parsing css source code failed".to_string()),
        }),
    );

    let fm = source_map.new_source_file(FileName::Custom(ident_str.to_string()), string);

    let config = ParserConfig {
        css_modules: matches!(ty, CssModuleAssetType::Module),
        legacy_nesting: true,
        legacy_ie: true,
        ..Default::default()
    };

    let mut errors = Vec::new();
    let mut parsed_stylesheet = match parse_file::<Stylesheet>(&fm, config, &mut errors) {
        Ok(stylesheet) => stylesheet,
        Err(e) => {
            // TODO report in in a stream
            e.to_diagnostics(&handler).emit();
            return Ok(ParseResult::Unparseable.into());
        }
    };

    let mut has_errors = false;
    for e in errors {
        e.to_diagnostics(&handler).emit();
        has_errors = true
    }

    if has_errors {
        return Ok(ParseResult::Unparseable.into());
    }

    let context = TransformContext {
        source_map: &source_map,
    };
    for transform in transforms.iter() {
        transform.apply(&mut parsed_stylesheet, &context).await?;
    }

    let (imports, exports) = match ty {
        CssModuleAssetType::Global => Default::default(),
        CssModuleAssetType::Module => {
            let imports = swc_core::css::modules::imports::analyze_imports(&parsed_stylesheet);
            let basename = BASENAME_RE
                .captures(fs_path.file_name())
                .context("Must include basename preceding .")?
                .get(0)
                .context("Must include basename preceding .")?
                .as_str();
            // Truncate this as u32 so it's formated as 8-character hex in the suffic below
            let path_hash = turbo_tasks_hash::hash_xxh3_hash64(ident_str) as u32;
            let result = swc_core::css::modules::compile(
                &mut parsed_stylesheet,
                // TODO swc_css_modules should take `impl TransformConfig + '_`
                ModuleTransformConfig {
                    suffix: format!("__{}__{:x}", basename, path_hash),
                },
            );
            let mut exports = result.renamed.into_iter().collect::<IndexMap<_, _>>();
            // exports should be reported deterministically
            // TODO(sokra) report in order of occurrence within swc_css_modules using an
            // IndexMap
            exports.sort_keys();
            (imports, exports)
        }
    };

    Ok(ParseResult::Ok {
        stylesheet: parsed_stylesheet,
        source_map,
        imports,
        exports,
    }
    .into())
}

struct ModuleTransformConfig {
    suffix: String,
}

impl TransformConfig for ModuleTransformConfig {
    fn new_name_for(&self, local: &JsWord) -> JsWord {
        format!("{}{}", *local, self.suffix).into()
    }
}
