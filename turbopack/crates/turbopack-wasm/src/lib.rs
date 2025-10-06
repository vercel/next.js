//! WebAssembly support for turbopack.
//!
//! WASM assets are copied directly to the output folder.
//!
//! When imported from ES modules, they produce a thin module that loads and
//! instantiates the WebAssembly module.

#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::asset::Asset;

pub(crate) mod analysis;
pub(crate) mod loader;
pub mod module_asset;
pub(crate) mod output_asset;
pub mod raw;
pub mod source;

#[turbo_tasks::function]
pub async fn wasm_edge_var_name(asset: Vc<Box<dyn Asset>>) -> Result<Vc<RcStr>> {
    let content = asset.content().file_content().await?;
    Ok(Vc::cell(
        format!("wasm_{:08x}", hash_xxh3_hash64(content)).into(),
    ))
}
