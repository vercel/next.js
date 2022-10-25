use std::{collections::VecDeque, fmt::Write};

use turbo_tasks::ValueToString;

use crate::CssChunkItemContentVc;

pub async fn expand_imports<T: Write>(
    writer: &mut WriterWithIndent<T>,
    content_vc: CssChunkItemContentVc,
) -> anyhow::Result<()> {
    let content = &*content_vc.await?;
    let mut stack = vec![(
        content_vc,
        content.imports.iter().cloned().collect::<VecDeque<_>>(),
        (0, "".to_string()),
    )];

    while let Some((content_vc, imports, (indent, close))) = stack.last_mut() {
        if let Some((import, imported_chunk_item)) = imports.pop_front() {
            let (open, inner_indent, close) = import.await?.attributes.await?.print_block()?;

            let id = &*imported_chunk_item.to_string().await?;

            writeln!(writer, "/* import({}) */", id)?;
            writeln!(writer, "{}", open)?;
            let imported_content_vc = imported_chunk_item.content();
            let imported_content = &*imported_content_vc.await?;
            writer.push_indent(inner_indent)?;
            stack.push((
                imported_content_vc,
                imported_content.imports.iter().cloned().collect(),
                (inner_indent, close),
            ));
        } else {
            let content = &*(*content_vc).await?;
            writeln!(writer, "{}", content.inner_code)?;
            writer.pop_indent(*indent)?;
            writeln!(writer, "{}", close)?;
            stack.pop();
        }
    }

    Ok(())
}

pub struct WriterWithIndent<T: Write> {
    writer: T,
    indent_str: String,
    needs_indent: bool,
}

impl<T: Write> WriterWithIndent<T> {
    pub fn new(buffer: T) -> Self {
        Self {
            writer: buffer,
            indent_str: "".to_string(),
            needs_indent: true,
        }
    }

    pub fn push_indent(&mut self, indent: usize) -> std::fmt::Result {
        self.indent_str += &" ".repeat(indent);

        Ok(())
    }

    pub fn pop_indent(&mut self, indent: usize) -> std::fmt::Result {
        self.indent_str = " ".repeat(self.indent_str.len().saturating_sub(indent));

        Ok(())
    }
}

impl<T: Write> Write for WriterWithIndent<T> {
    #[inline]
    fn write_str(&mut self, s: &str) -> std::fmt::Result {
        for c in s.chars() {
            self.write_char(c)?;
        }

        Ok(())
    }

    #[inline]
    fn write_char(&mut self, c: char) -> std::fmt::Result {
        if c == '\n' {
            self.writer.write_char('\n')?;
            self.needs_indent = true;

            return Ok(());
        }

        if self.needs_indent {
            self.writer.write_str(&self.indent_str)?;
            self.needs_indent = false;
        }

        self.writer.write_char(c)
    }
}
