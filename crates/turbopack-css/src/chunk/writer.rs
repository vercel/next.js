use std::{collections::VecDeque, io::Write};

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString};
use turbopack_core::code_builder::CodeBuilder;

use super::{CssChunkItemVc, CssImport};

pub async fn expand_imports(
    code: &mut CodeBuilder,
    chunk_item: CssChunkItemVc,
) -> Result<Vec<StringVc>> {
    let content = chunk_item.content().await?;
    let mut stack = vec![(
        chunk_item,
        content.imports.iter().cloned().collect::<VecDeque<_>>(),
        "".to_string(),
    )];
    let mut external_imports = vec![];

    while let Some((chunk_item, imports, close)) = stack.last_mut() {
        match imports.pop_front() {
            Some(CssImport::Internal(import, imported_chunk_item)) => {
                let (open, close) = import.await?.attributes.await?.print_block()?;

                let id = &*imported_chunk_item.to_string().await?;
                writeln!(code, "/* import({}) */", id)?;
                writeln!(code, "{}", open)?;

                let imported_content_vc = imported_chunk_item.content();
                let imported_content = &*imported_content_vc.await?;
                stack.push((
                    imported_chunk_item,
                    imported_content.imports.iter().cloned().collect(),
                    close,
                ));
            }
            Some(CssImport::External(url_vc)) => {
                external_imports.push(url_vc);
            }
            None => {
                let id = &*chunk_item.to_string().await?;
                writeln!(code, "/* {} */", id)?;

                let content = chunk_item.content().await?;
                code.push_source(
                    &content.inner_code,
                    content.source_map.map(|sm| sm.as_generate_source_map()),
                );
                writeln!(code, "\n{}", close)?;

                stack.pop();
            }
        }
    }

    Ok(external_imports)
}
