use swc_common::errors::{ColorConfig, Handler};
use swc_common::input::StringInput;
use swc_common::sync::Lrc;
use swc_common::{FileName, SourceMap};
use swc_ecmascript::ast::Module;
use swc_ecmascript::parser::lexer::Lexer;
use swc_ecmascript::parser::{EsConfig, Parser, Syntax};
use turbo_tasks_fs::FileContent;

use crate::module::ModuleRef;

#[turbo_tasks::value]
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

#[turbo_tasks::function]
pub async fn parse(module: ModuleRef) -> ParseResultRef {
    let module = module.await;
    let path = module.path.get().await;
    let content = module.path.clone().read();

    match &*content.await {
        FileContent::NotFound => ParseResult::NotFound.into(),
        FileContent::Content(buffer) => {
            match String::from_utf8(buffer.clone()) {
                Err(_err) => ParseResult::Unparseable.into(),
                Ok(string) => {
                    let cm: Lrc<SourceMap> = Default::default();
                    // let handler =
                    //     Handler::with_tty_emitter(ColorConfig::Auto, true, false, Some(cm.clone()));

                    let fm = cm.new_source_file(FileName::Custom(path.path.to_string()), string);

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

                    for _e in parser.take_errors() {
                        // TODO report them in a stream
                        // e.into_diagnostic(&handler).emit();
                    }

                    match parser.parse_module() {
                        Err(_err) => {
                            // TODO report in in a stream
                            ParseResult::Unparseable.into()
                        }
                        Ok(parsed_module) => ParseResult::Ok(parsed_module).into(),
                    }
                }
            }
        }
    }
}
