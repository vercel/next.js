//! Minimalizer for AST.
//!
//! This code lives at `napi` crate because it depends on `rayon` and it's not
//! used by wasm.

use crate::util::MapErr;
use anyhow::Error;
use napi::{CallContext, JsBoolean, JsObject, JsString, Task};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use swc::try_with_handler;
use swc_common::{FilePathMapping, SourceMap};
use swc_webpack_ast::{process_file, AstOutput};

#[js_function(2)]
pub(crate) fn process_webpack_ast(cx: CallContext) -> napi::Result<JsObject> {
    let path = cx
        .get::<JsString>(0)?
        .into_utf8()?
        .as_str()
        .map(PathBuf::from)?;
    let include_src = cx.get::<JsBoolean>(1)?.get_value()?;

    let task = WebpackAstTask { path, include_src };
    cx.env.spawn(task).map(|t| t.promise_object())
}

pub(crate) struct WebpackAstTask {
    pub path: PathBuf,
    pub include_src: bool,
}

impl Task for WebpackAstTask {
    /// JSON string.
    type Output = AstOutput;

    type JsValue = JsObject;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        parse_file_as_webpack_ast(&self.path, self.include_src).convert_err()
    }

    fn resolve(self, env: napi::Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        env.to_js_value(&output)?.coerce_to_object()
    }
}

pub fn parse_file_as_webpack_ast(path: &Path, include_src: bool) -> Result<AstOutput, Error> {
    let cm = Arc::new(SourceMap::new(FilePathMapping::empty()));

    try_with_handler(cm.clone(), true, |_handler| {
        process_file(|cm| Ok(cm.load_file(&path)?), include_src)
    })
}
