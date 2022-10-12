use std::sync::Arc;

use anyhow::Result;
use swc_core::{
    common::{errors::Handler, FileName, SourceMap},
    css::{
        ast::Stylesheet,
        parser::{parse_file, parser::ParserConfig},
    },
};
use turbo_tasks::{Value, ValueToString};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::asset::{AssetContent, AssetVc};
use turbopack_swc_utils::emitter::IssueEmitter;

use crate::{
    transform::{CssInputTransform, CssInputTransformsVc, TransformContext},
    CssModuleAssetType,
};

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
pub enum ParseResult {
    Ok {
        #[turbo_tasks(trace_ignore)]
        stylesheet: Stylesheet,
        #[turbo_tasks(debug_ignore, trace_ignore)]
        source_map: Arc<SourceMap>,
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

#[turbo_tasks::function]
pub async fn parse(
    source: AssetVc,
    ty: Value<CssModuleAssetType>,
    transforms: CssInputTransformsVc,
) -> Result<ParseResultVc> {
    let content = source.content();
    let fs_path = &*source.path().await?;
    let fs_path_str = &*source.path().to_string().await?;
    let ty = ty.into_value();
    Ok(match &*content.await? {
        AssetContent::Redirect { .. } => ParseResult::Unparseable.cell(),
        AssetContent::File(file) => match &*file.await? {
            FileContent::NotFound => ParseResult::NotFound.cell(),
            FileContent::Content(file) => match String::from_utf8(file.content().to_vec()) {
                Err(_err) => ParseResult::Unparseable.cell(),
                Ok(string) => {
                    let transforms = &*transforms.await?;
                    parse_content(string, fs_path, fs_path_str, source, ty, transforms).await?
                }
            },
        },
    })
}

async fn parse_content(
    string: String,
    fs_path: &FileSystemPath,
    fs_path_str: &str,
    source: AssetVc,
    _ty: CssModuleAssetType,
    transforms: &[CssInputTransform],
) -> Result<ParseResultVc> {
    let source_map: Arc<SourceMap> = Default::default();
    let handler = Handler::with_emitter(
        true,
        false,
        box IssueEmitter {
            source,
            source_map: source_map.clone(),
            title: Some("Parsing css source code failed".to_string()),
        },
    );

    let fm = source_map.new_source_file(FileName::Custom(fs_path_str.to_string()), string);

    let config = ParserConfig::default();

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
        file_name_str: fs_path.file_name(),
    };
    for transform in transforms.iter() {
        transform.apply(&mut parsed_stylesheet, &context).await?;
    }

    Ok(ParseResult::Ok {
        stylesheet: parsed_stylesheet,
        source_map,
    }
    .into())
}
