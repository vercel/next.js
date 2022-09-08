use std::{
    fmt::Display,
    io::Write,
    sync::{Arc, RwLock},
};

use anyhow::{anyhow, Result};
use swc_core::{
    common::{errors::Handler, sync::Lrc, FileName, SourceMap},
    css::{
        ast::Stylesheet,
        parser::{parse_file, parser::ParserConfig},
    },
};
use turbo_tasks::ValueToString;
use turbo_tasks_fs::FileContent;
use turbopack_core::asset::AssetVc;

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
pub async fn parse(source: AssetVc) -> Result<ParseResultVc> {
    let content = source.content();
    let fs_path = source.path().to_string().await?.clone_value();
    Ok(match &*content.await? {
        FileContent::NotFound => ParseResult::NotFound.into(),
        FileContent::Content(file) => match String::from_utf8(file.content().to_vec()) {
            Err(_err) => ParseResult::Unparseable.into(),
            Ok(string) => parse_content(string, fs_path)?,
        },
    })
}

fn parse_content(string: String, fs_path: String) -> Result<ParseResultVc> {
    let cm: Lrc<SourceMap> = Default::default();
    let buf = Buffer::new();
    let handler = Handler::with_emitter_writer(Box::new(buf.clone()), Some(cm.clone()));

    let fm = cm.new_source_file(FileName::Custom(fs_path), string);

    let config = ParserConfig::default();

    let mut errors = Vec::new();
    let parsed_stylesheet = match parse_file::<Stylesheet>(&fm, config, &mut errors) {
        Ok(stylesheet) => stylesheet,
        Err(e) => {
            // TODO report in in a stream
            e.to_diagnostics(&handler).emit();
            return Ok(ParseResult::Unparseable.into());
            // ParseResult::Unparseable.into()
        }
    };

    let mut has_errors = false;
    for e in errors {
        // TODO report them in a stream
        e.to_diagnostics(&handler).emit();
        has_errors = true
    }

    // TODO report them in a stream
    if has_errors {
        println!("{}", buf);
        return Ok(ParseResult::Unparseable.into());
    }

    if !buf.is_empty() {
        // TODO report in in a stream
        println!("{}", buf);
        return Err(anyhow!("{}", buf));
    }

    Ok(ParseResult::Ok {
        stylesheet: parsed_stylesheet,
        source_map: cm,
    }
    .into())
}

#[derive(Clone)]
pub struct Buffer {
    buf: Arc<RwLock<Vec<u8>>>,
}

impl Buffer {
    pub fn new() -> Self {
        Self {
            buf: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.buf.read().unwrap().is_empty()
    }
}

impl Display for Buffer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Ok(str) = std::str::from_utf8(&self.buf.read().unwrap()) {
            let mut lines = str
                .lines()
                .map(|line| {
                    if line.len() > 300 {
                        format!("{}...{}\n", &line[..150], &line[line.len() - 150..])
                    } else {
                        format!("{}\n", line)
                    }
                })
                .collect::<Vec<_>>();
            if lines.len() > 500 {
                let (first, rem) = lines.split_at(250);
                let (_, last) = rem.split_at(rem.len() - 250);
                lines = first
                    .iter()
                    .chain(&["...".to_string()])
                    .chain(last.iter())
                    .cloned()
                    .collect();
            }
            let str = lines.concat();
            write!(f, "{}", str)
        } else {
            Err(std::fmt::Error)
        }
    }
}

impl Write for Buffer {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.buf.write().unwrap().extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
