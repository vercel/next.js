use crate::util::{CtxtExt, MapErr};
use anyhow::{anyhow, Error};
use napi::{CallContext, JsBoolean, JsObject, JsString, Task};
use swc_common::input::SourceFileInput;
use swc_common::{FileName, FilePathMapping, SourceMap};
use swc_ecmascript::ast::EsVersion;
use swc_ecmascript::parser::Parser;
use swc_ecmascript::parser::{lexer::Lexer, Syntax};

struct IsModuleTask {
    src: String,
    syntax: Syntax,
}

impl Task for IsModuleTask {
    type Output = bool;

    type JsValue = JsBoolean;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let v = is_module_exec(self.src.to_string(), self.syntax.clone()).convert_err()?;

        Ok(v)
    }

    fn resolve(self, env: napi::Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        env.get_boolean(output)
    }
}

#[js_function(2)]
pub fn is_module(cx: CallContext) -> napi::Result<JsObject> {
    let src = cx.get::<JsString>(0)?.into_utf8()?.as_str()?.to_owned();
    let syntax: Syntax = cx.get_deserialized(1)?;

    let task = IsModuleTask { src, syntax };

    cx.env.spawn(task).map(|t| t.promise_object())
}

#[js_function(2)]
pub fn is_module_sync(cx: CallContext) -> napi::Result<JsBoolean> {
    let src = cx.get::<JsString>(0)?.into_utf8()?.as_str()?.to_owned();
    let syntax: Syntax = cx.get_deserialized(1)?;

    let v = is_module_exec(src, syntax).convert_err()?;

    cx.env.get_boolean(v)
}

fn is_module_exec(src: String, syntax: Syntax) -> Result<bool, Error> {
    let cm = SourceMap::new(FilePathMapping::empty());
    let fm = cm.new_source_file(FileName::Anon, src);

    let lexer = Lexer::new(
        syntax,
        EsVersion::latest(),
        SourceFileInput::from(&*fm),
        None,
    );
    let mut parser = Parser::new_from(lexer);
    let module = parser
        .parse_program()
        .map_err(|err| anyhow!("failed to parse: {:?}", err))?;

    Ok(module.is_module())
}
