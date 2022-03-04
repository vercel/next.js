use std::fmt::Display;
use std::io::Write;
use std::sync::{Arc, RwLock};

use swc_common::errors::Handler;
use swc_common::input::StringInput;
use swc_common::sync::Lrc;
use swc_common::{FileName, SourceMap};
use swc_ecmascript::ast::Module;
use swc_ecmascript::parser::lexer::Lexer;
use swc_ecmascript::parser::{EsConfig, Parser, Syntax};
use turbo_tasks_fs::FileContent;

use crate::asset::AssetRef;

#[turbo_tasks::value(shared)]
pub enum ParseResult {
    Ok(#[trace_ignore] Module),
    Unparseable,
    NotFound,
}

impl PartialEq for ParseResult {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Ok(_), Self::Ok(_)) => false,
            _ => core::mem::discriminant(self) == core::mem::discriminant(other),
        }
    }
}

#[derive(Clone)]
struct Buffer {
    buf: Arc<RwLock<Vec<u8>>>,
}

impl Buffer {
    fn new() -> Self {
        Self {
            buf: Arc::new(RwLock::new(Vec::new())),
        }
    }

    fn clear(&self) {
        self.buf.write().unwrap().clear();
    }
}

impl Display for Buffer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Ok(str) = std::str::from_utf8(&self.buf.read().unwrap()) {
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

#[turbo_tasks::function]
pub async fn parse(source: AssetRef) -> ParseResultRef {
    let content = source.content();
    let fs_path = source.path().await;
    match &*content.await {
        FileContent::NotFound => ParseResult::NotFound.into(),
        FileContent::Content(buffer) => {
            match String::from_utf8(buffer.clone()) {
                Err(_err) => ParseResult::Unparseable.into(),
                Ok(string) => {
                    let cm: Lrc<SourceMap> = Default::default();
                    let buf = Buffer::new();
                    let handler =
                        Handler::with_emitter_writer(Box::new(buf.clone()), Some(cm.clone()));

                    let fm = cm.new_source_file(FileName::Custom(fs_path.path.clone()), string);

                    let lexer = Lexer::new(
                        Syntax::Es(EsConfig {
                            jsx: true,
                            fn_bind: true,
                            decorators: true,
                            decorators_before_export: true,
                            export_default_from: true,
                            import_assertions: true,
                            static_blocks: true,
                            private_in_object: true,
                            allow_super_outside_method: true,
                        }),
                        Default::default(),
                        StringInput::from(&*fm),
                        None,
                    );

                    let mut parser = Parser::new_from(lexer);

                    let mut has_errors = false;
                    for e in parser.take_errors() {
                        // TODO report them in a stream
                        e.into_diagnostic(&handler).emit();
                        has_errors = true
                    }

                    if has_errors {
                        println!("{}", buf);
                        buf.clear();
                    }

                    match parser.parse_module() {
                        Err(e) => {
                            // TODO report in in a stream
                            e.into_diagnostic(&handler).emit();
                            println!("{}", buf);
                            ParseResult::Unparseable.into()
                        }
                        Ok(parsed_module) => ParseResult::Ok(parsed_module).into(),
                    }
                }
            }
        }
    }
}
