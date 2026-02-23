//! WebAssembly support for turbopack.
//!
//! WASM assets are copied directly to the output folder.
//!
//! When imported from ES modules, they produce a thin module that loads and
//! instantiates the WebAssembly module.

#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use anyhow::{Context, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;
use turbo_tasks_hash::HashAlgorithm;
use turbopack_core::asset::Asset;

pub(crate) mod analysis;
pub(crate) mod loader;
pub mod module_asset;
pub(crate) mod output_asset;
pub mod raw;
pub mod source;

#[turbo_tasks::function]
pub async fn wasm_edge_var_name(asset: Vc<Box<dyn Asset>>) -> Result<Vc<RcStr>> {
    let hash = asset
        .content()
        .content_hash(HashAlgorithm::default())
        .await?;
    let hash = hash
        .as_ref()
        .context("Missing content when trying to generate the content hash for a WASM asset")?;
    Ok(Vc::cell(format!("wasm_{}", hash).into()))
}
