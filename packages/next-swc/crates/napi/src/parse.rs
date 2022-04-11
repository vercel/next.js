use crate::util::{deserialize_json, CtxtExt, MapErr};
use anyhow::Context as _;
use napi::{CallContext, Either, Env, JsObject, JsString, JsUndefined, Task};
use std::sync::Arc;
use swc::{config::ParseOptions, try_with_handler};
use swc_common::{comments::Comments, errors::ColorConfig, FileName, FilePathMapping, SourceMap};

pub struct ParseTask {
    pub filename: FileName,
    pub src: String,
    pub options: String,
}

pub fn complete_parse(env: &Env, ast_json: String) -> napi::Result<JsString> {
    env.create_string_from_std(ast_json)
}

impl Task for ParseTask {
    type Output = String;
    type JsValue = JsString;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let c = swc::Compiler::new(Arc::new(SourceMap::new(FilePathMapping::empty())));

        let options: ParseOptions = deserialize_json(&self.options).convert_err()?;
        let comments = c.comments().clone();
        let comments: Option<&dyn Comments> = if options.comments {
            Some(&comments)
        } else {
            None
        };
        let fm =
            c.cm.new_source_file(self.filename.clone(), self.src.clone());
        let program = try_with_handler(
            c.cm.clone(),
            swc::HandlerOpts {
                color: ColorConfig::Never,
                skip_filename: false,
            },
            |handler| {
                c.parse_js(
                    fm,
                    handler,
                    options.target,
                    options.syntax,
                    options.is_module,
                    comments,
                )
            },
        )
        .convert_err()?;

        let ast_json = serde_json::to_string(&program)
            .context("failed to serialize Program")
            .convert_err()?;

        Ok(ast_json)
    }

    fn resolve(self, env: Env, result: Self::Output) -> napi::Result<Self::JsValue> {
        complete_parse(&env, result)
    }
}

#[js_function(3)]
pub fn parse(ctx: CallContext) -> napi::Result<JsObject> {
    let src = ctx.get::<JsString>(0)?.into_utf8()?.as_str()?.to_string();
    let options = ctx.get_buffer_as_string(1)?;
    let filename = ctx.get::<Either<JsString, JsUndefined>>(2)?;
    let filename = if let Either::A(value) = filename {
        FileName::Real(value.into_utf8()?.as_str()?.to_owned().into())
    } else {
        FileName::Anon
    };

    ctx.env
        .spawn(ParseTask {
            filename,
            src,
            options,
        })
        .map(|t| t.promise_object())
}
