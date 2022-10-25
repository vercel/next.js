use std::sync::Arc;

use napi::bindgen_prelude::*;
use node_file_trace::{start, Args};

#[napi]
pub async fn run_turbo_tracing(options: Buffer) -> napi::Result<Vec<String>> {
    let args: Args = serde_json::from_slice(options.as_ref())?;
    let files = start(Arc::new(args)).await?;
    Ok(files)
}
