//! Minimalizer for AST.
//!
//! This code lives at `napi` crate because it depends on `rayon` and it's not
//! used by wasm.

use crate::util::MapErr;
use anyhow::{anyhow, Context, Error};
use napi::{CallContext, JsObject, JsString, Task};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use swc::try_with_handler;
use swc_common::{FilePathMapping, Globals, SourceMap, GLOBALS};
use swc_ecmascript::{
    ast::*,
    parser::{lexer::Lexer, EsConfig, Parser, StringInput, Syntax, TsConfig},
};

#[js_function(1)]
pub(crate) fn process_webpack_ast(cx: CallContext) -> napi::Result<JsObject> {
    let path = cx
        .get::<JsString>(0)?
        .into_utf8()?
        .as_str()
        .map(PathBuf::from)?;

    let task = WebpackAstTask { path };
    cx.env.spawn(task).map(|t| t.promise_object())
}

pub(crate) struct WebpackAstTask {
    pub path: PathBuf,
}

impl Task for WebpackAstTask {
    /// JSON string.
    type Output = String;

    type JsValue = JsString;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        parse_file_as_webpack_ast(&self.path).convert_err()
    }

    fn resolve(self, env: napi::Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        env.create_string(&output)
    }
}

pub fn parse_file_as_webpack_ast(path: &Path) -> Result<String, Error> {
    let globals = Globals::new();
    let cm = Arc::new(SourceMap::new(FilePathMapping::empty()));

    try_with_handler(cm.clone(), true, |handler| {
        let fm = cm
            .load_file(&path)
            .with_context(|| format!("failed to load file at `{}`", path.display()))?;

        let syntax = match path.extension() {
            Some(ext) => {
                if ext == "tsx" {
                    Syntax::Typescript(TsConfig {
                        tsx: true,
                        no_early_errors: true,
                        ..Default::default()
                    })
                } else if ext == "ts" {
                    Syntax::Typescript(TsConfig {
                        no_early_errors: true,
                        ..Default::default()
                    })
                } else {
                    Syntax::Es(EsConfig {
                        jsx: true,
                        ..Default::default()
                    })
                }
            }
            None => Default::default(),
        };

        let module = {
            let lexer = Lexer::new(syntax, EsVersion::latest(), StringInput::from(&*fm), None);
            let mut parser = Parser::new_from(lexer);

            parser.parse_module().map_err(|err| {
                err.into_diagnostic(handler).emit();
                anyhow!("failed to parse module")
            })?
        };

        GLOBALS.set(&globals, || {
            swc_webpack_ast::webpack_ast(cm.clone(), fm, module)
        })
    })
}
