use std::{collections::VecDeque, io::Write};

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString};
use turbopack_core::{chunk::ModuleId, code_builder::CodeBuilder};

use super::{CssChunkItemVc, CssImport};
use crate::chunk::CssChunkItem;

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
                let id = module_id_to_css_ident(&*chunk_item.id().await?);

                // CSS chunk items can be duplicated across chunks. This can cause precedence
                // issues (WEB-456). We use CSS layers to make sure that the first occurrence of
                // a CSS chunk item determines its precedence.
                // TODO(alexkirsz) This currently breaks users using @layer. We can fix that by
                // moving our @layer into the user layer.
                writeln!(code, "@layer {id} {{")?;

                let content = chunk_item.content().await?;
                code.push_source(
                    &content.inner_code,
                    content.source_map.map(|sm| sm.as_generate_source_map()),
                );

                // Closing @layer.
                writeln!(code, "\n}}")?;

                writeln!(code, "\n{}", close)?;

                stack.pop();
            }
        }
    }

    Ok(external_imports)
}

fn module_id_to_css_ident(id: &ModuleId) -> String {
    match id {
        ModuleId::Number(n) => format!("n{}", n),
        ModuleId::String(s) => format!("s{}", escape_css_ident(s)),
    }
}

/// Escapes a string to be a valid CSS identifier, according to the rules
/// defined in https://developer.mozilla.org/en-US/docs/Web/CSS/ident
fn escape_css_ident(s: &str) -> String {
    let mut escaped = String::new();

    let mut starts_as_a_number = true;
    for char in s.chars() {
        if starts_as_a_number {
            if char.is_ascii_digit() {
                escaped.push('_');
                starts_as_a_number = false;
            } else if char != '-' {
                starts_as_a_number = false;
            }
        }

        if char.is_ascii_alphanumeric() || char == '-' || char == '_' {
            escaped.push(char);
        } else {
            escaped.push('\\');
            escaped.push(char);
        }
    }

    escaped
}

#[cfg(test)]
mod tests {
    //! These cases are taken from https://developer.mozilla.org/en-US/docs/Web/CSS/ident#examples.

    use super::*;

    #[test]
    fn test_escape_css_ident_noop() {
        assert_eq!(escape_css_ident("nono79"), "nono79");
        assert_eq!(escape_css_ident("ground-level"), "ground-level");
        assert_eq!(escape_css_ident("-test"), "-test");
        assert_eq!(escape_css_ident("--toto"), "--toto");
        assert_eq!(escape_css_ident("_internal"), "_internal");
        // TODO(alexkirsz) Support unicode characters?
        // assert_eq!(escape_css_ident("\\22 toto"), "\\22 toto");
        // TODO(alexkirsz) This CSS identifier is already valid, but we escape
        // it anyway.
        assert_eq!(escape_css_ident("bili\\.bob"), "bili\\\\\\.bob");
    }

    #[test]
    fn test_escape_css_ident() {
        assert_eq!(escape_css_ident("34rem"), "_34rem");
        assert_eq!(escape_css_ident("-12rad"), "-_12rad");
        assert_eq!(escape_css_ident("bili.bob"), "bili\\.bob");
        assert_eq!(escape_css_ident("'bilibob'"), "\\'bilibob\\'");
        assert_eq!(escape_css_ident("\"bilibob\""), "\\\"bilibob\\\"");
    }
}
