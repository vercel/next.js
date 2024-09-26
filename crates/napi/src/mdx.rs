use mdxjs::{compile, Options};
use napi::bindgen_prelude::*;

pub struct MdxCompileTask {
    pub input: String,
    pub option: Buffer,
}

impl Task for MdxCompileTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let options: Options = serde_json::from_slice(&self.option)?;

        compile(&self.input, &options)
            .map_err(|err| napi::Error::new(Status::GenericFailure, err.to_string()))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn mdx_compile(
    value: String,
    option: Buffer,
    signal: Option<AbortSignal>,
) -> napi::Result<AsyncTask<MdxCompileTask>> {
    let task = MdxCompileTask {
        input: value,
        option,
    };
    Ok(AsyncTask::with_optional_signal(task, signal))
}

#[napi]
pub fn mdx_compile_sync(value: String, option: Buffer) -> napi::Result<String> {
    let option: Options = serde_json::from_slice(&option)?;

    compile(value.as_str(), &option)
        .map_err(|err| napi::Error::new(Status::GenericFailure, format!("{:?}", err)))
}
