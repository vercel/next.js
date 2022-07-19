use std::{
    collections::{HashMap, VecDeque},
    fmt::Write,
};

use crate::CssChunkItemContentVc;

pub async fn expand_imports(
    mut writer: WriterWithIndent<'_>,
    content_vc: CssChunkItemContentVc,
    map: &HashMap<String, CssChunkItemContentVc>,
) -> anyhow::Result<()> {
    let content = &*content_vc.await?;
    let mut stack = vec![(
        content_vc,
        content.imports.iter().cloned().collect::<VecDeque<_>>(),
        (0, "".to_string()),
    )];

    while let Some((content_vc, imports, (indent, close))) = stack.last_mut() {
        if let Some((import, imported_id)) = imports.pop_front() {
            let (open, inner_indent, close) = import.await?.attributes.await?.print_block()?;

            let id = &*imported_id.await?;

            writeln!(writer, "/* import({}) */", id).unwrap();
            writeln!(writer, "{}", open).unwrap();
            if let Some(imported_content_vc) = map.get(id) {
                let imported_content = &*(*imported_content_vc).await?;
                writer = writer.push_indent(inner_indent);
                stack.push((
                    *imported_content_vc,
                    imported_content.imports.iter().cloned().collect(),
                    (inner_indent, close),
                ));
            } else {
                println!("unable to expand css import: {}", id);
                writeln!(writer, "").unwrap();
                writeln!(writer, "{}", close).unwrap();
            }
        } else {
            let content = &*(*content_vc).await?;
            writeln!(writer, "{}", content.inner_code).unwrap();
            writer = writer.pop_indent(*indent);
            writeln!(writer, "{}", close).unwrap();
            stack.pop();
        }
    }

    Ok(())
}

pub struct WriterWithIndent<'a> {
    buffer: &'a mut String,
    indent: usize,
    indent_str: String,
    current_line: String,
}

impl<'a> WriterWithIndent<'a> {
    pub fn new(buffer: &'a mut String) -> Self {
        Self {
            buffer,
            indent: 0,
            indent_str: "".to_string(),
            current_line: "".to_string(),
        }
    }

    pub fn push_indent(mut self, indent: usize) -> Self {
        if !self.current_line.is_empty() && self.current_line != self.indent_str {
            self.finish_current_line();
        }

        let indent = self.indent.saturating_add(indent);
        let indent_str = " ".repeat(indent);

        self.current_line.push_str(&indent_str);

        Self {
            buffer: self.buffer,
            indent,
            indent_str,
            current_line: self.current_line,
        }
    }

    pub fn pop_indent(mut self, indent: usize) -> Self {
        if !self.current_line.is_empty() && self.current_line != self.indent_str {
            self.finish_current_line();
        }

        let indent = self.indent.saturating_sub(indent);
        let indent_str = " ".repeat(indent);

        self.current_line.push_str(&indent_str);

        Self {
            buffer: self.buffer,
            indent,
            indent_str,
            current_line: self.current_line,
        }
    }

    fn finish_current_line(&mut self) {
        self.buffer.extend(self.current_line.drain(..));
        self.buffer.push('\n');
    }
}

impl Write for WriterWithIndent<'_> {
    fn write_str(&mut self, s: &str) -> std::fmt::Result {
        let mut split = s.split('\n');
        self.current_line.push_str(split.next().unwrap());

        for line in split {
            self.finish_current_line();
            self.current_line.push_str(&self.indent_str);
            self.current_line.push_str(line);
        }

        Ok(())
    }
}
