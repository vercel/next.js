use std::collections::BTreeMap;

use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileContent;
use turbopack_core::asset::Asset;
use wasmparser::{Chunk, Parser, Payload};

use crate::source::WebAssemblySource;

/// Imports and exports of a WebAssembly file.
#[turbo_tasks::value]
#[derive(Default)]
pub(crate) struct WebAssemblyAnalysis {
    pub imports: BTreeMap<String, Vec<String>>,
    pub exports: Vec<String>,
}

/// Analyse a WebAssembly file.
///
/// Extracts imports and exports.
#[turbo_tasks::function]
pub(crate) async fn analyze(source: Vc<WebAssemblySource>) -> Result<Vc<WebAssemblyAnalysis>> {
    let content = source.content().file_content().await?;

    let mut analysis = WebAssemblyAnalysis::default();

    let FileContent::Content(file) = &*content else {
        return Ok(analysis.cell());
    };

    let mut bytes = &*file.content().to_bytes()?;

    let mut parser = Parser::new(0);
    loop {
        let payload = match parser.parse(bytes, true)? {
            Chunk::Parsed { consumed, payload } => {
                bytes = &bytes[consumed..];
                payload
            }
            // this state isn't possible with `eof = true`
            Chunk::NeedMoreData(_) => unreachable!(),
        };

        match payload {
            Payload::ImportSection(s) => {
                for import in s {
                    let import = import?;

                    analysis
                        .imports
                        .entry(import.module.to_string())
                        .or_default()
                        .push(import.name.to_string());
                }
            }
            Payload::ExportSection(s) => {
                for export in s {
                    let export = export?;

                    analysis.exports.push(export.name.to_string());
                }
            }

            // skip over code sections
            Payload::CodeSectionStart { size, .. } => {
                parser.skip_section();
                bytes = &bytes[size as usize..];
            }

            Payload::End(_) => break,
            _ => {}
        }
    }

    Ok(analysis.cell())
}
