use anyhow::Context;
use napi::{CallContext, JsBuffer, Status};
use serde::de::DeserializeOwned;

pub trait MapErr<T>: Into<Result<T, anyhow::Error>> {
    fn convert_err(self) -> napi::Result<T> {
        self.into()
            .map_err(|err| napi::Error::new(Status::GenericFailure, format!("{:?}", err)))
    }
}

impl<T> MapErr<T> for Result<T, anyhow::Error> {}

pub trait CtxtExt {
    /// Currently this uses JsBuffer
    fn get_deserialized<T>(&self, index: usize) -> napi::Result<T>
    where
        T: DeserializeOwned;
}

impl CtxtExt for CallContext<'_> {
    fn get_deserialized<T>(&self, index: usize) -> napi::Result<T>
    where
        T: DeserializeOwned,
    {
        let buffer = self.get::<JsBuffer>(index)?.into_value()?;
        let v = serde_json::from_slice(&buffer)
            .with_context(|| format!("Argument at `{}` is not JsBuffer", index))
            .convert_err()?;

        Ok(v)
    }
}
