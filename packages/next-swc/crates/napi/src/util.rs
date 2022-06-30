/*
Copyright (c) 2017 The swc Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
*/

use anyhow::{anyhow, Context, Error};
use napi::{CallContext, Env, JsBuffer, JsExternal, JsString, JsUndefined, JsUnknown, Status};
use serde::de::DeserializeOwned;
use std::{any::type_name, cell::RefCell, convert::TryFrom, path::PathBuf};
use tracing_chrome::{ChromeLayerBuilder, FlushGuard};
use tracing_subscriber::{filter, prelude::*, util::SubscriberInitExt, Layer};

static TARGET_TRIPLE: &str = include_str!(concat!(env!("OUT_DIR"), "/triple.txt"));
#[contextless_function]
pub fn get_target_triple(env: Env) -> napi::ContextlessResult<JsString> {
    env.create_string(TARGET_TRIPLE).map(Some)
}

pub trait MapErr<T>: Into<Result<T, anyhow::Error>> {
    fn convert_err(self) -> napi::Result<T> {
        self.into()
            .map_err(|err| napi::Error::new(Status::GenericFailure, format!("{:?}", err)))
    }
}

impl<T> MapErr<T> for Result<T, anyhow::Error> {}

pub trait CtxtExt {
    fn get_buffer_as_string(&self, index: usize) -> napi::Result<String>;
    /// Currently this uses JsBuffer
    fn get_deserialized<T>(&self, index: usize) -> napi::Result<T>
    where
        T: DeserializeOwned;
}

impl CtxtExt for CallContext<'_> {
    fn get_buffer_as_string(&self, index: usize) -> napi::Result<String> {
        let buffer = self.get::<JsBuffer>(index)?.into_value()?;

        Ok(String::from_utf8_lossy(buffer.as_ref()).to_string())
    }

    fn get_deserialized<T>(&self, index: usize) -> napi::Result<T>
    where
        T: DeserializeOwned,
    {
        let buffer = self.get::<JsBuffer>(index)?.into_value()?;
        let v = serde_json::from_slice(&buffer)
            .with_context(|| {
                format!(
                    "Failed to deserialize argument at `{}` as {}\nJSON: {}",
                    index,
                    type_name::<T>(),
                    String::from_utf8_lossy(&buffer)
                )
            })
            .convert_err()?;

        Ok(v)
    }
}

pub(crate) fn deserialize_json<T>(s: &str) -> Result<T, Error>
where
    T: DeserializeOwned,
{
    serde_json::from_str(s)
        .with_context(|| format!("failed to deserialize as {}\nJSON: {}", type_name::<T>(), s))
}

/// Initialize tracing subscriber to emit traces. This configures subscribers
/// for Trace Event Format (https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview).
#[js_function(1)]
pub fn init_custom_trace_subscriber(cx: CallContext) -> napi::Result<JsExternal> {
    let optional_trace_out_file_path = cx.get::<JsUnknown>(0)?;
    let trace_out_file_path = match optional_trace_out_file_path.get_type()? {
        napi::ValueType::String => Some(PathBuf::from(
            JsString::try_from(optional_trace_out_file_path)?
                .into_utf8()?
                .as_str()?
                .to_owned(),
        )),
        _ => None,
    };

    let mut layer = ChromeLayerBuilder::new().include_args(true);
    if let Some(trace_out_file) = trace_out_file_path {
        let dir = trace_out_file
            .parent()
            .ok_or_else(|| anyhow!("Not able to find path to the trace output"))
            .convert_err()?;
        std::fs::create_dir_all(dir)?;

        layer = layer.file(trace_out_file);
    }

    let (chrome_layer, guard) = layer.build();
    tracing_subscriber::registry()
        .with(chrome_layer.with_filter(filter::filter_fn(|metadata| {
            !metadata.target().contains("cranelift") && !metadata.name().contains("log ")
        })))
        .try_init()
        .expect("Failed to register tracing subscriber");

    let guard_cell = RefCell::new(Some(guard));
    cx.env.create_external(guard_cell, None)
}

/// Teardown currently running tracing subscriber to flush out remaining traces.
/// This should be called when parent node.js process exits, otherwise generated
/// trace may drop traces in the buffer.
#[js_function(1)]
pub fn teardown_trace_subscriber(cx: CallContext) -> napi::Result<JsUndefined> {
    let guard_external = cx.get::<JsExternal>(0)?;
    let guard_cell = &*cx
        .env
        .get_value_external::<RefCell<Option<FlushGuard>>>(&guard_external)?;

    if let Some(guard) = guard_cell.take() {
        drop(guard);
    }
    cx.env.get_undefined()
}
