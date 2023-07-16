use std::{
    collections::{HashSet, VecDeque},
    io::Write,
};

use anyhow::Result;
use turbo_tasks::{ValueToString, Vc};
use turbopack_core::{chunk::ChunkItem, code_builder::CodeBuilder};

use super::{CssChunkItem, CssImport};

// TODO(WEB-1261)
pub async fn expand_imports(
    code: &mut CodeBuilder,
    chunk_item: Vc<Box<dyn CssChunkItem>>,
) -> Result<Vec<Vc<String>>> {
    let content = chunk_item.content().await?;
    let mut stack = vec![(
        chunk_item,
        content.imports.iter().cloned().collect::<VecDeque<_>>(),
        "".to_string(),
    )];
    let mut external_imports = vec![];
    type ImportedChunkItemEntry = (String, String, Vc<Box<dyn CssChunkItem>>);
    let mut imported_chunk_items: HashSet<ImportedChunkItemEntry> = HashSet::default();
    let mut composed_chunk_items: HashSet<Vc<Box<dyn CssChunkItem>>> = HashSet::default();

    while let Some((chunk_item, imports, close)) = stack.last_mut() {
        match imports.pop_front() {
            Some(CssImport::Internal(import, imported_chunk_item)) => {
                let (open, close) = import.await?.attributes.await?.print_block()?;

                if !imported_chunk_items.insert((
                    open.clone(),
                    close.clone(),
                    imported_chunk_item.resolve().await?,
                )) {
                    continue;
                }

                let id = &*imported_chunk_item.asset_ident().to_string().await?;
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
            Some(CssImport::Composes(composed_chunk_item)) => {
                if !composed_chunk_items.insert(composed_chunk_item.resolve().await?) {
                    continue;
                }

                let id = &*composed_chunk_item.asset_ident().to_string().await?;
                writeln!(code, "/* composes({}) */", id)?;

                let composed_content_vc = composed_chunk_item.content();
                let composed_content = &*composed_content_vc.await?;
                stack.push((
                    composed_chunk_item,
                    composed_content.imports.iter().cloned().collect(),
                    "".to_string(),
                ));
            }
            Some(CssImport::External(url_vc)) => {
                external_imports.push(url_vc);
            }
            None => {
                let id = &*chunk_item.id().await?;

                writeln!(code, "/* {} */", id)?;
                let content = chunk_item.content().await?;
                code.push_source(&content.inner_code, content.source_map.map(Vc::upcast));

                writeln!(code, "\n{}", close)?;

                stack.pop();
            }
        }
    }

    Ok(external_imports)
}
