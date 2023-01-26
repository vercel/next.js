use crate::util::MapErr;
use napi::bindgen_prelude::*;
use next_binding::turbo::next_dev::{devserver_options::DevServerOptions, start_server};

#[napi]
pub async fn start_turbo_dev(options: Buffer) -> napi::Result<()> {
    let options: DevServerOptions = serde_json::from_slice(&options)?;
    start_server(&options).await.convert_err()
}
