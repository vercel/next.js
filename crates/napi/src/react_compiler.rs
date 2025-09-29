use std::{path::PathBuf, sync::Arc};

use napi::bindgen_prelude::*;
use next_custom_transforms::react_compiler;
use swc_core::{
    common::{GLOBALS, SourceMap},
    ecma::{
        ast::EsVersion,
        parser::{Syntax, TsSyntax, parse_file_as_program},
    },
};

pub struct CheckTask {
    pub filename: PathBuf,
}

#[napi]
impl Task for CheckTask {
    type Output = bool;
    type JsValue = bool;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        GLOBALS.set(&Default::default(), || {
            //
            let cm = Arc::new(SourceMap::default());
            let Ok(fm) = cm.load_file(&self.filename) else {
                return Ok(false);
            };
            let mut errors = vec![];
            let Ok(program) = parse_file_as_program(
                &fm,
                Syntax::Typescript(TsSyntax {
                    tsx: true,
                    ..Default::default()
                }),
                EsVersion::EsNext,
                None,
                &mut errors,
            ) else {
                return Ok(false);
            };
            if !errors.is_empty() {
                return Ok(false);
            }

            Ok(react_compiler::is_required(&program))
        })
    }

    fn resolve(&mut self, _env: Env, result: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(result)
    }
}

#[napi]
pub fn is_react_compiler_required(
    filename: String,
    signal: Option<AbortSignal>,
) -> AsyncTask<CheckTask> {
    let filename = PathBuf::from(filename);
    AsyncTask::with_optional_signal(CheckTask { filename }, signal)
}
